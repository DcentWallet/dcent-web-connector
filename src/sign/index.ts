/**
 * v2 sign — barrel export (m08-01-02 + m08-01-02.5)
 *
 * sign 디렉토리의 public surface를 한 곳에서 export.
 * src/index.ts (v2 facade entry)가 본 모듈을 import하여 dApp에 노출한다.
 */

// public API
export { sign } from './sign'
export type { SignInput } from './sign'

// V1 호환 응답 타입
export type { V1Response, V1ResponseHeader, V1ResponseBody } from './types'

// internal helpers — sibling module(m08-01-03/04)이 사용. 이름 prefix `_`로 표기.
export { _call } from './call'
export type { CallInput } from './call'
export { _genId } from './idGen'
export { _sanitizeChain } from './sanitize'
export { _assertV1Success } from './assert'
export { providerErrorToV1 } from './error'
export { chainToMethod, PREFIX_TO_METHOD } from './chainToMethod'

// m08-01-02.5: read-only / configure / Bitcoin tx-builder + v1 validators
export { info, getDeviceInfo, getAccountInfo } from './info'
export { getAddress, getXPUB } from './address'
export { setLabel, syncAccount, selectAddress } from './configure'
export type { SyncAccountInfo } from './configure'
export {
  getBitcoinTransactionObject,
  addBitcoinTransactionInput,
  addBitcoinTransactionOutput,
} from './bitcoinTxBuilder'
export type { BitcoinTxObject, BitcoinTxParameter } from './bitcoinTxBuilder'

// v1 validator helpers — sibling module(m08-01-03/04 wrapper)이 재사용. dApp 표면 1:1 보존.
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

// m08-01-03: v1 EVM sign wrappers + checkParameter helper + typeOptions sanitize
export {
  getEthereumSignedTransaction,
  getEthereumSignedMessage,
  getTokenSignedTransaction,
  getKlaytnSignedTransaction,
} from './evm'
export type { EvmTokenContract, KlaytnContract } from './evm'
export { checkParameter } from './checkParameter'
export { _sanitizeEthereumTypeOptions } from './_sanitizeEthereumTypeOptions'
export type { EthereumTypeOptions } from './_sanitizeEthereumTypeOptions'

// m08-01-04: v1 non-EVM simple sign wrappers (8개 — pass-through 패턴)
export {
  getBitcoinSignedTransaction,
  getXrpSignedTransaction,
  getHederaSignedTransaction,
  getHederaSignedMessage,
  getStellarSignedTransaction,
  getTronSignedTransaction,
  getSignedMessage,
  getSignedData,
} from './nonEvmSimple'
export type {
  XrpTxObject,
  HederaTxParams,
  HederaMsgParams,
  StellarTxParams,
  TronTxParams,
} from './nonEvmSimple'
