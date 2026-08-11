/**
 * T-E-08 — handshake timeout (listener 부재)
 *
 * popUpUrl을 listener 없는 빈 페이지(harness :9091/empty.html)로 향하게 하면
 * 연결된 popup에서 `_handshake` ack가 오지 않음 → handshakeTimeoutMs 만료 후
 * ProviderError(TIMEOUT, 5006).
 *
 * PR #175 decoupling: handshake ack 대기는 request timeoutMs(180s)가 아닌 전용
 * handshakeTimeoutMs로 제어된다. 따라서 이 실패경로는 newTransport에 짧은
 * handshakeTimeoutMs(+readyTimeoutMs)를 주어 빠르게 5006으로 수렴시킨다
 * (구: setTimeoutMs(3000) — decoupling 이후 setTimeoutMs는 request 경로만 조정).
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/harness.html'
const EMPTY_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/empty.html'

describe('[v2 e2e] T-E-08 handshake timeout', () => {
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

  it('T-E-08: empty.html (listener 없음) + handshakeTimeoutMs(3000) → 5006', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({
        popUpUrl: url,
        handshakeTimeoutMs: 3000,
        readyTimeoutMs: 500,
      })
    }, EMPTY_URL)

    const start = Date.now()
    const result = await page.evaluate(() => {
      return (window as any).dcentTest.send({ id: 'e2e-hs-to', method: 'getStatus', params: {} })
    })
    const elapsed = Date.now() - start

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe(5006)
    // 3s 이상 보장. 상한은 default 60s와 분리만 되면 충분 (slowmo/visual overhead 흡수)
    expect(elapsed).toBeGreaterThan(2500)
    expect(elapsed).toBeLessThan(30000)
  }, 30000)
})
