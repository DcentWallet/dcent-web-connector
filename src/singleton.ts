/**
 * v2 facade — module-level lazy singleton (m08-01-01)
 *
 * dApp이 PopupTransport / SerialRequestQueue를 직접 다루지 않도록, 두 인스턴스를
 * 모듈 스코프 변수로 보유하고 lazy-init한다. lifecycle.ts와 후속 child의
 * sign / read-only 메서드는 모두 이 singleton을 통해 transport / queue에 접근한다.
 *
 * 책임 분리:
 *   - lazy 생성: 첫 호출 시점에 PopupTransport({}) + SerialRequestQueue 생성
 *   - 인스턴스 재사용: 동일 호출 식별성 보장 (T-U-02)
 *   - reset 후 listener / pendingTimeout 보존: dApp이 reset 후에도 setConnectionListener를
 *     재등록할 필요 없도록 cached 상태를 다음 ensureSingleton에서 자동 적용
 *
 * 룰 준수:
 *   - error-handling-consistency: PopupTransport 생성자가 throw하면 그대로 propagate.
 *     호출자(dApp)가 catch. silent failure 금지.
 *   - mutation-isolation: 외부에 객체 자체를 노출하지 않고 항상 ensureSingleton()을
 *     통해 가져가게 함 — 외부에서 _transport = null 같은 직접 변경 불가.
 *   - reuse-shared-utils: PopupTransport / SerialRequestQueue는 src/transport/, src/queue/의
 *     기존 구현을 재사용 (m02-01·m02-02·m07-02 SHIPPED)
 */

import { PopupTransport } from './transport/PopupTransport'
import { SerialRequestQueue } from './queue/RequestQueue'
import type { TransportState } from './transport/MessageTransport'

/** state listener 시그니처. lifecycle.ts의 ConnectionListener와 동일 형태. */
export type StateListener = (state: TransportState) => void

let _transport: PopupTransport | null = null
let _queue: SerialRequestQueue | null = null
let _stateListeners: StateListener[] = []
let _pendingTimeoutMs: number | undefined

/**
 * lazy singleton — 첫 호출 시 PopupTransport + SerialRequestQueue 생성.
 * 이후 호출은 동일 인스턴스 반환.
 *
 * 새로 생성되는 시점에 cached `_pendingTimeoutMs`가 있으면 즉시 적용,
 * cached `_stateListeners`가 있으면 모두 transport.on('state', ...)으로 재등록한다.
 * resetSingleton 후의 자동 복구 동작 (T-U-04, T-U-07).
 */
export function ensureSingleton (): {
  transport: PopupTransport
  queue: SerialRequestQueue
} {
  if (!_transport) {
    _transport = new PopupTransport({})
    if (_pendingTimeoutMs !== undefined) {
      _transport.setTimeoutMs(_pendingTimeoutMs)
    }
    for (const l of _stateListeners) {
      _transport.on('state', l)
    }
    _queue = new SerialRequestQueue()
  }
  return { transport: _transport, queue: _queue! }
}

/**
 * singleton을 닫고 인스턴스를 해제한다.
 * `_stateListeners`와 `_pendingTimeoutMs`는 보존 — 다음 ensureSingleton 호출 시 자동 복구.
 *
 * close()는 PopupTransport 내부에서 fire-and-forget으로 처리되며, 이 함수는 throw하지 않는다.
 * popup이 이미 닫혀있거나 transport가 cleanup 중이어도 silent하게 진행 (async-hygiene 룰).
 */
export function resetSingleton (): void {
  if (_transport) {
    // close()는 Promise를 반환하지만 fire-and-forget. 실패는 close() 내부에서 처리됨.
    _transport.close().catch(() => {
      /* defensive noop — close()는 reject를 던지지 않게 설계됨 (PopupTransport.close 참조) */
    })
    _transport = null
    _queue = null
  }
  // _stateListeners와 _pendingTimeoutMs는 의도적으로 유지
}

// === 후속 child(m08-01-02 등)가 사용할 internal hook ===
// 이름 앞에 underscore — npm public API가 아닌 sibling module 전용 (관습적 표기).

/** sign / read-only 메서드 구현이 사용. */
export function _getQueue (): SerialRequestQueue {
  return ensureSingleton().queue
}

/** transport pass-through 함수가 사용. */
export function _getTransport (): PopupTransport {
  return ensureSingleton().transport
}

/**
 * lifecycle.ts의 setConnectionListener가 사용.
 * listener를 cached 목록에 추가하고, transport가 이미 존재하면 즉시 attach.
 */
export function _registerStateListener (listener: StateListener): void {
  _stateListeners.push(listener)
  if (_transport) {
    _transport.on('state', listener)
  }
}

/**
 * lifecycle.ts의 setTimeOutMs가 사용.
 * transport가 없으면 pending에 저장, 있으면 즉시 적용.
 *
 * boundary-validation은 PopupTransport.setTimeoutMs에서 수행되므로 여기서는 pass-through.
 * (단, transport가 없는 상태에서는 검증이 지연되어 다음 ensureSingleton 시점에 적용된다 —
 * `setTimeOutMs(NaN)` 같은 invalid 입력은 다음 ensureSingleton에서 throw됨.)
 */
export function _setPendingTimeout (ms: number): void {
  _pendingTimeoutMs = ms
  if (_transport) {
    _transport.setTimeoutMs(ms)
  }
}

// === 테스트 전용 reset (production에서는 사용하지 않음) ===

/**
 * 단위 테스트에서 module-level state를 완전 초기화하기 위한 helper.
 * production code에서 호출 금지 — 모든 cached state(listeners, pendingTimeout)도 비움.
 *
 * @internal
 */
export function _resetForTesting (): void {
  if (_transport) {
    _transport.close().catch(() => {
      /* noop */
    })
  }
  _transport = null
  _queue = null
  _stateListeners = []
  _pendingTimeoutMs = undefined
}
