/**
 * T-E-08 — handshake timeout (listener 부재)
 *
 * popUpUrl을 listener 없는 빈 페이지(harness :9091/empty.html)로 향하게 하면
 * 연결된 popup에서 `_handshake` ack가 오지 않음. setTimeoutMs(3000) 후 ProviderError(TIMEOUT, 5006).
 *
 * (T-E-05와 차이: T-E-05는 send timeout 일반, T-E-08은 specifically handshake가 ack 받지 못한 경우)
 */
const puppeteer = require('puppeteer')

const HARNESS_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/harness.html'
const EMPTY_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/empty.html'

describe('[v2 e2e] T-E-08 handshake timeout', () => {
  let browser: any
  let page: any

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-popup-blocking'],
    })
    page = await browser.newPage()
    await page.goto(HARNESS_URL)
  })

  afterAll(async () => {
    await browser.close()
  })

  afterEach(async () => {
    await page.evaluate(() => (window as any).dcentTest.close())
  })

  it('T-E-08: empty.html (listener 없음) + setTimeoutMs(3000) → 5006', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({ popUpUrl: url })
      ;(window as any).dcentTest.setTimeoutMs(3000)
    }, EMPTY_URL)

    const start = Date.now()
    const result = await page.evaluate(() => {
      return (window as any).dcentTest.send({ id: 'e2e-hs-to', method: 'getStatus', params: {} })
    })
    const elapsed = Date.now() - start

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe(5006)
    // 3s 부근 (2.5s ~ 6s 허용)
    expect(elapsed).toBeGreaterThan(2500)
    expect(elapsed).toBeLessThan(6000)
  }, 30000)
})
