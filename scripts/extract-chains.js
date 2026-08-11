#!/usr/bin/env node
/**
 * extract-chains.js — 모든 family chain metadata 추출 스크립트
 *
 * refer-repos/dcent-wallet-models/src/common/assets/coins/families/ 또는
 * npm 패키지에서 mainnet + testnet 체인 목록을 추출하여 playground/chains.json으로 저장한다.
 *
 * 출력 shape (ChainEntry):
 *   chainId:        string   — CAIP-19 or chainIdentifier.value, e.g. "eip155:1", "bip122:000…", "cip34:1-764824073"
 *   family:         string   — deriveFamily() 출력 (known map + 알 수 없는 namespace fallback)
 *   displayName:    string   — human readable name
 *   defaultKeyPath: string   — default BIP32 derivation path
 *   isTestnet?:     boolean  — true if testnet entry (omitted for mainnet)
 *
 * 실행: node scripts/extract-chains.js
 * 또는 yarn extract-chains (package.json scripts에 등록)
 *
 * 출력 경로: playground/chains.json (통합 파일 — m06-01-03)
 *
 * deriveFamily() — CAIP-19 / chainIdentifier namespace → family name (m09-04-10 확장).
 * known map (기존 14 + 신규 5 namespace):
 *   eip155 → ethereum, bip122 → bitcoin, solana → solana, xrpl → xrp,
 *   hedera → hedera, stellar → stellar, tron → tron (caip19 미지정 → TRON_STATIC fallback),
 *   algorand / conflux / cosmos / fil / polkadot / stacks / tezos / vechain → 동일 family명.
 *   [신규] cip34 → cardano, near → near, havah → havah, xahau → xahau, constellation → constellation.
 * 알 수 없는 namespace는 namespace 자체를 family명으로 사용 (fallback).
 */

'use strict'

const fs = require('fs')
const path = require('path')

const OUTPUT_PATH = path.resolve(__dirname, '..', 'playground', 'chains.json')

// ── deriveFamily: CAIP-19 / chainIdentifier namespace → family name ───────────
// wallet-models cryptoCurrencies registry의 모든 namespace를 family로 매핑.
// 알 수 없는 namespace는 namespace 자체를 family명으로 사용 (fallback).
// R1=a 결정: wallet-models 인벤토리 기준 14개 namespace 매핑.
// m09-04-10: 신규 5개 namespace 추가 (cip34 / near / havah / xahau / constellation).
const FAMILY_KNOWN_MAP = {
  // 기존 7 family (Child 1-3 covered)
  eip155:        'ethereum',
  bip122:        'bitcoin',
  solana:        'solana',
  xrpl:          'xrp',
  hedera:        'hedera',
  stellar:       'stellar',
  tron:          'tron',
  // m06-01-04 신규 8 family
  algorand:      'algorand',
  conflux:       'conflux',
  cosmos:        'cosmos',
  fil:           'fil',
  polkadot:      'polkadot',
  stacks:        'stacks',
  tezos:         'tezos',
  vechain:       'vechain',
  // m09-04-10 신규 5 family (chainIdentifier namespace)
  cip34:         'cardano',
  near:          'near',
  havah:         'havah',
  xahau:         'xahau',
  constellation: 'constellation',
}

// CAIP-19 / chainIdentifier namespace로부터 family 도출.
// chainId가 빈 문자열 / non-string / `:` 미포함이면 null 반환 (caller가 skip).
// known map에 있으면 그 값, 없으면 namespace 자체를 family명으로 사용 (fallback).
function deriveFamily (chainId) {
  if (typeof chainId !== 'string' || chainId.length === 0) return null
  const ns = chainId.split(':')[0]
  if (!ns) return null
  return FAMILY_KNOWN_MAP[ns] || ns
}

// ── defaultKeyPath 결정 ────────────────────────────────────────────────────────
// family + bip44CoinType + derivationFormat 으로 derivation path 생성.
// m09-04-10: cardano (CIP-1852) / near / havah / xahau / constellation 신규 추가.
function buildDefaultKeyPath (family, bip44CoinType, derivationFormat) {
  if (derivationFormat) {
    // <accountIdx> → 0 으로 치환해 구체 path 생성
    return derivationFormat.replace(/<accountIdx>/g, '0')
  }
  if (bip44CoinType === null || bip44CoinType === undefined) return null

  switch (family) {
    case 'bitcoin':
      // Native SegWit (BIP-84): m/84'/coinType'/0'/0/0
      // objective §3 비스코프: native segwit 단일
      return `m/84'/${bip44CoinType}'/0'/0/0`
    case 'solana':
      return `m/44'/${bip44CoinType}'/0'`
    case 'stellar':
      return `m/44'/${bip44CoinType}'/0'`
    case 'cardano':
      // D'CENT firmware는 BIP-44 (m/44'/1815'/0'/0/0) 컨벤션 사용.
      // wm CARDANO entry에는 derivationFormat 필드 부재 — 디바이스 firmware 컨벤션이
      // 결정. CIP-1852(m/1852'/...)는 일반 Cardano wallet 표준이지만 D'CENT는 미지원.
      // 잘못된 path 전송 시 디바이스가 default 사용 → 응답 주소 mismatch 위험 (BTC 패턴).
      return `m/44'/${bip44CoinType}'/0'/0/0`
    case 'near':
      return `m/44'/${bip44CoinType}'/0'`
    case 'tezos':
      return `m/44'/${bip44CoinType}'/0'/0'`
    case 'constellation':
      // bip44CoinType=1137 (SLIP-0044 DAG)
      return `m/44'/${bip44CoinType}'/0'/0/0`
    default:
      return `m/44'/${bip44CoinType}'/0'/0/0`
  }
}

// ── 소스 결정: npm 패키지 우선, 없으면 refer-repos TypeScript 파싱 ──────────────
function findFamilySource (fileName) {
  // 1) npm 패키지 (빌드 환경)
  const npmCandidates = [
    path.resolve(__dirname, '..', 'node_modules', '@iotrustgithub', 'dcent-wallet-models'),
    path.resolve(__dirname, '..', 'node_modules', 'dcent-wallet-models'),
  ]
  for (const base of npmCandidates) {
    const candidates = [
      path.join(base, 'lib', 'common', 'assets', 'coins', 'families', fileName.replace('.ts', '.js')),
      path.join(base, 'src', 'common', 'assets', 'coins', 'families', fileName),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return { path: p, type: fs.extname(p) === '.ts' ? 'ts' : 'js' }
    }
  }

  // 2) refer-repos (로컬 개발 환경)
  // scripts/ → connector/ → main-repos/ → dcent-web-sdk-uap/ → refer-repos/
  const referReposTs = path.resolve(
    __dirname, '..', '..', '..', 'refer-repos', 'dcent-wallet-models',
    'src', 'common', 'assets', 'coins', 'families', fileName
  )
  if (fs.existsSync(referReposTs)) return { path: referReposTs, type: 'ts' }

  return null
}

// ── TypeScript 소스를 regex 파싱하여 family별 체인 추출 ───────────────────────
// caip19 또는 chainIdentifier line을 pivot으로, entry block 경계 안에서 필드를 스캔한다.
// m09-04-10: chainIdentifier pivot 추가 + testnet inclusion + isTestnet 필드 출력.
function parseFamilyTs (tsPath) {
  const src = fs.readFileSync(tsPath, 'utf8')
  const chains = []
  const seen = new Set()
  const lines = src.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // ── pivot 1: caip19 단일 라인 ──
    let chainId = null
    const caip19Match = line.match(/caip19:\s*['"]([^'"]+)['"]/)
    if (caip19Match) {
      // wm source caip19 값을 그대로 사용 (CAIP-19 full string 보존).
      // 이전에는 /slip44:N suffix를 제거해 CAIP-2로 강등했으나, 이로 인해
      // chains.json EVM이 `eip155:1` (CAIP-2), 다른 family는 mixed가 되어
      // single source의 일관성이 깨짐. wm _buildChainIdLookupMap도 full string
      // 기반이라 strip 없이 그대로 mirror하는 게 맞다.
      chainId = caip19Match[1]
    }

    // ── pivot 2: chainIdentifier 단일 라인 (value 포함) ──
    // single-line: chainIdentifier: { type: 'xxx', value: 'yyy' },
    if (!chainId) {
      const ciSingleMatch = line.match(/chainIdentifier:\s*\{\s*type:\s*['"][^'"]+['"]\s*,\s*value:\s*['"]([^'"]+)['"]\s*\}/)
      if (ciSingleMatch) {
        // chainIdentifier.value는 full string 그대로 사용 (wm _buildChainIdLookupMap이 full string key 사용)
        chainId = ciSingleMatch[1]
      }
    }

    // ── pivot 3: chainIdentifier multi-line 블록 시작 ──
    // multi-line: chainIdentifier: {
    //   type: 'xxx',
    //   value: 'yyy',
    // },
    if (!chainId && /chainIdentifier:\s*\{/.test(line)) {
      // scan forward up to 5 lines for value:
      for (let k = i + 1; k < Math.min(lines.length, i + 6); k++) {
        const vMatch = lines[k].match(/value:\s*['"]([^'"]+)['"]/)
        if (vMatch) {
          chainId = vMatch[1]
          break
        }
        // stop at closing brace
        if (/^\s*\}/.test(lines[k])) break
      }
    }

    if (!chainId) continue

    // family 판별
    const family = deriveFamily(chainId)
    if (!family) continue

    // EVM: numeric chainId 필수
    if (family === 'ethereum') {
      if (isNaN(parseInt(chainId.replace('eip155:', ''), 10))) continue
    }

    // entry block 시작을 뒤로 탐색 (indent 2칸 + id key 패턴)
    let blockStart = i
    for (let j = i - 1; j >= Math.max(0, i - 40); j--) {
      if (/^[ ]{2}['"]?[\w:.-]+['"]?\s*:\s*\{/.test(lines[j])) {
        blockStart = j
        break
      }
    }

    // entry block 끝을 앞으로 탐색 (indent 2칸의 닫는 괄호)
    // 탐색 범위를 150줄로 확대 — BITCOIN entry는 90줄 이상 (feeRateRule 등 nested 구조)
    let blockEnd = i
    for (let j = i + 1; j < Math.min(lines.length, i + 150); j++) {
      if (/^[ ]{2}\},?$/.test(lines[j])) {
        blockEnd = j
        break
      }
    }

    let isTestnet = false
    let displayName = null
    let bip44CoinType = null
    let derivationFormat = null

    for (let j = blockStart; j <= blockEnd; j++) {
      const l = lines[j]
      if (/isTestnet:\s*true/.test(l)) isTestnet = true
      // name 필드: indent 4칸 이상
      const nameMatch = l.match(/^[ ]{4}name:\s*['"]([^'"]+)['"]/)
      if (nameMatch && displayName === null) displayName = nameMatch[1]
      const bip44Match = l.match(/bip44CoinType:\s*(\d+)/)
      if (bip44Match && bip44CoinType === null) bip44CoinType = parseInt(bip44Match[1], 10)
      // derivationFormat: e.g. "m/44'/501'/<accountIdx>'" (double-quote only — path contains single quotes)
      const derivFmtMatch = l.match(/derivationFormat:\s*"([^"]+)"/)
      if (derivFmtMatch && derivationFormat === null) derivationFormat = derivFmtMatch[1]
    }

    // m09-04-10: testnet も포함 (isTestnet skip 제거 — isTestnet 필드를 출력에 보존)
    if (!displayName) continue

    // chainId는 wm source 그대로 사용 — slip44 append normalize 안 함.
    // 이전 fix(2026-05-29 CAIP-19 normalize)는 chainIdentifier.value(cip34/tron static)에
    // /slip44 append했으나, wm `_buildChainIdMultiLookupMap` key는 원본 value (slip44 없음)
    // 이므로 lookup miss → "Unknown chainId" 회귀. chains.json은 wm key와 정확 매칭 필요.
    if (seen.has(chainId)) continue
    seen.add(chainId)

    const defaultKeyPath = buildDefaultKeyPath(family, bip44CoinType, derivationFormat)
    if (!defaultKeyPath) continue

    const entry = { chainId, family, displayName, defaultKeyPath }
    if (isTestnet) entry.isTestnet = true
    chains.push(entry)
  }

  return chains
}

// ── JS 모듈에서 추출 (npm 패키지 빌드 결과) ────────────────────────────────────
// m09-04-10: chainIdentifier 지원 추가 + testnet 포함 + isTestnet 필드 출력.
function parseFamilyJs (jsPath) {
  const mod = require(jsPath) // eslint-disable-line global-require
  // 파일마다 export 이름이 다름 — 여러 후보 시도
  const currencies =
    mod.ethereumFamilyCurrencies ||
    mod.bitcoinFamilyCurrencies ||
    mod.otherNetworksCurrencies ||
    mod.default ||
    {}
  const chains = []
  const seen = new Set()

  for (const [, entry] of Object.entries(currencies)) {
    if (!entry) continue

    let chainId = null
    if (entry.caip19) {
      // caip19: full string, strip /slip44:N suffix
      chainId = entry.caip19.replace(/\/slip44:\d+$/, '')
    } else if (entry.chainIdentifier && entry.chainIdentifier.value) {
      // chainIdentifier.value: full string (wm lookup key)
      chainId = entry.chainIdentifier.value
    }
    if (!chainId) continue

    // family 판별 (m06-01-04: deriveFamily generic화)
    const family = deriveFamily(chainId)
    if (!family) continue

    if (family === 'ethereum') {
      if (isNaN(parseInt(chainId.replace('eip155:', ''), 10))) continue
    }

    if (seen.has(chainId)) continue
    seen.add(chainId)

    const isTestnet = !!entry.isTestnet
    const defaultKeyPath = buildDefaultKeyPath(family, entry.bip44CoinType || null, entry.derivationFormat || null)
    if (!defaultKeyPath) continue

    const chainEntry = { chainId, family, displayName: entry.name, defaultKeyPath }
    if (isTestnet) chainEntry.isTestnet = true
    chains.push(chainEntry)
  }
  return chains
}

// ── TRON static fallback (wallet-models에 CAIP-19 미지정) ─────────────────────
// TVM namespace는 아직 ChainAgnostic에 정의되지 않았으므로 static entry 사용
// ref: wallet-models other-networks.ts TRON entry comment
// ref: https://developers.tron.network/docs/dapp-integration-guide
// m09-04-10: TRX-TESTNET chainIdentifier value를 함께 static 등록
const TRON_STATIC = [
  {
    // wm `tron:mainnet` 단일 chainId (slip44 없음 — chainIdentifier.value 기반)
    chainId: 'tron:mainnet',
    family: 'tron',
    displayName: 'Tron',
    defaultKeyPath: "m/44'/195'/0'/0/0",
  },
  {
    chainId: 'tron:0x941250dc/slip44:195',
    family: 'tron',
    displayName: 'Tron Testnet (Nile)',
    defaultKeyPath: "m/44'/195'/0'/0/0",
    isTestnet: true,
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────
function main () {
  const allChains = []
  const familyFiles = [
    { file: 'ethereum-family.ts' },
    { file: 'bitcoin-family.ts' },
    { file: 'other-networks.ts' },
  ]

  for (const { file } of familyFiles) {
    const source = findFamilySource(file)
    if (!source) {
      console.warn('extract-chains: source not found for', file, '— skipping')
      continue
    }

    console.log('extract-chains: reading', source.path)

    let chains
    if (source.type === 'js') {
      chains = parseFamilyJs(source.path)
    } else {
      chains = parseFamilyTs(source.path)
    }
    allChains.push(...chains)
  }

  // TRON static fallback (caip19 없는 family)
  // 중복 방지: allChains에 동일 chainId가 이미 있으면 skip
  const existingChainIds = new Set(allChains.map(function (c) { return c.chainId }))
  for (const entry of TRON_STATIC) {
    if (!existingChainIds.has(entry.chainId)) {
      const staticEntry = { chainId: entry.chainId, family: entry.family, displayName: entry.displayName, defaultKeyPath: entry.defaultKeyPath }
      if (entry.isTestnet) staticEntry.isTestnet = true
      allChains.push(staticEntry)
    }
  }

  // 각 family 최소 1개 이상 있는지 확인 (Child 1-3 covered family 기준)
  // m06-01-04 신규 family는 wallet-models 인벤토리에 entry가 없을 수 있으므로 missing 검사 대상에서 제외.
  const COVERED_FAMILIES = ['ethereum', 'bitcoin', 'solana', 'xrp', 'hedera', 'stellar', 'tron']
  const missing = COVERED_FAMILIES.filter(function (fam) {
    return !allChains.some(function (c) { return c.family === fam })
  })
  if (missing.length > 0) {
    console.warn('extract-chains: WARNING — missing families:', missing.join(', '))
  }

  if (allChains.length < 5) {
    console.error('extract-chains: suspiciously few chains extracted (' + allChains.length + '). Aborting.')
    process.exit(1)
  }

  // playground 지원 목록에서 명시적으로 제외할 chainId (denylist).
  // 이 목록은 **playground 테스트 표면 전용**이며 runtime connector API(src/)에는 영향 없음 —
  // connector-chain-addition-isolation 룰의 대상(chain enum/정적 라우팅 매핑)이 아니라
  // 생성기 후처리 필터다. 제외 사유를 각 항목에 명시한다.
  const EXCLUDED_CHAIN_IDS = new Set([
    // Flare Network Coston (eip155:16) — device coin_list의 EVM 멀티체인 capability('CHAN')로
    // 커버되지 않는 전용 deviceStoreId(FLR-COSTON)라 서명 시 5005(device_fw_incompatible) 발생.
    // wm testnetFor 미연결(등록 갭). playground에서 테스트 불가하므로 지원 목록에서 제외.
    'eip155:16/slip44:60',
  ])
  const publishedChains = allChains.filter(function (c) { return !EXCLUDED_CHAIN_IDS.has(c.chainId) })
  const excludedCount = allChains.length - publishedChains.length

  // 출력 디렉터리 생성
  const outDir = path.dirname(OUTPUT_PATH)
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(publishedChains, null, 2) + '\n')

  // family별 통계 출력
  const stats = {}
  const testnetCount = publishedChains.filter(function (c) { return c.isTestnet }).length
  for (const c of publishedChains) {
    stats[c.family] = (stats[c.family] || 0) + 1
  }
  if (excludedCount > 0) {
    console.log('extract-chains: excluded ' + excludedCount + ' chain(s) via denylist')
  }
  console.log('extract-chains: wrote ' + publishedChains.length + ' chains to ' + OUTPUT_PATH)
  console.log('  mainnet: ' + (publishedChains.length - testnetCount) + ', testnet: ' + testnetCount)
  for (const [fam, count] of Object.entries(stats)) {
    console.log('  ' + fam + ': ' + count)
  }
}

main()
