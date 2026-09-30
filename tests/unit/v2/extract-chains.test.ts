/**
 * extract-chains.test.ts — extract-chains.js 단위 테스트
 *
 * T-U-EXTRACT-01~09 (9개)
 *
 * scripts/extract-chains.js의 출력인 playground/chains.json을 검증하여
 * chainIdentifier pivot / testnet inclusion / FAMILY_KNOWN_MAP 확장을 커버한다.
 *
 * m09-04-10: chainIdentifier pivot + testnet inclusion + FAMILY_KNOWN_MAP 확장
 *
 * 전략: 각 T-U-EXTRACT-01~07은 chains.json의 실제 내용으로 검증한다.
 *       (extract-chains.js를 이미 실행하여 chains.json을 재생성한 상태)
 *       T-U-EXTRACT-08/09는 전체 통계 sentinel을 검증한다.
 */

import * as fs from 'fs'
import * as path from 'path'

const CONNECTOR_ROOT = path.resolve(__dirname, '../../..')
const CHAINS_JSON_PATH = path.join(CONNECTOR_ROOT, 'playground', 'chains.json')

// Load chains once for all tests
const chains: any[] = JSON.parse(fs.readFileSync(CHAINS_JSON_PATH, 'utf8'))

// ── T-U-EXTRACT-01: caip19 entry → full CAIP-19 chainId, family correct ────────
test('T-U-EXTRACT-01: caip19 entry → chainId preserves full CAIP-19 (including /slip44), family correct', () => {
  // Ethereum mainnet: caip19 = 'eip155:1/slip44:60' → chainId 동일 (full CAIP-19 보존)
  const eth = chains.find((c: any) => c.chainId === 'eip155:1/slip44:60')
  expect(eth).toBeDefined()
  expect(eth.family).toBe('ethereum')
  expect(eth.displayName).toBeTruthy()
  // EVM은 /slip44 suffix를 보존 (presets.evm.json / playground.js 컨벤션과 일치)
  expect(eth.chainId).toContain('/slip44')
  // XRPL mainnet (non-EVM caip19): xrpl:0/slip44:144 → 동일 유지
  const xrp = chains.find((c: any) => c.chainId === 'xrpl:0/slip44:144')
  expect(xrp).toBeDefined()
  expect(xrp.family).toBe('xrp')
})

// ── T-U-EXTRACT-02: chainIdentifier (type=dcent) single-line ──────────────────
test('T-U-EXTRACT-02: chainIdentifier dcent single-line → chainId = value (full string), family from namespace', () => {
  // NEAR: chainIdentifier = { type: 'dcent', value: 'near:mainnet/slip44:397' }
  const near = chains.find((c: any) => c.chainId === 'near:mainnet/slip44:397')
  expect(near).toBeDefined()
  expect(near.family).toBe('near')
  expect(near.displayName).toBeTruthy()
  expect(near.isTestnet).toBeUndefined()

  // Verify multi-line block also works — Astar has multi-line chainIdentifier
  const astar = chains.find((c: any) => c.chainId === 'polkadot:9eb76c5184c4ab8679d2d5d819fdf90b/slip44:810')
  expect(astar).toBeDefined()
  expect(astar.family).toBe('polkadot')
  expect(astar.displayName).toBeTruthy()
})

// ── T-U-EXTRACT-02b: multi-line chainIdentifier block ─────────────────────────
test('T-U-EXTRACT-02b: chainIdentifier multi-line block → chainId = value, correct family', () => {
  // eCash has multi-line chainIdentifier in bitcoin-family.ts
  const ecash = chains.find((c: any) => c.chainId === 'bip122:000000000019d6689c085ae165831e93/slip44:145')
  expect(ecash).toBeDefined()
  expect(ecash.family).toBe('bitcoin')
  expect(ecash.displayName).toBe('eCash')

  // Xahau also has single-line chainIdentifier
  const xahau = chains.find((c: any) => c.chainId === 'xahau:mainnet/slip44:144')
  expect(xahau).toBeDefined()
  expect(xahau.family).toBe('xahau')
})

// ── T-U-EXTRACT-03: chainIdentifier (type=cip34) → family = cardano ───────────
test('T-U-EXTRACT-03: chainIdentifier cip34 → family = cardano, CIP-1852 derivation path', () => {
  // Cardano mainnet: chainIdentifier value 'cip34:1-764824073' — wm source 그대로
  // (slip44 append normalize 안 함 — wm `_buildChainIdMultiLookupMap` key가 원본 사용)
  const ada = chains.find((c: any) => c.chainId === 'cip34:1-764824073')
  expect(ada).toBeDefined()
  expect(ada.family).toBe('cardano')
  expect(ada.displayName).toBe('Cardano')
  // 디센트 firmware는 BIP-44 (m/44'/1815'/0'/0/0) 사용 — CIP-1852 미지원.
  // wm CARDANO entry에 derivationFormat 부재 → 디바이스 컨벤션 우선.
  expect(ada.defaultKeyPath).toBe("m/44'/1815'/0'/0/0")
  expect(ada.isTestnet).toBeUndefined()

  // Cardano testnet: chainIdentifier 'cip34:0-2' — wm source 그대로
  const adaTest = chains.find((c: any) => c.chainId === 'cip34:0-2')
  expect(adaTest).toBeDefined()
  expect(adaTest.family).toBe('cardano')
  expect(adaTest.isTestnet).toBe(true)
})

// ── T-U-EXTRACT-04: entry without caip19 AND without chainIdentifier → skipped ─
test('T-U-EXTRACT-04: entry without caip19 or chainIdentifier should not appear in output', () => {
  // TRON in other-networks.ts has no caip19 and no chainIdentifier
  // It should only appear via TRON_STATIC fallback as 'tron:mainnet'
  const tronEntries = chains.filter((c: any) => c.family === 'tron')
  // TRON_STATIC provides tron:mainnet; TRX-TESTNET also via static
  expect(tronEntries.length).toBeGreaterThanOrEqual(1)
  // No entry should have undefined/empty chainId
  const badEntries = chains.filter((c: any) => !c.chainId || c.chainId.trim() === '')
  expect(badEntries.length).toBe(0)
})

// ── T-U-EXTRACT-05: testnet entry included, isTestnet field preserved ──────────
test('T-U-EXTRACT-05: testnet entries are included with isTestnet=true field', () => {
  // NEAR testnet should be present
  const nearTest = chains.find((c: any) => c.chainId === 'near:testnet/slip44:397')
  expect(nearTest).toBeDefined()
  expect(nearTest.isTestnet).toBe(true)

  // Constellation testnet should be present
  const dagTest = chains.find((c: any) => c.chainId === 'constellation:testnet/slip44:1137')
  expect(dagTest).toBeDefined()
  expect(dagTest.isTestnet).toBe(true)

  // Mainnet entries should not have isTestnet field
  const ethMain = chains.find((c: any) => c.chainId === 'eip155:1/slip44:60')
  expect(ethMain).toBeDefined()
  expect(ethMain.isTestnet).toBeUndefined()
})

// ── T-U-EXTRACT-06: bitcoin variant with same chainId → deduped ───────────────
test('T-U-EXTRACT-06: duplicate chainId (bitcoin variant) → only first entry in output', () => {
  // DGB-SEGWIT shares chainId 'bip122:7497ea1b465eb39f1c8f507bc877078f/slip44:20' with DigiByte
  // Only DigiByte (first) should appear
  const dgbEntries = chains.filter((c: any) =>
    c.chainId === 'bip122:7497ea1b465eb39f1c8f507bc877078f/slip44:20'
  )
  expect(dgbEntries.length).toBe(1)
  // First entry wins — should be 'DigiByte' not 'DigiByte Segwit'
  expect(dgbEntries[0].displayName).toBe('DigiByte')
})

// ── T-U-EXTRACT-07: new namespace → correct family mapping ────────────────────
test('T-U-EXTRACT-07: all 5 new namespaces map to correct families', () => {
  // chainIdentifier.value는 wm source 그대로 사용 (slip44 append 안 함 — wm lookup map key 매칭 위해)
  // near/havah/xahau/constellation은 wm source가 이미 /slip44 포함, cip34만 미포함
  const expectedFamilyMap: Record<string, string> = {
    'cip34:1-764824073':                      'cardano',
    'near:mainnet/slip44:397':                'near',
    'havah:mainnet/slip44:858':               'havah',
    'xahau:mainnet/slip44:144':               'xahau',
    'constellation:mainnet/slip44:1137':      'constellation',
  }
  for (const [chainId, expectedFamily] of Object.entries(expectedFamilyMap)) {
    const entry = chains.find((c: any) => c.chainId === chainId)
    expect(entry).toBeDefined()
    expect(entry.family).toBe(expectedFamily)
  }
})

// ── T-U-EXTRACT-08: chains.json total count sentinel ─────────────────────────
test('T-U-EXTRACT-08: chains.json total entry count >= 150 (regression sentinel)', () => {
  // m09-04-10: actual count is 154 (wm registry as of 2026-05-28)
  // Sentinel set to 150 to allow for minor registry variations
  expect(chains.length).toBeGreaterThanOrEqual(150)

  // Verify all entries have required fields (T-I-SNAPSHOT-02)
  for (const c of chains) {
    expect(c.chainId).toBeTruthy()
    expect(c.family).toBeTruthy()
    expect(c.displayName).toBeTruthy()
    expect(c.defaultKeyPath).toBeTruthy()
  }

  // Verify unique **identity tuples** (T-I-SNAPSHOT-03).
  // 🔴 종전에는 `chainId` 단독 유일성이었다. variant 축(m21-05)이 열리면서 base 와 chainId 를
  //    공유하는 entry 가 생겨 그 단독 유일성은 성립하지 않는다 — 대신 **판별 3축 전체**로
  //    유일성을 요구한다(약화가 아니라 강화: 종전 축을 포함하고 두 축을 더한다).
  const identityOf = (c: any) => [c.chainId, c.addressFormat ?? '', c.defaultKeyPath].join('|')
  const identities = new Set(chains.map(identityOf))
  expect(identities.size).toBe(chains.length)

  // base entry(=`variant` 없음)는 여전히 chainId 로 유일하다 — variant 를 base 로 잘못 넣으면 실패.
  const baseEntries = chains.filter((c: any) => c.variant === undefined)
  expect(new Set(baseEntries.map((c: any) => c.chainId)).size).toBe(baseEntries.length)

  // variant id 유일성 + **판별 축 존재**. 판별 축이 없는 variant 는 base 와 구별 불가라
  // wire 로 도달하지 못한다 — 넣는 것 자체를 막는다.
  const variantEntries = chains.filter((c: any) => c.variant !== undefined)
  expect(new Set(variantEntries.map((c: any) => c.variant)).size).toBe(variantEntries.length)
  for (const v of variantEntries) {
    const sameChainBases = baseEntries.filter((b: any) => b.chainId === v.chainId)
    const discriminated =
      sameChainBases.length === 0 ||                                   // 고유 chainId 축
      v.addressFormat !== undefined ||                                 // 형식 축
      sameChainBases.every((b: any) => b.defaultKeyPath !== v.defaultKeyPath) // 경로 축
    expect({ variant: v.variant, discriminated }).toEqual({ variant: v.variant, discriminated: true })
  }

  // addressFormat 은 wm `AddressFormat` 유니온 / bridge `_sanitize.ts:ADDRESS_FORMATS` 와 1:1.
  const ADDRESS_FORMATS = ['legacy', 'segwit-wrapped', 'segwit-native', 'taproot', 'ledger', 'standard']
  for (const c of chains) {
    if (c.addressFormat !== undefined) expect(ADDRESS_FORMATS).toContain(c.addressFormat)
  }

  // All 5 new families present
  const families = new Set(chains.map((c: any) => c.family))
  expect(families.has('cardano')).toBe(true)
  expect(families.has('near')).toBe(true)
  expect(families.has('havah')).toBe(true)
  expect(families.has('xahau')).toBe(true)
  expect(families.has('constellation')).toBe(true)

  // Bitcoin family expanded from 4 to >= 12
  const btcEntries = chains.filter((c: any) => c.family === 'bitcoin')
  expect(btcEntries.length).toBeGreaterThanOrEqual(12)
})

// ── T-U-EXTRACT-09: testnet inclusion (sibling parity parseFamilyTs) ──────────
test('T-U-EXTRACT-09: testnet entries >= 30 (parseFamilyTs testnet inclusion working)', () => {
  const testnets = chains.filter((c: any) => c.isTestnet === true)
  // After m09-04-10 testnet inclusion, expect >= 30 testnet entries
  expect(testnets.length).toBeGreaterThanOrEqual(30)

  // All testnets must have valid shape
  for (const c of testnets) {
    expect(c.isTestnet).toBe(true)
    expect(c.chainId).toBeTruthy()
    expect(c.family).toBeTruthy()
    expect(c.displayName).toBeTruthy()
    expect(c.defaultKeyPath).toBeTruthy()
  }

  // New family testnets present
  const cardanoTest = chains.find((c: any) => c.family === 'cardano' && c.isTestnet)
  expect(cardanoTest).toBeDefined()
  const nearTest = chains.find((c: any) => c.family === 'near' && c.isTestnet)
  expect(nearTest).toBeDefined()
  const havahTest = chains.find((c: any) => c.family === 'havah' && c.isTestnet)
  expect(havahTest).toBeDefined()
  const xahauTest = chains.find((c: any) => c.family === 'xahau' && c.isTestnet)
  expect(xahauTest).toBeDefined()
  const dagTest = chains.find((c: any) => c.family === 'constellation' && c.isTestnet)
  expect(dagTest).toBeDefined()
})

// ── T-U-EXTRACT-10: variant 축 전수 (m21-05) ─────────────────────────────────
//
// wm 레지스트리에는 base 와 **chainId 를 공유하는** derivation/format variant 가 있다.
// chains.json 이 `chainId/family/displayName/defaultKeyPath` 4필드뿐이던 동안에는 그 variant
// 들을 표현할 방법이 없어 playground / test-dapp / 시뮬레이터의 **어느 API 축에도 나타나지
// 않았다**. `addressFormat` + `variant` 두 필드가 그 축이다.
//
// 🔴 아래 16종의 판별 축은 **wm 레지스트리 실측**(2026-09-10, `pickWireCurrency` +
//    `wireFormatConflicts` 전수 호출)에서 왔다. 손으로 적은 목록이 아니다.
//    TEZOS-STD / TEZOS-STD-T 는 **의도적으로 없다** — 그 둘은 `caip19` 도 `chainIdentifier` 도
//    갖지 않아 wire 요청이 실을 식별자가 없다(어떤 chainId 로도 선택 불가).
const EXPECTED_VARIANTS: Array<{ variant: string; chainId: string; defaultKeyPath: string; addressFormat?: string }> = [
  { variant: 'BTC-SW-49',      chainId: 'bip122:000000000019d6689c085ae165831e93/slip44:0', defaultKeyPath: "m/49'/0'/0'/0/0", addressFormat: 'segwit-wrapped' },
  { variant: 'BTC-49-TESTNET', chainId: 'bip122:000000000933ea01ad0ee984209779ba/slip44:0', defaultKeyPath: "m/49'/1'/0'/0/0", addressFormat: 'segwit-wrapped' },
  { variant: 'BTC-SW-84',      chainId: 'bip122:000000000019d6689c085ae165831e93/slip44:0', defaultKeyPath: "m/84'/0'/0'/0/0", addressFormat: 'segwit-native' },
  { variant: 'BTC-84-TESTNET', chainId: 'bip122:000000000933ea01ad0ee984209779ba/slip44:0', defaultKeyPath: "m/84'/1'/0'/0/0", addressFormat: 'segwit-native' },
  { variant: 'BTC-TAPROOT',    chainId: 'bip122:000000000019d6689c085ae165831e93/slip44:0', defaultKeyPath: "m/86'/0'/0'/0/0", addressFormat: 'taproot' },
  { variant: 'BTC-TR-TESTNET', chainId: 'bip122:000000000933ea01ad0ee984209779ba/slip44:0', defaultKeyPath: "m/86'/1'/0'/0/0", addressFormat: 'taproot' },
  { variant: 'POLKADOT-LGR',   chainId: 'polkadot:91b171bb158e2d3848fa23a9f1c25182/slip44:354', defaultKeyPath: "m/44'/354'/0'/0'/0'" },
  { variant: 'POLKADOT-LGR-T', chainId: 'polkadot:d6eec26135305a8ad257a20d00335728/slip44:354', defaultKeyPath: "m/44'/354'/0'/0'/0'" },
  { variant: 'ALGORAND-LGR',   chainId: 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k/slip44:283', defaultKeyPath: "m/44'/283'/0'/0/0", addressFormat: 'ledger' },
  { variant: 'ALGO-LGR-T',     chainId: 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe/slip44:283', defaultKeyPath: "m/44'/283'/0'/0/0", addressFormat: 'ledger' },
  { variant: 'PARA-L:000105',  chainId: 'polkadot:9eb76c5184c4ab8679d2d5d819fdf90b/slip44:810', defaultKeyPath: "m/44'/810'/0'/0'/0'" },
  { variant: 'PARAT-L:200105', chainId: 'polkadot:ddb89643205c8fe1c79afeb31f48d50f/slip44:810', defaultKeyPath: "m/44'/810'/0'/0'/0'" },
  { variant: 'PARA-L:00012A',  chainId: 'polkadot:6673c7e2c2b7bde45a60c71ef70d9c7c/slip44:354', defaultKeyPath: "m/44'/354'/0'/0'/0'" },
  { variant: 'PARAT-L:20012A', chainId: 'polkadot:8a2e8af69a7892d2e60a77e3df4e0fa0/slip44:354', defaultKeyPath: "m/44'/354'/0'/0'/0'" },
  { variant: 'CARDANO-LGR',    chainId: 'cip34:1-764824073', defaultKeyPath: "m/1852'/1815'/0'/0/0" },
  { variant: 'CARDANO-LGR-T',  chainId: 'cip34:0-2',         defaultKeyPath: "m/1852'/1815'/0'/0/0" },
  // m21-01-05 — base 와 derivationFormat·chainId 가 **둘 다 동일**하고 keySpec 만 다르다
  //   (ed25519 표준 SLIP-10 vs ed25519DcentSlip23). 그래서 형식 축이 **유일** 판별자다.
  { variant: 'TEZOS-STD',      chainId: 'tezos:NetXdQprcVkpaWU/slip44:1729', defaultKeyPath: "m/44'/1729'/0'/0'", addressFormat: 'standard' },
  { variant: 'TEZOS-STD-T',    chainId: 'tezos:NetXnHfVqm9iesp/slip44:1729', defaultKeyPath: "m/44'/1729'/0'/0'", addressFormat: 'standard' },
]

test('T-U-EXTRACT-10: variant entry 18종이 판별 축과 함께 존재한다', () => {
  const byVariant = new Map(chains.filter((c: any) => c.variant).map((c: any) => [c.variant, c]))
  // 🔴 `toEqual` 로 집합을 통째 단언 — 덜 넣어도, 더 넣어도 실패한다.
  expect([...byVariant.keys()].sort()).toEqual(EXPECTED_VARIANTS.map((v) => v.variant).sort())
  for (const exp of EXPECTED_VARIANTS) {
    const got = byVariant.get(exp.variant)
    expect({
      variant: exp.variant,
      chainId: got.chainId,
      defaultKeyPath: got.defaultKeyPath,
      addressFormat: got.addressFormat,
    }).toEqual({
      variant: exp.variant,
      chainId: exp.chainId,
      defaultKeyPath: exp.defaultKeyPath,
      addressFormat: exp.addressFormat,
    })
    // 템플릿 placeholder 가 새어나오면 기기로 잘못된 경로가 나간다.
    expect(got.defaultKeyPath).not.toMatch(/</)
  }
})

// ── T-U-EXTRACT-11: 과잉 생성 대조군 ─────────────────────────────────────────
test('T-U-EXTRACT-11: base entry 는 variant/addressFormat 축을 갖지 않는다', () => {
  // base 150 건은 additive 변경 이후에도 그대로여야 한다 — 하나라도 축이 붙으면
  // 소비자(`buildMethodCases`)가 base 를 variant 로 오인해 케이스를 과잉 생성한다.
  const bases = chains.filter((c: any) => c.variant === undefined)
  expect(bases.length).toBe(150)
  expect(bases.filter((c: any) => c.addressFormat !== undefined)).toEqual([])

  // 잘못된 조합이 생기지 않는지 — BTC 전용 인코딩 형식은 bitcoin family 밖에 붙을 수 없다.
  const BTC_ONLY_FORMATS = ['legacy', 'segwit-wrapped', 'segwit-native', 'taproot']
  const misplaced = chains.filter(
    (c: any) => BTC_ONLY_FORMATS.includes(c.addressFormat) && c.family !== 'bitcoin',
  )
  expect(misplaced).toEqual([])
  // 반대 방향 — `'ledger'` 는 계정 표준 축이라 BTC 에 붙으면 wm 이 undefined 를 돌려준다.
  expect(chains.filter((c: any) => c.addressFormat === 'ledger' && c.family === 'bitcoin')).toEqual([])
})
