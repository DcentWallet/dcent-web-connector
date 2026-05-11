/**
 * getHavahSignedTransaction 단위 테스트 (m08-01-04.5)
 *
 * T-U-HAVAH-01: happy — UnitConverter(fee, HAVAH=18) padStart 16
 */

/* eslint-disable @typescript-eslint/no-explicit-any, camelcase */
import { getHavahSignedTransaction } from '../../../../../src/sign/nonEvmComplex'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getHavahSignedTransaction — UnitConverter(HAVAH) (T-U-HAVAH-01)', () => {
  test('T-U-HAVAH-01: fee="0.001" → unitConverter(0.001, 18) padStart 16', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r1', result: {} })

    await getHavahSignedTransaction({
      coinType: 'HAVAH',
      sigHash: '0xsighash',
      fee: '0.001',
      decimals: 18,
      path: "m/44'/9999999'/0'/0/0",
      symbol: 'HVH',
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getUnionSignedTransaction')
    // 0.001 * 10^18 = 1e15 = 0x38d7ea4c68000 (13 hex) → padStart(16) = '00038d7ea4c68000'
    expect(callArg.params?.fee).toBe('00038d7ea4c68000')
    expect(callArg.params?.coinType).toBe('HAVAH')
  })
})
