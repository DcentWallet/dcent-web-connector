/**
 * playground.signtx-evm.spec.ts — EVM signTransaction e2e 테스트 (m06-01-02)
 *
 * puppeteer로 index-v2.html 로드 후 EVM signTx 전체 흐름 검증:
 * 1. simulateEvmLoad로 체인 데이터 주입
 * 2. 트리에 EVM 체인 노드 노출 확인
 * 3. 폼 렌더링 + 입력 + Send → signTransaction request 파라미터 검증
 *
 * T-E2E-EVM-01: EVM 체인 로드 + signTransaction round-trip
 *
 * 전제조건:
 * - globalSetup이 harness server (port 9091) 구동 중
 * - sdk dist build 존재 (Mock transport 패턴 사용)
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_BASE = 'http://localhost:9091'
const PLAYGROUND_URL = `${HARNESS_BASE}/index-v2.html`

const SAMPLE_CHAINS = [
  {
    chainId: 'eip155:1',
    family: 'ethereum',
    displayName: 'Ethereum',
    defaultKeyPath: "m/44'/60'/0'/0/0",
  },
  {
    chainId: 'eip155:137',
    family: 'ethereum',
    displayName: 'Polygon',
    defaultKeyPath: "m/44'/60'/0'/0/0",
  },
]

const SAMPLE_PRESETS = [
  {
    id: 'evm-transfer-1559',
    label: 'EVM transfer (EIP-1559)',
    note: 'Template only — edit nonce/maxFeePerGas before send',
    applicableChainIds: ['eip155:1', 'eip155:137'],
    transaction: {
      type: 2,
      to: '0x0000000000000000000000000000000000000000',
      value: '0x2386f26fc10000',
      gasLimit: '0x5208',
      maxFeePerGas: '0x77359400',
      maxPriorityFeePerGas: '0x3b9aca00',
      nonce: '0x0',
      data: '0x',
    },
  },
]

const VALID_TX_JSON = JSON.stringify({
  type: 2,
  to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  value: '0xde0b6b3a7640000',
  gasLimit: '0x5208',
  maxFeePerGas: '0x3b9aca00',
  maxPriorityFeePerGas: '0x3b9aca00',
  nonce: '0x5',
  data: '0x',
})

describe('[v2 e2e] playground signTx EVM', () => {
  let browser: any
  let page: any

  beforeAll(async () => {
    browser = await launchBrowser()
    page = await browser.newPage()
  })

  afterAll(async () => {
    await browser.close()
  })

  // ────────────────────────────────────────────────────────────────────────────
  // T-E2E-EVM-01: EVM 체인 로드 + signTransaction round-trip
  // ────────────────────────────────────────────────────────────────────────────
  it('T-E2E-EVM-01: simulateEvmLoad + EVM signTx round-trip — signTransaction 파라미터 검증', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // Step 1: EVM 체인 데이터 주입
    await page.evaluate(
      (chains: typeof SAMPLE_CHAINS, presets: typeof SAMPLE_PRESETS) => {
        const api = (window as any)._playgroundTestAPI
        api.simulateEvmLoad(chains, presets)
      },
      SAMPLE_CHAINS,
      SAMPLE_PRESETS
    )

    // Step 2: EVM 체인 트리 노드 존재 확인
    const evmNodeCount = await page.$$eval(
      '[data-method-id^="signTx:evm:"]',
      (nodes: Element[]) => nodes.length
    )
    expect(evmNodeCount).toBe(SAMPLE_CHAINS.length)

    // m08-01-05: Step 3: Mock dcent facade 주입 + simulateConnect
    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      ;(window as any)._capturedRequests = []
      const mockDcent = {
        sign: (input: any) => {
          ;(window as any)._capturedRequests.push(input)
          return Promise.resolve({ header: { status: 'success' }, body: { parameter: { signedTx: '0xdeadbeef' } } })
        },
        getDeviceInfo: () => Promise.resolve({ header: { status: 'success' }, body: { parameter: {} } }),
        popupWindowClose: () => {},
        setConnectionListener: () => {},
      }
      api.simulateConnect(mockDcent, null, { model: 'Biometric', firmware: '3.23.0' })
    })

    // Step 4: Ethereum (eip155:1) 노드 클릭
    await page.click('[data-method-id="signTx:evm:eip155:1"]')

    // Step 5: 폼 렌더링 확인 — keyPath, transaction 필드 존재
    const hasKeyPath = await page.$('#field-keyPath')
    expect(hasKeyPath).not.toBeNull()

    const hasTxField = await page.$('#field-transaction')
    expect(hasTxField).not.toBeNull()

    // Step 6: 폼 입력
    await page.evaluate(
      (keyPath: string, txJson: string) => {
        const kp = document.getElementById('field-keyPath') as HTMLInputElement
        const tx = document.getElementById('field-transaction') as HTMLTextAreaElement
        if (kp) {
          kp.value = keyPath
          kp.dispatchEvent(new Event('input', { bubbles: true }))
        }
        if (tx) {
          tx.value = txJson
          tx.dispatchEvent(new Event('input', { bubbles: true }))
        }
      },
      "m/44'/60'/0'/0/0",
      VALID_TX_JSON
    )

    // Step 7: Send 버튼 클릭
    const sendDisabled = await page.$eval('#btn-send', (el: HTMLButtonElement) => el.disabled)
    expect(sendDisabled).toBe(false)
    await page.click('#btn-send')

    // Step 8: 응답 대기
    await new Promise((r) => setTimeout(r, 300))

    // m08-01-05: Step 9: 전송된 sign input 파라미터 검증
    const captured = await page.evaluate(() => (window as any)._capturedRequests)
    expect(captured.length).toBe(1)

    const req = captured[0]
    // facade dcent.sign({ chain: 'eip155:1', payload: { chainId, keyPath, transaction } })
    expect(req.chain).toBe('eip155:1')
    expect(req.payload.chainId).toBe('eip155:1')
    expect(req.payload.keyPath).toBe("m/44'/60'/0'/0/0")
    expect(req.payload.transaction).toBeDefined()
    expect(req.payload.transaction.type).toBe(2)

    // Step 10: 로그 엔트리 확인
    const entries = await page.evaluate(() =>
      (window as any)._playgroundTestAPI.getLogEntries()
    )
    expect(entries.length).toBeGreaterThan(0)
    const lastEntry = entries[entries.length - 1]
    expect(lastEntry.method).toBe('signTransaction')
    expect(lastEntry.error).toBeUndefined()
    expect(lastEntry.response).toBeDefined()
  }, 30000)
})
