/**
 * T-E-05 — setTimeoutMs override → TIMEOUT (5006)
 *
 * setTimeoutMs(2000)으로 default 60s를 단축한 뒤
 * popUpUrl을 listener 없는 빈 페이지(harness :9091/empty.html)로 향하게 하여
 * 2s 후 ProviderError(TIMEOUT, 5006)로 reject 검증.
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/harness.html'
const EMPTY_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/empty.html'

describe('[v2 e2e] T-E-05 setTimeoutMs → TIMEOUT', () => {
  let browser: any
  let page: any

  beforeAll(async () => {
    browser = await launchBrowser()
    page = await browser.newPage()
    await page.goto(HARNESS_URL)
  })

  afterAll(async () => {
    await browser.close()
  })

  afterEach(async () => {
    await page.evaluate(() => (window as any).dcentTest.close())
  })

  it('T-E-05: setTimeoutMs(2000) + empty.html → 5006 TIMEOUT', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({ popUpUrl: url })
      ;(window as any).dcentTest.setTimeoutMs(2000)
    }, EMPTY_URL)

    const start = Date.now()
    const result = await page.evaluate(() => {
      return (window as any).dcentTest.send({ id: 'e2e-to', method: 'getStatus', params: {} })
    })
    const elapsed = Date.now() - start

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe(5006)
    // 2s 부근 (1.5s ~ 5s 허용 — flake margin)
    expect(elapsed).toBeGreaterThan(1500)
    expect(elapsed).toBeLessThan(5000)
  }, 30000)
})
