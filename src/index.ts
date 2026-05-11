// v2 public API entry point (m08-01-01 — facade layer)
//
// 본 child가 추가하는 것:
//   - default export object (`import dcent from 'dcent-web-connector'` 패턴 — v1 호환)
//   - new named exports: lifecycle (setTimeOutMs / setConnectionListener / popupWindowClose) +
//     enums (coinType / coinGroup / coinName / bitcoinTxType / klaytnTxType / xrpTxType / state) +
//     unitConverter
//   - 기존 named exports (transport / queue / error)는 그대로 유지
//
// 후속 child(m08-01-02 등)가 sign / read-only API를 default export object에 추가할 예정.
// package.json `main`은 m08-01-05까지 src-v1/index.js를 가리키므로, 본 child가 머지되어도
// npm published 패키지의 진입점은 v1. dApp 영향 없음.

import * as lifecycle from './lifecycle'
import {
  coinType,
  coinGroup,
  coinName,
  bitcoinTxType,
  klaytnTxType,
  xrpTxType,
  state,
  // m08-01-04.5
  coinDecimals,
} from './types'
import { unitConverter } from './utils/unitConverter'
import {
  sign,
  // m08-01-02.5: read-only / configure / Bitcoin tx-builder
  info,
  getDeviceInfo,
  getAccountInfo,
  getAddress,
  getXPUB,
  setLabel,
  syncAccount,
  selectAddress,
  getBitcoinTransactionObject,
  addBitcoinTransactionInput,
  addBitcoinTransactionOutput,
  // m08-01-02.5: v1 validator helpers (export 표면 보존 — v1 typo 포함)
  isAvaliableCoinType,
  isCzoneCoinType,
  isParachainCoinType,
  isBitcoinTxCoinType,
  isTokenType,
  getCzonePrifix,
  isAvaliableLabel,
  isAvaliableCoinGroup,
  isAvailableSyncAccountCoinName,
  // m08-01-03: v1 EVM sign wrappers + checkParameter helper
  getEthereumSignedTransaction,
  getEthereumSignedMessage,
  getTokenSignedTransaction,
  getKlaytnSignedTransaction,
  checkParameter,
  _sanitizeEthereumTypeOptions,
  // m08-01-04: v1 non-EVM simple sign wrappers (8개)
  getBitcoinSignedTransaction,
  getXrpSignedTransaction,
  getHederaSignedTransaction,
  getHederaSignedMessage,
  getStellarSignedTransaction,
  getTronSignedTransaction,
  getSignedMessage,
  getSignedData,
  // m08-01-04.5: v1 non-EVM complex sign wrappers (9개) + Cosmos czone helper
  getTrcTokenSignedTransaction,
  getTezosSignedTransaction,
  getVechainSignedTransaction,
  getNearSignedTransaction,
  getHavahSignedTransaction,
  getPolkadotSignedTransaction,
  getCosmosSignedTransaction,
  getAlgorandSignedTransaction,
  getParachainSignedTransaction,
  getCzonDecimal,
} from './sign'

// === 기존 named exports (m02-01·m02-02·m07-02 SHIPPED) ===
export type {
  MessageEnvelope,
  ResponseEnvelope,
  MessageTransport,
  TransportState,
} from './transport/MessageTransport'
export { PopupTransport } from './transport/PopupTransport'

export type { RequestQueue } from './queue/RequestQueue'
export { SerialRequestQueue } from './queue/RequestQueue'

export { ErrorCode } from './error/ErrorCode'
export { ProviderError } from './error/ProviderError'

// === 새 named exports (m08-01-01) ===
export { setTimeOutMs, setConnectionListener, popupWindowClose } from './lifecycle'
export type { ConnectionListener } from './lifecycle'

export {
  coinType,
  coinGroup,
  coinName,
  bitcoinTxType,
  klaytnTxType,
  xrpTxType,
  state,
  // m08-01-04.5
  coinDecimals,
} from './types'
export type {
  CoinType,
  CoinTypeValue,
  CoinGroup,
  CoinGroupValue,
  CoinName,
  CoinNameValue,
  BitcoinTxType,
  BitcoinTxTypeValue,
  KlaytnTxType,
  KlaytnTxTypeValue,
  XrpTxType,
  XrpTxTypeValue,
  State,
  StateValue,
  // m08-01-04.5
  CoinDecimals,
  CoinDecimalsKey,
  CoinDecimalsValue,
} from './types'

export { unitConverter } from './utils/unitConverter'
export type { UnitConvertResult } from './utils/unitConverter'

// === 새 named exports (m08-01-02 — sign / V1 호환) ===
export { sign } from './sign'
export type { SignInput, V1Response, V1ResponseHeader, V1ResponseBody } from './sign'
// internal helpers (sibling module이 사용 — m08-01-03/04 wrapper가 import)
export { _call, _genId, _sanitizeChain, _assertV1Success, providerErrorToV1, chainToMethod } from './sign'
export type { CallInput } from './sign'

// === 새 named exports (m08-01-02.5 — read-only / configure / Bitcoin tx-builder + v1 validators) ===
export {
  info,
  getDeviceInfo,
  getAccountInfo,
  getAddress,
  getXPUB,
  setLabel,
  syncAccount,
  selectAddress,
  getBitcoinTransactionObject,
  addBitcoinTransactionInput,
  addBitcoinTransactionOutput,
} from './sign'
export type { SyncAccountInfo, BitcoinTxObject, BitcoinTxParameter } from './sign'
// v1 validator helpers — dApp 표면 1:1 보존 (v1 typo `getCzonePrifix` 포함)
export {
  isAvaliableCoinType,
  isCzoneCoinType,
  isParachainCoinType,
  isBitcoinTxCoinType,
  isTokenType,
  getCzonePrifix,
  isAvaliableLabel,
  isAvaliableCoinGroup,
  isAvailableSyncAccountCoinName,
} from './sign'

// === 새 named exports (m08-01-03 — v1 EVM sign wrappers + checkParameter helper) ===
export {
  getEthereumSignedTransaction,
  getEthereumSignedMessage,
  getTokenSignedTransaction,
  getKlaytnSignedTransaction,
  checkParameter,
  _sanitizeEthereumTypeOptions,
} from './sign'
export type { EvmTokenContract, KlaytnContract, EthereumTypeOptions } from './sign'

// === 새 named exports (m08-01-04 — v1 non-EVM simple sign wrappers) ===
export {
  getBitcoinSignedTransaction,
  getXrpSignedTransaction,
  getHederaSignedTransaction,
  getHederaSignedMessage,
  getStellarSignedTransaction,
  getTronSignedTransaction,
  getSignedMessage,
  getSignedData,
} from './sign'
export type {
  XrpTxObject,
  HederaTxParams,
  HederaMsgParams,
  StellarTxParams,
  TronTxParams,
} from './sign'

// === 새 named exports (m08-01-04.5 — v1 non-EVM complex sign wrappers + Cosmos czone helper) ===
export {
  getTrcTokenSignedTransaction,
  getTezosSignedTransaction,
  getVechainSignedTransaction,
  getNearSignedTransaction,
  getHavahSignedTransaction,
  getPolkadotSignedTransaction,
  getCosmosSignedTransaction,
  getAlgorandSignedTransaction,
  getParachainSignedTransaction,
  getCzonDecimal,
} from './sign'

// === default export object (v1 호환 패턴) ===
//
// dApp이 `import dcent from 'dcent-web-connector'` 또는 `const dcent = require(...)`로
// 받았을 때 v1과 동등한 멤버 접근 (`dcent.coinType`, `dcent.setTimeOutMs(...)`)이 가능.
//
// 후속 child(m08-01-02 등)가 sign / read-only / configure 메서드를 이 객체에 추가한다.
const dcent = {
  // lifecycle
  setTimeOutMs: lifecycle.setTimeOutMs,
  setConnectionListener: lifecycle.setConnectionListener,
  popupWindowClose: lifecycle.popupWindowClose,
  // enums
  coinType,
  coinGroup,
  coinName,
  bitcoinTxType,
  klaytnTxType,
  xrpTxType,
  state,
  // m08-01-04.5: coinDecimals enum (v1 deferred port)
  coinDecimals,
  // utils
  unitConverter,
  // sign (m08-01-02)
  sign,
  // m08-01-02.5: read-only / configure / Bitcoin tx-builder
  info,
  getDeviceInfo,
  getAccountInfo,
  getAddress,
  getXPUB,
  setLabel,
  syncAccount,
  selectAddress,
  getBitcoinTransactionObject,
  addBitcoinTransactionInput,
  addBitcoinTransactionOutput,
  // m08-01-02.5: v1 validator helpers (dApp 표면 1:1 보존 — v1 typo 포함)
  isAvaliableCoinType,
  isCzoneCoinType,
  isParachainCoinType,
  isBitcoinTxCoinType,
  isTokenType,
  getCzonePrifix,
  isAvaliableLabel,
  isAvaliableCoinGroup,
  isAvailableSyncAccountCoinName,
  // m08-01-03: v1 EVM sign wrappers + checkParameter helper
  getEthereumSignedTransaction,
  getEthereumSignedMessage,
  getTokenSignedTransaction,
  getKlaytnSignedTransaction,
  checkParameter,
  _sanitizeEthereumTypeOptions,
  // m08-01-04: v1 non-EVM simple sign wrappers (8개)
  getBitcoinSignedTransaction,
  getXrpSignedTransaction,
  getHederaSignedTransaction,
  getHederaSignedMessage,
  getStellarSignedTransaction,
  getTronSignedTransaction,
  getSignedMessage,
  getSignedData,
  // m08-01-04.5: v1 non-EVM complex sign wrappers (9개) + Cosmos czone helper
  getTrcTokenSignedTransaction,
  getTezosSignedTransaction,
  getVechainSignedTransaction,
  getNearSignedTransaction,
  getHavahSignedTransaction,
  getPolkadotSignedTransaction,
  getCosmosSignedTransaction,
  getAlgorandSignedTransaction,
  getParachainSignedTransaction,
  getCzonDecimal,
} as const

export default dcent
