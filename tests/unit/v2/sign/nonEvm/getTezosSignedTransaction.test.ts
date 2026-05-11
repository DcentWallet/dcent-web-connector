/**
 * getTezosSignedTransaction 단위 테스트 (m08-01-04.5)
 *
 * T-U-TEZOS-01: happy — UnitConverter(fee, TEZOS=6).bignum.toString(16).padStart(16,'0') 정확 단언
 *               + method='getUnionSignedTransaction'
 * T-U-TEZOS-02: nonce 누락 시 params.nonce 키 부재
 * T-U-TEZOS-03: optionParam 전달 시 params.optionParam에 그대로 forward
 * T-RESP-01 (Tezos): v1 호환 응답 형식 그대로 forward
 */

/* eslint-disable @typescript-eslint/no-explicit-any, camelcase */
import { getTezosSignedTransaction } from '../../../../../src/sign/nonEvmComplex'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getTezosSignedTransaction — happy + UnitConverter(TEZOS) (T-U-TEZOS-01)', () => {
  test('T-U-TEZOS-01: fee="1000000" → padStart 16, method=getUnionSignedTransaction', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xtezosigned' },
    })

    const resp = await getTezosSignedTransaction({
      coinType: 'TEZOS',
      sigHash: '0xsighash',
      fee: '1000000',
      decimals: 6,
      path: "m/44'/1729'/0'/0/0",
      symbol: 'XTZ',
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getUnionSignedTransaction')
    // fee = unitConverter('1000000', 6).bignum.toString(16).padStart(16,'0')
    // = (1000000 * 10^6).toString(16).padStart(16,'0') = '38d7ea4c68000'.padStart(16,'0')
    // 1000000 * 10^6 = 1e12 = 0xe8d4a51000 (10 hex chars) → padStart(16, '0') = '000000e8d4a51000'
    expect(callArg.params?.fee).toBe('000000e8d4a51000')
    expect(callArg.params).toMatchObject({
      coinType: 'TEZOS',
      decimals: 6,
      sig_hash: '0xsighash',
      path: "m/44'/1729'/0'/0/0",
      symbol: 'XTZ',
    })
    expect(resp.header.status).toBe('success')
  })

  test('T-U-TEZOS-02: nonce 누락 시 params.nonce 키 부재', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r2', result: {} })

    await getTezosSignedTransaction({
      coinType: 'TEZOS',
      sigHash: '0xsighash',
      fee: '1',
      decimals: 6,
      path: "m/44'/1729'/0'/0/0",
      symbol: 'XTZ',
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params).not.toHaveProperty('nonce')
  })

  test('T-U-TEZOS-03: optionParam 전달 시 params.optionParam에 그대로 forward', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r3', result: {} })

    await getTezosSignedTransaction({
      coinType: 'TEZOS',
      sigHash: '0xsighash',
      fee: '1',
      decimals: 6,
      path: "m/44'/1729'/0'/0/0",
      symbol: 'XTZ',
      optionParam: 'opt-data',
      nonce: '1',
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params?.optionParam).toBe('opt-data')
    expect(callArg.params?.nonce).toBe('1')
  })
})
