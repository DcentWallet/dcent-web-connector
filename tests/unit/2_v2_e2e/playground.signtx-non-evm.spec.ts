/**
 * playground.signtx-non-evm.spec.ts — 비-EVM signTransaction e2e 테스트 (m06-01-03)
 *
 * puppeteer로 index-v2.html 로드 후 비-EVM signTx 전체 흐름 검증:
 * 1. simulateNonEvmLoad로 체인 데이터 주입
 * 2. 트리에 family 그룹 노출 확인
 * 3. 폼 렌더링 + 입력 + Send → signTransaction request 파라미터 검증
 *
 * T-E2E-NEVM-01: Bitcoin transfer round-trip (MockDeviceTransport)
 * T-E2E-NEVM-02: Solana transfer round-trip (MockDeviceTransport)
 *
 * 전제조건:
 * - globalSetup이 harness server (port 9091) 구동 중
 * - Mock transport 패턴 사용 (실제 디바이스 불필요)
 */
const { launchBrowser } = require('./launchBrowser')

const HARNESS_BASE = 'http://localhost:9091'
const PLAYGROUND_URL = `${HARNESS_BASE}/index-v2.html`

const SAMPLE_NON_EVM_CHAINS = [
  {
    chainId: 'bip122:000000000019d6689c085ae165831e93',
    family: 'bitcoin',
    displayName: 'Bitcoin',
    defaultKeyPath: "m/84'/0'/0'/0/0",
  },
  {
    chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    family: 'solana',
    displayName: 'Solana',
    defaultKeyPath: "m/44'/501'/0'",
  },
  {
    chainId: 'xrpl:0',
    family: 'xrp',
    displayName: 'XRPL',
    defaultKeyPath: "m/44'/144'/0'/0/0",
  },
  {
    chainId: 'hedera:mainnet',
    family: 'hedera',
    displayName: 'Hedera Hashgraph',
    defaultKeyPath: "m/44'/3030'/0'",
  },
  {
    chainId: 'stellar:pubnet',
    family: 'stellar',
    displayName: 'Stellar',
    defaultKeyPath: "m/44'/148'/0'",
  },
  {
    chainId: 'tron:mainnet',
    family: 'tron',
    displayName: 'Tron',
    defaultKeyPath: "m/44'/195'/0'/0/0",
  },
]

const SAMPLE_NON_EVM_PRESETS = [
  {
    id: 'btc-transfer',
    label: 'Bitcoin native-segwit transfer',
    family: 'bitcoin',
    applicableChainIds: ['bip122:000000000019d6689c085ae165831e93'],
    note: 'P2WPKH native SegWit',
    sourceUrl: 'https://github.com/bitcoinjs/bitcoinjs-lib',
    transaction: {
      inputs: [
        {
          txid: '0000000000000000000000000000000000000000000000000000000000000001',
          vout: 0,
          amount: 100000,
          sequence: 4294967295,
        },
      ],
      outputs: [{ address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', amount: 90000 }],
      feeRate: 10,
      locktime: 0,
    },
  },
  {
    id: 'sol-transfer',
    label: 'Solana SOL transfer',
    family: 'solana',
    applicableChainIds: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
    note: 'Versioned Transaction (version: 0)',
    sourceUrl: 'https://solana-labs.github.io/solana-web3.js/',
    transaction: {
      version: 0,
      feePayer: '11111111111111111111111111111111',
      instructions: [
        {
          programId: '11111111111111111111111111111111',
          keys: [
            { pubkey: '11111111111111111111111111111111', isSigner: true, isWritable: true },
            { pubkey: '11111111111111111111111111111112', isSigner: false, isWritable: true },
          ],
          data: { instruction: 2, lamports: 1000000 },
        },
      ],
      recentBlockhash: '11111111111111111111111111111111',
    },
  },
]

const BTC_TX_JSON = JSON.stringify({
  inputs: [
    {
      txid: '0000000000000000000000000000000000000000000000000000000000000001',
      vout: 0,
      amount: 100000,
      sequence: 4294967295,
    },
  ],
  outputs: [{ address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', amount: 90000 }],
  feeRate: 10,
  locktime: 0,
})

const SOL_TX_JSON = JSON.stringify({
  version: 0,
  feePayer: '11111111111111111111111111111111',
  instructions: [
    {
      programId: '11111111111111111111111111111111',
      keys: [
        { pubkey: '11111111111111111111111111111111', isSigner: true, isWritable: true },
        { pubkey: '11111111111111111111111111111112', isSigner: false, isWritable: true },
      ],
      data: { instruction: 2, lamports: 1000000 },
    },
  ],
  recentBlockhash: '11111111111111111111111111111111',
})

describe('[v2 e2e] playground signTx non-EVM', () => {
  let browser: any
  let page: any

  beforeAll(async () => {
    browser = await launchBrowser()
    page = await browser.newPage()
  })

  afterAll(async () => {
    await browser.close()
  })

  // m08-01-05: Helper — inject mock dcent facade + simulateConnect
  async function setupMockTransport() {
    await page.evaluate(() => {
      const api = (window as any)._playgroundTestAPI
      ;(window as any)._capturedRequests = []
      const mockDcent = {
        sign: (input: any) => {
          ;(window as any)._capturedRequests.push(input)
          return Promise.resolve({ header: { status: 'success' }, body: { parameter: { signedTx: 'mock-signed-tx-hex' } } })
        },
        getDeviceInfo: () => Promise.resolve({ header: { status: 'success' }, body: { parameter: {} } }),
        popupWindowClose: () => {},
        setConnectionListener: () => {},
      }
      api.simulateConnect(mockDcent, null, { model: 'Biometric', firmware: '3.23.0' })
    })
  }

  // ────────────────────────────────────────────────────────────────────────────
  // T-E2E-NEVM-01: Bitcoin transfer round-trip (MockDeviceTransport)
  // ────────────────────────────────────────────────────────────────────────────
  it('T-E2E-NEVM-01: Bitcoin transfer round-trip — signTransaction 파라미터 검증', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // Step 1: 비-EVM 데이터 주입
    await page.evaluate(
      (chains: typeof SAMPLE_NON_EVM_CHAINS, presets: typeof SAMPLE_NON_EVM_PRESETS) => {
        const api = (window as any)._playgroundTestAPI
        api.simulateNonEvmLoad(chains, presets)
      },
      SAMPLE_NON_EVM_CHAINS,
      SAMPLE_NON_EVM_PRESETS
    )

    // Step 2: Bitcoin 체인 노드 존재 확인
    const btcNodeCount = await page.$$eval(
      '[data-method-id^="signTx:bitcoin:"]',
      (nodes: Element[]) => nodes.length
    )
    expect(btcNodeCount).toBeGreaterThan(0)

    // Step 3: Mock transport 주입
    await setupMockTransport()

    // Step 4: Bitcoin 노드 클릭
    await page.click('[data-method-id="signTx:bitcoin:bip122:000000000019d6689c085ae165831e93"]')

    // Step 5: 폼 렌더링 확인
    const hasKeyPath = await page.$('#field-keyPath')
    expect(hasKeyPath).not.toBeNull()
    const hasTxField = await page.$('#field-transaction')
    expect(hasTxField).not.toBeNull()

    // Step 6: 폼 입력
    await page.evaluate(
      (keyPath: string, txJson: string) => {
        const kp = document.getElementById('field-keyPath') as HTMLInputElement
        const tx = document.getElementById('field-transaction') as HTMLTextAreaElement
        if (kp) { kp.value = keyPath; kp.dispatchEvent(new Event('input', { bubbles: true })) }
        if (tx) { tx.value = txJson; tx.dispatchEvent(new Event('input', { bubbles: true })) }
      },
      "m/84'/0'/0'/0/0",
      BTC_TX_JSON
    )

    // Step 7: Send 버튼 클릭
    const sendDisabled = await page.$eval('#btn-send', (el: HTMLButtonElement) => el.disabled)
    expect(sendDisabled).toBe(false)
    await page.click('#btn-send')

    // Step 8: 응답 대기
    await new Promise((r) => setTimeout(r, 300))

    // Step 9: 전송된 요청 파라미터 검증
    const captured = await page.evaluate(() => (window as any)._capturedRequests)
    expect(captured.length).toBe(1)

    const req = captured[0]
    // m08-01-05: facade dcent.sign({chain, payload}) 호출됨
    expect(req.chain).toBe('bip122:000000000019d6689c085ae165831e93')
    expect(req.payload.chainId).toBe('bip122:000000000019d6689c085ae165831e93')
    expect(req.payload.keyPath).toBe("m/84'/0'/0'/0/0")
    expect(req.payload.transaction).toBeDefined()
    // Bitcoin transaction shape: inputs 배열
    expect(Array.isArray(req.payload.transaction.inputs)).toBe(true)
    expect(Array.isArray(req.payload.transaction.outputs)).toBe(true)

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

  // ────────────────────────────────────────────────────────────────────────────
  // T-E2E-NEVM-02: Solana transfer round-trip (MockDeviceTransport)
  // ────────────────────────────────────────────────────────────────────────────
  it('T-E2E-NEVM-02: Solana transfer round-trip — signTransaction 파라미터 검증', async () => {
    await page.goto(PLAYGROUND_URL, { waitUntil: 'networkidle0' })

    // Step 1: 비-EVM 데이터 주입
    await page.evaluate(
      (chains: typeof SAMPLE_NON_EVM_CHAINS, presets: typeof SAMPLE_NON_EVM_PRESETS) => {
        const api = (window as any)._playgroundTestAPI
        api.simulateNonEvmLoad(chains, presets)
      },
      SAMPLE_NON_EVM_CHAINS,
      SAMPLE_NON_EVM_PRESETS
    )

    // Step 2: Solana 체인 노드 존재 확인
    const solNodeCount = await page.$$eval(
      '[data-method-id^="signTx:solana:"]',
      (nodes: Element[]) => nodes.length
    )
    expect(solNodeCount).toBeGreaterThan(0)

    // Step 3: Mock transport 주입
    await setupMockTransport()

    // Step 4: Solana 노드 클릭
    await page.click('[data-method-id="signTx:solana:solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"]')

    // Step 5: 폼 렌더링 확인
    const hasKeyPath = await page.$('#field-keyPath')
    expect(hasKeyPath).not.toBeNull()
    const hasTxField = await page.$('#field-transaction')
    expect(hasTxField).not.toBeNull()

    // Step 6: 폼 입력
    await page.evaluate(
      (keyPath: string, txJson: string) => {
        const kp = document.getElementById('field-keyPath') as HTMLInputElement
        const tx = document.getElementById('field-transaction') as HTMLTextAreaElement
        if (kp) { kp.value = keyPath; kp.dispatchEvent(new Event('input', { bubbles: true })) }
        if (tx) { tx.value = txJson; tx.dispatchEvent(new Event('input', { bubbles: true })) }
      },
      "m/44'/501'/0'",
      SOL_TX_JSON
    )

    // Step 7: Send 버튼 클릭
    const sendDisabled = await page.$eval('#btn-send', (el: HTMLButtonElement) => el.disabled)
    expect(sendDisabled).toBe(false)
    await page.click('#btn-send')

    // Step 8: 응답 대기
    await new Promise((r) => setTimeout(r, 300))

    // Step 9: 전송된 요청 파라미터 검증
    const captured = await page.evaluate(() => (window as any)._capturedRequests)
    expect(captured.length).toBe(1)

    const req = captured[0]
    // m08-01-05: facade dcent.sign({chain, payload}) 호출됨
    expect(req.chain).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
    expect(req.payload.chainId).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
    expect(req.payload.keyPath).toBe("m/44'/501'/0'")
    expect(req.payload.transaction).toBeDefined()
    // Solana Versioned Transaction shape: version 필드
    expect(req.payload.transaction.version).toBe(0)
    expect(req.payload.transaction.feePayer).toBeDefined()

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
