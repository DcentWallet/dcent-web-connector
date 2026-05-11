/**
 * _sanitizeEthereumTypeOptions 단위 테스트 (m08-01-03)
 *
 * T-SEC-WHITE-EVM-01: known fields(maxFeePerGas, maxPriorityFeePerGas, accessList)만 통과, unknown 키 제거
 * T-SEC-WHITE-EVM-02: prototype 키(__proto__, constructor, prototype) 차단
 * T-SEC-WHITE-EVM-03: invalid 타입은 silent drop. opts null/undefined → 빈 객체
 *
 * 룰: dapp-input-sanitization, provider-security-checklist C3
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { _sanitizeEthereumTypeOptions } from '../../../../src/sign/_sanitizeEthereumTypeOptions'

describe('_sanitizeEthereumTypeOptions — T-SEC-WHITE-EVM-01 known fields whitelist', () => {
  test('known fields 모두 통과', () => {
    const result = _sanitizeEthereumTypeOptions({
      maxFeePerGas: '0x100',
      maxPriorityFeePerGas: '0x10',
      accessList: [{ address: '0xabc', storageKeys: ['0x1', '0x2'] }],
    })
    expect(result).toEqual({
      maxFeePerGas: '0x100',
      maxPriorityFeePerGas: '0x10',
      accessList: [{ address: '0xabc', storageKeys: ['0x1', '0x2'] }],
    })
  })

  test('unknown 키는 silent drop', () => {
    const result = _sanitizeEthereumTypeOptions({
      maxFeePerGas: '0x100',
      unknownKey: 'evil',
      anotherKey: 12345,
    } as any)
    expect(result).toEqual({ maxFeePerGas: '0x100' })
    expect(result).not.toHaveProperty('unknownKey')
    expect(result).not.toHaveProperty('anotherKey')
  })
})

describe('_sanitizeEthereumTypeOptions — T-SEC-WHITE-EVM-02 prototype 차단', () => {
  test('__proto__ 키 직접 주입 → 결과에 polluted 안 나옴', () => {
    const evil = JSON.parse('{"maxFeePerGas":"0x100","__proto__":{"polluted":true}}')
    const result = _sanitizeEthereumTypeOptions(evil)
    expect(result).toEqual({ maxFeePerGas: '0x100' })
    expect((result as any).polluted).toBeUndefined()
    // 전역 Object.prototype 오염 안 됨
    expect(({} as any).polluted).toBeUndefined()
  })

  test('constructor 키 → silent drop', () => {
    const result = _sanitizeEthereumTypeOptions({
      constructor: { evil: true },
      maxFeePerGas: '0x100',
    } as any)
    expect(result).toEqual({ maxFeePerGas: '0x100' })
  })

  test('prototype 키 → silent drop', () => {
    const result = _sanitizeEthereumTypeOptions({
      prototype: { evil: true },
      maxFeePerGas: '0x100',
    } as any)
    expect(result).toEqual({ maxFeePerGas: '0x100' })
  })
})

describe('_sanitizeEthereumTypeOptions — T-SEC-WHITE-EVM-03 invalid 타입 silent drop + nullish', () => {
  test('null → 빈 객체', () => {
    expect(_sanitizeEthereumTypeOptions(null)).toEqual({})
  })

  test('undefined → 빈 객체', () => {
    expect(_sanitizeEthereumTypeOptions(undefined)).toEqual({})
  })

  test('non-object (string) → 빈 객체', () => {
    expect(_sanitizeEthereumTypeOptions('not-an-object' as any)).toEqual({})
  })

  test('maxFeePerGas: number (not string) → silent drop', () => {
    const result = _sanitizeEthereumTypeOptions({ maxFeePerGas: 123 } as any)
    expect(result).toEqual({})
  })

  test('maxPriorityFeePerGas: array (not string) → silent drop', () => {
    const result = _sanitizeEthereumTypeOptions({ maxPriorityFeePerGas: [1, 2] } as any)
    expect(result).toEqual({})
  })

  test('accessList: not array → silent drop, 결과는 빈 객체', () => {
    const result = _sanitizeEthereumTypeOptions({ accessList: 'not-array' } as any)
    expect(result).toEqual({})
  })

  test('accessList entry: storageKeys가 string array가 아니면 해당 entry drop', () => {
    const result = _sanitizeEthereumTypeOptions({
      accessList: [
        { address: '0xabc', storageKeys: ['0x1'] }, // valid
        { address: '0xdef', storageKeys: [123, 456] }, // invalid (number)
        { address: 123, storageKeys: ['0x2'] }, // invalid (address number)
      ],
    } as any)
    expect(result.accessList).toEqual([{ address: '0xabc', storageKeys: ['0x1'] }])
  })

  test('mutation isolation: 결과 객체 변경이 다음 호출에 leak 안 됨', () => {
    const r1 = _sanitizeEthereumTypeOptions({ maxFeePerGas: '0x100' })
    r1.maxFeePerGas = '0xff'
    const r2 = _sanitizeEthereumTypeOptions({ maxFeePerGas: '0x100' })
    expect(r2.maxFeePerGas).toBe('0x100')
  })
})
