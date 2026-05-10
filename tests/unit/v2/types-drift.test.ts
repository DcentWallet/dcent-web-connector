/**
 * v2 enum drift 방어 단위 테스트 (m08-01-01)
 *
 * v1 src-v1/type/dcent-web-type.js와 src-v1/type/dcent-state.js를 직접 require하여,
 * v2 src/types/*.ts의 enum과 키·값 1:1 일치를 단언한다.
 *
 * src-v1/이 변경되면 이 테스트가 깨져 자동 감지 — drift 발견 시 v2 .ts를 수동 갱신.
 *
 * 본 child는 7개 enum (`coinType`, `coinGroup`, `coinName`, `bitcoinTxType`, `klaytnTxType`,
 * `xrpTxType`, `state`)만 옮긴다. v1의 `coinDecimals`는 본 child에서 옮기지 않으므로 비교 대상 아님.
 *
 * T-DRIFT-01 ~ T-DRIFT-08, T-DRIFT-FP-01
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
import { unitConverter } from '../../../src/utils/unitConverter'

// v1 .js를 직접 require — babel-jest가 transform
// eslint-disable-next-line @typescript-eslint/no-var-requires
const v1Type = require('../../../src-v1/type/dcent-web-type')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const v1State = require('../../../src-v1/type/dcent-state')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const v1UnitConverter = require('../../../src-v1/utils/unit-converter')

describe('v2 enum drift 방어 — v1 src-v1 ↔ v2 src/types 키·값 1:1', () => {
  test.each([
    ['coinType', coinType, v1Type.coinType],
    ['coinGroup', coinGroup, v1Type.coinGroup],
    ['coinName', coinName, v1Type.coinName],
    ['bitcoinTxType', bitcoinTxType, v1Type.bitcoinTxType],
    ['klaytnTxType', klaytnTxType, v1Type.klaytnTxType],
    ['xrpTxType', xrpTxType, v1Type.xrpTxType],
    ['state', state, v1State.state],
  ])('T-DRIFT-* %s — v2 == v1 (키·값 1:1)', (_name, v2, v1) => {
    // T-DRIFT-FP-01: false-positive guard — v1 export가 빈 객체가 아님을 사전 단언.
    // 양쪽 다 빈 객체이면 toEqual([])로 통과해버리는 false-positive 방지.
    expect(Object.keys(v1).length).toBeGreaterThan(0)

    // 키 set 일치
    expect(Object.keys(v2).sort()).toEqual(Object.keys(v1).sort())

    // 각 키의 값이 정확히 일치 (`.toBe`로 strict equality — primitive)
    Object.keys(v1).forEach((k) => {
      expect((v2 as Record<string, unknown>)[k]).toBe((v1 as Record<string, unknown>)[k])
    })
  })

  test('T-DRIFT-08: unitConverter 함수 시그니처 동등 (함수 + 동일 결과 — 0 input)', () => {
    expect(typeof unitConverter).toBe('function')
    expect(typeof v1UnitConverter).toBe('function')
    expect(unitConverter.length).toBe(v1UnitConverter.length) // arity 일치 (2)

    // 동일 입력에 대해 동일 출력 — 핵심 평가 포인트
    const v2Result = unitConverter('0', 18)
    const v1Result = v1UnitConverter('0', 18)
    expect(v2Result.num).toBe(v1Result.num)
    expect(v2Result.bignum.toString(10)).toBe(v1Result.bignum.toString(10))
  })

  test('T-DRIFT-08b: unitConverter — positive whole + fraction', () => {
    const v2Result = unitConverter('1.5', 18)
    const v1Result = v1UnitConverter('1.5', 18)
    expect(v2Result.num).toBe(v1Result.num)
  })

  test('T-DRIFT-08c: unitConverter — negative input', () => {
    const v2Result = unitConverter('-2.25', 8)
    const v1Result = v1UnitConverter('-2.25', 8)
    expect(v2Result.num).toBe(v1Result.num)
  })

  test('T-DRIFT-08d: unitConverter — invalid input throws (v1과 동일 메시지 prefix)', () => {
    expect(() => unitConverter('abc', 18)).toThrow(/invalid number value/)
    expect(() => v1UnitConverter('abc', 18)).toThrow(/invalid number value/)
  })
})
