/**
 * v2 메시지 트랜스포트 추상 인터페이스
 *
 * connector ↔ popup(sdk) 간 양방향 메시지 송수신 추상화.
 * 실제 구현 (PopupTransport)은 cycle 02에서 window.open + postMessage + 이벤트 리스너 도입.
 */

/**
 * 요청 envelope — connector → sdk 방향
 * UUID v4 기반 id (cycle 02에서 uuid 라이브러리 도입 예정)
 */
export interface MessageEnvelope<T = unknown> {
  id: string        // UUID v4 — 요청-응답 매칭용
  method: string    // 메서드 이름 (예: 'connect', 'signTransaction')
  params?: T
}

/**
 * 응답 envelope — sdk → connector 방향
 * JSON-RPC 2.0 호환 형태 (result xor error)
 */
export interface ResponseEnvelope<T = unknown> {
  id: string        // 요청 id와 매칭
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

/** 트랜스포트 연결 상태 */
export type TransportState = 'connected' | 'disconnected'

/**
 * 메시지 트랜스포트 인터페이스
 * 모든 구현체는 이 인터페이스를 준수한다.
 */
export interface MessageTransport {
  /**
   * 메시지를 sdk popup으로 송신하고 응답을 기다린다.
   * stub 구현은 METHOD_NOT_FOUND로 reject.
   */
  send<TParams, TResult>(
    message: MessageEnvelope<TParams>
  ): Promise<ResponseEnvelope<TResult>>

  /** 트랜스포트 상태 변경 이벤트 구독 */
  on(event: 'state', handler: (state: TransportState) => void): void

  /** 트랜스포트 상태 변경 이벤트 구독 해제 */
  off(event: 'state', handler: (state: TransportState) => void): void

  /** 트랜스포트 종료 (popup 닫기 등) */
  close(): Promise<void>
}
