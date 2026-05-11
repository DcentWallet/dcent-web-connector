/**
 * v1 checkParameter helper port (m08-01-03)
 *
 * v1 src-v1/index.js#l418의 `checkParameter(type, param)` helper를 v2 TypeScript로 1:1 port.
 *
 * v1 동작 (1:1 호환):
 *   - type === 'numberString':
 *     - typeof param !== 'string' → throw `dcentException('param_error', 'Invaild Parameter - ' + param)` (오타 그대로)
 *     - `0x` prefix 없음 + isNumberString(param) → 그대로 반환
 *     - `0x` prefix 있음 + isHexNumberString(param) → 그대로 반환
 *     - 어느 분기에도 매칭되지 않음 → throw `dcentException('param_error', 'Invaild Parameter - - - ' + param)` (오타 + 4 dashes)
 *   - 기타 type → 정의되지 않음 (v1과 동일하게 undefined 반환 ; m08-01-04 wrapper들이 'numberString' 외 type을 도입할 수 있음)
 *
 * 룰 준수:
 *   - boundary-validation: 입력 문자열의 type/format을 검증, 실패 시 throw (silent return 금지)
 *   - error-handling-consistency: 모든 검증 실패는 throw (`dcentException`)
 *   - external-reference-edge-cases: v1 정규식과 1:1 동등 (drift defense T-DRIFT-CHK-01이 강제)
 *   - reuse-shared-utils: v1 helper를 v2 경로로 옮김 (m08-01-04 wrapper들도 import)
 */

import { dcentException } from '../v1/dcent-exception'

/**
 * v1 isNumberString — 10진수 숫자 문자열 검증.
 *
 * v1 src-v1/index.js와 동일한 정규식: `^[0-9]+$` (양의 정수, '0' 포함).
 */
function isNumberString (str: string): boolean {
  return /^[0-9]+$/.test(str)
}

/**
 * v1 isHexNumberString — 16진수 숫자 문자열 검증.
 *
 * v1 src-v1/index.js와 동일한 정규식: lowercase 후 `^(0x)?[0-9a-f]+$` 매칭.
 */
function isHexNumberString (str: string): boolean {
  return /^(0x)?[0-9a-f]+$/.test(str.toLowerCase())
}

/**
 * v1 checkParameter — 입력 문자열의 type을 검증하고 정규화 반환.
 *
 * 현재 지원: `'numberString'` (10진/16진 숫자 문자열). m08-01-04에서 추가 type 도입 가능.
 *
 * @param type 검증 타입 (`'numberString'`)
 * @param param 검증 대상 값
 * @returns 검증 통과한 입력 그대로 반환 (정규화 없음 — v1 동작)
 * @throws V1Exception (`'param_error'`) — 검증 실패 시
 */
export function checkParameter (type: string, param: unknown): string {
  if (type === 'numberString') {
    if (typeof param !== 'string') {
      throw dcentException('param_error', 'Invaild Parameter - ' + String(param))
    }
    if (param.indexOf('0x') === -1) {
      // 10진수 숫자 문자열
      if (isNumberString(param)) return param
    } else if (param.indexOf('0x') === 0) {
      // 16진수 숫자 문자열
      if (isHexNumberString(param)) return param
    }
    throw dcentException('param_error', 'Invaild Parameter - - - ' + param)
  }
  // v1과 동일: 정의되지 않은 type은 undefined 반환 (m08-01-04에서 추가)
  return param as string
}
