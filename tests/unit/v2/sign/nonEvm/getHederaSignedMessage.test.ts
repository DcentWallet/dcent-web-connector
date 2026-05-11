/**
 * getHederaSignedMessage 단위 테스트 (m08-01-04)
 *
 * T-U-HEDERA-MSG-01: happy path — destructure → params에 `message` 키 (key 변경) 단언
 * T-RESP-01 (Hedera Msg): 응답 v1 호환 형식 그대로 forward
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getHederaSignedMessage } from '../../../../../src/sign/nonEvmSimple'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getHederaSignedMessage — happy path + 키 매핑 (T-U-HEDERA-MSG-01)', () => {
  test('T-U-HEDERA-MSG-01: unsignedMsg → message 키 변경 + path forward', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { sign: '0xmsgsigned' },
    })

    const resp = await getHederaSignedMessage({
      unsignedMsg: 'hello hedera',
      path: "m/44'/3030'/0'/0/0",
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getHederaSignedMessage')
    // 키 매핑 단언 — `message` 키 (불 `unsignedMsg`나 `unsigned_msg`가 아님)
    expect(callArg.params).toEqual({
      message: 'hello hedera',
      path: "m/44'/3030'/0'/0/0",
    })
    expect(callArg.params).not.toHaveProperty('unsignedMsg')
    expect(callArg.params).not.toHaveProperty('unsigned_msg')
    expect(resp.header.status).toBe('success')
  })
})

describe('getHederaSignedMessage — 응답 형식 forward (T-RESP-01 Hedera Msg)', () => {
  test('T-RESP-01: _call이 v1 fixture 반환 시 변환 없이 forward', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { sign: '0xmsg', pubkey: '0xpub' },
    })

    const resp = await getHederaSignedMessage({
      unsignedMsg: 'hi',
      path: "m/44'/3030'/0'/0/0",
    })

    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter).toEqual({ sign: '0xmsg', pubkey: '0xpub' })
  })
})
