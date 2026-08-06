/**
 * setLabel / syncAccount / selectAddress 단위 테스트
 *
 * setLabel: m08-01-02.5 (변경 없음)
 *   T-U-LABEL-01/02: setLabel valid + invalid 4종
 *
 * syncAccount: **v2 전환 (m09-04-12)**
 *   T-U-SYNC-00: 비배열 입력 → param_error throw
 *   T-U-SYNC-01: v2 native account 정상 → _call
 *   T-U-SYNC-02: v2 token account (token descriptor) → _call
 *   T-U-SYNC-03: invalid chainId → param_error throw
 *   T-U-SYNC-04: keyPath BIP44 형식 위반 → param_error throw
 *   T-U-SYNC-05: keyPath 누락 → param_error throw
 *   T-U-SYNC-06: label regex 위반 → param_error throw
 *   T-U-SYNC-07: token.contract 문자 whitelist 위반 → param_error throw
 *   T-SEC-WHITE-01: unknown 필드 + __proto__ → known-fields만 전달, prototype 오염 없음
 *   T-SEC-WHITE-02: invalid 타입 필드(token.contract=숫자) → throw
 *
 * selectAddress: m08-01-02.5 (변경 없음)
 *   T-U-SEL-01/02: array + non-array
 */

import { setLabel, syncAccount, selectAddress } from '../../../../src/sign/configure'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

// ──────────────────────────────────────────────
// setLabel (m08-01-02.5 — 변경 없음)
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// syncAccount v2 (m09-04-12)
// ──────────────────────────────────────────────
describe('syncAccount v2 — m09-04-12', () => {
  test('T-U-SYNC-00: 비배열 입력(null/object/string) → param_error throw', () => {
    expect(() => syncAccount(null as unknown as [])).toThrow(
      expect.objectContaining({ body: { error: { code: 'param_error', message: 'accountInfos is not array' } } }),
    )
    expect(() => syncAccount({} as unknown as [])).toThrow(
      expect.objectContaining({ body: { error: { code: 'param_error', message: 'accountInfos is not array' } } }),
    )
    expect(() => syncAccount('str' as unknown as [])).toThrow(
      expect.objectContaining({ body: { error: { code: 'param_error', message: 'accountInfos is not array' } } }),
    )
  })

  test('T-U-SYNC-01: v2 native account {chainId, keyPath, label} → _call (coin_group 검증 미호출)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 's1',
      result: { ok: true },
    })

    await syncAccount([{ chainId: 'eip155:1', keyPath: "m/44'/60'/0'/0/0", label: 'myETH' }])

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].method).toBe('syncAccount')
    const sentInfos = sendSpy.mock.calls[0][0].params.accountInfos
    expect(sentInfos).toHaveLength(1)
    expect(sentInfos[0].chainId).toBe('eip155:1')
    expect(sentInfos[0].keyPath).toBe("m/44'/60'/0'/0/0")
    expect(sentInfos[0].label).toBe('myETH')
    // coin_group 필드가 없어야 함 (v1 검증 제거 확인)
    expect(sentInfos[0]).not.toHaveProperty('coin_group')
    expect(sentInfos[0]).not.toHaveProperty('coin_name')
  })

  test('T-U-SYNC-02: v2 token account (token descriptor) → token 그대로 forward', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 's2',
      result: { ok: true },
    })

    await syncAccount([{
      chainId: 'eip155:1',
      keyPath: "m/44'/60'/0'/0/0",
      label: 'USDC',
      // m13-02-08 — top-level contractAddress 는 제거됐다(상세 케이스는
      //   tests/unit/v2/configure/syncAccount.v2.test.ts 의 T-C-TOK-* 참조).
      token: { contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
    }])

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const sentInfos = sendSpy.mock.calls[0][0].params.accountInfos
    expect(sentInfos[0].token).toEqual({
      contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
    })
  })

  test('T-U-SYNC-03: invalid chainId (공백 포함) → param_error throw', () => {
    expect(() =>
      syncAccount([{ chainId: 'eip155 1', keyPath: "m/44'/60'/0'/0/0", label: 'myETH' }]),
    ).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
  })

  test('T-U-SYNC-04: keyPath BIP44 형식 위반("44/60") → param_error throw', () => {
    expect(() =>
      syncAccount([{ chainId: 'eip155:1', keyPath: '44/60', label: 'myETH' }]),
    ).toThrow(
      expect.objectContaining({
        body: { error: { code: 'param_error', message: 'Invalid keyPath - 44/60' } },
      }),
    )
  })

  test('T-U-SYNC-05: keyPath 누락 → param_error throw', () => {
    expect(() =>
      syncAccount([{ chainId: 'eip155:1', keyPath: '', label: 'myETH' }]),
    ).toThrow(
      expect.objectContaining({ body: { error: { code: 'param_error', message: 'keyPath required' } } }),
    )
  })

  test('T-U-SYNC-06: label regex 위반("a") → param_error throw (v1 메시지 보존)', () => {
    expect(() =>
      syncAccount([{ chainId: 'eip155:1', keyPath: "m/44'/60'/0'/0/0", label: 'a' }]),
    ).toThrow(
      expect.objectContaining({ body: { error: { code: 'param_error', message: 'Invalid Label - a' } } }),
    )
  })

  test('T-U-SYNC-07: token.contract 문자 whitelist 위반(공백) → param_error throw', () => {
    expect(() =>
      syncAccount([{ chainId: 'eip155:1', keyPath: "m/44'/60'/0'/0/0", label: 'myToken', token: { contract: 'has space' } }]),
    ).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
  })

  test('T-SEC-WHITE-01: unknown 필드 + __proto__ 포함 → known-fields만 전달, prototype 오염 없음', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'sw1',
      result: { ok: true },
    })

    const malicious = {
      chainId: 'eip155:1',
      keyPath: "m/44'/60'/0'/0/0",
      label: 'myETH',
      unknownField: 'evil',
      extraData: 'should-be-dropped',
    }

    await syncAccount([malicious as unknown as { chainId: string; keyPath: string; label: string }])

    const sentInfos = sendSpy.mock.calls[0][0].params.accountInfos
    expect(sentInfos[0]).not.toHaveProperty('unknownField')
    expect(sentInfos[0]).not.toHaveProperty('extraData')
    // prototype 오염 확인
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
  })

  test('T-SEC-WHITE-02: token.contract 에 숫자 타입 → param_error throw', () => {
    expect(() =>
      syncAccount([{
        chainId: 'eip155:1',
        keyPath: "m/44'/60'/0'/0/0",
        label: 'myToken',
        token: { contract: 12345 as unknown as string },
      }]),
    ).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
  })
})

// ──────────────────────────────────────────────
// selectAddress (m08-01-02.5 — 변경 없음)
// ──────────────────────────────────────────────
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
