/**
 * getSignedMessage 단위 테스트 (m08-01-04)
 *
 * T-U-MSG-01: happy path — coin-agnostic, params {coinType, key, message} 그대로 forward
 * T-RESP-01 (SignedMessage): 응답 v1 호환 형식 그대로 forward
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSignedMessage } from '../../../../../src/sign/nonEvmSimple'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getSignedMessage — happy path (T-U-MSG-01)', () => {
  test('T-U-MSG-01: 3 인자 → params {coinType, key, message} 그대로 forward', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { sign: '0xsignedmsg' },
    })

    const resp = await getSignedMessage(
      'BITCOIN',
      "m/44'/0'/0'/0/0",
      'hello world'
    )

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getSignedMessage')
    expect(callArg.params).toEqual({
      coinType: 'BITCOIN',
      key: "m/44'/0'/0'/0/0",
      message: 'hello world',
    })
    expect(resp.header.status).toBe('success')
  })

  test('T-U-MSG-01b: 다른 coinType (ETHEREUM) — 동일하게 그대로 forward (coin-agnostic)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r2', result: {} })

    await getSignedMessage('ETHEREUM', "m/44'/60'/0'/0/0", 'eth msg')

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params).toEqual({
      coinType: 'ETHEREUM',
      key: "m/44'/60'/0'/0/0",
      message: 'eth msg',
    })
  })
})

describe('getSignedMessage — 응답 형식 forward (T-RESP-01 SignedMessage)', () => {
  test('T-RESP-01: _call이 v1 fixture 반환 시 변환 없이 forward', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { sign: '0xsigmsg', pubkey: '0xpubmsg' },
    })

    const resp = await getSignedMessage('BITCOIN', "m/44'/0'/0'/0/0", 'hi')

    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter).toEqual({ sign: '0xsigmsg', pubkey: '0xpubmsg' })
  })
})
