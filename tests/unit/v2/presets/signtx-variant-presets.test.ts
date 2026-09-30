/**
 * m21-05 후속(2026-09-11) — **signTransaction 축의 18종 variant 도달** 회귀 가드.
 *
 * 이 파일이 지키는 것은 두 가지다:
 *   ① 14건의 신규 preset 이 **자기 variant 를 가리키는 축을 싣고 있는가**
 *      (축 = `chains.json` 의 동명 variant 엔트리가 가진 `defaultKeyPath` / `addressFormat`).
 *   ② **과잉 개통이 없는가** — base preset 이 variant 축을 얻지 않는가.
 *
 * 🔴 값의 출처를 테스트 안에 다시 적지 않고 `chains.json` 에서 **읽어서 대조**한다. 리터럴을 양쪽에
 *    적으면 둘을 함께 고칠 때 대조가 사라진다(= 동어반복). 대신 preset ↔ variant 의 **짝**은 여기
 *    열거한다 — 그 짝이야말로 이 파일이 고정하려는 사실이다.
 */
import nonEvmPresets from '../../../../playground/presets.non-evm.json'
import chains from '../../../../playground/chains.json'

type Preset = {
  id: string
  scenarioCode: string
  family: string
  applicableChainIds: string[]
  keyPath?: string
  addressFormat?: string
  transaction?: unknown
}
type Chain = { chainId: string; defaultKeyPath?: string; addressFormat?: string; variant?: string }

const PRESETS = nonEvmPresets as Preset[]
const CHAINS = chains as Chain[]

const byId = (id: string): Preset => {
  const p = PRESETS.find((x) => x.id === id)
  if (!p) throw new Error(`preset 부재: ${id}`)
  return p
}
const variantEntry = (variant: string): Chain => {
  const c = CHAINS.find((x) => x.variant === variant)
  if (!c) throw new Error(`chains.json variant 부재: ${variant}`)
  return c
}

/**
 * preset ↔ variant 짝 — **18종 전건**을 적는다(신규 14 + 기존 4).
 * 🔴 개수가 아니라 **열거**다: 하나가 빠지면 그 줄이 사라져 실패한다.
 */
const PAIRS: Array<[string, string]> = [
  // 신규 14 — BTC 4
  ['btc-wrapped-transfer-testnet', 'BTC-49-TESTNET'],
  ['btc-native-84-transfer', 'BTC-SW-84'],
  ['btc-native-84-transfer-testnet', 'BTC-84-TESTNET'],
  ['btc-taproot-transfer-testnet', 'BTC-TR-TESTNET'],
  // 신규 — Polkadot relay + 파라체인 6
  ['dot-ledger-transfer', 'POLKADOT-LGR'],
  ['dot-ledger-testnet-transfer', 'POLKADOT-LGR-T'],
  ['astar-ledger-transfer', 'PARA-L:000105'],
  ['shibuya-ledger-transfer', 'PARAT-L:200105'],
  ['creditcoin-ledger-transfer', 'PARA-L:00012A'],
  ['creditcoin-testnet-ledger-transfer', 'PARAT-L:20012A'],
  // 신규 — Algorand 2 (형식 전용 축)
  ['algo-ledger-payment', 'ALGORAND-LGR'],
  ['algo-ledger-testnet-payment', 'ALGO-LGR-T'],
  // 신규 — Tezos 2 (형식 전용 축)
  ['xtz-standard-transfer', 'TEZOS-STD'],
  ['xtz-standard-testnet-transfer', 'TEZOS-STD-T'],
  // 기존 2 (m21-02) — 이번에 addressFormat 을 명시 선언했다
  ['btc-wrapped-transfer', 'BTC-SW-49'],
  ['btc-taproot-transfer', 'BTC-TAPROOT'],
]
// Cardano 2종(`CARDANO-LGR` / `-T`)은 preset 이 축을 싣지 않는다 — 소비자(bridge test-dapp)의
// `keyPathForFamily('cardano')` 기본값이 `m/1852'` 를 메워 이미 도달한다(m21 커버리지 매트릭스 §4).
// 그래서 이 표에 없다. 없는 것과 빠뜨린 것을 구별하려고 여기 사유를 남긴다.

describe('m21-05 signTransaction variant presets', () => {
  it('T-U-CON-30: 18종 중 preset 이 소유하는 16종의 짝이 전부 존재한다', () => {
    const missing = PAIRS.filter(([id]) => !PRESETS.some((p) => p.id === id)).map(([id]) => id)
    expect(`missing=${missing.join(',')}`).toBe('missing=')
  })

  it('T-U-CON-31: 각 preset 의 (chainId, keyPath, addressFormat) 이 chains.json variant 엔트리와 **바이트 일치**한다', () => {
    // 🔴 이 단언이 축의 정본이다 — preset 쪽 값 하나만 바꾸면(뮤테이션) 그 줄이 어긋나 실패한다.
    const actual = PAIRS.map(([id, variant]) => {
      const p = byId(id)
      return `${id}|${p.applicableChainIds.join('+')}|${p.keyPath}|${p.addressFormat}`
    })
    const expected = PAIRS.map(([id, variant]) => {
      const c = variantEntry(variant)
      return `${id}|${c.chainId}|${c.defaultKeyPath}|${c.addressFormat}`
    })
    expect(actual.join('\n')).toBe(expected.join('\n'))
  })

  it('T-U-CON-32: 형식 전용 축 4건만 addressFormat 을 싣고, 경로 전용 축 6건은 싣지 않는다', () => {
    // 🔴 Polkadot/파라체인에 `'ledger'` 를 실으면 wm 의 형식 축이 Algorand 2종에 못박혀 있어
    //    (m21-01-03 앵커) `wireFormatConflicts` 가 -32602 를 낼 수 있다. 그 오적용을 여기서 막는다.
    const FORMAT_ONLY: Record<string, string> = {
      'algo-ledger-payment': 'ledger',
      'algo-ledger-testnet-payment': 'ledger',
      'xtz-standard-transfer': 'standard',
      'xtz-standard-testnet-transfer': 'standard',
    }
    const PATH_ONLY = [
      'dot-ledger-transfer',
      'dot-ledger-testnet-transfer',
      'astar-ledger-transfer',
      'shibuya-ledger-transfer',
      'creditcoin-ledger-transfer',
      'creditcoin-testnet-ledger-transfer',
    ]
    const actual = [
      ...Object.keys(FORMAT_ONLY).map((id) => `${id}=${byId(id).addressFormat}`),
      ...PATH_ONLY.map((id) => `${id}=${byId(id).addressFormat}`),
    ]
    const expected = [
      ...Object.entries(FORMAT_ONLY).map(([id, v]) => `${id}=${v}`),
      ...PATH_ONLY.map((id) => `${id}=undefined`),
    ]
    expect(actual.join('\n')).toBe(expected.join('\n'))
    // 🔴 하드코딩 방어 — 형식 전용 4건의 값이 **한 값이 아니다**(ledger 2 · standard 2).
    expect(new Set(Object.values(FORMAT_ONLY)).size).toBe(2)
  })

  it("T-U-CON-33: 경로 전용 축 6건의 keyPath tail 이 하드닝(`/0'/0'`)이다", () => {
    // chains.json 의 base 엔트리는 `/0/0` 이라, 복사 실수를 하면 base 로 떨어진다.
    const ids = [
      'dot-ledger-transfer', 'dot-ledger-testnet-transfer', 'astar-ledger-transfer',
      'shibuya-ledger-transfer', 'creditcoin-ledger-transfer', 'creditcoin-testnet-ledger-transfer',
    ]
    const bad = ids.filter((id) => !/\/0'\/0'$/.test(byId(id).keyPath ?? ''))
    expect(`nonHardened=${bad.join(',')}`).toBe('nonHardened=')
  })

  it("T-U-CON-34: 형식 전용 축 4건의 keyPath 는 base 와 **같다** (하드닝으로 '정정'하지 않았다)", () => {
    // 🔴 형제(Polkadot)를 보고 여기까지 하드닝하면 도달 불가가 된다 — T-U-CON-11 과 같은 함정.
    const pairs: Array<[string, string]> = [
      ['algo-ledger-payment', "m/44'/283'/0'/0/0"],
      ['algo-ledger-testnet-payment', "m/44'/283'/0'/0/0"],
      ['xtz-standard-transfer', "m/44'/1729'/0'/0'"],
      ['xtz-standard-testnet-transfer', "m/44'/1729'/0'/0'"],
    ]
    expect(pairs.map(([id]) => `${id}|${byId(id).keyPath}`).join('\n'))
      .toBe(pairs.map(([id, kp]) => `${id}|${kp}`).join('\n'))
  })

  it('T-U-CON-35: BTC variant preset 6건의 inputs[].keyPath 가 top-level keyPath 와 같다', () => {
    // 🔴 두 축이 갈리면 prevout 합성이 다른 계정 주소를 만들어 wm ownership 게이트가 -32602 를 낸다 —
    //    그 -32602 는 "하류 미배포" 신호와 구별되지 않는다(형제 preset note 가 명시한 함정).
    const ids = PAIRS.filter(([id]) => id.startsWith('btc-')).map(([id]) => id)
    expect(ids.length).toBe(6)
    const mismatched = ids.filter((id) => {
      const p = byId(id)
      const tx = p.transaction as { inputs?: Array<{ keyPath?: string }> }
      return (tx.inputs ?? []).some((i) => i.keyPath !== p.keyPath)
    })
    expect(`mismatched=${mismatched.join(',')}`).toBe('mismatched=')
  })

  // ────────────────────────────────────────────────────────────────────────────
  // 과잉 개통 대조군
  // ────────────────────────────────────────────────────────────────────────────
  it('T-U-CON-36: base preset 은 variant 축을 얻지 않는다', () => {
    // `btc-transfer`(legacy) · `btc-segwit-transfer`(m/44' P2WPKH) · `xtz-transfer` · `algo-payment`
    // 계열은 축 선언이 없어야 한다 — 선언되는 순간 base 행이 variant 로 조용히 옮겨간다.
    const BASE = ['btc-transfer', 'btc-segwit-transfer', 'tezos-unsigned-passthrough', 'ada-cbor-signtx']
    const leaked = BASE.filter((id) => byId(id).addressFormat !== undefined || byId(id).keyPath !== undefined)
    expect(`leaked=${leaked.join(',')}`).toBe('leaked=')
  })

  it('T-U-CON-37: variant preset 은 **자기 체인 하나만** 선언한다', () => {
    // keyPath 가 coinType 이 박힌 절대 경로라 다른 체인에 얹으면 chainId 와 어긋난다.
    const multi = PAIRS.filter(([id]) => byId(id).applicableChainIds.length !== 1).map(([id]) => id)
    expect(`multiChain=${multi.join(',')}`).toBe('multiChain=')
  })

  it('T-U-CON-38: chains.json 의 variant 엔트리 18건이 그대로 있다 (짝의 모수)', () => {
    const variants = CHAINS.filter((c) => c.variant).map((c) => c.variant)
    expect(`count=${variants.length}`).toBe('count=18')
    // 짝이 없는 2건은 Cardano 뿐이라는 사실을 고정한다 — 새 variant 가 생기면 여기서 드러난다.
    const paired = new Set(PAIRS.map(([, v]) => v))
    const unpaired = variants.filter((v) => !paired.has(v as string)).sort()
    expect(unpaired.join(',')).toBe('CARDANO-LGR,CARDANO-LGR-T')
  })
})
