/**
 * Bitcoin transaction builder 단위 테스트 (m08-01-02.5)
 *
 * T-U-TXBLD-01..04: 정상 tx object / invalid coinType / input/output shape (snake_case keys)
 * T-U-TXBLD-NESTED-01: 전체 envelope 검증 (v1 byte-wise 동등)
 * T-U-TXBLD-NESTED-02: 다중 push
 * T-MUT-TX-01/02: mutation 격리 (호출별 독립 객체)
 */

import {
  getBitcoinTransactionObject,
  addBitcoinTransactionInput,
  addBitcoinTransactionOutput,
} from '../../../../src/sign/bitcoinTxBuilder'

describe('getBitcoinTransactionObject — m08-01-02.5', () => {
  test('T-U-TXBLD-01: BITCOIN — 정상 tx object 생성, request_to === "BITCOIN"', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    expect(tx.request.header.request_to).toBe('BITCOIN')
    expect(tx.request.body.command).toBe('transaction')
  })

  test('T-U-TXBLD-02: invalid coinType → coin_type_error throw', () => {
    expect(() => getBitcoinTransactionObject('ETHEREUM')).toThrow(
      expect.objectContaining({
        body: { error: { code: 'coin_type_error', message: 'not supported coin type' } },
      }),
    )
  })

  test('T-U-TXBLD-NESTED-01: 전체 envelope shape v1 1:1', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    expect(tx.request.header.version).toBe('1.0')
    expect(tx.request.header.request_to).toBe('BITCOIN')
    expect(tx.request.body.command).toBe('transaction')
    expect(tx.request.body.parameter.version).toBe(1)
    expect(tx.request.body.parameter.locktime).toBe(0)
    // input/output은 초기에는 없음 (push 시 lazy 생성)
    expect(tx.request.body.parameter.input).toBeUndefined()
    expect(tx.request.body.parameter.output).toBeUndefined()
  })
})

describe('addBitcoinTransactionInput — m08-01-02.5', () => {
  test('T-U-TXBLD-03: input shape — snake_case keys (prev_tx / utxo_idx)', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    addBitcoinTransactionInput(tx, 'deadbeefRawHex', 1, 'p2pkh', "m/44'/0'/0'/0/0")

    const inp = tx.request.body.parameter.input
    expect(inp).toBeDefined()
    expect(inp).toHaveLength(1)
    expect(inp![0]).toEqual({
      prev_tx: 'deadbeefRawHex',
      utxo_idx: 1,
      type: 'p2pkh',
      key: "m/44'/0'/0'/0/0",
    })
    // Drift 방어: camelCase로 변환되지 않았는지
    expect(inp![0]).not.toHaveProperty('prevTx')
    expect(inp![0]).not.toHaveProperty('utxoIdx')
  })

  test('T-U-TXBLD-NESTED-02a: 다중 input push — length === N', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    addBitcoinTransactionInput(tx, 'tx1', 0, 'p2pkh', 'k1')
    addBitcoinTransactionInput(tx, 'tx2', 1, 'p2sh', 'k2')
    addBitcoinTransactionInput(tx, 'tx3', 2, 'p2pk', 'k3')

    expect(tx.request.body.parameter.input).toHaveLength(3)
    expect(tx.request.body.parameter.input![0].prev_tx).toBe('tx1')
    expect(tx.request.body.parameter.input![2].utxo_idx).toBe(2)
  })
})

describe('addBitcoinTransactionOutput — m08-01-02.5', () => {
  test('T-U-TXBLD-04: output shape {type, value, to}', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    addBitcoinTransactionOutput(tx, 'p2pkh', '100000', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')

    const out = tx.request.body.parameter.output
    expect(out).toBeDefined()
    expect(out).toHaveLength(1)
    expect(out![0]).toEqual({
      type: 'p2pkh',
      value: '100000',
      to: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    })
  })

  test('T-U-TXBLD-NESTED-02b: 다중 output push — length === M', () => {
    const tx = getBitcoinTransactionObject('BITCOIN')
    addBitcoinTransactionOutput(tx, 'p2pkh', '100', 'addr1')
    addBitcoinTransactionOutput(tx, 'change', '50', 'addr2')

    expect(tx.request.body.parameter.output).toHaveLength(2)
    expect(tx.request.body.parameter.output![1].type).toBe('change')
  })
})

describe('Mutation isolation — m08-01-02.5', () => {
  test('T-MUT-TX-01: 두 번 호출 → 서로 다른 객체 + 분리된 input/output 배열', () => {
    const tx1 = getBitcoinTransactionObject('BITCOIN')
    const tx2 = getBitcoinTransactionObject('BITCOIN')

    expect(tx1).not.toBe(tx2)
    expect(tx1.request).not.toBe(tx2.request)
    expect(tx1.request.body).not.toBe(tx2.request.body)
    expect(tx1.request.body.parameter).not.toBe(tx2.request.body.parameter)
  })

  test('T-MUT-TX-02: tx1.input.push가 tx2.input에 영향 없음', () => {
    const tx1 = getBitcoinTransactionObject('BITCOIN')
    const tx2 = getBitcoinTransactionObject('BITCOIN')

    addBitcoinTransactionInput(tx1, 'leaky-tx', 0, 'p2pkh', 'k')

    expect(tx1.request.body.parameter.input).toHaveLength(1)
    expect(tx2.request.body.parameter.input).toBeUndefined()
  })
})
