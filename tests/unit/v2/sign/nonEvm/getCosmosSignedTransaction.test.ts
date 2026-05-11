/**
 * getCosmosSignedTransaction 단위 테스트 (m08-01-04.5)
 *
 * T-U-COSMOS-01: COSMOS happy — params.coinType='COSMOS' (remap 안 함) + coinDecimals.COSMOS=6 사용
 * T-U-COSMOS-02: czone family (COREUM) happy — params.coinType='czone' remap + getCzonDecimal 사용
 * T-U-COSMOS-03: 알 수 없는 coinType → getCzonDecimal throw → wrapper rethrow
 * T-U-COSMOS-04: 응답 response_from='czone' → 원래 coinType으로 복원
 * T-U-COSMOS-05: 응답 response_from!='czone' → mutation 안 함 (그대로 return)
 */

/* eslint-disable @typescript-eslint/no-explicit-any, camelcase */
import { getCosmosSignedTransaction } from '../../../../../src/sign/nonEvmComplex'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getCosmosSignedTransaction — coinType remap + response 후처리 (T-U-COSMOS-*)', () => {
  test('T-U-COSMOS-01: coinType=COSMOS — params.coinType="COSMOS" (remap 안 함) + decimals=COSMOS(6)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: {
        header: { version: '1.0', status: 'success', response_from: 'COSMOS' },
        body: { command: 'transaction', parameter: { signed_tx: '0xcosmosigned' } },
      },
    })

    const resp = await getCosmosSignedTransaction({
      coinType: 'COSMOS',
      sigHash: '0xsighash',
      fee: '0.001',
      decimals: 6,
      path: "m/44'/118'/0'/0/0",
      symbol: 'ATOM',
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getUnionSignedTransaction')
    expect(callArg.params?.coinType).toBe('COSMOS') // remap 안 됨
    // 0.001 * 10^6 = 1000 = 0x3e8 → padStart 16 = '00000000000003e8'
    expect(callArg.params?.fee).toBe('00000000000003e8')
    expect(resp.header.status).toBe('success')
  })

  test('T-U-COSMOS-02: coinType=COREUM (czone family) — params.coinType="czone" remap + getCzonDecimal 사용', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r2',
      result: {
        header: { version: '1.0', status: 'success', response_from: 'czone' },
        body: { command: 'transaction', parameter: { signed_tx: '0xcoreumsigned' } },
      },
    })

    const resp = await getCosmosSignedTransaction({
      coinType: 'COREUM',
      sigHash: '0xsighash',
      fee: '0.001',
      decimals: 6,
      path: "m/44'/990'/0'/0/0",
      symbol: 'CORE',
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params?.coinType).toBe('czone') // remap됨
    // getCzonDecimal('COREUM') = 6 → 0.001 * 10^6 = 1000 = 0x3e8 → padStart 16
    expect(callArg.params?.fee).toBe('00000000000003e8')
    // T-U-COSMOS-04와 결합: response_from='czone' → 원래 coinType('COREUM')으로 복원됨
    expect(resp.header.response_from).toBe('COREUM')
  })

  test('T-U-COSMOS-03: 알 수 없는 coinType → getCzonDecimal throw → wrapper rethrow', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r3', result: {} })

    await expect(
      getCosmosSignedTransaction({
        coinType: 'UNKNOWN_CHAIN',
        sigHash: '0x',
        fee: '0',
        decimals: 6,
        path: "m/44'/118'/0'/0/0",
        symbol: 'X',
      }),
    ).rejects.toMatchObject({
      header: { status: 'error' },
      body: { error: { code: 'coin_type_error' } },
    })
  })

  test('T-U-COSMOS-04: 응답 response_from="czone" → 원래 coinType으로 복원', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r4',
      result: {
        header: { version: '1.0', status: 'success', response_from: 'czone' },
        body: { command: 'transaction', parameter: { signed_tx: '0xsig' } },
      },
    })

    const resp = await getCosmosSignedTransaction({
      coinType: 'COREUM',
      sigHash: '0x',
      fee: '0.001',
      decimals: 6,
      path: "m/44'/990'/0'/0/0",
      symbol: 'CORE',
    })

    expect(resp.header.response_from).toBe('COREUM')
  })

  test('T-U-COSMOS-05: 응답 response_from="COSMOS" (czone 아님) → 그대로 return (mutation 안 함)', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r5',
      result: {
        header: { version: '1.0', status: 'success', response_from: 'COSMOS' },
        body: { command: 'transaction', parameter: { signed_tx: '0xsig' } },
      },
    })

    const resp = await getCosmosSignedTransaction({
      coinType: 'COSMOS',
      sigHash: '0x',
      fee: '0.001',
      decimals: 6,
      path: "m/44'/118'/0'/0/0",
      symbol: 'ATOM',
    })

    expect(resp.header.response_from).toBe('COSMOS') // 변환 없음
  })
})
