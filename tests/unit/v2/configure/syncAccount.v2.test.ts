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
 * T-SEC-WHITE-01: unknown 필드 → known-fields만 통과, drop 확인
 * T-SEC-WHITE-02: invalid 타입 contractAddress(숫자) → throw
 * T-SEC-WHITE-03: __proto__ own-key(JSON.parse) → forbidden key throw, prototype 오염 없음
 * T-SEC-WHITE-04: constructor own-key → forbidden key throw
 * T-SEC-INHERIT-01: 상속(prototype) 속성은 수집 안 됨 → own-key 부재로 throw
 * T-U-SYNC-08: 비객체 항목(null/숫자/문자열/배열) → param_error throw
 * T-U-SYNC-09: contractAddress 빈 문자열('') → throw (silent drop 금지)
 *
 * connector-chain-addition-isolation: coin_group/coin_name 검증 제거 확인 포함.
 * dapp-input-sanitization: whitelist + __proto__/constructor 차단 + 상속 속성 무시.
 * boundary-validation: 항목별 비객체 가드.
 * error-handling-consistency: 빈 문자열 contractAddress는 silent drop 아닌 throw.
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

  test('T-U-SYNC-AF-01: meta.addressFormat(segwit-native) → forward (BTC variant disambiguation)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 's3', result: { ok: true } })

    await syncAccount([{
      chainId: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
      keyPath: "m/44'/0'/0'/0/0",
      label: 'BTC-SEGWIT',
      meta: { addressFormat: 'segwit-native' },
    } as unknown as never])

    const sentInfos = sendSpy.mock.calls[0][0].params.accountInfos
    expect(sentInfos[0].meta).toEqual({ addressFormat: 'segwit-native' })
  })

  test('T-U-SYNC-AF-02: meta.addressFormat 미허용 enum → param_error (동기 throw, getAddress와 동일 검증)', () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({ id: 's4', result: { ok: true } })

    expect(() => syncAccount([{
      chainId: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
      keyPath: "m/44'/0'/0'/0/0",
      label: 'BTC',
      meta: { addressFormat: 'banana' },
    } as unknown as never])).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
  })

  test('T-U-SYNC-AF-03: meta 없음 / addressFormat 없음 → meta 미forward (회귀 0)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 's5', result: { ok: true } })

    await syncAccount([
      { chainId: 'eip155:1', keyPath: "m/44'/60'/0'/0/0", label: 'noMeta' },
      { chainId: 'eip155:1', keyPath: "m/44'/60'/0'/0/0", label: 'emptyMeta', meta: {} } as unknown as never,
    ])

    const sentInfos = sendSpy.mock.calls[0][0].params.accountInfos
    expect(sentInfos[0]).not.toHaveProperty('meta')
    expect(sentInfos[1]).not.toHaveProperty('meta')
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

  test('T-SEC-WHITE-03: __proto__ own-key(JSON.parse) → forbidden key throw + prototype 오염 없음', () => {
    // 객체 리터럴 {__proto__:...}는 prototype을 설정할 뿐 own-key가 아니므로
    // 실제 own-enumerable __proto__ 키는 JSON.parse로만 주입 가능
    const malicious = JSON.parse(
      '{"chainId":"eip155:1","keyPath":"m/44\'/60\'/0\'/0/0","label":"myETH","__proto__":{"polluted":true}}',
    )
    expect(() => syncAccount([malicious])).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
  })

  test('T-SEC-WHITE-04: constructor own-key → forbidden key param_error throw', () => {
    const malicious = JSON.parse(
      '{"chainId":"eip155:1","keyPath":"m/44\'/60\'/0\'/0/0","label":"myETH","constructor":{"x":1}}',
    )
    expect(() => syncAccount([malicious])).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
  })

  test('T-SEC-INHERIT-01: 상속(prototype) 속성은 수집 안 됨 → own-key 부재로 throw', () => {
    // chainId/keyPath/label을 prototype 체인에만 둔 객체 → own-enumerable 아님 →
    // sanitizer 스냅샷에 수집되지 않아 chainId 누락으로 throw
    const proto = { chainId: 'eip155:1', keyPath: "m/44'/60'/0'/0/0", label: 'myETH' }
    const inherited = Object.create(proto) as { chainId: string; keyPath: string; label: string }
    expect(() => syncAccount([inherited])).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
  })

  test('T-U-SYNC-08: 비객체 항목(null/숫자/문자열/배열) → param_error throw', () => {
    for (const bad of [null, 42, 'str', ['nested']]) {
      expect(() =>
        syncAccount([bad as unknown as { chainId: string; keyPath: string; label: string }]),
      ).toThrow(
        expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
      )
    }
  })

  test('T-U-SYNC-09: contractAddress 빈 문자열 → param_error throw (silent drop 금지)', () => {
    expect(() =>
      syncAccount([{
        chainId: 'eip155:1',
        contractAddress: '',
        keyPath: "m/44'/60'/0'/0/0",
        label: 'myToken',
      }]),
    ).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
  })

  test('T-U-SYNC-10: keyPath 키 자체 누락(undefined) → param_error throw', () => {
    expect(() =>
      syncAccount([{ chainId: 'eip155:1', label: 'myETH' } as unknown as { chainId: string; keyPath: string; label: string }]),
    ).toThrow(
      expect.objectContaining({ body: { error: { code: 'param_error', message: 'keyPath required' } } }),
    )
  })

  test('T-U-SYNC-11: label 키 자체 누락(undefined) → 빈 라벨로 간주되어 param_error throw', () => {
    expect(() =>
      syncAccount([{ chainId: 'eip155:1', keyPath: "m/44'/60'/0'/0/0" } as unknown as { chainId: string; keyPath: string; label: string }]),
    ).toThrow(
      expect.objectContaining({ body: { error: { code: 'param_error', message: 'Invalid Label - ' } } }),
    )
  })
})
