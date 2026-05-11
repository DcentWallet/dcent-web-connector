/**
 * getStellarSignedTransaction 단위 테스트 (m08-01-04)
 *
 * T-U-STELLAR-01: happy path — fee 변환 없이 그대로 forward (UnitConverter 호출 없음 회귀 가드)
 * T-RESP-01 (Stellar): 응답 v1 호환 형식 그대로 forward
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getStellarSignedTransaction } from '../../../../../src/sign/nonEvmSimple'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getStellarSignedTransaction — happy path + fee raw forward (T-U-STELLAR-01)', () => {
  test('T-U-STELLAR-01: fee="100" → 변환 없이 그대로 forward + unsigned_tx snake_case', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xstellarsigned' },
    })

    const resp = await getStellarSignedTransaction({
      unsignedTx: '0xrawstellar',
      fee: '100',
      path: "m/44'/148'/0'/0/0",
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getStellarSignedTransaction')
    // fee가 그대로 — UnitConverter 변환 없음
    expect(callArg.params).toEqual({
      unsigned_tx: '0xrawstellar',
      fee: '100',
      path: "m/44'/148'/0'/0/0",
    })
    expect(callArg.params?.fee).toBe('100')
    expect(callArg.params).not.toHaveProperty('unsignedTx')
    expect(resp.header.status).toBe('success')
  })

  test('T-U-STELLAR-01b: fee=number → number 그대로 forward (변환 없음 회귀 가드)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r2', result: {} })

    await getStellarSignedTransaction({
      unsignedTx: '0xraw',
      fee: 200,
      path: "m/44'/148'/0'/0/0",
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params?.fee).toBe(200)
    expect(typeof callArg.params?.fee).toBe('number')
  })
})

describe('getStellarSignedTransaction — 응답 형식 forward (T-RESP-01 Stellar)', () => {
  test('T-RESP-01: _call이 v1 fixture 반환 시 변환 없이 forward', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xss', sign: '0xstellar' },
    })

    const resp = await getStellarSignedTransaction({
      unsignedTx: '0xraw',
      fee: '100',
      path: "m/44'/148'/0'/0/0",
    })

    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter).toEqual({ signed_tx: '0xss', sign: '0xstellar' })
  })
})
