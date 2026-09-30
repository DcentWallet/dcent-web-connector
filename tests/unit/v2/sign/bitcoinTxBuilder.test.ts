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
 * T-U-TXBLD-VAL-*: add 시점 boundary validation (malformed 인자 / **모양이 틀린** txType / 비-satoshi)
 *   🔴 DC-4379 로 txType 은 **열린 문자열**이 됐다 — connector 는 값을 판정하지 않고 모양만 본다.
 *   VAL-01/03 = 열렸다는 양성 증거, VAL-SHAPE-01/02 = 모양 위반은 여전히 막힌다는 대조군.
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
  // 🔴 DC-4379 — **열렸다는 양성 증거**. 종전에는 p2pk/multisig/미지값이 여기서 param_error 였고,
  //    그래서 wm 이 새 txType 을 열 때마다 connector npm 재배포가 필요했다. 이제 connector 는
  //    모양만 보고 통과시키며 유효성은 wm `VALID_TX_TYPES` 가 -32602 로 판정한다.
  //    `'change'`(output 전용 마커)와 `'P2TR'`(대소문자 변형)도 이 목록에 있다 — connector 는 그
  //    구분을 더 이상 소유하지 않는다(wm 이 거절한다). 대조군은 VAL-SHAPE-01.
  test.each(['p2pk', 'multisig', 'p2foo', 'change', 'P2TR', 'p2tr-annex-v2'])(
    'T-U-TXBLD-VAL-01: addInput 알 수 없는 txType(%s) 은 connector 를 통과한다 (open enum)',
    (unknownType) => {
      const tx = getBitcoinTransactionObject()
      addBitcoinTransactionInput(tx, 'rawprev', 3, unknownType, "m/86'/0'/0'/0/0")
      // 🔴 축마다 값을 다르게 골랐다(index=3, rawTransaction='rawprev') — 겹치면 축이 서로 투명해진다.
      expect(`${tx.inputs[0].txType}|${tx.inputs[0].index}|${tx.inputs[0].keyPath}|${tx.inputs[0].rawTransaction}`)
        .toBe(`${unknownType}|3|m/86'/0'/0'/0/0|rawprev`)
    },
  )

  test('T-U-TXBLD-VAL-SHAPE-01: 대조군 — **모양**이 틀린 input txType 은 여전히 param_error', () => {
    const tx = getBitcoinTransactionObject()
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, '', 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, 123 as unknown as string, 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, null as unknown as string, 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, {} as unknown as string, 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, 'p'.repeat(65), 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, '__proto__', 'm/0')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionInput(tx, 'raw', 0, 'CONSTRUCTOR', 'm/0')).toThrow(PARAM_ERROR)
    // 검증 실패 시 push 되지 않음 (state 오염 방지)
    expect(tx.inputs).toHaveLength(0)
    // over-reject 방지 — 상한 경계(64자)는 통과한다.
    addBitcoinTransactionInput(tx, 'raw', 0, 'p'.repeat(64), 'm/0')
    expect(tx.inputs).toHaveLength(1)
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

  // input 과 **같은 결정, 다른 축**이다 — 한쪽만 열면 다른 쪽이 조용히 닫힌 채 남는다.
  test.each(['p2pk', 'multisig', 'p2foo', 'opreturn'])(
    'T-U-TXBLD-VAL-03: addOutput 알 수 없는 txType(%s) 은 connector 를 통과한다 (open enum)',
    (unknownType) => {
      const tx = getBitcoinTransactionObject()
      addBitcoinTransactionOutput(tx, unknownType, '7777', 'bc1qrecipient')
      expect(`${tx.outputs[0].txType}|${tx.outputs[0].amount}|${tx.outputs[0].addresses.join(',')}`)
        .toBe(`${unknownType}|7777|bc1qrecipient`)
    },
  )

  test('T-U-TXBLD-VAL-SHAPE-02: 대조군 — **모양**이 틀린 output txType 은 여전히 param_error', () => {
    const tx = getBitcoinTransactionObject()
    expect(() => addBitcoinTransactionOutput(tx, '', '1', 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, 123 as unknown as string, '1', 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, null as unknown as string, '1', 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, {} as unknown as string, '1', 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, 'p'.repeat(65), '1', 'addr')).toThrow(PARAM_ERROR)
    expect(() => addBitcoinTransactionOutput(tx, '__proto__', '1', 'addr')).toThrow(PARAM_ERROR)
    expect(tx.outputs).toHaveLength(0)
    addBitcoinTransactionOutput(tx, 'p'.repeat(64), '1', 'addr')
    expect(tx.outputs).toHaveLength(1)
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

  // T-U-TXBLD-VAL-03c 제거 (DC-4379) — 클래스 "output 전용 txType(`change`)을 input 이 거부한다" 의
  // **소유권이 wm 으로 이동**했다. connector 에 그 한 값만 남기는 것도 wm `VALID_TX_TYPES` 의 복제다.
  // `'change'` 가 connector 를 통과한다는 사실은 VAL-01 이 양성으로 고정한다(하류가 -32602 로 거절).

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

  // T-U-TXBLD-VAL-03g 는 VAL-01(양성) + VAL-SHAPE-01(대조군)로 대체됐다 (DC-4379).
  // 종전 대조군은 "알 수 없는 값 거절"이었고 그 축이 통째로 wm 소유가 됐다.
  test('T-U-TXBLD-VAL-03g: 알려진 6값(input 5 + output change)의 정상 경로는 불변 (breaking 방지)', () => {
    const tx = getBitcoinTransactionObject()
    for (const t of ['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr']) {
      addBitcoinTransactionInput(tx, 'rawprev', 0, t, "m/44'/0'/0'/0/0")
    }
    expect(tx.inputs.map((i) => i.txType)).toEqual(['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr'])
    for (const t of ['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr', 'change']) {
      addBitcoinTransactionOutput(tx, t, '1000', 'addr')
    }
    expect(tx.outputs.map((o) => o.txType)).toEqual(['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr', 'change'])
  })

  test('T-U-TXBLD-VAL-03h: 거절 문구의 **형태**는 유지되고 값 열거는 사라졌다 (published 표면)', () => {
    // 🔴 published API 라 에러 **형태**(param_error + `<fn>: ` 접두사)를 바꾸면 dApp 분기가 깨진다.
    //    반대로 종전의 값 열거("expected one of p2pkh/…")는 DC-4379 이후 **거짓말**이므로
    //    금지 단언으로 되살아나는 것을 막는다.
    const tx = getBitcoinTransactionObject()
    // v1 호환 throw object — Error 가 아니라 `{ body: { error: { code, message } } }` 다.
    const msgOf = (fn: () => unknown): string => {
      try {
        fn()
        return ''
      } catch (e) {
        return (e as { body?: { error?: { message?: string } } }).body?.error?.message ?? ''
      }
    }
    const emptyMsg = msgOf(() => addBitcoinTransactionInput(tx, 'raw', 0, '', 'm/0'))
    const typeMsg = msgOf(() => addBitcoinTransactionOutput(tx, 123 as unknown as string, '1', 'addr'))
    const lenMsg = msgOf(() => addBitcoinTransactionInput(tx, 'raw', 0, 'p'.repeat(65), 'm/0'))
    const protoMsg = msgOf(() => addBitcoinTransactionOutput(tx, '__proto__', '1', 'addr'))
    expect(emptyMsg).toBe('addBitcoinTransactionInput: type must not be empty')
    expect(typeMsg).toBe('addBitcoinTransactionOutput: type must be a string, got number')
    expect(lenMsg).toBe('addBitcoinTransactionInput: type length exceeds 64 chars (got 65)')
    expect(protoMsg).toBe("addBitcoinTransactionOutput: type rejected: prototype-pollution key '__proto__'")
    for (const m of [emptyMsg, typeMsg, lenMsg, protoMsg]) {
      expect(m).not.toContain('expected one of')
      expect(m).not.toContain('unsupported type')
    }
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
