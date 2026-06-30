/**
 * v2 sign — barrel export (m09-04-01: v1 wrapper paths 제거 후)
 *
 * sign 디렉토리의 public surface를 한 곳에서 export.
 * src/index.ts (v2 facade entry)가 본 모듈을 import하여 dApp에 노출한다.
 *
 * m09-04-01 변경: v1 wrapper 21개 + chain → method 정적 매핑 + 전용 helper 3개
 * (typeOptions sanitize / checkParameter / czon decimal lookup) export 제거.
 * 보존 helper 4개(coinTypeValidators / coinGroupValidator / labelValidator /
 * bitcoinTxBuilder)는 그대로 유지.
 */

// public API
export { sign } from './sign'
export type { SignInput } from './sign'

// V1 호환 응답 타입 + m12-03 신규 타입 + m09-04-12 v2 account 타입
export type { V1Response, V1ResponseHeader, V1ResponseBody, DeviceInfoPayload, V2SyncAccountInfo, V2AccountInfo, AccountListV2Payload } from './types'

// internal helpers — sibling module이 사용. 이름 prefix `_`로 표기.
export { _call } from './call'
export type { CallInput } from './call'
export { _genId } from './idGen'
export { _sanitizeMethod, _sanitizeChainId } from './sanitize'
export { _assertV1Success } from './assert'
export { providerErrorToV1 } from './error'

// m08-01-02.5: read-only / configure / Bitcoin tx-builder + v1 validators
export { info, getDeviceInfo, getAccountInfo } from './info'
export { getAddress, getXPUB } from './address'
// m11-01-02: v2 chainId facade input type for getAddress
export type { GetAddressV2Input } from './address'
// m09-04-09: addressFormat enum type for BTC family multi-variant dispatch
export type { AddressFormat } from './address'
// m09-04-21: v2 getPublicKey verb (chain-agnostic) — Cardano payment/stake/drep 공개키 조회
export { getPublicKey } from './publicKey'
export type { GetPublicKeyV2Input } from './publicKey'
export { setLabel, syncAccount, selectAddress } from './configure'
// m09-04-12: SyncAccountInfo(v1) removed — V2SyncAccountInfo re-exported from ./types above
// m09-04-15: builder가 v2 flat BitcoinWireTransaction을 직접 생성 (별도 변환 함수 없음)
export {
  getBitcoinTransactionObject,
  addBitcoinTransactionInput,
  addBitcoinTransactionOutput,
} from './bitcoinTxBuilder'
// m09-04-15: flat wire transaction 계약 타입 (wm BitcoinWireTransaction 1:1)
export type {
  BitcoinWireTransaction,
  BitcoinWireInput,
  BitcoinWireOutput,
  BitcoinWireTxType,
} from './bitcoinTxBuilder'

// v1 validator helpers — 보존. dApp 표면 1:1 유지.
export {
  isAvaliableCoinType,
  isCzoneCoinType,
  isParachainCoinType,
  isBitcoinTxCoinType,
  isTokenType,
  getCzonePrifix, // v1 typo 보존
} from './coinTypeValidators'
export { isAvaliableLabel } from './labelValidator'
export {
  isAvaliableCoinGroup,
  isAvailableSyncAccountCoinName,
} from './coinGroupValidator'
