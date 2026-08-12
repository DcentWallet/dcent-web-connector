/**
 * v2 facade — lifecycle pass-through (m08-01-01)
 *
 * v1의 `dcent.setTimeOutMs(...)`, `dcent.setConnectionListener(...)`, `dcent.popupWindowClose()`와
 * 시그니처 1:1 호환. 내부적으로 singleton.ts의 transport에 위임한다.
 *
 * v1과의 차이점:
 *   - v1에서는 호출 즉시 transport가 만들어졌지만 v2는 lazy. setTimeOutMs / setConnectionListener는
 *     transport 미생성 상태에서도 호출 가능 — 다음 ensureSingleton 시점에 자동 적용된다.
 *   - popupWindowClose는 v1과 동일하게 transport가 없으면 no-op (throw 안 함).
 *
 * 룰 준수:
 *   - error-handling-consistency: setTimeOutMs의 invalid 입력은 PopupTransport.setTimeoutMs가 throw.
 *     App이 catch. silent fail 금지.
 *   - boundary-validation: ms / listener 인자 검증은 PopupTransport.setTimeoutMs / .on이 수행
 *     (lifecycle은 pass-through).
 */

import {
  _registerSignProgressListener,
  _registerStateListener,
  _setPendingTimeout,
  _setPendingTransport,
  resetSingleton,
  type SignProgressListener,
  type StateListener,
} from './singleton'
import { _sanitizeTransportOption } from './sign/_sanitizeTransportOption'

/** v1 호환 connection state listener 시그니처. singleton.ts의 StateListener와 동일. */
export type ConnectionListener = StateListener

/** (m09-04-27) 다중 서명 진행률 listener 시그니처. singleton.ts의 SignProgressListener와 동일. */
export type { SignProgressListener } from './singleton'

/**
 * v1 `dcent.setTimeOutMs(N)` 호환.
 *
 * transport 미생성 시 cached. 다음 ensureSingleton 시점에 적용. 이미 transport가 있으면 즉시.
 * boundary-validation은 PopupTransport.setTimeoutMs에서 수행되므로 invalid ms는 throw.
 */
export function setTimeOutMs (timeOutMs: number): void {
  _setPendingTimeout(timeOutMs)
}

/**
 * v1 `dcent.setConnectionListener(listener)` 호환.
 *
 * listener는 cached. resetSingleton 후에도 보존되며 다음 ensureSingleton 시 자동 재등록 (T-U-07).
 * transport가 이미 있으면 즉시 transport.on('state', listener) 호출.
 *
 * 동일 listener를 여러 번 호출하면 그만큼 중복 등록된다 (caller 책임).
 * v1에서도 동일 동작이며, App의 일반 사용 패턴은 1회 호출.
 */
export function setConnectionListener (listener: ConnectionListener): void {
  _registerStateListener(listener)
}

/**
 * (m09-04-27) `dcent.setSignProgressListener(listener)` — 다중 witness 서명 진행률 수신.
 *
 * 하나의 서명 요청이 기기 서명을 2회 이상 요구할 때(예: Cardano 다중 witness) bridge가 push하는
 * 중간 신호를 받는다. 최종 응답과는 완전히 별도 채널이므로 `await dcent.sign(...)`의 resolve
 * 동작에는 영향이 없다.
 *
 * listener는 cached. popupWindowClose 후에도 보존되며 다음 ensureSingleton 시 자동 재등록된다
 * (setConnectionListener와 동일 lifecycle). transport가 이미 있으면 즉시
 * transport.on('signProgress', listener) 호출.
 *
 * 동일 함수 참조로 여러 번 호출해도 transport의 구독 Set이 dedupe하므로 콜백은 1회만
 * 발동한다(setConnectionListener와 동일). 서로 다른 함수(예: 매 렌더마다 새 클로저)를
 * 등록하면 각각 별도로 유지되므로 caller가 필요 시 직접 `off`로 해제해야 한다.
 */
export function setSignProgressListener (listener: SignProgressListener): void {
  _registerSignProgressListener(listener)
}

/**
 * (DC-2701) `dcent.setTransport('hid' | 'ble')` — 연결 단위 transport 힌트.
 *
 * popup이 처음 열릴 때(첫 호출) sdk handshake로 송신되어 picker를 해당 transport로 고정한다:
 *   - 'hid'      → USB 전용 picker + HID 자동연결
 *   - 'ble'      → BLE 전용 picker (자동연결 불가, gesture 필요)
 *   - undefined  → default. HID/BLE 둘 다 + HID 자동연결
 *
 * transport는 기기 연결 속성이므로 sign 메서드 per-call 옵션이 아닌 연결 단위로 둔다.
 * **첫 호출 전에** 설정해야 적용된다(handshake first-wins). popup이 이미 열린 뒤 호출하면
 * 다음 연결(popupWindowClose 후 재연결)부터 적용. transport 미생성 시 cache.
 *
 * @param transport 'hid' | 'ble' | undefined. invalid 값은 _sanitizeTransportOption이 throw.
 */
export function setTransport (transport: 'hid' | 'ble' | undefined): void {
  _setPendingTransport(_sanitizeTransportOption(transport))
}

/**
 * v1 `dcent.popupWindowClose()` 호환.
 *
 * popup을 닫고 transport를 해제. cached listeners / pendingTimeoutMs는 유지되어
 * 다음 호출 시 자동 복구.
 *
 * transport가 미생성 상태이면 no-op (throw 안 함). v1 동일 동작.
 */
export function popupWindowClose (): void {
  resetSingleton()
}
