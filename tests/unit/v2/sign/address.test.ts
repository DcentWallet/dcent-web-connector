/**
 * getAddress / getXPUB 단위 테스트 (m08-01-02.5) + v2 chainId facade (m11-01-02)
 *
 * v1 (기존 — 회귀 가드):
 *   T-U-ADDR-01: getAddress('ETHEREUM', path) → 평범한 coinType (czone/parachain 분기 안 탐)
 *   T-U-ADDR-02: getAddress('COREUM', path) → czone 변환 + optionParam
 *   T-U-ADDR-03: getAddress('PARA', path, '5') → parachain prefix → optionParam: 5
 *   T-U-ADDR-04: getAddress('PARA', path, NaN) → param_error reject
 *   T-U-ADDR-05: response header.response_from === 'czone' → coinType으로 복원
 *   T-U-ADDR-06: getAddress(invalidCoinType, ...) → coin_type_error reject
 *   T-U-XPUB-01: getXPUB(key, bip32name) → _call
 *
 * v1 parachain edge cases (기존):
 *   T-U-PARACHAIN-PREFIX-01..04: 0 / '' / NaN / null 모두 reject (v1 !Number(prefix) 1:1)
 *
 * **v2 chainId facade (m11-01-02 신규)**:
 *   T-U-01: getAddress({chainId, keyPath}) → params={chainId, keyPath} 송신
 *   T-U-02: getAddress({chainId: '', keyPath}) → param_error (chainId required)
 *   T-U-03: getAddress({chainId} as any) (keyPath 누락) → param_error (keyPath required)
 *   T-U-04: v1 회귀 — getAddress('ETHEREUM', path) → 기존 동작 (T-U-ADDR-01 중복 가드)
 *   T-U-05: v1 prefix 회귀 — getAddress('PARA', path, '5') → 기존 동작 (T-U-ADDR-03 중복 가드)
 *   T-U-06: 컴파일 — overload 타입 추론 (TypeScript compile-time only; tsc로 검증)
 *   T-U-07: getAddress({chainId: 'eip155:1@#$invalid', ...}) → param_error (whitelist 위반)
 *   T-U-08: getAddress(['ETHEREUM', path] as any) → param_error (array 명시 거부)
 *
 * NOTE: getAddress는 overload async function이므로 sync `throw`도 reject로 변환된다.
 *       에러 검증은 `await expect(...).rejects.toEqual(...)` 패턴 사용.
 */

import { Buffer } from 'buffer'
import { getAddress, getXPUB, type GetAddressV2Input, _sanitizeAddressFormat } from '../../../../src/sign/address'
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
    const callArg = sendSpy.mock.calls[0][0] as any
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

    const callArg = sendSpy.mock.calls[0][0] as any
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

    const callArg = sendSpy.mock.calls[0][0] as any
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

    const callArg = sendSpy.mock.calls[0][0] as any
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

// ──────────────────────────────────────────────────────────────────────────
// m11-01-02 — v2 chainId facade
// ──────────────────────────────────────────────────────────────────────────

describe('getAddress v2 chainId facade — m11-01-02', () => {
  test('T-U-01: v2 path {chainId, keyPath} → params={chainId, keyPath} 송신 (mock sdk가 수신)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'v2-r1',
      result: {
        header: { version: '1.0', status: 'success', response_from: 'eip155:1' },
        body: { command: 'getAddress', parameter: { address: '0xabc...' } },
      },
    })

    const resp = await getAddress({
      chainId: 'eip155:1/slip44:60',
      keyPath: "m/44'/60'/0'/0/0",
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.method).toBe('getAddress')
    expect(callArg.chainId).toBe('eip155:1/slip44:60')
    expect(callArg.params).toEqual({
      chainId: 'eip155:1/slip44:60',
      keyPath: "m/44'/60'/0'/0/0",
    })
    // v1 path의 흔적(coinType/path/optionParam)이 섞이지 않는지 가드
    expect(callArg.params).not.toHaveProperty('coinType')
    expect(callArg.params).not.toHaveProperty('path')
    expect(callArg.params).not.toHaveProperty('optionParam')
    expect(resp.header.status).toBe('success')
  })

  test('T-U-01.b: v2 path with prefix → params에 prefix 포함', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'v2-r1b',
      result: { address: 'core1abc' },
    })

    await getAddress({
      chainId: 'cosmos:core-mainnet-1',
      keyPath: "m/44'/118'/0'/0/0",
      prefix: 'core',
    })

    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.params).toEqual({
      chainId: 'cosmos:core-mainnet-1',
      keyPath: "m/44'/118'/0'/0/0",
      prefix: 'core',
    })
  })

  test('T-U-02: v2 path chainId 빈 문자열 → param_error reject', async () => {
    await expect(
      getAddress({ chainId: '', keyPath: "m/44'/60'/0'/0/0" }),
    ).rejects.toEqual(expectV1Error('param_error', 'chainId required'))
  })

  test('T-U-02.b: v2 path chainId가 string이 아님 → param_error reject', async () => {
    await expect(
      // 런타임에 App이 typescript 우회해서 잘못된 타입을 보낼 수 있는 케이스 가드
      getAddress({ chainId: 123 as unknown as string, keyPath: "m/44'/60'/0'/0/0" }),
    ).rejects.toEqual(expectV1Error('param_error', 'chainId required'))
  })

  test('T-U-03: v2 path keyPath 누락 → param_error reject (keyPath required)', async () => {
    await expect(
      // App이 keyPath 빠뜨린 케이스
      getAddress({ chainId: 'eip155:1/slip44:60' } as unknown as GetAddressV2Input),
    ).rejects.toEqual(expectV1Error('param_error', 'keyPath required'))
  })

  test('T-U-03.b: v2 path keyPath 빈 문자열 → param_error reject', async () => {
    await expect(
      getAddress({ chainId: 'eip155:1/slip44:60', keyPath: '' }),
    ).rejects.toEqual(expectV1Error('param_error', 'keyPath required'))
  })

  test('T-U-04: v1 path 회귀 — getAddress("ETHEREUM", path) → 기존 v1 payload 송신', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'v1-r1',
      result: { address: '0xabc' },
    })

    await getAddress('ETHEREUM', "m/44'/60'/0'/0/0")

    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.method).toBe('getAddress')
    // v1 path는 chainId 필드를 보내지 않음
    expect(callArg.chainId).toBeUndefined()
    expect(callArg.params).toEqual({
      coinType: 'ETHEREUM',
      path: "m/44'/60'/0'/0/0",
    })
  })

  test('T-U-05: v1 path 회귀 — getAddress("PARA", path, "5") → 기존 v1 prefix 동작', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'v1-r2',
      result: { address: 'parachain-addr' },
    })

    await getAddress('PARA', "m/44'/354'/0'/0/0", '5')

    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.params?.optionParam).toBe(5)
    expect(callArg.params?.coinType).toBe('PARA')
    expect(callArg.chainId).toBeUndefined()
  })

  test('T-U-06: overload 타입 추론 — v2/v1 양쪽 모두 컴파일 통과 (compile-time, runtime은 stub)', async () => {
    // 본 테스트는 TypeScript의 overload 타입 추론을 컴파일 시점에 검증한다.
    // 실제 실행은 _call 호출이 가지 않도록 mock된 transport로 fast-fail.
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 't6',
      result: { address: '0x' },
    })

    // v2 overload — input 객체 추론
    const v2Input: GetAddressV2Input = {
      chainId: 'eip155:1',
      keyPath: "m/44'/60'/0'/0/0",
    }
    const v2Resp = await getAddress(v2Input)
    expect(v2Resp.header.status).toBe('success')

    // v1 overload — string coinType 추론 (positional args)
    const v1Resp = await getAddress('ETHEREUM', "m/44'/60'/0'/0/0")
    expect(v1Resp.header.status).toBe('success')
  })

  test('T-U-07: v2 path chainId whitelist 위반 (특수문자) → param_error reject', async () => {
    await expect(
      getAddress({
        chainId: 'eip155:1@#$invalid',
        keyPath: "m/44'/60'/0'/0/0",
      }),
    ).rejects.toEqual(expectV1Error('param_error', 'chainId required'))
  })

  test('T-U-08: array 입력 → param_error reject (typeof [] === object 함정 명시 거부)', async () => {
    await expect(
      // App이 실수로 array를 보낼 경우 (TypeScript 우회 시 catch 가능해야 함)
      getAddress(['ETHEREUM', "m/44'/60'/0'/0/0"] as any),
    ).rejects.toEqual(
      expectV1Error(
        'param_error',
        'getAddress: array input not supported (expected string coinType or object {chainId, keyPath})',
      ),
    )
  })

  test('T-U-09: v2 path가 sdk에 chainId를 _call.chainId 필드로 전달 (m11-02 sdk handler가 활용)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'v2-r9',
      result: { address: '0xdef' },
    })

    await getAddress({
      chainId: 'bip122:000000000019d6689c085ae165831e93',
      keyPath: "m/44'/0'/0'/0/0",
    })

    const callArg = sendSpy.mock.calls[0][0] as any
    // _call의 chainId 필드 — m11-02 sdk handler가 envelope의 chainId로 dispatch에 사용
    expect(callArg.chainId).toBe('bip122:000000000019d6689c085ae165831e93')
    // params에도 동일 chainId 포함 (sdk가 둘 중 어느 쪽을 쓰든 동등)
    expect(callArg.params?.chainId).toBe('bip122:000000000019d6689c085ae165831e93')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// m11-01-02 — chain isolation 회귀 가드
// ──────────────────────────────────────────────────────────────────────────

describe('getAddress chain isolation — connector-chain-addition-isolation 룰', () => {
  test('v2 path에서 method는 항상 "getAddress" literal (chain 식별자 단위 분기 0건)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'iso-r1',
      result: { address: '0x' },
    })

    // 서로 다른 chainId 3개에 대해 모두 method='getAddress' 송신 확인
    const chainIds = ['eip155:1', 'bip122:000000000019d6689c085ae165831e93', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc6']
    for (const chainId of chainIds) {
      await getAddress({ chainId, keyPath: "m/44'/0'/0'/0/0" })
    }

    expect(sendSpy).toHaveBeenCalledTimes(chainIds.length)
    for (let i = 0; i < chainIds.length; i++) {
      // chain enum / PREFIX_TO_METHOD / chain-prefixed switch 추가 없이 chain-agnostic
      expect(sendSpy.mock.calls[i][0].method).toBe('getAddress')
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────
// m09-04-09 / m21-02 — addressFormat field (multi-variant dispatch).
//   🔴 BTC 인코딩 축 + BTC 밖 파생 표준 축('ledger') 둘 다. BTC 전용이 아니다.
// ──────────────────────────────────────────────────────────────────────────

describe('getAddress v2 — addressFormat field (m09-04-09)', () => {
  test('T-U-ADF-V2-01: addressFormat segwit-native → envelope.params.addressFormat 동행', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'adf-r1',
      result: { address: 'bc1q...' },
    })

    await getAddress({
      chainId: 'bip122:000000000019d6689c085ae165831e93',
      keyPath: "m/84'/0'/0'/0/0",
      addressFormat: 'segwit-native',
    })

    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.params.addressFormat).toBe('segwit-native')
    expect(callArg.method).toBe('getAddress')
  })

  test('T-U-ADF-V2-02: addressFormat undefined → envelope.params에 addressFormat 필드 부재', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'adf-r2',
      result: { address: '1abc...' },
    })

    await getAddress({
      chainId: 'bip122:000000000019d6689c085ae165831e93',
      keyPath: "m/44'/0'/0'/0/0",
    })

    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.params).not.toHaveProperty('addressFormat')
  })

  /**
    * 🔴 **알려지지 않은 형식은 connector 가 막지 않고 sdk 로 넘긴다.**
    * 여기서 막으면 sdk/wm 이 새 형식을 열 때마다 connector 를 재배포해야 하고, 그때까지
    * App 은 이미 열린 형식을 못 쓴다(connector 는 npm — App 이 의존성을 올려야 반영된다).
    * 관측점은 **양성**이다: 값이 envelope 에 그대로 실렸는가. "안 던진다" 만 보면
    * 값이 조용히 탈락해도 통과한다.
    */
  test('T-U-ADF-V2-03: 미지 형식은 거부하지 않고 envelope 에 그대로 실어 sdk 로 넘긴다', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'adf-r3',
      result: { address: 'bc1p...' },
    })

    await getAddress({
      chainId: 'bip122:000000000019d6689c085ae165831e93',
      keyPath: "m/86'/0'/0'/0/0",
      addressFormat: 'a-format-connector-has-never-heard-of',
    })

    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.params.addressFormat).toBe('a-format-connector-has-never-heard-of')
  })

  test('T-U-ADF-V2-04: addressFormat number → param_error throw', async () => {
    await expect(
      getAddress({
        chainId: 'bip122:000000000019d6689c085ae165831e93',
        keyPath: "m/44'/0'/0'/0/0",
        addressFormat: 123 as any,
      }),
    ).rejects.toEqual(expectV1Error('param_error'))
  })

  test('T-U-ADF-V2-05: addressFormat null → envelope.params에 addressFormat 필드 부재', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'adf-r5',
      result: { address: '1abc...' },
    })

    await getAddress({
      chainId: 'bip122:000000000019d6689c085ae165831e93',
      keyPath: "m/44'/0'/0'/0/0",
      addressFormat: null as any,
    })

    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.params).not.toHaveProperty('addressFormat')
  })

  test('T-U-ADF-V2-06: prototype pollution — __proto__ 키가 sanitize를 통과하지 않음', () => {
    // _sanitizeAddressFormat은 string 타입 + enum 포함 여부 검사로 prototype 키 차단
    // __proto__, constructor, prototype은 ADDRESS_FORMAT_VALUES 목록에 없으므로 param_error
    expect(() => _sanitizeAddressFormat('__proto__')).toThrow()
    expect(() => _sanitizeAddressFormat('constructor')).toThrow()
    expect(() => _sanitizeAddressFormat('prototype')).toThrow()
  })

  test('T-U-ADF-V2-07: v1 getAddress("bitcoin", path) → v1 path 그대로, addressFormat 없음 (v1 불변)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'adf-r7',
      result: { address: '1abc...' },
    })

    // v1 coinType='bitcoin' (BITCOIN enum 값) — 유효한 v1 coinType
    await getAddress('bitcoin', "m/44'/0'/0'/0/0")

    const callArg = sendSpy.mock.calls[0][0] as any
    // v1 path는 coinType 기반으로 params 구성 — addressFormat 없음
    expect(callArg.params).toHaveProperty('coinType', 'bitcoin')
    expect(callArg.params).not.toHaveProperty('addressFormat')
    // v1 path는 chainId 필드도 없음
    expect(callArg.chainId).toBeUndefined()
  })

  test('T-U-ADF-V2-08: AddressFormat type이 dcent-web-connector에서 import type 가능', () => {
    // TypeScript 컴파일 타임 검증 — import type { AddressFormat } from 'dcent-web-connector'
    // 런타임에는 _sanitizeAddressFormat으로 enum 동작 검증
    // 🔴 `KnownAddressFormat` 의 원소를 **전부** 적는다. 여기가 줄면 union 이 줄어도
    //    이 테스트는 통과한다 — 그 축의 유일한 검출자는 `address.ts` 의 `_AssertLedgerKnown`
    //    (컴파일 타임)이다. 이 배열은 "sanitize 가 다 통과시키나" 만 본다.
    const validFormats: import('../../../../src/sign/address').KnownAddressFormat[] = [
      'legacy',
      'segwit-wrapped',
      'segwit-native',
      'taproot',
      'ledger',
    ]
    // 5개 모두 _sanitizeAddressFormat을 통과해야 함
    for (const fmt of validFormats) {
      expect(_sanitizeAddressFormat(fmt)).toBe(fmt)
    }
    // T-U-CON-01: 'ledger' 는 **오늘도** 통과한다(열린 타입이라 런타임 게이트가 없다).
    //   published 2.0.0 으로도 통과한다는 사실의 회귀 앵커 — 여기가 빨개지면 누군가
    //   `_sanitizeAddressFormat` 에 화이트리스트를 되살린 것이다(forward-only 결정 위반).
    expect(_sanitizeAddressFormat('ledger')).toBe('ledger')
  })

  test('T-U-ADF-V2-01.b: addressFormat legacy → envelope.params.addressFormat 동행', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'adf-r1b',
      result: { address: '1abc...' },
    })

    await getAddress({
      chainId: 'bip122:000000000019d6689c085ae165831e93',
      keyPath: "m/44'/0'/0'/0/0",
      addressFormat: 'legacy',
    })

    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.params.addressFormat).toBe('legacy')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// m09-04-09 — _sanitizeAddressFormat 단위 테스트
// ──────────────────────────────────────────────────────────────────────────

describe('_sanitizeAddressFormat — unit (m09-04-09)', () => {
  test('valid: "legacy" → "legacy" 반환', () => {
    expect(_sanitizeAddressFormat('legacy')).toBe('legacy')
  })

  test('valid: "segwit-wrapped" → "segwit-wrapped" 반환', () => {
    expect(_sanitizeAddressFormat('segwit-wrapped')).toBe('segwit-wrapped')
  })

  test('valid: "segwit-native" → "segwit-native" 반환', () => {
    expect(_sanitizeAddressFormat('segwit-native')).toBe('segwit-native')
  })

  test('valid: "taproot" → "taproot" 반환', () => {
    expect(_sanitizeAddressFormat('taproot')).toBe('taproot')
  })

  test('undefined → undefined 반환 (optional 필드)', () => {
    expect(_sanitizeAddressFormat(undefined)).toBeUndefined()
  })

  test('null → undefined 반환 (optional 필드)', () => {
    expect(_sanitizeAddressFormat(null)).toBeUndefined()
  })

  test('number → param_error throw', () => {
    expect(() => _sanitizeAddressFormat(0)).toThrow()
    expect(() => _sanitizeAddressFormat(42)).toThrow()
  })

  test('boolean → param_error throw', () => {
    expect(() => _sanitizeAddressFormat(true)).toThrow()
  })

  // 🔴 enum membership 은 sdk 소관 — 여기서 통과시키는 것이 계약이다.
  test('알려지지 않은 문자열은 그대로 통과한다 (enum 판정은 sdk 경계)', () => {
    expect(_sanitizeAddressFormat('BITCOIN')).toBe('BITCOIN')
    expect(_sanitizeAddressFormat('p2pkh')).toBe('p2pkh')
    expect(_sanitizeAddressFormat('some-future-format')).toBe('some-future-format')
  })

  // 드리프트하지 않는 위생 가드는 그대로 남는다.
  test('빈 문자열 → param_error throw', () => {
    expect(() => _sanitizeAddressFormat('')).toThrow()
  })

  test('길이 상한(256) 초과 → param_error throw', () => {
    expect(_sanitizeAddressFormat('x'.repeat(256))).toBe('x'.repeat(256))
    expect(() => _sanitizeAddressFormat('x'.repeat(257))).toThrow()
  })

  test('값이 prototype 키면 → param_error throw (대소문자 무시)', () => {
    expect(() => _sanitizeAddressFormat('__proto__')).toThrow()
    expect(() => _sanitizeAddressFormat('constructor')).toThrow()
    expect(() => _sanitizeAddressFormat('PROTOTYPE')).toThrow()
  })

  test('object → param_error throw', () => {
    expect(() => _sanitizeAddressFormat({})).toThrow()
    expect(() => _sanitizeAddressFormat([])).toThrow()
  })
})
