/**
 * v1 dcentException helper port (m08-01-02.5)
 *
 * v1 src-v1/index.js#L61-L76의 `dcent.dcentException`과 1:1 호환.
 * `throw dcentException(code, message)`가 v1과 동일한 shape의 객체를 throw하도록 보장한다.
 *
 * v2 read-only / configure / tx-builder 함수들이 인자 검증 실패 시 본 헬퍼를 사용.
 *
 * 룰 준수:
 *   - error-handling-consistency: v1 1:1 호환 — throw object 형태 그대로 보존
 *   - mutation-isolation: 매 호출마다 새 객체 반환
 */

/* eslint-disable camelcase */
/** v1 dcentException이 반환하는 throw object shape. v1 wire format에 맞춰 snake_case 사용. */
export interface V1Exception {
  header: {
    version: '1.0'
    request_from: 'dcent-web'
    status: 'error'
  }
  body: {
    error: {
      code: string
      message: string
    }
  }
}
/* eslint-enable camelcase */

/**
 * v1 호환 exception 객체를 생성한다 (caller가 throw).
 *
 * v1 src-v1/index.js#L61-L76:
 *   ```js
 *   dcent.dcentException = function (code, message) {
 *     return { header: {...}, body: { error: { code, message } } }
 *   }
 *   ```
 *
 * @param code v1 error code 문자열 (`'param_error'` / `'coin_type_error'` / `'coin_group_error'` / `'coin_name_error'`)
 * @param message 사용자에게 노출할 에러 메시지
 * @returns 매 호출마다 새 V1Exception 객체 (mutation-isolation)
 */
export function dcentException (code: string, message: string): V1Exception {
  return {
    header: {
      version: '1.0',
      request_from: 'dcent-web',
      status: 'error',
    },
    body: {
      error: {
        code,
        message,
      },
    },
  }
}
