/**
 * v2 syncAccount per-item sanitize (m09-04-12)
 *
 * dApp이 syncAccount(accountInfos) 로 전달하는 각 항목을 사용 전에 검증한다.
 *
 * 적용 룰:
 *   - dapp-input-sanitization: known-fields({chainId, keyPath, label, token?, meta?})만 추출.
 *     unknown 필드 silent drop. __proto__ / constructor / prototype 자동 차단 (own-enumerable만 읽음).
 *   - connector-chain-addition-isolation: chainId는 _sanitizeChainId(문자 whitelist)만.
 *     chain 종류 판정 / enum 매핑 / coin_group 검증 일절 금지.
 *   - boundary-validation: 비객체 입력 → throw. 필수 필드(chainId/keyPath/label) 누락 → throw.
 *   - error-handling-consistency: 모든 검증 실패는 throw (silent return 금지).
 *
 * BIP44_PATH_REGEX 출처:
 *   chain-agnostic 형식만 검사. "m/" + hardened/non-hardened components.
 *   예: "m/44'/60'/0'/0/0" ✓  "44/60" ✗ (m/ prefix 없음)
 *
 * TOKEN_CONTRACT_REGEX (m13-02-08):
 *   종전 정규식은 `EVM hex | base58` 두 형식만 허용했는데, 실측 결과 wm 레지스트리 5080종 중
 *   **455종(14 family)** 이 connector 단계에서 선차단되고 있었다 — BINANCE 276 / RIPPLE 47 /
 *   STELLAR 32 / XINFIN 22 / HEDERA 22 / NEAR 14 / TRON 8 / ALGORAND 8 / POLKADOT 7 /
 *   STACKS 7 / CONFLUX 4 / HAVAH 4 / COSMOS 3 / constellation 1.
 *   (`0.0.333611` · `token.sweat` · `AQUA-GBNZ…` · `cfx:achc…` · `1002000` 등)
 *
 *   형식 판정은 **체인별 지식**이므로 connector가 하지 않는다
 *   (connector-chain-addition-isolation — 여기에 chain 분기를 두면 새 체인마다 connector를
 *   재배포해야 한다). 그래서 "형식"이 아니라 **문자 whitelist + 길이**만 본다:
 *     - 허용 문자는 실제 식별자에 쓰이는 것뿐 — 영숫자와 `. - _ : /`
 *       (`:`=Conflux base32 prefix, `/`=Cosmos ibc//factory denom, `-`=Stellar/BEP2 code-issuer,
 *        `.`=Hedera/NEAR/Stacks/XRP)
 *     - 공백·따옴표·꺾쇠·역슬래시·제어문자는 계속 차단(로그/URL 주입 표면 축소)
 *   진짜 형식 판정은 지갑(wm 해석기)이 하고, 실패는 `-32602`로 돌아온다.
 */

import { _sanitizeChainId } from './sanitize'
import { isAvaliableLabel } from './labelValidator'
import { dcentException } from '../v1/dcent-exception'
import { _sanitizeAddressFormat } from './address'
import type { V2SyncAccountInfo } from './types'

/** BIP44 key path — chain-agnostic 형식 검증.
 *  "m/" prefix + 하나 이상의 hardened/non-hardened 숫자 컴포넌트.
 *  예: "m/44'/60'/0'/0/0", "m/44'/195'/0'/0/0" */
const BIP44_PATH_REGEX = /^m(\/\d+'?)+$/

/** 토큰 컨트랙트/asset 식별자 — 문자 whitelist + 길이만 검사(위 파일 주석 참조).
 *  chain 타입 판정 안 함. 상한 128자는 실측 최장(Cosmos ibc/ denom 68자)의 여유값. */
const TOKEN_CONTRACT_REGEX = /^[A-Za-z0-9._:\-/]{1,128}$/

/** decimals 상한 — wm `assertWireTokenDecimalsRange`(u8 전제 [0,255])와 동일 계약.
 *  두 곳이 갈리면 connector를 통과한 값이 지갑에서 -32602로 죽어 원인 추적이 어려워진다. */
const TOKEN_DECIMALS_MAX = 255

/** prototype 오염 방지 키 셋 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * v2 syncAccount 단일 항목을 sanitize하여 V2SyncAccountInfo를 반환한다.
 *
 * boundary-validation: 비배열 입력 가드는 caller(syncAccount)가 담당.
 * 본 함수는 배열의 각 항목 객체 검증만 담당.
 *
 * @param raw dApp이 전달한 account 항목 (unknown)
 * @returns 검증·sanitize된 V2SyncAccountInfo
 * @throws dcentException('param_error') — 형식 위반 시
 */
export function _sanitizeSyncAccountItem (raw: unknown): V2SyncAccountInfo {
  // 비객체 / null / 배열 → throw
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw dcentException('param_error', 'invalid account item: must be a plain object')
  }

  const src = raw as Record<string, unknown>

  // own-enumerable 키만 null-prototype 스냅샷으로 복사한다.
  //  - 상속(prototype 체인) 속성은 애초에 수집 대상에서 제외 → whitelist 정확성 보장
  //  - forbidden key(__proto__/constructor/prototype)는 명시 차단
  //  - 이후 검증/추출은 모두 이 스냅샷(o)에서만 읽으므로 o.chainId 등이 상속값을 집어오지 않음
  const o: Record<string, unknown> = Object.create(null)
  for (const k of Object.keys(src)) {
    if (FORBIDDEN_KEYS.has(k.toLowerCase())) {
      throw dcentException('param_error', `forbidden key: ${k}`)
    }
    o[k] = src[k]
  }

  // chainId — _sanitizeChainId가 형식 whitelist + throw (ProviderError).
  // syncAccount 경계에서는 dcentException('param_error')로 래핑 — error-handling-consistency.
  // (connector-chain-addition-isolation: chain enum / coin_group 검증 금지)
  let chainId: string
  try {
    chainId = _sanitizeChainId(o.chainId)
  } catch (e) {
    throw dcentException('param_error', e instanceof Error ? e.message : 'invalid chainId')
  }

  // keyPath — chain-agnostic key path 형식만 검사 (BIP32 "m/" prefix + 숫자 컴포넌트).
  // 엄격한 BIP44 5-component 강제는 하지 않는다 — 체인마다 depth가 다르므로(connector-chain-addition-isolation)
  // 실제 path 유효성 판정은 wm/sdk에 위임. 여기서는 형식 위반만 거른다.
  const rawKeyPath = o.keyPath
  if (rawKeyPath === undefined || rawKeyPath === null || rawKeyPath === '') {
    throw dcentException('param_error', 'keyPath required')
  }
  const keyPath = String(rawKeyPath)
  if (!BIP44_PATH_REGEX.test(keyPath)) {
    throw dcentException('param_error', 'Invalid keyPath - ' + keyPath)
  }

  // label — v1 isAvaliableLabel 재사용 (메시지 보존)
  const rawLabel = o.label
  const label = rawLabel !== undefined ? String(rawLabel) : ''
  if (!isAvaliableLabel(label)) {
    throw dcentException('param_error', 'Invalid Label - ' + label)
  }

  // known-fields only output (unknown fields silently dropped)
  const out: V2SyncAccountInfo = { chainId, keyPath, label }

  // token — optional. 키가 없거나(undefined/null) 토큰이 아닌 경우 omit.
  //   단, 키가 명시적으로 존재하는데 내용이 불량이면 throw — silent drop하면 caller의 실수
  //   (토큰 의도인데 식별자 누락)가 **native-coin 계정으로 둔갑**해 엉뚱한 자산이 기기에
  //   등록된다 (error-handling-consistency: 검증 실패는 throw, silent return 금지).
  //
  //   dapp-input-sanitization: `token` 전체를 pass-through하지 않고 known key
  //   (contract/symbol/decimals)만 추출한다 — unknown 키는 silent drop.
  //   (m13-02-08) 종전 top-level `contractAddress`는 제거됐다. 그 키를 그대로 보내면 unknown
  //   필드로 drop되어 **코인 계정으로 처리**되는데, 이는 의도된 동작이다 — v2는 published된
  //   적이 없어 그 키를 쓰던 dApp이 존재하지 않고, 그 경로 자체가 한 번도 성공한 적이 없다.
  if (Object.prototype.hasOwnProperty.call(o, 'token') &&
      o.token !== undefined && o.token !== null) {
    if (typeof o.token !== 'object' || Array.isArray(o.token)) {
      throw dcentException('param_error', 'invalid token: must be a plain object')
    }
    // 🔴 상위 항목과 **동일하게** own-enumerable 스냅샷을 뜬 뒤 그것만 읽는다.
    //    forbidden key 만 훑고 원본 객체에서 직접 읽으면, prototype 에만 `contract` 를 둔
    //    객체(`Object.create({ contract: '…' })`)가 `Object.keys()` 에 안 잡혀 forbidden
    //    검사를 통과한 뒤 **상속값이 채택**된다 — 상위 항목이 T-SEC-INHERIT-01 로 막아 둔
    //    바로 그 구멍이 token 블록에만 남는 비대칭이 된다 (boundary-validation: own-property 우선).
    const srcToken = o.token as Record<string, unknown>
    const rawToken: Record<string, unknown> = Object.create(null)
    for (const k of Object.keys(srcToken)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) {
        throw dcentException('param_error', `forbidden key: token.${k}`)
      }
      rawToken[k] = srcToken[k]
    }

    // contract — **string 강제**. `String(x)` 로 coerce하지 않는다:
    //   Polkadot asset id 는 `340282366920938463463374607431768211455`(39자리)까지 가고,
    //   dApp 이 이를 number 로 보내면 JS 배정밀도에서 **이미 값이 뭉개진 뒤** 도착한다.
    //   coerce하면 그 손상을 조용히 통과시키게 되므로 타입 단계에서 막는다.
    const rawContract = rawToken.contract
    if (rawContract === undefined || rawContract === null || rawContract === '') {
      throw dcentException('param_error', 'token.contract required')
    }
    if (typeof rawContract !== 'string') {
      throw dcentException('param_error', 'invalid token.contract: must be a string')
    }
    if (!TOKEN_CONTRACT_REGEX.test(rawContract)) {
      throw dcentException('param_error', 'invalid token.contract: ' + rawContract)
    }

    const token: NonNullable<V2SyncAccountInfo['token']> = { contract: rawContract }

    // symbol — 표시용. 존재하면 비어있지 않은 **문자열**이어야 한다(빈 값은 아이콘 매칭을
    //   조용히 깨뜨리므로 통과시키지 않는다). contract 와 동일하게 coerce하지 않는다.
    if (rawToken.symbol !== undefined && rawToken.symbol !== null) {
      if (typeof rawToken.symbol !== 'string' || rawToken.symbol === '') {
        throw dcentException('param_error', 'invalid token.symbol: must be a non-empty string')
      }
      token.symbol = rawToken.symbol
    }

    // decimals — 지갑의 descriptor 해석 진입 조건. String() 강제 변환을 하지 않는다:
    //   '6' 같은 문자열을 조용히 6으로 바꾸면 dApp의 타입 실수가 표시 금액 오류로 이어진다.
    //   범위는 wm과 동일한 u8 [0,255] (TOKEN_DECIMALS_MAX 주석 참조).
    if (rawToken.decimals !== undefined && rawToken.decimals !== null) {
      const decimals = rawToken.decimals
      if (typeof decimals !== 'number' || !Number.isInteger(decimals) ||
          decimals < 0 || decimals > TOKEN_DECIMALS_MAX) {
        throw dcentException(
          'param_error',
          `invalid token.decimals: must be an integer in [0, ${TOKEN_DECIMALS_MAX}]`,
        )
      }
      token.decimals = decimals
    }

    out.token = token
  }

  // meta.addressFormat — BTC 주소 형식 disambiguation (legacy/segwit-wrapped/segwit-native/taproot).
  //   dapp-input-sanitization: meta 전체를 pass-through하지 않고 known key(addressFormat)만 추출·검증한다.
  //   _sanitizeAddressFormat: 부재/null → undefined, non-string/미허용 enum → param_error throw (getAddress와 동일).
  //   connector는 값을 해석하지 않고 forward만 — chainId+addressFormat → coin_name 매핑은 sdk(accountV2)가 수행.
  if (Object.prototype.hasOwnProperty.call(o, 'meta') &&
      o.meta !== undefined && o.meta !== null) {
    if (typeof o.meta !== 'object' || Array.isArray(o.meta)) {
      throw dcentException('param_error', 'invalid meta: must be a plain object')
    }
    const addressFormat = _sanitizeAddressFormat((o.meta as Record<string, unknown>).addressFormat)
    if (addressFormat !== undefined) {
      out.meta = { addressFormat }
    }
  }

  return out
}
