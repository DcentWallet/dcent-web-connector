/**
 * v2 메시지 트랜스포트 추상 인터페이스
 *
 * connector ↔ popup(sdk) 간 양방향 메시지 송수신 추상화.
 * 실제 구현 (PopupTransport)은 cycle 02에서 window.open + postMessage + 이벤트 리스너 도입.
 */

/**
 * 요청 envelope — connector → sdk 방향
 * UUID v4 기반 id (cycle 02에서 uuid 라이브러리 도입 예정)
 *
 * m09-04-01 NEW schema: chainId 별도 필드. sign API는 CAIP-19 chainId를 method와 분리해
 * envelope top-level에 싣고, sdk handleRequest는 method + chainId 조합으로 wm registry dispatch.
 * sign 이외 lifecycle/read-only 메서드는 chainId 없이 송신 가능.
 */
export interface MessageEnvelope<T = unknown> {
  id: string // UUID v4 — 요청-응답 매칭용
  method: string // 메서드 이름 (예: 'signMessage', 'signTransaction', 'getDeviceInfo')
  chainId?: string // CAIP-19 chain identifier (sign API 전용, optional)
  params?: T
}

/**
 * 응답 envelope — sdk → connector 방향
 * JSON-RPC 2.0 호환 형태 (result xor error)
 */
export interface ResponseEnvelope<T = unknown> {
  id: string // 요청 id와 매칭
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

/** 트랜스포트 연결 상태 */
export type TransportState = 'connected' | 'disconnected'

/**
 * (m09-04-27) bridge가 진행 중인 요청에 대해 push하는 서명 진행률 신호.
 * `role`은 opaque — connector는 값의 의미를 해석/분기하지 않는다
 * (connector-chain-addition-isolation 룰).
 *
 * 모든 필드 readonly — 런타임에서 `Object.freeze`로 실제 방출되는 인스턴스도 불변이다
 * (mutation-isolation 룰, PopupTransport.ts 참조). 타입 레벨에서 미리 신호해 strict-mode
 * dApp의 in-place 수정 시도를 컴파일 타임에 잡는다.
 */
export interface SignProgressInfo {
  readonly requestId: string
  readonly step: number
  readonly total: number
  readonly role?: string // opaque — connector는 값의 의미를 해석하지 않는다
}

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
  /** (m09-04-27) 서명 진행률 이벤트 구독 */
  on(event: 'signProgress', handler: (info: SignProgressInfo) => void): void

  /** 트랜스포트 상태 변경 이벤트 구독 해제 */
  off(event: 'state', handler: (state: TransportState) => void): void
  /** (m09-04-27) 서명 진행률 이벤트 구독 해제 */
  off(event: 'signProgress', handler: (info: SignProgressInfo) => void): void

  /** 트랜스포트 종료 (popup 닫기 등) */
  close(): Promise<void>
}
