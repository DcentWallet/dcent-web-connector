/**
 * getXrpSignedTransaction 단위 테스트 (m08-01-04)
 *
 * T-U-XRP-01: happy path — _call에 method='getXrpSignedTransaction' + params:{key, transaction}
 * T-U-XRP-VALIDATION-01: Account non-string → throw 'TypeError: Required field type is not matched'
 * T-U-XRP-VALIDATION-02: TransactionType non-string → throw
 * T-U-XRP-VALIDATION-03: Fee non-string → throw
 * T-U-XRP-VALIDATION-04: Sequence non-number → throw
 * T-U-XRP-VALIDATION-05: 알 수 없는 TransactionType → throw 'Invalid Transaction Type: ...'
 * T-U-XRP-VALIDATION-06: Fee가 numberString 위반 (예: 'abc') → checkParameter throw
 * T-RESP-01 (XRP): 응답 v1 호환 형식 그대로 forward
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  getXrpSignedTransaction,
  type XrpTxObject,
} from '../../../../../src/sign/nonEvmSimple'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

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

const sampleXrpTx: XrpTxObject = {
  Account: 'rXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  TransactionType: 'Payment',
  Fee: '12',
  Sequence: 100,
  Amount: '1000000',
  Destination: 'rDestXXXXXXXXXXXXXXXXXXXXXXXXX',
}

const KEY = "m/44'/144'/0'/0/0"

describe('getXrpSignedTransaction — happy path (T-U-XRP-01)', () => {
  test('T-U-XRP-01: 정상 입력 → _call({method, params:{key, transaction}}) 단언', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { sign: '0xsig', pubkey: '0xpub', accountId: 'r...' },
    })

    const resp = await getXrpSignedTransaction(sampleXrpTx, KEY)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getXrpSignedTransaction')
    expect(callArg.params).toEqual({ key: KEY, transaction: sampleXrpTx })
    expect(resp.header.status).toBe('success')
  })
})

describe('getXrpSignedTransaction — 인자 type 검증 (T-U-XRP-VALIDATION-01..04)', () => {
  test('T-U-XRP-VALIDATION-01: Account non-string → throw param_error', async () => {
    await expect(
      getXrpSignedTransaction({ ...sampleXrpTx, Account: 123 as any }, KEY)
    ).rejects.toEqual(expectV1Error('param_error', 'Required field type is not matched'))
  })

  test('T-U-XRP-VALIDATION-02: TransactionType non-string → throw param_error', async () => {
    await expect(
      getXrpSignedTransaction({ ...sampleXrpTx, TransactionType: 999 as any }, KEY)
    ).rejects.toEqual(expectV1Error('param_error', 'Required field type is not matched'))
  })

  test('T-U-XRP-VALIDATION-03: Fee non-string → throw param_error', async () => {
    await expect(
      getXrpSignedTransaction({ ...sampleXrpTx, Fee: 12 as any }, KEY)
    ).rejects.toEqual(expectV1Error('param_error', 'Required field type is not matched'))
  })

  test('T-U-XRP-VALIDATION-04: Sequence non-number → throw param_error', async () => {
    await expect(
      getXrpSignedTransaction({ ...sampleXrpTx, Sequence: '100' as any }, KEY)
    ).rejects.toEqual(expectV1Error('param_error', 'Required field type is not matched'))
  })
})

describe('getXrpSignedTransaction — TransactionType enum lookup (T-U-XRP-VALIDATION-05)', () => {
  test('T-U-XRP-VALIDATION-05: 알 수 없는 TransactionType → throw "Invalid Transaction Type: NotARealType"', async () => {
    await expect(
      getXrpSignedTransaction({ ...sampleXrpTx, TransactionType: 'NotARealType' }, KEY)
    ).rejects.toEqual(expectV1Error('param_error', 'Invalid Transaction Type: NotARealType'))
  })
})

describe('getXrpSignedTransaction — Fee numberString 검증 (T-U-XRP-VALIDATION-06)', () => {
  test('T-U-XRP-VALIDATION-06: Fee="abc" → checkParameter throw param_error', async () => {
    await expect(
      getXrpSignedTransaction({ ...sampleXrpTx, Fee: 'abc' }, KEY)
    ).rejects.toEqual(expectV1Error('param_error'))
  })

  test('T-U-XRP-VALIDATION-06b: Fee="0xZZ" → checkParameter throw param_error', async () => {
    await expect(
      getXrpSignedTransaction({ ...sampleXrpTx, Fee: '0xZZ' }, KEY)
    ).rejects.toEqual(expectV1Error('param_error'))
  })
})

describe('getXrpSignedTransaction — 응답 형식 forward (T-RESP-01 XRP)', () => {
  test('T-RESP-01: _call이 v1 fixture 반환 시 변환 없이 forward', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { sign: '0xsignhex', pubkey: '0xpub', accountId: 'rABC' },
    })

    const resp = await getXrpSignedTransaction(sampleXrpTx, KEY)

    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter).toEqual({ sign: '0xsignhex', pubkey: '0xpub', accountId: 'rABC' })
  })
})
