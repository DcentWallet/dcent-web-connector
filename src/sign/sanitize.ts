/**
 * v2 sign — chain 인자 sanitize (m08-01-02, R1 auto-fix)
 *
 * dApp이 sign({chain, payload})에서 전달하는 `chain` 값을 사용 전에 검증한다.
 *
 * 적용 룰:
 *   - dapp-input-sanitization: dApp 입력 객체 직접 pass-through 금지. type / 길이 / whitelist 검증
 *   - provider-security-checklist C3: chain은 origin-fixed가 아니라 dApp-controllable 필드.
 *     EIP-1193 / SIWS 처럼 spec이 강제하는 형식이 아니므로 connector facade에서 자체 검증.
 *
 * 검증 단계:
 *   1. type === 'string' 확인
 *   2. length 범위 (1..256) — DoS 방어
 *   3. whitelist 정규식 — CAIP-19 namespace + reference + asset 문자만 허용
 *   4. 프로토타입 키 (`__proto__` / `constructor` / `prototype`) 명시 차단 (대소문자 무시)
 *
 * 검증 실패 시 throw — error-handling-consistency 룰에 따라 silent return 금지.
 */

import { ProviderError } from '../error/ProviderError'
import { ErrorCode } from '../error/ErrorCode'

/**
 * CAIP-19 namespace + reference + asset_namespace + asset_reference 문자만 허용.
 *
 * 허용:
 *   - 영숫자 (A-Z a-z 0-9)
 *   - `_` (snake_case method fallback 용)
 *   - `:` (CAIP-2 namespace 구분자, asset_namespace 구분자)
 *   - `/` (CAIP-19 chainId/asset 구분자)
 *   - `.` (asset_reference에 사용될 수 있음)
 *   - `+` `-` (URI-safe 문자)
 */
const CHAIN_WHITELIST = /^[A-Za-z0-9_:/.+-]+$/

/** 프로토타입 오염 차단 — 대소문자 무시. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * chain 인자를 검증하고 valid string을 반환한다.
 *
 * @throws ProviderError(INVALID_PARAMS) — 검증 실패 시. v1 호환 throw 패턴.
 */
export function _sanitizeChain (chain: unknown): string {
  if (typeof chain !== 'string') {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `chain must be a string, got ${typeof chain}`,
    )
  }

  if (chain.length === 0) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      'chain must not be empty',
    )
  }

  if (chain.length > 256) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `chain length exceeds 256 chars (got ${chain.length})`,
    )
  }

  // 프로토타입 키 차단 — 대소문자 무시
  if (FORBIDDEN_KEYS.has(chain.toLowerCase())) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `chain rejected: prototype-pollution key '${chain}'`,
    )
  }

  if (!CHAIN_WHITELIST.test(chain)) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `chain contains disallowed characters: '${chain}'`,
    )
  }

  return chain
}
