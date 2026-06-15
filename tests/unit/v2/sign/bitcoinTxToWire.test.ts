/**
 * bitcoinTxToWire 단위 테스트 (m09-04-15)
 *
 * v1 builder nested envelope(`request.body.parameter.input[]/output[]`, snake_case) →
 * wm v2 flat wire(`{ inputs[], outputs[] }`) 변환 함수.
 *
 * T-U-SHIM-01: nested → flat, §4 필드 매핑 표 전부 정합
 * T-U-SHIM-02: 이미 flat → pass-through (m09-04-14 preset 회귀 0)
 * T-U-SHIM-03: 단일 dest + 1 change 다건 input 매핑 (다중 non-change dest는 wm 위임)
 * T-U-SHIM-04: 변환 출력이 wm BitcoinWireTransaction 계약 충족 (txType / keyPath / satoshi amount)
 * T-U-SHIM-05: 빈 output → outputs:[] (wm가 -32602 낼 shape). 빈 input은 wm auto-fetch 정상 경로
 * T-U-SHIM-06: p2pk / multisig type → throw (conservative reject, EC1)
 * T-U-SHIM-07: malformed 입력(null/undefined/{} 등) → throw (EC6)
 * T-U-SHIM-08: export 표면 — typeof dcent.bitcoinTxToWire === 'function'
 */

import {
  getBitcoinTransactionObject,
  addBitcoinTransactionInput,
  addBitcoinTransactionOutput,
  bitcoinTxToWire,
} from '../../../../src/sign/bitcoinTxBuilder'
import dcent from '../../../../src/index'

const PARAM_ERROR = expect.objectContaining({
  body: expect.objectContaining({
    error: expect.objectContaining({ code: 'param_error' }),
  }),
})

describe('bitcoinTxToWire — nested → flat (T-U-SHIM-01)', () => {
  test('T-U-SHIM-01: v1 nested envelope → flat {inputs[],outputs[]} 필드 매핑 정합', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    addBitcoinTransactionInput(tx, 'deadbeefRawHex', 1, 'p2pkh', "m/44'/0'/0'/0/0")
    addBitcoinTransactionOutput(tx, 'p2pkh', '200000', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')

    const wire = bitcoinTxToWire(tx)

    expect(wire.inputs).toEqual([
      {
        rawTransaction: 'deadbeefRawHex', // prev_tx
        index: 1, // utxo_idx
        txType: 'p2pkh', // type
        keyPath: "m/44'/0'/0'/0/0", // key
      },
    ])
    expect(wire.outputs).toEqual([
      {
        txType: 'p2pkh', // type
        amount: '200000', // value (satoshi 문자열)
        addresses: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'], // [to]
      },
    ])
    // nested 잔재 / snake_case 키가 남지 않아야 함
    expect(wire).not.toHaveProperty('request')
    expect(wire.inputs[0]).not.toHaveProperty('prev_tx')
    expect(wire.inputs[0]).not.toHaveProperty('utxo_idx')
    expect(wire.outputs[0]).not.toHaveProperty('value')
    expect(wire.outputs[0]).not.toHaveProperty('to')
  })
})

describe('bitcoinTxToWire — flat pass-through (T-U-SHIM-02)', () => {
  test('T-U-SHIM-02: 이미 flat인 transaction → 변환 없이 동일 reference 반환', () => {
    const flat = {
      inputs: [{ rawTransaction: 'abcd', index: 0, txType: 'p2wpkh', keyPath: "m/84'/0'/0'/0/0" }],
      outputs: [{ txType: 'p2wpkh', amount: '100000', addresses: ['bc1qexample'] }],
    }

    const out = bitcoinTxToWire(flat)

    // pass-through: 변환하지 않고 그대로 통과 (m09-04-14 preset 경로 회귀 0)
    expect(out).toBe(flat)
  })
})

describe('bitcoinTxToWire — 다건 input + change (T-U-SHIM-03)', () => {
  test('T-U-SHIM-03: 단일 dest + 1 change, 다건 input 매핑', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    addBitcoinTransactionInput(tx, 'tx1', 0, 'p2pkh', "m/44'/0'/0'/0/0")
    addBitcoinTransactionInput(tx, 'tx2', 1, 'p2sh', "m/44'/0'/0'/0/1")
    addBitcoinTransactionOutput(tx, 'p2pkh', '150000', 'destAddr')
    addBitcoinTransactionOutput(tx, 'change', '40000', 'changeAddr')

    const wire = bitcoinTxToWire(tx)

    expect(wire.inputs).toHaveLength(2)
    expect(wire.inputs[0]).toEqual({ rawTransaction: 'tx1', index: 0, txType: 'p2pkh', keyPath: "m/44'/0'/0'/0/0" })
    expect(wire.inputs[1]).toEqual({ rawTransaction: 'tx2', index: 1, txType: 'p2sh', keyPath: "m/44'/0'/0'/0/1" })
    expect(wire.outputs).toHaveLength(2)
    expect(wire.outputs[0].txType).toBe('p2pkh')
    expect(wire.outputs[1].txType).toBe('change')
    // NOTE: 다중 non-change destination은 connector가 막지 않는다. wm convertWireTransaction이
    // destCount !== 1 → -32602로 거부(출력 구성 검증은 wm 위임, R9). 변환은 shape만 수행.
  })
})

describe('bitcoinTxToWire — wm 계약 충족 (T-U-SHIM-04)', () => {
  const BIP32_PATH_RE = /^m(\/\d+'?)+$/

  test('T-U-SHIM-04: txType ∈ valid set, keyPath BIP32, amount satoshi 정수 문자열 (number 입력)', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    addBitcoinTransactionInput(tx, 'raw', 0, 'p2pkh', "m/44'/0'/0'/0/0")
    addBitcoinTransactionOutput(tx, 'p2pkh', 200000, 'addr') // value: number

    const wire = bitcoinTxToWire(tx)

    expect(['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh']).toContain(wire.inputs[0].txType)
    expect(BIP32_PATH_RE.test(wire.inputs[0].keyPath)).toBe(true)
    // number 입력도 satoshi 정수 문자열로 직결 (String(value), 단위 변환 없음)
    expect(wire.outputs[0].amount).toBe('200000')
    expect(typeof wire.outputs[0].amount).toBe('string')
  })

  test('T-U-SHIM-04b: string 입력도 satoshi 문자열 그대로 (number/string 모두 satoshi 단언)', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    addBitcoinTransactionInput(tx, 'raw', 0, 'p2pkh', "m/44'/0'/0'/0/0")
    addBitcoinTransactionOutput(tx, 'p2pkh', '200000', 'addr') // value: string

    const wire = bitcoinTxToWire(tx)
    expect(wire.outputs[0].amount).toBe('200000')
  })
})

describe('bitcoinTxToWire — 빈 input/output (T-U-SHIM-05)', () => {
  test('T-U-SHIM-05a: 빈 output envelope → outputs:[] (wm가 -32602 낼 shape)', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    addBitcoinTransactionInput(tx, 'raw', 0, 'p2pkh', "m/44'/0'/0'/0/0")
    // output 미추가

    const wire = bitcoinTxToWire(tx)
    expect(wire.outputs).toEqual([])
    expect(wire.inputs).toHaveLength(1)
  })

  test('T-U-SHIM-05b: 빈 input + output 존재 → inputs:[] (wm auto-fetch 정상 경로, sad-path 아님)', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    // input 미추가
    addBitcoinTransactionOutput(tx, 'p2pkh', '100000', 'addr')

    const wire = bitcoinTxToWire(tx)
    expect(wire.inputs).toEqual([])
    expect(wire.outputs).toHaveLength(1)
  })
})

describe('bitcoinTxToWire — conservative reject (T-U-SHIM-06)', () => {
  test('T-U-SHIM-06a: input type=p2pk → param_error throw', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    addBitcoinTransactionInput(tx, 'raw', 0, 'p2pk', "m/44'/0'/0'/0/0")
    addBitcoinTransactionOutput(tx, 'p2pkh', '1', 'addr')

    expect(() => bitcoinTxToWire(tx)).toThrow(PARAM_ERROR)
  })

  test('T-U-SHIM-06b: output type=multisig → param_error throw', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    addBitcoinTransactionInput(tx, 'raw', 0, 'p2pkh', "m/44'/0'/0'/0/0")
    addBitcoinTransactionOutput(tx, 'multisig', '1', 'addr')

    expect(() => bitcoinTxToWire(tx)).toThrow(PARAM_ERROR)
  })
})

describe('bitcoinTxToWire — malformed 입력 reject (T-U-SHIM-07)', () => {
  test('T-U-SHIM-07: null/undefined/{}/garbage → param_error throw', () => {
    expect(() => bitcoinTxToWire(null)).toThrow(PARAM_ERROR)
    expect(() => bitcoinTxToWire(undefined)).toThrow(PARAM_ERROR)
    expect(() => bitcoinTxToWire({})).toThrow(PARAM_ERROR)
    expect(() => bitcoinTxToWire('not-an-object')).toThrow(PARAM_ERROR)
    expect(() => bitcoinTxToWire(42)).toThrow(PARAM_ERROR)
    // flat도 nested도 아닌 부분 객체
    expect(() => bitcoinTxToWire({ request: { body: {} } })).toThrow(PARAM_ERROR)
  })
})

describe('bitcoinTxToWire — export 표면 (T-U-SHIM-08)', () => {
  test('T-U-SHIM-08: dcent.bitcoinTxToWire는 함수 (default 객체 멤버 등재)', () => {
    expect(typeof dcent.bitcoinTxToWire).toBe('function')
    // named export도 동일 함수 참조
    expect(dcent.bitcoinTxToWire).toBe(bitcoinTxToWire)
  })
})
