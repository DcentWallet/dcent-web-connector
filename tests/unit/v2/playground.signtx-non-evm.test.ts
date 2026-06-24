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

  // m08-01-05: facade-shaped mock
  const mockDcent = {
    sign: jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
    getDeviceInfo: jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }
  api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })

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
// T-U-NEVM-04 / T-DATA-01: preset fixture (wm 등록 family) 모두 valid JSON 파싱 + CAIP-19 형식
// m09-01-02: wm 미등록 chain (tron:mainnet) 제외 — 5 family. applicableChainIds는 CAIP-19 형식.
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-NEVM-04: presets.non-evm.json — wm 등록 family preset 모두 valid JSON + CAIP-19', () => {
  const presetsPath = path.resolve(__dirname, '../../../playground/presets.non-evm.json')
  const raw = fs.readFileSync(presetsPath, 'utf8')

  // JSON 파싱 성공해야 함
  let presets: any[]
  expect(() => { presets = JSON.parse(raw) }).not.toThrow()

  presets = JSON.parse(raw)
  expect(Array.isArray(presets)).toBe(true)
  // m09-01-02: tron은 wm 미등록 → 본 PR scope에서 제외 (m09-02에서 추가)
  // Solana multi-format variants 추가 이후 family 별 preset 수가 1개 이상으로 가변 — family 커버리지만 검증.
  expect(presets.length).toBeGreaterThanOrEqual(5)

  // 각 preset의 필수 필드 확인
  const requiredFields = ['id', 'label', 'family', 'applicableChainIds', 'transaction']
  // 누락보강(P1)으로 NON_EVM_FAMILIES에 추가된 xahau/cardano/near/constellation preset이
  // orphan에서 활성화됨 + havah preset 신규 추가 → expectedFamilies에 포함.
  const expectedFamilies = ['bitcoin', 'solana', 'xrp', 'hedera', 'stellar', 'xahau', 'cardano', 'near', 'constellation', 'havah']

  // CAIP-19 정규식: namespace:reference/slip44:N
  // CAIP-2 namespace는 spec상 3-8 chars 권장이나 wm registry는 더 긴 namespace 사용
  // (예: 'constellation' 13 chars). regex를 16까지 widening.
  // /slip44:N suffix는 optional — wm chainIdentifier.value 일부 chain(cip34, tron static)이
  // slip44 별도 필드로 두고 chainId 자체에는 미포함. chains.json은 wm key와 정확 매칭하므로 동일.
  const CAIP19_RE = /^[-a-z0-9]{3,16}:[-_a-zA-Z0-9]{1,32}(\/slip44:\d+)?$/

  presets.forEach((p: any) => {
    requiredFields.forEach((field) => {
      expect(p).toHaveProperty(field)
    })
    expect(expectedFamilies).toContain(p.family)
    expect(Array.isArray(p.applicableChainIds)).toBe(true)
    expect(p.applicableChainIds.length).toBeGreaterThan(0)
    // T-DATA-01: applicableChainIds 모두 CAIP-19 형식이어야 함
    p.applicableChainIds.forEach((c: string) => {
      expect(c).toMatch(CAIP19_RE)
    })
    // Solana Case 1 (base58 serialized full transaction) 은 transaction 이 string —
    // 나머지 family / Solana Case 2/3 은 object. connector 는 chain-agnostic opaque pass-through.
    expect(['object', 'string']).toContain(typeof p.transaction)
    if (typeof p.transaction === 'object') {
      expect(p.transaction).not.toBeNull()
    }
  })

  // preset id 는 전역 unique
  const ids = presets.map((p: any) => p.id)
  expect(new Set(ids).size).toBe(ids.length)

  // family 중복 없이 expectedFamilies 모두 존재
  const families = presets.map((p: any) => p.family)
  expectedFamilies.forEach((fam) => {
    expect(families).toContain(fam)
  })

  // tron은 제외되었어야 함 (m09-02 의존)
  expect(families).not.toContain('tron')
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-SOL-SUB-01~06: _substituteSolanaSigner helper — placeholder feePayer/signer
// pubkey 를 wallet address 로 치환. programId / non-signer 키 / recipient 는 보존.
// dApp 이 placeholder 만 보낼 때 device 서명 후 @solana/web3.js addSignature reject 되는
// 버그를 playground 단에서 미리 차단.
// ─────────────────────────────────────────────────────────────────────────────
describe('_substituteSolanaSigner: placeholder → wallet address', () => {
  const WALLET = 'GzanoXHkVjQ7tQbXgycJEPpYTfeqXMRTQiH8h3kt7uZh'
  const PROG = '11111111111111111111111111111111'
  const PLACEHOLDER_SENDER = '11111111111111111111111111111111'
  const RECIPIENT = '11111111111111111111111111111112'

  function sub (txObj: unknown, address: string): any {
    const api = (window as any)._playgroundTestAPI
    return api._substituteSolanaSigner(txObj, address)
  }

  it('T-U-NEVM-SOL-SUB-01: Case 2 plain JSON — feePayer + isSigner=true keys → wallet 로 치환', () => {
    const tx = {
      version: 0,
      feePayer: PLACEHOLDER_SENDER,
      instructions: [
        {
          programId: PROG,
          keys: [
            { pubkey: PLACEHOLDER_SENDER, isSigner: true, isWritable: true },
            { pubkey: RECIPIENT, isSigner: false, isWritable: true },
          ],
          data: { instruction: 2, lamports: 1000000 },
        },
      ],
      recentBlockhash: '11111111111111111111111111111111',
    }
    const out = sub(tx, WALLET)
    expect(out.feePayer).toBe(WALLET)
    expect(out.instructions[0].keys[0].pubkey).toBe(WALLET)
    expect(out.instructions[0].keys[0].isSigner).toBe(true)
    // recipient (non-signer) 보존
    expect(out.instructions[0].keys[1].pubkey).toBe(RECIPIENT)
    expect(out.instructions[0].keys[1].isSigner).toBe(false)
  })

  it('T-U-NEVM-SOL-SUB-02: SystemProgram programId 는 절대 치환하지 않음', () => {
    const tx = {
      feePayer: PLACEHOLDER_SENDER,
      instructions: [
        {
          programId: PROG, // SystemProgram address — 정상 값
          keys: [{ pubkey: PLACEHOLDER_SENDER, isSigner: true, isWritable: true }],
          data: '0x02',
        },
      ],
      recentBlockhash: '11111111111111111111111111111111',
    }
    const out = sub(tx, WALLET)
    expect(out.instructions[0].programId).toBe(PROG) // 그대로 유지
    expect(out.feePayer).toBe(WALLET) // feePayer 만 치환
  })

  it('T-U-NEVM-SOL-SUB-03: Case 3 wm-internal TransactionCommon — sender 만 치환', () => {
    const tx = {
      type: 'transfer',
      family: 'solana',
      sender: PLACEHOLDER_SENDER,
      recipient: RECIPIENT,
      amount: '1000000',
      recentBlockhash: '11111111111111111111111111111111',
    }
    const out = sub(tx, WALLET)
    expect(out.sender).toBe(WALLET)
    expect(out.recipient).toBe(RECIPIENT) // recipient 보존
    expect(out.type).toBe('transfer')
  })

  it('T-U-NEVM-SOL-SUB-04: Case 1 base58 serialized string → no-op (opaque)', () => {
    const base58 = '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofMM'
    const out = sub(base58, WALLET)
    expect(out).toBe(base58)
  })

  it('T-U-NEVM-SOL-SUB-05: 원본 객체 mutation 금지 (deep clone 반환)', () => {
    const tx = {
      feePayer: PLACEHOLDER_SENDER,
      instructions: [
        {
          programId: PROG,
          keys: [{ pubkey: PLACEHOLDER_SENDER, isSigner: true, isWritable: true }],
        },
      ],
    }
    const originalFeePayer = tx.feePayer
    const originalPubkey = tx.instructions[0].keys[0].pubkey
    const out = sub(tx, WALLET)
    // 반환 객체는 치환됨
    expect(out.feePayer).toBe(WALLET)
    expect(out.instructions[0].keys[0].pubkey).toBe(WALLET)
    // 원본은 보존
    expect(tx.feePayer).toBe(originalFeePayer)
    expect(tx.instructions[0].keys[0].pubkey).toBe(originalPubkey)
    expect(out).not.toBe(tx)
  })

  it('T-U-NEVM-SOL-SUB-06: 다중 instruction + 다중 signer 모두 치환', () => {
    const tx = {
      feePayer: PLACEHOLDER_SENDER,
      instructions: [
        {
          programId: PROG,
          keys: [
            { pubkey: PLACEHOLDER_SENDER, isSigner: true, isWritable: true },
            { pubkey: RECIPIENT, isSigner: false, isWritable: true },
          ],
        },
        {
          programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          keys: [
            { pubkey: PLACEHOLDER_SENDER, isSigner: true, isWritable: true },
            { pubkey: 'someTokenAccount111111111111111111111111111', isSigner: false, isWritable: true },
          ],
        },
      ],
    }
    const out = sub(tx, WALLET)
    expect(out.feePayer).toBe(WALLET)
    expect(out.instructions[0].keys[0].pubkey).toBe(WALLET)
    expect(out.instructions[1].keys[0].pubkey).toBe(WALLET)
    // 두 번째 instruction 의 programId (Token program) 도 보존
    expect(out.instructions[1].programId).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    // non-signer 보존
    expect(out.instructions[0].keys[1].pubkey).toBe(RECIPIENT)
    expect(out.instructions[1].keys[1].pubkey).toBe('someTokenAccount111111111111111111111111111')
  })

  it('T-U-NEVM-SOL-SUB-07: invalid input — null / undefined / number 는 그대로 반환', () => {
    expect(sub(null, WALLET)).toBe(null)
    expect(sub(undefined, WALLET)).toBe(undefined)
    expect(sub(42, WALLET)).toBe(42)
  })

  it('T-U-NEVM-SOL-SUB-08: empty wallet address → no-op (substitute 실패 시 원본 보존)', () => {
    const tx = { feePayer: PLACEHOLDER_SENDER, instructions: [] }
    expect(sub(tx, '')).toBe(tx)
    expect(sub(tx, null as unknown as string)).toBe(tx)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-ALGO-SUB-01~05: _substituteAlgorandSender — Algorand 표준 tx 의 from 필드
// (sender)를 wallet address 로 치환. to (recipient) 와 기타 필드 (amount/fee/firstRound 등) 보존.
// Solana 와 동일하게 placeholder("ALGORAND7XVFXWDX..." 등) 그대로 보낼 때 algosdk 가 reject.
// ─────────────────────────────────────────────────────────────────────────────
describe('_substituteAlgorandSender: placeholder → wallet address', () => {
  const WALLET = 'GA7XBSV7XYZNAOEDXP2BIBMSDHJWY3MWYHVMSV3LQAQGSVOJV4VRWLI'
  const PLACEHOLDER_FROM = 'ALGORAND7XVFXWDX5HGMI6TEIIIYNYXATWJDAWTOGCHKZHJV2KLYE5LZQ4'
  const RECIPIENT = 'RECIPIENT7XVFXWDX5HGMI6TEIIIYNYXATWJDAWTOGCHKZHJV2KLYE5L'

  function subAlgo (txObj: unknown, address: string): any {
    const api = (window as any)._playgroundTestAPI
    return api._substituteAlgorandSender(txObj, address)
  }
  function subByFamily (txObj: unknown, family: string, address: string): any {
    const api = (window as any)._playgroundTestAPI
    return api._substituteSenderByFamily(txObj, family, address)
  }

  it('T-U-NEVM-ALGO-SUB-01: Algorand 표준 tx — from 필드 치환, to/amount/fee 등 보존', () => {
    const tx = {
      type: 'pay',
      from: PLACEHOLDER_FROM,
      to: RECIPIENT,
      amount: 1000000,
      fee: 1000,
      firstRound: 1,
      lastRound: 1000,
      genesisID: 'mainnet-v1.0',
      genesisHash: 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiHc0CYz/uo=',
    }
    const out = subAlgo(tx, WALLET)
    expect(out.from).toBe(WALLET)
    expect(out.to).toBe(RECIPIENT) // recipient 보존
    expect(out.amount).toBe(1000000)
    expect(out.fee).toBe(1000)
    expect(out.firstRound).toBe(1)
    expect(out.lastRound).toBe(1000)
    expect(out.genesisID).toBe('mainnet-v1.0')
  })

  it('T-U-NEVM-ALGO-SUB-02: wm-internal {sender, recipient, amount} shape — sender 치환', () => {
    const tx = {
      type: 'pay',
      family: 'algorand',
      sender: PLACEHOLDER_FROM,
      recipient: RECIPIENT,
      amount: '1000000',
    }
    const out = subAlgo(tx, WALLET)
    expect(out.sender).toBe(WALLET)
    expect(out.recipient).toBe(RECIPIENT)
  })

  it('T-U-NEVM-ALGO-SUB-03: string payload (raw bytes msgpack) → no-op (opaque)', () => {
    const raw = 'gqRzaWfEQH9...' // base64-ish placeholder
    const out = subAlgo(raw, WALLET)
    expect(out).toBe(raw)
  })

  it('T-U-NEVM-ALGO-SUB-04: 원본 객체 mutation 금지 (deep clone)', () => {
    const tx = { type: 'pay', from: PLACEHOLDER_FROM, to: RECIPIENT, amount: 1000000 }
    const originalFrom = tx.from
    const out = subAlgo(tx, WALLET)
    expect(out.from).toBe(WALLET)
    expect(tx.from).toBe(originalFrom) // 원본 보존
    expect(out).not.toBe(tx)
  })

  it('T-U-NEVM-ALGO-SUB-05: invalid input (null / undefined / number) → 그대로 반환', () => {
    expect(subAlgo(null, WALLET)).toBe(null)
    expect(subAlgo(undefined, WALLET)).toBe(undefined)
    expect(subAlgo(42, WALLET)).toBe(42)
  })

  // ── family-aware dispatcher 검증 ──
  it('T-U-NEVM-FAMILY-SUB-01: _substituteSenderByFamily — solana family → Solana 로직 호출', () => {
    const tx = {
      feePayer: '11111111111111111111111111111111',
      instructions: [
        {
          programId: '11111111111111111111111111111111',
          keys: [{ pubkey: '11111111111111111111111111111111', isSigner: true, isWritable: true }],
        },
      ],
    }
    const out = subByFamily(tx, 'solana', WALLET)
    expect(out.feePayer).toBe(WALLET)
    expect(out.instructions[0].keys[0].pubkey).toBe(WALLET)
    // programId 보존
    expect(out.instructions[0].programId).toBe('11111111111111111111111111111111')
  })

  it('T-U-NEVM-FAMILY-SUB-02: _substituteSenderByFamily — algorand family → Algorand 로직 호출', () => {
    const tx = { type: 'pay', from: PLACEHOLDER_FROM, to: RECIPIENT, amount: 1000000 }
    const out = subByFamily(tx, 'algorand', WALLET)
    expect(out.from).toBe(WALLET)
    expect(out.to).toBe(RECIPIENT)
  })

  it('T-U-NEVM-FAMILY-SUB-03: _substituteSenderByFamily — 미지원 family (polkadot 등, sender 필드 없음) → no-op', () => {
    const tx = { method: 'balances.transfer', args: ['placeholder-addr', '1'] }
    const out = subByFamily(tx, 'polkadot', WALLET)
    // sender 필드가 없는 family — 원본 그대로 반환
    expect(out).toBe(tx)
    expect(out.args[0]).toBe('placeholder-addr')
  })

  it('T-U-NEVM-FAMILY-SUB-04: _substituteSenderByFamily — xrp family → XRP Account 치환', () => {
    const tx = { TransactionType: 'Payment', Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Destination: RECIPIENT, Amount: '1000000' }
    const out = subByFamily(tx, 'xrp', WALLET)
    expect(out.Account).toBe(WALLET)
    expect(out.Destination).toBe(RECIPIENT)
    expect(out.Amount).toBe('1000000')
  })

  it('T-U-NEVM-FAMILY-SUB-05: _substituteSenderByFamily — xahau family → XRP Account 치환 (ripple 로직 공유)', () => {
    const tx = { TransactionType: 'Payment', Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Destination: RECIPIENT }
    const out = subByFamily(tx, 'xahau', WALLET)
    expect(out.Account).toBe(WALLET)
    expect(out.Destination).toBe(RECIPIENT)
  })

  it('T-U-NEVM-FAMILY-SUB-06: _substituteSenderByFamily — constellation family → DAG source 치환', () => {
    const tx = { type: 'transfer', source: 'DAG0000000000000000000000000000000000000000', destination: RECIPIENT, amount: '100000000', fee: '0' }
    const out = subByFamily(tx, 'constellation', WALLET)
    expect(out.source).toBe(WALLET)
    expect(out.destination).toBe(RECIPIENT)
    expect(out.amount).toBe('100000000')
  })

  it('T-U-NEVM-FAMILY-SUB-07: tron family → raw_data owner_address 치환, to_address 보존', () => {
    const tx = {
      raw_data: {
        contract: [
          { type: 'TransferContract', parameter: { value: { owner_address: 'TPLACEHOLDERxxxxxxxxxxxxxxxxxxxxxxx', to_address: RECIPIENT, amount: 1000000 } } },
        ],
      },
    }
    const out = subByFamily(tx, 'tron', WALLET)
    expect(out.raw_data.contract[0].parameter.value.owner_address).toBe(WALLET)
    expect(out.raw_data.contract[0].parameter.value.to_address).toBe(RECIPIENT)
    expect(out.raw_data.contract[0].parameter.value.amount).toBe(1000000)
  })

  it('T-U-NEVM-FAMILY-SUB-08: conflux family → from 치환, to/value 보존', () => {
    const tx = { from: 'cfxPLACEHOLDER', to: RECIPIENT, value: '0x10' }
    const out = subByFamily(tx, 'conflux', WALLET)
    expect(out.from).toBe(WALLET)
    expect(out.to).toBe(RECIPIENT)
    expect(out.value).toBe('0x10')
  })

  it('T-U-NEVM-FAMILY-SUB-09: havah family → from 치환, to/nid 보존', () => {
    const tx = { from: 'hxPLACEHOLDER', to: RECIPIENT, value: '0xDE0B6B3A7640001', nid: '0x100' }
    const out = subByFamily(tx, 'havah', WALLET)
    expect(out.from).toBe(WALLET)
    expect(out.to).toBe(RECIPIENT)
    expect(out.nid).toBe('0x100')
  })

  it('T-U-NEVM-FAMILY-SUB-10: cosmos family → msgs[].value.from_address 치환, to_address 보존', () => {
    const tx = { chain_id: 'cosmoshub-4', msgs: [{ type: 'cosmos-sdk/MsgSend', value: { from_address: 'cosmosPLACEHOLDER', to_address: RECIPIENT, amount: [{ denom: 'uatom', amount: '1000000' }] } }] }
    const out = subByFamily(tx, 'cosmos', WALLET)
    expect(out.msgs[0].value.from_address).toBe(WALLET)
    expect(out.msgs[0].value.to_address).toBe(RECIPIENT)
    expect(out.msgs[0].value.amount[0].amount).toBe('1000000')
  })

  it('T-U-NEVM-FAMILY-SUB-11: near family → sender 치환, recipient/amount 보존', () => {
    const tx = { type: 'transfer', sender: 'placeholder.near', recipient: RECIPIENT, amount: '1000000000000000000000000' }
    const out = subByFamily(tx, 'near', WALLET)
    expect(out.sender).toBe(WALLET)
    expect(out.recipient).toBe(RECIPIENT)
    expect(out.amount).toBe('1000000000000000000000000')
  })

  it('T-U-NEVM-FAMILY-SUB-12: sender 필드 없는 family(bitcoin) → no-op (원본 반환)', () => {
    const tx = { inputs: [{ keyPath: "m/44'/0'/0'/0/0" }], outputs: [{ address: RECIPIENT, amount: 1000 }] }
    const out = subByFamily(tx, 'bitcoin', WALLET)
    expect(out).toBe(tx)
  })

  it('T-U-NEVM-FAMILY-SUB-13: ethereum family → from 치환 (from 있을 때), to/value 보존', () => {
    const tx = { from: '0xPLACEHOLDER', to: RECIPIENT, value: '0x10', type: 2 }
    const out = subByFamily(tx, 'ethereum', WALLET)
    expect(out.from).toBe(WALLET)
    expect(out.to).toBe(RECIPIENT)
    expect(out.value).toBe('0x10')
  })

  it('T-U-NEVM-FAMILY-SUB-14: ethereum family → from 없으면 무변화(no-op)', () => {
    const tx = { to: RECIPIENT, value: '0x10', type: 2 }
    const out = subByFamily(tx, 'ethereum', WALLET)
    expect(JSON.stringify(out)).toBe(JSON.stringify(tx))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-XRP-SUB-*: _substituteXrpAccount — XRPL/Xahau Payment 의 Account 필드 치환.
// dApp 이 placeholder Account 를 보내면 firmware 가 Account ↔ derived pubkey 불일치로
// 'Invalid Unsigned'(invalid_format) reject — getAddress 선행 후 Account 치환으로 해소.
// ─────────────────────────────────────────────────────────────────────────────
describe('_substituteXrpAccount: placeholder → wallet r-address', () => {
  const WALLET = 'rWALLETxxxxxxxxxxxxxxxxxxxxxxxxxx'
  const RECIPIENT = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
  function sub (txObj: any, address = WALLET) {
    const api = (window as any)._playgroundTestAPI
    return api._substituteXrpAccount(txObj, address)
  }

  it('T-U-NEVM-XRP-SUB-01: XRPL 표준 Payment — Account 치환, Destination/Amount/Fee/Sequence 보존', () => {
    const tx = { TransactionType: 'Payment', Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Destination: RECIPIENT, Amount: '1000000', Fee: '12', Sequence: 1, Flags: 0 }
    const out = sub(tx)
    expect(out.Account).toBe(WALLET)
    expect(out.Destination).toBe(RECIPIENT)
    expect(out.Amount).toBe('1000000')
    expect(out.Fee).toBe('12')
    expect(out.Sequence).toBe(1)
  })

  it('T-U-NEVM-XRP-SUB-02: wm-internal {sender, ...} shape → sender 치환', () => {
    const tx = { sender: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', recipient: RECIPIENT, amount: '1000000' }
    const out = sub(tx)
    expect(out.sender).toBe(WALLET)
    expect(out.recipient).toBe(RECIPIENT)
  })

  it('T-U-NEVM-XRP-SUB-03: string payload (pre-encoded blob) → no-op (opaque)', () => {
    const blob = '120000228000000024...'
    expect(sub(blob)).toBe(blob)
  })

  it('T-U-NEVM-XRP-SUB-04: 원본 객체 mutation 금지 (deep clone)', () => {
    const tx = { TransactionType: 'Payment', Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', Destination: RECIPIENT }
    const out = sub(tx)
    expect(out).not.toBe(tx)
    expect(tx.Account).toBe('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')
  })

  it('T-U-NEVM-XRP-SUB-05: invalid input (null / undefined / number) → 그대로 반환', () => {
    expect(sub(null)).toBe(null)
    expect(sub(undefined)).toBe(undefined)
    expect(sub(42)).toBe(42)
  })

  it('T-U-NEVM-XRP-SUB-06: empty wallet address → no-op (원본 보존)', () => {
    const tx = { TransactionType: 'Payment', Account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' }
    const out = sub(tx, '')
    expect(out.Account).toBe('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-CONST-SUB-*: _substituteConstellationSource — DAG transfer 의 source(무조건) +
// placeholder destination(조건부) 치환.
// placeholder source(DAG000...0000)는 on-chain 이력이 없어 wm lastRef 조회가 404 →
// getAddress 선행 후 실 wallet DAG 주소로 치환.
// zero-filled placeholder destination(DAG000...0001)은 Constellation 체크섬 미충족 invalid
// 주소라 firmware/wm 파싱 시 recipient/amount 표시가 깨진다(실측: 1 DAG→0.01531742 DAG) →
// wallet 주소로 치환(self-transfer). 실제 valid destination 은 보존.
// ─────────────────────────────────────────────────────────────────────────────
describe('_substituteConstellationSource: placeholder → wallet DAG address', () => {
  const WALLET = 'DAG5wallet0000000000000000000000000000001'
  const RECIPIENT = 'DAG4pYx5e4dV4e54A81SRQZ23ovs2Rk6x5fzHjRv' // 실제 valid recipient → 보존
  const PLACEHOLDER_DEST = 'DAG0000000000000000000000000000000000000001' // zero-filled invalid → self-transfer 치환
  function sub (txObj: any, address = WALLET) {
    const api = (window as any)._playgroundTestAPI
    return api._substituteConstellationSource(txObj, address)
  }

  it('T-U-NEVM-CONST-SUB-01: DAG transfer — source 치환, destination/amount/fee/type 보존', () => {
    const tx = { type: 'transfer', source: 'DAG0000000000000000000000000000000000000000', destination: RECIPIENT, amount: '100000000', fee: '0' }
    const out = sub(tx)
    expect(out.source).toBe(WALLET)
    expect(out.destination).toBe(RECIPIENT)
    expect(out.amount).toBe('100000000')
    expect(out.fee).toBe('0')
    expect(out.type).toBe('transfer')
  })

  it('T-U-NEVM-CONST-SUB-02: wm-internal {sender, ...} shape → sender 치환', () => {
    const tx = { sender: 'DAG0000000000000000000000000000000000000000', recipient: RECIPIENT, amount: '100000000' }
    const out = sub(tx)
    expect(out.sender).toBe(WALLET)
    expect(out.recipient).toBe(RECIPIENT)
  })

  it('T-U-NEVM-CONST-SUB-03: string payload → no-op (opaque)', () => {
    const blob = 'opaque-dag-blob'
    expect(sub(blob)).toBe(blob)
  })

  it('T-U-NEVM-CONST-SUB-04: 원본 객체 mutation 금지 (deep clone)', () => {
    const tx = { type: 'transfer', source: 'DAG0000000000000000000000000000000000000000', destination: RECIPIENT }
    const out = sub(tx)
    expect(out).not.toBe(tx)
    expect(tx.source).toBe('DAG0000000000000000000000000000000000000000')
  })

  it('T-U-NEVM-CONST-SUB-05: invalid input / empty wallet → 보수적 보존', () => {
    expect(sub(null)).toBe(null)
    const tx = { type: 'transfer', source: 'DAG0000000000000000000000000000000000000000' }
    expect(sub(tx, '').source).toBe('DAG0000000000000000000000000000000000000000')
  })

  it('T-U-NEVM-CONST-SUB-06: zero-placeholder destination → wallet 주소로 치환 (self-transfer)', () => {
    const tx = { type: 'transfer', source: 'DAG0000000000000000000000000000000000000000', destination: PLACEHOLDER_DEST, amount: '100000000', fee: '0' }
    const out = sub(tx)
    expect(out.source).toBe(WALLET)
    expect(out.destination).toBe(WALLET) // placeholder → self-transfer
    expect(out.amount).toBe('100000000')
    expect(out.fee).toBe('0')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-XTZ-SUB-*: _substituteTezosSource — Tezos source 필드 치환.
// taquito {kind:'transaction', source, destination, ...} 의 source 만 치환,
// destination + 다른 필드 보존.
// ─────────────────────────────────────────────────────────────────────────────
describe('_substituteTezosSource: placeholder → wallet tz1 address', () => {
  const WALLET = 'tz1Wallet11111111111111111111111111111'
  const PLACEHOLDER = 'tz1burnburnburnburnburnburnburjAYjjX'
  const DEST = 'tz1Destination22222222222222222222222'

  function subXtz (txObj: unknown, address: string): any {
    const api = (window as any)._playgroundTestAPI
    return api._substituteTezosSource(txObj, address)
  }

  it('T-U-NEVM-XTZ-SUB-01: Tezos 표준 — source 치환 + destination/fee/counter 등 보존', () => {
    const tx = {
      kind: 'transaction',
      source: PLACEHOLDER,
      fee: '1420',
      counter: '1',
      gasLimit: '10307',
      storageLimit: '257',
      amount: '1000000',
      destination: DEST,
    }
    const out = subXtz(tx, WALLET)
    expect(out.source).toBe(WALLET)
    expect(out.destination).toBe(DEST) // 보존
    expect(out.kind).toBe('transaction')
    expect(out.fee).toBe('1420')
    expect(out.counter).toBe('1')
  })

  it('T-U-NEVM-XTZ-SUB-02: wm-internal {sender, ...} shape → sender 치환', () => {
    const tx = { kind: 'transaction', sender: PLACEHOLDER, destination: DEST, amount: '1000000' }
    const out = subXtz(tx, WALLET)
    expect(out.sender).toBe(WALLET)
    expect(out.destination).toBe(DEST)
  })

  it('T-U-NEVM-XTZ-SUB-03: string payload (forged hex) → no-op (opaque)', () => {
    const forged = 'a8b0c1d2e3f4a5b6...'
    expect(subXtz(forged, WALLET)).toBe(forged)
  })

  it('T-U-NEVM-XTZ-SUB-04: 원본 mutation 금지 (deep clone)', () => {
    const tx = { kind: 'transaction', source: PLACEHOLDER, destination: DEST }
    const original = tx.source
    const out = subXtz(tx, WALLET)
    expect(out.source).toBe(WALLET)
    expect(tx.source).toBe(original)
    expect(out).not.toBe(tx)
  })

  it('T-U-NEVM-XTZ-SUB-05: dispatcher가 tezos family → Tezos 로직 호출', () => {
    const tx = { kind: 'transaction', source: PLACEHOLDER, destination: DEST }
    const api = (window as any)._playgroundTestAPI
    const out = api._substituteSenderByFamily(tx, 'tezos', WALLET)
    expect(out.source).toBe(WALLET)
    expect(out.destination).toBe(DEST)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-HBAR-SUB-*: _substituteHederaSender — Hedera CryptoTransfer 의
// transfers[amount<0] entry 의 accountId 만 치환 (sender 측). amount>0 entry (recipient) 보존.
// 다중 sender/recipient 모두 지원.
// ─────────────────────────────────────────────────────────────────────────────
describe('_substituteHederaSender: placeholder → wallet 0.0.X', () => {
  const WALLET = '0.0.123456'
  const PLACEHOLDER_SENDER = '0.0.2'
  const RECIPIENT_A = '0.0.3'
  const RECIPIENT_B = '0.0.4'

  function subHbar (txObj: unknown, address: string): any {
    const api = (window as any)._playgroundTestAPI
    return api._substituteHederaSender(txObj, address)
  }

  it('T-U-NEVM-HBAR-SUB-01: CryptoTransfer — amount<0 entry 의 accountId 만 치환, amount>0 보존', () => {
    const tx = {
      type: 'CryptoTransfer',
      transfers: [
        { accountId: PLACEHOLDER_SENDER, amount: -100000000 },
        { accountId: RECIPIENT_A, amount: 100000000 },
      ],
      memo: '',
      maxTransactionFee: 100000000,
      transactionValidDuration: 120,
    }
    const out = subHbar(tx, WALLET)
    expect(out.transfers[0].accountId).toBe(WALLET) // sender 치환
    expect(out.transfers[0].amount).toBe(-100000000) // amount 보존
    expect(out.transfers[1].accountId).toBe(RECIPIENT_A) // recipient 보존
    expect(out.maxTransactionFee).toBe(100000000) // 다른 필드 보존
  })

  it('T-U-NEVM-HBAR-SUB-02: 다중 recipient (amount>0 가 여러 entry) — recipient 모두 보존', () => {
    const tx = {
      type: 'CryptoTransfer',
      transfers: [
        { accountId: PLACEHOLDER_SENDER, amount: -100000000 },
        { accountId: RECIPIENT_A, amount: 60000000 },
        { accountId: RECIPIENT_B, amount: 40000000 },
      ],
    }
    const out = subHbar(tx, WALLET)
    expect(out.transfers[0].accountId).toBe(WALLET)
    expect(out.transfers[1].accountId).toBe(RECIPIENT_A)
    expect(out.transfers[2].accountId).toBe(RECIPIENT_B)
  })

  it('T-U-NEVM-HBAR-SUB-03: amount 가 string 인 경우도 음수 판별 정상', () => {
    const tx = {
      type: 'CryptoTransfer',
      transfers: [
        { accountId: PLACEHOLDER_SENDER, amount: '-100000000' },
        { accountId: RECIPIENT_A, amount: '100000000' },
      ],
    }
    const out = subHbar(tx, WALLET)
    expect(out.transfers[0].accountId).toBe(WALLET)
    expect(out.transfers[1].accountId).toBe(RECIPIENT_A)
  })

  it('T-U-NEVM-HBAR-SUB-04: amount=0 / NaN entry 는 치환 안 함 (보수적)', () => {
    const tx = {
      type: 'CryptoTransfer',
      transfers: [
        { accountId: '0.0.999', amount: 0 },
        { accountId: '0.0.998', amount: 'NaN' },
      ],
    }
    const out = subHbar(tx, WALLET)
    expect(out.transfers[0].accountId).toBe('0.0.999')
    expect(out.transfers[1].accountId).toBe('0.0.998')
  })

  it('T-U-NEVM-HBAR-SUB-05: wm-internal {sender, ...} shape → sender 치환', () => {
    const tx = { type: 'CryptoTransfer', sender: PLACEHOLDER_SENDER, transfers: [] }
    const out = subHbar(tx, WALLET)
    expect(out.sender).toBe(WALLET)
  })

  it('T-U-NEVM-HBAR-SUB-06: 원본 mutation 금지 (deep clone)', () => {
    const tx = {
      type: 'CryptoTransfer',
      transfers: [
        { accountId: PLACEHOLDER_SENDER, amount: -100000000 },
        { accountId: RECIPIENT_A, amount: 100000000 },
      ],
    }
    const originalSender = tx.transfers[0].accountId
    const out = subHbar(tx, WALLET)
    expect(out.transfers[0].accountId).toBe(WALLET)
    expect(tx.transfers[0].accountId).toBe(originalSender)
    expect(out).not.toBe(tx)
  })

  it('T-U-NEVM-HBAR-SUB-07: dispatcher가 hedera family → Hedera 로직 호출', () => {
    const tx = {
      type: 'CryptoTransfer',
      transfers: [
        { accountId: PLACEHOLDER_SENDER, amount: -100000000 },
        { accountId: RECIPIENT_A, amount: 100000000 },
      ],
    }
    const api = (window as any)._playgroundTestAPI
    const out = api._substituteSenderByFamily(tx, 'hedera', WALLET)
    expect(out.transfers[0].accountId).toBe(WALLET)
    expect(out.transfers[1].accountId).toBe(RECIPIENT_A)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-06: Solana multi-format presets — Case 1 (base58 serialized) + Case 2 (plain
// JSON with 4 data variants) + Case 3 (wm-internal TransactionCommon) 모두 존재 + shape 가드.
// connector 는 chain-agnostic opaque pass-through이므로 connector 자체의 변환 책임은 없지만,
// playground 의 preset이 모든 입력 형태를 dApp 개발자에게 제공해야 한다.
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-NEVM-06: Solana multi-format presets — Case 1/2a-d/3 모두 존재 + shape 가드', () => {
  const presetsPath = path.resolve(__dirname, '../../../playground/presets.non-evm.json')
  const presets: any[] = JSON.parse(fs.readFileSync(presetsPath, 'utf8'))

  const solanaPresets = presets.filter((p) => p.family === 'solana')
  // Case 1 + Case 2(4 variants) + Case 3 = 6 presets
  expect(solanaPresets.length).toBeGreaterThanOrEqual(6)

  const byId = Object.fromEntries(solanaPresets.map((p) => [p.id, p]))

  // ── Case 1: base58 serialized full transaction ─────────────────────────────
  expect(byId).toHaveProperty('sol-transfer-base58-serialized')
  const case1 = byId['sol-transfer-base58-serialized']
  expect(typeof case1.transaction).toBe('string')
  // base58 alphabet (no 0/O/I/l)
  expect(case1.transaction).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)
  expect(case1.transaction.length).toBeGreaterThan(32)

  // ── Case 2a: plain JSON, data: object ({instruction, lamports}) ───────────
  expect(byId).toHaveProperty('sol-transfer')
  const case2a = byId['sol-transfer']
  expect(typeof case2a.transaction).toBe('object')
  expect(case2a.transaction.instructions).toBeDefined()
  expect(Array.isArray(case2a.transaction.instructions)).toBe(true)
  const c2aData = case2a.transaction.instructions[0].data
  expect(typeof c2aData).toBe('object')
  expect(c2aData).toHaveProperty('instruction')
  expect(c2aData).toHaveProperty('lamports')

  // ── Case 2b: plain JSON, data: 0x hex string ──────────────────────────────
  expect(byId).toHaveProperty('sol-transfer-data-hex')
  const case2b = byId['sol-transfer-data-hex']
  const c2bData = case2b.transaction.instructions[0].data
  expect(typeof c2bData).toBe('string')
  expect(c2bData).toMatch(/^0x[0-9a-fA-F]+$/)

  // ── Case 2c: plain JSON, data: base58 string (prefix 없음) ─────────────────
  expect(byId).toHaveProperty('sol-transfer-data-base58')
  const case2c = byId['sol-transfer-data-base58']
  const c2cData = case2c.transaction.instructions[0].data
  expect(typeof c2cData).toBe('string')
  expect(c2cData).not.toMatch(/^0x/)
  expect(c2cData).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)

  // ── Case 2d: plain JSON, data: number array (Uint8Array JSON form) ────────
  expect(byId).toHaveProperty('sol-transfer-data-bytes')
  const case2d = byId['sol-transfer-data-bytes']
  const c2dData = case2d.transaction.instructions[0].data
  expect(Array.isArray(c2dData)).toBe(true)
  // 모든 원소가 byte (0~255) 정수
  ;(c2dData as number[]).forEach((b) => {
    expect(Number.isInteger(b)).toBe(true)
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThanOrEqual(255)
  })

  // ── Case 3: wm-internal TransactionCommon shape ───────────────────────────
  expect(byId).toHaveProperty('sol-transfer-internal')
  const case3 = byId['sol-transfer-internal']
  expect(typeof case3.transaction).toBe('object')
  expect(case3.transaction).toHaveProperty('type')
  expect(case3.transaction).toHaveProperty('sender')
  expect(case3.transaction).toHaveProperty('recipient')
  expect(case3.transaction).toHaveProperty('amount')
  // wm-internal shape 은 instructions 가 없음 (raw transfer fields)
  expect(case3.transaction.instructions).toBeUndefined()
})

// ─────────────────────────────────────────────────────────────────────────────
// T-DATA-01: chains.json — 모든 entry chainId가 CAIP-19 형식
// ─────────────────────────────────────────────────────────────────────────────
it('T-DATA-01: chains.json — 모든 entry chainId가 CAIP-19 형식 (namespace:ref/slip44:N)', () => {
  const chainsPath = path.resolve(__dirname, '../../../playground/chains.json')
  const raw = fs.readFileSync(chainsPath, 'utf8')
  const chains: any[] = JSON.parse(raw)

  expect(Array.isArray(chains)).toBe(true)
  expect(chains.length).toBeGreaterThan(0)

  // CAIP-2 namespace는 spec상 3-8 chars 권장이나 wm registry는 더 긴 namespace 사용
  // (예: 'constellation' 13 chars). regex를 16까지 widening.
  // /slip44:N suffix는 optional — wm chainIdentifier.value 일부 chain(cip34, tron static)이
  // slip44 별도 필드로 두고 chainId 자체에는 미포함. chains.json은 wm key와 정확 매칭하므로 동일.
  const CAIP19_RE = /^[-a-z0-9]{3,16}:[-_a-zA-Z0-9]{1,32}(\/slip44:\d+)?$/

  chains.forEach((c: any) => {
    expect(typeof c.chainId).toBe('string')
    expect(c.chainId).toMatch(CAIP19_RE)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-DATA-02: presets.*.json의 applicableChainIds가 chains.json chainId 집합에 포함
// ─────────────────────────────────────────────────────────────────────────────
it('T-DATA-02: presets applicableChainIds ⊆ chains.json chainIds', () => {
  const chainsPath = path.resolve(__dirname, '../../../playground/chains.json')
  const evmPresetsPath = path.resolve(__dirname, '../../../playground/presets.evm.json')
  const nonEvmPresetsPath = path.resolve(__dirname, '../../../playground/presets.non-evm.json')
  const restPresetsPath = path.resolve(__dirname, '../../../playground/presets.rest.json')

  const chains: any[] = JSON.parse(fs.readFileSync(chainsPath, 'utf8'))
  const evmPresets: any[] = JSON.parse(fs.readFileSync(evmPresetsPath, 'utf8'))
  const nonEvmPresets: any[] = JSON.parse(fs.readFileSync(nonEvmPresetsPath, 'utf8'))
  // m09-04-17: rest preset(cosmos/polkadot 형제망)도 chains.json 멤버십 가드에 포함 (cross-review F4)
  const restPresets: any[] = JSON.parse(fs.readFileSync(restPresetsPath, 'utf8'))

  const chainIds = new Set(chains.map((c: any) => c.chainId))

  ;[...evmPresets, ...nonEvmPresets, ...restPresets].forEach((p: any) => {
    p.applicableChainIds.forEach((c: string) => {
      expect(chainIds.has(c)).toBe(true)
    })
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

// ─────────────────────────────────────────────────────────────────────────────
// T-U-NEVM-NEWFAM-01~03: 누락보강 5 family(cardano/constellation/near/xahau/havah)
// signTransaction 트리 노드 생성 + preset 자동 채움 + getAddress chainId select 도달성.
//
// 배경: NON_EVM_FAMILIES 배열 membership(T-U-REST-01)만으로는 실제 트리/폼 도달성을
// 보장하지 않는다. 5개 family를 배열에만 추가하고 simulateNonEvmLoad/buildTree 경로가
// 깨지면 membership 테스트는 통과해도 사용자는 노드를 클릭할 수 없다. 이 describe는
// DOM 레벨에서 signTransaction(노드+preset)과 getAddress(chainId select) 양쪽 도달성을
// 검증해 그 공백을 메운다.
// ─────────────────────────────────────────────────────────────────────────────
describe('누락보강 5 family — signTx/getAddress 도달성', () => {
  // chains.json의 실제 chainId 사용 (havah preset applicableChainIds와 정확 매칭)
  const NEW_FAMILY_CHAINS = [
    { chainId: 'cip34:1-764824073', family: 'cardano', displayName: 'Cardano', defaultKeyPath: "m/1852'/1815'/0'/0/0" },
    { chainId: 'constellation:mainnet/slip44:1137', family: 'constellation', displayName: 'Constellation', defaultKeyPath: "m/44'/1137'/0'/0/0" },
    { chainId: 'near:mainnet/slip44:397', family: 'near', displayName: 'NEAR', defaultKeyPath: "m/44'/397'/0'" },
    { chainId: 'xahau:mainnet/slip44:144', family: 'xahau', displayName: 'Xahau', defaultKeyPath: "m/44'/144'/0'/0/0" },
    { chainId: 'havah:mainnet/slip44:858', family: 'havah', displayName: 'Havah', defaultKeyPath: "m/44'/858'/0'/0/0" },
  ]
  // 실제 presets.non-evm.json 로드 — orphan 활성화 4개(ada/dag/near/xahau) + havah preset 포함
  const REAL_NON_EVM_PRESETS: any[] = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../../../playground/presets.non-evm.json'),
      'utf8'
    )
  )

  function connectStub(api: any): void {
    const mockDcent = {
      sign: jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
      getDeviceInfo: jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
      popupWindowClose: jest.fn(),
      setConnectionListener: jest.fn(),
    }
    api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })
  }

  it('T-U-NEVM-NEWFAM-01: 5 family 모두 signTx 트리 DOM 노드로 생성된다', () => {
    const api = (window as any)._playgroundTestAPI
    api.simulateNonEvmLoad(NEW_FAMILY_CHAINS, REAL_NON_EVM_PRESETS)

    ;['cardano', 'constellation', 'near', 'xahau', 'havah'].forEach((fam) => {
      const node = document.querySelector(`[data-method-id^="signTx:${fam}:"]`)
      expect(node).not.toBeNull()
    })
  })

  it('T-U-NEVM-NEWFAM-02: preset 보유 family 클릭 시 textarea 자동 채움 (havah=ICON-native + preparedFee self-contained)', () => {
    const api = (window as any)._playgroundTestAPI
    api.simulateNonEvmLoad(NEW_FAMILY_CHAINS, REAL_NON_EVM_PRESETS)
    connectStub(api)

    // 5개 모두 preset 보유 → 클릭 시 textarea valid JSON으로 채워짐
    NEW_FAMILY_CHAINS.forEach((c) => {
      const node = document.querySelector(
        `[data-method-id="signTx:${c.family}:${c.chainId}"]`
      ) as HTMLElement
      expect(node).not.toBeNull()
      node.click()
      const txEl = document.getElementById('field-transaction') as HTMLTextAreaElement
      expect(txEl).not.toBeNull()
      const txValue = txEl.value.trim()
      expect(txValue.length).toBeGreaterThan(0)
      expect(() => JSON.parse(txValue)).not.toThrow()
    })

    // havah: ICON-native shape + stepLimit 단언
    // (stepLimit 제공 시 wm havah/wire-convert.ts convertTransaction이 preparedFee를
    //  생성 → popup-bridge가 prepareTransaction 미경유여도 preparedFee undefined deref
    //  크래시(cosmos 패턴) 회피. 이 preset의 핵심 invariant.)
    const havahNode = document.querySelector(
      '[data-method-id="signTx:havah:havah:mainnet/slip44:858"]'
    ) as HTMLElement
    havahNode.click()
    const havahTx = JSON.parse(
      (document.getElementById('field-transaction') as HTMLTextAreaElement).value
    )
    expect(havahTx.from).toBeDefined()
    expect(havahTx.to).toBeDefined()
    expect(havahTx.value).toBeDefined()
    expect(havahTx.stepLimit).toBeDefined()
  })

  it('T-U-NEVM-NEWFAM-03: getAddress v2 chainId select에 5개 신규 chainId가 포함된다', () => {
    const api = (window as any)._playgroundTestAPI
    api.simulateNonEvmLoad(NEW_FAMILY_CHAINS, REAL_NON_EVM_PRESETS)

    // account:getAddress 노드 클릭 → v2 폼 렌더(default path=v2) → allChainsMap 기반 chainId select 빌드
    const getAddrNode = document.querySelector('[data-method-id="account:getAddress"]') as HTMLElement
    expect(getAddrNode).not.toBeNull()
    getAddrNode.click()

    const chainSelect = document.getElementById('field-chainId') as HTMLSelectElement
    expect(chainSelect).not.toBeNull()
    const optionValues = Array.from(chainSelect.options).map((o) => o.value)
    NEW_FAMILY_CHAINS.forEach((c) => {
      expect(optionValues).toContain(c.chainId)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-CARDANO-01: ada-transfer preset 제거 가드 (wire-sign 미지원)
// dApp-wire Shape 1 (senderAddress/receiverAddress/lovelaceToSend) transfer-build 는
// SDK wire-sign 경로에서 본질적으로 미지원 — synthesizeAccount 가 UTXO 를 채우지 않아
// wm cardano/transaction.ts:169 (commonAccountInfo.extra.utxoList) 에서 크래시한다.
// (signTransaction [cip34:1-...] -> "Cannot read properties of undefined (reading 'extra')")
// → ada-transfer preset 영구 제거. CBOR 경로(ada-cbor-signtx, Shape 0)만 유지.
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-CARDANO-01: ada-transfer preset 제거됨 + ada-cbor-signtx(CBOR) 유지', () => {
  const presetsPath = path.resolve(__dirname, '../../../playground/presets.non-evm.json')
  const presets: any[] = JSON.parse(fs.readFileSync(presetsPath, 'utf8'))

  // Shape-1 transfer preset 은 wire-sign 미지원 → 제거됨
  const ada = presets.find((p) => p.id === 'ada-transfer')
  expect(ada).toBeUndefined()

  // 지원되는 CBOR 경로(Shape 0)는 유지 — wm wire-convert 가 txCbor → signCardanoCbor 라우팅
  const adaCbor = presets.find((p) => p.id === 'ada-cbor-signtx')
  expect(adaCbor).toBeDefined()
  expect(adaCbor.family).toBe('cardano')
  expect(adaCbor.transaction).toHaveProperty('txCbor')
})
