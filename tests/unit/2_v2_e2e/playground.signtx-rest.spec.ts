/**
 * playground.signtx-rest.spec.ts — Rest 8 family signTransaction e2e 테스트 (m06-01-04)
 *
 * puppeteer로 index-v2.html 로드 후 Rest family signTx 흐름 검증:
 * 1. 페이지 자동 로드 (chains.json + presets.evm.json + presets.non-evm.json + presets.rest.json fetch)
 * 2. Cosmos chain 노드 클릭 → preset 자동 적용 (cosmjs StdSignDoc 형식 textarea 채움)
 * 3. Send → mock dispatcher가 signTransaction request 파라미터 capture + 검증
 *
 * T-E2E-REST-01: Cosmos ATOM transfer round-trip (mock dispatcher)
 *
 * 전제조건:
 * - globalSetup이 harness server (port 9091) 구동 — playground/ 정적 자산 자동 serve
 * - mock transport (실제 디바이스 불필요)
 * - chains.json + presets.rest.json은 Plan 01에서 생성됨 (extract-chains 산출물)
 *
 * e2e-skip-triage-required 룰: 실패 시 test.skip 추가 금지 — 코드/테스트 수정으로 해결.
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_BASE = 'http://localhost:9091'
const PLAYGROUND_URL = `${HARNESS_BASE}/index-v2.html`

describe('[v2 e2e] playground signTx Rest family', () => {
  let browser: any
  let page: any

  beforeAll(async () => {
    browser = await launchBrowser()
    page = await browser.newPage()
  })

  afterAll(async () => {
    await browser.close()
  })

  // m08-01-05: Helper — inject mock dcent facade + simulateConnect
  async function setupMockTransport() {
    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      ;(window as any)._capturedRequests = []
      const mockDcent = {
        sign: (input: any) => {
          ;(window as any)._capturedRequests.push(input)
          return Promise.resolve({ header: { status: 'success' }, body: { parameter: { signedTx: 'mock-signed-cosmos-tx' } } })
        },
        getDeviceInfo: () => Promise.resolve({ header: { status: 'success' }, body: { parameter: {} } }),
        popupWindowClose: () => {},
        setConnectionListener: () => {},
      }
      api.simulateConnect(mockDcent, null, { model: 'Biometric', firmware: '3.23.0' })
    })
  }

  // ────────────────────────────────────────────────────────────────────────────
  // T-E2E-REST-01: Cosmos ATOM transfer round-trip (mock dispatcher)
  // ────────────────────────────────────────────────────────────────────────────
  it('T-E2E-REST-01: Cosmos ATOM transfer round-trip — signTransaction 파라미터 검증', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // Step 1: 페이지가 chains.json + presets.rest.json 자동 fetch 완료 대기
    // (loadChainsData가 비동기 — Cosmos 트리 노드가 등장할 때까지 polling)
    await page.waitForFunction(() => {
      return !!document.querySelector('[data-method-id^="signTx:cosmos:"]')
    }, { timeout: 5000 })

    // Step 2: Cosmos 체인 노드 존재 확인
    const cosmosNodeCount = await page.$$eval(
      '[data-method-id^="signTx:cosmos:"]',
      (nodes: Element[]) => nodes.length
    )
    expect(cosmosNodeCount).toBeGreaterThan(0)

    // Step 3: Mock transport 주입
    await setupMockTransport()

    // Step 4: Cosmos Hub 4 노드 클릭 — preset의 applicableChainIds와 정확히 매칭되는 chainId
    // (chains.json은 여러 cosmos chain 포함하지만 atom-transfer preset은 cosmoshub-4 전용)
    // m09-01-02: chains.json의 chainId는 CAIP-19 형식이므로 selector도 full CAIP-19 사용
    const cosmosSelector = 'signTx:cosmos:cosmos:cosmoshub-4/slip44:118'
    await page.waitForSelector(`[data-method-id="${cosmosSelector}"]`, { timeout: 5000 })
    await page.click(`[data-method-id="${cosmosSelector}"]`)

    // Step 5: 폼 렌더링 + preset 자동 적용 확인
    const hasKeyPath = await page.$('#field-keyPath')
    expect(hasKeyPath).not.toBeNull()
    const hasTxField = await page.$('#field-transaction')
    expect(hasTxField).not.toBeNull()

    // preset 자동 적용 — applicableChainIds가 매칭되지 않으면 family 매칭으로 fallback
    // cosmoshub-4 chain의 경우 applicableChainIds가 정확히 매칭되어 자동 채워짐
    const txValueAfterClick = await page.$eval(
      '#field-transaction',
      (el: HTMLTextAreaElement) => el.value
    )
    // applicableChainIds가 매칭되지 않더라도 family 매칭(cosmos)으로 preset 적용됨
    expect(txValueAfterClick.length).toBeGreaterThan(0)
    // valid JSON
    const txObj = JSON.parse(txValueAfterClick)
    expect(typeof txObj).toBe('object')
    expect(txObj).not.toBeNull()

    // Step 6: keyPath 입력 (자동으로 defaultKeyPath 들어가있어야 함)
    const keyPathValue = await page.$eval(
      '#field-keyPath',
      (el: HTMLInputElement) => el.value
    )
    expect(keyPathValue).toMatch(/^m\//)

    // Step 7: Send 버튼 클릭
    const sendDisabled = await page.$eval('#btn-send', (el: HTMLButtonElement) => el.disabled)
    expect(sendDisabled).toBe(false)
    await page.click('#btn-send')

    // Step 8: 응답 대기
    await new Promise((r) => setTimeout(r, 300))

    // Step 9: 전송된 요청 파라미터 검증
    const captured = await page.evaluate(() => (window as any)._capturedRequests)
    expect(captured.length).toBe(1)

    const req = captured[0]
    // m09-04-01: NEW schema — method intent literal + chainId(CAIP-19) top-level, payload는 keyPath/transaction
    expect(req.method).toBe('signTransaction')
    expect(req.chainId).toMatch(/^cosmos:.+\/slip44:\d+$/)
    expect(req.payload.keyPath).toMatch(/^m\//)
    expect(typeof req.payload.transaction).toBe('object')
    expect(req.payload.transaction).not.toBeNull()
    // payload에 chainId 키가 없어야 함 (top-level로 이동)
    expect(req.payload.chainId).toBeUndefined()

    // Step 10: 로그 엔트리 확인
    const entries = await page.evaluate(() =>
      (window as any)._playgroundTestAPI.getLogEntries()
    )
    expect(entries.length).toBeGreaterThan(0)
    const lastEntry = entries[entries.length - 1]
    expect(lastEntry.method).toBe('signTransaction')
    expect(lastEntry.error).toBeUndefined()
    expect(lastEntry.response).toBeDefined()
  }, 30000)
})
