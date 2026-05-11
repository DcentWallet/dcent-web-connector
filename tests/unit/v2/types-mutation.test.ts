/**
 * v2 enum mutation 격리 테스트 (m08-01-01)
 *
 * `mutation-isolation` 룰 — public enum이 외부에서 변경되어 provider 내부 상태가
 * 오염되지 않도록 Object.freeze 적용 여부를 검증.
 *
 * T-MUT-01: 모든 enum object가 Object.isFrozen() true
 * T-MUT-02: strict mode에서 (coinType as any).NEW = 'x' 시도 시 throw
 *
 * jsdom 환경. test 파일 자체가 ES Module(.ts)이라 strict mode가 자동 적용됨.
 */

import {
  coinType,
  coinGroup,
  coinName,
  bitcoinTxType,
  klaytnTxType,
  xrpTxType,
  state,
} from '../../../src/types'

describe('v2 enum mutation 격리', () => {
  test.each([
    ['coinType', coinType],
    ['coinGroup', coinGroup],
    ['coinName', coinName],
    ['bitcoinTxType', bitcoinTxType],
    ['klaytnTxType', klaytnTxType],
    ['xrpTxType', xrpTxType],
    ['state', state],
  ])('T-MUT-01: %s — Object.isFrozen() === true', (_name, enumObj) => {
    expect(Object.isFrozen(enumObj)).toBe(true)
  })

  test('T-MUT-02: strict mode에서 enum에 새 키 추가 시 TypeError throw', () => {
    expect(() => {
      ;(coinType as unknown as Record<string, string>).NEW_TEST_KEY = 'x'
    }).toThrow(TypeError)
  })

  test('T-MUT-02b: strict mode에서 enum 기존 키 수정 시 TypeError throw', () => {
    expect(() => {
      ;(coinType as unknown as Record<string, string>).BITCOIN = 'mutated'
    }).toThrow(TypeError)
  })

  test('T-MUT-02c: strict mode에서 enum delete 시 TypeError throw', () => {
    expect(() => {
      delete (coinType as unknown as Record<string, string>).BITCOIN
    }).toThrow(TypeError)
  })
})
