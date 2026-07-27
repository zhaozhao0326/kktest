import { beforeEach, describe, expect, it, vi } from 'vitest'

const redisMocks = vi.hoisted(() => {
  const state = {
    Redis: vi.fn(),
    scan: vi.fn(),
    hgetall: vi.fn()
  }
  state.Redis.mockImplementation(function RedisClient() {
    return {
      scan: state.scan,
      hgetall: state.hgetall
    }
  })
  return state
})

vi.mock('@upstash/redis', () => ({
  Redis: redisMocks.Redis
}))

import { readAccessAnnouncement, readAccessDeviceStats } from './accessGuardStorage'

beforeEach(() => {
  redisMocks.Redis.mockClear()
  redisMocks.scan.mockReset()
  redisMocks.hgetall.mockReset()
})

describe('readAccessAnnouncement', () => {
  it('returns the configured announcement when ACCESS_GUARD_ANNOUNCEMENT_JSON is present', async () => {
    const announcement = await readAccessAnnouncement({
      requestedEnabled: true,
      ACCESS_GUARD_ANNOUNCEMENT_JSON: JSON.stringify({
        id: 'custom-announcement',
        title: '自定义公告',
        body: '这是线上公告',
        publishedAt: '2026-04-03'
      })
    })

    expect(announcement).toMatchObject({
      id: 'custom-announcement',
      title: '自定义公告',
      body: '这是线上公告',
      publishedAt: '2026-04-03'
    })
  })

  it('falls back to the built-in notice when access guard is enabled without a configured announcement', async () => {
    const announcement = await readAccessAnnouncement({
      requestedEnabled: true
    })

    expect(announcement).toMatchObject({
      id: '2026-04-02-kaka-chat-notice',
      title: '关于kaka chat的公告',
      publishedAt: '2026-04-02'
    })
    expect(announcement.body).toContain('Kaka小手机完全免费')
    expect(announcement.body).toContain('闲鱼、淘宝等平台的付费售卖均为盗版倒卖')
  })

  it('returns null when access guard is disabled and no announcement is configured', async () => {
    const announcement = await readAccessAnnouncement({})
    expect(announcement).toBeNull()
  })
})

describe('readAccessDeviceStats', () => {
  const env = {
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'token',
    deviceSlotLimit: 2
  }

  function buildDeviceHash(storageKey) {
    const userId = storageKey.split(':').pop()
    return {
      [`device-${userId}`]: JSON.stringify({
        deviceId: `device-${userId}`,
        provider: 'discord',
        userId,
        username: userId,
        claimedAt: 1000,
        lastSeenAt: 1000
      })
    }
  }

  it('scans all registered users by default', async () => {
    const keys = Array.from(
      { length: 501 },
      (_, index) => `aichat_access_guard:devices:discord:user-${String(index + 1).padStart(3, '0')}`
    )
    redisMocks.scan
      .mockResolvedValueOnce(['1', keys.slice(0, 250)])
      .mockResolvedValueOnce(['2', keys.slice(250, 500)])
      .mockResolvedValueOnce(['0', keys.slice(500)])
    redisMocks.hgetall.mockImplementation((storageKey) => Promise.resolve(buildDeviceHash(storageKey)))

    const stats = await readAccessDeviceStats(env)

    expect(redisMocks.scan).toHaveBeenCalledTimes(3)
    expect(redisMocks.hgetall).toHaveBeenCalledTimes(501)
    expect(stats.summary.totalUsers).toBe(501)
    expect(stats.summary.totalDevices).toBe(501)
    expect(stats.users).toHaveLength(501)
  })

  it('respects an explicit maxUsers option', async () => {
    const keys = Array.from(
      { length: 5 },
      (_, index) => `aichat_access_guard:devices:discord:limited-${index + 1}`
    )
    redisMocks.scan.mockResolvedValueOnce(['1', keys])
    redisMocks.hgetall.mockImplementation((storageKey) => Promise.resolve(buildDeviceHash(storageKey)))

    const stats = await readAccessDeviceStats(env, { maxUsers: 2 })

    expect(redisMocks.scan).toHaveBeenCalledTimes(1)
    expect(redisMocks.hgetall).toHaveBeenCalledTimes(2)
    expect(stats.summary.totalUsers).toBe(2)
    expect(stats.users).toHaveLength(2)
  })
})
