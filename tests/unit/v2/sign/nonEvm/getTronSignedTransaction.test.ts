/**
 * getTronSignedTransaction 단위 테스트 (m08-01-04)
 *
 * T-U-TRON-01: happy path — fee 변환 없이 그대로 forward + method='getTronSignedTransaction'
 *              (TRC token wrapper getTrcTokenSignedTransaction은 m08-01-04.5)
 * T-RESP-01 (Tron): 응답 v1 호환 형식 그대로 forward
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getTronSignedTransaction } from '../../../../../src/sign/nonEvmSimple'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getTronSignedTransaction — happy path + method 단언 (T-U-TRON-01)', () => {
  test('T-U-TRON-01: fee/unsignedTx → snake_case 변환 + method=getTronSignedTransaction', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xtronsigned' },
    })

    const resp = await getTronSignedTransaction({
      unsignedTx: '0xrawtron',
      fee: '1000000',
      path: "m/44'/195'/0'/0/0",
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    // method 회귀 가드 — TRC token wrapper(m08-01-04.5)와 헷갈리지 않도록 명시 단언
    expect(callArg.method).toBe('getTronSignedTransaction')
    expect(callArg.params).toEqual({
      unsigned_tx: '0xrawtron',
      fee: '1000000',
      path: "m/44'/195'/0'/0/0",
    })
    // fee 변환 없음 회귀 가드
    expect(callArg.params?.fee).toBe('1000000')
    expect(callArg.params).not.toHaveProperty('unsignedTx')
    expect(resp.header.status).toBe('success')
  })

  test('T-U-TRON-01b: fee=number → number 그대로 forward (변환 없음 회귀)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r2', result: {} })

    await getTronSignedTransaction({
      unsignedTx: '0xraw',
      fee: 1000000,
      path: "m/44'/195'/0'/0/0",
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params?.fee).toBe(1000000)
    expect(typeof callArg.params?.fee).toBe('number')
  })
})

describe('getTronSignedTransaction — 응답 형식 forward (T-RESP-01 Tron)', () => {
  test('T-RESP-01: _call이 v1 fixture 반환 시 변환 없이 forward', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xts', sign: '0xtron' },
    })

    const resp = await getTronSignedTransaction({
      unsignedTx: '0xraw',
      fee: '100',
      path: "m/44'/195'/0'/0/0",
    })

    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter).toEqual({ signed_tx: '0xts', sign: '0xtron' })
  })
})
