/**
 * v1 getCzonDecimal helper port (m08-01-04.5)
 *
 * v1 src-v1/index.js#l690-697의 `getCzonDecimal`을 1:1 port한다.
 * Cosmos czone family(현재 COREUM)의 decimal lookup helper.
 * Cosmos wrapper(getCosmosSignedTransaction)에서만 사용되므로 sign/ scope에 위치
 * (`reuse-shared-utils` 룰 — caller scope 좁힘).
 *
 * v1 동작:
 *   - 입력 coinType.toLowerCase()를 dcentCoinType.COREUM과 비교 (현재 COREUM만 등록)
 *   - 매치 → coinDecimals.COREUM 반환
 *   - 미매치 → dcentException('coin_type_error', 'not supported coin type --- ' + coinType) throw
 *
 * 룰 준수:
 *   - boundary-validation: switch default에서 throw — silent return 금지
 *   - error-handling-consistency: invalid input은 throw (caller가 try/catch로 propagate)
 *   - reuse-shared-utils: m08-01-01의 v2 enum + m08-01-02.5의 dcentException 재사용
 */

import { coinType as dcentCoinType } from '../types/coinType'
import { coinDecimals } from '../types/coinDecimals'
import { dcentException } from '../v1/dcent-exception'

/**
 * v1 getCzonDecimal (src-v1/index.js#l690-697) 1:1 port.
 *
 * @param coinType v1 coinType 문자열 (예: 'COREUM')
 * @returns 해당 coinType의 decimals (현재 COREUM=6만 등록)
 * @throws v1 동등 dcentException — 'coin_type_error' / 'not supported coin type --- {coinType}'
 */
export function getCzonDecimal (coinType: string): number {
  switch (coinType.toLowerCase()) {
    case dcentCoinType.COREUM.toLowerCase():
      return coinDecimals.COREUM
    default:
      throw dcentException('coin_type_error', 'not supported coin type --- ' + coinType)
  }
}
