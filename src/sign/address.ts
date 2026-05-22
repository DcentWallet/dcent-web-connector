/**
 * v1 getAddress / getXPUB port (m08-01-02.5) + v2 chainId facade (m11-01-02)
 *
 * v1 src-v1/index.js의 `dcent.getAddress` (l781-813), `dcent.getXPUB` (l822-830)를 1:1 port.
 *
 * **m11-01-02**: `getAddress`에 sign 패턴과 동일한 chainId 컨셉을 도입.
 *   - 신규 v2 시그니처: `getAddress({chainId, keyPath, prefix?})` — chainId pass-through
 *   - 기존 v1 시그니처: `getAddress(coinType, path, prefix?)` — backward-compat 유지
 *   - 런타임 typeguard로 분기 (첫 인자가 object면 v2, string이면 v1)
 *
 * connector-chain-addition-isolation 룰: v2 path는 chainId pass-through만 수행한다.
 * chain enum / chain → method 정적 매핑 / chain-prefixed switch 분기 추가 0건.
 * 실제 chainId → 디바이스 명령 변환은 sdk + wallet-models 책임 (m11-02).
 *
 * getAddress v1 핵심 동작 (변경 없음):
 *   1. coinType 검증 (`isAvaliableCoinType`) — fail 시 `coin_type_error` throw
 *   2. params 구성 — czone이면 `coinType: 'czone'`, 아니면 원본 coinType
 *   3. czone이면 `optionParam = getCzonePrifix(coinType)` (Buffer hex)
 *   4. parachain이면 `optionParam = Number(prefix)` — `!Number(prefix)` true이면 `param_error` throw
 *   5. `_call({method: 'getAddress', params})` 호출
 *   6. 응답 `header.response_from === 'czone'` → 원본 coinType으로 복원
 *
 * getAddress v2 동작 (m11-01-02 신규):
 *   1. input.chainId 검증 (`_sanitizeChainId`) — type/length/whitelist
 *   2. input.keyPath 검증 — non-empty string
 *   3. `_call({method: 'getAddress', chainId, params: {chainId, keyPath, prefix?}})` 호출
 *   4. 응답 그대로 반환 (czone 복원 같은 v1 특례 분기 없음 — sdk가 family-specific 처리)
 *
 * **v1 1:1 보존 디테일**:
 *   - czone과 parachain은 별도 if 두 개 (mutually exclusive 강제 안 함 — v1 동작 그대로)
 *   - parachain prefix 검증은 `!Number(prefix)` (0/''/null/undefined/NaN/non-numeric string 모두 reject)
 *   - response_from 복원은 mutation으로 수행 (`_call`이 매 호출마다 새 객체 반환하므로 안전 — mutation-isolation)
 *
 * 룰 준수:
 *   - boundary-validation: coinType / parachain prefix / chainId / keyPath / array 모두 검증
 *   - error-handling-consistency: 모든 검증 실패는 `dcentException` throw (v1 1:1)
 *   - mutation-isolation: `_call` 결과의 header 수정은 호출자 view에 영향 없음 (cloned)
 *   - connector-chain-addition-isolation: v2 path는 chainId pass-through만, chain 매핑/enum 0건
 *   - dapp-input-sanitization: v2 input은 known fields만 추출 (`_sanitizeChainId` + keyPath 검증)
 */

import { _call } from './call'
import { _sanitizeChainId } from './sanitize'
import {
  isAvaliableCoinType,
  isCzoneCoinType,
  isParachainCoinType,
  getCzonePrifix,
} from './coinTypeValidators'
import { dcentException } from '../v1/dcent-exception'
import type { V1Response } from './types'

/**
 * v2 getAddress 입력 — sign 패턴과 동일한 chainId-based 시그니처.
 *
 * connector는 chainId를 sanitize 후 sdk로 pass-through만 수행한다.
 * chainId → 디바이스 명령 변환은 sdk가 wallet-models registry로 dispatch.
 */
export interface GetAddressV2Input {
  /**
   * CAIP-19 chain identifier (예: 'eip155:1', 'eip155:1/slip44:60', 'bip122:000000...')
   * sdk가 본 값을 wallet-models registry로 dispatch에 사용.
   */
  chainId: string
  /**
   * BIP32 key path — 디바이스에서 주소를 도출할 경로 (예: "m/44'/60'/0'/0/0").
   * non-empty string 강제.
   */
  keyPath: string
  /**
   * 일부 chain (czone / parachain 등)에 필요한 추가 prefix.
   * sdk가 chainId에 따라 의미를 결정. connector는 sanitize 없이 pass-through.
   */
  prefix?: string | null
}

/**
 * v2 getAddress — chainId 시그니처 (m11-01-02).
 *
 * connector-chain-addition-isolation 룰 준수:
 *   - chainId 문자열 sanitize만 수행 (character whitelist)
 *   - chain enum / chain → method 매핑 / chain-prefixed switch 분기 부재
 *   - method는 'getAddress' literal 고정 — chain identifier 단위 분기 0건
 *
 * @param input { chainId, keyPath, prefix? }
 * @returns V1Response (v1 호환 응답 shape)
 * @throws V1Exception(param_error) — chainId / keyPath 검증 실패 시
 */
async function _getAddressV2 (input: GetAddressV2Input): Promise<V1Response> {
  // chainId sanitize는 ProviderError로 throw — v1 호환을 위해 catch + dcentException re-throw
  let safeChainId: string
  try {
    safeChainId = _sanitizeChainId(input.chainId)
  } catch {
    // _sanitizeChainId는 string이 아니거나 빈 문자열 / disallowed char이면 ProviderError를 던진다.
    // v1 dApp이 .catch(err => err.body?.error?.code) 패턴을 쓰므로 dcentException으로 통일.
    throw dcentException('param_error', 'chainId required')
  }

  if (typeof input.keyPath !== 'string' || input.keyPath.length === 0) {
    throw dcentException('param_error', 'keyPath required')
  }

  // chainId pass-through — connector는 method dispatch / chain 분기 0건.
  // params에 chainId/keyPath/prefix를 그대로 담아 sdk로 forward.
  // sdk가 chainId를 보고 family-specific handler로 dispatch (m11-02 책임).
  const params: Record<string, unknown> = {
    chainId: safeChainId,
    keyPath: input.keyPath,
  }
  if (input.prefix !== undefined && input.prefix !== null) {
    params.prefix = input.prefix
  }

  return _call({ method: 'getAddress', chainId: safeChainId, params })
}

/**
 * v1 getAddress — coinType 기반 시그니처 (m08-01-02.5 그대로).
 *
 * 기존 v1 dApp 호환을 위해 보존. 변경 없음.
 */
async function _getAddressV1 (
  coinType: string,
  path: string,
  prefix: string | number | null = null,
): Promise<V1Response> {
  if (!isAvaliableCoinType(coinType)) {
    throw dcentException('coin_type_error', 'not supported coin type')
  }

  const params: Record<string, unknown> = {
    coinType: isCzoneCoinType(coinType) ? 'czone' : coinType,
    path,
  }

  // v1과 동일하게 별도 if 두 개 (mutually exclusive 강제 안 함)
  if (isCzoneCoinType(coinType)) {
    params.optionParam = getCzonePrifix(coinType)
  }

  if (isParachainCoinType(coinType)) {
    // v1 src-v1/index.js#l796-801: `if (!Number(prefix)) throw`
    // → '', null, undefined, 0, NaN, 비숫자 문자열 모두 reject
    if (!Number(prefix)) {
      throw dcentException('param_error', 'Invaild Parameter')
    }
    params.optionParam = Number(prefix)
  }

  const res = await _call({ method: 'getAddress', params })

  // czone 응답에서 response_from을 원래 coinType으로 복원 (v1 src-v1/index.js#l808)
  if (res.header.response_from === 'czone') {
    res.header.response_from = coinType
  }
  return res
}

/**
 * v1 dcent.getAddress (src-v1/index.js#l781-813) port + m11-01-02 v2 chainId facade.
 *
 * Overload signatures:
 *   - v2: `getAddress(input: GetAddressV2Input)` — chainId / keyPath / prefix? 객체
 *   - v1: `getAddress(coinType: string, path: string, prefix?: string|number|null)` — 기존 시그니처
 *
 * 런타임 분기 — 첫 인자가 plain object면 v2, string이면 v1.
 * Array 입력은 `typeof [] === 'object'` 함정 방지를 위해 명시적 거부.
 *
 * @example v2 (신규)
 *   await dcent.getAddress({
 *     chainId: 'eip155:1/slip44:60',
 *     keyPath: "m/44'/60'/0'/0/0",
 *   })
 *
 * @example v1 (보존)
 *   await dcent.getAddress('ETHEREUM', "m/44'/60'/0'/0/0")
 *
 * @returns V1Response (v1 호환 응답 shape)
 */
export function getAddress (input: GetAddressV2Input): Promise<V1Response>
export function getAddress (
  coinType: string,
  path: string,
  prefix?: string | number | null,
): Promise<V1Response>
export function getAddress (
  arg1: GetAddressV2Input | string,
  arg2?: string,
  arg3?: string | number | null,
): Promise<V1Response> {
  // 런타임 분기:
  //   - Array → 명시적 거부 (typeof [] === 'object' 함정 방지)
  //   - plain object → v2 path
  //   - string → v1 path
  if (Array.isArray(arg1)) {
    return Promise.reject(
      dcentException(
        'param_error',
        'getAddress: array input not supported (expected string coinType or object {chainId, keyPath})',
      ),
    )
  }
  if (typeof arg1 === 'object' && arg1 !== null) {
    return _getAddressV2(arg1)
  }
  // string 외 타입(undefined / number / boolean)도 v1 경로로 보내면
  // isAvaliableCoinType에서 coin_type_error로 reject되므로 안전.
  return _getAddressV1(arg1 as string, arg2 as string, arg3 ?? null)
}

/**
 * v1 dcent.getXPUB (src-v1/index.js#l822-830) 1:1 port.
 *
 * Extended Public Key 조회. BIP44 key path가 최소 두 depth로 hardened되어야 함.
 *
 * @param key BIP44 key path
 * @param bip32name BIP32 master key 파생용 string (default 'Bitcoin seed')
 * @returns XPUB가 담긴 V1Response
 */
export function getXPUB (key: string, bip32name: string): Promise<V1Response> {
  return _call({ method: 'getXPUB', params: { key, bip32name } })
}
