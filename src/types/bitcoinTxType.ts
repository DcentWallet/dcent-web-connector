/**
 * v2 facade — bitcoinTxType enum (m08-01-01)
 *
 * v1 src-v1/type/dcent-web-type.js의 bitcoinTxType과 키·값 1:1 일치.
 */
export const bitcoinTxType = Object.freeze({
  change: 'change',
  p2pk: 'p2pk',
  p2pkh: 'p2pkh',
  p2sh: 'p2sh',
  multisig: 'multisig',
  p2wpkh: 'p2wpkh',
  p2wsh: 'p2wsh',
} as const)

export type BitcoinTxType = keyof typeof bitcoinTxType
export type BitcoinTxTypeValue = typeof bitcoinTxType[BitcoinTxType]
