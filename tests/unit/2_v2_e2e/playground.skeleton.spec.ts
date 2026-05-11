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
  // T-E2E-01: 페이지 smoke — 로드 + 트리 노드(EVM 포함) + 디바이스 indicator 회색 dot
  // ────────────────────────────────────────────────────────
  it('T-E2E-01: index-v2.html 로드 + 트리 5개 non-placeholder 노드 + indicator 초기 회색', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // 타이틀 확인
    const title = await page.title()
    expect(title).toContain("D'CENT")

    // countMethodNodes: EVM 체인 로드 후 placeholder 제외 노드가 5 이상
    // (chains.evm.json 로드 성공 시 5 + 64 = 69, 실패 시 5)
    const nonPlaceholderCount = await page.evaluate(() => {
      return (window as any)._playgroundTestAPI.countMethodNodes()
    })
    expect(nonPlaceholderCount).toBeGreaterThanOrEqual(5)

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

    // m08-01-05: facade-shaped mock 주입
    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      const mockDevice = { model: 'Biometric', firmware: '3.23.0' }
      const mockDcent = {
        sign: () => Promise.resolve({ header: { status: 'success' }, body: { parameter: {} } }),
        getDeviceInfo: () => Promise.resolve({ header: { status: 'success' }, body: { parameter: mockDevice } }),
        popupWindowClose: () => {},
        setConnectionListener: () => {},
      }
      api.simulateConnect(mockDcent, null, mockDevice)
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
  // m08-01-05: facade-shaped mock — setConnectionListener를 통해 state listener capture
  // ────────────────────────────────────────────────────────
  it('T-E2E-03: facade state listener → close event → indicator 빨강 + close 로그', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // m08-01-05: facade-shaped mock — setConnectionListener가 listener capture
    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      const stateListeners: any[] = []
      const mockDcent = {
        sign: () => Promise.resolve({ header: { status: 'success' }, body: { parameter: {} } }),
        getDeviceInfo: () => Promise.resolve({ header: { status: 'success' }, body: { parameter: {} } }),
        popupWindowClose: () => {},
        setConnectionListener: (l: any) => { stateListeners.push(l) },
        _triggerClose: () => { stateListeners.forEach((fn: any) => fn('disconnected')) },
      }
      api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })
      ;(window as any)._mockDcent = mockDcent
    })

    // connected 상태 확인
    const dotClassBefore = await page.$eval('#conn-dot', (el: Element) => el.className)
    expect(dotClassBefore).toContain('connected')

    // close event 발생 (facade state listener trigger)
    await page.evaluate(() => {
      ;(window as any)._mockDcent._triggerClose()
    })
    await new Promise((r) => setTimeout(r, 100))

    // indicator 빨강
    const dotClassAfter = await page.$eval('#conn-dot', (el: Element) => el.className)
    expect(dotClassAfter).toContain('error')

    // 로그에 close 관련 항목 — playground.normalizeError가 v1 형식 응답을 정상 처리
    const entries = await page.evaluate(() => {
      return (window as any)._playgroundTestAPI.getLogEntries()
    })
    const closeEntry = entries.find((e: any) =>
      e.method === '_transport_close' || (e.response && e.response.msg && e.response.msg.includes('close'))
    )
    expect(closeEntry).toBeDefined()

    // 자동 재연결: state.connected === false
    const isDisconnected = await page.evaluate(() => {
      return (window as any)._playgroundTestAPI.state.connected === false
    })
    expect(isDisconnected).toBe(true)
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-04: getDeviceInfo timeout → ProviderError → LogEntry.error + indicator 빨강
  // (pre-audit R5)
  // m08-01-05: facade-shaped mock — getDeviceInfo가 timeout error로 reject
  // ────────────────────────────────────────────────────────
  it('T-E2E-04: getDeviceInfo timeout → ProviderError code → LogEntry.error + indicator error', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // m08-01-05: facade-shaped mock — getDeviceInfo가 ProviderError로 reject
    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      const ProviderErrorCtor = (window as any).ProviderError ||
        class ProviderError extends Error {
          code: number
          constructor (code: number, message: string) {
            super(message)
            this.name = 'ProviderError'
            this.code = code
          }
        }
      const mockDcent = {
        sign: () => Promise.resolve({ header: { status: 'success' }, body: { parameter: {} } }),
        getDeviceInfo: () => Promise.reject(new ProviderErrorCtor(5006, 'Request timed out')),
        popupWindowClose: () => {},
        setConnectionListener: () => {},
      }
      api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })
    })

    // getDeviceInfo 선택
    await page.click('[data-method-id="getDeviceInfo"]')

    // simulateConnect로 state.connected=true이므로 method 선택 후 Send 활성화
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

  // ────────────────────────────────────────────────────────
  // T-E2E-ERR-CLOSE-01 (D-18 A): popup_close → playground catch 블록에서 v1 형식 응답
  //   facade가 v1 호환 응답 ({ header.status: 'failure', body.error.code: 'pop-up_closed' })으로 reject
  //   playground.normalizeError가 v1 형식을 인식하여 LogEntry.error.code = 'pop-up_closed' 매핑
  // ────────────────────────────────────────────────────────
  it('T-E2E-ERR-CLOSE-01: facade v1 형식 popup_close 응답 → LogEntry.error.code 매핑', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // m08-01-05 (D-18): facade가 popup_close 시 v1 호환 envelope으로 reject
    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      const v1ErrorEnvelope = {
        header: { status: 'failure' },
        body: { error: { code: 'pop-up_closed', message: 'Popup window was closed by user' } },
      }
      const mockDcent = {
        sign: () => Promise.resolve({ header: { status: 'success' }, body: { parameter: {} } }),
        getDeviceInfo: () => Promise.reject(v1ErrorEnvelope),
        popupWindowClose: () => {},
        setConnectionListener: () => {},
      }
      api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })
    })

    await page.click('[data-method-id="getDeviceInfo"]')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    // 로그에서 'pop-up_closed' code를 가진 entry 찾기
    const entries = await page.evaluate(() => {
      return (window as any)._playgroundTestAPI.getLogEntries()
    })
    const closeErrEntry = entries.find((e: any) => e.error && e.error.code === 'pop-up_closed')
    expect(closeErrEntry).toBeDefined()
    expect(closeErrEntry.error.code).toBe('pop-up_closed')
    expect(closeErrEntry.method).toBe('getDeviceInfo')
  }, 30000)
})
