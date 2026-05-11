/**
 * getTrcTokenSignedTransaction 단위 테스트 (m08-01-04.5)
 *
 * T-U-TRCTKN-01: method drift 회귀 가드 — wrapper 이름은 getTrcTokenSignedTransaction이지만
 *                dispatch하는 method는 'getTronSignedTransaction'이어야 함 (R1/D-14)
 *                sdk popup의 dispatcher가 Tron과 같은 핸들러를 공유하므로 의도적 보존.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getTrcTokenSignedTransaction } from '../../../../../src/sign/nonEvmComplex'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getTrcTokenSignedTransaction — method drift (T-U-TRCTKN-01)', () => {
  test('T-U-TRCTKN-01: method=getTronSignedTransaction (자기 이름 아님 — R1/D-14)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xtrctokensigned' },
    })

    const resp = await getTrcTokenSignedTransaction({
      unsignedTx: '0xrawtrctoken',
      fee: '1000000',
      path: "m/44'/195'/0'/0/0",
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    // CRITICAL: method drift 회귀 가드 — getTrcTokenSignedTransaction이 아닌 'getTronSignedTransaction'
    expect(callArg.method).toBe('getTronSignedTransaction')
    expect(callArg.method).not.toBe('getTrcTokenSignedTransaction')
    // unsignedTx → unsigned_tx snake_case 변환
    expect(callArg.params).toEqual({
      unsigned_tx: '0xrawtrctoken',
      fee: '1000000',
      path: "m/44'/195'/0'/0/0",
    })
    expect(callArg.params).not.toHaveProperty('unsignedTx')
    expect(resp.header.status).toBe('success')
  })
})
