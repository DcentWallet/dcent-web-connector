/**
 * assert.ts (_assertV1Success) 단위 테스트 (m08-01-02, D-08)
 *
 * T-U-ASSERT-01: success 응답 — 그대로 반환
 * T-U-ASSERT-02: failure 응답 — throw
 * T-U-ASSERT-03: transaction.user_cancel 특례 — 그대로 반환 (v1 호환)
 */

import { _assertV1Success } from '../../../../src/sign/assert'
import { ProviderError } from '../../../../src/error/ProviderError'
import { ErrorCode } from '../../../../src/error/ErrorCode'
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

  test('T-U-ASSERT-02: failure — throw ProviderError + v1Code → ErrorCode 역매핑', () => {
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
      // v1Code 'time_out' → ErrorCode.TIMEOUT(5006). 원본 v1 string은 data.v1Code에 보관.
      expect((e as ProviderError).code).toBe(ErrorCode.TIMEOUT)
      expect((e as ProviderError).data).toEqual({ v1Code: 'time_out' })
    }
  })

  test('T-U-ASSERT-02b: failure with method_not_found → ProviderError.code === METHOD_NOT_FOUND', () => {
    const resp: V1Response = {
      header: { version: '1.0', status: 'failure' },
      body: {
        command: 'getAddress',
        error: { code: 'method_not_found', message: 'unknown method' },
      },
    }
    try {
      _assertV1Success(resp)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as ProviderError).code).toBe(ErrorCode.METHOD_NOT_FOUND)
      expect((e as ProviderError).data).toEqual({ v1Code: 'method_not_found' })
    }
  })

  test('T-U-ASSERT-02c: failure with 매핑 안 되는 code → INTERNAL_ERROR fallback', () => {
    const resp: V1Response = {
      header: { version: '1.0', status: 'failure' },
      body: {
        command: 'getAddress',
        error: { code: 'totally_unknown_code', message: 'mystery' },
      },
    }
    try {
      _assertV1Success(resp)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as ProviderError).code).toBe(ErrorCode.INTERNAL_ERROR)
      expect((e as ProviderError).data).toEqual({ v1Code: 'totally_unknown_code' })
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
