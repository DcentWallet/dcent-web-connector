import {
  MessageTransport,
  MessageEnvelope,
  ResponseEnvelope,
  TransportState,
} from './MessageTransport'
import { ProviderError } from '../error/ProviderError'
import { ErrorCode } from '../error/ErrorCode'

/**
 * PopupTransport 옵션
 * 모든 필드 optional — 기본값은 v1과 동일
 */
export interface PopupTransportOptions {
  /** popup으로 열 sdk URL. 기본 'https://bridge.dcentwallet.com/v2' */
  popUpUrl?: string
  /** 응답 대기 timeout (ms). 기본 60000 (60s, v1 동일) */
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
  private timeoutMs: number

  private popupWindow: Window | null = null
  private pending: Map<string, PendingRequest> = new Map()
  private stateHandlers: Set<(state: TransportState) => void> = new Set()
  private messageListener: ((event: MessageEvent) => void) | null = null
  private closePollingInterval: ReturnType<typeof setInterval> | null = null
  private currentState: TransportState = 'disconnected'
  private handshakePromise: Promise<void> | null = null
  // m07-02: _ready 게이트 (B Gate) 상태
  private readyPromise: Promise<void> | null = null
  private readyTimer: ReturnType<typeof setTimeout> | null = null
  private resolveReady: (() => void) | null = null
  // m07-02: pre-handshake 단계(ensureReady → ensureHandshake chain) 도중인 send의 reject 콜백.
  // close() 시 이들을 DISCONNECTED로 reject하여 게이트에서 정지된 send도 즉시 종료.
  private preHandshakeRejecters: Set<(error: ProviderError) => void> = new Set()

  constructor (options: PopupTransportOptions = {}) {
    this.popUpUrl = options.popUpUrl ?? 'https://bridge.dcentwallet.com/v2'
    this.timeoutMs = options.timeoutMs ?? 60000
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

  on (event: 'state', handler: (state: TransportState) => void): void {
    if (event !== 'state') return
    this.stateHandlers.add(handler)
  }

  off (event: 'state', handler: (state: TransportState) => void): void {
    if (event !== 'state') return
    this.stateHandlers.delete(handler)
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
    this.setState('disconnected')

    // 6. handlers 정리
    this.stateHandlers.clear()

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
    this.setState('connected')
  }

  private ensureMessageListener (): void {
    if (this.messageListener) return
    this.messageListener = (event: MessageEvent) => {
      // boundary-validation: origin 검증
      if (event.origin !== this.origin) return

      const data = event.data
      if (!data || typeof data !== 'object') return

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
      // m02-02의 timeoutMs로 보호되므로 추가 에러 처리 불필요 (error-handling-consistency:
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
          `Handshake timed out after ${this.timeoutMs}ms`,
        )
        // m07-02: handshake error는 send의 .then(_, errHandler)가 받아 reject되어야 함.
        // close()가 preHandshakeRejecters로 DISCONNECTED를 먼저 던지면 actual error가 가려짐.
        // → close() 전에 preHandshakeRejecters를 비워서 handshake error가 송출되도록 함.
        this.preHandshakeRejecters.clear()
        this.close().catch(() => {
          /* defensive noop */
        })
        reject(err)
      }, this.timeoutMs)

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

      const handshakeMessage: MessageEnvelope<{ version: string; clientName: string }> = {
        id: handshakeId,
        method: '_handshake',
        params: { version: this.protocolVersion, clientName: 'connector' },
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

  private setState (state: TransportState): void {
    if (this.currentState === state) return
    this.currentState = state
    for (const handler of this.stateHandlers) {
      try {
        handler(state)
      } catch {
        // 사용자 핸들러 에러는 silently swallow (transport 내부에 영향 없음)
      }
    }
  }
}
