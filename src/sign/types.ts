/**
 * v2 sign 응답 타입 — v1 호환 형태 (m08-01-02)
 *
 * v1의 `messageReceive` 핸들러가 dApp에 돌려주던 payload(`{header, body}`) 구조와 1:1 호환.
 * dApp이 v2 통합 sign API를 호출할 때 받는 응답이 v1 시절과 동일한 shape을 갖도록 보장한다.
 *
 * 룰 준수:
 *   - mutation-isolation: V1Response는 매 호출마다 새 객체로 생성 (call.ts 참조)
 *   - boundary-validation: header/body 필드 존재 여부는 호출자 또는 _assertV1Success가 검증
 */

/* eslint-disable camelcase */
/** 응답 헤더 — v1 dcent.call() 응답의 `header` 필드 형태.
 *  v1 wire format이 snake_case를 사용하므로 camelcase 룰 disable. */
export interface V1ResponseHeader {
  /** 프로토콜 버전 — '1.0' 등 */
  version: string
  /** 요청 측 식별 (sdk가 응답에 포함) */
  request_from?: string
  /** 응답 측 식별 — 'czone' 등의 wallet 그룹 식별자가 들어올 수 있다 */
  response_from?: string
  /** 처리 결과 */
  status: 'success' | 'failure'
}
/* eslint-enable camelcase */

/** 응답 본문 — v1 dcent.call() 응답의 `body` 필드 형태. */
export interface V1ResponseBody {
  /** command 종류 — 'transaction' / 'getAddress' / 'getDeviceInfo' 등 */
  command?: string
  /** 성공 응답 페이로드 — signed_tx / address / device_id 등 */
  parameter?: Record<string, unknown>
  /** 실패 응답 — code/message 쌍 */
  error?: {
    code: string
    message: string
  }
}

/**
 * v1 호환 응답 — v2 통합 sign API의 반환 shape.
 *
 * v1 시절 dApp이 받던 `{header, body}` 구조와 1:1 동등.
 * v2에서는 underlying transport가 JSON-RPC 2.0 envelope을 사용하지만,
 * connector facade가 이 envelope을 V1Response로 매핑하여 dApp 호환성을 유지한다.
 */
export interface V1Response {
  header: V1ResponseHeader
  body: V1ResponseBody
}
