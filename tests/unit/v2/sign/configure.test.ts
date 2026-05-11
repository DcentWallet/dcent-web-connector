/**
 * setLabel / syncAccount / selectAddress 단위 테스트 (m08-01-02.5)
 *
 * T-U-LABEL-01/02: setLabel valid + invalid 4종
 * T-U-SYNC-01..05: syncAccount 3종 검증 + 다중 account
 * T-U-SEL-01/02: selectAddress array + non-array
 */

import { setLabel, syncAccount, selectAddress } from '../../../../src/sign/configure'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('setLabel — m08-01-02.5', () => {
  test('T-U-LABEL-01: valid label "valid_label-2" → _call', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: { ok: true },
    })

    await setLabel('valid_label-2')

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].method).toBe('setLabel')
    expect(sendSpy.mock.calls[0][0].params).toEqual({ label: 'valid_label-2' })
  })

  test('T-U-LABEL-02a: too short ("a") → param_error throw', () => {
    expect(() => setLabel('a')).toThrow(
      expect.objectContaining({
        body: { error: { code: 'param_error', message: 'Invalid Label : a' } },
      }),
    )
  })

  test('T-U-LABEL-02b: too long (15 chars) → param_error throw', () => {
    const long15 = 'A'.repeat(15)
    expect(() => setLabel(long15)).toThrow(
      expect.objectContaining({ body: { error: { code: 'param_error', message: `Invalid Label : ${long15}` } } }),
    )
  })

  test('T-U-LABEL-02c: 한글 → param_error throw', () => {
    expect(() => setLabel('한글라벨')).toThrow(
      expect.objectContaining({
        body: { error: { code: 'param_error', message: 'Invalid Label : 한글라벨' } },
      }),
    )
  })

  test('T-U-LABEL-02d: 공백 포함 → param_error throw', () => {
    expect(() => setLabel('has space')).toThrow(
      expect.objectContaining({
        body: { error: { code: 'param_error', message: 'Invalid Label : has space' } },
      }),
    )
  })
})

describe('syncAccount — m08-01-02.5', () => {
  test('T-U-SYNC-01: valid account → 3종 검증 통과 + _call', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 's1',
      result: { ok: true },
    })

    const validAccount = {
      coin_group: 'BITCOIN',
      coin_name: 'BITCOIN',
      label: 'main',
    }
    await syncAccount([validAccount])

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].method).toBe('syncAccount')
    expect(sendSpy.mock.calls[0][0].params).toEqual({ accountInfos: [validAccount] })
  })

  test('T-U-SYNC-02: invalid coin_group ("random") → coin_group_error throw', () => {
    expect(() =>
      syncAccount([{ coin_group: 'random_unknown', coin_name: 'BITCOIN', label: 'main' }]),
    ).toThrow(
      expect.objectContaining({
        body: { error: { code: 'coin_group_error', message: 'not supported coin group' } },
      }),
    )
  })

  test('T-U-SYNC-03: ERC20 + coin_name without 0x prefix → coin_name_error throw', () => {
    expect(() =>
      syncAccount([{ coin_group: 'ERC20', coin_name: 'noprefix', label: 'main' }]),
    ).toThrow(
      expect.objectContaining({
        body: { error: { code: 'coin_name_error', message: 'not supported coin name' } },
      }),
    )
  })

  test('T-U-SYNC-04: valid group/name + invalid label ("a") → param_error throw', () => {
    expect(() =>
      syncAccount([{ coin_group: 'BITCOIN', coin_name: 'BITCOIN', label: 'a' }]),
    ).toThrow(
      expect.objectContaining({
        body: { error: { code: 'param_error', message: 'Invalid Label - a' } },
      }),
    )
  })

  test('T-U-SYNC-05: 다중 account 중 두 번째가 invalid → throw + _call 미호출 (early throw)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 's5',
      result: { ok: true },
    })

    const validAccount = { coin_group: 'BITCOIN', coin_name: 'BITCOIN', label: 'main' }
    const invalidAccount = { coin_group: 'random_unknown', coin_name: 'X', label: 'sub' }

    expect(() => syncAccount([validAccount, invalidAccount])).toThrow(
      expect.objectContaining({
        body: { error: { code: 'coin_group_error', message: 'not supported coin group' } },
      }),
    )

    expect(sendSpy).not.toHaveBeenCalled()
  })
})

describe('selectAddress — m08-01-02.5', () => {
  test('T-U-SEL-01: array → _call', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'sa1',
      result: { ok: true },
    })

    await selectAddress(['addr1', 'addr2'])

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].method).toBe('selectAddress')
    expect(sendSpy.mock.calls[0][0].params).toEqual({ addresses: ['addr1', 'addr2'] })
  })

  test('T-U-SEL-02: non-array → param_error throw', () => {
    expect(() => selectAddress('notarray' as unknown as string[])).toThrow(
      expect.objectContaining({
        body: { error: { code: 'param_error', message: 'addresses is not array' } },
      }),
    )
  })
})
