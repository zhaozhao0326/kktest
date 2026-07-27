import { describe, expect, it } from 'vitest'

import { buildProxyForwardHeaders } from '../../api/proxy'

describe('api/proxy forwarding headers', () => {
  it('keeps API authentication but removes cookies and deployment metadata', () => {
    expect(buildProxyForwardHeaders({
      host: 'chat.example.com',
      cookie: 'access_session=secret',
      authorization: 'Bearer api-key',
      'content-type': 'application/json',
      'x-target-url': 'https://api.example.com/v1',
      'x-vercel-ip-city': '北京',
      'x-forwarded-host': 'chat.example.com',
      'sec-ch-ua': 'Browser',
      'x-api-feature': 'enabled'
    })).toEqual({
      authorization: 'Bearer api-key',
      'content-type': 'application/json',
      'x-api-feature': 'enabled'
    })
  })
})
