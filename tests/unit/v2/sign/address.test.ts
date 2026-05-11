/**
 * getAddress / getXPUB 단위 테스트 (m08-01-02.5)
 *
 * T-U-ADDR-01: getAddress('ETHEREUM', path) → 평범한 coinType (czone/parachain 분기 안 탐)
 * T-U-ADDR-02: getAddress('COREUM', path) → czone 변환 + optionParam
 * T-U-ADDR-03: getAddress('PARA', path, '5') → parachain prefix → optionParam: 5
 * T-U-ADDR-04: getAddress('PARA', path, NaN) → param_error reject
 * T-U-ADDR-05: response header.response_from === 'czone' → coinType으로 복원
 * T-U-ADDR-06: getAddress(invalidCoinType, ...) → coin_type_error reject
 * T-U-XPUB-01: getXPUB(key, bip32name) → _call
 *
 * T-U-PARACHAIN-PREFIX-01..04: 0 / '' / NaN / null 모두 reject (v1 !Number(prefix) 1:1)
 *
 * NOTE: getAddress는 `async function`이므로 sync `throw`도 reject로 변환된다.
 *       에러 검증은 `await expect(...).rejects.toEqual(...)` 패턴 사용.
 */

import { Buffer } from 'buffer'
import { getAddress, getXPUB } from '../../../../src/sign/address'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

const expectV1Error = (code: string, message?: string) =>
  expect.objectContaining({
    body: {
      error: message !== undefined ? { code, message } : expect.objectContaining({ code }),
    },
  })

describe('getAddress — m08-01-02.5', () => {
  test('T-U-ADDR-01: 일반 coinType — params {coinType, path}만 (czone/parachain 분기 안 탐)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { address: '0xabc' },
    })

    const resp = await getAddress('ETHEREUM', "m/44'/60'/0'/0/0")

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getAddress')
    expect(callArg.params).toEqual({
      coinType: 'ETHEREUM',
      path: "m/44'/60'/0'/0/0",
    })
    expect(callArg.params).not.toHaveProperty('optionParam')
    expect(resp.header.status).toBe('success')
  })

  test('T-U-ADDR-02: COREUM (czone) — coinType="czone" + optionParam hex of "core"', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r2',
      result: { address: 'core1abc...' },
    })

    await getAddress('COREUM', "m/44'/118'/0'/0/0")

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params?.coinType).toBe('czone')
    expect(callArg.params?.optionParam).toBe(Buffer.from('core', 'utf8').toString('hex'))
  })

  test('T-U-ADDR-03: PARA + prefix="5" — optionParam: 5 (number)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r3',
      result: { address: 'parachain-addr' },
    })

    await getAddress('PARA', "m/44'/354'/0'/0/0", '5')

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params?.coinType).toBe('PARA')
    expect(callArg.params?.optionParam).toBe(5)
    expect(typeof callArg.params?.optionParam).toBe('number')
  })

  test('T-U-ADDR-04: PARA + prefix=NaN → param_error reject', async () => {
    await expect(getAddress('PARA', 'path', NaN)).rejects.toEqual(
      expectV1Error('param_error', 'Invaild Parameter'),
    )
  })

  test('T-U-ADDR-05: response_from === czone → coinType으로 복원', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r5',
      result: {
        header: { version: '1.0', status: 'success', response_from: 'czone' },
        body: { command: 'getAddress', parameter: { address: 'core1abc' } },
      },
    })

    const resp = await getAddress('COREUM', "m/44'/118'/0'/0/0")
    expect(resp.header.response_from).toBe('COREUM')
  })

  test('T-U-ADDR-06: invalid coinType → coin_type_error reject', async () => {
    await expect(getAddress('UNKNOWN_COIN', 'path')).rejects.toEqual(
      expectV1Error('coin_type_error', 'not supported coin type'),
    )
  })
})

describe('getXPUB — m08-01-02.5', () => {
  test('T-U-XPUB-01: getXPUB(key, bip32name) → _call', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r-xpub',
      result: { xpub: 'xpub6...' },
    })

    await getXPUB("m/44'/0'/0'", 'Bitcoin seed')

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getXPUB')
    expect(callArg.params).toEqual({ key: "m/44'/0'/0'", bip32name: 'Bitcoin seed' })
  })
})

describe('parachain prefix edge cases — v1 !Number(prefix) 1:1', () => {
  // v1 `if (!Number(prefix)) throw` — 0/''/null/undefined/NaN/non-numeric string 모두 reject

  test('T-U-PARACHAIN-PREFIX-01: prefix=0 → param_error (!Number(0) = true)', async () => {
    await expect(getAddress('PARA', 'path', 0)).rejects.toEqual(
      expectV1Error('param_error', 'Invaild Parameter'),
    )
  })

  test('T-U-PARACHAIN-PREFIX-02: prefix="" → param_error (Number("") = 0)', async () => {
    await expect(getAddress('PARA', 'path', '')).rejects.toEqual(
      expectV1Error('param_error', 'Invaild Parameter'),
    )
  })

  test('T-U-PARACHAIN-PREFIX-03: prefix=NaN → param_error', async () => {
    await expect(getAddress('PARA', 'path', NaN)).rejects.toEqual(
      expectV1Error('param_error'),
    )
  })

  test('T-U-PARACHAIN-PREFIX-04: prefix=null → param_error (Number(null) = 0)', async () => {
    await expect(getAddress('PARA', 'path', null)).rejects.toEqual(
      expectV1Error('param_error'),
    )
  })
})
