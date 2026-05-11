/**
 * getEthereumSignedMessage 단위 테스트 (m08-01-03)
 *
 * T-U-EVMMSG-01: _call({method: 'getEthereumSignedMessage', params: {message, key}}) 호출
 * T-U-EVMMSG-02: 응답 v1 호환 형식
 *
 * v1 인자 검증 없음 — message/key 그대로 pass-through (v1 src-v1/index.js#l1110-l1118).
 */

import { getEthereumSignedMessage } from '../../../../../src/sign/evm'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getEthereumSignedMessage — happy path', () => {
  test('T-U-EVMMSG-01: _call에 method + params 단순 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { sign: { v: 27, r: '0x1', s: '0x2' } },
    })

    const resp = await getEthereumSignedMessage('Hello D\'CENT', "m/44'/60'/0'/0/0")

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getEthereumSignedMessage')
    expect(callArg.params).toEqual({
      message: 'Hello D\'CENT',
      key: "m/44'/60'/0'/0/0",
    })
    expect(resp.header.status).toBe('success')
  })

  test('T-U-EVMMSG-02: 응답 v1 호환 형식 (header/body)', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r2',
      result: { signed_message: '0xdeadbeef', address: '0xabc' },
    })

    const resp = await getEthereumSignedMessage('any', "m/44'/60'/0'/0/0")
    expect(resp.header.version).toBe('1.0')
    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter).toBeDefined()
  })
})
