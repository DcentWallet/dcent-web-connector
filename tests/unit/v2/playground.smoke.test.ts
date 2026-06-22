/**
 * playground.smoke.test.ts — Playground UI 단위 테스트
 *
 * jsdom 환경에서 index-v2.html + playground.js 로드 후
 * DOM 구조 / TREE 정의 / 입력 폼 validation 동작을 검증.
 *
 * T-U-01 ~ T-U-09 (9개)
 */
import * as fs from 'fs'
import * as path from 'path'

// JSDOM은 jest.v2.config.js testEnvironment: 'jsdom'으로 설정됨

// playground.js 로드 helper: DOM을 파싱하고 스크립트 실행
function loadPlayground(): void {
  const html = fs.readFileSync(
    path.resolve(__dirname, '../../../index-v2.html'),
    'utf8'
  )
  // jsdom에 HTML 설정 (dist 로드 스크립트 제거 — 단위 테스트에서 불필요)
  document.documentElement.innerHTML = html

  // window에 stub globals (dist 번들이 없으므로 minimal stub)
  ;(window as any).PopupTransport = function (opts: any) {
    return {
      send: jest.fn().mockResolvedValue({ id: 'stub-id', result: {} }),
      on: jest.fn(),
      off: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    }
  }
  ;(window as any).SerialRequestQueue = function (transport: any) {
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

  // playground.js 실행
  const playgroundSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../playground.js'),
    'utf8'
  )
  // eslint-disable-next-line no-new-func
  new Function(playgroundSrc)()
}

// 각 테스트 전에 DOM 초기화 + playground 로드
beforeEach(() => {
  loadPlayground()
})

afterEach(() => {
  // DOM 초기화
  document.documentElement.innerHTML = ''
  delete (window as any)._playgroundTestAPI
  delete (window as any).PopupTransport
  delete (window as any).SerialRequestQueue
  delete (window as any).ProviderError
})

// ─────────────────────────────────────────────────────────
// T-U-01: 트리 DOM 빌더 — TREE 선언적 객체에서 expected node 개수
// m11-01-01: Account/Device 그룹 8 method + signMessage 4 method = 12 (기존 5에서 변경)
// ─────────────────────────────────────────────────────────
it('T-U-01: 트리 DOM에 23개 non-placeholder method node가 렌더링된다', () => {
  const api = (window as any)._playgroundTestAPI
  expect(api).toBeDefined()

  // countMethodNodes: placeholder 제외 카운트
  // m11-01-01: Account/Device(8) + signMessage(4) = 12
  // m11-01-03: Bitcoin Tx Builder(4) 추가 → 16
  // DC-2309 (b11-01): signMessage 비-EVM family 3종(sol/tron/dot) + Astar → 4→8 → 20
  // m10-01-11/12/14: signMessage Stellar(1) + signData Cardano(1) + signAuthEntry Stellar(1) → 23
  const count = api.countMethodNodes()
  expect(count).toBe(23)

  // DOM에는 placeholder 포함 24개 .tree-item (EVM 체인 로드 전 placeholder 1개 추가)
  const domItems = document.querySelectorAll('.tree-item')
  expect(domItems.length).toBe(24) // 23 non-placeholder + 1 EVM loading placeholder
})

// ─────────────────────────────────────────────────────────
// T-U-02: keyPath 검증 — valid/invalid/empty
// ─────────────────────────────────────────────────────────
it("T-U-02: m/44'/60'/0'/0/0 통과, xyz 거부, 빈 문자열 거부", () => {
  const api = (window as any)._playgroundTestAPI
  const { validateKeyPath } = api

  // valid
  expect(validateKeyPath("m/44'/60'/0'/0/0")).toBeNull()
  expect(validateKeyPath("m/44'/501'/0'/0'")).toBeNull()
  expect(validateKeyPath("m/44'/195'/0'/0/0")).toBeNull()

  // invalid
  expect(validateKeyPath('xyz')).toBeTruthy()
  expect(validateKeyPath('44/60/0/0')).toBeTruthy()   // missing 'm' prefix
  expect(validateKeyPath("M/44'/60'/0'/0/0")).toBeTruthy() // uppercase M

  // empty
  expect(validateKeyPath('')).toBeTruthy()
  expect(validateKeyPath('  ')).toBeTruthy() // whitespace after trim
})

// ─────────────────────────────────────────────────────────
// T-U-03: signMessage chainId default keyPath 매핑
// ─────────────────────────────────────────────────────────
it("T-U-03: chainId default keyPath 매핑 — eip155:1, solana mainnet", () => {
  const api = (window as any)._playgroundTestAPI
  const chainKeyPath = api.CHAIN_KEY_PATH

  expect(chainKeyPath['eip155:1']).toBe("m/44'/60'/0'/0/0")
  // m06-01-03: chains.json 통합 후 Solana keyPath는 wallet-models derivationFormat 기준 (m/44'/501'/0')
  expect(chainKeyPath['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']).toBe("m/44'/501'/0'")
})

// ─────────────────────────────────────────────────────────
// T-U-04: 로그 append + 자동 스크롤
// ─────────────────────────────────────────────────────────
it('T-U-04: 새 entry 추가 시 scrollTop이 scrollHeight로 이동', () => {
  const api = (window as any)._playgroundTestAPI
  const logScroll = document.getElementById('log-scroll') as HTMLElement

  // scrollTop 변경을 추적할 수 있도록 mock
  Object.defineProperty(logScroll, 'scrollHeight', {
    get: () => 500,
    configurable: true,
  })
  let lastScrollTop = 0
  Object.defineProperty(logScroll, 'scrollTop', {
    get: () => lastScrollTop,
    set: (v: number) => { lastScrollTop = v },
    configurable: true,
  })

  // pauseAutoScroll이 false인 상태에서 log 추가
  expect(api.getPauseAutoScroll()).toBe(false)
  api.appendLog({ method: 'test', request: {}, response: { ok: true }, latencyMs: 10 })

  expect(lastScrollTop).toBe(500) // scrollHeight와 동일
})

// ─────────────────────────────────────────────────────────
// T-U-05: Pause 토글 — 토글 ON 시 자동 스크롤 중지
// ─────────────────────────────────────────────────────────
it('T-U-05: Pause 토글 ON → 새 entry 추가 시 자동 스크롤 0', () => {
  const api = (window as any)._playgroundTestAPI
  const logScroll = document.getElementById('log-scroll') as HTMLElement

  Object.defineProperty(logScroll, 'scrollHeight', {
    get: () => 1000,
    configurable: true,
  })
  let lastScrollTop = 0
  Object.defineProperty(logScroll, 'scrollTop', {
    get: () => lastScrollTop,
    set: (v: number) => { lastScrollTop = v },
    configurable: true,
  })

  // Pause 활성화
  api.togglePause()
  expect(api.getPauseAutoScroll()).toBe(true)

  // log 추가
  api.appendLog({ method: 'test', request: {}, latencyMs: 5 })

  // scrollTop은 변경되지 않아야 함
  expect(lastScrollTop).toBe(0)
})

// ─────────────────────────────────────────────────────────
// T-U-06: Copy all JSONL 형식 — 2건 추가 후 JSON.parse 가능한 줄 2개
// ─────────────────────────────────────────────────────────
it('T-U-06: Copy all — 2건 log 후 JSONL 형식 검증', () => {
  const api = (window as any)._playgroundTestAPI
  api.clearLogs()

  api.appendLog({ method: 'getDeviceInfo', request: {}, response: { model: 'Biometric' }, latencyMs: 100 })
  api.appendLog({ method: 'signMessage', request: { chainId: 'eip155:1' }, error: { code: -32603, message: 'error' }, latencyMs: 200 })

  const entries = api.getLogEntries()
  expect(entries.length).toBe(2)

  // JSONL: 줄마다 JSON.parse 가능
  const jsonl = entries.map((e: any) => JSON.stringify(e)).join('\n')
  const lines = jsonl.split('\n')
  expect(lines.length).toBe(2)
  lines.forEach((line: string) => {
    expect(() => JSON.parse(line)).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────
// T-U-07: 입력 폼 boundary validation — keyPath 누락 시 dispatcher 호출 0건
// m08-01-05: facade-shaped mock으로 simulateConnect 호출 (state.connected만 검증)
// ─────────────────────────────────────────────────────────
it('T-U-07: keyPath 누락 시 Send 클릭 → dispatcher 호출 0건', () => {
  const api = (window as any)._playgroundTestAPI

  // m08-01-05: facade-shaped mock — sign / getDeviceInfo가 dispatcher 진입점
  const mockSign = jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } })
  const mockGetDeviceInfo = jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } })
  const mockDcent = {
    sign: mockSign,
    getDeviceInfo: mockGetDeviceInfo,
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }

  // signMessage:eth:personal 선택 후 connect 시뮬레이션
  const signMethodItem = document.querySelector('[data-method-id="signMessage:eth:personal"]') as HTMLElement
  signMethodItem.click()

  api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })

  // keyPath 필드를 비움
  const keyPathEl = document.getElementById('field-keyPath') as HTMLInputElement
  if (keyPathEl) keyPathEl.value = ''

  // message 필드 채움
  const messageEl = document.getElementById('field-message') as HTMLTextAreaElement
  if (messageEl) messageEl.value = 'Hello'

  // Send 클릭
  const btnSend = document.getElementById('btn-send') as HTMLButtonElement
  expect(btnSend.disabled).toBe(false)
  btnSend.click()

  // dispatcher (sign)가 호출되지 않아야 함 — boundary validation에서 차단됨
  expect(mockSign).not.toHaveBeenCalled()
})

// ─────────────────────────────────────────────────────────
// T-U-08: 에러 응답 매핑 — facade가 v1 형식 error로 reject → LogEntry.error
// m08-01-05: facade의 v1 호환 응답 — { header: { status: 'failure' }, body: { error: { code, message } } }
// ─────────────────────────────────────────────────────────
it('T-U-08: facade v1 형식 error → LogEntry.error 매핑', async () => {
  const api = (window as any)._playgroundTestAPI
  api.clearLogs()

  // m08-01-05: facade가 reject할 때는 보통 ProviderError이지만 v1 호환 응답으로 wrap된 형태도 가능
  // playground.normalizeError가 두 형식 모두 처리해야 함
  const v1Error = {
    body: { error: { code: -32603, message: 'Internal error' } },
    header: { status: 'failure' },
  }
  const mockGetDeviceInfo = jest.fn().mockRejectedValue(v1Error)
  const mockDcent = {
    sign: jest.fn(),
    getDeviceInfo: mockGetDeviceInfo,
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }

  api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })

  // getDeviceInfo 선택
  // m11-01-01: getDeviceInfo가 'Account / Device' 그룹으로 이동 — method id는 'account:getDeviceInfo'
  const getDeviceItem = document.querySelector('[data-method-id="account:getDeviceInfo"]') as HTMLElement
  getDeviceItem.click()

  // Send 클릭
  document.getElementById('btn-send')?.click()

  // Promise resolve 대기
  await new Promise((r) => setTimeout(r, 50))

  const entries = api.getLogEntries()
  expect(entries.length).toBeGreaterThan(0)
  const lastEntry = entries[entries.length - 1]
  expect(lastEntry.error).toBeDefined()
  expect(lastEntry.error.code).toBe(-32603)
  expect(lastEntry.error.message).toBe('Internal error')
})

// ─────────────────────────────────────────────────────────
// T-R-06 (b08-01): facade가 failure envelope을 resolve로 돌려주는 시나리오에서
// sendGetDeviceInfo 호출 → appendLog의 error 필드가 설정되고 state.device는 미오염
// ─────────────────────────────────────────────────────────
it('T-R-06: failure envelope resolve 시 error로 기록되고 state.device 미오염', async () => {
  const api = (window as any)._playgroundTestAPI
  api.clearLogs()

  // facade가 v1 failure envelope을 resolve로 돌려주는 mock (silent success 흡수 시나리오)
  const v1Failure = {
    header: { status: 'failure' },
    body: { error: { code: 'X', message: 'device is not connected' } },
  }
  const mockGetDeviceInfo = jest.fn().mockResolvedValue(v1Failure)
  const mockDcent = {
    sign: jest.fn(),
    getDeviceInfo: mockGetDeviceInfo,
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }

  // 사전: state.device를 깨끗한 상태로 만들고 connected만 true (popup-only 모델)
  api.simulateConnect(mockDcent, null, null)
  // simulateConnect 직후 device는 null
  expect(api.state.device).toBeNull()

  // getDeviceInfo 선택 후 Send
  // m11-01-01: getDeviceInfo가 'Account / Device' 그룹으로 이동 — method id는 'account:getDeviceInfo'
  const getDeviceItem = document.querySelector('[data-method-id="account:getDeviceInfo"]') as HTMLElement
  getDeviceItem.click()
  document.getElementById('btn-send')?.click()

  // Promise resolve 대기
  await new Promise((r) => setTimeout(r, 50))

  const entries = api.getLogEntries()
  expect(entries.length).toBeGreaterThan(0)
  const lastEntry = entries[entries.length - 1]
  // failure envelope이 silent success로 흡수되지 않고 error로 기록되어야 함
  expect(lastEntry.error).toBeDefined()
  expect(lastEntry.error.message).toBe('device is not connected')
  // state.device는 오염되지 않아야 함
  expect(api.state.device).toBeNull()
})

// ─────────────────────────────────────────────────────────
// T-R-09 (b08-01): onConnect → tree에서 getDeviceInfo 선택 → [Send]로 state.device가 채워짐
// E2E-style 단위 합 — onConnect는 popup-only, getDeviceInfo는 Send 경로의 단일 책임자
// ─────────────────────────────────────────────────────────
it('T-R-09: onConnect → getDeviceInfo Send 흐름에서 state.device가 채워진다', async () => {
  const api = (window as any)._playgroundTestAPI

  const deviceInfo = { model: 'Biometric', firmware: '3.0.1' }
  const mockGetDeviceInfo = jest.fn().mockResolvedValue({
    header: { status: 'success' },
    body: { parameter: deviceInfo },
  })
  const mockDcent = {
    sign: jest.fn(),
    getDeviceInfo: mockGetDeviceInfo,
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }
  ;(window as any).dcent = mockDcent

  // onConnect — popup-only (device 미터치)
  api.onConnect()
  expect(api.state.connected).toBe(true)
  expect(api.state.device).toBeNull()
  expect(mockGetDeviceInfo).not.toHaveBeenCalled()

  // 트리에서 getDeviceInfo 선택 → Send
  // m11-01-01: getDeviceInfo가 'Account / Device' 그룹으로 이동 — method id는 'account:getDeviceInfo'
  const getDeviceItem = document.querySelector('[data-method-id="account:getDeviceInfo"]') as HTMLElement
  getDeviceItem.click()
  document.getElementById('btn-send')?.click()

  // Promise resolve 대기
  await new Promise((r) => setTimeout(r, 50))

  // getDeviceInfo 단일 책임자 — Send 시점에 호출됨
  expect(mockGetDeviceInfo).toHaveBeenCalledTimes(1)
  // state.device가 채워짐
  expect(api.state.device).toEqual(deviceInfo)
})

// ─────────────────────────────────────────────────────────
// T-U-09: state.connected === false 인 동안 모든 Send 버튼 disabled (Connect 후 활성화)
// m08-01-05: state.transport → state.connected로 변경
// ─────────────────────────────────────────────────────────
it('T-U-09: not connected → btn-send disabled; connect 후 method 선택 시 활성화', () => {
  const api = (window as any)._playgroundTestAPI
  const btnSend = document.getElementById('btn-send') as HTMLButtonElement

  // 초기 상태: not connected
  expect(api.state.connected).toBe(false)
  expect(btnSend.disabled).toBe(true)
  expect(btnSend.getAttribute('aria-disabled')).toBe('true')

  // 메서드 선택 — 여전히 disabled (not connected)
  // m11-01-01: getDeviceInfo가 'Account / Device' 그룹으로 이동 — method id는 'account:getDeviceInfo'
  const getDeviceItem = document.querySelector('[data-method-id="account:getDeviceInfo"]') as HTMLElement
  getDeviceItem.click()
  expect(btnSend.disabled).toBe(true)

  // Connect 시뮬레이션 — facade-shaped mock
  const mockDcent = {
    sign: jest.fn(),
    getDeviceInfo: jest.fn(),
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }
  api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })

  // Connect 후에도 method 선택 상태이므로 활성화
  expect(btnSend.disabled).toBe(false)
  expect(btnSend.getAttribute('aria-disabled')).toBe('false')

  // disconnect → 다시 disabled
  api.simulateDisconnect()
  expect(btnSend.disabled).toBe(true)
})
