/**
 * v2 facade — xrpTxType enum (m08-01-01)
 *
 * v1 src-v1/type/dcent-web-type.js의 xrpTxType과 키·값 1:1 일치.
 */
export const xrpTxType = Object.freeze({
  AccountSet: 'AccountSet',
  AccountDelete: 'AccountDelete',
  CheckCancel: 'CheckCancel',
  CheckCash: 'CheckCash',
  CheckCreate: 'CheckCreate',
  DepositPreauth: 'DepositPreauth',
  EscrowCancel: 'EscrowCancel',
  EscrowCreate: 'EscrowCreate',
  EscrowFinish: 'EscrowFinish',
  OfferCancel: 'OfferCancel',
  OfferCreate: 'OfferCreate',
  Payment: 'Payment',
  PaymentChannelClaim: 'PaymentChannelClaim',
  PaymentChannelCreate: 'PaymentChannelCreate',
  PaymentChannelFund: 'PaymentChannelFund',
  SetRegularKey: 'SetRegularKey',
  SignerListSet: 'SignerListSet',
  TrustSet: 'TrustSet',
} as const)

export type XrpTxType = keyof typeof xrpTxType
export type XrpTxTypeValue = typeof xrpTxType[XrpTxType]
