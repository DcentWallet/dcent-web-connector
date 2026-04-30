/**
 * T-E-06 — origin mismatch → 브라우저 postMessage targetOrigin 차단 → TIMEOUT
 *
 * `newTransport({ origin: 'https://evil.example.com' })`이면 connector가
 * popupWindow.postMessage(msg, 'https://evil.example.com')으로 송신.
 * 브라우저가 sdk popup의 실제 origin(:5174)과 불일치를 감지하여 메시지 전달을 거부 →
 * sdk가 메시지를 받지 못함 → handshake/송신 모두 timeout (5006).
 *
 * (정확히는 sdk의 silent drop이 아닌 browser-level postMessage filtering이지만,
 *  관측 가능한 결과는 동일 — connector 측에서는 응답 부재 → 5006)
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/harness.html'
const SDK_URL = 'http://localhost:5174/'

describe('[v2 e2e] T-E-06 origin mismatch → TIMEOUT', () => {
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

  it('T-E-06: 잘못된 origin → 5006 TIMEOUT', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({
        popUpUrl: url,
        origin: 'https://evil.example.com',
      })
      ;(window as any).dcentTest.setTimeoutMs(2000)
    }, SDK_URL)

    const result = await page.evaluate(() => {
      return (window as any).dcentTest.send({ id: 'e2e-or', method: 'getStatus', params: {} })
    })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe(5006)
  }, 30000)
})
