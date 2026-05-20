/**
 * playground.envelope.test.ts — _unwrapV1Envelope helper + onConnect popup-only 회귀 테스트
 *
 * b08-01 (DC-2097): facade가 resolve로 돌려준 v1 failure envelope을 throw로 변환하고,
 * onConnect는 popup-only 진입점이 되어 state.device를 미터치하는 동작을 검증한다.
 *
 * 관련 회귀 항목:
 *   T-R-01: success envelope → body.parameter unwrap
 *   T-R-02: failure envelope → throw (err.code, err.message 보존)
 *   T-R-03: v1 특례 (transaction + user_cancel) → throw 안 함
 *   T-R-04: legacy { result } shape → 입력 그대로 반환 (boundary-validation)
 *   T-R-05: null / undefined → 입력 그대로 반환 (방어적)
 *   T-R-07: onConnect 호출 후 state.device === null
 *   T-R-08: onConnect 호출 후 state.connected === true + 버튼 토글
 */
import * as fs from 'fs'
import * as path from 'path'

// ── Playground 로드 helper ──────────────────────────────────────────────────
function loadPlayground(): void {
  const html = fs.readFileSync(
    path.resolve(__dirname, '../../../index-v2.html'),
    'utf8'
  )
  document.documentElement.innerHTML = html

  ;(window as any).PopupTransport = function (_opts: any) {
    return {
      send: jest.fn().mockResolvedValue({ id: 'stub-id', result: {} }),
      on: jest.fn(),
      off: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    }
  }
  ;(window as any).SerialRequestQueue = function (_transport: any) {
    return {
      enqueue: jest.fn(function (task: any) { return task() }),
      size: jest.fn().mockReturnValue(0),
      clear: jest.fn(),
    }
  }
  ;(window as any).ProviderError = class ProviderError extends Error {
    code: number
    constructor(code: number, message: string) {
      super(message)
      this.code = code
    }
  }

  const playgroundSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../playground.js'),
    'utf8'
  )
  // eslint-disable-next-line no-new-func
  new Function(playgroundSrc)()
}

beforeEach(() => {
  loadPlayground()
})

afterEach(() => {
  document.documentElement.innerHTML = ''
  delete (window as any)._playgroundTestAPI
  delete (window as any).PopupTransport
  delete (window as any).SerialRequestQueue
  delete (window as any).ProviderError
  delete (window as any).dcent
})

// ─────────────────────────────────────────────────────────
// T-R-01: success envelope → body.parameter unwrap
// ─────────────────────────────────────────────────────────
it('T-R-01: _unwrapV1Envelope이 success envelope에서 body.parameter를 반환한다', () => {
  const api = (window as any)._playgroundTestAPI
  expect(typeof api._unwrapV1Envelope).toBe('function')

  const envelope = {
    header: { status: 'success' },
    body: { parameter: { model: 'Biometric', firmware: '3.0.1' } },
  }
  const result = api._unwrapV1Envelope(envelope)
  expect(result).toEqual({ model: 'Biometric', firmware: '3.0.1' })
})

// ─────────────────────────────────────────────────────────
// T-R-02: failure envelope → throw (err.code, err.message 보존)
// ─────────────────────────────────────────────────────────
it('T-R-02: _unwrapV1Envelope이 failure envelope을 throw로 변환한다', () => {
  const api = (window as any)._playgroundTestAPI
  const envelope = {
    header: { status: 'failure' },
    body: { error: { code: 'X', message: 'm' } },
  }
  try {
    api._unwrapV1Envelope(envelope)
    throw new Error('expected throw')
  } catch (err: any) {
    expect(err.message).toBe('m')
    expect(err.code).toBe('X')
    expect(err.v1Envelope).toBe(envelope)
  }
})

// ─────────────────────────────────────────────────────────
// T-R-03: v1 특례 — transaction + user_cancel → throw 안 함 (호환 보존)
// ─────────────────────────────────────────────────────────
it('T-R-03: _unwrapV1Envelope이 transaction + user_cancel 특례를 보존한다', () => {
  const api = (window as any)._playgroundTestAPI
  const envelope = {
    header: { status: 'failure' },
    body: {
      command: 'transaction',
      error: { code: 'user_cancel', message: 'User cancelled' },
    },
  }
  // throw하지 않아야 함
  const result = api._unwrapV1Envelope(envelope)
  // body 자체가 반환됨 (body.parameter 없으므로)
  expect(result).toBe(envelope.body)
})

// ─────────────────────────────────────────────────────────
// T-R-04: legacy { result } shape → 입력 그대로 반환 (boundary-validation)
// ─────────────────────────────────────────────────────────
it('T-R-04: _unwrapV1Envelope이 legacy { result } shape을 그대로 반환한다', () => {
  const api = (window as any)._playgroundTestAPI
  const legacy = { result: { ok: true } }
  // header가 없으므로 envelope이 아닌 입력 — pass-through
  expect(api._unwrapV1Envelope(legacy)).toBe(legacy)

  const plain = { foo: 'bar' }
  expect(api._unwrapV1Envelope(plain)).toBe(plain)
})

// ─────────────────────────────────────────────────────────
// T-R-05: null / undefined → 입력 그대로 반환 (방어적)
// ─────────────────────────────────────────────────────────
it('T-R-05: _unwrapV1Envelope이 null / undefined 입력을 그대로 반환한다', () => {
  const api = (window as any)._playgroundTestAPI
  expect(api._unwrapV1Envelope(null)).toBeNull()
  expect(api._unwrapV1Envelope(undefined)).toBeUndefined()
  // primitive도 안전하게 pass-through
  expect(api._unwrapV1Envelope('hello')).toBe('hello')
  expect(api._unwrapV1Envelope(123)).toBe(123)
})

// ─────────────────────────────────────────────────────────
// T-R-07: onConnect 호출 후 state.device === null (popup-only)
// ─────────────────────────────────────────────────────────
it('T-R-07: onConnect 호출 후 state.device === null (popup-only — device info 미fetch)', () => {
  const api = (window as any)._playgroundTestAPI
  expect(typeof api.onConnect).toBe('function')

  // facade-shaped mock — getDeviceInfo는 호출되지 않아야 함을 검증
  const mockGetDeviceInfo = jest.fn()
  const mockDcent = {
    sign: jest.fn(),
    getDeviceInfo: mockGetDeviceInfo,
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }
  ;(window as any).dcent = mockDcent

  // 초기 상태
  expect(api.state.device).toBeNull()
  expect(api.state.connected).toBe(false)

  api.onConnect()

  // device는 미터치
  expect(api.state.device).toBeNull()
  // getDeviceInfo도 호출되지 않음 (popup-only)
  expect(mockGetDeviceInfo).not.toHaveBeenCalled()
})

// ─────────────────────────────────────────────────────────
// T-R-08: onConnect 호출 후 state.connected === true + 버튼 토글 (UX 회귀 0)
// ─────────────────────────────────────────────────────────
it('T-R-08: onConnect 호출 후 state.connected === true + 버튼 토글 (UX 회귀 0)', () => {
  const api = (window as any)._playgroundTestAPI

  const mockDcent = {
    sign: jest.fn(),
    getDeviceInfo: jest.fn(),
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }
  ;(window as any).dcent = mockDcent

  const btnConnect = document.getElementById('btn-connect') as HTMLButtonElement
  const btnDisconnect = document.getElementById('btn-disconnect') as HTMLButtonElement
  // 초기: connect 보임, disconnect 숨김
  expect(btnConnect.style.display).not.toBe('none')

  api.onConnect()

  expect(api.state.connected).toBe(true)
  expect(btnConnect.style.display).toBe('none')
  expect(btnDisconnect.style.display).toBe('')
  // setConnectionListener는 1회 등록되었어야 함
  expect(mockDcent.setConnectionListener).toHaveBeenCalledTimes(1)
})
