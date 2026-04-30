/**
 * T-E-02 — protocol version mismatch
 *
 * connector가 protocolVersion='99.0'으로 핸드셰이크 보내면
 * sdk(major='2')가 PROTOCOL_VERSION_MISMATCH(5007) 에러 응답.
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/harness.html'
const SDK_URL = 'http://localhost:5174/'

describe('[v2 e2e] T-E-02 version mismatch', () => {
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

  it('T-E-02: protocolVersion 99.0 → 5007 PROTOCOL_VERSION_MISMATCH', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({ popUpUrl: url, protocolVersion: '99.0' })
    }, SDK_URL)
    await page.evaluate(() => (window as any).dcentTest.preOpenAndWait())

    const result = await page.evaluate(() => {
      return (window as any).dcentTest.send({
        id: 'e2e-vm',
        method: 'getStatus',
        params: {},
      })
    })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe(5007)
  }, 30000)
})
