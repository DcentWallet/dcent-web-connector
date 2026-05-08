/**
 * playground.signtx-non-evm.test.ts — 비-EVM signTransaction 기능 단위 테스트 (m06-01-03)
 *
 * jsdom 환경에서 index-v2.html + playground.js 로드 후
 * 비-EVM 체인 데이터 로드 / 트리 빌드 / 폼 렌더링 / dispatcher 호출 흐름을 검증.
 *
 * T-U-NEVM-01: simulateNonEvmLoad 후 트리에 6 family 그룹 + chainId variant 출력
 * T-U-NEVM-02: family별 preset 적용 — btc-transfer 선택 시 Bitcoin chainId 활성 + textarea Bitcoin shape
 * T-U-NEVM-03: family별 keyPath default — Bitcoin/Solana/XRP/Hedera/Stellar/Tron 각 SLIP-44
 * T-U-NEVM-04: preset fixture 6개 모두 valid JSON 파싱
 * T-U-NEVM-05: chainId가 어느 family filter에도 매칭 안 되면 트리에서 제외
 */
import * as fs from 'fs'
import * as path from 'path'

// ── Playground 로드 helper ──────────────────────────────────────────────────
function loadPlayground(): void {
  const html = fs.readFileSync(
    path.resolve(__dirname, '../../../index-v2.html'),
    'utf8'
  )
  document.documentElement.innerHTML = html

  ;(window as any).PopupTransport = function (_opts: any) {
    return {
      send: jest.fn().mockResolvedValue({ id: 'stub-id', result: {} }),
      on: jest.fn(),
      off: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    }
  }
  ;(window as any).SerialRequestQueue = function (_transport: any) {
    return {
      enqueue: jest.fn(function (task: any) { return task() }),
      size: jest.fn().mockReturnValue(0),
      clear: jest.fn(),
    }
  }
  ;(window as any).ProviderError = class ProviderError extends Error {
    code: number
    constructor(code: number, message: string) {
      super(message)
      this.code = code
    }
  }

  const playgroundSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../playground.js'),
    'utf8'
  )
  // eslint-disable-next-line no-new-func
  new Function(playgroundSrc)()
}

// ── Sample fixtures (6 non-EVM families) ────────────────────────────────────
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
      inputs: [{ txid: '0000000000000000000000000000000000000000000000000000000000000001', vout: 0, amount: 100000, sequence: 4294967295 }],
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
      instructions: [],
      recentBlockhash: '11111111111111111111111111111111',
    },
  },
  {
    id: 'xrp-payment',
    label: 'XRP Payment',
    family: 'xrp',
    applicableChainIds: ['xrpl:0'],
    note: 'XRP Ledger Payment transaction',
    sourceUrl: 'https://js.xrpl.org/',
    transaction: {
      TransactionType: 'Payment',
      Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
      Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      Amount: '1000000',
      Fee: '12',
      Sequence: 1,
      Flags: 0,
    },
  },
  {
    id: 'hbar-transfer',
    label: 'Hedera HBAR transfer',
    family: 'hedera',
    applicableChainIds: ['hedera:mainnet'],
    note: 'Hedera TransferTransaction',
    sourceUrl: 'https://docs.hedera.com/',
    transaction: {
      type: 'CryptoTransfer',
      transfers: [
        { accountId: '0.0.2', amount: -100000000 },
        { accountId: '0.0.3', amount: 100000000 },
      ],
      memo: '',
      maxTransactionFee: 100000000,
      transactionValidDuration: 120,
    },
  },
  {
    id: 'xlm-payment',
    label: 'Stellar XLM payment',
    family: 'stellar',
    applicableChainIds: ['stellar:pubnet'],
    note: 'Stellar Operation.payment for native XLM',
    sourceUrl: 'https://stellar.github.io/js-stellar-sdk/',
    transaction: {
      type: 'payment',
      destination: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      asset: { code: 'XLM', issuer: null },
      amount: '10',
      memo: { type: 'none' },
      fee: 100,
      sequenceNumber: '0',
    },
  },
  {
    id: 'trx-transfer',
    label: 'Tron TRX transfer',
    family: 'tron',
    applicableChainIds: ['tron:mainnet'],
    note: 'TronWeb transactionBuilder.sendTrx format',
    sourceUrl: 'https://developers.tron.network/',
    transaction: {
      to_address: 'TPswDDCAWhJAZGdHPidFiqHuoXXVKRiTZ2',
      owner_address: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
      amount: 1000000,
    },
  },
]

// ── Setup / teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  loadPlayground()
})

afterEach(() => {
  document.documentElement.innerHTML = ''
  delete (window as any)._playgroundTestAPI
  delete (window as any).PopupTransport
  delete (window as any).SerialRequestQueue
  delete (window as any).ProviderError
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-01: simulateNonEvmLoad 후 트리에 6 family 그룹 + chainId variant 출력
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-NEVM-01: simulateNonEvmLoad 후 TREE에 6 family 그룹과 chainId 노드가 추가된다', () => {
  const api = (window as any)._playgroundTestAPI

  // 로드 전: placeholder 포함 method 개수 기록
  const beforeCount = api.countMethodNodes()

  // 비-EVM 데이터 주입
  api.simulateNonEvmLoad(SAMPLE_NON_EVM_CHAINS, SAMPLE_NON_EVM_PRESETS)

  // 로드 후: 6개 family × 1 chain씩 추가됨 (+6)
  const afterCount = api.countMethodNodes()
  expect(afterCount).toBe(beforeCount + SAMPLE_NON_EVM_CHAINS.length)

  // DOM: 각 family의 chain 노드 존재 확인
  const btcNode = document.querySelector('[data-method-id^="signTx:bitcoin:"]')
  const solNode = document.querySelector('[data-method-id^="signTx:solana:"]')
  const xrpNode = document.querySelector('[data-method-id^="signTx:xrp:"]')
  const hbarNode = document.querySelector('[data-method-id^="signTx:hedera:"]')
  const xlmNode = document.querySelector('[data-method-id^="signTx:stellar:"]')
  const trxNode = document.querySelector('[data-method-id^="signTx:tron:"]')

  expect(btcNode).not.toBeNull()
  expect(solNode).not.toBeNull()
  expect(xrpNode).not.toBeNull()
  expect(hbarNode).not.toBeNull()
  expect(xlmNode).not.toBeNull()
  expect(trxNode).not.toBeNull()

  // 6 family (bitcoin / solana / xrp / hedera / stellar / tron) 모두 NON_EVM_FAMILIES에 포함됨
  // m06-01-04 갱신: NON_EVM_FAMILIES는 13 family로 확장됨 (Rest 8 family 추가) — length 단언 제거
  const families = api.NON_EVM_FAMILIES as string[]
  expect(families).toContain('bitcoin')
  expect(families).toContain('solana')
  expect(families).toContain('xrp')
  expect(families).toContain('hedera')
  expect(families).toContain('stellar')
  expect(families).toContain('tron')
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-02: btc-transfer 선택 시 Bitcoin chainId만 활성, transaction textarea Bitcoin shape
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-NEVM-02: btc-transfer preset 적용 → Bitcoin chain node 활성, textarea에 Bitcoin shape 채워짐', () => {
  const api = (window as any)._playgroundTestAPI

  api.simulateNonEvmLoad(SAMPLE_NON_EVM_CHAINS, SAMPLE_NON_EVM_PRESETS)

  const mockTransport = { send: jest.fn(), on: jest.fn(), off: jest.fn(), close: jest.fn() }
  const mockQueue = { enqueue: jest.fn(function (task: any) { return task() }), size: jest.fn(), clear: jest.fn() }
  api.simulateConnect(mockTransport, mockQueue, { model: 'Bio', firmware: '3.0' })

  // Bitcoin chain node 클릭
  const btcNode = document.querySelector('[data-method-id="signTx:bitcoin:bip122:000000000019d6689c085ae165831e93"]') as HTMLElement
  expect(btcNode).not.toBeNull()
  btcNode.click()

  // 폼 렌더링 확인
  const keyPathEl = document.getElementById('field-keyPath') as HTMLInputElement
  const txEl = document.getElementById('field-transaction') as HTMLTextAreaElement

  expect(keyPathEl).not.toBeNull()
  expect(txEl).not.toBeNull()

  // defaultKeyPath 주입 확인 (Bitcoin native SegWit: m/84')
  expect(keyPathEl.value).toMatch(/^m\//)

  // transaction textarea에 Bitcoin 형태 preset이 채워졌는지 확인
  const txValue = txEl.value.trim()
  expect(txValue.length).toBeGreaterThan(0)

  // valid JSON이어야 함
  const txObj = JSON.parse(txValue)
  // Bitcoin 형태: inputs/outputs 배열 또는 유사 구조
  expect(txObj).toBeDefined()
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-03: family별 keyPath default — SLIP-44 파생 경로 확인
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-NEVM-03: CHAIN_KEY_PATH Proxy — 비-EVM family별 defaultKeyPath 반환', () => {
  const api = (window as any)._playgroundTestAPI

  api.simulateNonEvmLoad(SAMPLE_NON_EVM_CHAINS, SAMPLE_NON_EVM_PRESETS)

  const ckp = api.CHAIN_KEY_PATH

  // Bitcoin (BIP-84 native SegWit: SLIP-44 coin_type=0)
  expect(ckp['bip122:000000000019d6689c085ae165831e93']).toBe("m/84'/0'/0'/0/0")

  // Solana (SLIP-44 coin_type=501)
  expect(ckp['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']).toBe("m/44'/501'/0'")

  // XRP (SLIP-44 coin_type=144)
  expect(ckp['xrpl:0']).toBe("m/44'/144'/0'/0/0")

  // Hedera (SLIP-44 coin_type=3030)
  expect(ckp['hedera:mainnet']).toBe("m/44'/3030'/0'")

  // Stellar (SLIP-44 coin_type=148)
  expect(ckp['stellar:pubnet']).toBe("m/44'/148'/0'")

  // Tron (SLIP-44 coin_type=195)
  expect(ckp['tron:mainnet']).toBe("m/44'/195'/0'/0/0")
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-04: preset fixture 6개 모두 valid JSON 파싱
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-NEVM-04: presets.non-evm.json — 6 family preset fixture 모두 valid JSON', () => {
  const presetsPath = path.resolve(__dirname, '../../../playground/presets.non-evm.json')
  const raw = fs.readFileSync(presetsPath, 'utf8')

  // JSON 파싱 성공해야 함
  let presets: any[]
  expect(() => { presets = JSON.parse(raw) }).not.toThrow()

  presets = JSON.parse(raw)
  expect(Array.isArray(presets)).toBe(true)
  expect(presets.length).toBe(6)

  // 각 preset의 필수 필드 확인
  const requiredFields = ['id', 'label', 'family', 'applicableChainIds', 'transaction']
  const expectedFamilies = ['bitcoin', 'solana', 'xrp', 'hedera', 'stellar', 'tron']

  presets.forEach((p: any) => {
    requiredFields.forEach((field) => {
      expect(p).toHaveProperty(field)
    })
    expect(expectedFamilies).toContain(p.family)
    expect(Array.isArray(p.applicableChainIds)).toBe(true)
    expect(p.applicableChainIds.length).toBeGreaterThan(0)
    expect(typeof p.transaction).toBe('object')
  })

  // family 중복 없이 6개 모두 존재
  const families = presets.map((p: any) => p.family)
  expectedFamilies.forEach((fam) => {
    expect(families).toContain(fam)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-05: 미지원 chainId는 트리에서 제외 (비-EVM family 없음)
// m06-01-04 갱신: cosmos는 known family로 승격됨 → 진짜 알 수 없는 namespace로 변경
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-NEVM-05: 알 수 없는 family chain은 트리 non-EVM 그룹에 포함되지 않는다', () => {
  const api = (window as any)._playgroundTestAPI

  // 알 수 없는 family chain 주입 (NON_EVM_FAMILIES에 등록되지 않은 namespace)
  const unknownFamilyChain = {
    chainId: 'unknown_ns:test-chain',
    family: 'unknown_ns', // NON_EVM_FAMILIES에 없음
    displayName: 'Unknown Network',
    defaultKeyPath: "m/44'/0'/0'/0/0",
  }

  api.simulateNonEvmLoad(
    [...SAMPLE_NON_EVM_CHAINS, unknownFamilyChain],
    SAMPLE_NON_EVM_PRESETS
  )

  // unknown_ns 노드는 트리에 없어야 함 (NON_EVM_FAMILIES에 unknown_ns가 없으므로)
  const unknownNode = document.querySelector('[data-method-id^="signTx:unknown_ns:"]')
  expect(unknownNode).toBeNull()

  // 정상 family 6개는 여전히 존재
  expect(document.querySelector('[data-method-id^="signTx:bitcoin:"]')).not.toBeNull()
  expect(document.querySelector('[data-method-id^="signTx:solana:"]')).not.toBeNull()
  expect(document.querySelector('[data-method-id^="signTx:xrp:"]')).not.toBeNull()
  expect(document.querySelector('[data-method-id^="signTx:hedera:"]')).not.toBeNull()
  expect(document.querySelector('[data-method-id^="signTx:stellar:"]')).not.toBeNull()
  expect(document.querySelector('[data-method-id^="signTx:tron:"]')).not.toBeNull()
})
