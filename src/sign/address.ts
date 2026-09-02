/**
 * v1 getAddress / getXPUB port (m08-01-02.5) + v2 chainId facade (m11-01-02)
 * + v2 addressFormat field (m09-04-09)
 *
 * v1 src-v1/index.js의 `dcent.getAddress` (l781-813), `dcent.getXPUB` (l822-830)를 1:1 port.
 *
 * **m11-01-02**: `getAddress`에 sign 패턴과 동일한 chainId 컨셉을 도입.
 *   - 신규 v2 시그니처: `getAddress({chainId, keyPath, prefix?})` — chainId pass-through
 *   - 기존 v1 시그니처: `getAddress(coinType, path, prefix?)` — backward-compat 유지
 *   - 런타임 typeguard로 분기 (첫 인자가 object면 v2, string이면 v1)
 *
 * **m09-04-09**: `GetAddressV2Input`에 `addressFormat?: AddressFormat` optional 필드 추가.
 *   - BTC family처럼 같은 chainId 내 여러 주소 형식이 있는 체인에서 variant 명시 dispatch.
 *   - 배경: m11-02-03 PoC 결과 펌웨어가 `request_to` (= sdk가 sdk에서 사용하는 coinType 필드)
 *     단독으로 P2PKH vs Bech32를 결정 → chainId 단독으로는 BITCOIN / BTC-SEGWIT 구분 불가.
 *     v1의 coinType='BTC-SEGWIT' 신호를 v2 wire에서 회복하기 위한 generic 필드.
 *   - 알려진 값 5종은 `KnownAddressFormat` 참조. **connector 는 그 목록으로 거르지 않는다** —
 *     실제 수용 여부는 sdk/wm registry 가 판정한다(도달 불가한 형식은 거기서 거절).
 *   - connector-chain-addition-isolation 룰 준수: chain-specific 분기 추가 없음.
 *     `addressFormat`은 sdk/wm이 해석하는 generic payload 필드이며,
 *     connector는 위생 검사 + pass-through만 수행 (enum 판정은 sdk 소관).
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
 * getAddress v2 동작 (m11-01-02 + m09-04-09):
 *   1. input.chainId 검증 (`_sanitizeChainId`) — type/length/whitelist
 *   2. input.keyPath 검증 — non-empty string
 *   3. input.addressFormat 위생 검사 (`_sanitizeAddressFormat`) — 타입/길이/prototype 키, param_error
 *   4. `_call({method: 'getAddress', chainId, params: {chainId, keyPath, prefix?, addressFormat?}})` 호출
 *   5. 응답 그대로 반환 (czone 복원 같은 v1 특례 분기 없음 — sdk가 family-specific 처리)
 *
 * **v1 1:1 보존 디테일**:
 *   - czone과 parachain은 별도 if 두 개 (mutually exclusive 강제 안 함 — v1 동작 그대로)
 *   - parachain prefix 검증은 `!Number(prefix)` (0/''/null/undefined/NaN/non-numeric string 모두 reject)
 *   - response_from 복원은 mutation으로 수행 (`_call`이 매 호출마다 새 객체 반환하므로 안전 — mutation-isolation)
 *
 * 룰 준수:
 *   - boundary-validation: coinType / parachain prefix / chainId / keyPath / addressFormat / array 모두 검증
 *   - error-handling-consistency: 모든 검증 실패는 `dcentException` throw (v1 1:1)
 *   - mutation-isolation: `_call` 결과의 header 수정은 호출자 view에 영향 없음 (cloned)
 *   - connector-chain-addition-isolation: v2 path는 chainId + addressFormat pass-through만, chain 매핑/enum 0건
 *   - dapp-input-sanitization: v2 input은 known fields만 추출 (`_sanitizeChainId` + keyPath 검증 + `_sanitizeAddressFormat`)
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
 * 현재 **알려진** 주소 형식 (m09-04-09, m21-02 로 BTC 밖까지 확장).
 *
 * BTC family — 주소 **인코딩** 축:
 * - 'legacy':          P2PKH (BITCOIN, BTC-TESTNET — 1xxx / mxxx)
 * - 'segwit-wrapped':  P2SH-P2WPKH (BIP49 wrapped SegWit — 3xxx / 2xxx)
 * - 'segwit-native':   P2WPKH bech32 (BTC-SEGWIT — bc1q... / tb1q...)
 * - 'taproot':         P2TR bech32m (BIP86 — bc1p...)
 *
 * BTC 밖 — **파생 표준** 축 (m21-02):
 * - 'ledger':          Ledger BIP32-Ed25519 계정 표준. Polkadot / Algorand / 파라체인(Astar,
 *                      Creditcoin) 의 LGR variant 를 base 계정과 구분한다. 🔴 주소 인코딩이
 *                      아니라 **어느 파생 표준으로 만든 계정인가**를 말한다 — 같은 chainId 에서
 *                      base 와 LGR 은 keyPath 도 다르다(base `m/44'/354'/0'/0/0` vs
 *                      LGR `m/44'/354'/0'/0'/0'` — tail 하드닝 여부).
 *
 * 🔴 **Cardano 는 이 축이 아니다.** Cardano 의 legacy/LGR 판별자는 keyPath purpose(`1852'` vs
 * `44'`)라 `addressFormat: 'ledger'` 를 실으면 wm 에서 매칭 실패로 떨어진다. 실으면 안 된다.
 *
 * ⚠️ 어느 값이 **실제로 동작하는지는 여기서 결정되지 않는다** — sdk/wm registry 소관이고
 * 시점에 따라 바뀐다. 도달 불가한 형식은 `-32602` 로 거절된다.
 */
export type KnownAddressFormat =
  | 'legacy'
  | 'segwit-wrapped'
  | 'segwit-native'
  | 'taproot'
  | 'ledger'

/**
 * variant disambiguation — 같은 chainId 안에 계정이 둘 이상일 때 어느 쪽인지 명시하는 generic 필드.
 * 🔴 **BTC 전용이 아니다**(m21-02): BTC 는 주소 **인코딩** variant 이고, Polkadot/Algorand/파라체인은
 * **파생 표준** variant(`'ledger'`)다. 축이 둘이라는 사실은 `KnownAddressFormat` 주석이 정본이다. sdk 가 이 값을 wallet-models resolver 에 전달해 firmware `request_to` 를 결정한다.
 *
 * 🔴 **connector 는 이 값을 해석하지 않는다.** 알려진 값 목록은 `KnownAddressFormat` 이 문서·
 * 자동완성용으로만 들고 있고, 타입은 임의 문자열로 열려 있다 — **런타임 enum 검사는 sdk 경계
 * (`_sanitize:readWireAddressFormat`) 하나가 소유**한다. 그래야 새 형식이 열릴 때
 * **connector 를 재배포하지 않아도** 된다(connector 는 npm 이라 App 이 의존성을 올려야 반영되고,
 * bridge 는 호스팅이라 즉시 배포된다). `connector-chain-addition-isolation` — chain enum/매핑 0건.
 *
 * 같은 이유로 `sign({method:'signTransaction'})` 의 payload 는 애초에 enum 검사를 하지 않는다.
 * 네 진입점(getAddress / getPublicKey / syncAccount / sign)의 **enum 축** 계약을 여기서 일치시킨다.
 * ⚠️ **위생 축은 여전히 sign 이 느슨하다**(`''`/비문자열/과길이/prototype 키를 그대로 forward) —
 * 그쪽은 `_validateSignPayload` 소관이고 이 커밋의 스코프가 아니다.
 */
export type AddressFormat = KnownAddressFormat | (string & {})

// NOTE(decision-anchor: m21-02-forward-only): connector 는 wm 레지스트리에 의존하지 않아
// SupportSegwit/hrp 같은 의미 게이트를 검사할 수단이 없다. 화이트리스트를 되살리면 새 형식마다
// npm 재배포가 필요해지고 sdk 경계와 사본이 둘이 된다. KnownAddressFormat 은 자동완성용이지
// 게이트가 아니다.

/**
 * 🔴 **타입이 열려 있다는 것의 검출자 둘 중 하나.** 잡는 것은 **좁힘**이다 —
 * `AddressFormat = string` 으로 **넓히는** 퇴화는 의도적으로 미검출이다(`string extends string`).
 * 위험 방향이 아니라서다: 넓힘은 `KnownAddressFormat` 의 자동완성 가치만 잃고 정확성·보안 영향이 없다.
 * v2 테스트는 babel 이 타입을 벗겨내고 돌기 때문에(`jest.v2.config.js` — `babel-jest`),
 * 이 union 을 다시 좁혀도 **빨개지는 테스트가 하나도 없다.** `tsc --noEmit` 이 보는 범위는
 * `src/**` 뿐이라(`tsconfig.json` 의 `exclude: tests/**`) 컴파일 타임 단언을 여기 둔다.
 * 타입만 쓰므로 번들에 아무것도 남지 않는다.
 *
 * 다른 하나는 `_sanitizeAddressFormat` 의 `return value` 다 — 좁히면 `string` 대입이 깨진다.
 * 🔴 **그쪽을 캐스트로 무마하는 드리프트는 이 단언만 잡는다**(실측: 좁힘+캐스트 → 여기서만 RED).
 */
type _AssertTrue<T extends true> = T
// 🔴 프로브는 **리터럴이 아니라 `string`** 이다. 리터럴이면 타입을 좁혔을 때 "타입 말고
//    리터럴을 고치면 통과" 하는 우회가 생긴다(실측: 프로브를 'legacy' 로 바꾸면 침묵한다).
// 🔴 실패 분기는 반드시 `false` 다. `never` 로 두면 `never extends true` 가 **참**이라
//    단언이 통째로 inert 해진다(실측으로 그렇게 만들었다가 잡았다).
// 🔴 export 하지 않는다 — 배포 `.d.ts` 에 내부 이름을 남길 이유가 없고, 없어도 단언은 작동한다.
type _AddressFormatAcceptsUnknown = _AssertTrue<
  string extends AddressFormat ? true : false
>

// 🔴 위 단언의 **거울상**. 저쪽은 열림(넓힘 허용)을 지키고, 이쪽은 **union 이 좁아지는 것**을 잡는다.
//    여기서는 프로브가 리터럴이어야 한다 — 열림 단언과 반대 방향이라 `string` 프로브로는
//    `'ledger'` 제거를 못 본다(실측: union 에서 'ledger' 를 지우면 이 단언만 RED 가 되고
//    위 열림 단언은 에러 0건으로 침묵한다).
// 🔴 검사 대상은 `KnownAddressFormat` 이지 `AddressFormat` 이 아니다. 후자에 걸면 열린 타입이
//    무엇이든 흡수해 단언이 통째로 inert 해진다(실측: 그렇게 바꾸고 union 에서 지우면 exit 0).
// 🔴 실패 분기는 `false` 다(`never extends true` 는 참이라 inert 해진다 — 위와 같은 함정).
type _AssertLedgerKnown = _AssertTrue<
  'ledger' extends KnownAddressFormat ? true : false
>

/** 값으로 실려도 prototype 오염 벡터가 되는 문자열 — `sanitize.ts` 의 동명 가드와 같은 집합. */
const FORBIDDEN_ADDRESS_FORMAT_VALUES = new Set(['__proto__', 'constructor', 'prototype'])

/** 형식 문자열 길이 상한 — 형제 `_sanitizeChainId`(`_sanitizeString`)와 같은 값. */
const ADDRESS_FORMAT_MAX_LEN = 256

/**
 * addressFormat 필드 sanitize helper (m09-04-09).
 *
 * 🔴 **enum membership 은 검사하지 않는다** — 알려진 값 목록을 여기 두면 sdk/wm 이 새 형식을
 * 열 때마다 connector 를 재배포해야 하고, 그때까지 App 은 이미 열린 형식을 못 쓴다. 판정은
 * sdk 경계 하나가 소유한다(거기서 `-32602`).
 *
 * 🔴 그 sdk 거절은 **reject 가 아니라 resolve** 로 온다 — `_call` 은 throw 하지 않고
 * `header.status:'failure'` + `body.error.code:'param_error'`(`-32602` 매핑)를 담은 V1Response 를
 * 돌려준다(`call.ts`). 반면 아래 위생 위반은 **reject**(`dcentException`)다. 두 경로가 다르다.
 *
 * 여기 남기는 것은 **드리프트하지 않는 위생**뿐:
 *
 *   - undefined / null → undefined (optional 필드로 envelope 에 미포함)
 *   - non-string → param_error
 *   - 빈 문자열 → param_error (어떤 시점에도 유효한 형식이 아니고, wm 계약도 `''` 를 거절한다)
 *   - 길이 > 256 → param_error (형제 `_sanitizeChainId` 와 같은 상한)
 *   - 값이 prototype 키(`__proto__` 등) → param_error
 *
 * boundary-validation + error-handling-consistency 룰 준수: 실패 시 전부 throw.
 * 에러는 형제 필드들과 같이 `dcentException('param_error')` 로 통일한다
 * (v1 App 이 `.catch(err => err.body?.error?.code)` 패턴을 쓴다 — 이 파일 위 `chainId` 주석 참조).
 */
export function _sanitizeAddressFormat (value: unknown): AddressFormat | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw dcentException(
      'param_error',
      `addressFormat must be a string, got ${typeof value}`,
    )
  }
  if (value.length === 0) {
    throw dcentException('param_error', 'addressFormat must not be empty')
  }
  if (value.length > ADDRESS_FORMAT_MAX_LEN) {
    throw dcentException(
      'param_error',
      `addressFormat length exceeds ${ADDRESS_FORMAT_MAX_LEN} chars (got ${value.length})`,
    )
  }
  if (FORBIDDEN_ADDRESS_FORMAT_VALUES.has(value.toLowerCase())) {
    throw dcentException(
      'param_error',
      `addressFormat rejected: prototype-pollution key '${value}'`,
    )
  }
  return value
}

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
  /**
   * BTC family처럼 같은 chainId 내 여러 주소 형식이 있는 체인에서
   * 어느 variant를 선택할지 명시. 누락 시 sdk가 chain별 default 사용.
   *
   * 도입 컨텍스트: m11-02 epic이 chainId 단독 dispatch로 BTC SegWit을
   * 분리 불가능함을 확인 (BITCOIN / BTC-SEGWIT 같은 caip19 공유).
   * v1의 coinType='BTC-SEGWIT' 명시 신호를 v2 wire에서 회복.
   */
  addressFormat?: AddressFormat
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
    // v1 App이 .catch(err => err.body?.error?.code) 패턴을 쓰므로 dcentException으로 통일.
    throw dcentException('param_error', 'chainId required')
  }

  if (typeof input.keyPath !== 'string' || input.keyPath.length === 0) {
    throw dcentException('param_error', 'keyPath required')
  }

  // addressFormat sanitize — 위생 검사만 (m09-04-09).
  // undefined/null → 미포함. enum membership 은 sdk 경계가 판정한다.
  const safeAddressFormat = _sanitizeAddressFormat(input.addressFormat)

  // chainId pass-through — connector는 method dispatch / chain 분기 0건.
  // params에 chainId/keyPath/prefix/addressFormat을 그대로 담아 sdk로 forward.
  // sdk가 chainId를 보고 family-specific handler로 dispatch (m11-02 책임).
  const params: Record<string, unknown> = {
    chainId: safeChainId,
    keyPath: input.keyPath,
  }
  if (input.prefix !== undefined && input.prefix !== null) {
    params.prefix = input.prefix
  }
  if (safeAddressFormat !== undefined) {
    params.addressFormat = safeAddressFormat
  }

  return _call({ method: 'getAddress', chainId: safeChainId, params })
}

/**
 * v1 getAddress — coinType 기반 시그니처 (m08-01-02.5 그대로).
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
