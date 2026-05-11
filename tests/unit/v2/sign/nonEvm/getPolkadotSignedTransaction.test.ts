/**
 * getPolkadotSignedTransaction 단위 테스트 (m08-01-04.5)
 *
 * T-U-DOT-01: happy — UnitConverter(fee, POLKADOT=10) padStart 16
 */

/* eslint-disable @typescript-eslint/no-explicit-any, camelcase */
import { getPolkadotSignedTransaction } from '../../../../../src/sign/nonEvmComplex'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getPolkadotSignedTransaction — UnitConverter(POLKADOT) (T-U-DOT-01)', () => {
  test('T-U-DOT-01: fee="0.5" → unitConverter(0.5, 10) padStart 16', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r1', result: {} })

    await getPolkadotSignedTransaction({
      coinType: 'POLKADOT',
      sigHash: '0xsighash',
      fee: '0.5',
      decimals: 10,
      path: "m/44'/354'/0'/0/0",
      symbol: 'DOT',
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getUnionSignedTransaction')
    // 0.5 * 10^10 = 5e9 = 0x12a05f200 (9 hex) → padStart(16) = '000000012a05f200'
    expect(callArg.params?.fee).toBe('000000012a05f200')
    expect(callArg.params?.coinType).toBe('POLKADOT')
  })
})
