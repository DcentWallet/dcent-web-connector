/**
 * T-E-05 — handshakeTimeoutMs가 request setTimeoutMs와 분리됨 (decoupling 계약, PR #175)
 *
 * empty.html(listener 없음)은 handshake ack가 오지 않아 handshake 단계에서 실패한다.
 * request용 setTimeoutMs를 크게(60s) 잡아도, handshake는 전용 handshakeTimeoutMs(2s)로
 * 제어되므로 ~2s에 5006으로 수렴해야 한다. setTimeoutMs가 handshake까지 지배하던
 * 구(PR #175 이전) 커플링이면 이 케이스는 60s를 기다려 spec timeout(30s)을 초과한다 →
 * 회귀 가드. (Codex 크로스 리뷰 R2 finding 반영)
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

  it('T-E-05: handshakeTimeoutMs(2000) < 큰 setTimeoutMs(60000) → 2s에 5006 (decoupling)', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({
        popUpUrl: url,
        handshakeTimeoutMs: 2000,
        readyTimeoutMs: 500,
      })
      // request timeout을 크게 잡아도 handshake 실패경로에는 영향 없어야 함 (decoupling)
      ;(window as any).dcentTest.setTimeoutMs(60000)
    }, EMPTY_URL)

    const start = Date.now()
    const result = await page.evaluate(() => {
      return (window as any).dcentTest.send({ id: 'e2e-to', method: 'getStatus', params: {} })
    })
    const elapsed = Date.now() - start

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe(5006)
    // ~2.5s(readyTimeout 0.5 + handshakeTimeout 2)에 수렴. setTimeoutMs(60000)에 커플링되면
    // 이 상한을 초과 → 회귀. (slowmo/visual overhead 흡수 위해 30s까지 허용)
    expect(elapsed).toBeGreaterThan(1500)
    expect(elapsed).toBeLessThan(30000)
  }, 30000)
})
