/**
 * T-E-07 — invalid envelope shape silent drop (popup wire 경유)
 *
 * 정상 send로 handshake 완료 + popup wire 활성 후, puppeteer가 sdk popup page에서
 * `window.opener.postMessage({ malformed: true }, '*')`로 raw invalid envelope를 inject.
 * connector listener는 boundary-validation으로 envelope shape 검증 실패 → silent drop.
 * 후속 정상 send는 영향 없이 완료되어야 함 (listener가 죽지 않음).
 *
 * sdk 코드 변경 없음 — puppeteer가 sdk popup page에서 직접 evaluate.
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/harness.html'
const SDK_URL = 'http://localhost:5174/'

describe('[v2 e2e] T-E-07 invalid envelope silent drop', () => {
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

  it('T-E-07: invalid envelope inject → silent drop, 후속 정상 send 회복', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({ popUpUrl: url })
    }, SDK_URL)

    // popup capture — preOpenAndWait이 popup 열기 직전에 setup
    const popupP: Promise<any> = new Promise((resolve) => {
      page.once('popup', (popup: any) => resolve(popup))
    })
    await page.evaluate(() => (window as any).dcentTest.preOpenAndWait())

    // 1) 정상 send 1회 (handshake 완료, popup wire 활성)
    const r1 = await page.evaluate(() => {
      return (window as any).dcentTest.send({ id: 'e2e-7a', method: 'getStatus', params: { i: 1 } })
    })
    expect(r1.ok).toBe(true)

    // 2) sdk popup page에서 raw invalid envelope inject
    const popup = await popupP
    await popup.evaluate(() => {
      // @ts-ignore - sdk popup 컨텍스트
      if (window.opener) window.opener.postMessage({ malformed: true, no_id: true }, '*')
      // @ts-ignore
      if (window.opener) window.opener.postMessage('plain-string-not-object', '*')
      // @ts-ignore
      if (window.opener) window.opener.postMessage({ id: null, result: 'wrong-id-shape' }, '*')
    })

    // 3) 잠깐 대기 (invalid drop 처리될 시간)
    await new Promise((r) => setTimeout(r, 200))

    // 4) 후속 정상 send → ok 회복 확인 (listener가 invalid에 죽지 않았음)
    const r2 = await page.evaluate(() => {
      return (window as any).dcentTest.send({ id: 'e2e-7b', method: 'getStatus', params: { i: 2 } })
    })
    expect(r2.ok).toBe(true)
    expect(r2.response.id).toBe('e2e-7b')
    expect(r2.response.result.echo).toBe(true)
  }, 30000)
})
