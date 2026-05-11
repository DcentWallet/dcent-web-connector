/**
 * v2 facade — type/enum barrel export (m08-01-01)
 *
 * 7개 enum + 각 type alias를 한 곳에 모아서 src/index.ts에서 spread import 가능하게 한다.
 * v1 src-v1/type/* 의 module.exports와 동일한 키 (`coinType`, `coinGroup`, ...)로 노출.
 */

export { coinType, type CoinType, type CoinTypeValue } from './coinType'
export { coinGroup, type CoinGroup, type CoinGroupValue } from './coinGroup'
export { coinName, type CoinName, type CoinNameValue } from './coinName'
export { bitcoinTxType, type BitcoinTxType, type BitcoinTxTypeValue } from './bitcoinTxType'
export { klaytnTxType, type KlaytnTxType, type KlaytnTxTypeValue } from './klaytnTxType'
export { xrpTxType, type XrpTxType, type XrpTxTypeValue } from './xrpTxType'
export { state, type State, type StateValue } from './state'
// m08-01-04.5: coinDecimals enum (v1 src-v1/type/dcent-web-type.js#l242-251 deferred port)
export { coinDecimals, type CoinDecimals, type CoinDecimalsKey, type CoinDecimalsValue } from './coinDecimals'
