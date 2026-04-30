/**
 * PopupTransport 단위 테스트 (m02-01)
 *
 * jsdom 환경 — window.open / postMessage / addEventListener 모킹
 * T-U-01 ~ T-U-15 + T-U-08 4 subcase + T-U-09a + T-U-11 2 subcase = 21건
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

function dispatchResponse(
  origin: string,
  data: unknown,
): void {
  // jsdom의 MessageEvent constructor는 origin/source를 init dict로 받는다
  const event = new MessageEvent('message', { origin, data: data as never })
  window.dispatchEvent(event)
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
  })

  afterEach(() => {
    jest.useRealTimers()
    openSpy.mockRestore()
  })

  // ===== T-U-01: send happy path =====
  describe('T-U-01: send happy path', () => {
    it('postMessage round-trip → resolve(ResponseEnvelope) with correct result', async () => {
      transport = new PopupTransport()
      const env = makeEnvelope('req-1')

      const promise = transport.send<{ x: number }, { ok: true }>(env)

      // popup이 열렸고 postMessage 호출됨
      expect(openSpy).toHaveBeenCalledWith(DEFAULT_URL, '_blank')
      expect(mockPopup.postMessage).toHaveBeenCalledWith(env, DEFAULT_ORIGIN)

      // sdk 응답 시뮬레이션
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

      // 응답을 역순으로 도착시켜 cross-contamination 검증
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
      jest.advanceTimersByTime(29999)
      // 아직 timeout 발생 안 함

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
      const p1 = transport.send(makeEnvelope('a'))
      const p2 = transport.send(makeEnvelope('b'))

      // 사용자가 popup을 닫음
      mockPopup.closed = true

      // polling 한 번 발동 (500ms)
      jest.advanceTimersByTime(500)
      // microtask drain (close()는 async)
      await Promise.resolve()
      await Promise.resolve()

      await expect(p1).rejects.toMatchObject({ code: ErrorCode.DISCONNECTED })
      await expect(p2).rejects.toMatchObject({ code: ErrorCode.DISCONNECTED })
    })
  })

  // ===== T-U-07: origin mismatch =====
  describe('T-U-07: origin mismatch silent drop', () => {
    it('다른 origin의 메시지는 무시 — pending 영향 0', async () => {
      transport = new PopupTransport()
      const promise = transport.send(makeEnvelope('req-1'))

      // 악의적인 origin
      dispatchResponse('https://evil.example.com', { id: 'req-1', result: 'pwned' })

      // pending이 그대로 남아있음 → timeout으로 검증
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

      dispatchResponse(DEFAULT_ORIGIN, badData)

      // pending 그대로 → timeout으로 검증
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

      // 다른 id로 응답 도착
      dispatchResponse(DEFAULT_ORIGIN, { id: 'unknown-id', result: 'x' })

      // pending 그대로
      jest.advanceTimersByTime(60000)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })

      await transport.close()
    })
  })

  // ===== T-U-09a: postMessage throws =====
  describe('T-U-09a: postMessage throws', () => {
    it('postMessage 던짐 → cleanup + INTERNAL_ERROR reject', async () => {
      mockPopup.postMessage.mockImplementation(() => {
        throw new Error('cannot postMessage to closed window')
      })
      transport = new PopupTransport()

      await expect(transport.send(makeEnvelope('req-1'))).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
      })

      // pending Map은 비어 있어야 함 (cleanup 검증) — 후속 send는 정상 동작
      mockPopup.postMessage.mockImplementation(() => {})
      const p2 = transport.send(makeEnvelope('req-2'))
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

      const removeSpy = jest.spyOn(window, 'removeEventListener')

      await transport.close()

      // pending 모두 DISCONNECTED reject
      await expect(p1).rejects.toMatchObject({ code: ErrorCode.DISCONNECTED })
      await expect(p2).rejects.toMatchObject({ code: ErrorCode.DISCONNECTED })
      await expect(p3).rejects.toMatchObject({ code: ErrorCode.DISCONNECTED })

      // popup 닫힘
      expect(mockPopup.close).toHaveBeenCalled()
      // listener 해제
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

      // popup open trigger
      void transport.send(makeEnvelope('a')).catch(() => {})
      expect(handler).toHaveBeenCalledWith('connected')

      transport.off('state', handler)
      handler.mockClear()
      await transport.close()
      // off 후라 호출 안 됨
      expect(handler).not.toHaveBeenCalled()
    })

    it('T-U-11b: close() 시 disconnected emit', async () => {
      transport = new PopupTransport()
      const handler = jest.fn<void, [TransportState]>()

      void transport.send(makeEnvelope('a')).catch(() => {})
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

      expect(openSpy).toHaveBeenCalledWith(DEFAULT_URL, '_blank')
      expect(mockPopup.postMessage).toHaveBeenCalledWith(expect.any(Object), DEFAULT_ORIGIN)

      // default timeout = 60000ms
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
      const promise = transport.send(makeEnvelope('req-1'))

      expect(openSpy).toHaveBeenCalledWith('http://localhost:9090', '_blank')
      expect(mockPopup.postMessage).toHaveBeenCalledWith(expect.any(Object), 'http://localhost:9090')

      jest.advanceTimersByTime(5000)
      await expect(promise).rejects.toMatchObject({ code: ErrorCode.TIMEOUT })

      await transport.close()
    })
  })
})
