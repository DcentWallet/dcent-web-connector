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
}

interface PendingRequest {
  resolve: (response: ResponseEnvelope<unknown>) => void
  reject: (error: ProviderError) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * PopupTransport — MessageTransport 실제 구현 (m02-01)
 *
 * window.open으로 sdk popup을 열고 postMessage로 MessageEnvelope를 송신,
 * 응답을 id 기반으로 매칭하여 resolve. timeout / popup close / cleanup 모두 처리.
 *
 * 책임 분리:
 *   - id 생성: caller 책임 (PopupTransport는 매칭만 수행)
 *   - handshake: 비스코프 (m02-02에서 별도)
 *   - sdk 짝맞춤 ack: 비스코프 (m02-03에서 별도)
 *
 * 룰 준수:
 *   - error-handling-consistency: 실패 경로 모두 ProviderError throw/reject
 *   - async-hygiene: clearTimeout/clearInterval/removeEventListener 모두 cleanup
 *   - boundary-validation: postMessage origin + envelope shape + setTimeoutMs 인자
 */
export class PopupTransport implements MessageTransport {
  private readonly popUpUrl: string
  private readonly origin: string
  private timeoutMs: number

  private popupWindow: Window | null = null
  private pending: Map<string, PendingRequest> = new Map()
  private stateHandlers: Set<(state: TransportState) => void> = new Set()
  private messageListener: ((event: MessageEvent) => void) | null = null
  private closePollingInterval: ReturnType<typeof setInterval> | null = null
  private currentState: TransportState = 'disconnected'

  constructor(options: PopupTransportOptions = {}) {
    this.popUpUrl = options.popUpUrl ?? 'https://bridge.dcentwallet.com/v2'
    this.timeoutMs = options.timeoutMs ?? 60000
    this.origin = options.origin ?? new URL(this.popUpUrl).origin
  }

  send<TParams, TResult>(
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

      // 4. timeout 설정
      const timer = setTimeout(() => {
        this.pending.delete(message.id)
        reject(
          new ProviderError(
            ErrorCode.TIMEOUT,
            `Request timed out after ${this.timeoutMs}ms (id=${message.id})`,
          ),
        )
      }, this.timeoutMs)

      // 5. pending 등록
      this.pending.set(message.id, {
        resolve: resolve as (r: ResponseEnvelope<unknown>) => void,
        reject,
        timer,
      })

      // 6. postMessage 송신 (실패 시 cleanup + reject)
      try {
        this.popupWindow.postMessage(message, this.origin)
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
    })
  }

  on(event: 'state', handler: (state: TransportState) => void): void {
    if (event !== 'state') return
    this.stateHandlers.add(handler)
  }

  off(event: 'state', handler: (state: TransportState) => void): void {
    if (event !== 'state') return
    this.stateHandlers.delete(handler)
  }

  async close(): Promise<void> {
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
  }

  /**
   * default timeout override (v1 dcent.setTimeOutMs 호환).
   * boundary-validation: ms는 양의 유한 number만 허용.
   */
  setTimeoutMs(ms: number): void {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
      throw new ProviderError(
        ErrorCode.INVALID_PARAMS,
        `setTimeoutMs: ms must be a positive finite number, got ${String(ms)}`,
      )
    }
    this.timeoutMs = ms
  }

  // === 내부 헬퍼 ===

  private ensurePopup(reject: (e: ProviderError) => void): void {
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

  private ensureMessageListener(): void {
    if (this.messageListener) return
    this.messageListener = (event: MessageEvent) => {
      // boundary-validation: origin 검증
      if (event.origin !== this.origin) return

      const data = event.data
      // boundary-validation: envelope shape 검증
      if (!data || typeof data !== 'object' || typeof data.id !== 'string') return

      const pending = this.pending.get(data.id)
      if (!pending) return // 모르는 id (이미 timeout 처리되었을 수 있음)

      clearTimeout(pending.timer)
      this.pending.delete(data.id)
      pending.resolve(data as ResponseEnvelope<unknown>)
    }
    window.addEventListener('message', this.messageListener, false)
  }

  private ensureClosePolling(): void {
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

  private setState(state: TransportState): void {
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
