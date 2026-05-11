/**
 * v1 isAvaliableLabel port (m08-01-02.5)
 *
 * v1 src-v1/index.js#l470-477 1:1 port.
 *
 * regex: `/^[a-zA-Z\d.!#$%&\+\-_]{2,14}$/`
 * - 영숫자 + 특수문자(`.!#$%&+-_`)만 허용
 * - 길이 2~14자
 * - 한글 / 공백 / 그 외 특수문자 reject
 *
 * 함수명에 typo (`isAvaliable` not `isAvailable`)가 있으나 v1과 1:1 호환을 위해 보존.
 *
 * 룰 준수:
 *   - boundary-validation: falsy 가드 + regex 검증
 *   - error-handling-consistency: boolean 반환 (throw는 caller — setLabel/syncAccount)
 */

// eslint-disable-next-line no-useless-escape
const LABEL_REGEX = /^[a-zA-Z\d.!#$%&\+\-_]{2,14}$/

/**
 * v1 isAvaliableLabel (src-v1/index.js#l470-477) 1:1 port.
 *
 * @param label 검증할 label 문자열
 * @returns regex match + truthy면 true, 그 외 false
 */
export function isAvaliableLabel (label: string): boolean {
  if (!label || !LABEL_REGEX.test(label)) {
    return false
  }
  return true
}
