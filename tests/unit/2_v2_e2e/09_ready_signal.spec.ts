/**
 * T-E-RG — m07-02 ready signal gate (B Gate + Y Timeout fallback)
 *
 * 두 가지 시나리오 검증:
 * - T-E-RG-01: m07-01 SDK가 `_ready` 신호를 송신하면 connector가 게이트 통과 후
 *              `preOpenAndWait()` 우회 없이도 race 없이 round-trip 성공.
 *              ※ 본 테스트는 m07-01이 SDK 측에 머지되지 않은 환경에서는 Y fallback 경로로 통과한다 (조건부).
 * - T-E-RG-02: `readyTimeoutMs: 100`으로 짧게 설정한 transport — sdk가 `_ready`를 송신하지 않아도
 *              100ms 후 fallback으로 `_handshake` 송신 + ack 받고 round-trip 성공.
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/harness.html'
const SDK_URL = 'http://localhost:5174/'

describe('[v2 e2e] T-E-RG ready gate', () => {
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

  // T-E-RG-01: preOpenAndWait() 우회 제거 + (m07-01 환경에선 _ready 즉시 송신, 없으면 readyTimeout fallback)
  // 본 케이스는 m07-01 미배포 환경에서도 통과 가능 (default readyTimeoutMs=10000ms 후 fallback).
  it('T-E-RG-01: send 즉시 호출 — preOpenAndWait 없이 round-trip 성공', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({ popUpUrl: url })
    }, SDK_URL)

    // preOpenAndWait() 의도적으로 호출하지 않음 — 게이트가 race를 흡수해야 함
    const result = await page.evaluate(() => {
      return (window as any).dcentTest.send({
        id: 'e2e-rg-1',
        method: 'getStatus',
        params: { foo: 1 },
      })
    })

    expect(result.ok).toBe(true)
    expect(result.response.id).toBe('e2e-rg-1')
    expect(result.response.result).toEqual({
      method: 'getStatus',
      params: { foo: 1 },
      echo: true,
    })
  }, 30000)

  // T-E-RG-02: readyTimeoutMs 짧게 설정 → fallback 경로로 round-trip 성공
  // sdk가 _ready를 송신하지 않는 환경(현재 default — m07-01 머지 전)에서 100ms 후 즉시 handshake fallback.
  it('T-E-RG-02: readyTimeoutMs=100 → Y fallback 경로로 round-trip', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({ popUpUrl: url, readyTimeoutMs: 100 })
    }, SDK_URL)

    // popup React mount race 우회 — readyTimeoutMs는 매우 짧지만 SDK가 mount되지 않으면 handshake도 timeout
    // 따라서 preOpenAndWait()로 SDK ready를 먼저 보장
    await page.evaluate(() => (window as any).dcentTest.preOpenAndWait())

    const result = await page.evaluate(() => {
      return (window as any).dcentTest.send({
        id: 'e2e-rg-2',
        method: 'getStatus',
        params: { foo: 'bar' },
      })
    })

    expect(result.ok).toBe(true)
    expect(result.response.id).toBe('e2e-rg-2')
    expect(result.response.result).toEqual({
      method: 'getStatus',
      params: { foo: 'bar' },
      echo: true,
    })
  }, 30000)
})
