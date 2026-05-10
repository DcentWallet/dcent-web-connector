/**
 * v2 sign — request ID generator (m08-01-02)
 *
 * PopupTransport.send의 `id` 인자에 사용되는 unique string을 생성한다.
 * 매 호출마다 서로 다른 값을 반환해야 한다 (request-response 매칭의 신뢰성 근거).
 *
 * 구현 전략:
 *   - timestamp(performance.now if available, otherwise Date.now) + monotonic counter
 *   - UUID v4 의존성 추가 없이 충돌 방지 (동시 호출도 counter로 구분)
 *
 * 룰 준수:
 *   - external-reference-edge-cases: ID는 protocol-level primitive가 아니라 transport용 ephemeral key.
 *     bytewise 정확성 요구는 없음. 단 monotonic + collision-free 속성만 보장.
 */

let _counter = 0

/** monotonic 보장을 위한 last timestamp (동일 ms에 여러 호출이 와도 counter로 구분). */
let _lastTs = 0

/**
 * 매 호출마다 다른 string을 반환한다.
 * 형식: `dcent-{timestamp}-{counter}` — 사람이 디버깅 시 origin 추적 가능.
 */
export function _genId (): string {
  const now = Date.now()
  // 동일 ms에 호출되어도 _counter가 monotonic 증가하므로 항상 unique
  _counter = (_counter + 1) >>> 0
  if (now !== _lastTs) {
    _lastTs = now
  }
  return `dcent-${now}-${_counter}`
}
