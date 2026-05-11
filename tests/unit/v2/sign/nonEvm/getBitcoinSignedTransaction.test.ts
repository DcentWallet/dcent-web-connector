/**
 * getBitcoinSignedTransaction 단위 테스트 (m08-01-04)
 *
 * T-U-BTC-01: happy path — _call에 method='getBitcoinSignedTransaction' + params:{transaction}
 * T-U-BTC-02: transaction === null → throw 'transaction object is undefined or null'
 * T-U-BTC-03: transaction === undefined → throw
 * T-RESP-01 (BTC): _call mock이 v1 fixture {header, body} 반환 시 wrapper가 변환 없이 그대로 return
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getBitcoinSignedTransaction } from '../../../../../src/sign/nonEvmSimple'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'
import type { BitcoinTxObject } from '../../../../../src/sign/bitcoinTxBuilder'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

const expectV1Error = (code: string, messageContains?: string) =>
  expect.objectContaining({
    body: {
      error: messageContains
        ? expect.objectContaining({ code, message: expect.stringContaining(messageContains) })
        : expect.objectContaining({ code }),
    },
  })

const sampleBtcTx: BitcoinTxObject = {
  coinType: 'BITCOIN',
  parameter: {
    inputs: [],
    outputs: [],
    fee: '1000',
  } as any,
}

describe('getBitcoinSignedTransaction — happy path (T-U-BTC-01)', () => {
  test('T-U-BTC-01: tx 객체 → _call({method, params:{transaction}}) 단언', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xabc' },
    })

    const resp = await getBitcoinSignedTransaction(sampleBtcTx)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getBitcoinSignedTransaction')
    expect(callArg.params).toEqual({ transaction: sampleBtcTx })
    expect(resp.header.status).toBe('success')
  })
})

describe('getBitcoinSignedTransaction — null/undefined 가드 (T-U-BTC-02/03)', () => {
  test('T-U-BTC-02: transaction === null → throw param_error', async () => {
    await expect(getBitcoinSignedTransaction(null as any)).rejects.toEqual(
      expectV1Error('param_error', 'transaction object is undefined or null')
    )
  })

  test('T-U-BTC-03: transaction === undefined → throw param_error', async () => {
    await expect(getBitcoinSignedTransaction(undefined as any)).rejects.toEqual(
      expectV1Error('param_error', 'transaction object is undefined or null')
    )
  })
})

describe('getBitcoinSignedTransaction — 응답 형식 forward (T-RESP-01 BTC)', () => {
  test('T-RESP-01: _call이 v1 fixture를 반환하면 wrapper가 변환 없이 그대로 return', async () => {
    const { transport } = ensureSingleton()
    // call.ts가 raw payload를 wrapV1Success로 감싸므로, 우리는 raw payload만 보낸다.
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { signed_tx: '0xdeadbeef', pubkey: '0xpub' },
    })

    const resp = await getBitcoinSignedTransaction(sampleBtcTx)

    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter).toEqual({ signed_tx: '0xdeadbeef', pubkey: '0xpub' })
  })
})
