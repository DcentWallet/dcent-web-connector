/**
 * T-E-04 — popup 강제 close → DISCONNECTED (4900)
 *
 * puppeteer의 page.on('popup', ...) 이벤트로 sdk popup의 page handle을 capture 후
 * popup.close() 호출 → connector의 popup close 감지(500ms polling)가 작동하여
 * pending send를 ProviderError(DISCONNECTED, 4900)로 reject.
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_URL = 'http://localhost:9091/tests/unit/2_v2_e2e/harness.html'
const SDK_URL = 'http://localhost:5174/'

describe('[v2 e2e] T-E-04 popup close → DISCONNECTED', () => {
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

  it('T-E-04: popup 강제 close → result.error.code === 4900', async () => {
    await page.evaluate((url: string) => {
      ;(window as any).dcentTest.newTransport({ popUpUrl: url })
    }, SDK_URL)

    // popup capture promise — page.on('popup')은 첫 popup 발생 시 resolve
    const popupP: Promise<any> = new Promise((resolve) => {
      page.once('popup', (popup: any) => resolve(popup))
    })

    // send 시작 (popup 열림 트리거). 응답 받기 전에 popup close 예정 → reject 기대
    const resultP = page.evaluate(() => {
      return (window as any).dcentTest.send({
        id: 'e2e-pc',
        method: 'getStatus',
        params: {},
      })
    })

    // popup 핸들 확보 후 short delay (popup가 sdk listener load 정도까지) 후 close
    const popup = await popupP
    // 100ms wait 이후 close — handshake 진행 도중 강제 종료
    await new Promise((r) => setTimeout(r, 100))
    await popup.close()

    const result = await resultP
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe(4900)
  }, 30000)
})
