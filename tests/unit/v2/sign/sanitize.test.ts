/**
 * sanitize.ts 단위 테스트 (m09-04-01 NEW schema)
 *
 * _sanitizeMethod / _sanitizeChainId 양쪽에 대한 회귀 테스트.
 *
 * T-SEC-WHITE-{FIELD}-01: type 검증 (number / undefined / null / boolean / object / array 거부)
 * T-SEC-WHITE-{FIELD}-02: empty string 거부
 * T-SEC-WHITE-{FIELD}-03: 프로토타입 키 거부 (대소문자 무시)
 * T-SEC-WHITE-{FIELD}-04: length / whitelist 검증
 *
 * dapp-input-sanitization 룰의 회귀 테스트.
 */

import { _sanitizeMethod, _sanitizeChainId } from '../../../../src/sign/sanitize'
import { ProviderError } from '../../../../src/error/ProviderError'
import { ErrorCode } from '../../../../src/error/ErrorCode'

describe('sanitize — _sanitizeMethod', () => {
  test('T-SEC-WHITE-METHOD-01: type 검증 — number 거부', () => {
    expect(() => _sanitizeMethod(123 as unknown)).toThrow(ProviderError)
    try {
      _sanitizeMethod(123 as unknown)
    } catch (e) {
      expect((e as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
      expect((e as ProviderError).message).toMatch(/method/)
      expect((e as ProviderError).message).toMatch(/string/)
    }
  })

  test('T-SEC-WHITE-METHOD-01b: type 검증 — undefined / null / boolean / object 거부', () => {
    expect(() => _sanitizeMethod(undefined)).toThrow(ProviderError)
    expect(() => _sanitizeMethod(null)).toThrow(ProviderError)
    expect(() => _sanitizeMethod(true)).toThrow(ProviderError)
    expect(() => _sanitizeMethod({})).toThrow(ProviderError)
    expect(() => _sanitizeMethod([])).toThrow(ProviderError)
  })

  test('T-SEC-WHITE-METHOD-02: empty string 거부', () => {
    expect(() => _sanitizeMethod('')).toThrow(ProviderError)
    try {
      _sanitizeMethod('')
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/empty/)
    }
  })

  test('T-SEC-WHITE-METHOD-03: 프로토타입 키 거부 (대소문자 무시)', () => {
    expect(() => _sanitizeMethod('__proto__')).toThrow(ProviderError)
    expect(() => _sanitizeMethod('constructor')).toThrow(ProviderError)
    expect(() => _sanitizeMethod('prototype')).toThrow(ProviderError)
    expect(() => _sanitizeMethod('__PROTO__')).toThrow(ProviderError)
    expect(() => _sanitizeMethod('Constructor')).toThrow(ProviderError)
    expect(() => _sanitizeMethod('PROTOTYPE')).toThrow(ProviderError)
  })

  test('T-SEC-WHITE-METHOD-04a: length 검증 (>256 거부)', () => {
    const long = 'a'.repeat(257)
    expect(() => _sanitizeMethod(long)).toThrow(ProviderError)
    try {
      _sanitizeMethod(long)
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/256/)
    }
  })

  test('T-SEC-WHITE-METHOD-04b: 256 이하 정상 통과', () => {
    expect(_sanitizeMethod('a'.repeat(256))).toBe('a'.repeat(256))
  })

  test('T-SEC-WHITE-METHOD-04c: whitelist — intent literal + passthrough 통과', () => {
    expect(_sanitizeMethod('signTransaction')).toBe('signTransaction')
    expect(_sanitizeMethod('signMessage')).toBe('signMessage')
    expect(_sanitizeMethod('customSignSui')).toBe('customSignSui')
    expect(_sanitizeMethod('eth_signTransaction')).toBe('eth_signTransaction')
  })

  test('T-SEC-WHITE-METHOD-04d: whitelist — 비허용 문자 거부', () => {
    expect(() => _sanitizeMethod('method ;evil')).toThrow(ProviderError)
    expect(() => _sanitizeMethod('method<script>')).toThrow(ProviderError)
    expect(() => _sanitizeMethod('method"quote')).toThrow(ProviderError)
    expect(() => _sanitizeMethod("method'sq")).toThrow(ProviderError)
    expect(() => _sanitizeMethod('method\nnewline')).toThrow(ProviderError)
    expect(() => _sanitizeMethod('method\x00null')).toThrow(ProviderError)
  })
})

describe('sanitize — _sanitizeChainId', () => {
  test('T-SEC-WHITE-CHAINID-01: type 검증 — number 거부', () => {
    expect(() => _sanitizeChainId(1 as unknown)).toThrow(ProviderError)
    try {
      _sanitizeChainId(1 as unknown)
    } catch (e) {
      expect((e as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
      expect((e as ProviderError).message).toMatch(/chainId/)
    }
  })

  test('T-SEC-WHITE-CHAINID-01b: type 검증 — undefined / null / boolean / object 거부', () => {
    expect(() => _sanitizeChainId(undefined)).toThrow(ProviderError)
    expect(() => _sanitizeChainId(null)).toThrow(ProviderError)
    expect(() => _sanitizeChainId(true)).toThrow(ProviderError)
    expect(() => _sanitizeChainId({})).toThrow(ProviderError)
    expect(() => _sanitizeChainId([])).toThrow(ProviderError)
  })

  test('T-SEC-WHITE-CHAINID-02: empty string 거부', () => {
    expect(() => _sanitizeChainId('')).toThrow(ProviderError)
  })

  test('T-SEC-WHITE-CHAINID-03: 프로토타입 키 거부 (대소문자 무시)', () => {
    expect(() => _sanitizeChainId('__proto__')).toThrow(ProviderError)
    expect(() => _sanitizeChainId('constructor')).toThrow(ProviderError)
    expect(() => _sanitizeChainId('prototype')).toThrow(ProviderError)
    expect(() => _sanitizeChainId('__PROTO__')).toThrow(ProviderError)
  })

  test('T-SEC-WHITE-CHAINID-04a: length 검증 (>256 거부)', () => {
    const long = 'a'.repeat(257)
    expect(() => _sanitizeChainId(long)).toThrow(ProviderError)
  })

  test('T-SEC-WHITE-CHAINID-04c: whitelist — 정상 CAIP-19 통과', () => {
    expect(_sanitizeChainId('eip155:1')).toBe('eip155:1')
    expect(_sanitizeChainId('eip155:1/slip44:60')).toBe('eip155:1/slip44:60')
    expect(_sanitizeChainId('eip155:1/erc20:0xabc')).toBe('eip155:1/erc20:0xabc')
    expect(_sanitizeChainId('bip122:000000000019d6689c085ae165831e93/slip44:0')).toBe(
      'bip122:000000000019d6689c085ae165831e93/slip44:0',
    )
    expect(_sanitizeChainId('cosmos:cosmoshub-4')).toBe('cosmos:cosmoshub-4')
    expect(_sanitizeChainId('xrpl:0')).toBe('xrpl:0')
  })

  test('T-SEC-WHITE-CHAINID-04d: whitelist — 비허용 문자 거부', () => {
    expect(() => _sanitizeChainId('eip155:1 ;evil')).toThrow(ProviderError)
    expect(() => _sanitizeChainId('chain<script>')).toThrow(ProviderError)
    expect(() => _sanitizeChainId('chain"quote')).toThrow(ProviderError)
    expect(() => _sanitizeChainId('chain\nnewline')).toThrow(ProviderError)
    expect(() => _sanitizeChainId('chain\x00null')).toThrow(ProviderError)
  })

  test('T-SEC-WHITE-CHAINID-04e: 허용 문자 (영숫자 + : / . + - _) 통과', () => {
    expect(_sanitizeChainId('a-b_c.d+e:f/g')).toBe('a-b_c.d+e:f/g')
  })
})
