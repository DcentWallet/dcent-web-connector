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
// T-U-01: 트리 DOM 빌더 — TREE 선언적 객체에서 expected node 개수(getDeviceInfo 1 + signMessage 4 = 5)
// ─────────────────────────────────────────────────────────
it('T-U-01: 트리 DOM에 5개 method node가 렌더링된다', () => {
  const api = (window as any)._playgroundTestAPI
  expect(api).toBeDefined()

  // countMethodNodes: TREE 구조 순회 (DOM 상관없이 선언 카운트)
  const count = api.countMethodNodes()
  expect(count).toBe(5) // getDeviceInfo(1) + eth:personal(1) + eth:v3(1) + eth:v4(1) + sol:raw(1)

  // DOM에도 5개 .tree-item이 렌더됨
  const domItems = document.querySelectorAll('.tree-item')
  expect(domItems.length).toBe(5)
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
  expect(chainKeyPath['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']).toBe("m/44'/501'/0'/0'")
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
// ─────────────────────────────────────────────────────────
it('T-U-07: keyPath 누락 시 Send 클릭 → dispatcher 호출 0건', () => {
  const api = (window as any)._playgroundTestAPI

  // mock transport + queue
  const mockSend = jest.fn().mockResolvedValue({ id: 'x', result: {} })
  const mockEnqueue = jest.fn(function (task: any) { return task() })
  const mockTransport = { send: mockSend, on: jest.fn(), off: jest.fn(), close: jest.fn() }
  const mockQueue = { enqueue: mockEnqueue, size: jest.fn(), clear: jest.fn() }

  // signMessage:eth:personal 선택 후 connect 시뮬레이션
  const signMethodItem = document.querySelector('[data-method-id="signMessage:eth:personal"]') as HTMLElement
  signMethodItem.click()

  api.simulateConnect(mockTransport, mockQueue, { model: 'Bio', firmware: '3.0' })

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

  // dispatcher가 호출되지 않아야 함
  expect(mockEnqueue).not.toHaveBeenCalled()
})

// ─────────────────────────────────────────────────────────
// T-U-08: 에러 응답 매핑 — ProviderError throw → LogEntry.error
// ─────────────────────────────────────────────────────────
it('T-U-08: ProviderError(-32603) throw → LogEntry.error 매핑', async () => {
  const api = (window as any)._playgroundTestAPI
  api.clearLogs()

  const ProviderErrorCtor = (window as any).ProviderError
  const mockError = new ProviderErrorCtor(-32603, 'Internal error')

  const mockEnqueue = jest.fn().mockRejectedValue(mockError)
  const mockTransport = { send: jest.fn(), on: jest.fn(), off: jest.fn(), close: jest.fn() }
  const mockQueue = { enqueue: mockEnqueue, size: jest.fn(), clear: jest.fn() }

  api.simulateConnect(mockTransport, mockQueue, { model: 'Bio', firmware: '3.0' })

  // getDeviceInfo 선택
  const getDeviceItem = document.querySelector('[data-method-id="getDeviceInfo"]') as HTMLElement
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
// T-U-09: transport === null 인 동안 모든 Send 버튼 disabled (Connect 후 활성화)
// ─────────────────────────────────────────────────────────
it('T-U-09: transport null → btn-send disabled; connect 후 method 선택 시 활성화', () => {
  const api = (window as any)._playgroundTestAPI
  const btnSend = document.getElementById('btn-send') as HTMLButtonElement

  // 초기 상태: transport null
  expect(api.state.transport).toBeNull()
  expect(btnSend.disabled).toBe(true)
  expect(btnSend.getAttribute('aria-disabled')).toBe('true')

  // 메서드 선택 — 여전히 disabled (transport 없음)
  const getDeviceItem = document.querySelector('[data-method-id="getDeviceInfo"]') as HTMLElement
  getDeviceItem.click()
  expect(btnSend.disabled).toBe(true)

  // Connect 시뮬레이션
  const mockTransport = { send: jest.fn(), on: jest.fn(), off: jest.fn(), close: jest.fn() }
  const mockQueue = { enqueue: jest.fn(), size: jest.fn(), clear: jest.fn() }
  api.simulateConnect(mockTransport, mockQueue, { model: 'Bio', firmware: '3.0' })

  // Connect 후에도 method 선택 상태이므로 활성화
  expect(btnSend.disabled).toBe(false)
  expect(btnSend.getAttribute('aria-disabled')).toBe('false')

  // disconnect → 다시 disabled
  api.simulateDisconnect()
  expect(btnSend.disabled).toBe(true)
})
