import { describe, expect, it } from 'vitest'

import {
  applyRequestCustomization,
  parseCustomJsonObject,
  parseCustomRequestBody,
  parseCustomRequestHeaders,
  parseRemovedRequestParameters,
  removeRequestBodyParameters
} from './requestCustomization'

describe('requestCustomization', () => {
  it('treats blank custom JSON as an empty object', () => {
    expect(parseCustomJsonObject('', 'headers')).toEqual({})
    expect(parseCustomJsonObject(null, 'body')).toEqual({})
  })

  it('parses JSON objects and rejects non-object values', () => {
    expect(parseCustomJsonObject('{"x-test":"yes"}', 'headers')).toEqual({ 'x-test': 'yes' })

    expect(() => parseCustomJsonObject('["x"]', 'headers')).toThrow('自定义 headers 必须是 JSON 对象')
    expect(() => parseCustomJsonObject('"x"', 'body')).toThrow('自定义 body 必须是 JSON 对象')
    expect(() => parseCustomJsonObject('{bad', 'body')).toThrow('自定义 body 不是有效 JSON')
  })

  it('normalizes custom headers to string values and drops blank header names', () => {
    expect(parseCustomRequestHeaders('{"x-num":123,"x-bool":true," ":"skip","x-null":null}')).toEqual({
      'x-num': '123',
      'x-bool': 'true'
    })
  })

  it('rejects custom header names and values that fetch cannot encode', () => {
    expect(() => parseCustomRequestHeaders('{"中文":"value"}')).toThrow('自定义请求头名称含有非法字符')
    expect(() => parseCustomRequestHeaders('{"x-note":"中文"}')).toThrow(
      '自定义请求头 x-note 的值含有中文、全角符号、换行或不可见字符'
    )
    expect(() => parseCustomRequestHeaders('{"x-note":"line\\nfeed"}')).toThrow(
      '自定义请求头 x-note 的值含有中文、全角符号、换行或不可见字符'
    )
  })

  it('keeps nested custom body values intact', () => {
    expect(parseCustomRequestBody('{"top_p":0.8,"metadata":{"source":"kaka"}}')).toEqual({
      top_p: 0.8,
      metadata: { source: 'kaka' }
    })
  })

  it('applies custom headers and deeply merges body parameters after adapter defaults', () => {
    const request = applyRequestCustomization({
      headers: {
        Authorization: 'Bearer built-in',
        'Content-Type': 'application/json'
      },
      body: {
        model: 'base-model',
        temperature: 0.7,
        metadata: { app: 'base' }
      }
    }, {
      customHeadersJson: '{"Authorization":"Bearer override","x-extra":"1"}',
      customBodyJson: '{"temperature":0.2,"metadata":{"source":"custom"}}'
    })

    expect(request.headers).toEqual({
      Authorization: 'Bearer override',
      'Content-Type': 'application/json',
      'x-extra': '1'
    })
    expect(request.body).toEqual({
      model: 'base-model',
      temperature: 0.2,
      metadata: { app: 'base', source: 'custom' }
    })
  })

  it('parses and removes top-level or nested request parameters', () => {
    expect(parseRemovedRequestParameters('temperature, generationConfig.topP，top_k\ntemperature')).toEqual([
      'temperature',
      'generationConfig.topP',
      'top_k'
    ])

    expect(removeRequestBodyParameters({
      temperature: 0.7,
      generationConfig: { temperature: 0.8, topP: 0.9 },
      model: 'test'
    }, ['temperature', 'generationConfig.temperature'])).toEqual({
      generationConfig: { topP: 0.9 },
      model: 'test'
    })
  })

  it('automatically drops unsupported sampling parameters for current Claude models', () => {
    const request = applyRequestCustomization({
      body: { model: 'claude-opus-4-7', temperature: 0.7, top_p: 0.9 }
    }, {
      model: 'claude-opus-4-7',
      customBodyJson: '{"top_k":40}'
    })

    expect(request.body).toEqual({ model: 'claude-opus-4-7' })

    const forcedRequest = applyRequestCustomization({
      body: { model: 'claude-opus-4-7', temperature: 0.7 }
    }, {
      model: 'claude-opus-4-7',
      autoAdaptParameters: false
    })
    expect(forcedRequest.body.temperature).toBe(0.7)
  })

  it('applies explicit removals even to newly added parameters', () => {
    const request = applyRequestCustomization({
      body: { model: 'custom-model', temperature: 0.7 }
    }, {
      customBodyJson: '{"metadata":{"source":"custom"},"top_p":0.9}',
      removeBodyParams: ['temperature', 'metadata.source']
    })

    expect(request.body).toEqual({
      model: 'custom-model',
      metadata: {},
      top_p: 0.9
    })
  })

  it('overrides built-in headers case-insensitively', () => {
    const request = applyRequestCustomization({
      headers: { Authorization: 'Bearer built-in' },
      body: {}
    }, {
      customHeadersJson: '{"authorization":"Bearer custom"}'
    })

    expect(request.headers).toEqual({ authorization: 'Bearer custom' })
  })
})
