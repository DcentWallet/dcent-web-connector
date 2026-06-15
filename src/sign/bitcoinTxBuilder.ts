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

// ───────────────────────────────────────────────────────────────────────────
// m09-04-15: v1 nested envelope → wm v2 flat wire 변환 (`bitcoinTxToWire`)
//
// builder 3함수(`getBitcoinTransactionObject`/`addBitcoinTransactionInput`/
// `addBitcoinTransactionOutput`)는 v1 `request.body.parameter.input[]/output[]`
// (snake_case) nested envelope를 만든다. 그러나 wm v2 wire(`signTransactionFromWire`의
// BITCOIN family `convertWireTransaction`)는 flat `{ inputs[], outputs[] }` shape를
// 기대한다 (wm README-bitcoin-wire.md §2). 두 shape가 달라 builder 산출물을 그대로
// `dcent.sign(...)` payload.transaction에 실으면 wm가 `outputs.length === 0`으로 보고
// `-32602 'must have at least 1 output'`로 거부한다.
//
// `bitcoinTxToWire`는 이 nested envelope를 flat wire로 변환하는 **호출부 opt-in** 함수다.
// connector의 `sign.ts`/`_call`은 chain-agnostic을 유지(미수정)하고, bitcoin 전용 변환은
// 이 builder surface 안에서만 일어난다 (`connector-chain-addition-isolation` 글로브 미터치).
// ───────────────────────────────────────────────────────────────────────────

/** wm BITCOIN family wire txType (wm README-bitcoin-wire.md §2). p2tr/p2pk/multisig 의도적 제외. */
export type BitcoinWireTxType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh'

/** flat wire input — wm `BitcoinWireInput` 1:1 (snake_case 아님 — wm 계약). */
export interface BitcoinWireInput {
  /** 이전 tx raw hex. v1 `prev_tx` 대응. */
  rawTransaction: string
  /** prevout index (0-origin, non-neg integer). v1 `utxo_idx` 대응. */
  index: number
  /** script type. v1 `type` 대응. */
  txType: BitcoinWireTxType
  /** BIP32 signing path. v1 `key` 대응. */
  keyPath: string
  /** (선택) nSequence/RBF. v1 미노출 → 항상 생략. */
  sequence?: number
}

/** flat wire output — wm `BitcoinWireOutput` 1:1. */
export interface BitcoinWireOutput {
  /** script type 또는 'change'. v1 `type` 대응. */
  txType: BitcoinWireTxType | 'change'
  /** Satoshi 단위 금액 문자열. v1 `value` 대응 (단위 변환 없음 — satoshi 계약). */
  amount: string
  /** 수신 주소 배열. v1 `to`(단일) → `[to]`. */
  addresses: string[]
}

/** flat wire transaction — wm `BitcoinWireTransaction` 1:1. */
export interface BitcoinWireTransaction {
  inputs: BitcoinWireInput[]
  outputs: BitcoinWireOutput[]
  /** (선택) auto-fetch 경량 payload용 계정 레벨 keyPath. 명시 inputs 경로에서는 무시됨. */
  keyPath?: string
}

// wm `wire-convert.ts:37` VALID_TX_TYPES와 1:1. p2pk/multisig/p2tr은 wm가 거부하므로
// 변환 단계에서 conservative reject(명확한 throw — silent 매핑 금지, error-handling-consistency).
const WIRE_INPUT_TX_TYPES: readonly string[] = ['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh']
const WIRE_OUTPUT_TX_TYPES: readonly string[] = ['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'change']

/**
 * satoshi 값 검증 — number는 safe integer(≥0), string은 canonical 10진 정수 문자열.
 * `1.5`/`-1`/`'1.5'`/`'abc'`/공백/대형(1e21) 등 비-satoshi 값을 거부한다.
 */
function isValidSatoshi (value: unknown): boolean {
  return (
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ||
    (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value))
  )
}

// 이미 flat인 wire의 필드 검증 (wm `BitcoinWireTransaction` 계약). nested 변환과 flat pass-through
// 모두 dApp이 구성할 수 있는 untrusted 입력이므로 동일 shape 계약을 강제한다 (cross-review r3).
// hex/BIP32 regex 같은 format 검증은 wm `convertWireTransaction` 책임(R9) — 여기서는 shape(타입)만.
function assertFlatWireInput (item: unknown, idx: number): void {
  if (!item || typeof item !== 'object') {
    throw dcentException('param_error', `bitcoinTxToWire: inputs[${idx}] must be a non-null object`)
  }
  const i = item as Record<string, unknown>
  if (typeof i.rawTransaction !== 'string') {
    throw dcentException('param_error', `bitcoinTxToWire: inputs[${idx}].rawTransaction must be a string`)
  }
  if (typeof i.index !== 'number' || !Number.isInteger(i.index) || i.index < 0) {
    throw dcentException('param_error', `bitcoinTxToWire: inputs[${idx}].index must be a non-negative integer`)
  }
  if (typeof i.txType !== 'string' || !WIRE_INPUT_TX_TYPES.includes(i.txType)) {
    throw dcentException('param_error', `bitcoinTxToWire: unsupported inputs[${idx}].txType '${String(i.txType)}' (expected one of ${WIRE_INPUT_TX_TYPES.join('/')})`)
  }
  if (typeof i.keyPath !== 'string' || i.keyPath.length === 0) {
    throw dcentException('param_error', `bitcoinTxToWire: inputs[${idx}].keyPath must be a non-empty string`)
  }
  if (i.sequence !== undefined && (typeof i.sequence !== 'number' || !Number.isInteger(i.sequence) || i.sequence < 0 || i.sequence > 0xffffffff)) {
    throw dcentException('param_error', `bitcoinTxToWire: inputs[${idx}].sequence must be a uint32 (0..0xFFFFFFFF)`)
  }
}

function assertFlatWireOutput (item: unknown, idx: number): void {
  if (!item || typeof item !== 'object') {
    throw dcentException('param_error', `bitcoinTxToWire: outputs[${idx}] must be a non-null object`)
  }
  const o = item as Record<string, unknown>
  if (typeof o.txType !== 'string' || !WIRE_OUTPUT_TX_TYPES.includes(o.txType)) {
    throw dcentException('param_error', `bitcoinTxToWire: unsupported outputs[${idx}].txType '${String(o.txType)}' (expected one of ${WIRE_OUTPUT_TX_TYPES.join('/')})`)
  }
  if (!isValidSatoshi(o.amount)) {
    throw dcentException('param_error', `bitcoinTxToWire: outputs[${idx}].amount must be a non-negative integer satoshi (number or canonical decimal string)`)
  }
  if (!Array.isArray(o.addresses) || o.addresses.length === 0 || !o.addresses.every((a) => typeof a === 'string' && a.length > 0)) {
    throw dcentException('param_error', `bitcoinTxToWire: outputs[${idx}].addresses must be a non-empty array of non-empty strings`)
  }
}

/**
 * v1 builder nested envelope를 wm v2 flat wire transaction으로 변환한다.
 *
 * 호출부(playground `btx:buildAndSign` / 실 dApp)가
 * `dcent.sign({ payload: { transaction: bitcoinTxToWire(builtTx) } })` 형태로 사용한다.
 *
 * - **nested → flat**: `request.body.parameter.input[]/output[]`(snake_case)를
 *   `{ inputs[], outputs[] }`(wm 계약)로 매핑. `prev_tx→rawTransaction`, `utxo_idx→index`,
 *   `type→txType`, `key→keyPath`, `value→amount(satoshi 문자열)`, `to→addresses:[to]`.
 * - **pass-through**: 입력이 이미 flat(`inputs`/`outputs` 배열 보유)이면 변환 없이 반환.
 *   단 flat wire도 dApp이 구성할 수 있는 untrusted 입력이므로 nested와 동일하게 필드 shape를
 *   검증한 뒤 통과시킨다 (cross-review r3 — 무검증 pass-through로 malformed wire 누출 방지).
 *   m09-04-14 preset의 valid flat wire는 그대로 통과 (회귀 0).
 * - **conservative reject**: input/output `type`이 wm wire 유효 집합 밖(`p2pk`/`multisig`/`p2tr` 등)
 *   이면 `param_error` throw (boundary-validation + error-handling-consistency).
 * - **malformed reject**: flat도 nested도 아닌 입력(`null`/`undefined`/`{}`/garbage)이면
 *   `param_error` throw (boundary-validation — silent 빈 wire 금지).
 *
 * 출력 구성 검증(non-change destination 정확히 1개 + change ≤1, 다중 dest 금지)은
 * 변환 책임이 아니라 wm `convertWireTransaction`이 강제한다(R9 위임). 본 함수는 shape만 변환한다.
 *
 * @param txObject builder가 만든 v1 nested envelope, 또는 이미 flat인 wire transaction
 * @returns flat `BitcoinWireTransaction`
 * @throws dcentException('param_error') unsupported txType / malformed 입력
 */
export function bitcoinTxToWire (txObject: unknown): BitcoinWireTransaction {
  if (txObject === null || typeof txObject !== 'object') {
    throw dcentException('param_error', 'bitcoinTxToWire: transaction must be a non-null object')
  }

  // 입력은 dApp 제공 untrusted 구조 → known-field만 추출하고 각 필드를 unknown에서 검증한다
  // (dapp-input-sanitization + boundary-validation). 모든 실패는 dcentException('param_error')로
  // 통일(error-handling-consistency) — raw TypeError나 silent invalid wire(`amount:'undefined'` 등) 금지.
  const obj = txObject as {
    inputs?: unknown
    outputs?: unknown
    request?: { body?: { parameter?: { input?: unknown; output?: unknown } } }
  }

  // EC2: 이미 flat인 wire transaction → 필드 shape 검증 후 pass-through.
  // flat wire도 untrusted dApp 입력이므로 무검증 통과하지 않는다 (cross-review r3).
  if (Array.isArray(obj.inputs) && Array.isArray(obj.outputs)) {
    obj.inputs.forEach(assertFlatWireInput)
    obj.outputs.forEach(assertFlatWireOutput)
    return txObject as BitcoinWireTransaction
  }

  // nested v1 envelope (`request.body.parameter`) 인지 확인.
  const parameter = obj.request?.body?.parameter
  if (!parameter || typeof parameter !== 'object') {
    // EC6: flat도 nested도 아닌 malformed 입력.
    throw dcentException(
      'param_error',
      'bitcoinTxToWire: not a Bitcoin tx envelope (missing request.body.parameter) nor a flat wire transaction (missing inputs/outputs arrays)',
    )
  }

  // input/output이 존재하면 반드시 배열이어야 한다 (non-array → param_error, raw TypeError 방지).
  if (parameter.input !== undefined && !Array.isArray(parameter.input)) {
    throw dcentException('param_error', 'bitcoinTxToWire: parameter.input must be an array')
  }
  if (parameter.output !== undefined && !Array.isArray(parameter.output)) {
    throw dcentException('param_error', 'bitcoinTxToWire: parameter.output must be an array')
  }
  const inputItems: unknown[] = Array.isArray(parameter.input) ? parameter.input : []
  const outputItems: unknown[] = Array.isArray(parameter.output) ? parameter.output : []

  const inputs: BitcoinWireInput[] = inputItems.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw dcentException('param_error', `bitcoinTxToWire: input[${idx}] must be a non-null object`)
    }
    const i = item as Record<string, unknown>
    if (typeof i.prev_tx !== 'string') {
      throw dcentException('param_error', `bitcoinTxToWire: input[${idx}].prev_tx must be a string`)
    }
    if (typeof i.utxo_idx !== 'number' || !Number.isInteger(i.utxo_idx) || i.utxo_idx < 0) {
      throw dcentException('param_error', `bitcoinTxToWire: input[${idx}].utxo_idx must be a non-negative integer`)
    }
    if (typeof i.type !== 'string' || !WIRE_INPUT_TX_TYPES.includes(i.type)) {
      throw dcentException(
        'param_error',
        `bitcoinTxToWire: unsupported input[${idx}].type '${String(i.type)}' (expected one of ${WIRE_INPUT_TX_TYPES.join('/')})`,
      )
    }
    if (typeof i.key !== 'string' || i.key.length === 0) {
      throw dcentException('param_error', `bitcoinTxToWire: input[${idx}].key must be a non-empty string`)
    }
    return {
      rawTransaction: i.prev_tx,
      index: i.utxo_idx,
      txType: i.type as BitcoinWireTxType,
      keyPath: i.key,
    }
  })

  const outputs: BitcoinWireOutput[] = outputItems.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw dcentException('param_error', `bitcoinTxToWire: output[${idx}] must be a non-null object`)
    }
    const o = item as Record<string, unknown>
    if (typeof o.type !== 'string' || !WIRE_OUTPUT_TX_TYPES.includes(o.type)) {
      throw dcentException(
        'param_error',
        `bitcoinTxToWire: unsupported output[${idx}].type '${String(o.type)}' (expected one of ${WIRE_OUTPUT_TX_TYPES.join('/')})`,
      )
    }
    // value는 satoshi(비음수 정수)만 허용 (isValidSatoshi). `1.5`/`-1`/`'1.5'`/`'abc'`/공백/대형 등
    // 비-satoshi 값이 `amount:'1e+21'`/`'abc'` 같은 invalid wire로 흘러가지 않도록 차단
    // (boundary-validation — wm BigNumber NaN 도달 전에 거부).
    if (!isValidSatoshi(o.value)) {
      throw dcentException('param_error', `bitcoinTxToWire: output[${idx}].value must be a non-negative integer satoshi (number or canonical decimal string)`)
    }
    if (typeof o.to !== 'string' || o.to.length === 0) {
      throw dcentException('param_error', `bitcoinTxToWire: output[${idx}].to must be a non-empty string`)
    }
    return {
      txType: o.type as BitcoinWireTxType | 'change',
      // satoshi 계약 (검증됨: builder value = satoshi). 단위 변환 없이 문자열화만.
      amount: String(o.value),
      addresses: [o.to],
    }
  })

  return { inputs, outputs }
}
