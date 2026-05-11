/**
 * getHederaSignedTransaction 단위 테스트 (m08-01-04)
 *
 * T-U-HEDERA-TX-01: happy path — destructure → params에 `unsigned_tx` (snake_case) 변환 단언
 * T-RESP-01 (Hedera Tx): 응답 v1 호환 형식 그대로 forward
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getHederaSignedTransaction } from '../../../../../src/sign/nonEvmSimple'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getHederaSignedTransaction — happy path + snake_case 변환 (T-U-HEDERA-TX-01)', () => {
  test('T-U-HEDERA-TX-01: unsignedTx → unsigned_tx 변환 + path/symbol/decimals forward', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xhederasigned' },
    })

    const resp = await getHederaSignedTransaction({
      unsignedTx: '0xrawhedera',
      path: "m/44'/3030'/0'/0/0",
      symbol: 'HBAR',
      decimals: 8,
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getHederaSignedTransaction')
    // snake_case 변환 단언 — camelCase 'unsignedTx' 키가 없어야 함
    expect(callArg.params).toEqual({
      unsigned_tx: '0xrawhedera',
      path: "m/44'/3030'/0'/0/0",
      symbol: 'HBAR',
      decimals: 8,
    })
    expect(callArg.params).not.toHaveProperty('unsignedTx')
    expect(resp.header.status).toBe('success')
  })

  test('T-U-HEDERA-TX-01b: optional symbol/decimals 미제공 → undefined로 forward', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r2', result: {} })

    await getHederaSignedTransaction({
      unsignedTx: '0xrawhedera',
      path: "m/44'/3030'/0'/0/0",
    })

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params).toMatchObject({
      unsigned_tx: '0xrawhedera',
      path: "m/44'/3030'/0'/0/0",
    })
    expect(callArg.params?.symbol).toBeUndefined()
    expect(callArg.params?.decimals).toBeUndefined()
  })
})

describe('getHederaSignedTransaction — 응답 형식 forward (T-RESP-01 Hedera Tx)', () => {
  test('T-RESP-01: _call이 v1 fixture 반환 시 변환 없이 forward', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xhsigned', pubkey: '0xhpub' },
    })

    const resp = await getHederaSignedTransaction({
      unsignedTx: '0xrawhedera',
      path: "m/44'/3030'/0'/0/0",
    })

    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter).toEqual({ signed_tx: '0xhsigned', pubkey: '0xhpub' })
  })
})
