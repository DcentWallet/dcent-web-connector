/**
 * T-E-03 — concurrent send → handshake 1회만 발동
 *
 * Promise.all로 동시 3개 send 호출 시 PopupTransport의 handshakePromise 공유 메커니즘이
 * 정확히 1회의 _handshake outbound postMessage만 발생시키는지 검증.
 * harness가 popupWindow.postMessage를 spy로 감싸 카운트.
 */
const puppeteer = require('puppeteer')

const HARNESS_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/harness.html'
const SDK_URL = 'http://localhost:5174/'

describe('[v2 e2e] T-E-03 concurrent send → handshake 1회', () => {
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

  it('T-E-03: 동시 3 send → handshake count === 1 + 3개 모두 echo', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({ popUpUrl: url })
    }, SDK_URL)
    await page.evaluate(() => (window as any).dcentTest.preOpenAndWait())

    const out = await page.evaluate(() => {
      return (window as any).dcentTest.sendConcurrent([
        { id: 'e2e-c1', method: 'getStatus', params: { i: 1 } },
        { id: 'e2e-c2', method: 'getStatus', params: { i: 2 } },
        { id: 'e2e-c3', method: 'getStatus', params: { i: 3 } },
      ])
    })

    expect(out.handshakeCount).toBe(1)
    expect(out.results).toHaveLength(3)
    out.results.forEach((r: any) => {
      expect(r.ok).toBe(true)
      expect(r.response.result.echo).toBe(true)
    })
  }, 30000)
})
