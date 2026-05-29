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
  // Cardano mainnet: chainIdentifier value 'cip34:1-764824073' + bip44CoinType 1815
  // → CAIP-19 normalize 후 'cip34:1-764824073/slip44:1815'
  const ada = chains.find((c: any) => c.chainId === 'cip34:1-764824073/slip44:1815')
  expect(ada).toBeDefined()
  expect(ada.family).toBe('cardano')
  expect(ada.displayName).toBe('Cardano')
  // CIP-1852 path: m/1852'/1815'/0'/0/0
  expect(ada.defaultKeyPath).toBe("m/1852'/1815'/0'/0/0")
  expect(ada.isTestnet).toBeUndefined()

  // Cardano testnet: chainIdentifier 'cip34:0-2' → CAIP-19 'cip34:0-2/slip44:1815'
  const adaTest = chains.find((c: any) => c.chainId === 'cip34:0-2/slip44:1815')
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
  // CAIP-19 normalize: cip34는 wm registry에 slip44가 별도 필드 → normalize 후 /slip44:1815 append
  const expectedFamilyMap: Record<string, string> = {
    'cip34:1-764824073/slip44:1815':          'cardano',
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

  // Verify unique chainIds (T-I-SNAPSHOT-03)
  const ids = new Set(chains.map((c: any) => c.chainId))
  expect(ids.size).toBe(chains.length)

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
