/**
 * sanitize.ts 단위 테스트 (m08-01-02)
 *
 * T-SEC-WHITE-CHAIN-01: type 검증 (number 거부)
 * T-SEC-WHITE-CHAIN-02: empty string 거부
 * T-SEC-WHITE-CHAIN-03: 프로토타입 키 거부 (대소문자 무시)
 * T-SEC-WHITE-CHAIN-04: length / whitelist 검증
 *
 * dapp-input-sanitization 룰의 회귀 테스트.
 */

import { _sanitizeChain } from '../../../../src/sign/sanitize'
import { ProviderError } from '../../../../src/error/ProviderError'
import { ErrorCode } from '../../../../src/error/ErrorCode'

describe('sanitize — _sanitizeChain', () => {
  test('T-SEC-WHITE-CHAIN-01: type 검증 — number 거부', () => {
    expect(() => _sanitizeChain(123 as unknown)).toThrow(ProviderError)
    try {
      _sanitizeChain(123 as unknown)
    } catch (e) {
      expect((e as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
      expect((e as ProviderError).message).toMatch(/string/)
    }
  })

  test('T-SEC-WHITE-CHAIN-01b: type 검증 — undefined / null / boolean / object 거부', () => {
    expect(() => _sanitizeChain(undefined)).toThrow(ProviderError)
    expect(() => _sanitizeChain(null)).toThrow(ProviderError)
    expect(() => _sanitizeChain(true)).toThrow(ProviderError)
    expect(() => _sanitizeChain({})).toThrow(ProviderError)
    expect(() => _sanitizeChain([])).toThrow(ProviderError)
  })

  test('T-SEC-WHITE-CHAIN-02: empty string 거부', () => {
    expect(() => _sanitizeChain('')).toThrow(ProviderError)
    try {
      _sanitizeChain('')
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/empty/)
    }
  })

  test('T-SEC-WHITE-CHAIN-03: 프로토타입 키 거부 (대소문자 무시)', () => {
    expect(() => _sanitizeChain('__proto__')).toThrow(ProviderError)
    expect(() => _sanitizeChain('constructor')).toThrow(ProviderError)
    expect(() => _sanitizeChain('prototype')).toThrow(ProviderError)
    // 대소문자 무시
    expect(() => _sanitizeChain('__PROTO__')).toThrow(ProviderError)
    expect(() => _sanitizeChain('Constructor')).toThrow(ProviderError)
    expect(() => _sanitizeChain('PROTOTYPE')).toThrow(ProviderError)
  })

  test('T-SEC-WHITE-CHAIN-04a: length 검증 (>256 거부)', () => {
    const long = 'a'.repeat(257)
    expect(() => _sanitizeChain(long)).toThrow(ProviderError)
    try {
      _sanitizeChain(long)
    } catch (e) {
      expect((e as ProviderError).message).toMatch(/256/)
    }
  })

  test('T-SEC-WHITE-CHAIN-04b: 256 이하 정상 통과', () => {
    expect(_sanitizeChain('a'.repeat(256))).toBe('a'.repeat(256))
  })

  test('T-SEC-WHITE-CHAIN-04c: whitelist — 정상 CAIP-19 통과', () => {
    expect(_sanitizeChain('eip155:1/erc20:0xabc')).toBe('eip155:1/erc20:0xabc')
    expect(_sanitizeChain('bip122:000000000019d6689c085ae165831e93/slip44:0')).toBe(
      'bip122:000000000019d6689c085ae165831e93/slip44:0',
    )
    expect(_sanitizeChain('SUI')).toBe('SUI')
    expect(_sanitizeChain('eth_signTransaction')).toBe('eth_signTransaction')
  })

  test('T-SEC-WHITE-CHAIN-04d: whitelist — 비허용 문자 거부', () => {
    expect(() => _sanitizeChain('eip155:1 ;evil')).toThrow(ProviderError) // space + ;
    expect(() => _sanitizeChain('chain<script>')).toThrow(ProviderError)
    expect(() => _sanitizeChain('chain"quote')).toThrow(ProviderError)
    expect(() => _sanitizeChain("chain'sq")).toThrow(ProviderError)
    expect(() => _sanitizeChain('chain\nnewline')).toThrow(ProviderError)
    expect(() => _sanitizeChain('chain\x00null')).toThrow(ProviderError)
  })

  test('T-SEC-WHITE-CHAIN-04e: 허용 문자 (영숫자 + : / . + - _) 통과', () => {
    expect(_sanitizeChain('a-b_c.d+e:f/g')).toBe('a-b_c.d+e:f/g')
  })
})
