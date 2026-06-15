/**
 * Bitcoin transaction builder 단위 테스트 (m09-04-15 — v2 flat 직접 생성)
 *
 * builder(getBitcoinTransactionObject/addBitcoinTransactionInput/addBitcoinTransactionOutput)가
 * wm v2 flat wire(BitcoinWireTransaction = {inputs[],outputs[]})를 직접 누적한다. 별도 변환 함수 없음.
 *
 * T-U-TXBLD-01: getBitcoinTransactionObject() (인자 없음) → 빈 {inputs:[],outputs:[]}
 * T-U-TXBLD-03: addInput → flat {rawTransaction,index,txType,keyPath}
 * T-U-TXBLD-04: addOutput → flat {txType,amount,addresses:[to]}
 * T-U-TXBLD-05: 다건 push + chaining (단일 dest + change)
 * T-U-TXBLD-06: wm BitcoinWireTransaction 계약 충족 (txType/keyPath/satoshi amount)
 * T-U-TXBLD-VAL-*: add 시점 boundary validation (malformed 인자 / unsupported txType / 비-satoshi)
 * T-MUT-TX-01/02: mutation 격리 (호출별 독립 객체)
 * T-U-TXBLD-EXPORT: export 표면 (bitcoinTxToWire 제거 확인)
 */

import {
  getBitcoinTransactionObject,
  addBitcoinTransactionInput,
  addBitcoinTransactionOutput,
} from '../../../../src/sign/bitcoinTxBuilder'
import dcent from '../../../../src/index'

const PARAM_ERROR = expect.objectContaining({
  body: expect.objectContaining({
    error: expect.objectContaining({ code: 'param_error' }),
  }),
})

describe('getBitcoinTransactionObject — m09-04-15 (flat, no-arg)', () => {
  test('T-U-TXBLD-01: 인자 없이 빈 flat wire {inputs:[],outputs:[]} 생성', () => {
    const tx = getBitcoinTransactionObject()
    expect(tx).toEqual({ inputs: [], outputs: [] })
    // nested v1 envelope 잔재 없음
    expect(tx).not.toHaveProperty('request')
  })

  // T-U-TXBLD-02/02b (coinType 검증) 제거 — m09-04-15 RE-AUDIT 2026-06-15:
  //   coinType 인자 제거로 coin_type_error 분기 소멸. 코인 호환성은 sign 시 chainId가 담당.
})

describe('addBitcoinTransactionInput — m09-04-15 (flat)', () => {
  test('T-U-TXBLD-03: input flat shape {rawTransaction,index,txType,keyPath}', () => {
    const tx = getBitcoinTransactionObject()
    addBitcoinTransactionInput(tx, 'deadbeefRawHex', 1, 'p2pkh', "m/44'/0'/0'/0/0")

    expect(tx.inputs).toHaveLength(1)
    expect(tx.inputs[0]).toEqual({
      rawTransaction: 'deadbeefRawHex',
      index: 1,
      txType: 'p2pkh',
      keyPath: "m/44'/0'/0'/0/0",
    })
    // v1 snake_case 잔재 없음
    expect(tx.inputs[0]).not.toHaveProperty('prev_tx')
    expect(tx.inputs[0]).not.toHaveProperty('utxo_idx')
  })

  test('T-U-TXBLD-05a: 다건 input push + chaining — length === N', () => {
    const tx = getBitcoinTransactionObject()
    const ret = addBitcoinTransactionInput(tx, 'tx1', 0, 'p2pkh', 'm/0')
    addBitcoinTransactionInput(tx, 'tx2', 1, 'p2sh', 'm/1')
    expect(ret).toBe(tx) // chaining: 같은 객체 반환
    expect(tx.inputs).toHaveLength(2)
    expect(tx.inputs[1]).toEqual({ rawTransaction: 'tx2', index: 1, txType: 'p2sh', keyPath: 'm/1' })
  })
})

describe('addBitcoinTransactionOutput — m09-04-15 (flat)', () => {
  test('T-U-TXBLD-04: output flat shape {txType,amount,addresses:[to]}', () => {
    const tx = getBitcoinTransactionObject()
    addBitcoinTransactionOutput(tx, 'p2pkh', '100000', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')

    expect(tx.outputs).toHaveLength(1)
    expect(tx.outputs[0]).toEqual({
      txType: 'p2pkh',
      amount: '100000',
      addresses: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
    })
  })

  test('T-U-TXBLD-05b: 단일 dest + change — output 2건', () => {
    const tx = getBitcoinTransactionObject()
    addBitcoinTransactionOutput(tx, 'p2pkh', '150000', 'destAddr')
    addBitcoinTransactionOutput(tx, 'change', '40000', 'changeAddr')
    expect(tx.outputs).toHaveLength(2)
    expect(tx.outputs[1].txType).toBe('change')
    // NOTE: 다중 non-change dest는 builder가 막지 않음 — wm convertWireTransaction이 destCount!==1로 거부(R9 위임).
  })

  test('T-U-TXBLD-04b: amount는 satoshi 문자열 — number/string 입력 모두 String화', () => {
    const tx = getBitcoinTransactionObject()
    addBitcoinTransactionOutput(tx, 'p2pkh', 200000, 'addr') // number
    addBitcoinTransactionOutput(tx, 'p2pkh', '200000', 'addr') // string
    expect(tx.outputs[0].amount).toBe('200000')
    expect(typeof tx.outputs[0].amount).toBe('string')
    expect(tx.outputs[1].amount).toBe('200000')
  })
})

describe('wm BitcoinWireTransaction 계약 (T-U-TXBLD-06)', () => {
  const BIP32_PATH_RE = /^m(\/\d+'?)+$/
  test('T-U-TXBLD-06: builder 산출물이 wm flat 계약 충족 (txType/keyPath/satoshi)', () => {
    const tx = getBitcoinTransactionObject()
    addBitcoinTransactionInput(tx, 'raw', 0, 'p2wpkh', "m/84'/0'/0'/0/0")
    addBitcoinTransactionOutput(tx, 'p2wpkh', '200000', 'bc1qexample')
    expect(['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh']).toContain(tx.inputs[0].txType)
    expect(BIP32_PATH_RE.test(tx.inputs[0].keyPath)).toBe(true)
    expect(tx.outputs[0].amount).toBe('200000')
    expect(Array.isArray(tx.outputs[0].addresses)).toBe(true)
  })
})

describe('add 시점 boundary validation (T-U-TXBLD-VAL)', () => {
  test('T-U-TXBLD-VAL-01: addInput unsupported type(p2pk/multisig) → param_error', () => {
    const tx = getBitcoinTransactionObject()
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, 'p2pk', 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, 'multisig', 'm/0')).toThrow(PARAM_ERROR)
  })

  test('T-U-TXBLD-VAL-02: addInput malformed 인자 → param_error + state 미오염', () => {
    const tx = getBitcoinTransactionObject()
    expect(() => addBitcoinTransactionInput(tx, 123 as unknown as string, 0, 'p2pkh', 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionInput(tx, 'raw', -1, 'p2pkh', 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionInput(tx, 'raw', 1.5, 'p2pkh', 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, 'p2pkh', '')).toThrow(PARAM_ERROR)
    // 검증 실패 시 push되지 않음 (state 오염 방지)
    expect(tx.inputs).toHaveLength(0)
  })

  test('T-U-TXBLD-VAL-03: addOutput unsupported type(p2pk/multisig) → param_error', () => {
    const tx = getBitcoinTransactionObject()
    expect(() => addBitcoinTransactionOutput(tx, 'p2pk', '1', 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, 'multisig', '1', 'addr')).toThrow(PARAM_ERROR)
  })

  test('T-U-TXBLD-VAL-04: addOutput 비-satoshi value → param_error', () => {
    const tx = getBitcoinTransactionObject()
    expect(() => addBitcoinTransactionOutput(tx, 'p2pkh', 1.5, 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, 'p2pkh', -1, 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, 'p2pkh', 1e21, 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, 'p2pkh', '1.5', 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, 'p2pkh', 'abc', 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, 'p2pkh', '0123', 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, 'p2pkh', '   ', 'addr')).toThrow(PARAM_ERROR)
  })

  test('T-U-TXBLD-VAL-05: addOutput malformed to → param_error', () => {
    const tx = getBitcoinTransactionObject()
    expect(() => addBitcoinTransactionOutput(tx, 'p2pkh', '1', '')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, 'p2pkh', '1', 123 as unknown as string)).toThrow(PARAM_ERROR)
  })

  test('T-U-TXBLD-VAL-07: add* transaction 컨테이너 malformed(null/v1 nested/비배열) → param_error (raw TypeError 방지)', () => {
    // null / 비객체
    expect(() => addBitcoinTransactionInput(null as unknown as never, 'raw', 0, 'p2pkh', 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(undefined as unknown as never, 'p2pkh', '1', 'addr')).toThrow(PARAM_ERROR)
    // pre-migration v1 nested envelope (inputs/outputs 없음)
    const v1nested = { request: { body: { parameter: { input: [], output: [] } } } } as unknown as never
    expect(() => addBitcoinTransactionInput(v1nested, 'raw', 0, 'p2pkh', 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(v1nested, 'p2pkh', '1', 'addr')).toThrow(PARAM_ERROR)
    // inputs/outputs가 배열이 아님
    expect(() => addBitcoinTransactionInput({ inputs: {}, outputs: [] } as unknown as never, 'raw', 0, 'p2pkh', 'm/0')).toThrow(PARAM_ERROR)
  })

  test('T-U-TXBLD-VAL-06: value=0 (number/string) 경계는 정상 통과 (over-reject 방지)', () => {
    const tx = getBitcoinTransactionObject()
    addBitcoinTransactionOutput(tx, 'p2pkh', 0, 'addr')
    addBitcoinTransactionOutput(tx, 'p2pkh', '0', 'addr')
    expect(tx.outputs[0].amount).toBe('0')
    expect(tx.outputs[1].amount).toBe('0')
  })
})

describe('Mutation isolation — m09-04-15', () => {
  test('T-MUT-TX-01: 두 번 호출 → 서로 다른 객체 + 분리된 inputs/outputs 배열', () => {
    const tx1 = getBitcoinTransactionObject()
    const tx2 = getBitcoinTransactionObject()
    expect(tx1).not.toBe(tx2)
    expect(tx1.inputs).not.toBe(tx2.inputs)
    expect(tx1.outputs).not.toBe(tx2.outputs)
  })

  test('T-MUT-TX-02: tx1 push가 tx2에 영향 없음', () => {
    const tx1 = getBitcoinTransactionObject()
    const tx2 = getBitcoinTransactionObject()
    addBitcoinTransactionInput(tx1, 'leaky', 0, 'p2pkh', 'm/0')
    expect(tx1.inputs).toHaveLength(1)
    expect(tx2.inputs).toHaveLength(0)
  })
})

describe('export 표면 (T-U-TXBLD-EXPORT)', () => {
  test('T-U-TXBLD-EXPORT: dcent.getBitcoinTransactionObject/add* 함수 + bitcoinTxToWire 제거 확인', () => {
    expect(typeof dcent.getBitcoinTransactionObject).toBe('function')
    expect(typeof dcent.addBitcoinTransactionInput).toBe('function')
    expect(typeof dcent.addBitcoinTransactionOutput).toBe('function')
    // m09-04-15: 변환 함수는 제거됨 — builder가 flat을 직접 생성하므로 불필요
    expect((dcent as unknown as Record<string, unknown>).bitcoinTxToWire).toBeUndefined()
  })
})
