/**
 * getAlgorandSignedTransaction 단위 테스트 (m08-01-04.5)
 *
 * T-U-ALGO-01: happy — UnitConverter(fee, ALGORAND=6) padStart 16
 */

/* eslint-disable @typescript-eslint/no-explicit-any, camelcase */
import { getAlgorandSignedTransaction } from '../../../../../src/sign/nonEvmComplex'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getAlgorandSignedTransaction — UnitConverter(ALGORAND) (T-U-ALGO-01)', () => {
  test('T-U-ALGO-01: fee="0.001" → unitConverter(0.001, 6) padStart 16', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r1', result: {} })

    await getAlgorandSignedTransaction({
      coinType: 'ALGORAND',
      sigHash: '0xsighash',
      fee: '0.001',
      decimals: 6,
      path: "m/44'/283'/0'/0/0",
      symbol: 'ALGO',
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getUnionSignedTransaction')
    // 0.001 * 10^6 = 1000 = 0x3e8 → padStart(16) = '00000000000003e8'
    expect(callArg.params?.fee).toBe('00000000000003e8')
    expect(callArg.params?.coinType).toBe('ALGORAND')
  })
})
