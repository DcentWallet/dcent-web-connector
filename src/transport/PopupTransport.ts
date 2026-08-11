import {
  MessageTransport,
  MessageEnvelope,
  ResponseEnvelope,
  TransportState,
  SignProgressInfo,
  DeviceState,
  DeviceBriefInfo,
  ConnectionStateDetail,
  StateHandler,
} from './MessageTransport'
import { ProviderError } from '../error/ProviderError'
import { ErrorCode } from '../error/ErrorCode'
import { toWireTransport } from '../sign/_sanitizeTransportOption'

/**
 * PopupTransport 옵션
 * 모든 필드 optional — 기본값은 v1과 동일
 */
export interface PopupTransportOptions {
  /** popup으로 열 sdk URL. 기본 'https://v2bridge.dcentwallet.com/' */
  popUpUrl?: string
  /**
   * 응답 대기 timeout (ms). 기본 180000 (180s / 3분).
   *
   * 60s(v1 동일)에서 상향: CIP-95(Cardano governance/DRep) 등 디바이스 서명을
   * 2회 받아야 하는 흐름은 사용자 confirm × 2 + 화면 확인 시간으로 60s를 넘겨
   * connector layer(TIMEOUT 5006)가 먼저 끊는 사례가 있었다. interactive 서명은
   * 사람을 기다리므로 넉넉한 backstop이 필요. dApp이 더 짧게/길게 원하면
   * `setTimeOutMs` / 생성자 `timeoutMs`로 override 가능.
   */
  timeoutMs?: number
  /** postMessage 보안 origin. 미지정 시 popUpUrl의 URL.origin */
  origin?: string
  /** connector 측 protocol version. 기본 '2.0'. handshake 시 sdk와 major match 비교 (m02-02). */
  protocolVersion?: string
  /**
   * sdk → connector `_ready` 신호 대기 timeout (ms). 기본 10000 (10s).
   * 미수신 시 silent fallback으로 `_handshake`를 즉시 송신 (구 sdk 호환). m07-02 B Gate.
   */
  readyTimeoutMs?: number
  /**
   * `_handshake` ack 대기 timeout (ms). 기본 60000 (60s).
   *
   * ⚠️ `timeoutMs`(request/response, 180s)와 **분리**한다. handshake ack는
   * 사람이 개입하지 않는 기계-대-기계 popup-load 확인 신호라, interactive 서명용
   * 180s backstop을 상속하면 dead/blocked/wrong-URL popup이 최대 190s(readyTimeout
   * 10s + handshake 180s) 동안 dApp promise를 붙잡는 실패경로 latency 회귀가 생긴다.
   * handshake는 popup 로드 직후 즉시 응답되므로 60s로 충분하다 (PR #175 이전 동작 유지).
   */
  handshakeTimeoutMs?: number
}

/**
 * sdk(m07-01) → connector 단방향 ready signal envelope.
 * `id` / `method`가 부재한 신호 메시지로, messageListener의 envelope shape 검증에서
 * 별도 분기로 인식된다 (boundary-validation 룰).
 */
export interface ReadySignal {
  type: '_ready'
  version: string
  serverName: string
}

interface PendingRequest {
  resolve: (response: ResponseEnvelope<unknown>) => void
  reject: (error: ProviderError) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * PopupTransport — MessageTransport 실제 구현 (m02-01) + handshake 레이어 (m02-02)
 *
 * window.open으로 sdk popup을 열고 postMessage로 MessageEnvelope를 송신,
 * 응답을 id 기반으로 매칭하여 resolve. timeout / popup close / cleanup 모두 처리.
 *
 * m02-02 handshake:
 *   - send 첫 호출 시 자동으로 `_handshake` 메시지 송신 + sdk ack 대기 + version major 비교
 *   - 다중 send 동시 호출 시 in-flight handshake Promise 공유 (race 방지)
 *   - 실패 시 fail-fast (close + reject) — retry는 caller 책임
 *
 * 책임 분리:
 *   - id 생성: caller 책임 (PopupTransport는 매칭만 수행, 단 handshake id는 내부 생성)
 *   - sdk 짝맞춤 ack: 비스코프 (m02-03에서 별도)
 *
 * 룰 준수:
 *   - error-handling-consistency: 실패 경로 모두 ProviderError throw/reject + close()
 *   - async-hygiene: clearTimeout/clearInterval/removeEventListener 모두 cleanup, handshakePromise 공유로 race 방지
 *   - boundary-validation: postMessage origin + envelope shape + setTimeoutMs 인자 + handshake 응답 version shape
 */
export class PopupTransport implements MessageTransport {
  private readonly popUpUrl: string
  private readonly origin: string
  private readonly protocolVersion: string
  private readonly readyTimeoutMs: number
  private readonly handshakeTimeoutMs: number
  private timeoutMs: number

  private popupWindow: Window | null = null
  private pending: Map<string, PendingRequest> = new Map()
  /**
   * (m09-04-03) caller가 다음 handshake 시점에 sdk로 전달할 transport 힌트.
   * popup lifecycle 단위 first-wins (audit R12): handshake는 첫 send에서만 1회 fire.
   * 두 번째 sign 호출 시 setPendingTransport가 다시 호출되어도 handshakePromise가 이미
   * 존재하므로 ensureHandshake가 새 handshake를 보내지 않음 → transport 변경 silent ignore.
   */
  private pendingTransport: 'hid' | 'ble' | undefined = undefined
  private stateHandlers: Set<StateHandler> = new Set()
  /**
   * (m09-04-27) `_signProgress` 중간 신호 구독자. stateHandlers와 동일한 Set 패턴.
   * state와 달리 transport 로컬 상태가 아니라 bridge가 in-flight 요청에 대해 push하는 이벤트다.
   */
  private signProgressHandlers: Set<(info: SignProgressInfo) => void> = new Set()
  private messageListener: ((event: MessageEvent) => void) | null = null
  private closePollingInterval: ReturnType<typeof setInterval> | null = null
  private currentState: TransportState = 'disconnected'
  /**
   * (2026-08-10) 기기 축. 팝업 축(`currentState`)과 **독립**이다 — 팝업이 열린 채로 USB 를
   * 뽑으면 이 값만 바뀐다. 초기값이 `'disconnected'` 가 아니라 `'unknown'` 인 이유는
   * "아직 신호를 받은 적 없음"과 "기기가 빠졌음"을 구분하기 위해서다(MessageTransport.ts 참조).
   */
  private currentDeviceState: DeviceState = 'unknown'
  /** `currentDeviceState === 'connected'` 일 때만 채워진다. */
  private currentDeviceInfo: DeviceBriefInfo | undefined = undefined
  private handshakePromise: Promise<void> | null = null
  // m07-02: _ready 게이트 (B Gate) 상태
  private readyPromise: Promise<void> | null = null
  private readyTimer: ReturnType<typeof setTimeout> | null = null
  private resolveReady: (() => void) | null = null
  // m07-02: pre-handshake 단계(ensureReady → ensureHandshake chain) 도중인 send의 reject 콜백.
  // close() 시 이들을 DISCONNECTED로 reject하여 게이트에서 정지된 send도 즉시 종료.
  private preHandshakeRejecters: Set<(error: ProviderError) => void> = new Set()

  constructor (options: PopupTransportOptions = {}) {
    this.popUpUrl = options.popUpUrl ?? 'https://v2bridge.dcentwallet.com/'
    this.timeoutMs = options.timeoutMs ?? 180000
    this.origin = options.origin ?? new URL(this.popUpUrl).origin
    this.protocolVersion = options.protocolVersion ?? '2.0'
    // boundary-validation: readyTimeoutMs는 양의 유한 number만 허용. 미지정 시 default 10s.
    const ready = options.readyTimeoutMs
    if (ready === undefined) {
      this.readyTimeoutMs = 10000
    } else if (typeof ready !== 'number' || !Number.isFinite(ready) || ready <= 0) {
      throw new ProviderError(
        ErrorCode.INVALID_PARAMS,
        `readyTimeoutMs must be a positive finite number, got ${String(ready)}`,
      )
    } else {
      this.readyTimeoutMs = ready
    }
    // boundary-validation: handshakeTimeoutMs도 양의 유한 number만 허용. 미지정 시 default 60s.
    // timeoutMs(180s)와 분리 — handshake ack는 human-gated 아님 (Claude 크로스 리뷰 WARNING).
    const hs = options.handshakeTimeoutMs
    if (hs === undefined) {
      this.handshakeTimeoutMs = 60000
    } else if (typeof hs !== 'number' || !Number.isFinite(hs) || hs <= 0) {
      throw new ProviderError(
        ErrorCode.INVALID_PARAMS,
        `handshakeTimeoutMs must be a positive finite number, got ${String(hs)}`,
      )
    } else {
      this.handshakeTimeoutMs = hs
    }
  }

  send<TParams, TResult> (
    message: MessageEnvelope<TParams>,
  ): Promise<ResponseEnvelope<TResult>> {
    return new Promise((resolve, reject) => {
      // 1. popup 보장 (없거나 닫혔으면 새로 열기)
      this.ensurePopup(reject)
      if (!this.popupWindow) return

      // 2. message listener 부착 (1회)
      this.ensureMessageListener()

      // 3. close polling 시작 (1회)
      this.ensureClosePolling()

      // m07-02: pre-handshake 단계에 close()가 호출되면 이 reject로 즉시 종료
      this.preHandshakeRejecters.add(reject)

      // 4. m07-02 B Gate: _ready 신호 대기 → handshake 보장 → 실제 send 진행
      this.ensureReady()
        .then(() => this.ensureHandshake())
        .then(
        () => {
          // pre-handshake 구간 통과 — rejecter 제거 (이후는 pending Map이 close() 처리)
          this.preHandshakeRejecters.delete(reject)

          // 4a. timeout 설정
          const timer = setTimeout(() => {
            this.pending.delete(message.id)
            reject(
              new ProviderError(
                ErrorCode.TIMEOUT,
                `Request timed out after ${this.timeoutMs}ms (id=${message.id})`,
              ),
            )
          }, this.timeoutMs)

          // 4b. pending 등록
          this.pending.set(message.id, {
            resolve: resolve as (r: ResponseEnvelope<unknown>) => void,
            reject,
            timer,
          })

          // 4c. postMessage 송신 (실패 시 cleanup + reject)
          try {
            this.popupWindow!.postMessage(message, this.origin)
          } catch (err) {
            clearTimeout(timer)
            this.pending.delete(message.id)
            reject(
              new ProviderError(
                ErrorCode.INTERNAL_ERROR,
                `postMessage failed: ${(err as Error).message}`,
              ),
            )
          }
        },
        (handshakeError) => {
          this.preHandshakeRejecters.delete(reject)
          // handshake 실패 시 send도 즉시 fail (close()는 sendHandshake 내부에서 이미 호출됨)
          reject(handshakeError)
        },
      )
    })
  }

  on (event: 'state', handler: StateHandler): void
  on (event: 'signProgress', handler: (info: SignProgressInfo) => void): void
  on (
    event: 'state' | 'signProgress',
    handler: StateHandler | ((info: SignProgressInfo) => void),
  ): void {
    if (event === 'state') { this.stateHandlers.add(handler as StateHandler); return }
    if (event === 'signProgress') { this.signProgressHandlers.add(handler as (info: SignProgressInfo) => void); return }
  }

  off (event: 'state', handler: StateHandler): void
  off (event: 'signProgress', handler: (info: SignProgressInfo) => void): void
  off (
    event: 'state' | 'signProgress',
    handler: StateHandler | ((info: SignProgressInfo) => void),
  ): void {
    if (event === 'state') { this.stateHandlers.delete(handler as StateHandler); return }
    if (event === 'signProgress') { this.signProgressHandlers.delete(handler as (info: SignProgressInfo) => void); return }
  }

  /**
   * (m09-04-03) 다음 handshake에 sdk로 전달할 transport 힌트를 설정.
   *
   * 호출 시점: 첫 send 호출이 handshake를 trigger하기 전에 _call이 본 method로 설정.
   * popup lifecycle 단위 first-wins (audit R12): handshakePromise가 이미 생성된 후에는
   * 본 setter가 호출되어도 ensureHandshake가 기존 Promise를 재사용하므로 transport 변경이
   * 실제로는 반영되지 않음 (silent ignore). 이는 의도된 동작 — popup 내 transport 재변경은
   * application error로 간주.
   *
   * @param transport 설정할 transport 힌트. undefined로 호출하면 hint 비우기 (sdk picker 흐름).
   */
  setPendingTransport (transport: 'hid' | 'ble' | undefined): void {
    this.pendingTransport = transport
  }

  async close (): Promise<void> {
    // 1. 모든 pending 요청 reject (DISCONNECTED)
    for (const [id, p] of this.pending.entries()) {
      clearTimeout(p.timer)
      p.reject(
        new ProviderError(
          ErrorCode.DISCONNECTED,
          `Transport closed before response (id=${id})`,
        ),
      )
    }
    this.pending.clear()

    // 1b. m07-02: pre-handshake 단계 도중인 send도 모두 reject
    for (const r of this.preHandshakeRejecters) {
      r(
        new ProviderError(
          ErrorCode.DISCONNECTED,
          'Transport closed before handshake completed',
        ),
      )
    }
    this.preHandshakeRejecters.clear()

    // 2. message listener 해제
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener)
      this.messageListener = null
    }

    // 3. close polling 해제
    if (this.closePollingInterval) {
      clearInterval(this.closePollingInterval)
      this.closePollingInterval = null
    }

    // 4. popup 닫기 (이미 닫혀있으면 스킵)
    if (this.popupWindow && !this.popupWindow.closed) {
      this.popupWindow.close()
    }
    this.popupWindow = null

    // 5. state → disconnected
    //    (2026-08-10) 기기 축은 'disconnected' 가 아니라 'unknown' 으로 되돌린다 — 팝업이
    //    닫히면 기기 상태를 **관측할 수 없게** 되는 것이지 기기가 빠진 게 아니다. 여기서
    //    'disconnected' 로 적으면 dApp 에 거짓 단정이 나간다(MessageTransport.ts DeviceState 참조).
    //    두 축을 한 번에 넘겨 발행도 1회로 묶는다(applyState 의 쌍 dedupe).
    this.applyState({ popup: 'disconnected', device: 'unknown', deviceInfo: undefined })

    // 6. (크로스 리뷰 C1로 제거됨, m09-04-27) state/signProgressHandlers는 **여기서 비우지 않는다**.
    //    close()는 두 가지 경로에서 호출된다: (a) 인스턴스를 통째로 버리는 resetSingleton() 경로
    //    (b) 같은 인스턴스에서 재오픈을 전제로 한 내부 self-close(팝업 X로 닫기/handshake timeout/
    //    version mismatch 등, :442,477,495,511,556). singleton.ts의 리스너 재등록 루프
    //    (`ensureSingleton`)는 `_transport === null`일 때만 도는데, (b) 경로는 `_transport`를
    //    null로 만들지 않으므로 여기서 Set을 비우면 재등록 기회 없이 리스너가 영구히 사라진다.
    //    Set은 인스턴스 스코프 상태이므로 인스턴스가 실제로 버려지는 (a) 시점에 GC로 자연 소멸한다.

    // 7. handshake state 리셋 — 재오픈 시 새 handshake (m02-02)
    this.handshakePromise = null

    // 8. m07-02 ready state 리셋 — readyTimer cleanup + 재오픈 시 새 _ready 사이클
    if (this.readyTimer) {
      clearTimeout(this.readyTimer)
      this.readyTimer = null
    }
    this.readyPromise = null
    this.resolveReady = null
  }

  /**
   * default timeout override (v1 dcent.setTimeOutMs 호환).
   * boundary-validation: ms는 양의 유한 number만 허용.
   */
  setTimeoutMs (ms: number): void {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
      throw new ProviderError(
        ErrorCode.INVALID_PARAMS,
        `setTimeoutMs: ms must be a positive finite number, got ${String(ms)}`,
      )
    }
    this.timeoutMs = ms
  }

  // === 내부 헬퍼 ===

  private ensurePopup (reject: (e: ProviderError) => void): void {
    // 이미 열린 popup 재사용
    if (this.popupWindow && !this.popupWindow.closed) return
    this.popupWindow = window.open(this.popUpUrl, '_blank')
    if (!this.popupWindow) {
      reject(
        new ProviderError(
          ErrorCode.UNAUTHORIZED,
          'window.open returned null — popup blocked by browser?',
        ),
      )
      return
    }
    // 🔴 **팝업이 새로 열리면 기기 축도 함께 되돌린다** (2026-08-11, PR #177 리뷰 P2).
    //
    // 팝업 축만 갱신하면, 사용자가 팝업을 직접 닫고 **500ms 폴링이 돌기 전에** dApp 이
    // `send()` 를 부른 경우 `close()` 를 거치지 않고 여기서 새 팝업이 열린다. 그러면 이전
    // 팝업의 `device:'connected'` + 옛 `deviceId` 가 그대로 이어지고, 폴링은 이후 살아있는
    // 새 팝업을 보므로 다시 발동하지 않는다. 게다가 `currentState` 가 이미 'connected' 라
    // 쌍 dedupe 에 걸려 **리스너가 한 번도 불리지 않는다** — dApp 은 팝업이 바뀐 사실도,
    // 기기 축이 미상이 된 사실도 알 수 없다.
    //
    // 'unknown' 인 이유는 `close()` 와 같다 — 새 팝업은 아직 기기를 **관측하지 못한** 것이지
    // 기기가 빠진 게 아니다. 'disconnected' 로 적으면 dApp 에 거짓 단정이 나간다.
    // 새 팝업이 handshake 후 `_deviceState` 를 보내면 그때 실제 값으로 채워진다.
    //
    // 첫 오픈(이전 팝업 없음)에서는 device 가 이미 'unknown' 이라 이 항은 no-op 이고,
    // 팝업 축 전환(disconnected → connected)만 1회 발행된다 — 종전과 동일하다.
    this.applyState({ popup: 'connected', device: 'unknown', deviceInfo: undefined })
  }

  private ensureMessageListener (): void {
    if (this.messageListener) return
    this.messageListener = (event: MessageEvent) => {
      // boundary-validation: origin 검증
      if (event.origin !== this.origin) return

      const data = event.data
      // boundary-validation: array는 typeof 'object'를 통과하므로 명시적으로 배제
      if (!data || typeof data !== 'object' || Array.isArray(data)) return

      // m07-02: _ready envelope 분기 (id/method가 부재한 신호 메시지)
      if ((data as { type?: unknown }).type === '_ready') {
        const ready = data as Partial<ReadySignal>
        // boundary-validation: version / serverName 존재 + string 검증
        if (typeof ready.version !== 'string' || typeof ready.serverName !== 'string') return
        if (this.resolveReady) {
          const r = this.resolveReady
          this.resolveReady = null // 재호출 방지
          r()
        }
        return
      }

      // (2026-08-10) `_deviceState` 기기 축 신호 분기.
      //
      // `_signProgress` 와 달리 **`id` 가 없다** — 특정 요청에 딸린 중간 알림이 아니라 요청과
      // 무관한 lifecycle 신호이기 때문이다. 그 덕에 아래 id-매칭 응답 분기에 애초에 걸리지 않아,
      // 이 타입을 모르는 구버전 connector 도 "id 없는 메시지"로 보고 그냥 흘린다(조기 resolve 로
      // 실제 응답을 드롭하는 `_signProgress` 계열 하위호환 위험이 여기엔 없다).
      if ((data as { type?: unknown }).type === '_deviceState') {
        // 🔴 **현재 팝업이 보낸 것인지 확인한다** (origin 만으로는 부족).
        //
        // 이 리스너의 세 신호 중 `_deviceState` 만 **지속 상태를 남긴다** — `_ready` 는 1회
        // resolve 로 끝나고 `_signProgress` 는 그대로 전달만 하는데, 이 신호는
        // `currentDeviceState` / `currentDeviceInfo` 를 갱신해 **이후 모든 state 발행**에
        // 반영된다. 게다가 응답 분기와 달리 맞춰야 할 요청 `id` 도 없다. 그래서 같은 origin 의
        // 다른 창(이전 lifecycle 에서 남은 팝업, dApp 이 같은 origin 으로 연 다른 창)이
        // 기기 축을 뒤집고 `deviceId` 를 심을 수 있다.
        //
        // `_ready` / `_signProgress` 에는 아직 걸지 않았다 — `_ready` 는 handshake 타이밍상
        // `this.popupWindow` 대입 시점과의 선후를 함께 검증해야 하고(잘못 걸면 handshake 가
        // 영구 hang), 그 둘은 지속 상태를 남기지 않아 위험도가 다르다. 별도 판단 사항.
        if (event.source !== this.popupWindow) return

        const device = (data as { device?: unknown }).device
        // boundary-validation: 알려진 값만 수용 — 모르는 문자열로 축을 오염시키지 않는다.
        if (device !== 'connected' && device !== 'disconnected') return

        let info: DeviceBriefInfo | undefined
        if (device === 'connected') {
          const raw = (data as { info?: unknown }).info
          if (typeof raw === 'object' && raw !== null) {
            const r = raw as Record<string, unknown>
            // dapp-input-sanitization: known-fields whitelist 로만 추출한다. bridge 가 보낸
            // 객체를 그대로 spread 하면 프로토타입 오염/미지 필드가 dApp 까지 그대로 흘러간다.
            const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined)
            // 필드 이름은 `getDeviceInfo()` 응답과 동일하다(MessageTransport.ts DeviceBriefInfo 참조).
            const connectType = r.connectType === 'usb' || r.connectType === 'ble' ? r.connectType : undefined
            const coinCount = typeof r.coinCount === 'number' && Number.isInteger(r.coinCount) && r.coinCount >= 0
              ? r.coinCount
              : undefined
            // mutation-isolation: 방출 전에 freeze (SignProgressInfo 와 동일 원칙).
            info = Object.freeze({
              deviceId: str(r.deviceId),
              label: str(r.label),
              version: str(r.version),
              deviceModel: str(r.deviceModel),
              connectType,
              coinCount,
            })
          }
        }
        this.setDeviceState(device, info)
        return // 최종 응답이 아니므로 pending 삭제/resolve 하지 않는다
      }

      // (m09-04-27) `_signProgress` 중간 신호 분기 — 반드시 id-매칭 응답 분기보다 **먼저** 걸려야
      // 진행률 신호가 최종 응답으로 오해석되지 않는다(RECV-05 회귀 가드).
      if ((data as { type?: unknown }).type === '_signProgress') {
        const id = (data as { id?: unknown }).id
        if (typeof id !== 'string') return
        // boundary-validation: `_handshake_*`는 내부 기계 요청 id — dApp progress 콜백에 노출 금지
        if (id.startsWith('_handshake_')) return
        // boundary-validation: 이미 resolve/timeout된 요청의 stale progress는 무시
        if (!this.pending.has(id)) return
        const step = (data as { step?: unknown }).step
        const total = (data as { total?: unknown }).total
        // boundary-validation: typeof만으로는 NaN/Infinity/0/음수/소수/step>total을 통과시킨다.
        // step/total은 "1부터 시작하는 진행 순번/총 횟수" 계약이므로 typeof + 정수 + 범위까지 검증한다.
        if (
          typeof step !== 'number' ||
          typeof total !== 'number' ||
          !Number.isInteger(step) ||
          !Number.isInteger(total) ||
          step < 1 ||
          total < 1 ||
          step > total
        )
          return
        const roleRaw = (data as { role?: unknown }).role
        const role = typeof roleRaw === 'string' ? roleRaw : undefined
        // mutation-isolation: 여러 리스너가 같은 info를 공유하므로 in-place 수정으로부터 격리
        const info: SignProgressInfo = Object.freeze({ requestId: id, step, total, role })
        for (const h of this.signProgressHandlers) {
          try {
            h(info)
          } catch {
            // 리스너 에러가 메시지 루프를 죽이지 않도록 격리 (setState의 handler notify와 동일 원칙)
          }
        }
        return // 최종 응답이 아니므로 pending 삭제/resolve 하지 않는다
      }

      // boundary-validation: ResponseEnvelope shape 검증
      if (typeof (data as { id?: unknown }).id !== 'string') return

      const pending = this.pending.get((data as { id: string }).id)
      if (!pending) return // 모르는 id (이미 timeout 처리되었을 수 있음)

      clearTimeout(pending.timer)
      this.pending.delete((data as { id: string }).id)
      pending.resolve(data as ResponseEnvelope<unknown>)
    }
    window.addEventListener('message', this.messageListener, false)
  }

  /**
   * m07-02 B Gate: sdk(m07-01)가 송신하는 `_ready` 신호 대기.
   * 첫 호출만 timer + listener 등록, 이후 호출은 동일 Promise 공유 (race 방지).
   * `readyTimeoutMs` 만료 시 silent resolve → `_handshake` 즉시 송신 (Y Timeout fallback, 구 sdk 호환).
   * close() 시 `readyPromise = null` 리셋 → 재오픈 시 새 ready 사이클.
   */
  private ensureReady (): Promise<void> {
    if (this.readyPromise) return this.readyPromise
    this.readyPromise = new Promise<void>((resolve) => {
      // _ready 수신 시 messageListener에서 resolveReady() 호출
      this.resolveReady = () => {
        if (this.readyTimer) {
          clearTimeout(this.readyTimer)
          this.readyTimer = null
        }
        resolve()
      }
      // Y Timeout fallback — readyTimeoutMs 만료 시 silent resolve. 이후 _handshake 자체가
      // handshakeTimeoutMs로 보호되므로 추가 에러 처리 불필요 (error-handling-consistency:
      // ready signal 자체는 자산과 무관하므로 silent fallback이 정책상 정당).
      this.readyTimer = setTimeout(() => {
        this.readyTimer = null
        this.resolveReady = null
        resolve()
      }, this.readyTimeoutMs)
    })
    return this.readyPromise
  }

  private ensureClosePolling (): void {
    if (this.closePollingInterval) return
    this.closePollingInterval = setInterval(() => {
      if (!this.popupWindow || this.popupWindow.closed) {
        // popup이 닫혔음 — close()는 reject 던지지 않게 설계되었지만,
        // 방어적 catch (async-hygiene 룰 — 의도적 fire-and-forget)
        this.close().catch(() => {
          /* close()는 reject 안 함, 방어적 noop */
        })
      }
    }, 500) // 500ms — v1과 동일 빈도
  }

  /**
   * In-flight handshake Promise 공유. 첫 호출만 sendHandshake 발동,
   * 이후 호출은 동일 Promise 반환 (race 방지). close() 시 null 리셋.
   */
  private ensureHandshake (): Promise<void> {
    if (this.handshakePromise) return this.handshakePromise
    this.handshakePromise = this.sendHandshake()
    return this.handshakePromise
  }

  /**
   * `_handshake` 메시지 송신 + sdk ack 대기 + version major 비교.
   * 실패 시 close() + reject (caller가 send를 재호출하면 새 handshake 시도).
   */
  private sendHandshake (): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const handshakeId = `_handshake_${Date.now()}_${Math.random().toString(36).slice(2)}`

      const timer = setTimeout(() => {
        this.pending.delete(handshakeId)
        const err = new ProviderError(
          ErrorCode.TIMEOUT,
          `Handshake timed out after ${this.handshakeTimeoutMs}ms`,
        )
        // m07-02: handshake error는 send의 .then(_, errHandler)가 받아 reject되어야 함.
        // close()가 preHandshakeRejecters로 DISCONNECTED를 먼저 던지면 actual error가 가려짐.
        // → close() 전에 preHandshakeRejecters를 비워서 handshake error가 송출되도록 함.
        this.preHandshakeRejecters.clear()
        this.close().catch(() => {
          /* defensive noop */
        })
        reject(err)
      }, this.handshakeTimeoutMs)

      this.pending.set(handshakeId, {
        resolve: (response) => {
          // sdk가 error 응답을 보냈는지 검사
          const errResp = (response as ResponseEnvelope<unknown>).error
          if (errResp) {
            const err = new ProviderError(
              errResp.code ?? ErrorCode.INTERNAL_ERROR,
              `Handshake rejected by sdk: ${errResp.message ?? 'unknown'}`,
              errResp.data,
            )
            // m07-02: handshake error 우선 — close()의 DISCONNECTED가 가리지 않도록 사전 비움
            this.preHandshakeRejecters.clear()
            this.close().catch(() => {
              /* defensive noop */
            })
            reject(err)
            return
          }

          // version major 비교
          const result = (response as ResponseEnvelope<{ version?: unknown }>).result
          const remoteVersion = result && typeof result === 'object' ? result.version : undefined
          if (!this.isVersionCompatible(remoteVersion)) {
            const err = new ProviderError(
              ErrorCode.PROTOCOL_VERSION_MISMATCH,
              `Protocol version mismatch: connector=${this.protocolVersion}, sdk=${typeof remoteVersion === 'string' ? remoteVersion : String(remoteVersion)}`,
            )
            this.preHandshakeRejecters.clear()
            this.close().catch(() => {
              /* defensive noop */
            })
            reject(err)
            return
          }
          resolve()
        },
        reject: (err) => {
          // 외부(close())에서 호출됨 — close()가 이미 cleanup 중이므로 재호출하지 않음 (recursion 방지).
          // 자체 실패 경로(timeout/version mismatch/error response/postMessage throw)는
          // pending.set 외부에서 close() + reject 직접 호출하므로 이 경로는 close()에서만 사용.
          reject(err)
        },
        timer,
      })

      // (m09-04-03 / DC-2701) pendingTransport를 toWireTransport로 변환하여 동봉 (3-state).
      // (DC-2701) 'auto' 제거 — 미지정(undefined)은 default로 sdk에 그대로 전달한다. sdk가
      // 'hid'(USB only + auto) / 'ble'(BLE only, no auto) / undefined(둘 다 + auto)로 분기.
      const handshakeParams: {
        version: string
        clientName: string
        transport?: 'hid' | 'ble'
      } = {
        version: this.protocolVersion,
        clientName: 'connector',
        transport: toWireTransport(this.pendingTransport),
      }
      const handshakeMessage: MessageEnvelope<typeof handshakeParams> = {
        id: handshakeId,
        method: '_handshake',
        params: handshakeParams,
      }

      try {
        this.popupWindow!.postMessage(handshakeMessage, this.origin)
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(handshakeId)
        const wrappedErr = new ProviderError(
          ErrorCode.INTERNAL_ERROR,
          `Handshake postMessage failed: ${(err as Error).message}`,
        )
        this.preHandshakeRejecters.clear()
        this.close().catch(() => {
          /* defensive noop */
        })
        reject(wrappedErr)
      }
    })
  }

  /**
   * Semver major version 호환성 비교. connector 'X.y.z' vs sdk 'X.a.b' → major 같으면 OK.
   * boundary-validation: typeof 'string' + split('.')[0] 길이 > 0 체크.
   */
  private isVersionCompatible (remoteVersion: unknown): boolean {
    if (typeof remoteVersion !== 'string') return false
    const localMajor = this.protocolVersion.split('.')[0]
    const remoteMajor = remoteVersion.split('.')[0]
    return localMajor.length > 0 && remoteMajor.length > 0 && localMajor === remoteMajor
  }

  // (2026-08-11) `setState(popup)` 헬퍼 제거 — 유일한 호출자였던 `ensurePopup` 이 두 축을
  // 함께 넘기도록 바뀌면서 죽은 코드가 됐다(PR #177 리뷰 P2). 팝업 축 **단독** 갱신 경로를
  // 남겨두면 같은 결함(한 축만 고쳐 다른 축이 stale)이 재도입되기 쉬우므로 헬퍼 자체를 없앤다.
  // 축 갱신은 이제 `applyState`(둘 다 명시) 또는 `setDeviceState`(기기 축 전용) 둘 뿐이다.

  /**
   * (2026-08-10) 기기 축 갱신 — bridge 의 `_deviceState` push 가 호출한다.
   *
   * `info` 는 `device === 'connected'` 일 때만 유지한다. disconnected/unknown 으로 가면서
   * 직전 기기 정보를 남겨두면 "빠진 기기의 정보"가 화면에 계속 붙어 있게 된다.
   */
  private setDeviceState (device: DeviceState, info?: DeviceBriefInfo): void {
    this.applyState({ device, deviceInfo: device === 'connected' ? info : undefined })
  }

  /**
   * 두 축을 한 곳에서 갱신하고, **둘 중 하나라도 바뀐 경우에만** 발행한다.
   *
   * 🔴 dedupe 를 팝업 축 단독이 아니라 **쌍(popup, device)** 으로 하는 것이 이 함수의 핵심이다.
   * 예전에는 `if (this.currentState === state) return` 이라 팝업 축만 비교했고, 그래서 팝업이
   * 열린 채로 기기가 빠져도 아무 신호가 안 나갔다(사용자 제보: "connected 하나만 찍히고 그 뒤로
   * 조용하다"). 기기 축을 추가하면서 이 비교도 함께 넓히지 않으면 새 축이 영원히 안 보인다.
   *
   * `deviceInfo` 의 **표시 필드**(label / version / deviceModel / coinCount 등)는 비교에서
   * 제외한다 — 상태가 같은데 정보 필드만 미세하게 다른 재통지로 리스너를 깨우지 않기 위해서다
   * (기기가 붙어 있는 동안 bridge 가 같은 상태를 재전송할 수 있다).
   *
   * 🔴 단 **`deviceId` 는 비교에 넣는다.** 그건 표시값이 아니라 **기기를 특정하는 식별자**라,
   * 제외하면 `connected → connected` 로 **기기가 바뀌어도** `currentDeviceInfo` 만 조용히
   * 갱신되고 dApp 은 옛 기기 정보에 고정된다 — 라벨 없는 기기를 구별하려고 `deviceId` 를 실은
   * 목적이 그 경로에서 사라진다. 실제 경로: bridge 가 `getDeviceInfo` 실패로 **info 없이**
   * connected 를 보낸 뒤(자동 재연결 resolver — bridge `main.tsx` 의 `catch` 후 dispatch),
   * 기기가 준비돼 실값이 담긴 connected 가 다시 와도 device 축이 같아 **빈 정보에 고정**된다.
   */
  private applyState (next: { popup?: TransportState, device?: DeviceState, deviceInfo?: DeviceBriefInfo }): void {
    const popup = next.popup ?? this.currentState
    const device = next.device ?? this.currentDeviceState
    // `changed` 를 필드 대입보다 **먼저** 계산한다 — 이 시점의 this.currentDeviceInfo 는 직전 값이다.
    const nextInfo = 'deviceInfo' in next ? next.deviceInfo : this.currentDeviceInfo
    const changed = popup !== this.currentState ||
      device !== this.currentDeviceState ||
      (device === 'connected' && nextInfo?.deviceId !== this.currentDeviceInfo?.deviceId)
    this.currentState = popup
    this.currentDeviceState = device
    if ('deviceInfo' in next) this.currentDeviceInfo = next.deviceInfo
    if (!changed) return

    // mutation-isolation: 방출 객체를 freeze — dApp 이 in-place 로 고쳐도 내부 상태가 오염되지
    // 않는다(`SignProgressInfo` 와 동일 원칙). deviceInfo 는 수신 시점에 이미 freeze 돼 있다.
    const detail: ConnectionStateDetail = Object.freeze({
      popup,
      device,
      deviceInfo: this.currentDeviceInfo,
    })
    for (const handler of this.stateHandlers) {
      try {
        // 1번째 인자는 v1 호환(팝업 축) — 의미를 바꾸지 않는다. 두 축은 2번째 인자로 전달.
        handler(popup, detail)
      } catch {
        // 사용자 핸들러 에러는 silently swallow (transport 내부에 영향 없음)
      }
    }
  }
}
