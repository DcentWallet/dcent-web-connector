/**
 * v1 EVM sign wrappers — module-level functions (m08-01-03)
 *
 * v1 src-v1/index.js의 4개 EVM sign 함수를 v2 facade에 1:1 호환 port:
 *   - getEthereumSignedTransaction (l961~l1032)
 *   - getEthereumSignedMessage (l1110~l1118)
 *   - getTokenSignedTransaction (l1046~l1101)
 *   - getKlaytnSignedTransaction (l1136~l1210)
 *
 * 핵심 동작:
 *   - 인자 검증 v1 1:1 (`Invaild` 오타, `txType !== 2일 때만 gasPrice 검증` 등)
 *   - bridge sdk 호환을 위한 snake_case params keys (`gas_price`, `gas_limit`, `chain_id`, `tx_type`, `type_options`, `fee_ratio`)
 *     → camelCase로 보내면 silent fail. T-DRIFT-EVM-01이 강제.
 *   - txType !== 0 → method 이름이 `getEthereumSignedTypedTransaction`로 변경 (EIP-2930/EIP-1559)
 *   - Klaytn `from` 미제공 시 `getAddress(coinType, key)` 자동 호출 (m08-01-02.5 의존)
 *   - Klaytn coinType 정규화 (KLAY_BAOBAB→KLAYTN, KCT_BAOBAB→KLAYTN_KCT)
 *   - XDC prefix 변환 (xdc → 0x)
 *   - typeOptions sanitize (`provider-security-checklist` C3)
 *
 * 룰 준수:
 *   - boundary-validation: 모든 인자 검증 (`checkParameter` + chainId/txType/decimals 타입 체크)
 *   - error-handling-consistency: 검증 실패는 throw, popup/network 에러는 _call이 v1 호환 응답으로 변환
 *   - mutation-isolation: _call이 매 호출마다 새 V1Response 객체 반환
 *   - dapp-input-sanitization: typeOptions whitelist (`_sanitizeEthereumTypeOptions`)
 *   - provider-security-checklist C3: typeOptions options whitelist
 *   - cross-repo-interface-edit: bridge sdk가 알아야 하는 method 이름 + snake_case params shape 보존
 *   - reuse-shared-utils: `_call`, `getAddress`, `dcentException`, `XDCPrefixConverter`, `coinType`/`klaytnTxType` enum 모두 재사용
 *   - external-reference-edge-cases: drift defense T-DRIFT-EVM-01이 v1 wrapper와 bytewise 동등 단언
 */

/* eslint-disable camelcase */

import { _call } from './call'
import { checkParameter } from './checkParameter'
import { _sanitizeEthereumTypeOptions, type EthereumTypeOptions } from './_sanitizeEthereumTypeOptions'
import { getAddress } from './address'
import { dcentException } from '../v1/dcent-exception'
import { coinType as dcentCoinType } from '../types/coinType'
import { klaytnTxType as dcentKlaytnTxType } from '../types/klaytnTxType'
import { XDCPrefixConverter } from '../utils/xdc-prefix-converter'
import type { V1Response } from './types'

/** EVM 기본 wrapper의 기대 contract shape (token wrapper용). */
export interface EvmTokenContract {
  address: string
  symbol: string
  decimals: number | string
  value: string
  to: string
}

/** Klaytn KCT용 contract shape (선택적). */
export interface KlaytnContract {
  address?: string
  symbol?: string
  decimals?: number | string
  value?: string
  to?: string
  [key: string]: unknown
}

/**
 * v1 dcent.getEthereumSignedTransaction (src-v1/index.js#l961-l1032) 1:1 port.
 *
 * 동작:
 *   1. chainId/txType 타입 검증 → 위반 시 `dcentException('param_error', 'Invaild Parameter')` throw
 *   2. nonce/gasPrice(txType !== 2)/gasLimit/value 모두 `checkParameter('numberString', ...)` 검증
 *   3. coinType switch:
 *      - ETHEREUM/ETHEREUM_KOVAN/RSK/RSK_TESTNET → 그대로
 *      - XDC/XDC_APOTHEM → `to = XDCPrefixConverter(to)` (xdc → 0x)
 *      - 그 외 → `dcentException('coin_type_error', 'not supported coin type')` throw
 *   4. typeOptions sanitize (`_sanitizeEthereumTypeOptions`)
 *   5. snake_case params 구성 (bridge sdk wire format)
 *   6. txType !== 0 → method 이름을 `getEthereumSignedTypedTransaction`로 변경
 *   7. `_call({method, params})` 호출
 *
 * @returns V1Response (v1 호환 `{header, body}` shape)
 */
export async function getEthereumSignedTransaction (
  coinType: string,
  nonce: string,
  gasPrice: string,
  gasLimit: string,
  to: string,
  value: string,
  data: string,
  key: string,
  chainId: number,
  txType: number = 0,
  typeOptions: Record<string, unknown> = {}
): Promise<V1Response> {
  if (typeof chainId !== 'number' || typeof txType !== 'number' || txType < 0 || txType > 2) {
    throw dcentException('param_error', 'Invaild Parameter')
  }

  // v1과 동일하게 try/catch 구조 — 실제로는 throw를 그대로 propagate
  nonce = checkParameter('numberString', nonce)
  if (txType !== 2) {
    gasPrice = checkParameter('numberString', gasPrice)
  }
  gasLimit = checkParameter('numberString', gasLimit)
  value = checkParameter('numberString', value)

  switch (coinType.toLowerCase()) {
    case dcentCoinType.ETHEREUM.toLowerCase():
    case dcentCoinType.ETHEREUM_KOVAN.toLowerCase():
    case dcentCoinType.RSK.toLowerCase():
    case dcentCoinType.RSK_TESTNET.toLowerCase():
      break
    case dcentCoinType.XDC.toLowerCase():
    case dcentCoinType.XDC_APOTHEM.toLowerCase():
      to = XDCPrefixConverter(to)
      break
    default:
      throw dcentException('coin_type_error', 'not supported coin type')
  }

  // C3 sanitize — dApp 입력 객체의 unknown / prototype 키 차단
  const safeTypeOptions: EthereumTypeOptions = _sanitizeEthereumTypeOptions(typeOptions)

  // 🔴 snake_case params — bridge sdk wire format 호환의 핵심 (T-DRIFT-EVM-01)
  const params: Record<string, unknown> = {
    coinType: coinType,
    nonce: nonce,
    gas_price: gasPrice,
    gas_limit: gasLimit,
    to: to,
    value: value,
    data: data,
    key: key,
    chain_id: chainId,
    tx_type: txType,
    type_options: safeTypeOptions,
  }

  // txType !== 0 → method 이름 변경 (EIP-2930=1, EIP-1559=2)
  const method = txType === 0 ? 'getEthereumSignedTransaction' : 'getEthereumSignedTypedTransaction'

  return _call({ method, params })
}

/**
 * v1 dcent.getEthereumSignedMessage (src-v1/index.js#l1110-l1118) 1:1 port.
 *
 * personal_sign / signTypedData 류. 인자 검증 없음 (v1과 동일).
 *
 * @returns V1Response
 */
export async function getEthereumSignedMessage (
  message: string,
  key: string
): Promise<V1Response> {
  return _call({
    method: 'getEthereumSignedMessage',
    params: {
      message: message,
      key: key,
    },
  })
}

/**
 * v1 dcent.getTokenSignedTransaction (src-v1/index.js#l1046-l1101) 1:1 port.
 *
 * 동작:
 *   1. nonce/gasPrice/gasLimit/contract.value 모두 `checkParameter('numberString', ...)` 검증
 *   2. chainId/contract.decimals 타입 검증 → 위반 시 `dcentException('param_error', 'Invaild Parameter')` throw
 *   3. token switch:
 *      - ERC20/ERC20_KOVAN/RRC20/RRC20_TESTNET/KLAYTN_KCT/KCT_BAOBAB → 그대로
 *      - XRC20/XRC20_APOTHEM → contract.to + contract.address XDC prefix 변환
 *      - 그 외 → `dcentException('coin_type_error', 'not supported token type')` throw
 *   4. snake_case params로 `_call`
 *
 * @returns V1Response
 */
export async function getTokenSignedTransaction (
  token: string,
  nonce: string,
  gasPrice: string,
  gasLimit: string,
  key: string,
  chainId: number,
  contract: EvmTokenContract
): Promise<V1Response> {
  nonce = checkParameter('numberString', nonce)
  gasPrice = checkParameter('numberString', gasPrice)
  gasLimit = checkParameter('numberString', gasLimit)
  contract.value = checkParameter('numberString', contract.value)

  if (typeof chainId !== 'number' || typeof contract.decimals !== 'number') {
    throw dcentException('param_error', 'Invaild Parameter')
  }

  switch (token.toLowerCase()) {
    case dcentCoinType.ERC20.toLowerCase():
    case dcentCoinType.ERC20_KOVAN.toLowerCase():
    case dcentCoinType.RRC20.toLowerCase():
    case dcentCoinType.RRC20_TESTNET.toLowerCase():
    case dcentCoinType.KLAYTN_KCT.toLowerCase():
    case dcentCoinType.KCT_BAOBAB.toLowerCase():
      break
    case dcentCoinType.XRC20.toLowerCase():
    case dcentCoinType.XRC20_APOTHEM.toLowerCase():
      contract.to = XDCPrefixConverter(contract.to)
      contract.address = XDCPrefixConverter(contract.address)
      break
    default:
      throw dcentException('coin_type_error', 'not supported token type')
  }

  return _call({
    method: 'getTokenSignedTransaction',
    params: {
      token: token,
      nonce: nonce,
      gas_price: gasPrice,
      gas_limit: gasLimit,
      key: key,
      chain_id: chainId,
      contract: contract,
    },
  })
}

/**
 * v1 dcent.getKlaytnSignedTransaction (src-v1/index.js#l1136-l1210) 1:1 port.
 *
 * 동작:
 *   1. nonce/gasPrice/gasLimit/value 모두 `checkParameter('numberString', ...)` 검증
 *   2. contract 있으면 contract.decimals도 검증
 *   3. chainId 타입 검증 → 위반 시 `dcentException('param_error', 'Invaild Parameter chainId - {chainId}')` throw
 *   4. coinType switch:
 *      - KLAYTN/KLAY_BAOBAB → coinType = KLAYTN (정규화)
 *      - KLAYTN_KCT/KCT_BAOBAB → coinType = KLAYTN_KCT (정규화)
 *      - 그 외 → `dcentException('coin_type_error', 'not supported coin type')` throw
 *   5. txType falsy → `dcentKlaytnTxType.LEGACY` (0xff) fallback
 *   6. from falsy → `getAddress(coinType, key)` 자동 호출 후 `body.parameter.address` 채움 (fee delegation flow)
 *   7. snake_case params로 `_call`
 *
 * @returns V1Response
 */
export async function getKlaytnSignedTransaction (
  coinType: string,
  nonce: string,
  gasPrice: string,
  gasLimit: string,
  to: string,
  value: string,
  data: string,
  key: string,
  chainId: number,
  txType: number,
  from?: string,
  feeRatio?: string | number,
  contract?: KlaytnContract
): Promise<V1Response> {
  nonce = checkParameter('numberString', nonce)
  gasPrice = checkParameter('numberString', gasPrice)
  gasLimit = checkParameter('numberString', gasLimit)
  value = checkParameter('numberString', value)
  if (contract && contract.decimals !== undefined) {
    contract.decimals = checkParameter('numberString', contract.decimals)
  }

  if (typeof chainId !== 'number') {
    throw dcentException('param_error', 'Invaild Parameter chainId - ' + String(chainId))
  }

  switch (coinType.toLowerCase()) {
    case dcentCoinType.KLAYTN.toLowerCase():
    case dcentCoinType.KLAY_BAOBAB.toLowerCase():
      coinType = dcentCoinType.KLAYTN
      break
    case dcentCoinType.KLAYTN_KCT.toLowerCase():
    case dcentCoinType.KCT_BAOBAB.toLowerCase():
      coinType = dcentCoinType.KLAYTN_KCT
      break
    default:
      throw dcentException('coin_type_error', 'not supported coin type')
  }

  if (!txType) {
    txType = dcentKlaytnTxType.LEGACY
  }

  if (!from) {
    const addressResponse = await getAddress(coinType, key)
    const addressParam = addressResponse?.body?.parameter as { address?: string } | undefined
    if (addressParam && typeof addressParam.address === 'string') {
      from = addressParam.address
    }
  }

  return _call({
    method: 'getKlaytnSignedTransaction',
    params: {
      coinType: coinType,
      nonce: nonce,
      gas_price: gasPrice,
      gas_limit: gasLimit,
      to: to,
      value: value,
      data: data,
      key: key,
      chain_id: chainId,
      tx_type: txType,
      from: from,
      fee_ratio: feeRatio,
      contract: contract,
    },
  })
}
