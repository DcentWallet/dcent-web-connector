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

/**
 * 트랜스포트(= bridge popup 창) 연결 상태.
 *
 * ⚠️ **이 축은 "팝업 창이 살아있는가"이지 "기기가 붙어있는가"가 아니다.** 기기 축은 아래
 * `DeviceState` 이며 둘은 독립적으로 움직인다(팝업은 열려 있는데 USB 를 뽑는 경우가 그 예).
 * v1 `setConnectionListener` 가 이 값을 그대로 받으므로 값 집합을 바꾸지 않는다.
 */
export type TransportState = 'connected' | 'disconnected'

/**
 * (2026-08-10) 기기(하드웨어 지갑) 연결 상태 — bridge 가 `_deviceState` 로 push 한다.
 *
 * `'unknown'` 은 **아직 모른다**는 뜻이다. 팝업이 열리기 전(신호를 받은 적 없음)과 팝업이 닫힌 뒤
 * (더 이상 관측할 수 없음)가 여기 해당한다. `'disconnected'` 로 접지 않는 이유는 그게
 * "기기가 빠졌다"는 **거짓 단정**이 되기 때문이다.
 */
export type DeviceState = 'connected' | 'disconnected' | 'unknown'

/**
 * (2026-08-10) 기기 연결 시 함께 오는 표시용 정보.
 *
 * dApp 이 `getDeviceInfo()` 로 직접 받을 수 있는 값의 부분집합이며, **개별 식별자
 * (`deviceId`/`ksm_version`/`state`)는 싣지 않는다** — 요청 없이 자동으로 나가는 신호에
 * 하드웨어 지문을 태우지 않기 위해서다(2026-08-10 결정). 필요하면 dApp 이 `getDeviceInfo()` 를
 * 직접 호출한다.
 *
 * 모든 필드 readonly + 방출 시 `Object.freeze` — `SignProgressInfo` 와 동일 원칙(mutation-isolation).
 */
export interface DeviceBriefInfo {
  readonly label?: string
  readonly firmwareVersion?: string
  readonly deviceModel?: string
  readonly transport?: 'usb' | 'ble'
  readonly coinCount?: number
}

/**
 * (2026-08-10) `state` 이벤트의 2번째 인자 — **두 축을 한 번에** 전달한다.
 *
 * 1번째 인자(`TransportState`)는 v1 호환을 위해 팝업 축 그대로 유지하고, 기기 축은 여기에만
 * 담는다. 리스너는 **두 축 중 하나라도 바뀌면** 호출된다(둘 다 그대로면 호출되지 않는다).
 */
export interface ConnectionStateDetail {
  readonly popup: TransportState
  readonly device: DeviceState
  /** `device === 'connected'` 일 때만 존재. */
  readonly deviceInfo?: DeviceBriefInfo
}

/**
 * `state` 이벤트 핸들러.
 *
 * 🔴 **1번째 인자의 의미는 v1 과 동일하다**(팝업 축) — v1 `setConnectionListener(listener)` 로
 * 등록한 `function (state) {...}` 형태의 기존 dApp 코드가 그대로 동작해야 하기 때문이다.
 * 두 축이 필요하면 2번째 인자를 받는다. JS 는 남는 인자를 무시하므로 추가는 하위호환이다.
 *
 * 단 **호출 빈도는 늘어난다** — 기기 축만 바뀌어도 호출되며, 그때 1번째 인자는 직전과 같은
 * 값일 수 있다. v1 은 값이 바뀔 때만 불렀으므로 이 점은 마이그레이션 문서에 명시한다.
 */
export type StateHandler = (state: TransportState, detail: ConnectionStateDetail) => void

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
  on(event: 'state', handler: StateHandler): void
  /** (m09-04-27) 서명 진행률 이벤트 구독 */
  on(event: 'signProgress', handler: (info: SignProgressInfo) => void): void

  /** 트랜스포트 상태 변경 이벤트 구독 해제 */
  off(event: 'state', handler: StateHandler): void
  /** (m09-04-27) 서명 진행률 이벤트 구독 해제 */
  off(event: 'signProgress', handler: (info: SignProgressInfo) => void): void

  /** 트랜스포트 종료 (popup 닫기 등) */
  close(): Promise<void>
}
