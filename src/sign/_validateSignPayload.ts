/**
 * v2 sign — `payload` 인자 family-agnostic light validation (m09-04-05)
 *
 * dApp이 `sign({method, chainId, payload})`로 전달하는 payload가 sdk handleRequest에 도달하기 전,
 * connector facade에서 **family-agnostic shape** 만 검증한다.
 *
 * 적용 룰:
 *   - dapp-input-sanitization: dApp 입력 객체 직접 pass-through 금지. 프로토타입 키 차단 + DoS 가드
 *   - provider-security-checklist C3: dApp-controllable payload를 known-fields whitelist로 추출하지는 않지만
 *     (family-specific 필드는 sdk가 처리), connector 경계의 universal shape contract를 강제한다
 *   - connector-chain-addition-isolation: payload 검증에 chain enum / family-specific 분기 절대 부재.
 *     chainId 문자열은 helpful error 메시지의 echo 용도로만 사용 (분기 로직 X)
 *   - error-handling-consistency: 검증 실패 시 항상 ProviderError(INVALID_PARAMS) throw — silent return 금지
 *
 * 검증 단계:
 *   1. payload가 plain object인지 (`typeof === 'object'`, `!Array.isArray`, `!== null`)
 *   2. payload.keyPath가 non-empty string인지 (sdk handleRequest `_extractKeyPath`의 contract)
 *   3. payload에 프로토타입 키 (`__proto__` / `constructor` / `prototype`) 부재
 *   4. payload 직렬화 크기 ≤ 64KB (DoS 방어)
 *
 * 통과 후: sdk handleRequest가 chainId 기반 family-specific 검증을 수행한다.
 */

import { ProviderError } from '../error/ProviderError'
import { ErrorCode } from '../error/ErrorCode'

/** payload 직렬화 최대 크기 — DoS 방어 (64KB). */
const MAX_PAYLOAD_BYTES = 64 * 1024

/** 프로토타입 오염 차단 키 (own-property로 존재하면 거부). */
const FORBIDDEN_PROTO_KEYS = ['__proto__', 'constructor', 'prototype'] as const

/**
 * v2 sign API payload shape validation (family-agnostic).
 *
 * @param chainId CAIP-19 chain identifier — 에러 메시지의 echo 용도만 (분기 로직 부재)
 * @param payload dApp이 보낸 payload 후보 — 검증 후 sdk로 forward
 * @throws ProviderError(INVALID_PARAMS) — 검증 실패 시
 */
export function _validateSignPayload (chainId: string, payload: unknown): void {
  // (1) plain object 검증
  if (payload === null || payload === undefined) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `Invalid sign payload for chainId '${chainId}': expected object, got ${payload === null ? 'null' : 'undefined'}`,
    )
  }
  if (typeof payload !== 'object') {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `Invalid sign payload for chainId '${chainId}': expected object, got ${typeof payload}`,
    )
  }
  if (Array.isArray(payload)) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `Invalid sign payload for chainId '${chainId}': expected object, got array`,
    )
  }

  const p = payload as Record<string, unknown>

  // (2) keyPath 필수 (sdk handleRequest 계약)
  if (typeof p.keyPath !== 'string') {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `Invalid sign payload for chainId '${chainId}': 'keyPath' field required (BIP44 path string). ` +
      `Example: sign({ method: '...', chainId: '${chainId}', payload: { keyPath: "m/44'/60'/0'/0/0", ... } })`,
    )
  }
  if (p.keyPath.length === 0) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `Invalid sign payload for chainId '${chainId}': 'keyPath' must not be empty`,
    )
  }

  // (3) 프로토타입 키 차단 — own-property로 존재하면 거부
  for (const key of FORBIDDEN_PROTO_KEYS) {
    if (Object.prototype.hasOwnProperty.call(p, key)) {
      throw new ProviderError(
        ErrorCode.INVALID_PARAMS,
        `Invalid sign payload: prototype key '${key}' not allowed`,
      )
    }
  }

  // (4) DoS 방어 — 직렬화 크기 ≤ 64KB
  let serialized: string
  try {
    serialized = JSON.stringify(p)
  } catch (err) {
    // 순환 참조 등으로 JSON.stringify 실패
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `Invalid sign payload for chainId '${chainId}': not JSON-serializable (${(err as Error).message})`,
    )
  }
  if (serialized.length > MAX_PAYLOAD_BYTES) {
    throw new ProviderError(
      ErrorCode.INVALID_PARAMS,
      `Sign payload exceeds ${MAX_PAYLOAD_BYTES}-byte limit (got ${serialized.length} bytes)`,
    )
  }

  // family-specific shape는 sdk 책임 — connector는 여기서 종료
}

/**
 * v2 sign API payload contract — family-agnostic 필수 필드 + dApp-controllable extras.
 *
 * connector 경계에서 보장되는 contract:
 *   - keyPath: non-empty string (BIP44 path) — `_validateSignPayload`가 강제
 *
 * sdk가 chainId 기반으로 family-specific 필드를 별도 검증한다 (예: EVM personal_sign의 address).
 * 본 인터페이스는 documentation 용도이며 dApp에 export된다 (`src/index.ts` 참조).
 */
export interface SignPayload {
  /** BIP44 derivation path — sdk가 wallet-models proxy에 forward. */
  keyPath: string
  /** family-specific 필드 — sdk가 검증. */
  [key: string]: unknown
}
