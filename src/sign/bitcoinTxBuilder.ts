/**
 * v1 Bitcoin transaction builder port (m08-01-02.5)
 *
 * v1 src-v1/index.js의 `dcent.getBitcoinTransactionObject` (l837-859),
 * `dcent.addBitcoinTransactionInput` (l873-893), `dcent.addBitcoinTransactionOutput` (l904-921)를
 * 1:1 port한다.
 *
 * **v1 nested envelope 1:1 보존**:
 *   - `request.header.{version, request_to}` (snake_case)
 *   - `request.body.{command, parameter}`
 *   - `parameter.input[].{prev_tx, utxo_idx, type, key}` (snake_case)
 *   - `parameter.output[].{type, value, to}`
 *
 * Bridge sdk가 이 nested envelope을 wire format으로 기대하므로, schema 변경 시 silent fail.
 * dApp의 v2 sign API(`dcent.sign({chain: 'bip122:...', payload})`)가 본 schema를 그대로 bridge로 송신.
 *
 * 룰 준수:
 *   - boundary-validation: coinType 검증 (`isBitcoinTxCoinType`)
 *   - error-handling-consistency: 검증 실패 시 dcentException throw
 *   - mutation-isolation (T-MUT-TX-01/02): `getBitcoinTransactionObject`는 매 호출마다 새 객체 반환.
 *     `addBitcoinTransactionInput/Output`은 명시적으로 in-place mutation (v1 1:1) — 호출자가 같은
 *     객체를 여러 번 push 가능. 두 개의 별도 호출 결과는 서로 독립.
 *   - cross-repo-interface-edit: BitcoinTxObject schema는 bridge sdk와의 wire format 계약. 변경 금지.
 */

import { isBitcoinTxCoinType } from './coinTypeValidators'
import { dcentException } from '../v1/dcent-exception'

/* eslint-disable camelcase */
/** Bitcoin tx parameter — v1 wire format snake_case 보존. */
export interface BitcoinTxParameter {
  version: number
  locktime: number
  input?: Array<{
    prev_tx: string
    utxo_idx: number
    type: string
    key: string
  }>
  output?: Array<{
    type: string
    value: number | string
    to: string
  }>
}

/** Bitcoin tx envelope — v1 nested shape 1:1. */
export interface BitcoinTxObject {
  request: {
    header: {
      version: string
      request_to: string
    }
    body: {
      command: string
      parameter: BitcoinTxParameter
    }
  }
}
/* eslint-enable camelcase */

/**
 * v1 dcent.getBitcoinTransactionObject (src-v1/index.js#l837-859) 1:1 port.
 *
 * Bitcoin tx 빌드용 nested envelope 생성. 매 호출마다 새 객체 (mutation-isolation).
 *
 * @param coinType BITCOIN/BITCOIN_TESTNET/MONACOIN/MONACOIN_TESTNET 중 하나
 * @returns 비어 있는 input/output을 가진 BitcoinTxObject
 * @throws dcentException('coin_type_error') Bitcoin tx 호환 coinType이 아닌 경우
 */
export function getBitcoinTransactionObject (coinType: string): BitcoinTxObject {
  if (!isBitcoinTxCoinType(coinType)) {
    throw dcentException('coin_type_error', 'not supported coin type')
  }

  // v1과 동일한 초기화 — request.header / request.body.parameter
  const txObject: BitcoinTxObject = {
    request: {
      header: {
        version: '1.0',
        request_to: '',
      },
      body: {
        command: '',
        parameter: { version: 1, locktime: 0 },
      },
    },
  }
  txObject.request.header.request_to = coinType
  txObject.request.body.command = 'transaction'
  // v1은 parameter를 한 번 더 reset 후 version/locktime을 채우지만, 위 초기화로 동일 효과.
  return txObject
}

/**
 * v1 dcent.addBitcoinTransactionInput (src-v1/index.js#l873-893) 1:1 port.
 *
 * 이전 tx output 정보를 input 배열에 push (in-place mutation, v1 1:1).
 * Max number of "input" is 50 (디바이스 제약 — wire 검증은 bridge sdk 책임).
 *
 * **snake_case keys (v1 wire format 1:1)**: `prev_tx` / `utxo_idx`. Drift 시 bridge sdk가
 * 인식하지 못해 invalid signature.
 *
 * @param transaction `getBitcoinTransactionObject`가 반환한 객체
 * @param prevTx 이전 transaction의 raw hex 데이터 (signing source)
 * @param utxoIdx prev_tx 안의 output index
 * @param type p2pkh / p2pk / p2sh
 * @param key signing 용 BIP44 key path
 * @returns 같은 transaction 객체 (mutation 후 반환 — chaining 가능)
 */
export function addBitcoinTransactionInput (
  transaction: BitcoinTxObject,
  prevTx: string,
  utxoIdx: number,
  type: string,
  key: string,
): BitcoinTxObject {
  const parameter = transaction.request.body.parameter
  parameter.input = parameter.input || []
  parameter.input.push({
    prev_tx: prevTx, // eslint-disable-line camelcase
    utxo_idx: utxoIdx, // eslint-disable-line camelcase
    type,
    key,
  })
  return transaction
}

/**
 * v1 dcent.addBitcoinTransactionOutput (src-v1/index.js#l904-921) 1:1 port.
 *
 * Spending 정보를 output 배열에 push (in-place mutation, v1 1:1).
 * Max number of "output" is 10.
 *
 * @param transaction `getBitcoinTransactionObject`가 반환한 객체
 * @param type p2pkh / p2pk / p2sh / change
 * @param value 보낼 coin amount
 * @param to 받는 사람 주소
 * @returns 같은 transaction 객체
 */
export function addBitcoinTransactionOutput (
  transaction: BitcoinTxObject,
  type: string,
  value: number | string,
  to: string,
): BitcoinTxObject {
  const parameter = transaction.request.body.parameter
  parameter.output = parameter.output || []
  parameter.output.push({ type, value, to })
  return transaction
}
