// v2 public API entry point (m09-04-01 — v1 wrapper paths 제거 후 facade)
//
// 본 entry는 다음을 export한다:
//   - default export object (`import dcent from 'dcent-web-connector'` 패턴 — v1 호환)
//   - named exports: lifecycle / enums / unitConverter / sign / read-only / configure /
//     bitcoin tx builder / validator helpers
//
// m09-04-01 변경: v1 wrapper 21개(EVM 4 + non-EVM simple 8 + non-EVM complex 9) +
// chain → method 정적 매핑 + v1 전용 helper 3개(checkParameter / typeOptions sanitize /
// czon decimal lookup) 및 wrapper-only type 8개(EvmTokenContract / KlaytnContract /
// EthereumTypeOptions / XrpTxObject / HederaTxParams / HederaMsgParams /
// StellarTxParams / TronTxParams) 모두 제거. 단일 v2 wire `dcent.sign({chain, payload})`만
// 외부 dApp 진입점으로 남는다 (connector-chain-addition-isolation 룰의 비전).
//
// 보존: v1 enum (coinType / coinGroup / coinName / bitcoinTxType / klaytnTxType / xrpTxType /
// state / coinDecimals) + utility (unitConverter) + sign / read-only / configure / bitcoin tx
// builder / validator helpers 4개.

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
// internal helpers (sibling module이 사용)
export { _call, _genId, _sanitizeMethod, _sanitizeChainId, _assertV1Success, providerErrorToV1 } from './sign'
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
// m11-01-02: v2 chainId facade input type for getAddress overload
export type { GetAddressV2Input } from './sign'
// m09-04-09: addressFormat enum for BTC family multi-variant dispatch
export type { AddressFormat } from './sign'
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

// === default export object (v1 호환 패턴) ===
//
// dApp이 `import dcent from 'dcent-web-connector'` 또는 `const dcent = require(...)`로
// 받았을 때 v1과 동등한 멤버 접근 (`dcent.coinType`, `dcent.setTimeOutMs(...)`)이 가능.
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
} as const

export default dcent
