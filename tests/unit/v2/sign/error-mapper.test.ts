/**
 * error.ts (providerErrorToV1) 단위 테스트 (m08-01-02)
 *
 * T-U-ERR-01: ProviderError(4001 USER_REJECTED) → user_cancel
 * T-U-ERR-02: ProviderError(5006 TIMEOUT) → time_out
 * T-U-ERR-03: ProviderError(5007 PROTOCOL_VERSION_MISMATCH) → protocol_version_mismatch
 * T-U-ERR-04: 일반 Error → internal_error
 * T-U-ERR-05: ProviderError(5004 DEVICE_USER_CANCELLED) → user_cancel (v1 호환)
 * T-U-ERR-06: ProviderError(5001 DEVICE_NOT_CONNECTED) → device_not_connected
 *
 * 추가:
 * - DISCONNECTED(4900) → pop-up_closed (D-07 단일 매핑)
 * - 알 수 없는 코드 → internal_error fallback
 */

import { providerErrorToV1 } from '../../../../src/sign/error'
import { ProviderError } from '../../../../src/error/ProviderError'
import { ErrorCode } from '../../../../src/error/ErrorCode'

describe('providerErrorToV1 — ProviderError 매핑', () => {
  test('T-U-ERR-01: USER_REJECTED(4001) → user_cancel', () => {
    const err = new ProviderError(ErrorCode.USER_REJECTED, 'user denied request')
    const resp = providerErrorToV1(err)
    expect(resp.header.status).toBe('failure')
    expect(resp.header.version).toBe('1.0')
    expect(resp.body.error?.code).toBe('user_cancel')
    expect(resp.body.error?.message).toBe('user denied request')
  })

  test('T-U-ERR-02: TIMEOUT(5006) → time_out', () => {
    const err = new ProviderError(ErrorCode.TIMEOUT, 'Request timed out')
    const resp = providerErrorToV1(err)
    expect(resp.body.error?.code).toBe('time_out')
    expect(resp.body.error?.message).toBe('Request timed out')
  })

  test('T-U-ERR-03: PROTOCOL_VERSION_MISMATCH(5007) → protocol_version_mismatch', () => {
    const err = new ProviderError(ErrorCode.PROTOCOL_VERSION_MISMATCH, 'major mismatch')
    const resp = providerErrorToV1(err)
    expect(resp.body.error?.code).toBe('protocol_version_mismatch')
  })

  test('T-U-ERR-04: 일반 Error → internal_error', () => {
    const err = new Error('something bad')
    const resp = providerErrorToV1(err)
    expect(resp.header.status).toBe('failure')
    expect(resp.body.error?.code).toBe('internal_error')
    expect(resp.body.error?.message).toBe('something bad')
  })

  test('T-U-ERR-05: DEVICE_USER_CANCELLED(5004) → user_cancel (v1 호환)', () => {
    const err = new ProviderError(ErrorCode.DEVICE_USER_CANCELLED, 'cancelled on device')
    const resp = providerErrorToV1(err)
    expect(resp.body.error?.code).toBe('user_cancel')
  })

  test('T-U-ERR-06: DEVICE_NOT_CONNECTED(5001) → device_not_connected', () => {
    const err = new ProviderError(ErrorCode.DEVICE_NOT_CONNECTED, 'device offline')
    const resp = providerErrorToV1(err)
    expect(resp.body.error?.code).toBe('device_not_connected')
  })
})

describe('providerErrorToV1 — popup-close 매핑 (D-07)', () => {
  test('DISCONNECTED(4900) → pop-up_closed (pre-handshake + mid-send 단일 매핑)', () => {
    const err = new ProviderError(ErrorCode.DISCONNECTED, 'Transport closed before response (id=abc)')
    const resp = providerErrorToV1(err)
    expect(resp.body.error?.code).toBe('pop-up_closed')
  })
})

describe('providerErrorToV1 — fallback', () => {
  test('알 수 없는 ProviderError 코드 → internal_error', () => {
    const err = new ProviderError(99999 as ErrorCode, 'unknown')
    const resp = providerErrorToV1(err)
    expect(resp.body.error?.code).toBe('internal_error')
  })

  test('Error 인스턴스인데 message 없음 → 빈 문자열', () => {
    const err = new Error()
    const resp = providerErrorToV1(err)
    expect(resp.body.error?.message).toBe('')
  })
})

describe('providerErrorToV1 — mutation 격리', () => {
  test('매 호출마다 새 객체 반환', () => {
    const err = new ProviderError(ErrorCode.TIMEOUT, 'x')
    const a = providerErrorToV1(err)
    const b = providerErrorToV1(err)
    expect(a).not.toBe(b)
    expect(a.body).not.toBe(b.body)
    expect(a.body.error).not.toBe(b.body.error)
  })
})
