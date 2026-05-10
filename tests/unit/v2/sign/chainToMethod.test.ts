/**
 * chainToMethod.ts 단위 테스트 (m08-01-02)
 *
 * T-U-CHAIN-01..03: prefix 매칭 + fallback
 * T-MUT-PREFIX-01: PREFIX_TO_METHOD frozen — 외부 변경 차단
 */

import { chainToMethod, PREFIX_TO_METHOD } from '../../../../src/sign/chainToMethod'

describe('chainToMethod — prefix 매칭', () => {
  test('T-U-CHAIN-01: eip155 prefix → eth_signTransaction', () => {
    expect(chainToMethod('eip155:1/erc20:0xabc')).toBe('eth_signTransaction')
    expect(chainToMethod('eip155:137')).toBe('eth_signTransaction')
  })

  test('T-U-CHAIN-02: bip122 prefix → btc_signTransaction', () => {
    expect(chainToMethod('bip122:000000000019d6689c085ae165831e93/slip44:0')).toBe(
      'btc_signTransaction',
    )
  })

  test('T-U-CHAIN-02b: xrpl prefix → xrp_signTransaction', () => {
    expect(chainToMethod('xrpl:0')).toBe('xrp_signTransaction')
  })

  test('T-U-CHAIN-02c: cosmos prefix → cosmos_signTransaction', () => {
    expect(chainToMethod('cosmos:cosmoshub-4')).toBe('cosmos_signTransaction')
  })

  test('T-U-CHAIN-03: CAIP-19 미정의 fallback — chain 그대로 method', () => {
    expect(chainToMethod('SUI')).toBe('SUI')
    expect(chainToMethod('aptos:1')).toBe('aptos:1')
    expect(chainToMethod('eth_signTransaction')).toBe('eth_signTransaction')
  })
})

describe('chainToMethod — mutation 격리', () => {
  test('T-MUT-PREFIX-01: PREFIX_TO_METHOD는 Object.frozen — 외부 변경 차단', () => {
    expect(Object.isFrozen(PREFIX_TO_METHOD)).toBe(true)
    // strict mode에서는 throw, non-strict에서는 silent fail. babel transform은
    // ESM strict mode이므로 throw 기대.
    expect(() => {
      ;(PREFIX_TO_METHOD as Record<string, string>)['eip155:'] = 'evil'
    }).toThrow(TypeError)
    // 변경 시도 후에도 원래 값 유지
    expect(PREFIX_TO_METHOD['eip155:']).toBe('eth_signTransaction')
  })

  test('T-MUT-PREFIX-01b: 새 키 추가도 차단', () => {
    expect(() => {
      ;(PREFIX_TO_METHOD as Record<string, string>)['evil:'] = 'evil_method'
    }).toThrow(TypeError)
    expect((PREFIX_TO_METHOD as Record<string, string>)['evil:']).toBeUndefined()
  })
})
