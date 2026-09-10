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
    expect(['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr']).toContain(tx.inputs[0].txType)
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

  // p2tr 은 **양쪽 다 허용되지만 축이 다르다** — output 은 "Taproot 주소로 수취", input 은
  // "Taproot UTXO 를 소비해 서명". 한쪽만 단언하면 다른 쪽이 조용히 닫혀도 초록이므로 둘 다 고정한다.
  test('T-U-TXBLD-VAL-03b: addOutput p2tr(Taproot 수신) → 허용 + wire 에 그대로 실린다', () => {
    const tx = getBitcoinTransactionObject()
    addBitcoinTransactionOutput(tx, 'p2tr', '200000', 'bc1p5cyxnuxmeuwuvkwfem96l0bqaq6bqqkzqvqzqqqqqqqqqqqqqqqqq')
    expect(tx.outputs).toHaveLength(1)
    expect(tx.outputs[0].txType).toBe('p2tr')
    expect(tx.outputs[0].amount).toBe('200000')
  })

  // 클래스는 "**output 전용** txType 을 input 이 거부한다" 이고, 원소는 이제 `change` **하나**다.
  // 🔴 `p2tr` 은 이 클래스에서 빠졌다 — wm m21-01-04 이 P2TR 입력 서명 경로를 열었고 connector 도
  //    뒤이어 열었기 때문이다(그 개통의 양성 단언은 아래 VAL-03f/03g 가 갖는다). `change` 만 남은
  //    이유는 그것이 **wire 상의 output 전용 마커**라 input 에는 대응 개념이 없어서다.
  test.each(['change'])(
    'T-U-TXBLD-VAL-03c: addInput %s → param_error (output 전용 txType 은 input 이 거부)',
    (outputOnlyType) => {
      const tx = getBitcoinTransactionObject()
      expect(() => addBitcoinTransactionInput(tx, 'raw', 0, outputOnlyType, "m/44'/0'/0'/0/0")).toThrow(PARAM_ERROR)
      expect(tx.inputs).toHaveLength(0)
    },
  )

  // ──────────────────────────────────────────────────────────────────────────
  // m21-02 후속 — input `p2tr` 개통 (wm m21-01-04 / PR #1553 이 하류를 연 뒤)
  //
  // 🔴 이 두 테스트는 **짝**이다. 양성(03f)만 두면 whitelist 를 통째로 무력화해도(모든 문자열 통과)
  //    초록이고, 대조군(03g)만 두면 p2tr 이 빠져도 초록이다. 둘 다 있어야 "p2tr **만** 열렸다" 가 고정된다.
  test('T-U-TXBLD-VAL-03f: addInput p2tr(Taproot UTXO 소비) → 허용 + wire 에 그대로 실린다', () => {
    const tx = getBitcoinTransactionObject()
    addBitcoinTransactionInput(tx, 'rawprev', 1, 'p2tr', "m/86'/0'/0'/0/0")
    expect(tx.inputs).toHaveLength(1)
    // 🔴 값을 축마다 다르게 골랐다 — index 를 0 이 아닌 1 로 둬 keyPath/txType 과 서로 투명해지지 않게 한다.
    expect(`${tx.inputs[0].txType}|${tx.inputs[0].keyPath}|${tx.inputs[0].index}|${tx.inputs[0].rawTransaction}`)
      .toBe("p2tr|m/86'/0'/0'/0/0|1|rawprev")
  })

  test('T-U-TXBLD-VAL-03g: 대조군 — 알 수 없는 input type 은 여전히 param_error 로 거절된다', () => {
    const tx = getBitcoinTransactionObject()
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, 'p2foo', "m/86'/0'/0'/0/0")).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, 'P2TR', "m/86'/0'/0'/0/0")).toThrow(PARAM_ERROR)
    expect(tx.inputs).toHaveLength(0)
  })

  test('T-U-TXBLD-VAL-03h: input 거절 문구의 **형태**가 유지된다 (dApp 이 분기할 수 있는 published 표면)', () => {
    // 🔴 published API 라 문구를 바꾸면 dApp 분기가 깨진다. 접두사 + 기대값 열거 형태를 함께 고정한다.
    const tx = getBitcoinTransactionObject()
    let msg = ''
    try {
      addBitcoinTransactionInput(tx, 'raw', 0, 'p2foo', 'm/0')
    } catch (e) {
      // v1 호환 throw object — Error 가 아니라 `{ body: { error: { code, message } } }` 다.
      msg = (e as { body?: { error?: { message?: string } } }).body?.error?.message ?? ''
    }
    expect(msg).toBe(
      "addBitcoinTransactionInput: unsupported type 'p2foo' (expected one of p2pkh/p2sh/p2wpkh/p2wsh/p2tr)",
    )
  })

  test('T-U-TXBLD-VAL-03d: change output 은 p2tr 과 별개로 계속 허용된다', () => {
    const tx = getBitcoinTransactionObject()
    addBitcoinTransactionOutput(tx, 'p2tr', '200000', 'bc1pdest')
    addBitcoinTransactionOutput(tx, 'change', '40000', 'bc1qchange')
    expect(tx.outputs.map((o) => o.txType)).toEqual(['p2tr', 'change'])
  })

  // v1 호환 enum 은 `types-drift` 가 v1 과 1:1 로 동결한다 → `p2tr` 을 **넣을 수 없다**.
  // 그 사실을 JSDoc 에만 적으면 낡는다. "enum 에 없다 + raw 문자열은 동작한다" 두 축을 함께 고정해,
  // 누군가 enum 에 p2tr 을 추가하면(= v1 표면 파괴) 여기서 빨개진다.
  test('T-U-TXBLD-VAL-03e: p2tr 은 v1 bitcoinTxType enum 밖이며 raw 문자열로만 전달한다', () => {
    expect(dcent.bitcoinTxType).not.toHaveProperty('p2tr')
    const tx = getBitcoinTransactionObject()
    addBitcoinTransactionOutput(tx, 'p2tr', '1000', 'bc1pdest')
    expect(tx.outputs[0].txType).toBe('p2tr')
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
