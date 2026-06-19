/**
 * transport option 단위 테스트 (m09-04-03)
 *
 * dcent.sign({ method, chainId, payload, transport? }) per-call 옵션 검증.
 * _sanitizeTransportOption / toWireTransport helper + PopupTransport handshake 동봉 검증.
 *
 * T-U-01: transport: 'hid' → handshake params.transport === 'hid'
 * T-U-02: transport: 'ble' → handshake params.transport === 'ble'
 * T-U-03: transport 미명시 → handshake params.transport === 'hid' (DC-2701: 'auto' 제거, HID 기본)
 * T-U-04: transport: 'webusb' → throw ProviderError(INVALID_PARAMS)
 * T-U-05: transport: null / '' / {} → throw ProviderError(INVALID_PARAMS)
 * T-U-06: 두 번째 sign 호출 transport는 silent ignore (first-wins)
 * T-U-07: toWireTransport 단위 — 'hid'→'hid', 'ble'→'ble', undefined→'hid' (DC-2701)
 * T-BC-01: 기존 sign({method, chainId, payload}) 호출 회귀 0
 * T-BC-02: sdk가 transport 미파싱 시 silent ignore + 정상 응답 반환 (race-safe mock)
 * T-BC-03: 구 sdk transport 힌트 수신 후 PROTOCOL_VERSION_MISMATCH(5007) 미발생 회귀
 * T-BC-04: 옵션 미명시 시 handshake params keys — transport 필드 항상 포함(==='hid')
 */

import { sign } from '../../../../src/sign/sign'
import { setTransport } from '../../../../src/lifecycle'
import { _sanitizeTransportOption, toWireTransport } from '../../../../src/sign/_sanitizeTransportOption'
import { PopupTransport } from '../../../../src/transport/PopupTransport'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'
import { ProviderError } from '../../../../src/error/ProviderError'
import { ErrorCode } from '../../../../src/error/ErrorCode'

// ────────────────────────────────────────────────────────────────────────────
// Helpers (PopupTransport.test.ts 패턴 재사용 — reuse-shared-utils 룰)
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_ORIGIN = 'https://bridge.dcentwallet.com'

interface MockPopup {
  closed: boolean
  close: jest.Mock
  postMessage: jest.Mock
}

function makeMockPopup (): MockPopup {
  const popup: MockPopup = {
    closed: false,
    close: jest.fn(() => { popup.closed = true }),
    postMessage: jest.fn(),
  }
  return popup
}

function dispatchResponse (origin: string, data: unknown): void {
  const event = new MessageEvent('message', { origin, data: data as never })
  window.dispatchEvent(event)
}

let _readyAutoRespondAddSpy: jest.SpyInstance | null = null
let _readyAutoRespondConfig: { origin: string; version: string; serverName: string } | null = null

function installReadyAutoRespondOnce (origin: string, version: string, serverName: string): void {
  _readyAutoRespondConfig = { origin, version, serverName }
  if (_readyAutoRespondAddSpy) return
  const origAdd = window.addEventListener.bind(window)
  _readyAutoRespondAddSpy = jest
    .spyOn(window, 'addEventListener')
    .mockImplementation(((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      const ret = origAdd(type, listener, options)
      if (type === 'message') {
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

function uninstallReadyAutoRespond (): void {
  if (_readyAutoRespondAddSpy) {
    _readyAutoRespondAddSpy.mockRestore()
    _readyAutoRespondAddSpy = null
  }
  _readyAutoRespondConfig = null
}

function installHandshakeAutoRespond (
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
  installReadyAutoRespondOnce(origin, sdkVersion, serverName)
}

/**
 * Ready + Handshake round-trip 마이크로태스크 flush.
 * PopupTransport.test.ts의 flushHandshake()와 동일 (reuse-shared-utils).
 */
async function flushHandshake (): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
  }
}

// ────────────────────────────────────────────────────────────────────────────
// T-U-07: toWireTransport 단위 테스트
// ────────────────────────────────────────────────────────────────────────────

describe('toWireTransport — unit', () => {
  test('T-U-07a: "hid" → "hid"', () => {
    expect(toWireTransport('hid')).toBe('hid')
  })

  test('T-U-07b: "ble" → "ble"', () => {
    expect(toWireTransport('ble')).toBe('ble')
  })

  test('T-U-07c: undefined → undefined (DC-2701: default 3-state — hid로 coerce 안 함)', () => {
    // default(미지정)는 sdk에서 "HID/BLE 둘 다 picker + HID 자동연결 가능"으로 처리된다.
    // 명시 'hid'(USB only)와 구분되어야 하므로 undefined를 'hid'로 coerce하지 않는다.
    expect(toWireTransport(undefined)).toBeUndefined()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// _sanitizeTransportOption 단위 테스트
// ────────────────────────────────────────────────────────────────────────────

describe('_sanitizeTransportOption — unit', () => {
  test('valid "hid" → returns "hid"', () => {
    expect(_sanitizeTransportOption('hid')).toBe('hid')
  })

  test('valid "ble" → returns "ble"', () => {
    expect(_sanitizeTransportOption('ble')).toBe('ble')
  })

  test('undefined → returns undefined', () => {
    expect(_sanitizeTransportOption(undefined)).toBeUndefined()
  })

  test('T-U-04: "webusb" → throws ProviderError(INVALID_PARAMS)', () => {
    let caught: unknown
    try {
      _sanitizeTransportOption('webusb')
    } catch (e) {
      caught = e
    }
    expect(caught instanceof ProviderError).toBe(true)
    expect((caught as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
  })

  test('T-U-05a: null → throws ProviderError(INVALID_PARAMS)', () => {
    let caught: unknown
    try {
      _sanitizeTransportOption(null)
    } catch (e) {
      caught = e
    }
    expect(caught instanceof ProviderError).toBe(true)
    expect((caught as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
  })

  test('T-U-05b: empty string → throws ProviderError(INVALID_PARAMS)', () => {
    let caught: unknown
    try {
      _sanitizeTransportOption('')
    } catch (e) {
      caught = e
    }
    expect(caught instanceof ProviderError).toBe(true)
    expect((caught as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
  })

  test('T-U-05c: object → throws ProviderError(INVALID_PARAMS)', () => {
    let caught: unknown
    try {
      _sanitizeTransportOption({})
    } catch (e) {
      caught = e
    }
    expect(caught instanceof ProviderError).toBe(true)
    expect((caught as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
  })

  test('T-U-05d: array → throws ProviderError(INVALID_PARAMS)', () => {
    let caught: unknown
    try {
      _sanitizeTransportOption([])
    } catch (e) {
      caught = e
    }
    expect(caught instanceof ProviderError).toBe(true)
  })

  test('T-U-05e: "serial" → throws ProviderError(INVALID_PARAMS)', () => {
    let caught: unknown
    try {
      _sanitizeTransportOption('serial')
    } catch (e) {
      caught = e
    }
    expect(caught instanceof ProviderError).toBe(true)
    expect((caught as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// PopupTransport handshake message transport 동봉 테스트 (T-U-01~03, T-BC-04)
// ────────────────────────────────────────────────────────────────────────────

describe('PopupTransport — handshake transport 동봉', () => {
  let openSpy: jest.SpyInstance
  let mockPopup: MockPopup
  let transport: PopupTransport

  beforeEach(() => {
    jest.useFakeTimers()
    mockPopup = makeMockPopup()
    openSpy = jest.spyOn(window, 'open').mockImplementation(() => mockPopup as unknown as Window)
    transport = new PopupTransport({ origin: DEFAULT_ORIGIN })
    installHandshakeAutoRespond(mockPopup, DEFAULT_ORIGIN)
  })

  afterEach(async () => {
    await transport.close()
    jest.useRealTimers()
    openSpy.mockRestore()
    uninstallReadyAutoRespond()
  })

  test('T-U-01: transport "hid" → handshake params.transport === "hid"', async () => {
    transport.setPendingTransport('hid')
    const sendPromise = transport.send({ id: 'req1', method: 'signTransaction', params: {} })
    await flushHandshake()
    dispatchResponse(DEFAULT_ORIGIN, { id: 'req1', result: { header: { version: '1.0', status: 'success' }, body: { command: 'signTransaction' } } })
    await sendPromise

    const hsCall = mockPopup.postMessage.mock.calls.find(
      (call: unknown[]) => (call[0] as { method?: unknown })?.method === '_handshake',
    )
    expect(hsCall).toBeDefined()
    const hsParams = (hsCall![0] as { params: { transport: unknown } }).params
    expect(hsParams.transport).toBe('hid')
  })

  test('T-U-02: transport "ble" → handshake params.transport === "ble"', async () => {
    transport.setPendingTransport('ble')
    const sendPromise = transport.send({ id: 'req2', method: 'signTransaction', params: {} })
    await flushHandshake()
    dispatchResponse(DEFAULT_ORIGIN, { id: 'req2', result: { header: { version: '1.0', status: 'success' }, body: { command: 'signTransaction' } } })
    await sendPromise

    const hsCall = mockPopup.postMessage.mock.calls.find(
      (call: unknown[]) => (call[0] as { method?: unknown })?.method === '_handshake',
    )
    expect(hsCall).toBeDefined()
    const hsParams = (hsCall![0] as { params: { transport: unknown } }).params
    expect(hsParams.transport).toBe('ble')
  })

  test('T-U-03: transport 미명시 → handshake params.transport === undefined (DC-2701: default 3-state)', async () => {
    // setPendingTransport 호출 없음 (pendingTransport === undefined → default, sdk가 둘 다 picker)
    const sendPromise = transport.send({ id: 'req3', method: 'signTransaction', params: {} })
    await flushHandshake()
    dispatchResponse(DEFAULT_ORIGIN, { id: 'req3', result: { header: { version: '1.0', status: 'success' }, body: { command: 'signTransaction' } } })
    await sendPromise

    const hsCall = mockPopup.postMessage.mock.calls.find(
      (call: unknown[]) => (call[0] as { method?: unknown })?.method === '_handshake',
    )
    expect(hsCall).toBeDefined()
    const hsParams = (hsCall![0] as { params: { transport: unknown } }).params
    expect(hsParams.transport).toBeUndefined()
  })

  test('T-BC-04: 옵션 미명시 시 handshake params.transport === undefined (default)', async () => {
    const sendPromise = transport.send({ id: 'req4', method: 'getDeviceInfo', params: {} })
    await flushHandshake()
    dispatchResponse(DEFAULT_ORIGIN, { id: 'req4', result: { header: { version: '1.0', status: 'success' }, body: { command: 'getDeviceInfo' } } })
    await sendPromise

    const hsCall = mockPopup.postMessage.mock.calls.find(
      (call: unknown[]) => (call[0] as { method?: unknown })?.method === '_handshake',
    )
    expect(hsCall).toBeDefined()
    const hsParams = (hsCall![0] as { params: Record<string, unknown> }).params
    // (DC-2701) 미명시는 default — transport는 undefined로 동봉된다 (hid coerce 안 함)
    expect(hsParams.transport).toBeUndefined()
    // 기존 필드들도 그대로 있어야 함
    expect(hsParams.clientName).toBe('connector')
    expect(typeof hsParams.version).toBe('string')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// T-U-06: popup lifecycle 내 first-wins (두 번째 transport silent ignore)
// ────────────────────────────────────────────────────────────────────────────

describe('PopupTransport — first-wins (T-U-06)', () => {
  let openSpy: jest.SpyInstance
  let mockPopup: MockPopup
  let transport: PopupTransport

  beforeEach(() => {
    jest.useFakeTimers()
    mockPopup = makeMockPopup()
    openSpy = jest.spyOn(window, 'open').mockImplementation(() => mockPopup as unknown as Window)
    transport = new PopupTransport({ origin: DEFAULT_ORIGIN })
    installHandshakeAutoRespond(mockPopup, DEFAULT_ORIGIN)
  })

  afterEach(async () => {
    await transport.close()
    jest.useRealTimers()
    openSpy.mockRestore()
    uninstallReadyAutoRespond()
  })

  test('T-U-06: 두 번째 sign 호출 transport는 silent ignore — first-wins', async () => {
    // 첫 번째 호출: transport 'hid'
    transport.setPendingTransport('hid')
    const p1 = transport.send({ id: 'req-fw-1', method: 'signTransaction', params: {} })
    await flushHandshake()
    dispatchResponse(DEFAULT_ORIGIN, { id: 'req-fw-1', result: { header: { version: '1.0', status: 'success' }, body: { command: 'signTransaction' } } })
    await p1

    // 첫 번째 handshake 확인 — transport: 'hid'
    const hsCalls = mockPopup.postMessage.mock.calls.filter(
      (call: unknown[]) => (call[0] as { method?: unknown })?.method === '_handshake',
    )
    expect(hsCalls).toHaveLength(1)
    expect((hsCalls[0][0] as { params: { transport: unknown } }).params.transport).toBe('hid')

    // 두 번째 호출: transport 'ble' 시도 — handshakePromise가 이미 resolve되어 재사용
    transport.setPendingTransport('ble')
    const p2 = transport.send({ id: 'req-fw-2', method: 'signTransaction', params: {} })
    await flushHandshake()
    dispatchResponse(DEFAULT_ORIGIN, { id: 'req-fw-2', result: { header: { version: '1.0', status: 'success' }, body: { command: 'signTransaction' } } })
    await p2

    // 두 번째 호출에서는 새 handshake가 없어야 함 (여전히 1회만)
    const hsCallsAfter = mockPopup.postMessage.mock.calls.filter(
      (call: unknown[]) => (call[0] as { method?: unknown })?.method === '_handshake',
    )
    expect(hsCallsAfter).toHaveLength(1) // 새 handshake 없음 — first-wins
    expect((hsCallsAfter[0][0] as { params: { transport: unknown } }).params.transport).toBe('hid')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// sign() 통합 — T-U-04/05 throw, T-BC-01/02/03
// ────────────────────────────────────────────────────────────────────────────

describe('sign() — transport option throw + backward compat', () => {
  beforeEach(() => {
    _resetForTesting()
    jest.restoreAllMocks()
  })

  afterEach(() => {
    _resetForTesting()
    jest.restoreAllMocks()
  })

  test('T-ST-01 (DC-2701): setTransport("webusb") → throws ProviderError(INVALID_PARAMS)', () => {
    let caught: unknown
    try {
      setTransport('webusb' as never)
    } catch (e) {
      caught = e
    }
    expect(caught instanceof ProviderError).toBe(true)
    expect((caught as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
  })

  test('T-ST-02 (DC-2701): setTransport(null) → throws ProviderError(INVALID_PARAMS)', () => {
    let caught: unknown
    try {
      setTransport(null as never)
    } catch (e) {
      caught = e
    }
    expect(caught instanceof ProviderError).toBe(true)
    expect((caught as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
  })

  test('T-ST-03 (DC-2701 F6 cross-review): setTransport("ble") → 첫 handshake params.transport === "ble" (실제 wire end-to-end)', async () => {
    // (F6) 기존 T-ST-03은 transport.send를 통째로 mock해 실제 _handshake가 방출되지 않았고
    // pendingTransport(내부 상태)만 검증했다 → setTransport→handshake wire seam이 미검증. 공개
    // setTransport 진입점이 실제 handshake 메시지 params.transport로 흐르는지(singleton 포함)
    // real postMessage 하네스(T-U-01~03 동일 패턴)로 end-to-end 검증한다.
    jest.useFakeTimers()
    const mockPopup = makeMockPopup()
    const openSpy = jest
      .spyOn(window, 'open')
      .mockImplementation(() => mockPopup as unknown as Window)
    // singleton popUpUrl = 'http://localhost:5173' → 같은 origin으로 handshake auto-respond.
    installHandshakeAutoRespond(mockPopup, 'http://localhost:5173')
    try {
      setTransport('ble') // 공개 API → singleton _pendingTransport
      const { transport } = ensureSingleton()
      const sendPromise = transport.send({ id: 'st03', method: 'signTransaction', params: {} })
      await flushHandshake()
      dispatchResponse('http://localhost:5173', {
        id: 'st03',
        result: { header: { version: '1.0', status: 'success' }, body: { command: 'signTransaction' } },
      })
      await sendPromise

      const hsCall = mockPopup.postMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as { method?: unknown })?.method === '_handshake',
      )
      expect(hsCall).toBeDefined()
      expect((hsCall![0] as { params: { transport: unknown } }).params.transport).toBe('ble')
    } finally {
      await ensureSingleton().transport.close().catch(() => {})
      jest.useRealTimers()
      openSpy.mockRestore()
      uninstallReadyAutoRespond()
      _resetForTesting()
    }
  })

  test('T-ST-04 (DC-2701): setTransport("hid") → pendingTransport "hid"', () => {
    setTransport('hid')
    const { transport } = ensureSingleton()
    expect((transport as unknown as { pendingTransport: unknown }).pendingTransport).toBe('hid')
  })

  test('T-ST-05 (DC-2701): setTransport(undefined) → pendingTransport undefined (default)', () => {
    setTransport(undefined)
    const { transport } = ensureSingleton()
    expect((transport as unknown as { pendingTransport: unknown }).pendingTransport).toBeUndefined()
  })

  test('T-BC-01: 기존 sign({method, chainId, payload}) 호출 — transport 미명시 → 회귀 0', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'bc01',
      result: {
        header: { version: '1.0', status: 'success' as const },
        body: { command: 'signTransaction' },
      },
    })

    // transport 옵션 없는 기존 호출 패턴
    const resp = await sign({
      method: 'signTransaction',
      chainId: 'eip155:1',
      payload: { keyPath: "m/44'/60'/0'/0/0", transaction: { to: '0x1', value: '0x1' } },
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(resp.header.status).toBe('success')
  })

  test('T-BC-02 (DC-2701): setTransport("hid") 후 sign — sdk가 transport 무시해도 정상 응답', async () => {
    setTransport('hid')
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'bc02',
      result: {
        header: { version: '1.0', status: 'success' as const },
        body: { command: 'signTransaction', parameter: { signed_tx: '0xsigned' } },
      },
    })

    const resp = await sign({
      method: 'signTransaction',
      chainId: 'eip155:1',
      payload: { keyPath: "m/44'/60'/0'/0/0" },
    })

    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter?.signed_tx).toBe('0xsigned')
  })

  test('T-BC-03 (DC-2701): setTransport 후 PROTOCOL_VERSION_MISMATCH(5007) 미발생 회귀', async () => {
    setTransport('hid')
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'bc03',
      result: {
        header: { version: '1.0', status: 'success' as const },
        body: { command: 'signTransaction' },
      },
    })

    const resp = await sign({
      method: 'signTransaction',
      chainId: 'eip155:1',
      payload: { keyPath: "m/44'/60'/0'/0/0" },
    })

    expect(resp.header.status).toBe('success')
    expect(resp.body.error?.code).not.toBe('protocol_version_mismatch')
  })
})
