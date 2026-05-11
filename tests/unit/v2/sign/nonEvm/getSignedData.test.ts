/**
 * getSignedData 단위 테스트 (m08-01-04)
 *
 * T-U-DATA-01: happy path — coin-agnostic, params {key, message} 그대로 forward
 * T-RESP-01 (SignedData): 응답 v1 호환 형식 그대로 forward
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSignedData } from '../../../../../src/sign/nonEvmSimple'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getSignedData — happy path (T-U-DATA-01)', () => {
  test('T-U-DATA-01: 2 인자 → params {key, message} 그대로 forward', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { sign: '0xsigneddata' },
    })

    const resp = await getSignedData(
      "m/44'/60'/0'/0/0",
      '{"types":{...},"domain":{...},"message":{...}}'
    )

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getSignedData')
    expect(callArg.params).toEqual({
      key: "m/44'/60'/0'/0/0",
      message: '{"types":{...},"domain":{...},"message":{...}}',
    })
    expect(resp.header.status).toBe('success')
  })
})

describe('getSignedData — 응답 형식 forward (T-RESP-01 SignedData)', () => {
  test('T-RESP-01: _call이 v1 fixture 반환 시 변환 없이 forward', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { sign: '0xtypedsig', pubkey: '0xpub' },
    })

    const resp = await getSignedData("m/44'/60'/0'/0/0", '{}')

    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter).toEqual({ sign: '0xtypedsig', pubkey: '0xpub' })
  })
})
