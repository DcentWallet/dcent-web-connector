#!/usr/bin/env node
/**
 * extract-chains.js — 모든 family chain metadata 추출 스크립트
 *
 * refer-repos/dcent-wallet-models/src/common/assets/coins/families/ 또는
 * npm 패키지에서 mainnet 체인 목록을 추출하여 playground/chains.json으로 저장한다.
 *
 * 출력 shape (ChainEntry):
 *   chainId:        string  — CAIP-19 namespace only, e.g. "eip155:1", "bip122:000…", "solana:5eykt…"
 *   family:         string  — deriveFamily() 출력 (14개 known + 알 수 없는 namespace fallback)
 *   displayName:    string  — human readable name
 *   defaultKeyPath: string  — default BIP32 derivation path
 *
 * 실행: node scripts/extract-chains.js
 * 또는 yarn extract-chains (package.json scripts에 등록)
 *
 * 출력 경로: playground/chains.json (통합 파일 — m06-01-03)
 *
 * deriveFamily() — CAIP-19 namespace → family name (m06-01-04 generic화).
 * known map (14 namespace, R1=a 결정):
 *   eip155 → ethereum, bip122 → bitcoin, solana → solana, xrpl → xrp,
 *   hedera → hedera, stellar → stellar, tron → tron (caip19 미지정 → TRON_STATIC fallback),
 *   algorand / conflux / cosmos / fil / polkadot / stacks / tezos / vechain → 동일 family명.
 * 알 수 없는 namespace는 namespace 자체를 family명으로 사용 (fallback).
 */

'use strict'

const fs = require('fs')
const path = require('path')

const OUTPUT_PATH = path.resolve(__dirname, '..', 'playground', 'chains.json')

// ── deriveFamily: CAIP-19 namespace → family name ─────────────────────────────
// wallet-models cryptoCurrencies registry의 모든 namespace를 family로 매핑.
// 알 수 없는 namespace는 namespace 자체를 family명으로 사용 (fallback).
// R1=a 결정: wallet-models 인벤토리 기준 14개 namespace 매핑.
const FAMILY_KNOWN_MAP = {
  // 기존 7 family (Child 1-3 covered)
  eip155: 'ethereum',
  bip122: 'bitcoin',
  solana: 'solana',
  xrpl:   'xrp',
  hedera: 'hedera',
  stellar:'stellar',
  tron:   'tron',
  // m06-01-04 신규 8 family
  algorand: 'algorand',
  conflux:  'conflux',
  cosmos:   'cosmos',
  fil:      'fil',
  polkadot: 'polkadot',
  stacks:   'stacks',
  tezos:    'tezos',
  vechain:  'vechain',
}

// CAIP-19 namespace로부터 family 도출.
// chainId가 빈 문자열 / non-string / `:` 미포함이면 null 반환 (caller가 skip).
// known map에 있으면 그 값, 없으면 namespace 자체를 family명으로 사용 (fallback).
function deriveFamily (chainId) {
  if (typeof chainId !== 'string' || chainId.length === 0) return null
  const ns = chainId.split(':')[0]
  if (!ns) return null
  return FAMILY_KNOWN_MAP[ns] || ns
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
// caip19 line을 pivot으로, entry block 경계 안에서만 필드를 스캔한다.
function parseFamilyTs (tsPath) {
  const src = fs.readFileSync(tsPath, 'utf8')
  const chains = []
  const seen = new Set()
  const lines = src.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const caip19Match = line.match(/caip19:\s*['"]([^'"]+)['"]/)
    if (!caip19Match) continue

    const caip19Full = caip19Match[1]
    // namespace:chainRef/slip44:N → namespace:chainRef
    const chainId = caip19Full.replace(/\/slip44:\d+$/, '')

    // family 판별 (m06-01-04: deriveFamily generic화)
    const family = deriveFamily(chainId)
    if (!family) continue

    // EVM: numeric chainId 필수
    if (family === 'ethereum') {
      if (isNaN(parseInt(chainId.replace('eip155:', ''), 10))) continue
    }

    // entry block 시작을 뒤로 탐색 (indent 2칸 + id key 패턴)
    let blockStart = i
    for (let j = i - 1; j >= Math.max(0, i - 40); j--) {
      if (/^  ['"]?[\w:.-]+['"]?\s*:\s*\{/.test(lines[j])) {
        blockStart = j
        break
      }
    }

    // entry block 끝을 앞으로 탐색 (indent 2칸의 닫는 괄호)
    // 탐색 범위를 150줄로 확대 — BITCOIN entry는 90줄 이상 (feeRateRule 등 nested 구조)
    let blockEnd = i
    for (let j = i + 1; j < Math.min(lines.length, i + 150); j++) {
      if (/^  \},?$/.test(lines[j])) {
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
      const nameMatch = l.match(/^    name:\s*['"]([^'"]+)['"]/)
      if (nameMatch && displayName === null) displayName = nameMatch[1]
      const bip44Match = l.match(/bip44CoinType:\s*(\d+)/)
      if (bip44Match && bip44CoinType === null) bip44CoinType = parseInt(bip44Match[1], 10)
      // derivationFormat: e.g. "m/44'/501'/<accountIdx>'" (double-quote only — path contains single quotes)
      const derivFmtMatch = l.match(/derivationFormat:\s*"([^"]+)"/)
      if (derivFmtMatch && derivationFormat === null) derivationFormat = derivFmtMatch[1]
    }

    if (isTestnet) continue
    if (!displayName) continue
    if (seen.has(chainId)) continue
    seen.add(chainId)

    // defaultKeyPath 결정
    let defaultKeyPath
    if (derivationFormat) {
      // <accountIdx> → 0 으로 치환해 구체 path 생성
      defaultKeyPath = derivationFormat.replace(/<accountIdx>/g, '0')
    } else if (bip44CoinType !== null) {
      if (family === 'ethereum') {
        defaultKeyPath = `m/44'/${bip44CoinType}'/0'/0/0`
      } else if (family === 'bitcoin') {
        // Native SegWit (BIP-84): m/84'/0'/0'/0/0 for mainnet, legacy m/44'/0'/0'/0/0
        // objective §3 비스코프: native segwit 단일 — m/84'/0'/0'/0/0
        defaultKeyPath = `m/84'/${bip44CoinType}'/0'/0/0`
      } else if (family === 'solana') {
        defaultKeyPath = `m/44'/${bip44CoinType}'/0'`
      } else if (family === 'xrp') {
        defaultKeyPath = `m/44'/${bip44CoinType}'/0'/0/0`
      } else if (family === 'hedera') {
        defaultKeyPath = `m/44'/${bip44CoinType}'/0'/0/0`
      } else if (family === 'stellar') {
        defaultKeyPath = `m/44'/${bip44CoinType}'/0'`
      } else {
        defaultKeyPath = `m/44'/${bip44CoinType}'/0'/0/0`
      }
    } else {
      continue // bip44CoinType 없으면 skip
    }

    chains.push({ chainId, family, displayName, defaultKeyPath })
  }

  return chains
}

// ── JS 모듈에서 추출 (npm 패키지 빌드 결과) ────────────────────────────────────
function parseFamilyJs (jsPath) {
  // eslint-disable-next-line import/no-dynamic-require
  const mod = require(jsPath)
  // 파일마다 export 이름이 다름 — 여러 후보 시도
  const currencies = mod.ethereumFamilyCurrencies
    || mod.bitcoinFamilyCurrencies
    || mod.otherNetworksCurrencies
    || mod.default
    || {}
  const chains = []
  const seen = new Set()

  for (const [, entry] of Object.entries(currencies)) {
    if (!entry || !entry.caip19) continue
    if (entry.isTestnet) continue

    const chainId = entry.caip19.replace(/\/slip44:\d+$/, '')

    // family 판별 (m06-01-04: deriveFamily generic화)
    const family = deriveFamily(chainId)
    if (!family) continue

    if (family === 'ethereum') {
      if (isNaN(parseInt(chainId.replace('eip155:', ''), 10))) continue
    }

    if (seen.has(chainId)) continue
    seen.add(chainId)

    const bip44 = entry.bip44CoinType || 0
    let defaultKeyPath
    if (entry.derivationFormat) {
      defaultKeyPath = entry.derivationFormat.replace(/<accountIdx>/g, '0')
    } else if (family === 'ethereum') {
      defaultKeyPath = `m/44'/${bip44}'/0'/0/0`
    } else if (family === 'bitcoin') {
      defaultKeyPath = `m/84'/${bip44}'/0'/0/0`
    } else if (family === 'solana') {
      defaultKeyPath = `m/44'/${bip44}'/0'`
    } else if (family === 'stellar') {
      defaultKeyPath = `m/44'/${bip44}'/0'`
    } else {
      defaultKeyPath = `m/44'/${bip44}'/0'/0/0`
    }

    chains.push({ chainId, family, displayName: entry.name, defaultKeyPath })
  }
  return chains
}

// ── TRON static fallback (wallet-models에 CAIP-19 미지정) ─────────────────────
// TVM namespace는 아직 ChainAgnostic에 정의되지 않았으므로 static entry 사용
// ref: wallet-models other-networks.ts TRON entry comment
// ref: https://developers.tron.network/docs/dapp-integration-guide
const TRON_STATIC = [
  {
    chainId: 'tron:mainnet',
    family: 'tron',
    displayName: 'Tron',
    defaultKeyPath: "m/44'/195'/0'/0/0",
    // Source: SLIP-0044 coin type 195 for TRON
    // https://github.com/satoshilabs/slips/blob/master/slip-0044.md
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
  // 중복 방지: allChains에 tron:mainnet이 이미 있으면 skip
  const existingChainIds = new Set(allChains.map(function (c) { return c.chainId }))
  for (const entry of TRON_STATIC) {
    if (!existingChainIds.has(entry.chainId)) {
      // entry에서 source comment 제거 후 push
      allChains.push({ chainId: entry.chainId, family: entry.family, displayName: entry.displayName, defaultKeyPath: entry.defaultKeyPath })
    }
  }

  // 각 family 최소 1개 이상 있는지 확인 (Child 1-3 covered family 기준)
  // m06-01-04 신규 8 family는 wallet-models 인벤토리에 entry가 없을 수 있으므로 missing 검사 대상에서 제외.
  // 신규 family 누락은 known map 기반 fallback으로 자동 노출되므로 별도 검증 불필요.
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

  // 출력 디렉터리 생성
  const outDir = path.dirname(OUTPUT_PATH)
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allChains, null, 2) + '\n')

  // family별 통계 출력
  const stats = {}
  for (const c of allChains) {
    stats[c.family] = (stats[c.family] || 0) + 1
  }
  console.log('extract-chains: wrote ' + allChains.length + ' chains to ' + OUTPUT_PATH)
  for (const [fam, count] of Object.entries(stats)) {
    console.log('  ' + fam + ': ' + count)
  }
}

main()
