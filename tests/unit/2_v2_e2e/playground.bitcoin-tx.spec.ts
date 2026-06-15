/**
 * playground.bitcoin-tx.spec.ts — Playground v2 Bitcoin Tx Builder e2e (m11-01-03)
 *
 * index-v2.html 페이지를 puppeteer로 로드 후, _playgroundTestAPI.simulateConnect로
 * facade-shaped mock을 inject하고, 4개 builder method node + buildAndSign 흐름을 검증한다.
 *
 * T-E2E-01 ~ T-E2E-07 (7개)
 *
 * 전제조건:
 * - globalSetup이 harness server (port 9091) 구동 중
 * - 본 spec은 facade를 mock으로 대체하므로 sdk 미사용
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_BASE = 'http://localhost:9091'
const PLAYGROUND_URL = `${HARNESS_BASE}/index-v2.html`

describe('[v2 e2e] playground bitcoin tx builder', () => {
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
   *   - bitcoin tx state reset
   *
   * builder 호출(getBitcoinTransactionObject / addInput / addOutput)은 동기 facade 함수이고
   * mock에서는 v1 nested envelope shape의 빈 객체를 반환한다.
   * sign은 async — mock이 success envelope을 반환한다.
   */
  async function setupPlaygroundWithSpy () {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      const calls: Array<{ method: string; args: any[] }> = []

      // m09-04-15: builder가 v2 flat wire(BitcoinWireTransaction = {inputs[],outputs[]})를 직접 생성.
      // mock도 실 builder의 flat 매핑을 미러 (별도 변환 함수 없음).
      const mockDcent = {
        getBitcoinTransactionObject: (coinType: string) => {
          calls.push({ method: 'getBitcoinTransactionObject', args: [coinType] })
          return { inputs: [], outputs: [] } as any
        },
        addBitcoinTransactionInput: (tx: any, prevTx: string, utxoIdx: number, type: string, key: string) => {
          calls.push({ method: 'addBitcoinTransactionInput', args: [tx, prevTx, utxoIdx, type, key] })
          tx.inputs.push({ rawTransaction: prevTx, index: utxoIdx, txType: type, keyPath: key })
          return tx
        },
        addBitcoinTransactionOutput: (tx: any, type: string, value: any, to: string) => {
          calls.push({ method: 'addBitcoinTransactionOutput', args: [tx, type, value, to] })
          tx.outputs.push({ txType: type, amount: String(value), addresses: [to] })
          return tx
        },
        sign: (input: any) => {
          calls.push({ method: 'sign', args: [input] })
          return Promise.resolve({
            header: { status: 'success', response_from: 'sign' },
            body: { parameter: { ok: true, signed: true }, command: 'signTransaction' },
          })
        },
        popupWindowClose: () => {},
        setConnectionListener: () => {},
        // expose enum for renderBitcoinTxBuilderForm — keys must match isBitcoinTxCoinType whitelist
        coinType: {
          BITCOIN: 'bitcoin',
          BITCOIN_TESTNET: 'bitcoin_testnet',
          MONACOIN: 'monacoin',
          MONACOIN_TESTNET: 'monacoin_testnet',
        },
      }
      ;(window as any)._mockCalls = calls
      ;(window as any)._mockDcent = mockDcent
      ;(window as any).dcent = (window as any).dcent || {}
      ;(window as any).dcent.coinType = mockDcent.coinType

      // bitcoin tx preset — fixture
      api.simulateBitcoinTxPresetsLoad([
        {
          id: 'btx:p2wpkh-single',
          label: 'Bitcoin P2WPKH single',
          applicableMethodIds: ['btx:new', 'btx:addInput', 'btx:addOutput', 'btx:buildAndSign'],
          coinType: 'BITCOIN',
          chainId: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
          keyPath: "m/84'/0'/0'/0/0",
          input: {
            prev_tx: '0200000000010178ac6f1c1f8e7d4a',
            utxo_idx: 0,
            type: 'p2wpkh',
            key: "m/84'/0'/0'/0/0",
          },
          output: {
            type: 'p2wpkh',
            value: '200000',
            to: 'bc1qu3ej6dwk0lhftmnxgejat42knt0e2lw5n2lvrt',
          },
        },
      ])

      // reset any accumulated bitcoin tx state
      api.resetBitcoinTxState()

      api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })
    })
  }

  // ────────────────────────────────────────────────────────
  // T-E2E-01: 'Bitcoin Tx Builder' 그룹 + 4 method node 렌더링
  // ────────────────────────────────────────────────────────
  it('T-E2E-01: Bitcoin Tx Builder 그룹 + 4 method node 렌더링', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    const expectedIds = ['btx:new', 'btx:addInput', 'btx:addOutput', 'btx:buildAndSign']
    for (const id of expectedIds) {
      const sel = `[data-method-id="${id}"]`
      const handle = await page.$(sel)
      expect(handle).not.toBeNull()
    }

    // 그룹 label 확인
    const labels = await page.$$eval('.tree-group-label', (els: Element[]) =>
      els.map((e) => (e.textContent || '').trim())
    )
    expect(labels).toContain('Bitcoin Tx Builder')
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-02: btx:new → state.bitcoinTx.current 생성, "0 inputs / 0 outputs" 표시
  // ────────────────────────────────────────────────────────
  it('T-E2E-02: btx:new → tx 생성 + state 0/0 표시', async () => {
    await setupPlaygroundWithSpy()

    await page.click('[data-method-id="btx:new"]')
    // default coinType BITCOIN, default chainId
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const calls = await page.evaluate(() => (window as any)._mockCalls as any[])
    const newCall = calls.find((c) => c.method === 'getBitcoinTransactionObject')
    expect(newCall).toBeDefined()
    // facade는 coinType enum value(소문자) 전달
    expect(newCall.args[0]).toBe('bitcoin')

    const btxState = await page.evaluate(() => (window as any)._playgroundTestAPI.getBitcoinTxState())
    expect(btxState.current).not.toBeNull()
    expect(btxState.inputs).toBe(0)
    expect(btxState.outputs).toBe(0)
    expect(btxState.coinType).toBe('BITCOIN')

    // state note text 확인 (re-select method to re-render note from current state)
    await page.click('[data-method-id="btx:new"]')
    const noteText = await page.$eval('#btx-state-note', (el: HTMLElement) => el.textContent)
    expect(noteText).toContain('0 inputs')
    expect(noteText).toContain('0 outputs')
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-03: btx:addInput → inputs=1, current.inputs.length === 1 (flat)
  // ────────────────────────────────────────────────────────
  it('T-E2E-03: btx:addInput → inputs=1', async () => {
    await setupPlaygroundWithSpy()

    // tx 생성 먼저
    await page.click('[data-method-id="btx:new"]')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 150))

    // addInput
    await page.click('[data-method-id="btx:addInput"]')
    await page.type('#field-prevTx', '0200000000010178ac6f1c')
    // utxoIdx default '0', type default 'p2wpkh', inputKey default "m/84'/0'/0'/0/0"
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const calls = await page.evaluate(() => (window as any)._mockCalls as any[])
    const addInputCalls = calls.filter((c) => c.method === 'addBitcoinTransactionInput')
    expect(addInputCalls.length).toBe(1)
    expect(addInputCalls[0].args[1]).toBe('0200000000010178ac6f1c') // prevTx
    expect(addInputCalls[0].args[2]).toBe(0) // utxoIdx
    expect(addInputCalls[0].args[3]).toBe('p2wpkh') // type
    expect(addInputCalls[0].args[4]).toBe("m/84'/0'/0'/0/0") // key

    const btxState = await page.evaluate(() => (window as any)._playgroundTestAPI.getBitcoinTxState())
    expect(btxState.inputs).toBe(1)
    // m09-04-15: builder가 flat wire 직접 생성 — current는 {inputs[],outputs[]} (nested 아님)
    expect(btxState.current.inputs.length).toBe(1)
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-04: btx:addOutput → outputs=1
  // ────────────────────────────────────────────────────────
  it('T-E2E-04: btx:addOutput → outputs=1', async () => {
    await setupPlaygroundWithSpy()

    // tx 생성 먼저
    await page.click('[data-method-id="btx:new"]')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 150))

    // addOutput
    await page.click('[data-method-id="btx:addOutput"]')
    // outputType default 'p2wpkh', need value + to
    await page.type('#field-outputValue', '200000')
    await page.type('#field-outputTo', 'bc1qu3ej6dwk0lhftmnxgejat42knt0e2lw5n2lvrt')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const calls = await page.evaluate(() => (window as any)._mockCalls as any[])
    const addOutputCalls = calls.filter((c) => c.method === 'addBitcoinTransactionOutput')
    expect(addOutputCalls.length).toBe(1)
    expect(addOutputCalls[0].args[1]).toBe('p2wpkh') // type
    expect(addOutputCalls[0].args[2]).toBe('200000') // value
    expect(addOutputCalls[0].args[3]).toBe('bc1qu3ej6dwk0lhftmnxgejat42knt0e2lw5n2lvrt') // to

    const btxState = await page.evaluate(() => (window as any)._playgroundTestAPI.getBitcoinTxState())
    expect(btxState.outputs).toBe(1)
    // m09-04-15: flat wire — current.outputs (nested parameter.output 아님)
    expect(btxState.current.outputs.length).toBe(1)
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-05: btx:buildAndSign → mock sign 수신 NEW schema {method, chainId, payload} → success log
  // ────────────────────────────────────────────────────────
  it('T-E2E-05: btx:buildAndSign → NEW schema sign 수신 + success log', async () => {
    await setupPlaygroundWithSpy()

    // 풀 시퀀스: new → addInput → addOutput → buildAndSign
    await page.click('[data-method-id="btx:new"]')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 150))

    await page.click('[data-method-id="btx:addInput"]')
    await page.type('#field-prevTx', '0200000000010178ac6f1c')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 150))

    await page.click('[data-method-id="btx:addOutput"]')
    await page.type('#field-outputValue', '200000')
    await page.type('#field-outputTo', 'bc1qu3ej6dwk0lhftmnxgejat42knt0e2lw5n2lvrt')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 150))

    // buildAndSign
    await page.click('[data-method-id="btx:buildAndSign"]')
    // default chainId / keyPath
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 300))

    const calls = await page.evaluate(() => (window as any)._mockCalls as any[])
    const signCall = calls.find((c) => c.method === 'sign')
    expect(signCall).toBeDefined()
    // NEW schema {method, chainId, payload} — m09-04-01/DC-2221 회귀 가드
    const signArg: any = signCall.args[0]
    expect(signArg.method).toBe('signTransaction')
    expect(signArg.chainId).toBe('bip122:000000000019d6689c085ae165831e93/slip44:0')
    expect(signArg.payload).toBeDefined()
    expect(signArg.payload.keyPath).toBe("m/84'/0'/0'/0/0")
    expect(signArg.payload.transaction).toBeDefined()
    // m09-04-15: builder가 flat wire를 직접 생성하여 변환 없이 송신. payload.transaction은
    // flat {inputs[],outputs[]} (nested request.body.parameter 아님).
    expect(signArg.payload.transaction.inputs.length).toBe(1)
    expect(signArg.payload.transaction.outputs.length).toBe(1)
    // nested v1 envelope 잔재 금지 — flat wire만 송신
    expect(signArg.payload.transaction.request).toBeUndefined()
    expect(signArg.payload.transaction.inputs[0].rawTransaction).toBeDefined()
    // OLD shape 절대 금지 (DC-2221)
    expect(signArg.chain).toBeUndefined()

    const entries = await page.evaluate(() =>
      (window as any)._playgroundTestAPI.getLogEntries()
    )
    const successEntry = entries.find(
      (e: any) => e.method === 'signTransaction' && e.response && !e.error
    )
    expect(successEntry).toBeDefined()
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-06 (negative): btx:addInput 직전 btx:new 미호출 → form 에러 + facade 미호출
  // ────────────────────────────────────────────────────────
  it('T-E2E-06 (negative): addInput before new → form error + facade 미호출', async () => {
    await setupPlaygroundWithSpy()

    // tx 생성 skip
    await page.click('[data-method-id="btx:addInput"]')
    await page.type('#field-prevTx', '0200000000010178ac6f1c')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const calls = await page.evaluate(() => (window as any)._mockCalls as any[])
    const addInputCall = calls.find((c) => c.method === 'addBitcoinTransactionInput')
    expect(addInputCall).toBeUndefined()

    // form 에러 표시 확인
    const errorText = await page.$eval('.field-error', (el: HTMLElement) => el.textContent)
    expect(errorText).toMatch(/getBitcoinTransactionObject|first/i)
  }, 30000)

  // ────────────────────────────────────────────────────────
  // T-E2E-07 (negative): addInput utxoOutputIdx="abc" 비숫자 → form 에러 + facade 미호출
  //   (NaN silent fallback 회귀 가드 — boundary-validation 룰)
  // ────────────────────────────────────────────────────────
  it('T-E2E-07 (negative): addInput utxoIdx="abc" 비숫자 → form error + facade 미호출', async () => {
    await setupPlaygroundWithSpy()

    // tx 생성 먼저
    await page.click('[data-method-id="btx:new"]')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 150))

    // addInput with invalid utxoIdx
    await page.click('[data-method-id="btx:addInput"]')
    await page.type('#field-prevTx', '0200000000010178ac6f1c')
    // 기본 utxoIdx 값을 지우고 'abc' 입력
    await page.click('#field-utxoIdx', { clickCount: 3 })
    await page.type('#field-utxoIdx', 'abc')
    await page.click('#btn-send')
    await new Promise((r) => setTimeout(r, 200))

    const calls = await page.evaluate(() => (window as any)._mockCalls as any[])
    const addInputCalls = calls.filter((c) => c.method === 'addBitcoinTransactionInput')
    expect(addInputCalls.length).toBe(0) // facade 미호출

    const errorText = await page.$eval('.field-error', (el: HTMLElement) => el.textContent)
    expect(errorText).toMatch(/utxo_idx|integer/i)

    const btxState = await page.evaluate(() => (window as any)._playgroundTestAPI.getBitcoinTxState())
    expect(btxState.inputs).toBe(0) // state 변경 없음
  }, 30000)
})
