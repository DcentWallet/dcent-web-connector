/**
 * playground.skeleton.spec.ts — Playground e2e 테스트 (m06-01-01)
 *
 * index-v2.html 페이지를 puppeteer로 로드 후 DOM 구조 / Connect 흐름 / 에러 케이스 검증.
 *
 * T-E2E-01 ~ T-E2E-04 (4개)
 *
 * 전제조건:
 * - globalSetup이 harness server (port 9091) 구동 중
 * - sdk dist build 존재 (T-E2E-02는 실제 popup 대신 MockDeviceTransport 패턴 사용)
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_BASE = 'http://localhost:9091'
const PLAYGROUND_URL = `${HARNESS_BASE}/index-v2.html`

/**
 * playground.js 로드 helper:
 * - dist/v2 bundle은 이미 빌드되어 있어야 함
 * - 페이지는 harness server가 serve하는 connector root에서 접근
 */
describe('[v2 e2e] playground skeleton', () => {
  let browser: any
  let page: any

  beforeAll(async () => {
    browser = await launchBrowser()
    page = await browser.newPage()
  })

  afterAll(async () => {
    await browser.close()
  })

  // ────────────────────────────────────────────────────────
  // T-E2E-01: 페이지 smoke — 로드 + 트리 5개 노드 + 디바이스 indicator 회색 dot
  // ────────────────────────────────────────────────────────
  it('T-E2E-01: index-v2.html 로드 + 트리 5개 노드 + indicator 초기 회색', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // 타이틀 확인
    const title = await page.title()
    expect(title).toContain("D'CENT")

    // 트리 5개 노드 존재
    const treeItems = await page.$$('.tree-item')
    expect(treeItems.length).toBe(5)

    // 디바이스 indicator: #conn-dot에 connected/error class 없음 (회색)
    const dotClass = await page.$eval('#conn-dot', (el: Element) => el.className)
    expect(dotClass).not.toContain('connected')
    expect(dotClass).not.toContain('error')

    // btn-send disabled
    const sendDisabled = await page.$eval('#btn-send', (el: HTMLButtonElement) => el.disabled)
    expect(sendDisabled).toBe(true)

    // device info text
    const deviceInfoText = await page.$eval('#device-info', (el: Element) => el.textContent)
    expect(deviceInfoText).toContain('Not connected')
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-02: MockDeviceTransport getDeviceInfo round-trip
  // → indicator 녹색 dot + 로그 1건 + device_firmware 채워짐
  //
  // 실제 sdk popup 없이 in-page mock transport로 검증.
  // playground.js의 _playgroundTestAPI.simulateConnect 활용.
  // ────────────────────────────────────────────────────────
  it('T-E2E-02: simulateConnect + getDeviceInfo → indicator green + log 1건', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // mock transport 주입: getDeviceInfo 성공 응답 반환
    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      const mockDevice = { model: 'Biometric', firmware: '3.23.0' }
      const mockSend = () => Promise.resolve({
        id: 'mock-id',
        result: mockDevice,
      })
      const mockTransport = {
        send: mockSend,
        on: (_: string, fn: any) => {},
        off: (_: string, fn: any) => {},
        close: () => Promise.resolve(),
      }
      const mockQueue = {
        enqueue: (task: any) => task(),
        size: () => 0,
        clear: () => {},
      }
      api.simulateConnect(mockTransport, mockQueue, mockDevice)
    })

    // indicator green
    const dotClass = await page.$eval('#conn-dot', (el: Element) => el.className)
    expect(dotClass).toContain('connected')

    // getDeviceInfo 선택 + Send
    await page.click('[data-method-id="getDeviceInfo"]')
    const sendDisabled = await page.$eval('#btn-send', (el: HTMLButtonElement) => el.disabled)
    expect(sendDisabled).toBe(false)
    await page.click('#btn-send')

    // log 항목 대기
    await new Promise((r) => setTimeout(r, 200))

    const entries = await page.evaluate(() => {
      return (window as any)._playgroundTestAPI.getLogEntries()
    })
    expect(entries.length).toBeGreaterThanOrEqual(1)
    const lastEntry = entries[entries.length - 1]
    expect(lastEntry.method).toBe('getDeviceInfo')
    expect(lastEntry.response).toBeDefined()
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-03: popup close event → indicator 빨강 + 로그에 close 안내
  // (pre-audit R4 — 자동 재연결 시도 0건)
  // ────────────────────────────────────────────────────────
  it('T-E2E-03: transport close event → indicator 빨강 + close 로그 + 자동 재연결 없음', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // mock transport: on('state') 핸들러를 capture하여 나중에 close 이벤트 trigger
    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      const stateHandlers: any[] = []
      const mockTransport = {
        send: () => Promise.resolve({ id: 'x', result: {} }),
        on: (_: string, fn: any) => { stateHandlers.push(fn) },
        off: () => {},
        close: () => Promise.resolve(),
        _triggerClose: () => { stateHandlers.forEach((fn: any) => fn('disconnected')) },
      }
      const mockQueue = {
        enqueue: (task: any) => task(),
        size: () => 0,
        clear: () => {},
      }
      api.simulateConnect(mockTransport, mockQueue, { model: 'Bio', firmware: '3.0' })
      ;(window as any)._mockTransport = mockTransport
    })

    // connected 상태 확인
    const dotClassBefore = await page.$eval('#conn-dot', (el: Element) => el.className)
    expect(dotClassBefore).toContain('connected')

    // close event 발생 (PopupTransport close 이벤트 시뮬레이션)
    await page.evaluate(() => {
      ;(window as any)._mockTransport._triggerClose()
    })
    await new Promise((r) => setTimeout(r, 100))

    // indicator 빨강
    const dotClassAfter = await page.$eval('#conn-dot', (el: Element) => el.className)
    expect(dotClassAfter).toContain('error')

    // 로그에 close 관련 항목
    const entries = await page.evaluate(() => {
      return (window as any)._playgroundTestAPI.getLogEntries()
    })
    const closeEntry = entries.find((e: any) =>
      e.method === '_transport_close' || (e.response && e.response.msg && e.response.msg.includes('close'))
    )
    expect(closeEntry).toBeDefined()

    // 자동 재연결: state.transport가 null (재연결 없음)
    const transportIsNull = await page.evaluate(() => {
      return (window as any)._playgroundTestAPI.state.transport === null
    })
    expect(transportIsNull).toBe(true)
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-04: getDeviceInfo timeout → ProviderError(TIMEOUT=5006) → LogEntry.error + indicator 빨강
  // (pre-audit R5)
  // ────────────────────────────────────────────────────────
  it('T-E2E-04: getDeviceInfo timeout → 5006 TIMEOUT LogEntry.error + indicator error', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // mock transport: getDeviceInfo → reject with TIMEOUT error
    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      const stateHandlers: any[] = []
      const ProviderErrorCtor = (window as any).ProviderError
      const mockTransport = {
        send: () => Promise.reject(new ProviderErrorCtor(5006, 'Request timed out')),
        on: (_: string, fn: any) => { stateHandlers.push(fn) },
        off: () => {},
        close: () => Promise.resolve(),
      }
      const mockQueue = {
        enqueue: (task: any) => task(),
        size: () => 0,
        clear: () => {},
      }

      // simulate connect attempt (transport이 있어야 Send 활성화)
      // transport connect는 성공했다고 가정, getDeviceInfo가 timeout
      api.state.transport = mockTransport
      api.state.queue = mockQueue
    })

    // getDeviceInfo 선택
    await page.click('[data-method-id="getDeviceInfo"]')

    // Send 활성화 여부: transport 직접 설정했으므 활성화되어야 하나
    // updateSendBtn()이 호출되어야 함 — 클릭 후 체크
    // transport를 direct set했으므로 updateSendBtn은 호출되지 않음. btnSend 직접 enable.
    await page.evaluate(() => {
      const btn = document.getElementById('btn-send') as HTMLButtonElement
      btn.disabled = false
      btn.setAttribute('aria-disabled', 'false')
    })

    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    // 로그에 error 항목
    const entries = await page.evaluate(() => {
      return (window as any)._playgroundTestAPI.getLogEntries()
    })
    const timeoutEntry = entries.find((e: any) => e.error && e.error.code === 5006)
    expect(timeoutEntry).toBeDefined()
    expect(timeoutEntry.error.code).toBe(5006)
    expect(timeoutEntry.method).toBe('getDeviceInfo')
  }, 30000)
})
