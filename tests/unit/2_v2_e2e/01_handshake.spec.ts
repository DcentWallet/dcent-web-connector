/**
 * T-E-01 — handshake → echo round-trip
 *
 * connector(dist/v2) ↔ sdk(localhost:5174) 실제 popup 환경에서
 * send 첫 호출 시 자동 handshake 발동 → sdk ack → echo 응답 round-trip.
 */
const puppeteer = require('puppeteer')

const HARNESS_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/harness.html'
const SDK_URL = 'http://localhost:5174/'

describe('[v2 e2e] T-E-01 handshake → echo round-trip', () => {
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

  it('T-E-01: send getStatus → handshake auto + echo round-trip', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({ popUpUrl: url })
    }, SDK_URL)
    // sdk popup의 React listener mount 시간 보장 — race 회피
    await page.evaluate(() => (window as any).dcentTest.preOpenAndWait())

    const result = await page.evaluate(() => {
      return (window as any).dcentTest.send({
        id: 'e2e-1',
        method: 'getStatus',
        params: { foo: 1 },
      })
    })

    expect(result.ok).toBe(true)
    expect(result.response.id).toBe('e2e-1')
    expect(result.response.result).toEqual({
      method: 'getStatus',
      params: { foo: 1 },
      echo: true,
    })
  }, 30000)
})
