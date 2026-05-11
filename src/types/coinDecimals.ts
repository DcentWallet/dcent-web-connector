/**
 * v2 facade — coinDecimals enum (m08-01-04.5)
 *
 * v1 src-v1/type/dcent-web-type.js#l242-251의 `coinDecimals`와 키·값 1:1 일치.
 * m08-01-01에서 명시적으로 deferred되었던 항목 — 본 child가 nonEvmComplex wrapper에서
 * UnitConverter(fee, coinDecimals.{KEY})로 사용하기 위해 신설.
 *
 * tests/unit/v2/types/coinDecimals-drift.test.ts가 require('src-v1/type/dcent-web-type')로
 * v1을 직접 로드하여 키·값 일치를 단언 (T-DRIFT-COIN-DECIMALS-01) — 수동 동기화 정책.
 *
 * Object.freeze로 mutation 격리 (`mutation-isolation` 룰).
 * `as const`로 union literal 타입 자동 추론.
 *
 * 룰 준수:
 *   - mutation-isolation: Object.freeze로 enum 객체 자체 mutation 차단
 *   - reuse-shared-utils: 다른 wrapper들이 import하여 사용 (단일 진실)
 */

export const coinDecimals = Object.freeze({
  TEZOS: 6,
  VECHAIN: 18,
  NEAR: 24,
  HAVAH: 18,
  POLKADOT: 10,
  COSMOS: 6,
  COREUM: 6,
  ALGORAND: 6,
} as const)

export type CoinDecimals = typeof coinDecimals
export type CoinDecimalsKey = keyof CoinDecimals
export type CoinDecimalsValue = CoinDecimals[CoinDecimalsKey]
