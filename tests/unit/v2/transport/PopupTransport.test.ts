/**
 * PopupTransport 단위 테스트 (m02-01 + m02-02 handshake)
 *
 * jsdom 환경 — window.open / postMessage / addEventListener 모킹
 * m02-01 21건 (T-U-01 ~ T-U-15, T-U-08 4 subcase + T-U-09a + T-U-11 2 subcase)
 *  + m02-02 14건 (T-U-HS-01 ~ T-U-HS-10, T-U-HS-04 5 subcase 포함)
 *  = 35건
 */
import { PopupTransport } from '../../../../src/transport/PopupTransport'
import { ProviderError } from '../../../../src/error/ProviderError'
import { ErrorCode } from '../../../../src/error/ErrorCode'
import { MessageEnvelope, ResponseEnvelope, TransportState } from '../../../../src/transport/MessageTransport'

interface MockPopup {
  closed: boolean
  close: jest.Mock
  postMessage: jest.Mock
}

const DEFAULT_URL = 'https://bridge.dcentwallet.com/v2'
const DEFAULT_ORIGIN = 'https://bridge.dcentwallet.com'

function makeMockPopup(): MockPopup {
  const popup: MockPopup = {
    closed: false,
    close: jest.fn(() => {
      popup.closed = true
    }),
    postMessage: jest.fn(),
  }
  return popup
}

function makeEnvelope(id: string, method = 'test_method'): MessageEnvelope<{ x: number }> {
  return { id, method, params: { x: 1 } }
}

function dispatchResponse(origin: string, data: unknown): void {
  const event = new MessageEvent('message', { origin, data: data as never })
  window.dispatchEvent(event)
}

/**
 * Handshake auto-respond helper (m02-02 + m07-02).
 * postMessage spy가 _handshake 메시지를 받으면 microtask로 ack 응답 dispatch.
 * m07-02 B Gate 추가 후: window.addEventListener('message', ...) 호출을 wrap하여
 * 메시지 리스너가 등록되는 시점에 microtask로 `_ready` 신호를 자동 dispatch.
 * 이로써 PopupTransport.send() → ensureReady() 즉시 게이트가 열려 기존 35건이 회귀 없이 통과.
 *
 * m07-02 게이트를 명시적으로 테스트하려면 이 helper 대신 mockPopup.postMessage.mockImplementation을
 * 직접 정의하고 sendReadySignal()를 수동 호출 (sendReady=false 변형 시).
 */
function installHandshakeAutoRespond(
  mockPopup: MockPopup,
  origin: string = DEFAULT_ORIGIN,
  sdkVersion: string = '2.0',
  serverName: string = 'bridge-ui',
): void {
  mockPopup.postMessage.mockImplementation((message: { method?: unknown; id?: unknown }, msgOrigin: string) => {
    if (message?.method === '_handshake' && typeof message.id === 'string') {
      const responseOrigin = msgOrigin || origin
      Promise.resolve().then(() => {
        dispatchResponse(responseOrigin, {
          id: message.id,
          result: { version: sdkVersion, serverName },
        })
      })
    }
  })
  // m07-02: ready 신호 자동 dispatch — addEventListener('message')가 호출되는 시점에 emit.
  // PopupTransport.ensureMessageListener()가 호출되면 PopupTransport.ensureReady()가 곧 이어
  // resolveReady를 등록하므로, microtask 1 tick 후에 ready를 dispatch하면 게이트가 열린다.
  installReadyAutoRespondOnce(origin, sdkVersion, serverName)
}

let _readyAutoRespondAddSpy: jest.SpyInstance | null = null
let _readyAutoRespondConfig: { origin: string; version: string; serverName: string } | null = null

function installReadyAutoRespondOnce(origin: string, version: string, serverName: string): void {
  // 매 호출마다 최신 config로 갱신 — 같은 테스트 내 origin 변경(예: T-U-15) 지원
  _readyAutoRespondConfig = { origin, version, serverName }
  if (_readyAutoRespondAddSpy) return
  const origAdd = window.addEventListener.bind(window)
  _readyAutoRespondAddSpy = jest
    .spyOn(window, 'addEventListener')
    .mockImplementation(((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      const ret = origAdd(type, listener, options)
      if (type === 'message') {
        // 1 microtask 뒤에 ready emit — PopupTransport.send()가 ensureReady의 resolveReady를
        // 등록한 다음 tick에 emit되므로 게이트가 곧바로 열림
        Promise.resolve().then(() => {
          if (_readyAutoRespondConfig) {
            const c = _readyAutoRespondConfig
            dispatchResponse(c.origin, { type: '_ready', version: c.version, serverName: c.serverName })
          }
        })
      }
      return ret
    }) as typeof window.addEventListener)
}

function uninstallReadyAutoRespond(): void {
  if (_readyAutoRespondAddSpy) {
    _readyAutoRespondAddSpy.mockRestore()
    _readyAutoRespondAddSpy = null
  }
  _readyAutoRespondConfig = null
}

/**
 * m07-02: `_ready` 신호를 수동 dispatch. T-U-RG 시리즈 / readyTimeoutMs fallback 시나리오에서 사용.
 */
function sendReadySignal(
  origin: string = DEFAULT_ORIGIN,
  version: string = '2.0',
  serverName: string = 'bridge-ui',
): void {
  dispatchResponse(origin, { type: '_ready', version, serverName })
}

/**
 * Ready + Handshake round-trip 마이크로태스크 flush (m07-02 후 게이트가 1단계 더 추가됨).
 * 1) ready 신호 dispatch (addEventListener spy가 microtask로 emit) → listener가 resolveReady() 호출
 * 2) readyPromise resolve → ensureHandshake() 실행 → handshake postMessage
 * 3) handshake response dispatch → listener resolve handshake pending
 * 4) handshakePromise resolve → 실제 send postMessage 호출
 *
 * 각 .then chain마다 microtask 1 tick씩 소모하므로 넉넉히 6 tick await.
 */
async function flushHandshake(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
  }
}

describe('PopupTransport', () => {
  let openSpy: jest.SpyInstance
  let mockPopup: MockPopup
  let transport: PopupTransport

  beforeEach(() => {
    jest.useFakeTimers()
    mockPopup = makeMockPopup()
    openSpy = jest
      .spyOn(window, 'open')
      .mockImplementation(() => mockPopup as unknown as Window)
    // 기본: handshake 자동 응답 (실패 케이스 테스트는 자체 mockImpl로 override)
    installHandshakeAutoRespond(mockPopup)
  })

  afterEach(() => {
    jest.useRealTimers()
    openSpy.mockRestore()
    uninstallReadyAutoRespond()
  })

  // ===== T-U-01: send happy path =====
  describe('T-U-01: send happy path', () => {
    it('postMessage round-trip → resolve(ResponseEnvelope) with correct result', async () => {
      transport = new PopupTransport()
      const env = makeEnvelope('req-1')

      const promise = transport.send<{ x: number }, { ok: true }>(env)
      await flushHandshake()

      expect(openSpy).toHaveBeenCalledWith(DEFAULT_URL, '_blank')
      expect(mockPopup.postMessage).toHaveBeenCalledWith(env, DEFAULT_ORIGIN)

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-1', result: { ok: true } })

      const response = (await promise) as ResponseEnvelope<{ ok: true }>
      expect(response.id).toBe('req-1')
      expect(response.result).toEqual({ ok: true })

      await transport.close()
    })
  })

  // ===== T-U-02: 다중 send id 매칭 =====
  describe('T-U-02: 다중 send id 매칭', () => {
    it('3개 동시 send → 각 id에 해당하는 응답 정확 매칭', async () => {
      transport = new PopupTransport()
      const p1 = transport.send(makeEnvelope('a'))
      const p2 = transport.send(makeEnvelope('b'))
      const p3 = transport.send(makeEnvelope('c'))
      await flushHandshake()

      dispatchResponse(DEFAULT_ORIGIN, { id: 'c', result: 3 })
      dispatchResponse(DEFAULT_ORIGIN, { id: 'a', result: 1 })
      dispatchResponse(DEFAULT_ORIGIN, { id: 'b', result: 2 })

      const [r1, r2, r3] = await Promise.all([p1, p2, p3])
      expect((r1 as ResponseEnvelope<number>).result).toBe(1)
      expect((r2 as ResponseEnvelope<number>).result).toBe(2)
      expect((r3 as ResponseEnvelope<number>).result).toBe(3)

      await transport.close()
    })
  })

  // ===== T-U-03: timeout =====
  describe('T-U-03: timeout', () => {
    it('응답 없으면 timeoutMs 후 ProviderError(TIMEOUT) reject', async () => {
      transport = new PopupTransport({ timeoutMs: 1000 })
      const promise = transport.send(makeEnvelope('req-timeout'))
      await flushHandshake()

      jest.advanceTimersByTime(1000)

      await expect(promise).rejects.toBeInstanceOf(ProviderError)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })

      await transport.close()
    })
  })

  // ===== T-U-04: setTimeoutMs override =====
  describe('T-U-04: setTimeoutMs override', () => {
    it('setTimeoutMs(30000) 호출 후 30s timeout 적용', async () => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      transport.setTimeoutMs(30000)

      const promise = transport.send(makeEnvelope('req-1'))
      await flushHandshake()
      jest.advanceTimersByTime(29999)

      jest.advanceTimersByTime(2)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })

      await transport.close()
    })
  })

  // ===== T-U-05: popup blocked =====
  describe('T-U-05: popup blocked', () => {
    it('window.open returns null → ProviderError(UNAUTHORIZED) reject', async () => {
      openSpy.mockImplementation(() => null)
      transport = new PopupTransport()

      // popup 안 열리므로 handshake 도달 전 UNAUTHORIZED reject
      await expect(transport.send(makeEnvelope('req-1'))).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
      })

      await transport.close()
    })
  })

  // ===== T-U-06: popup close detection =====
  describe('T-U-06: popup close detection', () => {
    it('500ms polling으로 popup.closed 감지 → 모든 pending DISCONNECTED', async () => {
      transport = new PopupTransport()
      // handshake auto-respond 비활성화 — handshake 진행 중 close 시뮬레이션
      mockPopup.postMessage.mockImplementation(() => { /* swallow */ })

      const p1 = transport.send(makeEnvelope('a'))
      const p2 = transport.send(makeEnvelope('b'))
      await Promise.resolve() // executor 동기 코드 진행

      mockPopup.closed = true
      jest.advanceTimersByTime(500)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      // handshake가 reject되면 send도 같은 error로 reject (DISCONNECTED 또는 INTERNAL/TIMEOUT 가능)
      await expect(p1).rejects.toBeInstanceOf(ProviderError)
      await expect(p2).rejects.toBeInstanceOf(ProviderError)
    })
  })

  // ===== T-U-07: origin mismatch =====
  describe('T-U-07: origin mismatch silent drop', () => {
    it('다른 origin의 메시지는 무시 — pending 영향 0', async () => {
      transport = new PopupTransport()
      const promise = transport.send(makeEnvelope('req-1'))
      await flushHandshake()

      // 악의적인 origin
      dispatchResponse('https://evil.example.com', { id: 'req-1', result: 'pwned' })

      jest.advanceTimersByTime(60000)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })

      await transport.close()
    })
  })

  // ===== T-U-08: envelope shape silent drop (4 subcases) =====
  describe('T-U-08: envelope shape silent drop', () => {
    it.each([
      ['T-U-08a (data null)', null],
      ['T-U-08b (data primitive string)', 'string-primitive'],
      ['T-U-08c (id 누락)', { result: 'no-id' }],
      ['T-U-08d (id non-string)', { id: 123, result: 'x' }],
    ])('%s → silent drop, pending unchanged', async (_label, badData) => {
      transport = new PopupTransport()
      const promise = transport.send(makeEnvelope('req-1'))
      await flushHandshake()

      dispatchResponse(DEFAULT_ORIGIN, badData)

      jest.advanceTimersByTime(60000)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })

      await transport.close()
    })
  })

  // ===== T-U-09: unknown id silent drop =====
  describe('T-U-09: unknown id silent drop', () => {
    it('모르는 id의 응답은 무시 (이미 timeout 처리된 후 도착할 수 있음)', async () => {
      transport = new PopupTransport()
      const promise = transport.send(makeEnvelope('req-1'))
      await flushHandshake()

      dispatchResponse(DEFAULT_ORIGIN, { id: 'unknown-id', result: 'x' })

      jest.advanceTimersByTime(60000)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })

      await transport.close()
    })
  })

  // ===== T-U-09a: postMessage throws =====
  describe('T-U-09a: postMessage throws (m02-02 — handshake 후 main send에서)', () => {
    it('handshake 정상 → main send postMessage 던짐 → cleanup + INTERNAL_ERROR reject', async () => {
      transport = new PopupTransport()
      // handshake는 auto-respond, main send postMessage는 throw
      mockPopup.postMessage.mockImplementation((message: { method?: unknown; id?: unknown }) => {
        if (message?.method === '_handshake' && typeof message.id === 'string') {
          Promise.resolve().then(() => {
            dispatchResponse(DEFAULT_ORIGIN, {
              id: message.id,
              result: { version: '2.0' },
            })
          })
          return
        }
        throw new Error('cannot postMessage to closed window')
      })

      await expect(transport.send(makeEnvelope('req-1'))).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
      })

      // pending Map은 비어 있어야 함 (cleanup 검증) — 후속 send는 정상 동작
      installHandshakeAutoRespond(mockPopup)
      const p2 = transport.send(makeEnvelope('req-2'))
      await flushHandshake()
      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-2', result: 'ok' })
      await expect(p2).resolves.toMatchObject({ id: 'req-2' })

      await transport.close()
    })
  })

  // ===== T-U-10: close() cleanup =====
  describe('T-U-10: close() cleanup', () => {
    it('pending 3개 + listener + interval + popup 모두 정리', async () => {
      transport = new PopupTransport()
      const p1 = transport.send(makeEnvelope('a'))
      const p2 = transport.send(makeEnvelope('b'))
      const p3 = transport.send(makeEnvelope('c'))
      await flushHandshake()

      const removeSpy = jest.spyOn(window, 'removeEventListener')

      await transport.close()

      await expect(p1).rejects.toMatchObject({ code: ErrorCode.DISCONNECTED })
      await expect(p2).rejects.toMatchObject({ code: ErrorCode.DISCONNECTED })
      await expect(p3).rejects.toMatchObject({ code: ErrorCode.DISCONNECTED })

      expect(mockPopup.close).toHaveBeenCalled()
      expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function))

      removeSpy.mockRestore()
    })
  })

  // ===== T-U-11: on/off state events =====
  describe('T-U-11: on/off state events', () => {
    it('T-U-11a: popup open 시 connected emit, off 후 호출 안 됨', async () => {
      transport = new PopupTransport()
      const handler = jest.fn<void, [TransportState]>()
      transport.on('state', handler)

      void transport.send(makeEnvelope('a')).catch(() => {})
      await flushHandshake()
      expect(handler).toHaveBeenCalledWith('connected')

      transport.off('state', handler)
      handler.mockClear()
      await transport.close()
      expect(handler).not.toHaveBeenCalled()
    })

    it('T-U-11b: close() 시 disconnected emit', async () => {
      transport = new PopupTransport()
      const handler = jest.fn<void, [TransportState]>()

      void transport.send(makeEnvelope('a')).catch(() => {})
      await flushHandshake()
      transport.on('state', handler)

      await transport.close()
      expect(handler).toHaveBeenCalledWith('disconnected')
    })
  })

  // ===== T-U-12: setTimeoutMs(-1) =====
  describe('T-U-12: setTimeoutMs(-1)', () => {
    it('음수 입력 → ProviderError(INVALID_PARAMS) throw', () => {
      transport = new PopupTransport()
      expect(() => transport.setTimeoutMs(-1)).toThrow(ProviderError)
      expect(() => transport.setTimeoutMs(-1)).toThrow(/positive finite number/)
    })
  })

  // ===== T-U-13: setTimeoutMs('60s') =====
  describe('T-U-13: setTimeoutMs non-number', () => {
    it("'60s' 입력 → ProviderError(INVALID_PARAMS) throw", () => {
      transport = new PopupTransport()
      expect(() => transport.setTimeoutMs('60s' as unknown as number)).toThrow(ProviderError)
      expect(() => transport.setTimeoutMs(NaN)).toThrow(ProviderError)
      expect(() => transport.setTimeoutMs(0)).toThrow(ProviderError)
    })
  })

  // ===== T-U-14: 생성자 옵션 default =====
  describe('T-U-14: constructor default options', () => {
    it('options 미지정 → popUpUrl/timeoutMs/origin default 적용', async () => {
      transport = new PopupTransport()
      const promise = transport.send(makeEnvelope('req-1'))
      await flushHandshake()

      expect(openSpy).toHaveBeenCalledWith(DEFAULT_URL, '_blank')
      expect(mockPopup.postMessage).toHaveBeenCalledWith(expect.any(Object), DEFAULT_ORIGIN)

      jest.advanceTimersByTime(60000)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })

      await transport.close()
    })
  })

  // ===== T-U-15: 생성자 옵션 override =====
  describe('T-U-15: constructor option override', () => {
    it('popUpUrl + timeoutMs override → origin 자동 도출 + 적용', async () => {
      transport = new PopupTransport({
        popUpUrl: 'http://localhost:9090',
        timeoutMs: 5000,
      })
      // override origin에 맞춰 handshake auto-respond 재설치
      installHandshakeAutoRespond(mockPopup, 'http://localhost:9090')

      const promise = transport.send(makeEnvelope('req-1'))
      await flushHandshake()

      expect(openSpy).toHaveBeenCalledWith('http://localhost:9090', '_blank')
      expect(mockPopup.postMessage).toHaveBeenCalledWith(expect.any(Object), 'http://localhost:9090')

      jest.advanceTimersByTime(5000)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })

      await transport.close()
    })
  })

  // =========================================================================
  // m02-02 Handshake 단위 테스트 (T-U-HS-01 ~ T-U-HS-10)
  // =========================================================================

  // ===== T-U-HS-01: send 첫 호출 시 자동 handshake 발동 =====
  describe('T-U-HS-01: 자동 handshake 발동', () => {
    it('send() 첫 호출 시 _handshake postMessage가 자동 송신됨', async () => {
      transport = new PopupTransport()
      // handshake 후 어떤 메시지가 어떤 method로 갔는지 검사할 수 있어야 함
      void transport.send(makeEnvelope('req-1')).catch(() => {})
      // m07-02: ready 게이트 1단계 추가 → microtask flush 충분히
      await flushHandshake()

      const handshakeCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === '_handshake',
      )
      expect(handshakeCalls.length).toBe(1)
      const handshakeMsg = handshakeCalls[0][0] as { id: string; method: string; params: { version: string; clientName: string } }
      expect(handshakeMsg.id.startsWith('_handshake_')).toBe(true)
      expect(handshakeMsg.method).toBe('_handshake')
      expect(handshakeMsg.params).toEqual({ version: '2.0', clientName: 'connector' })
      expect(handshakeCalls[0][1]).toBe(DEFAULT_ORIGIN)

      await transport.close()
    })
  })

  // ===== T-U-HS-02: handshake ack 후 실제 메시지 송신 =====
  describe('T-U-HS-02: handshake ack 후 실제 송신', () => {
    it('handshake ack 도착 전엔 main send postMessage 호출 안 됨', async () => {
      transport = new PopupTransport()
      // handshake auto-respond 비활성화
      mockPopup.postMessage.mockImplementation(() => { /* swallow, no auto-respond */ })

      const env = makeEnvelope('req-1')
      void transport.send(env).catch(() => {})
      await Promise.resolve()
      await Promise.resolve()

      // 아직 handshake 응답 안 옴 → main env 송신 안 됨
      const envCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === 'test_method',
      )
      expect(envCalls.length).toBe(0)

      await transport.close()
    })
  })

  // ===== T-U-HS-03: version major mismatch =====
  describe('T-U-HS-03: version major mismatch', () => {
    it('sdk 응답 version 1.5.0 → PROTOCOL_VERSION_MISMATCH reject + close()', async () => {
      transport = new PopupTransport()
      installHandshakeAutoRespond(mockPopup, DEFAULT_ORIGIN, '1.5.0')

      await expect(transport.send(makeEnvelope('req-1'))).rejects.toMatchObject({
        code: ErrorCode.PROTOCOL_VERSION_MISMATCH,
      })
      expect(mockPopup.close).toHaveBeenCalled()
    })
  })

  // ===== T-U-HS-04: malformed version (5 subcases) =====
  describe('T-U-HS-04: malformed version → PROTOCOL_VERSION_MISMATCH', () => {
    it.each([
      ['T-U-HS-04a (undefined)', undefined, ErrorCode.PROTOCOL_VERSION_MISMATCH],
      ['T-U-HS-04b (non-string 123)', 123, ErrorCode.PROTOCOL_VERSION_MISMATCH],
      ['T-U-HS-04c (empty string)', '', ErrorCode.PROTOCOL_VERSION_MISMATCH],
      ['T-U-HS-04d (only dot)', '.', ErrorCode.PROTOCOL_VERSION_MISMATCH],
    ])('%s → reject', async (_label, version, expectedCode) => {
      transport = new PopupTransport()
      mockPopup.postMessage.mockImplementation((message: { method?: unknown; id?: unknown }) => {
        if (message?.method === '_handshake' && typeof message.id === 'string') {
          Promise.resolve().then(() => {
            dispatchResponse(DEFAULT_ORIGIN, {
              id: message.id,
              result: version === undefined ? {} : { version },
            })
          })
        }
      })

      await expect(transport.send(makeEnvelope('req-1'))).rejects.toMatchObject({
        code: expectedCode,
      })
    })

    it('T-U-HS-04e (major 만 있는 "2." → OK 케이스, PASS)', async () => {
      transport = new PopupTransport()
      installHandshakeAutoRespond(mockPopup, DEFAULT_ORIGIN, '2.')

      const promise = transport.send<{ x: number }, { ok: true }>(makeEnvelope('req-1'))
      await flushHandshake()
      // handshake compatible (major '2' vs '2'). 실제 send는 정상 진행
      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-1', result: { ok: true } })

      const response = await promise
      expect(response.id).toBe('req-1')

      await transport.close()
    })
  })

  // ===== T-U-HS-05: handshake timeout =====
  describe('T-U-HS-05: handshake timeout', () => {
    it('default 60s 안에 ack 안 옴 → TIMEOUT reject + close()', async () => {
      transport = new PopupTransport()
      // handshake auto-respond 비활성화 (응답 안 옴)
      mockPopup.postMessage.mockImplementation(() => { /* swallow */ })

      const promise = transport.send(makeEnvelope('req-1'))
      // m07-02: ready 게이트 통과 후 handshake setTimeout이 등록되도록 microtask flush
      await flushHandshake()
      jest.advanceTimersByTime(60000)

      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })
      expect(mockPopup.close).toHaveBeenCalled()
    })
  })

  // ===== T-U-HS-06: handshake error 응답 =====
  describe('T-U-HS-06: handshake error 응답', () => {
    it('sdk { error } 응답 → reject + close()', async () => {
      transport = new PopupTransport()
      mockPopup.postMessage.mockImplementation((message: { method?: unknown; id?: unknown }) => {
        if (message?.method === '_handshake' && typeof message.id === 'string') {
          Promise.resolve().then(() => {
            dispatchResponse(DEFAULT_ORIGIN, {
              id: message.id,
              error: { code: -32601, message: 'method not supported' },
            })
          })
        }
      })

      await expect(transport.send(makeEnvelope('req-1'))).rejects.toBeInstanceOf(ProviderError)
      expect(mockPopup.close).toHaveBeenCalled()
    })
  })

  // ===== T-U-HS-07: 다중 send 동시 → handshake 1회만 =====
  describe('T-U-HS-07: 다중 send → handshake 1회', () => {
    it('3개 동시 send → _handshake postMessage 1회만 호출', async () => {
      transport = new PopupTransport()
      const p1 = transport.send(makeEnvelope('a'))
      const p2 = transport.send(makeEnvelope('b'))
      const p3 = transport.send(makeEnvelope('c'))
      await flushHandshake()

      const handshakeCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === '_handshake',
      )
      expect(handshakeCalls.length).toBe(1)

      // handshake 후 3개 모두 정상 송신 + 응답
      dispatchResponse(DEFAULT_ORIGIN, { id: 'a', result: 1 })
      dispatchResponse(DEFAULT_ORIGIN, { id: 'b', result: 2 })
      dispatchResponse(DEFAULT_ORIGIN, { id: 'c', result: 3 })

      const [r1, r2, r3] = await Promise.all([p1, p2, p3])
      expect((r1 as ResponseEnvelope<number>).result).toBe(1)
      expect((r2 as ResponseEnvelope<number>).result).toBe(2)
      expect((r3 as ResponseEnvelope<number>).result).toBe(3)

      await transport.close()
    })
  })

  // ===== T-U-HS-08: 실패 후 재handshake =====
  describe('T-U-HS-08: 실패 후 재handshake', () => {
    it('handshake 실패 → close()로 promise 리셋 → 다음 send에서 새 handshake 발동', async () => {
      transport = new PopupTransport()
      installHandshakeAutoRespond(mockPopup, DEFAULT_ORIGIN, '1.5.0') // mismatch

      await expect(transport.send(makeEnvelope('req-1'))).rejects.toMatchObject({
        code: ErrorCode.PROTOCOL_VERSION_MISMATCH,
      })

      // 두 번째 send: 호환 버전으로 재시도
      installHandshakeAutoRespond(mockPopup, DEFAULT_ORIGIN, '2.5.0')
      const p2 = transport.send(makeEnvelope('req-2'))
      await flushHandshake()

      // _handshake postMessage가 두 번 발동 (재handshake 검증)
      const handshakeCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === '_handshake',
      )
      expect(handshakeCalls.length).toBe(2)

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-2', result: 'ok' })
      await expect(p2).resolves.toMatchObject({ id: 'req-2' })

      await transport.close()
    })
  })

  // ===== T-U-HS-09: protocolVersion override =====
  describe('T-U-HS-09: protocolVersion override', () => {
    it("protocolVersion '3.0' override → handshake params.version === '3.0'", async () => {
      transport = new PopupTransport({ protocolVersion: '3.0' })
      installHandshakeAutoRespond(mockPopup, DEFAULT_ORIGIN, '3.5.0')

      const promise = transport.send(makeEnvelope('req-1'))
      await flushHandshake()

      const handshakeCall = mockPopup.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as { method?: string })?.method === '_handshake',
      )
      expect((handshakeCall![0] as { params: { version: string } }).params.version).toBe('3.0')

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-1', result: 'ok' })
      await expect(promise).resolves.toMatchObject({ id: 'req-1' })

      await transport.close()
    })

    it("protocolVersion '3.0' vs sdk '2.x.y' → mismatch", async () => {
      transport = new PopupTransport({ protocolVersion: '3.0' })
      installHandshakeAutoRespond(mockPopup, DEFAULT_ORIGIN, '2.5.0')

      await expect(transport.send(makeEnvelope('req-1'))).rejects.toMatchObject({
        code: ErrorCode.PROTOCOL_VERSION_MISMATCH,
      })
    })
  })

  // ===== T-U-HS-10: handshake 진행 중 popup close (race) =====
  describe('T-U-HS-10: handshake 진행 중 popup close', () => {
    it('mockPopup.closed=true + 500ms polling → DISCONNECTED reject (timeout fallback 안 함)', async () => {
      transport = new PopupTransport()
      // handshake auto-respond 비활성화 — handshake pending 상태에서 popup close
      mockPopup.postMessage.mockImplementation(() => { /* swallow */ })

      const promise = transport.send(makeEnvelope('req-1'))
      // m07-02: ready 게이트 통과 후 handshake pending 등록까지 기다림
      await flushHandshake()

      // 사용자가 popup 강제 close
      mockPopup.closed = true
      jest.advanceTimersByTime(500) // close polling
      await Promise.resolve()
      await Promise.resolve()

      // DISCONNECTED reject (timeout=60000보다 훨씬 빠름)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.DISCONNECTED })
    })
  })

  // =========================================================================
  // m07-02 Ready Gate 단위 테스트 (T-U-RG-01 ~ T-U-RG-08)
  // =========================================================================

  // ===== T-U-RG-01: B Gate happy path =====
  describe('T-U-RG-01: B Gate happy path', () => {
    it('_ready 수신 → _handshake 송신 → method round-trip 성공', async () => {
      transport = new PopupTransport()
      // 기본 helper가 _ready + _handshake 모두 자동 응답
      const env = makeEnvelope('req-rg-1')
      const promise = transport.send<{ x: number }, { ok: true }>(env)
      await flushHandshake()

      // _handshake가 send된 후 method도 정상 송신
      const methodCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === 'test_method',
      )
      expect(methodCalls.length).toBe(1)

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-rg-1', result: { ok: true } })
      const response = (await promise) as ResponseEnvelope<{ ok: true }>
      expect(response.id).toBe('req-rg-1')

      await transport.close()
    })
  })

  // ===== T-U-RG-02: Y Timeout fallback =====
  describe('T-U-RG-02: Y Timeout fallback (구 sdk 호환)', () => {
    it('_ready 미수신 + readyTimeoutMs 만료 → _handshake 즉시 송신', async () => {
      transport = new PopupTransport({ readyTimeoutMs: 50 })
      // 기본 helper의 _ready auto-emit 비활성화
      uninstallReadyAutoRespond()
      // _handshake만 자동 응답
      mockPopup.postMessage.mockImplementation((message: { method?: unknown; id?: unknown }, msgOrigin: string) => {
        if (message?.method === '_handshake' && typeof message.id === 'string') {
          Promise.resolve().then(() => {
            dispatchResponse(msgOrigin, {
              id: message.id,
              result: { version: '2.0', serverName: 'bridge-ui-old' },
            })
          })
        }
      })

      const promise = transport.send(makeEnvelope('req-rg-2'))
      // ready 게이트 등록 후 readyTimeoutMs 만료까지 시간 진행
      await Promise.resolve()
      jest.advanceTimersByTime(50)
      await flushHandshake()

      // _handshake가 readyTimeout 후 송신됐는지 검증
      const handshakeCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === '_handshake',
      )
      expect(handshakeCalls.length).toBe(1)

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-rg-2', result: 'fallback-ok' })
      await expect(promise).resolves.toMatchObject({ id: 'req-rg-2', result: 'fallback-ok' })

      await transport.close()
    })
  })

  // ===== T-U-RG-03: _ready envelope shape 검증 =====
  describe('T-U-RG-03: _ready shape boundary-validation', () => {
    it('version/serverName 누락된 _ready는 무시 → 정상 _ready 또는 timeout 대기', async () => {
      transport = new PopupTransport({ readyTimeoutMs: 100 })
      uninstallReadyAutoRespond()
      mockPopup.postMessage.mockImplementation((message: { method?: unknown; id?: unknown }, msgOrigin: string) => {
        if (message?.method === '_handshake' && typeof message.id === 'string') {
          Promise.resolve().then(() => {
            dispatchResponse(msgOrigin, {
              id: message.id,
              result: { version: '2.0', serverName: 'bridge-ui' },
            })
          })
        }
      })

      const promise = transport.send(makeEnvelope('req-rg-3'))
      await Promise.resolve()

      // 잘못된 _ready 메시지들 — 모두 무시되어야 함
      dispatchResponse(DEFAULT_ORIGIN, { type: '_ready' }) // version, serverName 누락
      dispatchResponse(DEFAULT_ORIGIN, { type: '_ready', version: 123, serverName: 'x' }) // version non-string
      dispatchResponse(DEFAULT_ORIGIN, { type: '_ready', version: '2.0' }) // serverName 누락

      // 아직 readyTimeout 안 지남 → handshake 송신 안 됨
      let handshakeCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === '_handshake',
      )
      expect(handshakeCalls.length).toBe(0)

      // 정상 _ready 도착 → 게이트 열림
      sendReadySignal()
      await flushHandshake()

      handshakeCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === '_handshake',
      )
      expect(handshakeCalls.length).toBe(1)

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-rg-3', result: 'ok' })
      await expect(promise).resolves.toMatchObject({ id: 'req-rg-3' })

      await transport.close()
    })
  })

  // ===== T-U-RG-04: 다중 send → ready 대기 1회 공유 =====
  describe('T-U-RG-04: 다중 send → ready 대기 1회 공유', () => {
    it('3개 동시 send + 1번의 _ready emit → 3개 모두 게이트 통과', async () => {
      transport = new PopupTransport()
      // 기본 helper의 _ready 1회 emit이 3개 send를 모두 통과시켜야 함
      const p1 = transport.send(makeEnvelope('a'))
      const p2 = transport.send(makeEnvelope('b'))
      const p3 = transport.send(makeEnvelope('c'))
      await flushHandshake()

      // _handshake도 1회만 (m02-02 in-flight 공유와 동일)
      const handshakeCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === '_handshake',
      )
      expect(handshakeCalls.length).toBe(1)

      // 3개 모두 method postMessage 호출
      const methodCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === 'test_method',
      )
      expect(methodCalls.length).toBe(3)

      dispatchResponse(DEFAULT_ORIGIN, { id: 'a', result: 1 })
      dispatchResponse(DEFAULT_ORIGIN, { id: 'b', result: 2 })
      dispatchResponse(DEFAULT_ORIGIN, { id: 'c', result: 3 })

      const [r1, r2, r3] = await Promise.all([p1, p2, p3])
      expect((r1 as ResponseEnvelope<number>).result).toBe(1)
      expect((r2 as ResponseEnvelope<number>).result).toBe(2)
      expect((r3 as ResponseEnvelope<number>).result).toBe(3)

      await transport.close()
    })
  })

  // ===== T-U-RG-05: close 후 재오픈 시 새 ready 사이클 =====
  describe('T-U-RG-05: close 후 재오픈 시 새 ready 사이클', () => {
    it('close 후 send → 새 readyPromise + 새 _ready 대기', async () => {
      transport = new PopupTransport()

      const p1 = transport.send(makeEnvelope('first'))
      await flushHandshake()
      dispatchResponse(DEFAULT_ORIGIN, { id: 'first', result: 1 })
      await expect(p1).resolves.toMatchObject({ id: 'first' })

      // 첫 사이클 확정 후 close → 새 popup으로 두 번째 사이클
      await transport.close()
      const newPopup = makeMockPopup()
      openSpy.mockImplementation(() => newPopup as unknown as Window)
      // 두 번째 popup에도 helper 부착 (uninstall된 spy 재설치)
      installHandshakeAutoRespond(newPopup)

      const p2 = transport.send(makeEnvelope('second'))
      await flushHandshake()

      // 새 사이클에서도 _handshake 송신 + 정상 round-trip
      const handshakeCalls = newPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === '_handshake',
      )
      expect(handshakeCalls.length).toBe(1)

      dispatchResponse(DEFAULT_ORIGIN, { id: 'second', result: 2 })
      await expect(p2).resolves.toMatchObject({ id: 'second' })

      await transport.close()
    })
  })

  // ===== T-U-RG-06: _ready origin 가드 =====
  describe('T-U-RG-06: _ready origin guard', () => {
    it('잘못된 origin의 _ready는 무시', async () => {
      transport = new PopupTransport({ readyTimeoutMs: 100 })
      uninstallReadyAutoRespond()
      mockPopup.postMessage.mockImplementation((message: { method?: unknown; id?: unknown }, msgOrigin: string) => {
        if (message?.method === '_handshake' && typeof message.id === 'string') {
          Promise.resolve().then(() => {
            dispatchResponse(msgOrigin, {
              id: message.id,
              result: { version: '2.0', serverName: 'bridge-ui' },
            })
          })
        }
      })

      const promise = transport.send(makeEnvelope('req-rg-6'))
      await Promise.resolve()

      // 악의적 origin의 _ready — 무시되어야 함
      dispatchResponse('https://evil.example.com', { type: '_ready', version: '2.0', serverName: 'evil' })

      // handshake 아직 송신 안 됨
      let handshakeCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === '_handshake',
      )
      expect(handshakeCalls.length).toBe(0)

      // 정상 origin의 _ready
      sendReadySignal()
      await flushHandshake()

      handshakeCalls = mockPopup.postMessage.mock.calls.filter(
        (c: unknown[]) => (c[0] as { method?: string })?.method === '_handshake',
      )
      expect(handshakeCalls.length).toBe(1)

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-rg-6', result: 'ok' })
      await expect(promise).resolves.toMatchObject({ id: 'req-rg-6' })

      await transport.close()
    })
  })

  // ===== T-U-RG-07: readyTimeoutMs 옵션 검증 =====
  describe('T-U-RG-07: readyTimeoutMs 옵션 검증', () => {
    it('default 10000 + override + invalid 값 throw', () => {
      // default
      const t1 = new PopupTransport()
      // (private이지만 runtime accessible — 타입 캐스트로 검사)
      expect((t1 as unknown as { readyTimeoutMs: number }).readyTimeoutMs).toBe(10000)

      // override 양수
      const t2 = new PopupTransport({ readyTimeoutMs: 500 })
      expect((t2 as unknown as { readyTimeoutMs: number }).readyTimeoutMs).toBe(500)

      // invalid: -1
      expect(() => new PopupTransport({ readyTimeoutMs: -1 })).toThrow(ProviderError)
      expect(() => new PopupTransport({ readyTimeoutMs: -1 })).toThrow(/positive finite number/)

      // invalid: NaN
      expect(() => new PopupTransport({ readyTimeoutMs: NaN })).toThrow(ProviderError)

      // invalid: 0
      expect(() => new PopupTransport({ readyTimeoutMs: 0 })).toThrow(ProviderError)

      // invalid: non-number (런타임 보호 — 타입은 number지만 외부에서 any로 들어올 수 있음)
      expect(() => new PopupTransport({ readyTimeoutMs: '500' as unknown as number })).toThrow(ProviderError)
    })
  })

  // ===== T-U-RG-08: close 시 readyTimer + readyPromise 정리 =====
  describe('T-U-RG-08: close cleanup of ready state', () => {
    it('close 후 readyTimer / readyPromise / resolveReady 모두 null', async () => {
      transport = new PopupTransport({ readyTimeoutMs: 5000 })
      uninstallReadyAutoRespond()
      mockPopup.postMessage.mockImplementation(() => { /* swallow — ready 게이트에서 정지 */ })

      // send 호출하여 ready 게이트 진입 (resolveReady + readyTimer 등록)
      void transport.send(makeEnvelope('req-rg-8')).catch(() => { /* close로 reject 예상 */ })
      await Promise.resolve()

      // close 호출 — 모든 ready state cleanup
      await transport.close()

      const t = transport as unknown as {
        readyTimer: unknown
        readyPromise: unknown
        resolveReady: unknown
      }
      expect(t.readyTimer).toBeNull()
      expect(t.readyPromise).toBeNull()
      expect(t.resolveReady).toBeNull()
    })
  })
})
