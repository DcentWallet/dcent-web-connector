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
