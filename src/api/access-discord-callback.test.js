import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accessHandler: vi.fn()
}))

vi.mock('../../api/access.js', () => ({
  default: mocks.accessHandler
}))

import handler from '../../api/access-discord-callback.js'

describe('api/access-discord-callback', () => {
  beforeEach(() => {
    mocks.accessHandler.mockReset()
  })

  it('injects action=discord-callback while keeping the original request object', async () => {
    const req = {
      method: 'GET',
      headers: {
        cookie: 'k=v'
      }
    }
    const res = {
      status: vi.fn(() => res),
      end: vi.fn()
    }

    await handler(req, res)

    expect(mocks.accessHandler).toHaveBeenCalledTimes(1)
    expect(mocks.accessHandler).toHaveBeenCalledWith(req, res)
    expect(req.query).toEqual({
      action: 'discord-callback'
    })
  })

  it('preserves existing query parameters when injecting action', async () => {
    const req = {
      method: 'GET',
      query: {
        state: 'abc',
        code: '123'
      },
      headers: {}
    }
    const res = {
      status: vi.fn(() => res),
      end: vi.fn()
    }

    await handler(req, res)

    expect(req.query).toEqual({
      state: 'abc',
      code: '123',
      action: 'discord-callback'
    })
  })
})
