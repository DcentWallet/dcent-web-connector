/**
 * playground.signtx-rest.test.ts — Rest 8 family signTransaction 단위 테스트 (m06-01-04)
 *
 * jsdom 환경에서 index-v2.html + playground.js 로드 후
 * 신규 8 family(algorand / conflux / cosmos / fil / polkadot / stacks / tezos / vechain)
 * 트리 빌드 / 폼 렌더링 / preset 적용 흐름을 검증.
 *
 * T-U-REST-01: NON_EVM_FAMILIES 14 family 포함 (ethereum 제외 전부 — 6 기존 + 8 신규)
 * T-U-REST-02: FAMILY_LABELS 15 family 매핑 (ethereum + 14 non-EVM) + 알 수 없는 family는 트리 그룹 미생성
 * T-U-REST-03: 15 family inject 시 트리 method 노드 수 = 입력 chain 수 + 정적 method 수 (R4=a)
 * T-U-REST-04: presets.rest.json — 8 entry × 7 필드 모두 valid + transaction object
 * T-U-REST-05: preset 부재 family chain 노드는 트리에 노출되되 textarea 자동 채움 없음
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

// ── Sample fixture: 신규 8 family chain entries ──────────────────────────────
// SLIP-44 coin types 출처: https://github.com/satoshilabs/slips/blob/master/slip-0044.md
//   algorand=283, conflux=503, cosmos=118, filecoin=461,
//   polkadot=354, stacks=5757, tezos=1729, vechain=818
const SAMPLE_REST_CHAINS = [
  { chainId: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k', family: 'algorand', displayName: 'Algorand', defaultKeyPath: "m/44'/283'/0'/0/0" },
  { chainId: 'conflux:cfx', family: 'conflux', displayName: 'Conflux', defaultKeyPath: "m/44'/503'/0'/0/0" },
  { chainId: 'cosmos:cosmoshub-4', family: 'cosmos', displayName: 'Cosmos Hub', defaultKeyPath: "m/44'/118'/0'/0/0" },
  { chainId: 'fil:f', family: 'fil', displayName: 'Filecoin', defaultKeyPath: "m/44'/461'/0'/0/0" },
  { chainId: 'polkadot:91b171bb158e2d3848fa23a9f1c25182', family: 'polkadot', displayName: 'Polkadot', defaultKeyPath: "m/44'/354'/0'/0/0" },
  { chainId: 'stacks:1', family: 'stacks', displayName: 'Stacks', defaultKeyPath: "m/44'/5757'/0'/0/0" },
  { chainId: 'tezos:NetXdQprcVkpaWU', family: 'tezos', displayName: 'Tezos', defaultKeyPath: "m/44'/1729'/0'/0/0" },
  { chainId: 'vechain:b1ac3413d346d43539627e6be7ec1b4a', family: 'vechain', displayName: 'VeChain', defaultKeyPath: "m/44'/818'/0'/0/0" },
]

// ── Preset fixture — Plan 01 산출물(presets.rest.json) 직접 require ───────────
const restPresetsPath = path.resolve(__dirname, '../../../playground/presets.rest.json')
const SAMPLE_REST_PRESETS: any[] = JSON.parse(fs.readFileSync(restPresetsPath, 'utf8'))

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
// T-U-REST-01: NON_EVM_FAMILIES 가 13 family 포함 (ethereum 제외 전부)
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-01: NON_EVM_FAMILIES 가 14 family 포함 (ethereum 제외 전부)', () => {
  const api = (window as any)._playgroundTestAPI
  const families = api.NON_EVM_FAMILIES as string[]

  // 기존 6 family + 신규 8 family = 14 family (ethereum 제외)
  expect(families).toHaveLength(14)
  // 기존 6 family (Child 1-3 covered)
  expect(families).toEqual(expect.arrayContaining(['bitcoin', 'solana', 'xrp', 'hedera', 'stellar', 'tron']))
  // 신규 8 family (m06-01-04)
  expect(families).toEqual(expect.arrayContaining(['algorand', 'conflux', 'cosmos', 'fil', 'polkadot', 'stacks', 'tezos', 'vechain']))
  // ethereum은 EVM 그룹이므로 NON_EVM_FAMILIES에서 제외
  expect(families).not.toContain('ethereum')
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-REST-02: FAMILY_LABELS 미등록 family는 family명 그대로 fallback (deriveFamily fallback 동작)
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-02: FAMILY_LABELS — 15 family 매핑 + 알 수 없는 family는 트리 그룹 미생성', () => {
  const api = (window as any)._playgroundTestAPI
  const labels = api.FAMILY_LABELS as Record<string, string>

  // 15 family 모두 매핑됨 (ethereum + 14 non-EVM)
  expect(Object.keys(labels)).toHaveLength(15)
  expect(labels.ethereum).toBe('Ethereum (EIP-155)')
  expect(labels.algorand).toBe('Algorand')
  expect(labels.cosmos).toBe('Cosmos (cosmjs)')
  expect(labels.vechain).toBe('VeChain')

  // 미등록 family는 NON_EVM_FAMILIES에 없으므로 트리 그룹 미생성
  // (extract-chains.js의 deriveFamily fallback과 동일한 정책을 페이지 레벨에서도 보존)
  const unknownFamilyChain = {
    chainId: 'unknown_ns:test',
    family: 'unknown_ns',
    displayName: 'Unknown Network',
    defaultKeyPath: "m/44'/0'/0'/0/0",
  }
  api.simulateNonEvmLoad([...SAMPLE_REST_CHAINS, unknownFamilyChain], SAMPLE_REST_PRESETS)
  const unknownNode = document.querySelector('[data-method-id^="signTx:unknown_ns:"]')
  expect(unknownNode).toBeNull()
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-REST-03: 14 family inject 시 method 노드 수 = chains 항목 수 (트리 누락 0, R4=a)
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-03: 14 family inject 시 method 노드 수 = chains 항목 수 (트리 누락 0)', () => {
  const api = (window as any)._playgroundTestAPI

  const beforeCount = api.countMethodNodes()

  // EVM 1 + non-EVM 6 + Rest 8 = 15 chain inject
  const evmChains = [
    { chainId: 'eip155:1', family: 'ethereum', displayName: 'Ethereum', defaultKeyPath: "m/44'/60'/0'/0/0" },
  ]
  const nonEvmChains = [
    { chainId: 'bip122:000000000019d6689c085ae165831e93', family: 'bitcoin', displayName: 'Bitcoin', defaultKeyPath: "m/84'/0'/0'/0/0" },
    { chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', family: 'solana', displayName: 'Solana', defaultKeyPath: "m/44'/501'/0'" },
    { chainId: 'xrpl:0', family: 'xrp', displayName: 'XRP Ledger', defaultKeyPath: "m/44'/144'/0'/0/0" },
    { chainId: 'hedera:mainnet', family: 'hedera', displayName: 'Hedera', defaultKeyPath: "m/44'/3030'/0'" },
    { chainId: 'stellar:pubnet', family: 'stellar', displayName: 'Stellar', defaultKeyPath: "m/44'/148'/0'" },
    { chainId: 'tron:mainnet', family: 'tron', displayName: 'Tron', defaultKeyPath: "m/44'/195'/0'/0/0" },
  ]
  api.simulateEvmLoad(evmChains, [])
  api.simulateNonEvmLoad([...nonEvmChains, ...SAMPLE_REST_CHAINS], SAMPLE_REST_PRESETS)

  const afterCount = api.countMethodNodes()
  // 입력 chain 총 수 (placeholder 제외, _placeholder true는 countMethodNodes에서 skip)
  const injectedChainsCount = evmChains.length + nonEvmChains.length + SAMPLE_REST_CHAINS.length
  expect(afterCount).toBe(beforeCount + injectedChainsCount)

  // R4=a 결정: buildTree 직접 호출하여 DOM 트리 노드 수도 검증
  api.buildTree()
  const methodNodes = document.querySelectorAll('.tree-item')
  // 정적 method (getDeviceInfo + 4 signMessage) + inject된 chain 수 + Rest family placeholder 제외
  // (placeholder도 .tree-item으로 렌더링되므로 정확한 count 단언 대신 최소 inject chain 수 보장)
  expect(methodNodes.length).toBeGreaterThanOrEqual(injectedChainsCount)
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-REST-04: presets.rest.json — 8 entry × 7 필드 모두 valid + transaction object
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-04: presets.rest.json — 8 entry × 7 필드 모두 valid + transaction object', () => {
  expect(Array.isArray(SAMPLE_REST_PRESETS)).toBe(true)
  expect(SAMPLE_REST_PRESETS).toHaveLength(8)

  const expectedFamilies = ['algorand', 'conflux', 'cosmos', 'fil', 'polkadot', 'stacks', 'tezos', 'vechain']
  const requiredFields = ['id', 'label', 'family', 'applicableChainIds', 'note', 'sourceUrl', 'transaction']

  SAMPLE_REST_PRESETS.forEach((p: any) => {
    requiredFields.forEach((f) => expect(p).toHaveProperty(f))
    expect(expectedFamilies).toContain(p.family)
    expect(Array.isArray(p.applicableChainIds)).toBe(true)
    expect(p.applicableChainIds.length).toBeGreaterThan(0)
    expect(typeof p.transaction).toBe('object')
    expect(p.transaction).not.toBeNull()
    expect(typeof p.sourceUrl).toBe('string')
    expect(p.sourceUrl).toMatch(/^https?:\/\//) // valid URL
  })

  // family 중복 없음 (8 family 정확히 1 entry씩)
  const families = SAMPLE_REST_PRESETS.map((p: any) => p.family)
  expect(new Set(families).size).toBe(8)
  expectedFamilies.forEach((fam) => expect(families).toContain(fam))
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-REST-05: preset 부재 family chain 노드는 트리에 노출되되 textarea 자동 채움 없음
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-05: preset 부재 family chain 노드는 트리에 노출되되 textarea 자동 채움 없음', () => {
  const api = (window as any)._playgroundTestAPI

  // preset에 cosmos가 없는 시나리오 — chain은 inject되지만 preset은 제외
  const cosmosOnlyChains = SAMPLE_REST_CHAINS.filter((c) => c.family === 'cosmos')
  const presetsExcludingCosmos = SAMPLE_REST_PRESETS.filter((p: any) => p.family !== 'cosmos')

  api.simulateNonEvmLoad(cosmosOnlyChains, presetsExcludingCosmos)

  const mockTransport = { send: jest.fn(), on: jest.fn(), off: jest.fn(), close: jest.fn() }
  const mockQueue = { enqueue: jest.fn(function (task: any) { return task() }), size: jest.fn(), clear: jest.fn() }
  api.simulateConnect(mockTransport, mockQueue, { model: 'Bio', firmware: '3.0' })

  // Cosmos chain 노드 클릭
  const cosmosNode = document.querySelector('[data-method-id^="signTx:cosmos:"]') as HTMLElement
  expect(cosmosNode).not.toBeNull()
  cosmosNode.click()

  // 폼 렌더링 확인
  const txEl = document.getElementById('field-transaction') as HTMLTextAreaElement
  expect(txEl).not.toBeNull()

  // preset 부재 — textarea 자동 채움 없음 (preset 자동 적용 로직이 cosmos preset 부재 시 skip)
  expect(txEl.value).toBe('')

  // 안내문 확인
  const formFields = document.getElementById('form-fields')
  expect(formFields).not.toBeNull()
  expect(formFields!.textContent).toContain('No presets available')
})
