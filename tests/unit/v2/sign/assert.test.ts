/**
 * assert.ts (_assertV1Success) 단위 테스트 (m08-01-02, D-08)
 *
 * T-U-ASSERT-01: success 응답 — 그대로 반환
 * T-U-ASSERT-02: failure 응답 — throw
 * T-U-ASSERT-03: transaction.user_cancel 특례 — 그대로 반환 (v1 호환)
 */

import { _assertV1Success } from '../../../../src/sign/assert'
import { ProviderError } from '../../../../src/error/ProviderError'
import type { V1Response } from '../../../../src/sign/types'

describe('_assertV1Success', () => {
  test('T-U-ASSERT-01: success — 그대로 반환', () => {
    const resp: V1Response = {
      header: { version: '1.0', status: 'success' },
      body: { command: 'getAddress', parameter: { address: '0xabc' } },
    }
    const result = _assertV1Success(resp)
    expect(result).toBe(resp)
  })

  test('T-U-ASSERT-02: failure — throw ProviderError', () => {
    const resp: V1Response = {
      header: { version: '1.0', status: 'failure' },
      body: {
        command: 'getAddress',
        error: { code: 'time_out', message: 'request timed out' },
      },
    }
    expect(() => _assertV1Success(resp)).toThrow(ProviderError)
    try {
      _assertV1Success(resp)
    } catch (e) {
      expect((e as Error).message).toMatch(/timed out/)
    }
  })

  test('T-U-ASSERT-03: transaction + user_cancel — 그대로 반환 (v1 특례)', () => {
    const resp: V1Response = {
      header: { version: '1.0', status: 'failure' },
      body: {
        command: 'transaction',
        error: { code: 'user_cancel', message: 'user cancelled tx' },
      },
    }
    const result = _assertV1Success(resp)
    expect(result).toBe(resp)
  })

  test('T-U-ASSERT-03b: command이 transaction이 아닌데 error.code === user_cancel → throw', () => {
    const resp: V1Response = {
      header: { version: '1.0', status: 'failure' },
      body: {
        command: 'getAddress',
        error: { code: 'user_cancel', message: 'cancelled' },
      },
    }
    expect(() => _assertV1Success(resp)).toThrow(ProviderError)
  })

  test('T-U-ASSERT-03c: transaction이지만 error.code가 user_cancel이 아니면 → throw', () => {
    const resp: V1Response = {
      header: { version: '1.0', status: 'failure' },
      body: {
        command: 'transaction',
        error: { code: 'time_out', message: 'tx timed out' },
      },
    }
    expect(() => _assertV1Success(resp)).toThrow(ProviderError)
  })

  test('failure인데 error 필드 자체가 없는 경우 — 적절한 fallback 메시지로 throw', () => {
    const resp: V1Response = {
      header: { version: '1.0', status: 'failure' },
      body: { command: 'foo' },
    }
    expect(() => _assertV1Success(resp)).toThrow(ProviderError)
  })
})
