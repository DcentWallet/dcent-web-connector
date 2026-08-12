/**
 * v2 getPublicKey facade (m09-04-21)
 *
 * redesign(2026-06-24~25)으로 Cardano getAddress 응답이 `publicKeys` 대신 `rewardAddress`를
 * 반환하도록 분리되면서, payment/stake/drep 공개키 조회는 별도 `getPublicKey` verb로 노출한다.
 *
 * getAddress v2 chainId facade(`src/sign/address.ts` `_getAddressV2`, m11-01-02)와 **동형**:
 *   - 신규 v2 시그니처: `getPublicKey({chainId, keyPath, addressFormat?})` — chainId pass-through
 *   - v1 overload 없음 (getPublicKey는 v2 전용 신규 verb — v1 dcent에 대응 함수 부재)
 *   - chainId sanitize(`_sanitizeChainId`) → sdk `getPublicKey` 메서드로 forward → 응답 passthrough
 *
 * **chain-agnostic** (connector-chain-addition-isolation 룰 준수):
 *   - chainId 문자열 sanitize(character whitelist)만 수행
 *   - chain enum / chain → method 정적 매핑 / chain-prefixed switch 분기 부재
 *   - method는 'getPublicKey' literal 고정 — chain identifier 단위 분기 0건
 *   - 실제 chainId → 디바이스 명령 변환은 sdk(m09-03-29) + wallet-models(m02-05-65) 책임
 *
 * 응답 shape (sdk passthrough — connector는 변환 없음):
 *   `{ payment: {keyPath, publicKey}, stake: {keyPath, publicKey}, drep: {keyPath, publicKey} }`
 *   비-Cardano chain은 sdk/wm이 결정. connector는 어떤 shape이든 그대로 forward.
 *
 * 에러 surface (chain-agnostic 투명 전달):
 *   - unknown chainId → sdk `INVALID_PARAMS`(-32602) → v1 'param_error'로 surface
 *   - 비-Cardano(미지원) chain → sdk `METHOD_NOT_FOUND`(-32601) → v1 'method_not_found'로 surface
 *   facade는 어떤 에러 코드도 가공하지 않고 `_call`의 표준 매핑(`providerErrorToV1`)을 그대로 따른다.
 *
 * 룰 준수:
 *   - boundary-validation: chainId / keyPath / addressFormat 모두 검증
 *   - error-handling-consistency: 모든 입력 검증 실패는 `dcentException(param_error)` throw (v1 호환)
 *   - mutation-isolation: `_call`이 매 호출마다 새 V1Response 반환
 *   - connector-chain-addition-isolation: v2 path는 chainId + addressFormat pass-through만, chain 매핑/enum 0건
 *   - dapp-input-sanitization: v2 input은 known fields만 추출 (`_sanitizeChainId` + keyPath 검증 + `_sanitizeAddressFormat`)
 *   - reuse-shared-utils: `_call` / `_sanitizeChainId` / `_sanitizeAddressFormat` 재사용 (getAddress facade와 동일 helper)
 */

import { _call } from './call'
import { _sanitizeChainId } from './sanitize'
import { _sanitizeAddressFormat, type AddressFormat } from './address'
import { dcentException } from '../v1/dcent-exception'
import type { V1Response } from './types'

/**
 * v2 getPublicKey 입력 — getAddress v2 시그니처와 동형(chainId-based).
 *
 * connector는 chainId를 sanitize 후 sdk로 pass-through만 수행한다.
 * chainId → 디바이스 명령 변환은 sdk가 wallet-models registry로 dispatch.
 */
export interface GetPublicKeyV2Input {
  /**
   * CAIP-19 / CIP-34 chain identifier (예: Cardano mainnet).
   * sdk가 본 값을 wallet-models registry로 dispatch에 사용.
   */
  chainId: string
  /**
   * BIP32 key path — 디바이스에서 공개키를 도출할 경로 (예: "m/1852'/1815'/0'/0/0").
   * non-empty string 강제.
   */
  keyPath: string
  /**
   * 같은 chainId 내 여러 주소 형식이 있는 체인에서 어느 variant를 선택할지 명시.
   * getAddress facade의 addressFormat과 동일 enum (generic passthrough 필드).
   * 누락 시 sdk가 chain별 default 사용.
   */
  addressFormat?: AddressFormat
}

/**
 * v2 dcent.getPublicKey — chainId 시그니처 (m09-04-21).
 *
 * getAddress v2 facade(`_getAddressV2`)와 동형. v1 overload는 없다 (신규 v2 전용 verb).
 *
 * connector-chain-addition-isolation 룰 준수:
 *   - chainId 문자열 sanitize만 수행 (character whitelist)
 *   - chain enum / chain → method 매핑 / chain-prefixed switch 분기 부재
 *   - method는 'getPublicKey' literal 고정 — chain identifier 단위 분기 0건
 *
 * @example
 *   await dcent.getPublicKey({
 *     chainId: 'cip34:1-764824073',
 *     keyPath: "m/44'/1815'/0'/0/0",
 *   })
 *   // → { payment: {keyPath, publicKey}, stake: {...}, drep: {...} }
 *
 * @param input { chainId, keyPath, addressFormat? }
 * @returns V1Response (v1 호환 응답 shape — body.parameter에 role별 공개키)
 * @throws V1Exception(param_error) — chainId / keyPath / addressFormat 검증 실패 시
 */
export async function getPublicKey (input: GetPublicKeyV2Input): Promise<V1Response> {
  // boundary-validation: input이 non-null plain object인지 먼저 가드.
  // undefined/null/array/primitive를 그대로 deref하면 raw TypeError가 나서
  // error-handling-consistency(모든 실패는 dcentException) 계약이 깨진다.
  // getAddress facade가 array를 명시 거부하는 것과 동일한 방어 (typeof [] === 'object' 함정 포함).
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw dcentException(
      'param_error',
      'getPublicKey: input must be an object { chainId, keyPath }',
    )
  }

  // chainId sanitize는 ProviderError로 throw — v1 호환을 위해 catch + dcentException re-throw.
  // (getAddress _getAddressV2와 동일 패턴 — App의 .catch(err => err.body?.error?.code) 호환)
  let safeChainId: string
  try {
    safeChainId = _sanitizeChainId(input.chainId)
  } catch {
    throw dcentException('param_error', 'chainId required')
  }

  if (typeof input.keyPath !== 'string' || input.keyPath.length === 0) {
    throw dcentException('param_error', 'keyPath required')
  }

  // addressFormat sanitize — enum whitelist 검증 (getAddress facade와 동일 helper 재사용).
  // undefined/null → 미포함. 잘못된 값 → param_error throw.
  const safeAddressFormat = _sanitizeAddressFormat(input.addressFormat)

  // chainId pass-through — connector는 method dispatch / chain 분기 0건.
  // sdk가 chainId를 보고 family-specific handler로 dispatch (m09-03-29 책임).
  const params: Record<string, unknown> = {
    chainId: safeChainId,
    keyPath: input.keyPath,
  }
  if (safeAddressFormat !== undefined) {
    params.addressFormat = safeAddressFormat
  }

  return _call({ method: 'getPublicKey', chainId: safeChainId, params })
}
