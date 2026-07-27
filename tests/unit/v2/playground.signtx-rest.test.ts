/**
 * playground.signtx-rest.test.ts — Rest 8 family signTransaction 단위 테스트 (m06-01-04)
 *
 * jsdom 환경에서 index-v2.html + playground.js 로드 후
 * 신규 8 family(algorand / conflux / cosmos / fil / polkadot / stacks / tezos / vechain)
 * 트리 빌드 / 폼 렌더링 / preset 적용 흐름을 검증.
 *
 * T-U-REST-01: NON_EVM_FAMILIES 19 family 포함 (ethereum 제외 전부 — 6 기존 + 8 신규 + 5 누락보강)
 * T-U-REST-02: FAMILY_LABELS 20 family 매핑 (ethereum + 19 non-EVM) + 알 수 없는 family는 트리 그룹 미생성
 * T-U-REST-03: 15 family inject 시 트리 method 노드 수 = 입력 chain 수 + 정적 method 수 (R4=a)
 * T-U-REST-04: presets.rest.json — 8 entry × 7 필드 모두 valid + transaction object
 * T-U-REST-05: preset 부재 family chain 노드는 트리에 노출되되 textarea 자동 채움 없음
 */
import * as fs from 'fs'
import * as path from 'path'
import * as bech32 from 'bech32'
import { base58 } from '@scure/base'

// SS58 디코드 헬퍼 (선례: tests/unit/1_bridge_test/18_coin.polkadot.sign.spec.js)
// prefix < 64 (Astar=5, Creditcoin=42)는 ss58Length=1 → prefix=decoded[0]
function decodeSs58(addr: string): { prefix: number; pubkey: Uint8Array } {
  const decoded = base58.decode(addr)
  const ss58Length = decoded[0] & 0b0100_0000 ? 2 : 1
  const prefix = decoded[0] // <64 prefix 한정 (본 테스트 대상 5/42)
  const pubkey = decoded.slice(ss58Length, ss58Length + 32)
  return { prefix, pubkey }
}
// bech32 20-byte data(hash160) 추출
function bech32Data(addr: string): Uint8Array {
  return Uint8Array.from(bech32.fromWords(bech32.decode(addr).words))
}
function bytesEq(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

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
// T-U-REST-01: NON_EVM_FAMILIES 가 19 family 포함 (ethereum 제외 전부)
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-01: NON_EVM_FAMILIES 가 19 family 포함 (ethereum 제외 전부)', () => {
  const api = (window as any)._playgroundTestAPI
  const families = api.NON_EVM_FAMILIES as string[]

  // 기존 6 family + 신규 8 family + 누락보강 5 family = 19 family (ethereum 제외)
  expect(families).toHaveLength(19)
  // 기존 6 family (Child 1-3 covered)
  expect(families).toEqual(expect.arrayContaining(['bitcoin', 'solana', 'xrp', 'hedera', 'stellar', 'tron']))
  // 신규 8 family (m06-01-04)
  expect(families).toEqual(expect.arrayContaining(['algorand', 'conflux', 'cosmos', 'fil', 'polkadot', 'stacks', 'tezos', 'vechain']))
  // 누락보강 5 family — chains.json엔 있으나 트리에서 빠져있던 family
  expect(families).toEqual(expect.arrayContaining(['cardano', 'constellation', 'near', 'xahau', 'havah']))
  // ethereum은 EVM 그룹이므로 NON_EVM_FAMILIES에서 제외
  expect(families).not.toContain('ethereum')
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-REST-02: FAMILY_LABELS 미등록 family는 family명 그대로 fallback (deriveFamily fallback 동작)
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-02: FAMILY_LABELS — 20 family 매핑 + 알 수 없는 family는 트리 그룹 미생성', () => {
  const api = (window as any)._playgroundTestAPI
  const labels = api.FAMILY_LABELS as Record<string, string>

  // 20 family 모두 매핑됨 (ethereum + 19 non-EVM)
  expect(Object.keys(labels)).toHaveLength(20)
  expect(labels.ethereum).toBe('Ethereum (EIP-155)')
  expect(labels.algorand).toBe('Algorand')
  expect(labels.cosmos).toBe('Cosmos (cosmjs)')
  expect(labels.vechain).toBe('VeChain')
  // 누락보강 5 family 표시명
  expect(labels.cardano).toBe('Cardano')
  expect(labels.constellation).toBe('Constellation (DAG)')
  expect(labels.near).toBe('NEAR')
  expect(labels.xahau).toBe('Xahau')
  expect(labels.havah).toBe('Havah')

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
// T-U-REST-04: presets.rest.json — ≥9 entry (≥1 per 9 family) × 7 필드 모두 valid + transaction object
// (토큰/컨트랙트 preset 추가로 family당 다수 entry 허용 — 단 9개 family는 모두 ≥1 entry 유지)
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-04: presets.rest.json — ≥1 entry per 9 family × 7 필드 모두 valid + transaction object', () => {
  expect(Array.isArray(SAMPLE_REST_PRESETS)).toBe(true)
  expect(SAMPLE_REST_PRESETS.length).toBeGreaterThanOrEqual(9)

  const expectedFamilies = ['algorand', 'conflux', 'cosmos', 'fil', 'polkadot', 'stacks', 'tezos', 'vechain', 'tron']
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

  // family 중복 없음 (9 family 정확히 1 entry씩)
  const families = SAMPLE_REST_PRESETS.map((p: any) => p.family)
  expect(new Set(families).size).toBe(9)
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

  // m08-01-05: facade-shaped mock
  const mockDcent = {
    sign: jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
    getDeviceInfo: jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }
  api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })

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

// ─────────────────────────────────────────────────────────────────────────────
// T-U-REST-COUNT (m09-04-17): presets.rest.json entry count ≥ 기존(12) + cosmos 4 + polkadot 4 = 20
// 하한 단언만 — 정확-count 금지(9fe0b71이 T-U-REST-04를 정확→≥로 완화한 것을 역행하지 않도록)
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-COUNT: presets.rest.json entry count ≥ 20 (기존 12 + cosmos 4 + polkadot 4)', () => {
  expect(SAMPLE_REST_PRESETS.length).toBeGreaterThanOrEqual(20)
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-REST-COSMOS-01 (m09-04-17): cosmos 형제망 4개 preset — 필드 + bech32 prefix + 단일-체인 정합
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-COSMOS-01: cosmos 형제망 preset 필드/bech32 prefix/단일-체인(1d4201c 가드)', () => {
  const cases = [
    { id: 'coreum-transfer', chainId: 'cosmos:coreum-mainnet-1/slip44:990', chain_id: 'coreum-mainnet-1', prefix: 'core', denom: 'ucore' },
    { id: 'coreum-testnet-transfer', chainId: 'cosmos:coreum-testnet-1/slip44:990', chain_id: 'coreum-testnet-1', prefix: 'testcore', denom: 'utestcore' },
    { id: 'hippo-transfer', chainId: 'cosmos:hippo-protocol-1/slip44:118', chain_id: 'hippo-protocol-1', prefix: 'hippo', denom: 'ahp' },
    { id: 'hippo-testnet-transfer', chainId: 'cosmos:hippo-protocol-testnet-1/slip44:118', chain_id: 'hippo-protocol-testnet-1', prefix: 'hippo', denom: 'ahp' },
  ]
  // 레퍼런스 atom-transfer의 20-byte 키 데이터 (self-key 재인코딩 invariant 검증용)
  const atomRef = SAMPLE_REST_PRESETS.find((x: any) => x.id === 'atom-transfer')
  const atomData = bech32Data(atomRef.transaction.msgs[0].value.from_address)
  cases.forEach((c) => {
    const p = SAMPLE_REST_PRESETS.find((x: any) => x.id === c.id)
    expect(p).toBeDefined()
    expect(p.family).toBe('cosmos')
    // 단일-체인 한정 (mainnet payload sidechain auto-fill 회귀 방지)
    expect(p.applicableChainIds).toEqual([c.chainId])
    const tx = p.transaction
    expect(tx.chain_id).toBe(c.chain_id)
    const msg = tx.msgs[0]
    expect(msg.type).toBe('cosmos-sdk/MsgSend')
    // bech32 디코드: HRP prefix가 정확히 일치 + 20-byte 데이터가 atom 레퍼런스와 동일(self-key 재인코딩)
    const dec = bech32.decode(msg.value.from_address)
    expect(dec.prefix).toBe(c.prefix)
    expect(bytesEq(bech32Data(msg.value.from_address), atomData)).toBe(true)
    // self-send
    expect(msg.value.to_address).toBe(msg.value.from_address)
    expect(msg.value.amount[0].denom).toBe(c.denom)
    expect(tx.fee.amount[0].denom).toBe(c.denom)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-REST-POLKADOT-01 (m09-04-17): polkadot 형제망 4개 preset — method/args/SS58/단일-체인 정합
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-POLKADOT-01: polkadot 형제망 preset method/args/SS58/단일-체인(1d4201c 가드)', () => {
  const cases = [
    { id: 'astar-transfer', chainId: 'polkadot:9eb76c5184c4ab8679d2d5d819fdf90b/slip44:810', ss58: 5 },
    { id: 'shibuya-transfer', chainId: 'polkadot:ddb89643205c8fe1c79afeb31f48d50f/slip44:810', ss58: 5 },
    { id: 'creditcoin-transfer', chainId: 'polkadot:6673c7e2c2b7bde45a60c71ef70d9c7c/slip44:354', ss58: 42 },
    { id: 'creditcoin-testnet-transfer', chainId: 'polkadot:8a2e8af69a7892d2e60a77e3df4e0fa0/slip44:354', ss58: 42 },
  ]
  // 레퍼런스 dot-transfer의 pubkey (self-key 재인코딩 invariant 검증용)
  const dotRef = SAMPLE_REST_PRESETS.find((x: any) => x.id === 'dot-transfer')
  const dotPubkey = decodeSs58(dotRef.transaction.args[0]).pubkey
  cases.forEach((c) => {
    const p = SAMPLE_REST_PRESETS.find((x: any) => x.id === c.id)
    expect(p).toBeDefined()
    expect(p.family).toBe('polkadot')
    expect(p.applicableChainIds).toEqual([c.chainId])
    const tx = p.transaction
    // `balances.transfer` 는 라이브 런타임에 없다 — Substrate 가 제거하고 `transferAllowDeath` 로
    // 대체했다(a779a8a 실측: @polkadot/api metadata, polkadot spec 2003000 / astar 2207 의
    // balances.* 에 `transfer` 부재). 그 커밋이 preset 만 교정하고 이 단언을 안 고쳐 red 였다.
    expect(tx.method).toBe('balances.transferAllowDeath')
    expect(Array.isArray(tx.args)).toBe(true)
    expect(tx.args.length).toBe(2)
    // args[0] = SS58 자기주소: 디코드하여 network prefix 정확 일치 + pubkey가 dot 레퍼런스와 동일(self-key 재인코딩)
    expect(typeof tx.args[0]).toBe('string')
    const ss58 = decodeSs58(tx.args[0])
    expect(ss58.prefix).toBe(c.ss58)
    expect(bytesEq(ss58.pubkey, dotPubkey)).toBe(true)
    // args[1] = Planck 금액 문자열 (decimals 18 → 1e18)
    expect(tx.args[1]).toBe('1000000000000000000')
    // dead chain-specific 필드 생략 (sidechain에 mainnet identity auto-fill 방지)
    expect(tx).not.toHaveProperty('genesisHash')
    expect(tx).not.toHaveProperty('specVersion')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-REST-SCOPE-01 (m09-04-17): 신규 형제망 preset 전체 — payload chain 식별자 ↔ applicableChainIds 1:1
// (mismatch 0, commit 1d4201c 회귀 가드 — mainnet payload가 sidechain에 auto-fill되는 버그 방지)
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-REST-SCOPE-01: 신규 cosmos/polkadot preset payload 식별자 ↔ applicableChainIds 1:1 (mismatch 0)', () => {
  const newIds = [
    'coreum-transfer', 'coreum-testnet-transfer', 'hippo-transfer', 'hippo-testnet-transfer',
    'astar-transfer', 'shibuya-transfer', 'creditcoin-transfer', 'creditcoin-testnet-transfer',
  ]
  newIds.forEach((id) => {
    const p = SAMPLE_REST_PRESETS.find((x: any) => x.id === id)
    expect(p).toBeDefined()
    // 모든 신규 preset은 단일-체인 한정
    expect(p.applicableChainIds.length).toBe(1)
    if (p.family === 'cosmos') {
      // payload chain_id가 applicableChainIds의 chain 세그먼트와 1:1 일치
      const chainSeg = p.applicableChainIds[0].split('/')[0].split(':')[1]
      expect(p.transaction.chain_id).toBe(chainSeg)
    } else {
      // polkadot: chain-specific dead 필드를 생략하여 mismatch 벡터 자체를 제거
      expect(p.transaction).not.toHaveProperty('genesisHash')
      expect(p.transaction).not.toHaveProperty('blockHash')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-PRESET-COMPLETE-01 / T-PRESET-FIELDSHAPE-01 (m09-04-24)
// wm no-network(pure-signer) 계약: ①prepare-skip / ③marker-consume family preset이
// 완성 consensus 필드를 담아야 wm이 -32602 없이 서명한다. connector preset은 만료성
// live 값이 아닌 "대표값(유효 형식)"만 책임 — 서명 시점 실값 주입은 bridge/wm 담당.
// 여기서는 rest.json의 cosmos/tron/algorand/conflux/vechain family field presence + 값 형식만 단언.
// (COMPLETE와 FIELDSHAPE가 같은 ID 배열을 공유 — subset sampling으로 미검증 preset이 회귀하는 구멍 방지.)
// trx-trc20-descriptor-transfer(form-D descriptor)는 raw_data가 없어 ref_block 필드가 없다 —
// wm이 descriptor→raw_data를 구성하므로 여기서 완성 대상이 아님(Solana form-D 제외와 동형). 의도적 제외.
// ─────────────────────────────────────────────────────────────────────────────
const restById = (id: string) => SAMPLE_REST_PRESETS.find((x: any) => x.id === id)
const COSMOS_IDS = [
  'atom-transfer', 'coreum-transfer', 'coreum-assetft-transfer', 'coreum-testnet-transfer',
  'hippo-transfer', 'hippo-testnet-transfer', 'cosmos-assetft-descriptor-transfer',
]
const TRON_RAW_IDS = ['trx-transfer', 'trx-trc20-transfer', 'trx-trc20-approve'] // descriptor 제외(raw_data 없음)
const ALGO_IDS = ['algo-payment', 'algo-asa-transfer', 'algo-asa-descriptor-transfer']
const VET_IDS = ['vet-transfer', 'vet-vip180-transfer']

it('T-PRESET-COMPLETE-01(rest): cosmos/tron/algorand/conflux/vechain preset이 no-network 완성 필드를 포함', () => {
  // Cosmos ① — account_number/sequence + 완성 fee(gas+amount). placeholder("0") 금지.
  COSMOS_IDS.forEach((id) => {
    const tx = restById(id)!.transaction
    expect(tx).toHaveProperty('account_number')
    expect(tx).toHaveProperty('sequence')
    expect(tx.account_number).not.toBe('0') // 0 = module-account placeholder
    expect(tx.fee).toBeTruthy()
    expect(tx.fee.gas).toBeTruthy()
    expect(Array.isArray(tx.fee.amount)).toBe(true)
    expect(tx.fee.amount.length).toBeGreaterThan(0)
  })

  // Tron ③ — raw_data ref_block_bytes/ref_block_hash (placeholder 0000/0000… 금지)
  TRON_RAW_IDS.forEach((id) => {
    const rd = restById(id)!.transaction.raw_data
    expect(rd.ref_block_bytes).toBeTruthy()
    expect(rd.ref_block_bytes).not.toBe('0000')
    expect(rd.ref_block_hash).not.toBe('0000000000000000')
    expect(rd.ref_block_hash.length).toBe(16) // 8 bytes hex
  })
  expect(restById('trx-transfer')!.transaction.fee_limit).toBeGreaterThan(0)

  // Algorand ③ — firstRound/lastRound (placeholder 1/1000 금지) + genesis 필드
  ALGO_IDS.forEach((id) => {
    const tx = restById(id)!.transaction
    expect(tx.firstRound).toBeGreaterThan(1)
    expect(tx.lastRound).toBeGreaterThan(tx.firstRound)
    expect(tx.genesisHash).toBeTruthy()
    expect(tx.genesisID).toBeTruthy()
  })

  // Conflux ① — epochHeight (placeholder 0x0 금지) + gas/gasPrice/storageLimit/nonce
  const cfx = restById('cfx-transfer')!.transaction
  expect(cfx.epochHeight).toBeTruthy()
  expect(cfx.epochHeight).not.toBe('0x0')
  ;['gas', 'gasPrice', 'storageLimit', 'nonce'].forEach((f) => expect(cfx).toHaveProperty(f))

  // Vechain ③ — blockRef (placeholder 0x0000… 금지). rest.json에 vet-transfer/vet-vip180-transfer 존재.
  VET_IDS.forEach((id) => {
    const tx = restById(id)!.transaction
    expect(tx.blockRef).toBeTruthy()
    expect(tx.blockRef).not.toBe('0x0000000000000000')
    expect(tx.blockRef).toMatch(/^0x[0-9a-fA-F]{16}$/)
  })
})

it('T-PRESET-FIELDSHAPE-01(rest): cosmos/tron/algorand/conflux/vechain 값 형식 정합 (전 preset)', () => {
  const HEX_RE = /^0x[0-9a-fA-F]+$/
  const DEC_STR_RE = /^\d+$/
  const BLOCKREF_RE = /^0x[0-9a-fA-F]{16}$/

  // Cosmos: account_number/sequence = decimal string (전 preset)
  COSMOS_IDS.forEach((id) => {
    const tx = restById(id)!.transaction
    expect(typeof tx.account_number).toBe('string')
    expect(tx.account_number).toMatch(DEC_STR_RE)
    expect(typeof tx.sequence).toBe('string')
    expect(tx.sequence).toMatch(DEC_STR_RE)
  })

  // Tron: ref_block_bytes/ref_block_hash = lowercase hex (no 0x prefix) — 전 raw_data preset
  TRON_RAW_IDS.forEach((id) => {
    const rd = restById(id)!.transaction.raw_data
    expect(rd.ref_block_bytes).toMatch(/^[0-9a-f]+$/)
    expect(rd.ref_block_hash).toMatch(/^[0-9a-f]{16}$/)
  })

  // Algorand: firstRound/lastRound = positive integers, firstRound<lastRound (전 preset)
  ALGO_IDS.forEach((id) => {
    const algo = restById(id)!.transaction
    expect(Number.isInteger(algo.firstRound)).toBe(true)
    expect(Number.isInteger(algo.lastRound)).toBe(true)
    expect(algo.firstRound).toBeGreaterThan(0)
    expect(algo.lastRound).toBeGreaterThan(algo.firstRound)
  })

  // Conflux: epochHeight = 0x-hex
  expect(restById('cfx-transfer')!.transaction.epochHeight).toMatch(HEX_RE)

  // Vechain: blockRef = 0x + 16 hex (전 preset)
  VET_IDS.forEach((id) => {
    expect(restById(id)!.transaction.blockRef).toMatch(BLOCKREF_RE)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-BLOB-SHAPE-01 (m09-04-25, Polkadot 부분 — 실제 파일 배치: dot-transfer 등 polkadot family가
// presets.non-evm.json이 아닌 presets.rest.json에 있어 여기서 검증. WIRE-NONETWORK-SDK-CHANGES
// §2 Polkadot row: 신규 `extra.scaleHex`(SCALE-encoded unsigned extrinsic) 필드 존재 확인.
// ─────────────────────────────────────────────────────────────────────────────
it('T-BLOB-SHAPE-01(rest, polkadot): dot-scalehex-unsigned-passthrough — extra.scaleHex 필드 존재 + hex 형식', () => {
  const p = restById('dot-scalehex-unsigned-passthrough')
  expect(p).toBeDefined()
  expect(p!.family).toBe('polkadot')
  const tx = p!.transaction
  expect(tx).toHaveProperty('extra')
  expect(tx.extra).toHaveProperty('scaleHex')
  expect(typeof tx.extra.scaleHex).toBe('string')
  expect(tx.extra.scaleHex).toMatch(/^0x[0-9a-fA-F]+$/)
  // nonce/tip은 app 제공 유지 (Polkadot은 partial blind-sign — display-safety RPC는 wm이 허용)
  expect(tx).toHaveProperty('nonce')
  expect(tx).toHaveProperty('tip')
})

// 크로스리뷰(Codex) 발견 회귀 가드: scaleHex(authoritative, signing 대상) 내부의 AccountId32가
// 문서화된 self-send 레퍼런스 주소(dot-transfer와 동일 계정)와 byte-identical해야 한다 — 다르면
// note가 서술하는 "누구에게 서명하는가"와 실제 서명 바이트가 어긋나는 display/authoritative mismatch.
//
// (2026-07-22, 커밋 02bd6fa 이후 정정) 이 preset(Form A/blob)은 `method`/`args`를 두지 않는다 —
// blob이 call을 통째로 담으므로 args를 병기하면 같은 값의 이중 표현이 되고, 그 순간 drift가 난다
// (실측: 하네스가 blob의 dest만 치환하고 args[0]을 남겨 표시-서명 불일치가 발생한 전례, note 참조).
// 따라서 이 테스트는 더 이상 preset 자신의 args[0]과 비교하지 않고, dot-transfer(Form B, args를
// 유지하는 decoded preset)가 문서화한 동일 self-send 주소를 레퍼런스로 삼는다 — 원래 가드의 취지
// ("표시되는 주소 == 실제 서명되는 주소")는 그대로 유지하면서 이중 표현 재도입은 피한다.
it('T-BLOB-SHAPE-01(rest, polkadot): scaleHex 내 AccountId32 == 문서화된 self-send 레퍼런스 주소 (display/authoritative 일치)', () => {
  const p = restById('dot-scalehex-unsigned-passthrough')!
  const tx = p.transaction
  expect(tx).not.toHaveProperty('args')
  expect(tx).not.toHaveProperty('method')

  const dotRef = SAMPLE_REST_PRESETS.find((x: any) => x.id === 'dot-transfer')
  const referencePubkey = decodeSs58(dotRef.transaction.args[0]).pubkey

  // scaleHex = 0x + callIndex(2B) + MultiAddress tag(1B) + AccountId32(32B) + Compact<Balance>
  const hex = (tx.extra.scaleHex as string).slice(2)
  const bytes = Buffer.from(hex, 'hex')
  const accountId32 = bytes.subarray(3, 35)

  expect(bytesEq(referencePubkey, new Uint8Array(accountId32))).toBe(true)
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-REST-COSMOS-AMT-01: cosmos preset 금액이 온체인 성공 가능 범위인지
//
// 실기기 검증(2026-07-22)에서 atom-transfer 가 **브로드캐스트는 수락(code 0)** 됐으나 실행
// 단계에서 실패했다: `spendable balance 50874uatom is smaller than 1000000uatom:
// insufficient funds` (블록 32144289). cosmoshub 는 메인넷이라 faucet 이 없어 실기기 계정
// 잔액이 소액이고, self-send 라도 검증 시점에 `잔액 ≥ amount + fee` 여야 한다.
//
// 금액을 다시 키우면 온체인 검증(VERIFIED)이 영구히 불가능해지므로 상한을 가드한다.
it('T-U-REST-COSMOS-AMT-01: atom-transfer 금액은 실기기 잔액 범위 안 (온체인 성공 가능)', () => {
  const p = SAMPLE_REST_PRESETS.find((x: any) => x.id === 'atom-transfer')
  expect(p).toBeDefined()
  const send = p.transaction.msgs[0].value.amount[0]
  expect(send.denom).toBe('uatom')
  // 1 ATOM(1e6)은 실기기 잔액(~0.05 ATOM)을 초과해 실행 실패했다 → 소액 유지
  expect(Number(send.amount)).toBeLessThanOrEqual(100000) // ≤ 0.1 ATOM
  expect(Number(send.amount)).toBeGreaterThan(0)

  // fee 는 cosmoshub 최소가스가격을 충족해야 브로드캐스트가 수락된다(5000 은 실측 통과값)
  const fee = p.transaction.fee
  expect(fee.amount[0].denom).toBe('uatom')
  expect(Number(fee.amount[0].amount)).toBeGreaterThanOrEqual(5000)

  // 잔액 안에서 성립해야 하는 부등식: amount + fee ≤ 실측 잔액(50874 uatom)
  expect(Number(send.amount) + Number(fee.amount[0].amount)).toBeLessThanOrEqual(50874)
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-REST-COSMOS-DESC-01: form-D descriptor 는 온체인 실토큰과 정합해야 한다
//
// 이 preset 의 전제는 [coreum mainnet 온체인 실재 + wm smart-token.json 미등록] 이다.
// descriptor(symbol/decimals)가 실제 토큰과 어긋나면 기기 화면이 **틀린 값을 보여주고도
// 서명이 성립**한다 — 표시=서명 계약이 깨지는 가장 위험한 형태다.
//
// txd-core1pjt5… = TXDex Rewards Token, symbol TXD, precision 6
// (2026-07-22 /coreum/asset/ft/v1/tokens + /cosmos/bank/.../denoms_metadata 조회 확증)
// 실기기 화면 실측: "1 XRP"(이전 drop- 토큰) — descriptor 가 그대로 표시되므로
// descriptor 가 틀리면 사용자가 틀린 자산명을 보고 서명한다.
it('T-U-REST-COSMOS-DESC-01: descriptor 의 symbol/decimals 가 온체인 토큰과 일치', () => {
  const p = SAMPLE_REST_PRESETS.find((x: any) => x.id === 'cosmos-assetft-descriptor-transfer')
  expect(p).toBeDefined()
  const t = p.transaction.token
  // denom 의 subunit prefix(txd-) 와 symbol(TXD) 은 같은 토큰을 가리켜야 한다
  const subunit = String(t.contract).split('-')[0]
  expect(subunit).toBe('txd')
  expect(String(t.symbol).toLowerCase()).toBe(subunit)
  expect(t.decimals).toBe(6) // 온체인 precision
  // amount 는 base units — decimals 6 기준 1 토큰. 검증 계정 보유량(100 TXD) 안에 있어야
  // 온체인 성공까지 도달한다(이전 drop- 토큰은 잔액 0 이라 항상 실패했다).
  expect(Number(t.amount)).toBeLessThanOrEqual(1000000)
  expect(Number(t.amount)).toBeGreaterThan(0)
})

// T-U-REST-COSMOS-AMT-02: mainnet cosmos preset 금액이 실기기 잔액 범위 안인지
//
// cosmoshub / coreum mainnet 은 **faucet 이 없어** 실기기 계정 잔액이 소액이다. 금액이
// 잔액을 넘으면 서명·수수료가 다 맞아도 실행에서 insufficient funds 로 끝나 온체인
// 검증(VERIFIED)에 도달할 수 없다. 실측(2026-07-22):
//   atom-transfer   1 ATOM > 0.0509 ATOM → 블록 32144289 code 5
//   coreum-transfer 1 TX   > 0.592 TX    (교체 전)
// 수수료는 preset 값이 아니라 prepare 가 wm 산출값으로 채우므로 여기서 가드하지 않는다.
it('T-U-REST-COSMOS-AMT-02: mainnet preset 금액이 소액 유지 (온체인 성공 가능)', () => {
  const CASES = [
    { id: 'atom-transfer', denom: 'uatom', maxBase: 100000 },   // ≤ 0.1 ATOM
    { id: 'coreum-transfer', denom: 'ucore', maxBase: 100000 }, // ≤ 0.1 TX
  ]
  CASES.forEach((c) => {
    const p = SAMPLE_REST_PRESETS.find((x: any) => x.id === c.id)
    expect(p).toBeDefined()
    const send = p.transaction.msgs[0].value.amount[0]
    expect(send.denom).toBe(c.denom)
    expect(Number(send.amount)).toBeGreaterThan(0)
    expect(Number(send.amount)).toBeLessThanOrEqual(c.maxBase)
  })
})
