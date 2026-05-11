/**
 * getNearSignedTransaction 단위 테스트 (m08-01-04.5)
 *
 * T-U-NEAR-01: happy — params.fee='00' (literal) + optionParam에 magic prefix '000000ef'+'00000010'+
 *              UnitConverter(fee, NEAR=24) padStart 32 단언
 * T-U-NEAR-02: dApp이 optionParam 전달 시 nearFee + dApp optionParam concat (`+=`) 단언
 */

/* eslint-disable @typescript-eslint/no-explicit-any, camelcase */
import { getNearSignedTransaction } from '../../../../../src/sign/nonEvmComplex'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getNearSignedTransaction — magic prefix + optionParam concat (T-U-NEAR-01/02)', () => {
  test('T-U-NEAR-01: fee="1" → params.fee="00", optionParam = "000000ef"+"00000010"+padStart(32) of unitConverter(1,24)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r1', result: {} })

    await getNearSignedTransaction({
      coinType: 'NEAR',
      sigHash: '0xsighash',
      fee: '1',
      decimals: 24,
      path: "m/44'/397'/0'/0/0",
      symbol: 'NEAR',
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getUnionSignedTransaction')
    // 1 * 10^24 = 0xd3c21bcecceda1000000 (20 hex) → padStart(32) = '000000000000d3c21bcecceda1000000'
    expect(callArg.params?.fee).toBe('00')
    expect(callArg.params?.optionParam).toBe(
      '000000ef' + '00000010' + '000000000000d3c21bcecceda1000000',
    )
  })

  test('T-U-NEAR-02: dApp optionParam 전달 시 nearFee + dApp optionParam concat (`+=`)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r2', result: {} })

    await getNearSignedTransaction({
      coinType: 'NEAR',
      sigHash: '0xsighash',
      fee: '1',
      decimals: 24,
      path: "m/44'/397'/0'/0/0",
      symbol: 'NEAR',
      optionParam: 'EXTRA',
    })

    const callArg = sendSpy.mock.calls[0][0]
    const expectedNearFee = '000000ef' + '00000010' + '000000000000d3c21bcecceda1000000'
    expect(callArg.params?.optionParam).toBe(expectedNearFee + 'EXTRA')
  })
})
