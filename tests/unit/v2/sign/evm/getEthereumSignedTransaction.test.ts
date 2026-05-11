/**
 * getEthereumSignedTransaction 단위 테스트 (m08-01-03)
 *
 * T-U-EVMTX-01: happy path (txType=0, ETHEREUM) — _call에 method='getEthereumSignedTransaction'
 *               + snake_case params (gas_price, gas_limit, chain_id, tx_type, type_options)
 * T-U-EVMTX-02: chainId !== number → throw 'Invaild Parameter'
 * T-U-EVMTX-03: txType < 0 또는 > 2 → throw
 * T-U-EVMTX-04: txType=1 (EIP-2930) → method='getEthereumSignedTypedTransaction', gas_price 검증됨
 * T-U-EVMTX-05: txType=2 (EIP-1559) → method='getEthereumSignedTypedTransaction', gas_price checkParameter 호출 안 됨
 * T-U-EVMTX-06: coinType=XDC → to가 XDCPrefixConverter로 변환됨
 * T-U-EVMTX-07: 지원하지 않는 coinType → throw 'coin_type_error'
 * T-U-EVMTX-08: invalid numberString → checkParameter throw
 * T-U-EVMTX-09: 응답 형식 v1 호환 (header.status='success' + body.parameter.signed_tx)
 *
 * T-DRIFT-EVM-01 (partial — getEthereumSignedTransaction): 4개 wrapper의 _call params
 *   key-by-key 동등 (snake_case 단언). 본 file은 wrapper 1개만 단언, 통합 drift는 별도 fixture.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getEthereumSignedTransaction } from '../../../../../src/sign/evm'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

const expectV1Error = (code: string, messageContains?: string) =>
  expect.objectContaining({
    body: {
      error: messageContains
        ? expect.objectContaining({ code, message: expect.stringContaining(messageContains) })
        : expect.objectContaining({ code }),
    },
  })

describe('getEthereumSignedTransaction — happy path (T-U-EVMTX-01)', () => {
  test('T-U-EVMTX-01: ETHEREUM + txType=0 → _call({method, params}) snake_case 단언', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xabc' },
    })

    const resp = await getEthereumSignedTransaction(
      'ethereum', '0x1', '0x10', '0x21000', '0xrecipient', '0x100', '0x',
      "m/44'/60'/0'/0/0", 1, 0, {}
    )

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getEthereumSignedTransaction')
    expect(callArg.params).toMatchObject({
      coinType: 'ethereum',
      nonce: '0x1',
      gas_price: '0x10',
      gas_limit: '0x21000',
      to: '0xrecipient',
      value: '0x100',
      data: '0x',
      key: "m/44'/60'/0'/0/0",
      chain_id: 1,
      tx_type: 0,
      type_options: {},
    })
    expect(resp.header.status).toBe('success')
  })
})

describe('getEthereumSignedTransaction — 인자 검증 (T-U-EVMTX-02/03/08)', () => {
  test('T-U-EVMTX-02: chainId !== number → throw "Invaild Parameter"', async () => {
    await expect(
      getEthereumSignedTransaction(
        'ethereum', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
        "m/44'/60'/0'/0/0", 'not-a-number' as any, 0, {}
      )
    ).rejects.toEqual(expectV1Error('param_error', 'Invaild Parameter'))
  })

  test('T-U-EVMTX-03a: txType < 0 → throw', async () => {
    await expect(
      getEthereumSignedTransaction(
        'ethereum', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
        "m/44'/60'/0'/0/0", 1, -1, {}
      )
    ).rejects.toEqual(expectV1Error('param_error', 'Invaild Parameter'))
  })

  test('T-U-EVMTX-03b: txType > 2 → throw', async () => {
    await expect(
      getEthereumSignedTransaction(
        'ethereum', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
        "m/44'/60'/0'/0/0", 1, 3, {}
      )
    ).rejects.toEqual(expectV1Error('param_error', 'Invaild Parameter'))
  })

  test('T-U-EVMTX-08: invalid numberString (nonce="abc") → throw param_error', async () => {
    await expect(
      getEthereumSignedTransaction(
        'ethereum', 'abc', '0x10', '0x21000', '0xto', '0x100', '0x',
        "m/44'/60'/0'/0/0", 1, 0, {}
      )
    ).rejects.toEqual(expectV1Error('param_error'))
  })
})

describe('getEthereumSignedTransaction — txType !== 0 method 변경 (T-U-EVMTX-04/05)', () => {
  test('T-U-EVMTX-04: txType=1 (EIP-2930) → method=getEthereumSignedTypedTransaction, gas_price 검증', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r2', result: {} })

    await getEthereumSignedTransaction(
      'ethereum', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
      "m/44'/60'/0'/0/0", 1, 1, {}
    )

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getEthereumSignedTypedTransaction')
    expect(callArg.params?.tx_type).toBe(1)
    expect(callArg.params?.gas_price).toBe('0x10') // 검증 + 통과
  })

  test('T-U-EVMTX-05: txType=2 (EIP-1559) → method 변경 + gasPrice는 어떤 값이든 그대로 통과 (검증 안 함)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r3', result: {} })

    // gasPrice가 "garbage" — txType=2이면 v1과 동일하게 검증 안 함 (maxFeePerGas/maxPriorityFeePerGas로 대체됨)
    await getEthereumSignedTransaction(
      'ethereum', '0x1', 'garbage', '0x21000', '0xto', '0x100', '0x',
      "m/44'/60'/0'/0/0", 1, 2, { maxFeePerGas: '0x20', maxPriorityFeePerGas: '0x5' }
    )

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getEthereumSignedTypedTransaction')
    expect(callArg.params?.tx_type).toBe(2)
    expect(callArg.params?.gas_price).toBe('garbage') // 검증 없이 그대로
    expect(callArg.params?.type_options).toEqual({ maxFeePerGas: '0x20', maxPriorityFeePerGas: '0x5' })
  })

  test('T-U-EVMTX-05b: txType=2 + typeOptions에 unknown key → sanitize로 drop', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r4', result: {} })

    await getEthereumSignedTransaction(
      'ethereum', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
      "m/44'/60'/0'/0/0", 1, 2, { maxFeePerGas: '0x20', evilKey: 'evil' } as any
    )

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params?.type_options).toEqual({ maxFeePerGas: '0x20' })
  })
})

describe('getEthereumSignedTransaction — coinType switch (T-U-EVMTX-06/07)', () => {
  test('T-U-EVMTX-06: coinType=XDC → to가 XDCPrefixConverter 변환됨 (xdc → 0x)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r5', result: {} })

    await getEthereumSignedTransaction(
      'xinfin', '0x1', '0x10', '0x21000', 'xdcabcdef', '0x100', '0x',
      "m/44'/550'/0'/0/0", 50, 0, {}
    )

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params?.to).toBe('0xabcdef')
  })

  test('T-U-EVMTX-06b: coinType=XDC + to가 이미 0x prefix이면 그대로', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r6', result: {} })

    await getEthereumSignedTransaction(
      'xinfin', '0x1', '0x10', '0x21000', '0xalready', '0x100', '0x',
      "m/44'/550'/0'/0/0", 50, 0, {}
    )

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params?.to).toBe('0xalready')
  })

  test('T-U-EVMTX-07: 지원하지 않는 coinType → throw "coin_type_error"', async () => {
    await expect(
      getEthereumSignedTransaction(
        'unknown_chain', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
        "m/44'/60'/0'/0/0", 1, 0, {}
      )
    ).rejects.toEqual(expectV1Error('coin_type_error', 'not supported coin type'))
  })

  test('T-U-EVMTX-07b: RSK / RSK_TESTNET 모두 통과 (그대로)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r7', result: {} })

    await getEthereumSignedTransaction(
      'rsk', '0x1', '0x10', '0x21000', '0xrsk', '0x100', '0x',
      "m/44'/137'/0'/0/0", 30, 0, {}
    )

    expect(sendSpy.mock.calls[0][0].params?.coinType).toBe('rsk')
    expect(sendSpy.mock.calls[0][0].params?.to).toBe('0xrsk') // XDC 변환 안 됨
  })
})

describe('getEthereumSignedTransaction — 응답 형식 (T-U-EVMTX-09)', () => {
  test('T-U-EVMTX-09: 응답이 v1 호환 V1Response shape', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r8',
      result: { signed_tx: '0xsigned', sign: { v: 27, r: '0x1', s: '0x2' } },
    })

    const resp = await getEthereumSignedTransaction(
      'ethereum', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
      "m/44'/60'/0'/0/0", 1, 0, {}
    )

    expect(resp.header.status).toBe('success')
    expect(resp.header.version).toBe('1.0')
    expect(resp.body.parameter).toBeDefined()
  })
})
