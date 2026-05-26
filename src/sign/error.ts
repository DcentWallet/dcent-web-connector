/**
 * v2 sign — ProviderError → V1Response (failure 형태) mapper (m08-01-02)
 *
 * v2 transport 레이어가 던지는 ProviderError(EIP-1193 호환 `code`/`message`/`data`)를
 * v1 호환 `{header: {status: 'failure'}, body: {error: {code, message}}}` 형태로 매핑한다.
 *
 * 매핑 정책 (D-07 분석 결론):
 *   - 현재 v2 PopupTransport는 popup이 닫히는 모든 케이스(pre-handshake / mid-send pending)를
 *     DISCONNECTED(4900) 단일 코드로 reject한다 → 4900 → 'pop-up_closed' 단일 매핑.
 *   - 4001(USER_REJECTED) 매핑은 EIP-1193 표준 호환을 위해 'user_cancel'로 두지만, 실제
 *     v2 _call 경로에서는 popup이 응답으로 보낸 v1 형식 envelope (`body.error.code='user_cancel'`)을
 *     통해 들어오므로 ProviderError 4001로 발생할 일이 적다.
 *
 * 룰 준수:
 *   - error-handling-consistency: provider 경계의 모든 에러를 v1 호환 응답으로 일관되게 변환
 *   - mutation-isolation: 매 호출마다 새 V1Response 객체 반환 (shared reference 누설 방지)
 *   - provider-security-checklist C6: provider 경계에서 raw Error를 그대로 노출하지 않고 매핑
 */

import { ProviderError } from '../error/ProviderError'
import { ErrorCode } from '../error/ErrorCode'
import type { V1Response } from './types'

/**
 * v2 ErrorCode (number) → v1 string code 매핑.
 *
 * 누락된 코드는 'internal_error'로 fallback (T-U-ERR-04, ERR-06).
 */
const V2_TO_V1_CODE: Readonly<Record<number, string>> = Object.freeze({
  // EIP-1193
  [ErrorCode.USER_REJECTED]: 'user_cancel', // 4001
  [ErrorCode.UNAUTHORIZED]: 'unauthorized', // 4100
  [ErrorCode.UNSUPPORTED_METHOD]: 'unsupported_method', // 4200
  [ErrorCode.DISCONNECTED]: 'pop-up_closed', // 4900 (D-07: pre-handshake + mid-send 단일 매핑)
  [ErrorCode.CHAIN_DISCONNECTED]: 'chain_disconnected', // 4901
  // JSON-RPC 2.0
  [ErrorCode.PARSE_ERROR]: 'parse_error', // -32700
  [ErrorCode.INVALID_REQUEST]: 'invalid_request', // -32600
  [ErrorCode.METHOD_NOT_FOUND]: 'method_not_found', // -32601
  [ErrorCode.INVALID_PARAMS]: 'param_error', // -32602 (v1 'param_error' 호환)
  [ErrorCode.INTERNAL_ERROR]: 'internal_error', // -32603
  // D'CENT 5xxx
  [ErrorCode.DEVICE_NOT_CONNECTED]: 'device_not_connected', // 5001
  [ErrorCode.DEVICE_LOCKED]: 'device_locked', // 5002
  [ErrorCode.DEVICE_TIMEOUT]: 'device_timeout', // 5003
  [ErrorCode.DEVICE_USER_CANCELLED]: 'user_cancel', // 5004 → v1 호환 (T-U-ERR-05)
  [ErrorCode.DEVICE_FW_INCOMPATIBLE]: 'device_fw_incompatible', // 5005
  [ErrorCode.TIMEOUT]: 'time_out', // 5006 (v1 'time_out' 호환)
  [ErrorCode.PROTOCOL_VERSION_MISMATCH]: 'protocol_version_mismatch', // 5007 (v1 신규)
})

/**
 * v1 string code → v2 ErrorCode 역매핑.
 *
 * V2_TO_V1_CODE의 역방향. `'user_cancel'`은 USER_REJECTED(4001)/DEVICE_USER_CANCELLED(5004)
 * 두 v2 코드에 매핑되지만, dApp이 보는 v2 의미로는 EIP-1193 표준인 USER_REJECTED(4001)가
 * canonical — 디바이스 측 cancel을 외부에서 별도 분기할 필요가 적기 때문.
 *
 * 매핑 안 되는 v1 code는 INTERNAL_ERROR(-32603)로 fallback. data.v1Code로 원본 보존.
 */
const V1_TO_V2_CODE: Readonly<Record<string, ErrorCode>> = Object.freeze({
  // EIP-1193
  user_cancel: ErrorCode.USER_REJECTED, // 4001 — DEVICE_USER_CANCELLED(5004)도 'user_cancel'이지만 canonical은 4001
  unauthorized: ErrorCode.UNAUTHORIZED, // 4100
  unsupported_method: ErrorCode.UNSUPPORTED_METHOD, // 4200
  'pop-up_closed': ErrorCode.DISCONNECTED, // 4900
  chain_disconnected: ErrorCode.CHAIN_DISCONNECTED, // 4901
  // JSON-RPC 2.0
  parse_error: ErrorCode.PARSE_ERROR, // -32700
  invalid_request: ErrorCode.INVALID_REQUEST, // -32600
  method_not_found: ErrorCode.METHOD_NOT_FOUND, // -32601
  param_error: ErrorCode.INVALID_PARAMS, // -32602
  internal_error: ErrorCode.INTERNAL_ERROR, // -32603
  // D'CENT 5xxx
  device_not_connected: ErrorCode.DEVICE_NOT_CONNECTED, // 5001
  device_locked: ErrorCode.DEVICE_LOCKED, // 5002
  device_timeout: ErrorCode.DEVICE_TIMEOUT, // 5003
  device_fw_incompatible: ErrorCode.DEVICE_FW_INCOMPATIBLE, // 5005
  time_out: ErrorCode.TIMEOUT, // 5006
  protocol_version_mismatch: ErrorCode.PROTOCOL_VERSION_MISMATCH, // 5007
})

/**
 * v1 string code를 v2 ErrorCode (number)로 역매핑한다.
 *
 * 매핑 안 되는 code는 `ErrorCode.INTERNAL_ERROR`로 fallback. 호출자는 원본 v1 string을
 * `ProviderError.data.v1Code`에 보관해 호환 정보를 잃지 않도록 함.
 *
 * @param v1Code v1 string code (예: 'method_not_found', 'time_out', 'user_cancel')
 * @returns 대응되는 ErrorCode (number). 매핑 없으면 INTERNAL_ERROR(-32603).
 */
export function v1CodeToErrorCode (v1Code: string | undefined | null): ErrorCode {
  if (typeof v1Code !== 'string') return ErrorCode.INTERNAL_ERROR
  return V1_TO_V2_CODE[v1Code] ?? ErrorCode.INTERNAL_ERROR
}

/**
 * ProviderError 또는 일반 Error를 v1 호환 V1Response(failure 형태)로 변환한다.
 *
 * - ProviderError → 매핑 테이블 lookup → 해당 string code, fallback 'internal_error'
 * - 일반 Error → 'internal_error' + err.message
 *
 * @param err ProviderError 인스턴스 또는 일반 Error
 * @returns 매 호출마다 새 V1Response 객체 (mutation-isolation)
 */
export function providerErrorToV1 (err: ProviderError | Error): V1Response {
  let v1Code: string
  let message: string

  if (err instanceof ProviderError) {
    v1Code = V2_TO_V1_CODE[err.code as number] ?? 'internal_error'
    message = err.message ?? ''
  } else {
    v1Code = 'internal_error'
    message = (err && typeof err.message === 'string') ? err.message : ''
  }

  return {
    header: { version: '1.0', status: 'failure' },
    body: { error: { code: v1Code, message: message } },
  }
}
