/**
 * _validateSignPayload 단위 테스트 (m09-04-05)
 *
 * v2 sign API의 family-agnostic payload shape validation 회귀 테스트.
 *
 * T-PV-01: payload = undefined → throw INVALID_PARAMS "expected object, got undefined"
 * T-PV-02: payload = null → throw "got null"
 * T-PV-03: payload = [] → throw "got array"
 * T-PV-04: payload = 'string' (typeof !== 'object') → throw
 * T-PV-04b: payload = number / boolean → throw
 * T-PV-05: payload = {} (no keyPath) → throw "'keyPath' field required"
 * T-PV-06: payload = {keyPath: ''} → throw "must not be empty"
 * T-PV-07: payload = {keyPath: 123} (non-string) → throw "'keyPath' field required"
 * T-PV-08: minimal valid payload → no throw
 * T-PV-09: payload with __proto__ (own-property) → throw "prototype key"
 * T-PV-10: payload with constructor (own-property) → throw
 * T-PV-10b: payload with prototype (own-property) → throw
 * T-PV-11: payload size > 64KB → throw "exceeds 65536-byte limit"
 * T-PV-12: payload with circular reference → throw "not JSON-serializable"
 * T-PV-13: chainId echo in error message (family-agnostic — chainId는 echo만)
 *
 * connector-chain-addition-isolation 룰 회귀: helper에 chain-specific 분기 부재.
 * dapp-input-sanitization 룰 회귀: 프로토타입 키 + DoS 가드.
 */

import { _validateSignPayload } from '../../../../src/sign/_validateSignPayload'
import { ProviderError } from '../../../../src/error/ProviderError'
import { ErrorCode } from '../../../../src/error/ErrorCode'

describe('_validateSignPayload — type 검증', () => {
  test('T-PV-01: payload = undefined → throw INVALID_PARAMS', () => {
    expect(() => _validateSignPayload('eip155:1', undefined)).toThrow(ProviderError)
    try {
      _validateSignPayload('eip155:1', undefined)
    } catch (e) {
      expect((e as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
      expect((e as ProviderError).message).toMatch(/expected object/)
      expect((e as ProviderError).message).toMatch(/undefined/)
    }
  })

  test('T-PV-02: payload = null → throw "got null"', () => {
    expect(() => _validateSignPayload('eip155:1', null)).toThrow(ProviderError)
    try {
      _validateSignPayload('eip155:1', null)
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/null/)
    }
  })

  test('T-PV-03: payload = [] (array) → throw "got array"', () => {
    expect(() => _validateSignPayload('eip155:1', [])).toThrow(ProviderError)
    try {
      _validateSignPayload('eip155:1', [])
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/array/)
    }
  })

  test('T-PV-04: payload = string → throw "expected object"', () => {
    expect(() => _validateSignPayload('eip155:1', 'oops' as unknown as object)).toThrow(ProviderError)
    try {
      _validateSignPayload('eip155:1', 'oops' as unknown as object)
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/expected object/)
      expect((e as ProviderError).message).toMatch(/string/)
    }
  })

  test('T-PV-04b: payload = number / boolean → throw', () => {
    expect(() => _validateSignPayload('eip155:1', 42 as unknown as object)).toThrow(ProviderError)
    expect(() => _validateSignPayload('eip155:1', true as unknown as object)).toThrow(ProviderError)
  })
})

describe('_validateSignPayload — keyPath 필수', () => {
  test('T-PV-05: payload = {} (no keyPath) → helpful error with example', () => {
    expect(() => _validateSignPayload('eip155:1', {})).toThrow(ProviderError)
    try {
      _validateSignPayload('eip155:1', {})
    } catch (e) {
      expect((e as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
      expect((e as ProviderError).message).toMatch(/'keyPath' field required/)
      expect((e as ProviderError).message).toMatch(/BIP44/)
      // 예시 포함
      expect((e as ProviderError).message).toMatch(/Example/)
    }
  })

  test('T-PV-06: payload.keyPath = "" (empty string) → throw "must not be empty"', () => {
    expect(() => _validateSignPayload('eip155:1', { keyPath: '' })).toThrow(ProviderError)
    try {
      _validateSignPayload('eip155:1', { keyPath: '' })
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/must not be empty/)
    }
  })

  test('T-PV-07: payload.keyPath = 123 (non-string) → throw "field required"', () => {
    expect(() => _validateSignPayload('eip155:1', { keyPath: 123 })).toThrow(ProviderError)
    try {
      _validateSignPayload('eip155:1', { keyPath: 123 })
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/'keyPath' field required/)
    }
  })

  test('T-PV-08: minimal valid payload (keyPath only) → no throw', () => {
    expect(() => _validateSignPayload('eip155:1', { keyPath: "m/44'/60'/0'/0/0" })).not.toThrow()
  })

  test('T-PV-08b: valid payload with family-specific extras → no throw (family은 sdk 책임)', () => {
    expect(() =>
      _validateSignPayload('eip155:1', {
        keyPath: "m/44'/60'/0'/0/0",
        message: '0xdeadbeef',
        address: '0xabc',
      }),
    ).not.toThrow()
  })
})

describe('_validateSignPayload — 프로토타입 오염 차단', () => {
  test('T-PV-09: payload with own-property __proto__ → throw "prototype key"', () => {
    // Object.defineProperty로 own-property로 설정 (객체 리터럴의 __proto__는 prototype을 set하므로)
    const payload = { keyPath: "m/44'/60'/0'/0/0" }
    Object.defineProperty(payload, '__proto__', {
      value: { evil: true },
      enumerable: true,
      configurable: true,
      writable: true,
    })
    expect(() => _validateSignPayload('eip155:1', payload)).toThrow(ProviderError)
    try {
      _validateSignPayload('eip155:1', payload)
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/prototype key/)
      expect((e as ProviderError).message).toMatch(/__proto__/)
    }
  })

  test('T-PV-10: payload with own-property "constructor" → throw', () => {
    const payload: Record<string, unknown> = { keyPath: "m/44'/60'/0'/0/0", constructor: 'evil' }
    expect(() => _validateSignPayload('eip155:1', payload)).toThrow(ProviderError)
    try {
      _validateSignPayload('eip155:1', payload)
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/constructor/)
    }
  })

  test('T-PV-10b: payload with own-property "prototype" → throw', () => {
    const payload: Record<string, unknown> = { keyPath: "m/44'/60'/0'/0/0", prototype: 'evil' }
    expect(() => _validateSignPayload('eip155:1', payload)).toThrow(ProviderError)
  })

  test('T-PV-10c: inherited "constructor" (no own-property) → 통과 (chain prototype은 모든 객체가 가짐)', () => {
    // 일반 object 리터럴은 constructor를 inherited로 갖지만 own-property는 아님 → 통과해야 함
    expect(() =>
      _validateSignPayload('eip155:1', { keyPath: "m/44'/60'/0'/0/0", message: 'hi' }),
    ).not.toThrow()
  })
})

describe('_validateSignPayload — DoS 가드', () => {
  test('T-PV-11: payload size > 64KB → throw "exceeds 65536-byte limit"', () => {
    const bigString = 'x'.repeat(70 * 1024) // 70KB
    expect(() =>
      _validateSignPayload('eip155:1', { keyPath: "m/44'/60'/0'/0/0", bigBlob: bigString }),
    ).toThrow(ProviderError)
    try {
      _validateSignPayload('eip155:1', { keyPath: "m/44'/60'/0'/0/0", bigBlob: bigString })
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/exceeds/)
      expect((e as ProviderError).message).toMatch(/65536/)
    }
  })

  test('T-PV-12: payload with circular reference → throw "not JSON-serializable"', () => {
    const payload: Record<string, unknown> = { keyPath: "m/44'/60'/0'/0/0" }
    payload.self = payload // circular
    expect(() => _validateSignPayload('eip155:1', payload)).toThrow(ProviderError)
    try {
      _validateSignPayload('eip155:1', payload)
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/not JSON-serializable/)
    }
  })

  test('T-PV-11b: payload size at boundary (just under 64KB) → 통과', () => {
    // 64KB - 200 byte overhead → 안전 영역
    const safeString = 'x'.repeat(60 * 1024)
    expect(() =>
      _validateSignPayload('eip155:1', { keyPath: "m/44'/60'/0'/0/0", blob: safeString }),
    ).not.toThrow()
  })
})

describe('_validateSignPayload — chainId echo (family-agnostic 회귀)', () => {
  test('T-PV-13: 에러 메시지에 chainId가 echo되지만 분기 로직은 부재', () => {
    // 다양한 chainId로 호출해도 동일한 에러 패턴이 발생 (family-specific 분기 X)
    const chainIds = ['eip155:1', 'bip122:000', 'solana:mainnet', 'cosmos:cosmoshub-4']
    for (const chainId of chainIds) {
      try {
        _validateSignPayload(chainId, undefined)
        fail(`Expected throw for chainId ${chainId}`)
      } catch (e) {
        expect((e as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
        // chainId는 에러 메시지에 echo만 됨 (분기 로직 부재)
        expect((e as ProviderError).message).toContain(chainId)
        // 동일한 에러 패턴 — chain별 다른 메시지가 아님
        expect((e as ProviderError).message).toMatch(/expected object/)
      }
    }
  })
})
