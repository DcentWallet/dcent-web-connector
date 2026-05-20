/**
 * v2 sign — `method` + `chainId` 인자 sanitize (m09-04-01 NEW schema)
 *
 * dApp이 sign({method, chainId, payload})에서 전달하는 `method` / `chainId` 값을 사용 전에 검증한다.
 *
 * 적용 룰:
 *   - dapp-input-sanitization: dApp 입력 객체 직접 pass-through 금지. type / 길이 / whitelist 검증
 *   - provider-security-checklist C3: method / chainId는 origin-fixed가 아니라 dApp-controllable.
 *     EIP-1193 / SIWS 처럼 spec이 강제하는 형식이 아니므로 connector facade에서 자체 검증.
 *
 * 검증 단계 (method, chainId 공통):
 *   1. type === 'string' 확인
 *   2. length 범위 (1..256) — DoS 방어
 *   3. whitelist 정규식 — CAIP-19 namespace + reference + asset 문자만 허용
 *   4. 프로토타입 키 (`__proto__` / `constructor` / `prototype`) 명시 차단 (대소문자 무시)
 *
 * 검증 실패 시 throw — error-handling-consistency 룰에 따라 silent return 금지.
 *
 * 룰 준수:
 *   - connector-chain-addition-isolation: method whitelist는 intent literal 2개(signMessage /
 *     signTransaction)와 fallback passthrough만. chain 식별자 단위의 enum/매핑 없음.
 */

import { ProviderError } from '../error/ProviderError'
import { ErrorCode } from '../error/ErrorCode'

/**
 * method / chainId 공통 whitelist — CAIP-19 namespace + reference + asset_namespace + asset_reference 문자만 허용.
 *
 * 허용:
 *   - 영숫자 (A-Z a-z 0-9)
 *   - `_` (snake_case method fallback 용)
 *   - `:` (CAIP-2 namespace 구분자, asset_namespace 구분자)
 *   - `/` (CAIP-19 chainId/asset 구분자)
 *   - `.` (asset_reference에 사용될 수 있음)
 *   - `+` `-` (URI-safe 문자)
 */
const WHITELIST = /^[A-Za-z0-9_:/.+-]+$/

/** 프로토타입 오염 차단 — 대소문자 무시. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * 공통 string 검증 — type / empty / length / forbidden key / whitelist.
 *
 * @param value 검증 대상
 * @param fieldName 에러 메시지에 사용할 필드명
 * @throws ProviderError(INVALID_PARAMS)
 */
function _sanitizeString (value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `${fieldName} must be a string, got ${typeof value}`,
    )
  }

  if (value.length === 0) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `${fieldName} must not be empty`,
    )
  }

  if (value.length > 256) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `${fieldName} length exceeds 256 chars (got ${value.length})`,
    )
  }

  // 프로토타입 키 차단 — 대소문자 무시
  if (FORBIDDEN_KEYS.has(value.toLowerCase())) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `${fieldName} rejected: prototype-pollution key '${value}'`,
    )
  }

  if (!WHITELIST.test(value)) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `${fieldName} contains disallowed characters: '${value}'`,
    )
  }

  return value
}

/**
 * method 인자를 검증하고 valid string을 반환한다.
 *
 * connector-chain-addition-isolation 룰에 따라 method enum 매핑은 두지 않는다.
 * intent literal 2개(signMessage / signTransaction)는 dApp이 자유롭게 사용하지만,
 * connector는 whitelist 통과한 임의 method 문자열을 sdk로 그대로 forward한다.
 *
 * @throws ProviderError(INVALID_PARAMS) — 검증 실패 시. v1 호환 throw 패턴.
 */
export function _sanitizeMethod (method: unknown): string {
  return _sanitizeString(method, 'method')
}

/**
 * chainId 인자를 검증하고 valid string을 반환한다.
 *
 * CAIP-19 형식 (`{namespace}:{reference}` 또는 `{namespace}:{reference}/{asset_namespace}:{asset_reference}`)을
 * primary 형식으로 받지만, 정확한 CAIP-19 구조 검사는 sdk 측이 담당 (connector는 transport).
 * connector facade에서는 character whitelist + DoS 방어만 수행.
 *
 * 빈 문자열(`''`)은 method가 chainId-independent (예: getDeviceInfo) — 단, public sign API의
 * input에서 chainId 필드는 항상 존재해야 하므로 빈 문자열도 거부. chainId 자체를 안 보내려면
 * sign API가 아닌 lifecycle API를 호출하면 됨.
 *
 * @throws ProviderError(INVALID_PARAMS) — 검증 실패 시.
 */
export function _sanitizeChainId (chainId: unknown): string {
  return _sanitizeString(chainId, 'chainId')
}
