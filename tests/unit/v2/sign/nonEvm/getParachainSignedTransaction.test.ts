/**
 * getParachainSignedTransaction 단위 테스트 (m08-01-04.5)
 *
 * T-U-PARA-01: happy — UnitConverter(fee, dApp feeDecimals) padStart 16 + RPCUrl/feeSymbol/feeDecimals forward
 * T-U-PARA-02: success 응답 + signed_tx='abcdef' (no '0x') → '0x00abcdef'
 * T-U-PARA-03: success 응답 + signed_tx='0xabcdef' → '0x' strip 후 '0x00' prepend = '0x00abcdef'
 * T-U-PARA-04: failure 응답 → prefix 추가 없이 그대로 return (R2 회귀 가드)
 */

/* eslint-disable @typescript-eslint/no-explicit-any, camelcase */
import { getParachainSignedTransaction } from '../../../../../src/sign/nonEvmComplex'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getParachainSignedTransaction — feeDecimals + signed_tx prefix (T-U-PARA-*)', () => {
  test('T-U-PARA-01: feeDecimals=10 → unitConverter(fee, 10) padStart 16 + RPCUrl/feeSymbol forward', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: {
        header: { version: '1.0', status: 'success' },
        body: { command: 'transaction', parameter: { signed_tx: '0xparasigned' } },
      },
    })

    await getParachainSignedTransaction({
      coinType: 'PARA',
      sigHash: '0xsighash',
      fee: '0.5',
      decimals: 10,
      path: "m/44'/354'/0'/0/0",
      symbol: 'DOT',
      RPCUrl: 'wss://rpc.example',
      feeSymbol: 'DOT',
      feeDecimals: 10,
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getUnionSignedTransaction')
    // 0.5 * 10^10 = 5e9 = 0x12a05f200 → padStart 16 = '000000012a05f200'
    expect(callArg.params?.fee).toBe('000000012a05f200')
    expect(callArg.params).toMatchObject({
      coinType: 'PARA',
      sig_hash: '0xsighash',
      decimals: 10,
      path: "m/44'/354'/0'/0/0",
      symbol: 'DOT',
      RPCUrl: 'wss://rpc.example',
      feeSymbol: 'DOT',
      feeDecimals: 10,
    })
  })

  test('T-U-PARA-02: success + signed_tx="abcdef" (no 0x) → "0x00abcdef" prefix 적용', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r2',
      result: {
        header: { version: '1.0', status: 'success' },
        body: { command: 'transaction', parameter: { signed_tx: 'abcdef' } },
      },
    })

    const resp = await getParachainSignedTransaction({
      coinType: 'PARA',
      sigHash: '0x',
      fee: '0',
      decimals: 10,
      path: "m/44'/354'/0'/0/0",
      symbol: 'DOT',
      RPCUrl: 'wss://rpc',
      feeSymbol: 'DOT',
      feeDecimals: 10,
    })

    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter?.signed_tx).toBe('0x00abcdef')
  })

  test('T-U-PARA-03: success + signed_tx="0xabcdef" → "0x" strip 후 "0x00" prepend = "0x00abcdef"', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r3',
      result: {
        header: { version: '1.0', status: 'success' },
        body: { command: 'transaction', parameter: { signed_tx: '0xabcdef' } },
      },
    })

    const resp = await getParachainSignedTransaction({
      coinType: 'PARA',
      sigHash: '0x',
      fee: '0',
      decimals: 10,
      path: "m/44'/354'/0'/0/0",
      symbol: 'DOT',
      RPCUrl: 'wss://rpc',
      feeSymbol: 'DOT',
      feeDecimals: 10,
    })

    expect(resp.body.parameter?.signed_tx).toBe('0x00abcdef')
  })

  test('T-U-PARA-04: failure 응답 → prefix 추가 없이 그대로 return (R2 회귀 가드)', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r4',
      result: {
        header: { version: '1.0', status: 'failure' },
        body: {
          command: 'transaction',
          error: { code: 'user_cancel', message: 'cancelled' },
        },
      },
    })

    const resp = await getParachainSignedTransaction({
      coinType: 'PARA',
      sigHash: '0x',
      fee: '0',
      decimals: 10,
      path: "m/44'/354'/0'/0/0",
      symbol: 'DOT',
      RPCUrl: 'wss://rpc',
      feeSymbol: 'DOT',
      feeDecimals: 10,
    })

    expect(resp.header.status).toBe('failure')
    // signed_tx가 응답에 없으므로 prefix 추가 없음
    expect(resp.body.parameter?.signed_tx).toBeUndefined()
    expect(resp.body.error?.code).toBe('user_cancel')
  })
})
