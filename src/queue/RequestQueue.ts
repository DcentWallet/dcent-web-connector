/**
 * v2 요청 큐 — 단일 동시성 보장
 *
 * connector가 sdk에 보내는 요청을 직렬화하여 동시에 여러 요청이 처리되는 것을 방지.
 * cycle 02부터 실제 PopupTransport와 결합되어 동작.
 */

/** 요청 큐 인터페이스 */
export interface RequestQueue {
  /** task를 큐에 추가하고 완료 Promise를 반환 */
  enqueue<T>(task: () => Promise<T>): Promise<T>

  /** 현재 pending 중인 작업 수 */
  size(): number

  /** 큐 초기화 (pending 카운트 리셋) */
  clear(): void
}

/**
 * SerialRequestQueue — 단일 동시성 직렬 실행 큐
 *
 * async-hygiene 룰: chain.then(task, task) 패턴
 *   - 두 번째 인자(reject handler)로 동일 task를 매핑하여
 *     이전 task가 reject되어도 현재 task가 실행되도록 보장.
 *   - 즉, 한 task의 실패가 후속 enqueue를 영구 차단하지 않음.
 *
 * cycle 02에서 AbortController를 도입하여 clear() 시 미완 task 취소 강화 예정.
 */
export class SerialRequestQueue implements RequestQueue {
  private chain: Promise<unknown> = Promise.resolve()
  private pending = 0

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.pending += 1
    // chain.then(task, task): 이전 작업의 resolve/reject 무관하게 task 실행
    const result = this.chain.then(task, task) as Promise<T>
    // chain 자체는 pending 감소만 담당 — 결과값을 담지 않음
    this.chain = result.then(
      () => { this.pending -= 1 },
      () => { this.pending -= 1 }
    )
    return result
  }

  size(): number {
    return this.pending
  }

  clear(): void {
    // 현재는 새 chain으로 리셋만 수행.
    // cycle 02에서 AbortController로 미완 task 취소 강화 예정.
    this.chain = Promise.resolve()
    this.pending = 0
  }
}
