/**
 * playground.account.spec.ts — Playground v2 account/device API e2e (m11-01-01)
 *
 * index-v2.html 페이지를 puppeteer로 로드 후, _playgroundTestAPI.simulateConnect로
 * facade-shaped mock을 inject한 뒤 8개 method 각각의 form 채우기 + Send round-trip을 검증한다.
 *
 * T-E2E-01 ~ T-E2E-09 (9개)
 *
 * 전제조건:
 * - globalSetup이 harness server (port 9091) 구동 중
 * - sdk dist build 존재 (또는 mock — 본 spec은 facade를 mock으로 대체하므로 sdk 미사용)
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_BASE = 'http://localhost:9091'
const PLAYGROUND_URL = `${HARNESS_BASE}/index-v2.html`

describe('[v2 e2e] playground account/device APIs', () => {
  let browser: any
  let page: any

  beforeAll(async () => {
    browser = await launchBrowser()
    page = await browser.newPage()
  })

  afterAll(async () => {
    await browser.close()
  })

  /**
   * 각 it block 공통 셋업:
   *   - playground 로드
   *   - facade-shaped mock 주입 + spy 캡처
   *   - test가 알아서 method node click + form 입력 + Send → log assertion
   *
   * mock spies는 page에 stash해두고 page.evaluate로 검사.
   */
  async function setupPlaygroundWithSpy () {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      const calls: Array<{ method: string; args: any[] }> = []
      const stubFor = (name: string) => (...args: any[]) => {
        calls.push({ method: name, args })
        return Promise.resolve({
          header: { status: 'success', response_from: name },
          body: { parameter: { ok: true, name }, command: name },
        })
      }
      const mockDcent = {
        info: stubFor('info'),
        getDeviceInfo: stubFor('getDeviceInfo'),
        getAccountInfo: stubFor('getAccountInfo'),
        setLabel: stubFor('setLabel'),
        syncAccount: stubFor('syncAccount'),
        selectAddress: stubFor('selectAddress'),
        getAddress: stubFor('getAddress'),
        getXPUB: stubFor('getXPUB'),
        sign: stubFor('sign'),
        popupWindowClose: () => {},
        setConnectionListener: () => {},
        // expose enum for playground select rendering (subset for test)
        coinType: { ETHEREUM: 'ethereum', BITCOIN: 'bitcoin' },
      }
      ;(window as any)._mockCalls = calls
      ;(window as any)._mockDcent = mockDcent
      // ensure window.dcent exposes coinType enum for renderAccountForm select
      ;(window as any).dcent = (window as any).dcent || {}
      ;(window as any).dcent.coinType = mockDcent.coinType

      // account presets — fixture (시연용 1개로 충분)
      api.simulateAccountPresetsLoad([
        {
          id: 'syncAccount:multi',
          label: 'Multi (ETH + BTC)',
          applicableMethodIds: ['account:syncAccount'],
          value: [
            { coin_group: 'EVM', coin_name: 'ETHEREUM', label: 'ETH-1' },
            { coin_group: 'BITCOIN', coin_name: 'BITCOIN', label: 'BTC-1' },
          ],
        },
      ])

      api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })
    })
  }

  // ────────────────────────────────────────────────────────
  // T-E2E-01: method tree에 'Account / Device' 그룹 + 8개 method node 렌더링
  // ────────────────────────────────────────────────────────
  it('T-E2E-01: account method tree에 8개 method node가 모두 렌더링된다', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    const expectedIds = [
      'account:info',
      'account:getDeviceInfo',
      'account:getAccountInfo',
      'account:setLabel',
      'account:syncAccount',
      'account:selectAddress',
      'account:getAddress',
      'account:getXPUB',
    ]
    for (const id of expectedIds) {
      const sel = `[data-method-id="${id}"]`
      const handle = await page.$(sel)
      expect(handle).not.toBeNull()
    }

    // 그룹 label 확인
    const labels = await page.$$eval('.tree-group-label', (els: Element[]) =>
      els.map((e) => (e.textContent || '').trim())
    )
    expect(labels).toContain('Account / Device')
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-02: setLabel — label input → Send → mock 수신 + success log
  // ────────────────────────────────────────────────────────
  it('T-E2E-02: setLabel round-trip → mock 수신 args + success log', async () => {
    await setupPlaygroundWithSpy()

    await page.click('[data-method-id="account:setLabel"]')
    await page.type('#field-label', 'TEST-LABEL')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const calls = await page.evaluate(() => (window as any)._mockCalls)
    const setLabelCall = calls.find((c: any) => c.method === 'setLabel')
    expect(setLabelCall).toBeDefined()
    expect(setLabelCall.args[0]).toBe('TEST-LABEL')

    const entries = await page.evaluate(() =>
      (window as any)._playgroundTestAPI.getLogEntries()
    )
    const last = entries[entries.length - 1]
    expect(last.method).toBe('setLabel')
    expect(last.response).toBeDefined()
    expect(last.error).toBeUndefined()
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-03: syncAccount preset 클릭 → textarea 로드 → Send → accountInfos.length === 2
  // ────────────────────────────────────────────────────────
  it('T-E2E-03: syncAccount preset "Multi" 선택 → Send → mock 수신 accountInfos.length === 2', async () => {
    await setupPlaygroundWithSpy()

    await page.click('[data-method-id="account:syncAccount"]')
    // preset select에서 multi 선택 (HTML select element 값 변경 후 change 이벤트 dispatch)
    await page.select('#field-preset', 'syncAccount:multi')
    // textarea가 채워졌는지 확인
    const taValue = await page.$eval('#field-accountInfosJson', (el: HTMLTextAreaElement) => el.value)
    expect(taValue).toContain('coin_group')
    expect(taValue).toContain('ETHEREUM')
    expect(taValue).toContain('BITCOIN')

    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const calls = await page.evaluate(() => (window as any)._mockCalls)
    const syncCall = calls.find((c: any) => c.method === 'syncAccount')
    expect(syncCall).toBeDefined()
    expect(Array.isArray(syncCall.args[0])).toBe(true)
    expect(syncCall.args[0].length).toBe(2)
    // sanitize: known fields only
    expect(syncCall.args[0][0]).toEqual({
      coin_group: 'EVM',
      coin_name: 'ETHEREUM',
      label: 'ETH-1',
    })

    const entries = await page.evaluate(() =>
      (window as any)._playgroundTestAPI.getLogEntries()
    )
    const last = entries[entries.length - 1]
    expect(last.method).toBe('syncAccount')
    expect(last.error).toBeUndefined()
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-04: getAddress coinType/path → Send → mock 수신 + 결과 출력
  // ────────────────────────────────────────────────────────
  it('T-E2E-04: getAddress (ETHEREUM, path) → mock 수신 args + success log', async () => {
    await setupPlaygroundWithSpy()

    await page.click('[data-method-id="account:getAddress"]')
    // coinType select default 'ETHEREUM', path default fills key path
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const calls = await page.evaluate(() => (window as any)._mockCalls)
    const gaCall = calls.find((c: any) => c.method === 'getAddress')
    expect(gaCall).toBeDefined()
    // coinType enum value (lowercased — coinType.ETHEREUM === 'ethereum')
    expect(gaCall.args[0]).toBe('ethereum')
    expect(gaCall.args[1]).toBe("m/44'/60'/0'/0/0")
    // prefix is null when empty
    expect(gaCall.args[2]).toBeNull()

    const entries = await page.evaluate(() =>
      (window as any)._playgroundTestAPI.getLogEntries()
    )
    const last = entries[entries.length - 1]
    expect(last.method).toBe('getAddress')
    expect(last.error).toBeUndefined()
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-05: getXPUB — key input → Send → mock 수신
  // ────────────────────────────────────────────────────────
  it('T-E2E-05: getXPUB (key) → mock 수신 args + success log', async () => {
    await setupPlaygroundWithSpy()

    await page.click('[data-method-id="account:getXPUB"]')
    // key input default "m/44'/60'/0'", bip32name empty
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const calls = await page.evaluate(() => (window as any)._mockCalls)
    const xpubCall = calls.find((c: any) => c.method === 'getXPUB')
    expect(xpubCall).toBeDefined()
    expect(xpubCall.args[0]).toBe("m/44'/60'/0'")
    // bip32name empty → undefined (puppeteer JSON-serializes undefined as null when crossing
    // page boundary). 실제 facade call에는 undefined가 전달됨 — null 또는 undefined 모두 OK.
    expect(xpubCall.args[1] == null).toBe(true)

    const entries = await page.evaluate(() =>
      (window as any)._playgroundTestAPI.getLogEntries()
    )
    const last = entries[entries.length - 1]
    expect(last.method).toBe('getXPUB')
    expect(last.error).toBeUndefined()
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-06: selectAddress — JSON array textarea → Send → mock 수신 addresses.length === 2
  // ────────────────────────────────────────────────────────
  it('T-E2E-06: selectAddress JSON array → mock 수신 addresses.length === 2', async () => {
    await setupPlaygroundWithSpy()

    await page.click('[data-method-id="account:selectAddress"]')
    await page.type('#field-addressesJson', '["0xabc","0xdef"]')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const calls = await page.evaluate(() => (window as any)._mockCalls)
    const saCall = calls.find((c: any) => c.method === 'selectAddress')
    expect(saCall).toBeDefined()
    expect(Array.isArray(saCall.args[0])).toBe(true)
    expect(saCall.args[0]).toEqual(['0xabc', '0xdef'])

    const entries = await page.evaluate(() =>
      (window as any)._playgroundTestAPI.getLogEntries()
    )
    const last = entries[entries.length - 1]
    expect(last.method).toBe('selectAddress')
    expect(last.error).toBeUndefined()
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-07: 3 no-arg cases — info / getDeviceInfo / getAccountInfo 각각 mock 수신
  // ────────────────────────────────────────────────────────
  it('T-E2E-07: 3 no-arg (info / getDeviceInfo / getAccountInfo) → 각각 mock 수신 + log', async () => {
    await setupPlaygroundWithSpy()

    // info
    await page.click('[data-method-id="account:info"]')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 100))

    // getDeviceInfo
    await page.click('[data-method-id="account:getDeviceInfo"]')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 100))

    // getAccountInfo
    await page.click('[data-method-id="account:getAccountInfo"]')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 100))

    const calls = await page.evaluate(() => (window as any)._mockCalls)
    const names = calls.map((c: any) => c.method)
    expect(names).toContain('info')
    expect(names).toContain('getDeviceInfo')
    expect(names).toContain('getAccountInfo')

    // 각 call의 args는 빈 배열 (no-arg)
    const infoCall = calls.find((c: any) => c.method === 'info')
    expect(infoCall.args.length).toBe(0)

    const entries = await page.evaluate(() =>
      (window as any)._playgroundTestAPI.getLogEntries()
    )
    const methods = entries.map((e: any) => e.method)
    expect(methods).toContain('info')
    expect(methods).toContain('getDeviceInfo')
    expect(methods).toContain('getAccountInfo')
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-08 (negative): syncAccount 잘못된 JSON → "Invalid JSON" + facade 미호출
  // ────────────────────────────────────────────────────────
  it('T-E2E-08 (negative): syncAccount invalid JSON → error log + facade 미호출', async () => {
    await setupPlaygroundWithSpy()

    await page.click('[data-method-id="account:syncAccount"]')
    await page.type('#field-accountInfosJson', '{not valid json')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const calls = await page.evaluate(() => (window as any)._mockCalls)
    const syncCall = calls.find((c: any) => c.method === 'syncAccount')
    expect(syncCall).toBeUndefined()

    const entries = await page.evaluate(() =>
      (window as any)._playgroundTestAPI.getLogEntries()
    )
    const errEntry = entries.find(
      (e: any) => e.method === 'syncAccount' && e.error && /Invalid JSON/i.test(e.error.message || '')
    )
    expect(errEntry).toBeDefined()
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-09 (negative): setLabel 빈 label → facade dcentException → error envelope log
  //
  // facade의 isAvaliableLabel regex가 fail하면 setLabel은 **synchronously** throw한다.
  // 이번 테스트는 mock으로 facade를 대체하므로, mock의 setLabel을 일부러 reject하도록 만들어
  // playground catch → appendLog error 분기가 동작함을 검증.
  // ────────────────────────────────────────────────────────
  it('T-E2E-09 (negative): setLabel empty label (mock rejects with param_error) → error log', async () => {
    await setupPlaygroundWithSpy()

    // setLabel mock을 override — empty label이면 param_error reject
    await page.evaluate(() => {
      const md = (window as any)._mockDcent
      md.setLabel = (label: string) => {
        if (!label || label.length < 2) {
          const err: any = new Error('Invalid Label : ' + label)
          err.code = 'param_error'
          return Promise.reject(err)
        }
        return Promise.resolve({
          header: { status: 'success' },
          body: { parameter: { ok: true }, command: 'setLabel' },
        })
      }
    })

    await page.click('[data-method-id="account:setLabel"]')
    // 빈 label 그대로 Send (default 값 '')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const entries = await page.evaluate(() =>
      (window as any)._playgroundTestAPI.getLogEntries()
    )
    const errEntry = entries.find(
      (e: any) => e.method === 'setLabel' && e.error && e.error.code === 'param_error'
    )
    expect(errEntry).toBeDefined()
  }, 30000)
})
