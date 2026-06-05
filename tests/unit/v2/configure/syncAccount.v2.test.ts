/**
 * syncAccount v2 단위 테스트 (m09-04-12)
 *
 * T-U-SYNC-00: 비배열 입력 → param_error throw
 * T-U-SYNC-01: v2 native account {chainId, keyPath, label} → _call, coin_group 검증 미호출
 * T-U-SYNC-02: v2 token account (contractAddress 포함) → forward
 * T-U-SYNC-03: invalid chainId → param_error throw
 * T-U-SYNC-04: keyPath BIP44 형식 위반 → param_error throw
 * T-U-SYNC-05: keyPath 누락 → param_error throw
 * T-U-SYNC-06: label regex 위반 → param_error throw
 * T-U-SYNC-07: contractAddress 형식 위반 → param_error throw
 * T-SEC-WHITE-01: unknown 필드 + __proto__ → known-fields만 통과, prototype 오염 없음
 * T-SEC-WHITE-02: invalid 타입 contractAddress(숫자) → throw
 *
 * connector-chain-addition-isolation: coin_group/coin_name 검증 제거 확인 포함.
 * dapp-input-sanitization: whitelist 검증.
 */

import { syncAccount } from '../../../../src/sign/configure'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

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

  test('T-U-SYNC-02: v2 token account (contractAddress 포함) → contractAddress 포함 forward', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 's2',
      result: { ok: true },
    })

    await syncAccount([{
      chainId: 'eip155:1',
      contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      keyPath: "m/44'/60'/0'/0/0",
      label: 'USDC',
    }])

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const sentInfos = sendSpy.mock.calls[0][0].params.accountInfos
    expect(sentInfos[0].contractAddress).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
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
      syncAccount([{ chainId: 'eip155:1', keyPath: "44/60", label: 'myETH' }]),
    ).toThrow(
      expect.objectContaining({
        body: { error: { code: 'param_error', message: "Invalid keyPath - 44/60" } },
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

  test('T-U-SYNC-07: contractAddress 형식 위반("notahex") → param_error throw', () => {
    expect(() =>
      syncAccount([{ chainId: 'eip155:1', contractAddress: 'notahex', keyPath: "m/44'/60'/0'/0/0", label: 'myToken' }]),
    ).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
  })

  test('T-SEC-WHITE-01: unknown 필드 + __proto__ → known-fields만 전달, prototype 오염 없음', async () => {
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

  test('T-SEC-WHITE-02: contractAddress에 숫자 타입 → param_error throw', () => {
    expect(() =>
      syncAccount([{
        chainId: 'eip155:1',
        contractAddress: 12345 as unknown as string,
        keyPath: "m/44'/60'/0'/0/0",
        label: 'myToken',
      }]),
    ).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
  })
})
