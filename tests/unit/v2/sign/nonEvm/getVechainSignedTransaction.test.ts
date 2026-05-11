/**
 * getVechainSignedTransaction 단위 테스트 (m08-01-04.5)
 *
 * T-U-VECHAIN-01: happy — UnitConverter(fee, VECHAIN=18) padStart 16, method=getUnionSignedTransaction
 */

/* eslint-disable @typescript-eslint/no-explicit-any, camelcase */
import { getVechainSignedTransaction } from '../../../../../src/sign/nonEvmComplex'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getVechainSignedTransaction — UnitConverter(VECHAIN) (T-U-VECHAIN-01)', () => {
  test('T-U-VECHAIN-01: fee="1" → unitConverter(1, 18) padStart 16', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xvechainsigned' },
    })

    const resp = await getVechainSignedTransaction({
      coinType: 'VECHAIN',
      sigHash: '0xsighash',
      fee: '1',
      decimals: 18,
      path: "m/44'/818'/0'/0/0",
      symbol: 'VET',
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getUnionSignedTransaction')
    // 1 * 10^18 = 0xde0b6b3a7640000 (15 hex) → padStart(16) = '0de0b6b3a7640000'
    expect(callArg.params?.fee).toBe('0de0b6b3a7640000')
    expect(callArg.params).toMatchObject({
      coinType: 'VECHAIN',
      decimals: 18,
      sig_hash: '0xsighash',
      path: "m/44'/818'/0'/0/0",
      symbol: 'VET',
    })
    expect(resp.header.status).toBe('success')
  })
})
