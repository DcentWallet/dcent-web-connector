/**
 * getCzonDecimal drift 방어 단위 테스트 (m08-01-04.5)
 *
 * v1 src-v1/index.js#l690-697의 `getCzonDecimal`은 module-internal이므로 require 직접 비교 불가.
 * 대신 v1 source의 case enum (현재 COREUM만 등록)을 hardcoded fixture로 추출하여 v2 .ts 결과와 대조.
 *
 * T-DRIFT-CZON-DECIMAL-01: known coinType (COREUM, lowercase 'coreum') → coinDecimals.COREUM=6 반환
 * T-DRIFT-CZON-DECIMAL-02: unknown coinType → throw dcentException ('coin_type_error')
 *
 * Fixture 출처: src-v1/index.js#l690-697 + dcentCoinType.COREUM = 'coreum'.
 */

import { getCzonDecimal } from '../../../../src/sign/getCzonDecimal'
import { coinDecimals } from '../../../../src/types/coinDecimals'

describe('getCzonDecimal drift 방어 — v1 src-v1/index.js#l690-697 ↔ v2 .ts', () => {
  test('T-DRIFT-CZON-DECIMAL-01: COREUM → coinDecimals.COREUM (=6)', () => {
    expect(getCzonDecimal('COREUM')).toBe(coinDecimals.COREUM)
    expect(getCzonDecimal('COREUM')).toBe(6)
  })

  test('T-DRIFT-CZON-DECIMAL-01b: lowercase "coreum"도 매치 (toLowerCase 비교)', () => {
    expect(getCzonDecimal('coreum')).toBe(6)
    expect(getCzonDecimal('Coreum')).toBe(6)
  })

  test('T-DRIFT-CZON-DECIMAL-02: 알 수 없는 coinType → throw dcentException("coin_type_error")', () => {
    expect(() => getCzonDecimal('UNKNOWN_CHAIN')).toThrow()
    try {
      getCzonDecimal('UNKNOWN_CHAIN')
    } catch (e: unknown) {
      const err = e as { header: { status: string }; body: { error: { code: string; message: string } } }
      expect(err.header.status).toBe('error')
      expect(err.body.error.code).toBe('coin_type_error')
      expect(err.body.error.message).toContain('not supported coin type')
      expect(err.body.error.message).toContain('UNKNOWN_CHAIN')
    }
  })

  test('T-DRIFT-CZON-DECIMAL-03: COSMOS는 czone family가 아니므로 throw', () => {
    // v1 동작: getCzonDecimal('COSMOS') → throw (Cosmos 자체는 wrapper에서 별도 분기 처리)
    expect(() => getCzonDecimal('COSMOS')).toThrow()
  })
})
