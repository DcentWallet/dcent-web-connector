/**
 * v2 Bitcoin transaction builder (m09-04-15)
 *
 * `getBitcoinTransactionObject` / `addBitcoinTransactionInput` / `addBitcoinTransactionOutput`는
 * wm v2 wire가 기대하는 **flat `BitcoinWireTransaction`**(`{ inputs[], outputs[] }`)을 직접 누적한다.
 * App은 별도 변환 없이 builder 산출물을 그대로 송신한다:
 *
 *   const tx = dcent.getBitcoinTransactionObject()
 *   dcent.addBitcoinTransactionInput(tx, prevTxHex, utxoIdx, 'p2wpkh', keyPath)
 *   dcent.addBitcoinTransactionOutput(tx, 'p2wpkh', '200000', toAddress)
 *   await dcent.sign({ method: 'signTransaction', chainId: 'bip122:.../slip44:0', payload: { keyPath, transaction: tx } })
 *
 * (m09-04-15 이전에는 builder가 v1 nested envelope를 만들고 `bitcoinTxToWire`로 변환했으나,
 *  bridge sdk가 v2에서 flat wire를 기대하므로 obsolete nested를 거치지 않고 builder가 flat을 직접 생성.
 *  `sign.ts`/`_call`은 chain-agnostic 유지 — 변환/검증은 builder surface 안에서만.)
 *
 * **flat wire shape (wm 계약 — README-bitcoin-wire.md §2 / wire-convert.ts)**:
 *   - inputs[].{ rawTransaction, index, txType, keyPath, sequence? }
 *   - outputs[].{ txType, amount(satoshi string), addresses[] }
 *
 * 룰 준수:
 *   - boundary-validation / dapp-input-sanitization: 각 add 시점에 필드 type/값 검증 (fail-fast).
 *     unsupported txType(p2pk/multisig/p2tr) / 비-satoshi amount / malformed 인자 → param_error throw.
 *   - error-handling-consistency: 검증 실패는 모두 dcentException('param_error') (v2 builder는 coinType 미사용 — m09-04-15).
 *   - mutation-isolation (T-MUT-TX-01/02): getBitcoinTransactionObject는 매 호출마다 새 객체 반환.
 *     add*는 명시적 in-place mutation (v1 1:1 chaining) — 두 별도 호출 결과는 서로 독립.
 *   - connector-chain-addition-isolation: bitcoin 전용 builder surface 안에서만 동작. sign.ts/_call 미터치.
 *   - 출력 구성 검증(non-change dest 1개 + change ≤1) / hex·BIP32 format은 wm convertWireTransaction 위임(R9).
 */

import { dcentException } from '../v1/dcent-exception'

/** wm BITCOIN family wire txType (wm wire-convert.ts:37 VALID_TX_TYPES). p2tr/p2pk/multisig 의도적 제외. */
export type BitcoinWireTxType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh'

/** flat wire input — wm `BitcoinWireInput` 1:1. */
export interface BitcoinWireInput {
  /** 이전 tx raw hex. */
  rawTransaction: string
  /** prevout index (0-origin, non-neg integer). */
  index: number
  /** script type. */
  txType: BitcoinWireTxType
  /** BIP32 signing path. */
  keyPath: string
  /** (선택) nSequence/RBF. builder는 미설정. */
  sequence?: number
}

/** flat wire output — wm `BitcoinWireOutput` 1:1. */
export interface BitcoinWireOutput {
  /** script type 또는 'change'. */
  txType: BitcoinWireTxType | 'change'
  /** Satoshi 단위 금액 문자열. */
  amount: string
  /** 수신 주소 배열 (builder는 단일 `to` → `[to]`). */
  addresses: string[]
}

/** flat wire transaction — wm `BitcoinWireTransaction` 1:1. builder 누적 대상. */
export interface BitcoinWireTransaction {
  inputs: BitcoinWireInput[]
  outputs: BitcoinWireOutput[]
  /** (선택) auto-fetch 경량 payload용 계정 레벨 keyPath. builder 경로에서는 미설정. */
  keyPath?: string
}

// wm wire-convert.ts:37 VALID_TX_TYPES와 1:1. p2pk/multisig/p2tr은 wm가 거부하므로 add 시점에 reject.
const WIRE_INPUT_TX_TYPES: readonly string[] = ['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh']
const WIRE_OUTPUT_TX_TYPES: readonly string[] = ['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'change']

/** satoshi 값 검증 — number는 safe integer(≥0), string은 canonical 10진 정수 문자열. */
function isValidSatoshi (value: unknown): boolean {
  return (
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ||
    (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value))
  )
}

/**
 * add* 진입 시 transaction 컨테이너가 유효한 flat wire 객체인지 검증 (boundary-validation).
 * null / 비객체 / inputs·outputs 비배열(예: pre-migration v1 nested 객체)이면 raw TypeError 대신
 * dcentException('param_error') throw — breaking 마이그레이션 경계에서 명확한 에러 보장.
 */
function assertWireTxContainer (transaction: unknown, fn: string): asserts transaction is BitcoinWireTransaction {
  const t = transaction as { inputs?: unknown; outputs?: unknown } | null
  if (!t || typeof t !== 'object' || !Array.isArray(t.inputs) || !Array.isArray(t.outputs)) {
    throw dcentException(
      'param_error',
      `${fn}: transaction must be a BitcoinWireTransaction (call getBitcoinTransactionObject first)`,
    )
  }
}

/**
 * 빈 v2 flat wire transaction을 생성한다 (builder 시작점).
 *
 * 코인 식별자는 wire에 싣지 않는다 — 실제 코인은 `dcent.sign` 호출 시 chainId(CAIP-19)가 결정한다.
 * v1의 `coinType` 인자는 v2에서 검증-후-폐기(vestigial)였고 chainId 라우팅과 비일관 + 불일치 footgun을
 * 야기하므로 제거했다 (m09-04-15 RE-AUDIT 2026-06-15). 코인 호환성 검증은 sign 시점 chainId가 담당.
 *
 * @returns 빈 inputs/outputs를 가진 BitcoinWireTransaction (매 호출 새 객체 — mutation-isolation)
 */
export function getBitcoinTransactionObject (): BitcoinWireTransaction {
  return { inputs: [], outputs: [] }
}

/**
 * UTXO input을 flat wire에 push한다 (in-place mutation, v1 1:1 chaining).
 *
 * @param transaction `getBitcoinTransactionObject` 산출물
 * @param prevTx 이전 tx raw hex (wire `rawTransaction`)
 * @param utxoIdx prevout index (wire `index`, non-neg integer)
 * @param type p2pkh/p2sh/p2wpkh/p2wsh (wire `txType`)
 * @param key BIP32 signing path (wire `keyPath`)
 * @returns 같은 transaction 객체 (chaining)
 * @throws dcentException('param_error') malformed 인자 / unsupported txType
 */
export function addBitcoinTransactionInput (
  transaction: BitcoinWireTransaction,
  prevTx: string,
  utxoIdx: number,
  type: string,
  key: string,
): BitcoinWireTransaction {
  assertWireTxContainer(transaction, 'addBitcoinTransactionInput')
  if (typeof prevTx !== 'string') {
    throw dcentException('param_error', 'addBitcoinTransactionInput: prevTx must be a string')
  }
  if (typeof utxoIdx !== 'number' || !Number.isInteger(utxoIdx) || utxoIdx < 0) {
    throw dcentException('param_error', 'addBitcoinTransactionInput: utxoIdx must be a non-negative integer')
  }
  if (typeof type !== 'string' || !WIRE_INPUT_TX_TYPES.includes(type)) {
    throw dcentException(
      'param_error',
      `addBitcoinTransactionInput: unsupported type '${String(type)}' (expected one of ${WIRE_INPUT_TX_TYPES.join('/')})`,
    )
  }
  if (typeof key !== 'string' || key.length === 0) {
    throw dcentException('param_error', 'addBitcoinTransactionInput: key must be a non-empty string')
  }
  transaction.inputs.push({
    rawTransaction: prevTx,
    index: utxoIdx,
    txType: type as BitcoinWireTxType,
    keyPath: key,
  })
  return transaction
}

/**
 * output을 flat wire에 push한다 (in-place mutation, v1 1:1 chaining).
 *
 * @param transaction `getBitcoinTransactionObject` 산출물
 * @param type p2pkh/p2sh/p2wpkh/p2wsh 또는 'change' (wire `txType`)
 * @param value satoshi 금액 — number(safe int ≥0) 또는 canonical 10진 문자열 (wire `amount`로 String화, 단위 변환 없음)
 * @param to 수신 주소 (wire `addresses: [to]`)
 * @returns 같은 transaction 객체 (chaining)
 * @throws dcentException('param_error') malformed 인자 / unsupported txType / 비-satoshi value
 */
export function addBitcoinTransactionOutput (
  transaction: BitcoinWireTransaction,
  type: string,
  value: number | string,
  to: string,
): BitcoinWireTransaction {
  assertWireTxContainer(transaction, 'addBitcoinTransactionOutput')
  if (typeof type !== 'string' || !WIRE_OUTPUT_TX_TYPES.includes(type)) {
    throw dcentException(
      'param_error',
      `addBitcoinTransactionOutput: unsupported type '${String(type)}' (expected one of ${WIRE_OUTPUT_TX_TYPES.join('/')})`,
    )
  }
  if (!isValidSatoshi(value)) {
    throw dcentException(
      'param_error',
      'addBitcoinTransactionOutput: value must be a non-negative integer satoshi (number or canonical decimal string)',
    )
  }
  if (typeof to !== 'string' || to.length === 0) {
    throw dcentException('param_error', 'addBitcoinTransactionOutput: to must be a non-empty string')
  }
  transaction.outputs.push({
    txType: type as BitcoinWireTxType | 'change',
    // satoshi 계약 — 단위 변환 없이 문자열화만.
    amount: String(value),
    addresses: [to],
  })
  return transaction
}
