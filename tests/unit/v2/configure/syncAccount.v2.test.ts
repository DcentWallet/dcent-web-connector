/**
 * syncAccount v2 단위 테스트 (m09-04-12)
 *
 * T-U-SYNC-00: 비배열 입력 → param_error throw
 * T-U-SYNC-01: v2 native account {chainId, keyPath, label} → _call, coin_group 검증 미호출
 * T-U-SYNC-03: invalid chainId → param_error throw
 * T-U-SYNC-04: keyPath BIP44 형식 위반 → param_error throw
 * T-U-SYNC-05: keyPath 누락 → param_error throw
 * T-U-SYNC-06: label regex 위반 → param_error throw
 * T-U-SYNC-07: token.contract 문자 whitelist 위반 → param_error throw
 * T-SEC-WHITE-01: unknown 필드 → known-fields만 통과, drop 확인
 * T-SEC-WHITE-02: token.contract 숫자 타입 → throw (coerce 금지)
 * T-SEC-WHITE-03: __proto__ own-key(JSON.parse) → forbidden key throw, prototype 오염 없음
 * T-SEC-WHITE-04: constructor own-key → forbidden key throw
 * T-SEC-INHERIT-01: 상속(prototype) 속성은 수집 안 됨 → own-key 부재로 throw
 * T-U-SYNC-08: 비객체 항목(null/숫자/문자열/배열) → param_error throw
 * T-U-SYNC-09: token.contract 빈 문자열('') → throw (silent drop 금지)
 * T-U-SYNC-09b: token 이 비객체 → throw
 *
 * m13-02-08 (토큰 계약 전환 — top-level contractAddress → token descriptor):
 * T-C-TOK-01: token 블록 forward
 * T-C-TOK-02: symbol/decimals 보존 + unknown 키(tokenId 등) drop
 * T-C-TOK-02b: decimals 비정수/범위밖/문자열 → throw
 * T-C-TOK-03: 종전 정규식이 선차단하던 실제 식별자 7종 → 전부 통과 (완화 회귀 가드)
 * T-C-TOK-04: 제거된 top-level contractAddress → unknown 필드로 drop (토큰 오인 없음)
 * T-C-TOK-05: token 블록 안 __proto__ own-key → forbidden key throw
 * T-SEC-INHERIT-02: token 블록 상속 속성 → 수집 안 됨(own-key 부재로 throw)
 *
 * connector-chain-addition-isolation: coin_group/coin_name 검증 제거 확인 포함.
 *   식별자 "형식" 판정도 하지 않는다 — 문자 whitelist + 길이만 본다(T-U-SYNC-07/T-C-TOK-03).
 * dapp-input-sanitization: whitelist + __proto__/constructor 차단 + 상속 속성 무시.
 * boundary-validation: 항목별 비객체 가드.
 * error-handling-consistency: 빈 문자열 token.contract는 silent drop 아닌 throw.
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

  test('T-C-TOK-01: v2 token account (token 블록) → token 그대로 forward', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 's2',
      result: { ok: true },
    })

    await syncAccount([{
      chainId: 'eip155:1',
      keyPath: "m/44'/60'/0'/0/0",
      label: 'USDC',
      token: { contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    }])

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const sentInfos = sendSpy.mock.calls[0][0].params.accountInfos
    expect(sentInfos[0].token).toEqual({
      contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    })
  })

  test('T-C-TOK-02: token.symbol / token.decimals 보존 + unknown 키는 drop', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 's2b', result: { ok: true } })

    await syncAccount([{
      chainId: 'eip155:1',
      keyPath: "m/44'/60'/0'/0/0",
      label: 'FOO',
      token: {
        contract: '0x1111111111111111111111111111111111111111',
        symbol: 'FOO',
        decimals: 6,
        // dapp-input-sanitization — known key 외에는 전달되지 않아야 한다.
        //   (`tokenId` 는 기기 wire 에 담을 곳이 없어 계약에서 제외된 필드다.)
        tokenId: '3',
      } as unknown as { contract: string },
    }])

    const sentInfos = sendSpy.mock.calls[0][0].params.accountInfos
    expect(sentInfos[0].token).toEqual({
      contract: '0x1111111111111111111111111111111111111111',
      symbol: 'FOO',
      decimals: 6,
    })
    expect(sentInfos[0].token).not.toHaveProperty('tokenId')
  })

  test('T-C-TOK-02b: token.decimals 비정수/범위밖/문자열 → param_error throw', () => {
    for (const bad of [6.5, -1, 256, '6']) {
      expect(() =>
        syncAccount([{
          chainId: 'eip155:1',
          keyPath: "m/44'/60'/0'/0/0",
          label: 'FOO',
          token: { contract: '0x1111111111111111111111111111111111111111', decimals: bad as number },
        }]),
      ).toThrow(
        expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
      )
    }
  })

  test('T-C-TOK-03: 종전 정규식이 선차단하던 실제 식별자 7종 → 전부 통과 (완화 회귀 가드)', async () => {
    // m13-02-08 — wm 레지스트리 5080종 중 455종(14 family)이 connector 단계에서 막히고 있었다.
    //   각 family 의 실제 등록 식별자에서 하나씩 뽑은 표본이다.
    const identifiers = [
      '0.0.333611', // HEDERA
      'token.sweat', // NEAR
      'AQUA-GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA', // STELLAR (code-issuer)
      'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token::diko', // STACKS (on-chain form)
      '1002000', // TRON (TRC-10)
      'cfx:achc8nxj7r451c223m18w2dwjnmhkd6rxawrvkvsy', // CONFLUX (base32)
      '4353430000000000000000000000000000000000.rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr', // XRP
    ]

    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 's2c', result: { ok: true } })

    await syncAccount(identifiers.map((contract, i) => ({
      chainId: 'eip155:1',
      keyPath: "m/44'/60'/0'/0/0",
      label: `tok${i}`,
      token: { contract },
    })))

    const sentInfos = sendSpy.mock.calls[0][0].params.accountInfos
    expect(sentInfos.map((it: { token: { contract: string } }) => it.token.contract)).toEqual(identifiers)
  })

  test('T-C-TOK-04: 제거된 top-level contractAddress → unknown 필드로 drop (토큰 오인 없음)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 's2d', result: { ok: true } })

    await syncAccount([{
      chainId: 'eip155:1',
      keyPath: "m/44'/60'/0'/0/0",
      label: 'ETH-1',
      contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    } as unknown as { chainId: string; keyPath: string; label: string }])

    const sentInfos = sendSpy.mock.calls[0][0].params.accountInfos
    expect(sentInfos[0]).not.toHaveProperty('contractAddress')
    expect(sentInfos[0]).not.toHaveProperty('token')
  })

  test('T-SEC-INHERIT-02: token 블록의 상속(prototype) 속성은 수집 안 됨 → own-key 부재로 throw', () => {
    // 🔴 상위 항목의 T-SEC-INHERIT-01 과 대칭. forbidden key 만 훑고 원본에서 직접 읽으면
    //    prototype 에만 contract 를 둔 객체가 `Object.keys()` 에 안 잡혀 검사를 통과한 뒤
    //    **상속값이 채택**된다. own-enumerable 스냅샷을 떠야 막힌다.
    const tokenProto = { contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }
    const inheritedToken = Object.create(tokenProto) as { contract: string }
    expect(() =>
      syncAccount([{
        chainId: 'eip155:1',
        keyPath: "m/44'/60'/0'/0/0",
        label: 'myToken',
        token: inheritedToken,
      }]),
    ).toThrow(
      expect.objectContaining({ body: { error: { code: 'param_error', message: 'token.contract required' } } }),
    )
  })

  test('T-C-TOK-05: token 블록 안의 __proto__ own-key → forbidden key throw + 오염 없음', () => {
    const malicious = JSON.parse(
      '{"chainId":"eip155:1","keyPath":"m/44\'/60\'/0\'/0/0","label":"myETH",' +
        '"token":{"contract":"0x1111111111111111111111111111111111111111","__proto__":{"tokenPolluted":true}}}',
    )
    expect(() => syncAccount([malicious])).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
    expect((Object.prototype as Record<string, unknown>).tokenPolluted).toBeUndefined()
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

  test('T-U-SYNC-07: token.contract 문자 whitelist 위반 → param_error throw', () => {
    // 완화된 whitelist 도 여전히 막는 것들 — 공백 / 따옴표 / 꺾쇠 / 역슬래시 / 128자 초과.
    //   (`notahex` 같은 "형식이 아닌" 값은 이제 통과시킨다 — 형식 판정은 지갑 몫이고
    //    connector 에 chain 분기를 두지 않기 위함이다. 실패는 -32602 로 돌아온다.)
    const badContracts = [
      'has space',
      'quote"inject',
      '<script>',
      'back\\slash',
      'A'.repeat(129),
    ]
    for (const contract of badContracts) {
      expect(() =>
        syncAccount([{ chainId: 'eip155:1', keyPath: "m/44'/60'/0'/0/0", label: 'myToken', token: { contract } }]),
      ).toThrow(
        expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
      )
    }
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

  test('T-SEC-WHITE-02: token.contract 에 숫자 타입 → param_error throw (coerce 금지)', () => {
    // 숫자를 String() 으로 접으면 Polkadot asset id(39자리)가 배정밀도에서 이미 뭉개진 채
    //   통과한다. 타입 단계에서 막는다.
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

  test('T-U-SYNC-09: token.contract 빈 문자열 → param_error throw (silent drop 금지)', () => {
    // silent drop 하면 "토큰 의도인데 식별자 누락"이 native-coin 계정으로 둔갑해
    //   엉뚱한 자산이 기기에 등록된다.
    expect(() =>
      syncAccount([{
        chainId: 'eip155:1',
        keyPath: "m/44'/60'/0'/0/0",
        label: 'myToken',
        token: { contract: '' },
      }]),
    ).toThrow(
      expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
    )
  })

  test('T-U-SYNC-09b: token 이 비객체(문자열/배열) → param_error throw', () => {
    for (const bad of ['0xdead', ['0xdead']]) {
      expect(() =>
        syncAccount([{
          chainId: 'eip155:1',
          keyPath: "m/44'/60'/0'/0/0",
          label: 'myToken',
          token: bad as unknown as { contract: string },
        }]),
      ).toThrow(
        expect.objectContaining({ body: expect.objectContaining({ error: expect.objectContaining({ code: 'param_error' }) }) }),
      )
    }
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
