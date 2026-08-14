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
 *
 * (2026-08-14) `'awaiting-connect-approval'` 은 **링크는 열렸는데 기기 화면에서 사용자가 아직
 * 허용하지 않은** 중간 상태다. 종전에는 이 구간이 `'unknown'` 에 삼켜져 팝업이 막 열린 것과
 * 구분되지 않았다.
 *
 * NOTE(decision-anchor: m19-01-awaiting-is-device-axis-value): 별도 boolean(pendingApproval)로
 * 빼지 말 것. 축의 값이라야 App 의 지배적 패턴인 device === 'connected' 체크가 자동으로
 * fail-closed 가 된다. 필드로 빼면 그 필드를 모르는 기존 코드가 승인 전 기기를 '붙었다'로 읽는다.
 */
export type DeviceState =
  | 'connected'
  | 'disconnected'
  | 'awaiting-connect-approval'
  | 'unknown'

/**
 * (2026-08-14) 기기 축이 `'disconnected'` 로 간 **사유**. 상태가 아니라 전이의 원인이므로
 * `DeviceState` 의 값이 아니라 별도 주석 필드로 둔다 — 거절 시점에 이미 handle 이 반납되어
 * 실제 축은 `'disconnected'` 다.
 *
 * 🔴 `'connect-'` 접두는 **서명 확인 거절과 구분**하기 위한 것이다. 서명 확인은 요청 스코프라
 * 요청 promise 가 4001 로 표현하며 이 축에 오지 않는다.
 *
 * 🔴 **wire 키는 `reason`**(`_deviceState.reason`), App 에 노출되는 이름은 `deviceReason` 이다.
 * bridge 가 `deviceReason` 으로 보내면 whitelist 에 걸리지 않아 **조용히 `undefined`** 가 된다
 * (메시지 자체는 통과하므로 원인 추적이 어렵다). 배선 시 이 비대칭을 확인할 것.
 *
 * 🔴 이 사유를 받아도 **진행 중인 요청 promise 는 settle 되지 않는다** — 최대
 * `timeoutMs`(기본 180초) 매달린다. App 이 거절 UX 를 즉시 닫으려면 이 콜백에서 자체적으로
 * 취소 처리해야 한다.
 */
export type DeviceDisconnectReason =
  /** 기기 화면에서 사용자가 거절 (USB Stage 2 마커 0x15). */
  | 'connect-approval-rejected'
  /**
   * 팝업에서 취소 / BLE 세션 인계 / BLE 경로의 승인 불성립(거절·링크절단 미구분)
   * / **원인을 관측하지 못한 이탈**(bridge 의 catch-all fallback).
   */
  | 'connect-approval-cancelled'
  /** 케이블 분리 · GATT 절단 · 명시적 transport 해제 (bridge 가 UI 분기와 동일 기준으로 판정). */
  | 'device-removed'
  /** 자동 재연결 예산 소진. */
  | 'reconnect-timeout'
  /**
   * 승인 대기 **도중** transport 자체가 깨진 경우 (USB fatal). 사용자는 허용·거절·취소를
   * 한 적이 없다 — "취소됨" 으로 접으면 사실과 다른 사유가 App 에 나간다.
   *
   * 🔴 이 값은 **승인 단계에 도달한 뒤**의 실패에만 쓴다. 승인 화면에 가보지도 못한 연결
   * 실패는 애초에 이 축이 `'unknown'` 이라 `disconnected` 를 push 하지 않는다.
   */
  | 'transport-failed'

/**
 * (2026-08-10) 기기 연결 시 함께 오는 표시용 정보.
 *
 * 🔴 **필드 이름은 `getDeviceInfo()` 응답과 동일하다** — `label` / `version` / `deviceModel` /
 * `connectType`. 두 API 를 같이 쓰는 App 이 같은 값을 두 어휘로 배우지 않게 하기 위해서다
 * (2026-08-10 사용자 결정). 이름이 갈리면 `detail.deviceInfo.version` 을 쓸 자리에
 * `firmwareVersion` 을 써 조용히 `undefined` 를 읽는 사고가 난다.
 *
 * App 이 `getDeviceInfo()` 로 직접 받을 수 있는 값의 부분집합이다.
 *
 * ## `deviceId` 를 싣는다 (2026-08-10 결정 변경)
 *
 * 처음에는 **뺐다** — 요청 없이 자동으로 나가는 신호에 하드웨어 지문을 태우지 않는다는 이유였다.
 * 그런데 실사용에서 그 결정이 화면을 못 쓰게 만들었다: 사용자 라벨(`label`)을 설정하지 않은
 * 기기는 표시할 이름이 없어 `label` 자리가 통째로 비고, App 이 **어느 기기인지 구별할 수단이
 * 아예 없다**(모델명은 같은 모델이면 전부 같다). 그래서 사용자 결정으로 다시 싣는다.
 *
 * 🔴 **트레이드오프를 알고 쓰는 값이다.** `deviceId` 는 기기를 특정하므로, App 이 요청하지
 * 않아도 이 신호를 구독하는 것만으로 재방문을 추적할 수 있다. 그래도 `ksm_version`(보안칩
 * 펌웨어)과 기기 `state` 는 **여전히 싣지 않는다** — 식별에 필요하지 않고, 기기 내부 상태를
 * 노출할 이유가 없다.
 *
 * `coinCount` 만 `getDeviceInfo()` 에 짝(`coin_list`)이 있는데도 이름이 다르다. 배열을 그대로
 * 보내지 않기 때문이다 — **설치된 코인 조합 자체가 준-식별 정보**라, 목록을 실으면 위에서 뺀
 * `deviceId`/`ksm_version` 을 뒷문으로 다시 들이는 셈이 된다. 개수는 그렇지 않다.
 *
 * 모든 필드 readonly + 방출 시 `Object.freeze` — `SignProgressInfo` 와 동일 원칙(mutation-isolation).
 */
export interface DeviceBriefInfo {
  /**
   * 기기 식별자. `getDeviceInfo()` 의 `deviceId` 와 같다.
   *
   * 라벨이 설정되지 않은 기기를 구별하는 유일한 수단이다. 위 트레이드오프 주석 참조.
   */
  readonly deviceId?: string
  /** 사용자 설정 라벨. `getDeviceInfo()` 의 `label` 과 같다. */
  readonly label?: string
  /** 펌웨어 버전. `getDeviceInfo()` 의 `version` 과 같다. */
  readonly version?: string
  /** 모델명. `getDeviceInfo()` 의 `deviceModel` 과 같다. */
  readonly deviceModel?: string
  /** 연결 방식. `getDeviceInfo()` 의 `connectType` 과 같다. */
  readonly connectType?: 'usb' | 'ble'
  /** 설치된 코인 **개수**. `getDeviceInfo()` 는 목록(`coin_list`)을 주지만 여기선 개수만 — 위 주석 참조. */
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
  /**
   * (2026-08-14) `device === 'disconnected'` 일 때만 존재. 위 `deviceInfo` 와 정확히 대칭.
   *
   * 🔴 사유를 받아도 **진행 중인 요청 promise 는 settle 되지 않는다**(최대 `timeoutMs`, 기본
   * 180초). `DeviceDisconnectReason` docblock 참조.
   */
  readonly deviceReason?: DeviceDisconnectReason
}

/**
 * `state` 이벤트 핸들러.
 *
 * 🔴 **1번째 인자의 의미는 v1 과 동일하다**(팝업 축) — v1 `setConnectionListener(listener)` 로
 * 등록한 `function (state) {...}` 형태의 기존 App 코드가 그대로 동작해야 하기 때문이다.
 * 두 축이 필요하면 2번째 인자를 받는다. JS 는 남는 인자를 무시하므로 추가는 하위호환이다.
 *
 * 단 **호출 빈도는 늘어난다** — 기기 축만 바뀌어도 호출되며, 그때 1번째 인자는 직전과 같은
 * 값일 수 있다. v1 은 값이 바뀔 때만 불렀으므로 이 점은 마이그레이션 문서에 명시한다.
 *
 * (2026-08-14) `detail.device` 는 `'awaiting-connect-approval'`(기기 화면 승인 대기) 로도 올 수
 * 있고, `'disconnected'` 일 때는 `detail.deviceReason` 에 사유가 함께 온다. `device` 를
 * if/else 로 분기하는 App 은 새 값이 마지막 `else` 가지에 흡수되지 않도록 명시 분기를 둔다.
 */
export type StateHandler = (state: TransportState, detail: ConnectionStateDetail) => void

/**
 * (m09-04-27) bridge가 진행 중인 요청에 대해 push하는 서명 진행률 신호.
 * `role`은 opaque — connector는 값의 의미를 해석/분기하지 않는다
 * (connector-chain-addition-isolation 룰).
 *
 * 모든 필드 readonly — 런타임에서 `Object.freeze`로 실제 방출되는 인스턴스도 불변이다
 * (mutation-isolation 룰, PopupTransport.ts 참조). 타입 레벨에서 미리 신호해 strict-mode
 * App의 in-place 수정 시도를 컴파일 타임에 잡는다.
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
