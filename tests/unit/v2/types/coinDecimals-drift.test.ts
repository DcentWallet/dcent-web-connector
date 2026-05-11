/**
 * coinDecimals drift 방어 단위 테스트 (m08-01-04.5)
 *
 * v1 src-v1/type/dcent-web-type.js의 `coinDecimals` (l242-251)와 v2 src/types/coinDecimals.ts가
 * 키·값 1:1 일치하는지 자동 단언. v1 변경 시 본 테스트가 깨져 drift를 즉시 감지 (수동 동기화 정책).
 *
 * T-DRIFT-COIN-DECIMALS-01
 */

import { coinDecimals } from '../../../../src/types/coinDecimals'

// v1 .js를 직접 require — babel-jest가 transform
// eslint-disable-next-line @typescript-eslint/no-var-requires
const v1Type = require('../../../../src-v1/type/dcent-web-type')

describe('coinDecimals drift 방어 — v1 src-v1 ↔ v2 src/types 키·값 1:1', () => {
  test('T-DRIFT-COIN-DECIMALS-01: v2 coinDecimals == v1 coinDecimals (키·값 1:1)', () => {
    // false-positive guard: v1 export가 빈 객체가 아님을 사전 단언
    expect(Object.keys(v1Type.coinDecimals).length).toBeGreaterThan(0)

    // 키 set 일치
    expect(Object.keys(coinDecimals).sort()).toEqual(Object.keys(v1Type.coinDecimals).sort())

    // 각 키의 값이 정확히 일치 (`.toBe`로 strict equality — primitive number)
    Object.keys(v1Type.coinDecimals).forEach((k) => {
      expect((coinDecimals as Record<string, number>)[k]).toBe(
        (v1Type.coinDecimals as Record<string, number>)[k],
      )
    })
  })

  test('T-DRIFT-COIN-DECIMALS-02: known constants — TEZOS=6 / VECHAIN=18 / NEAR=24 / HAVAH=18 / POLKADOT=10 / COSMOS=6 / COREUM=6 / ALGORAND=6', () => {
    expect(coinDecimals.TEZOS).toBe(6)
    expect(coinDecimals.VECHAIN).toBe(18)
    expect(coinDecimals.NEAR).toBe(24)
    expect(coinDecimals.HAVAH).toBe(18)
    expect(coinDecimals.POLKADOT).toBe(10)
    expect(coinDecimals.COSMOS).toBe(6)
    expect(coinDecimals.COREUM).toBe(6)
    expect(coinDecimals.ALGORAND).toBe(6)
  })

  test('T-DRIFT-COIN-DECIMALS-03: Object.frozen — 외부 mutation 차단', () => {
    expect(Object.isFrozen(coinDecimals)).toBe(true)
  })
})
