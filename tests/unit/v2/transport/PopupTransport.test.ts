/**
 * PopupTransport 단위 테스트 (m02-01 + m02-02 handshake)
 *
 * jsdom 환경 — window.open / postMessage / addEventListener 모킹
 * m02-01 21건 (T-U-01 ~ T-U-15, T-U-08 4 subcase + T-U-09a + T-U-11 2 subcase)
 *  + m02-02 14건 (T-U-HS-01 ~ T-U-HS-10, T-U-HS-04 5 subcase 포함)
 *  = 35건
 *  + m09-04-27 10건(T-U-SIGNPROGRESS-CONN-01~05, 07~10)
 */
import { PopupTransport } from '../../../../src/transport/PopupTransport'
import { ProviderError } from '../../../../src/error/ProviderError'
import { ErrorCode } from '../../../../src/error/ErrorCode'
import { MessageEnvelope, ResponseEnvelope, TransportState, SignProgressInfo } from '../../../../src/transport/MessageTransport'

interface MockPopup {
  closed: boolean
  close: jest.Mock
  postMessage: jest.Mock
}

const DEFAULT_URL = 'https://v2bridge.dcentwallet.com/'
const DEFAULT_ORIGIN = 'https://v2bridge.dcentwallet.com'

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
      // timeout을 assertion 수단으로만 사용 — default(180s)와 분리해 60000으로 고정
      transport = new PopupTransport({ timeoutMs: 60000 })
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
      // timeout을 assertion 수단으로만 사용 — default(180s)와 분리해 60000으로 고정
      transport = new PopupTransport({ timeoutMs: 60000 })
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
      // timeout을 assertion 수단으로만 사용 — default(180s)와 분리해 60000으로 고정
      transport = new PopupTransport({ timeoutMs: 60000 })
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
      // (2026-08-10) state 이벤트는 2번째 인자(detail)가 추가됐다. 1번째 인자의 의미는
      // v1 그대로(팝업 축)여야 하므로 그 축만 단언한다.
      expect(handler.mock.calls.at(-1)?.[0]).toBe('connected')

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
      expect(handler.mock.calls.at(-1)?.[0]).toBe('disconnected')
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

      // default timeout = 180000 (60s에서 상향, CIP-95 2회 서명 대응).
      // 60000으로의 회귀를 잡기 위해: 60s 시점엔 아직 pending, 180s에 TIMEOUT.
      let settled = false
      promise.then(() => { settled = true }, () => { settled = true })

      jest.advanceTimersByTime(60000)
      await Promise.resolve()
      expect(settled).toBe(false) // 60s에 안 끊김 → default > 60s 증명

      jest.advanceTimersByTime(120000) // 총 180s
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
      const handshakeMsg = handshakeCalls[0][0] as { id: string; method: string; params: { version: string; clientName: string; transport: string | undefined } }
      expect(handshakeMsg.id.startsWith('_handshake_')).toBe(true)
      expect(handshakeMsg.method).toBe('_handshake')
      // m09-04-03 / DC-2701: 옵션 미명시 → default(transport undefined). sdk가 둘 다 picker + HID auto.
      expect(handshakeMsg.params).toEqual({ version: '2.0', clientName: 'connector', transport: undefined })
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
    it('handshakeTimeoutMs 안에 ack 안 옴 → TIMEOUT reject + close()', async () => {
      // handshake는 전용 handshakeTimeoutMs 사용 — assertion 수단으로 60000 고정
      transport = new PopupTransport({ handshakeTimeoutMs: 60000 })
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

  // ===== T-U-HS-07: handshake timeout이 request timeoutMs(180s)에 커플링되지 않음 =====
  // Claude 크로스 리뷰 WARNING 회귀 가드 (PR #175): timeoutMs 180s 상향이
  // handshake ack까지 상속하면 dead popup이 190s 붙잡는 latency 회귀. handshake는
  // 전용 default 60s를 유지해야 한다.
  describe('T-U-HS-07: handshake timeout decoupled from request timeoutMs', () => {
    it('timeoutMs=180000(default)여도 handshake는 60s에 TIMEOUT (180s 미상속)', async () => {
      // request timeout만 180s, handshakeTimeoutMs는 미지정 → default 60s
      transport = new PopupTransport({ timeoutMs: 180000 })
      mockPopup.postMessage.mockImplementation(() => { /* ack 안 옴 */ })

      const promise = transport.send(makeEnvelope('req-1'))
      let settled = false
      promise.then(() => { settled = true }, () => { settled = true })
      await flushHandshake()

      // 59s 시점: 아직 pending (60s 미도달)
      jest.advanceTimersByTime(59000)
      await Promise.resolve()
      expect(settled).toBe(false)

      // 60s 시점: handshake TIMEOUT (180s를 기다리지 않음)
      jest.advanceTimersByTime(1000)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })
      expect(mockPopup.close).toHaveBeenCalled()
    })
  })

  // ===== T-U-HS-08: handshakeTimeoutMs boundary-validation =====
  describe('T-U-HS-08: handshakeTimeoutMs 검증', () => {
    it.each([
      ['0', 0],
      ['음수', -1],
      ['NaN', NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
    ])('%s → INVALID_PARAMS throw', (_label, bad) => {
      expect(() => new PopupTransport({ handshakeTimeoutMs: bad as number }))
        .toThrow(ProviderError)
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

  // ===== T-U-SIGNPROGRESS-CONN-01: 정상 progress 수신 =====
  describe('T-U-SIGNPROGRESS-CONN-01: pending id의 유효 _signProgress', () => {
    it('handler가 정확한 SignProgressInfo로 1회 호출', async () => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      const handler = jest.fn<void, [SignProgressInfo]>()
      transport.on('signProgress', handler)

      const promise = transport.send(makeEnvelope('req-sp-1'))
      await flushHandshake()

      dispatchResponse(DEFAULT_ORIGIN, {
        id: 'req-sp-1', type: '_signProgress', step: 1, total: 2, role: 'payment',
      })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({
        requestId: 'req-sp-1', step: 1, total: 2, role: 'payment',
      })

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-1', result: { ok: true } })
      await promise
      await transport.close()
    })
  })

  // ===== T-U-SIGNPROGRESS-CONN-02: stale/미매칭 id =====
  describe('T-U-SIGNPROGRESS-CONN-02: pending에 없는 id', () => {
    it('handler 미호출 + 원 요청은 그대로 timeout', async () => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      const handler = jest.fn<void, [SignProgressInfo]>()
      transport.on('signProgress', handler)

      const promise = transport.send(makeEnvelope('req-sp-2'))
      await flushHandshake()

      dispatchResponse(DEFAULT_ORIGIN, {
        id: 'not-a-pending-id', type: '_signProgress', step: 1, total: 2,
      })
      expect(handler).not.toHaveBeenCalled()

      jest.advanceTimersByTime(60000)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })
      await transport.close()
    })
  })

  // ===== T-U-SIGNPROGRESS-CONN-11: 내부 handshake id는 progress 채널에서 필터링된다 =====
  describe('T-U-SIGNPROGRESS-CONN-11: handshake id 필터링', () => {
    it('아직 pending인 _handshake_* id로 온 progress는 무시된다 (내부 id 비노출)', async () => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      const handler = jest.fn<void, [SignProgressInfo]>()
      transport.on('signProgress', handler)

      let handshakeId: string | undefined
      mockPopup.postMessage.mockImplementation((message: { method?: unknown; id?: unknown }, msgOrigin: string) => {
        if (message?.method === '_handshake' && typeof message.id === 'string') {
          handshakeId = message.id
          // handshake id가 this.pending에 이미 등록된 시점(postMessage 직전 set) — 그 id로
          // progress를 흉내내도 handshake-prefix 가드가 pending 여부와 무관하게 먼저 막아야 한다.
          dispatchResponse(msgOrigin, { id: message.id, type: '_signProgress', step: 1, total: 2 })
          Promise.resolve().then(() => {
            dispatchResponse(msgOrigin, {
              id: message.id, result: { version: '2.0', serverName: 'bridge-ui' },
            })
          })
        }
      })
      installReadyAutoRespondOnce(DEFAULT_ORIGIN, '2.0', 'bridge-ui')

      void transport.send(makeEnvelope('req-sp-11')).catch(() => {})
      await flushHandshake()

      expect(handshakeId).toMatch(/^_handshake_/)
      expect(handler).not.toHaveBeenCalled()
      await transport.close()
    })
  })

  // ===== T-U-SIGNPROGRESS-CONN-03: malformed payload silent ignore =====
  describe('T-U-SIGNPROGRESS-CONN-03: malformed payload', () => {
    it.each([
      ['CONN-03a (step 누락)', { id: 'req-sp-3', type: '_signProgress', total: 2 }],
      ['CONN-03b (total 누락)', { id: 'req-sp-3', type: '_signProgress', step: 1 }],
      ['CONN-03c (step non-number)', { id: 'req-sp-3', type: '_signProgress', step: '1', total: 2 }],
      ['CONN-03d (total non-number)', { id: 'req-sp-3', type: '_signProgress', step: 1, total: null }],
      ['CONN-03e (id 누락)', { type: '_signProgress', step: 1, total: 2 }],
      ['CONN-03f (id non-string)', { id: 42, type: '_signProgress', step: 1, total: 2 }],
      ['CONN-03g (step NaN)', { id: 'req-sp-3', type: '_signProgress', step: NaN, total: 2 }],
      ['CONN-03h (total Infinity)', { id: 'req-sp-3', type: '_signProgress', step: 1, total: Infinity }],
      ['CONN-03i (step 0)', { id: 'req-sp-3', type: '_signProgress', step: 0, total: 2 }],
      ['CONN-03j (step 음수)', { id: 'req-sp-3', type: '_signProgress', step: -1, total: 2 }],
      ['CONN-03k (step 소수)', { id: 'req-sp-3', type: '_signProgress', step: 1.5, total: 2 }],
      ['CONN-03l (total 0)', { id: 'req-sp-3', type: '_signProgress', step: 1, total: 0 }],
      ['CONN-03m (step > total)', { id: 'req-sp-3', type: '_signProgress', step: 3, total: 2 }],
      ['CONN-03n (top-level data가 배열)', ['req-sp-3', '_signProgress', 1, 2]],
    ])('%s → throw 없이 silent ignore + pending 보존', async (_label, badData) => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      const handler = jest.fn<void, [SignProgressInfo]>()
      transport.on('signProgress', handler)

      const promise = transport.send(makeEnvelope('req-sp-3'))
      await flushHandshake()

      expect(() => dispatchResponse(DEFAULT_ORIGIN, badData)).not.toThrow()
      expect(handler).not.toHaveBeenCalled()

      // pending이 보존되었는지 — 진짜 최종 응답이 여전히 resolve된다
      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-3', result: { ok: true } })
      const res = (await promise) as ResponseEnvelope<{ ok: true }>
      expect(res.result).toEqual({ ok: true })
      await transport.close()
    })
  })

  // ===== T-U-SIGNPROGRESS-CONN-04: pending 미삭제 회귀 가드 =====
  describe('T-U-SIGNPROGRESS-CONN-04: progress 후 최종 응답 정상 resolve', () => {
    it('progress 2회 수신해도 pending 유지 → 최종 응답 resolve', async () => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      const handler = jest.fn<void, [SignProgressInfo]>()
      transport.on('signProgress', handler)

      const promise = transport.send(makeEnvelope('req-sp-4'))
      await flushHandshake()

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-4', type: '_signProgress', step: 1, total: 3 })
      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-4', type: '_signProgress', step: 2, total: 3 })

      expect(handler).toHaveBeenCalledTimes(2)
      expect(handler).toHaveBeenNthCalledWith(1, { requestId: 'req-sp-4', step: 1, total: 3, role: undefined })

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-4', result: { done: true } })
      const res = (await promise) as ResponseEnvelope<{ done: true }>
      expect(res.result).toEqual({ done: true })
      await transport.close()
    })
  })

  // ===== T-U-SIGNPROGRESS-CONN-05: 기존 경로 회귀 0 =====
  describe('T-U-SIGNPROGRESS-CONN-05: _ready / 일반 응답 경로 회귀 0', () => {
    it('signProgress 리스너가 등록되어 있어도 _ready 게이트 + 일반 응답 매칭이 그대로 동작', async () => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      const handler = jest.fn<void, [SignProgressInfo]>()
      transport.on('signProgress', handler)

      const env = makeEnvelope('req-sp-5')
      const promise = transport.send<{ x: number }, { ok: true }>(env)
      await flushHandshake()

      // _ready 게이트가 열렸어야 실제 send postMessage가 나간다
      expect(mockPopup.postMessage).toHaveBeenCalledWith(env, DEFAULT_ORIGIN)

      // 일반 응답(type 필드 없음)은 새 분기에 가로채이지 않고 정상 resolve
      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-5', result: { ok: true } })
      const res = (await promise) as ResponseEnvelope<{ ok: true }>
      expect(res.result).toEqual({ ok: true })
      expect(handler).not.toHaveBeenCalled()
      await transport.close()
    })
  })

  // ===== T-U-SIGNPROGRESS-CONN-07: 다중 리스너 + off + 에러 격리 =====
  describe('T-U-SIGNPROGRESS-CONN-07: 다중 리스너 / off / 에러 격리', () => {
    it('CONN-07a: 2개 등록 시 둘 다 호출, off한 리스너는 이후 미호출', async () => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      const h1 = jest.fn<void, [SignProgressInfo]>()
      const h2 = jest.fn<void, [SignProgressInfo]>()
      transport.on('signProgress', h1)
      transport.on('signProgress', h2)

      const promise = transport.send(makeEnvelope('req-sp-7'))
      await flushHandshake()

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-7', type: '_signProgress', step: 1, total: 2 })
      expect(h1).toHaveBeenCalledTimes(1)
      expect(h2).toHaveBeenCalledTimes(1)

      transport.off('signProgress', h1)
      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-7', type: '_signProgress', step: 2, total: 2 })
      expect(h1).toHaveBeenCalledTimes(1) // off 이후 미호출
      expect(h2).toHaveBeenCalledTimes(2)

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-7', result: { ok: true } })
      await promise
      await transport.close()
    })

    it('CONN-07b: 한 리스너가 throw해도 나머지 리스너 호출 + 메시지 루프 생존', async () => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      const bad = jest.fn<void, [SignProgressInfo]>(() => { throw new Error('listener boom') })
      const good = jest.fn<void, [SignProgressInfo]>()
      transport.on('signProgress', bad)
      transport.on('signProgress', good)

      const promise = transport.send(makeEnvelope('req-sp-7b'))
      await flushHandshake()

      expect(() => dispatchResponse(DEFAULT_ORIGIN, {
        id: 'req-sp-7b', type: '_signProgress', step: 1, total: 2,
      })).not.toThrow()
      expect(bad).toHaveBeenCalledTimes(1)
      expect(good).toHaveBeenCalledTimes(1)

      // 루프 생존 — 이후 최종 응답도 정상 처리
      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-7b', result: { ok: true } })
      await promise
      await transport.close()
    })
  })

  // ===== T-U-SIGNPROGRESS-CONN-08: role opaque passthrough =====
  describe('T-U-SIGNPROGRESS-CONN-08: role opaque', () => {
    it('알려지지 않은 role 문자열도 그대로 전달, non-string role은 undefined로 정규화', async () => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      const handler = jest.fn<void, [SignProgressInfo]>()
      transport.on('signProgress', handler)

      const promise = transport.send(makeEnvelope('req-sp-8'))
      await flushHandshake()

      dispatchResponse(DEFAULT_ORIGIN, {
        id: 'req-sp-8', type: '_signProgress', step: 1, total: 2, role: 'unknown-future-key',
      })
      expect(handler).toHaveBeenNthCalledWith(1, {
        requestId: 'req-sp-8', step: 1, total: 2, role: 'unknown-future-key',
      })

      dispatchResponse(DEFAULT_ORIGIN, {
        id: 'req-sp-8', type: '_signProgress', step: 2, total: 2, role: 42,
      })
      expect(handler).toHaveBeenNthCalledWith(2, {
        requestId: 'req-sp-8', step: 2, total: 2, role: undefined,
      })

      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-8', result: { ok: true } })
      await promise
      await transport.close()
    })
  })

  // ===== T-U-SIGNPROGRESS-CONN-09: 리스너 미등록 no-op =====
  describe('T-U-SIGNPROGRESS-CONN-09: 리스너 미등록 상태', () => {
    it('_signProgress 수신해도 throw 없음 + side-effect 없음', async () => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      // on('signProgress', ...) 호출하지 않음 — signProgressHandlers는 빈 Set

      const promise = transport.send(makeEnvelope('req-sp-9'))
      await flushHandshake()

      expect(() => dispatchResponse(DEFAULT_ORIGIN, {
        id: 'req-sp-9', type: '_signProgress', step: 1, total: 2, role: 'payment',
      })).not.toThrow()

      // side-effect 0 — pending 그대로라 최종 응답이 정상 resolve
      dispatchResponse(DEFAULT_ORIGIN, { id: 'req-sp-9', result: { ok: true } })
      const res = (await promise) as ResponseEnvelope<{ ok: true }>
      expect(res.result).toEqual({ ok: true })
      await transport.close()
    })
  })

  // ===== T-U-SIGNPROGRESS-CONN-10: close() 후 리스너 생존 (크로스 리뷰 C1 수정, m09-04-27 API-03) =====
  // close()는 (a) resetSingleton()이 인스턴스를 통째로 버리는 경로와 (b) 팝업을 X로 닫거나
  // handshake가 실패해 같은 인스턴스로 재오픈을 전제하는 내부 self-close 경로 둘 다에서 호출된다.
  // (b) 경로에서 handler Set을 비우면 singleton의 재등록 루프(`_transport === null`일 때만 동작)가
  // 돌지 않아 dApp 리스너가 그 페이지 세션 내내 침묵한다 — close()는 handler Set을 건드리지 않는다.
  describe('T-U-SIGNPROGRESS-CONN-10: close() 후에도 리스너가 생존한다', () => {
    interface HandlerSets {
      stateHandlers: Set<unknown>
      signProgressHandlers: Set<unknown>
    }

    it('T-U-SIGNPROGRESS-CONN-10a: close()는 stateHandlers / signProgressHandlers를 비우지 않는다', async () => {
      transport = new PopupTransport()
      const stateHandler = jest.fn<void, [TransportState]>()
      const progressHandler = jest.fn<void, [SignProgressInfo]>()
      transport.on('state', stateHandler)
      transport.on('signProgress', progressHandler)

      void transport.send(makeEnvelope('a')).catch(() => {})
      await flushHandshake()

      // eslint-disable-next-line uap/no-as-unknown-as -- private Set 필드(stateHandlers/signProgressHandlers) 직접 접근 목적, mock factory 아님(실 인스턴스 캐스팅)
      const sets = transport as unknown as HandlerSets
      expect(sets.signProgressHandlers.size).toBe(1)

      await transport.close()

      // 인스턴스가 살아있는 한(= resetSingleton 미경유) 두 Set 모두 유지되어야 한다
      expect(sets.stateHandlers.size).toBe(1)
      expect(sets.signProgressHandlers.size).toBe(1)
    })

    it('T-U-SIGNPROGRESS-CONN-10b: close() 후 재오픈해도 signProgress 리스너가 계속 발동한다', async () => {
      transport = new PopupTransport()
      const progressHandler = jest.fn<void, [SignProgressInfo]>()
      transport.on('signProgress', progressHandler)

      void transport.send(makeEnvelope('a')).catch(() => {})
      await flushHandshake()

      await transport.close()
      progressHandler.mockClear()

      // 재오픈 — close()가 handshakePromise / readyPromise / popupWindow를 리셋해두므로
      // 같은 인스턴스로 새 세션을 열 수 있다. 이때 messageListener가 다시 설치된다.
      void transport.send(makeEnvelope('b')).catch(() => {})
      await flushHandshake()

      // 새 세션의 pending id로 유효한 progress를 보낸다.
      // C1 수정 전에는 close()가 Set을 비워 여기서 리스너가 호출되지 않는 회귀가 있었다.
      dispatchResponse(DEFAULT_ORIGIN, { id: 'b', type: '_signProgress', step: 1, total: 2, role: 'payment' })

      expect(progressHandler).toHaveBeenCalledWith({ requestId: 'b', step: 1, total: 2, role: 'payment' })
    })

    it('T-U-SIGNPROGRESS-CONN-10c: close() 후 재오픈해도 state 리스너가 계속 발동한다 (대칭 회귀 가드)', async () => {
      transport = new PopupTransport()
      const stateHandler = jest.fn<void, [TransportState]>()
      transport.on('state', stateHandler)

      void transport.send(makeEnvelope('a')).catch(() => {})
      await flushHandshake()
      stateHandler.mockClear()

      await transport.close()
      // close()가 setState('disconnected')를 호출하므로 close 자체로 1회 호출된다
      expect(stateHandler.mock.calls.at(-1)?.[0]).toBe('disconnected')
      stateHandler.mockClear()

      // 재오픈 시 connected로 다시 전환되는 것을 재등록 없이 그대로 관찰할 수 있어야 한다
      void transport.send(makeEnvelope('b')).catch(() => {})
      await flushHandshake()

      expect(stateHandler.mock.calls.at(-1)?.[0]).toBe('connected')
    })
  })

  // ===== 2026-08-10: 기기 축(_deviceState) =====
  //
  // 그때까지 `state` 이벤트는 **팝업 창의 생사**만 알렸다. 팝업이 열린 채로 USB 를 뽑아도
  // 아무 신호가 안 나가서, dApp 은 "connected 하나 찍히고 그 뒤로 조용"한 것만 봤다.
  // bridge 가 `_deviceState` 를 push 하고 여기서 기기 축을 더해 **두 축 중 하나라도 바뀌면**
  // 발행한다. 1번째 인자의 의미(팝업 축)는 v1 호환 때문에 바꾸지 않는다.
  describe('T-U-DEVSTATE-01~07: 기기 축 통합 (2026-08-10)', () => {
    async function connected(): Promise<jest.Mock> {
      transport = new PopupTransport()
      const h = jest.fn()
      transport.on('state', h)
      void transport.send(makeEnvelope('a')).catch(() => {})
      await flushHandshake()
      h.mockClear() // 팝업 open 으로 인한 connected 1건 제거
      return h
    }

    it('T-U-DEVSTATE-01: 🔴 팝업은 그대로인데 기기만 연결돼도 발행된다 (이 갭이 제보의 핵심)', async () => {
      const h = await connected()
      dispatchResponse(DEFAULT_ORIGIN, {
        type: '_deviceState',
        device: 'connected',
        info: { deviceId: 'DEADBEEF0123', label: "D'CENT X", version: '2.35.1', deviceModel: 'DCENT-X', connectType: 'usb', coinCount: 42 },
      })
      expect(h).toHaveBeenCalledTimes(1)
      // 1번째 인자는 팝업 축 — 여전히 connected (의미 불변)
      expect(h.mock.calls[0][0]).toBe('connected')
      expect(h.mock.calls[0][1]).toEqual({
        popup: 'connected',
        device: 'connected',
        deviceInfo: { deviceId: 'DEADBEEF0123', label: "D'CENT X", version: '2.35.1', deviceModel: 'DCENT-X', connectType: 'usb', coinCount: 42 },
      })
    })

    it('T-U-DEVSTATE-02: 🔴 팝업이 열린 채 기기만 빠져도 발행된다 (USB 뽑기)', async () => {
      const h = await connected()
      dispatchResponse(DEFAULT_ORIGIN, { type: '_deviceState', device: 'connected', info: { label: 'X' } })
      h.mockClear()
      dispatchResponse(DEFAULT_ORIGIN, { type: '_deviceState', device: 'disconnected' })
      expect(h).toHaveBeenCalledTimes(1)
      expect(h.mock.calls[0][0]).toBe('connected') // 팝업은 살아있다
      expect(h.mock.calls[0][1].device).toBe('disconnected')
      // 빠진 기기의 정보를 남겨두지 않는다
      expect(h.mock.calls[0][1].deviceInfo).toBeUndefined()
    })

    it('T-U-DEVSTATE-03: 두 축 모두 그대로면 발행하지 않는다 (쌍 dedupe)', async () => {
      const h = await connected()
      dispatchResponse(DEFAULT_ORIGIN, { type: '_deviceState', device: 'connected', info: { label: 'X' } })
      h.mockClear()
      // 같은 상태 재통지 — 정보 필드가 달라도 축이 그대로면 리스너를 깨우지 않는다.
      dispatchResponse(DEFAULT_ORIGIN, { type: '_deviceState', device: 'connected', info: { label: 'Y' } })
      expect(h).not.toHaveBeenCalled()
    })

    it('T-U-DEVSTATE-04: 팝업이 닫히면 기기 축은 unknown 으로 되돌아간다 (disconnected 로 단정하지 않음)', async () => {
      const h = await connected()
      dispatchResponse(DEFAULT_ORIGIN, { type: '_deviceState', device: 'connected', info: { label: 'X' } })
      h.mockClear()
      await transport.close()
      expect(h).toHaveBeenCalledTimes(1) // 두 축이 함께 바뀌어도 발행은 1회
      expect(h.mock.calls[0][0]).toBe('disconnected')
      expect(h.mock.calls[0][1]).toEqual({ popup: 'disconnected', device: 'unknown', deviceInfo: undefined })
    })

    it('T-U-DEVSTATE-05: 알 수 없는 device 값은 축을 오염시키지 않는다 (boundary-validation)', async () => {
      const h = await connected()
      dispatchResponse(DEFAULT_ORIGIN, { type: '_deviceState', device: 'weird' })
      dispatchResponse(DEFAULT_ORIGIN, { type: '_deviceState' })
      expect(h).not.toHaveBeenCalled()
    })

    it('T-U-DEVSTATE-06: info 는 known-fields 만 통과한다 (dapp-input-sanitization)', async () => {
      const h = await connected()
      dispatchResponse(DEFAULT_ORIGIN, {
        type: '_deviceState',
        device: 'connected',
        info: { label: 'X', evil: 'DROP', ksm_version: 'SHOULD-NOT-PASS', state: 'initialised', connectType: 'nope', coinCount: -1 },
      })
      const detail = h.mock.calls[0][1]
      // 🔴 이름은 `getDeviceInfo()` 응답과 같아야 한다 — 두 API 를 같이 쓰는 dApp 이 어휘를 두 벌
      //    배우지 않게 하려는 것이 이 계약의 목적이라, 키 이름 자체가 회귀 대상이다.
      expect(Object.keys(detail.deviceInfo)).toEqual(['deviceId', 'label', 'version', 'deviceModel', 'connectType', 'coinCount'])
      expect(detail.deviceInfo.label).toBe('X')
      // 화이트리스트 밖 필드는 실리지 않는다.
      expect('evil' in detail.deviceInfo).toBe(false)
      // deviceId 는 이제 계약에 포함된다(2026-08-10 결정 변경) — 대신 ksm_version/state 는 여전히 제외.
      expect('ksm_version' in detail.deviceInfo).toBe(false)
      expect('state' in detail.deviceInfo).toBe(false)
      // 형식 위반 값은 undefined 로 접힌다(잘못된 값을 그대로 노출하지 않는다).
      expect(detail.deviceInfo.connectType).toBeUndefined()
      expect(detail.deviceInfo.coinCount).toBeUndefined()
    })

    it('T-U-DEVSTATE-07: detail 은 freeze 되어 dApp 이 내부 상태를 오염시킬 수 없다 (mutation-isolation)', async () => {
      const h = await connected()
      dispatchResponse(DEFAULT_ORIGIN, { type: '_deviceState', device: 'connected', info: { label: 'X' } })
      const detail = h.mock.calls[0][1]
      expect(Object.isFrozen(detail)).toBe(true)
      expect(Object.isFrozen(detail.deviceInfo)).toBe(true)
    })

    it('T-U-DEVSTATE-08: id 가 없으므로 pending 응답 매칭을 건드리지 않는다 (하위호환 축)', async () => {
      transport = new PopupTransport({ timeoutMs: 60000 })
      const p = transport.send(makeEnvelope('a'))
      await flushHandshake()
      // `_deviceState` 는 id 가 없다 — 이 메시지가 'a' 를 조기 resolve 시키면 안 된다.
      dispatchResponse(DEFAULT_ORIGIN, { type: '_deviceState', device: 'connected' })
      let settled = false
      void p.then(() => { settled = true }, () => { settled = true })
      await Promise.resolve()
      expect(settled).toBe(false)
      // 진짜 응답이 와야 resolve 된다.
      dispatchResponse(DEFAULT_ORIGIN, { id: 'a', result: { ok: true } })
      await expect(p).resolves.toEqual({ id: 'a', result: { ok: true } })
    })
  })
})
