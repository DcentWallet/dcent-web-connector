#!/usr/bin/env node
/**
 * extract-chains.js — EVM chain metadata 추출 스크립트
 *
 * refer-repos/dcent-wallet-models/src/common/assets/coins/families/ethereum-family.ts
 * 또는 wallet-models npm 패키지에서 EVM mainnet 체인 목록을 추출하여
 * playground/chains.evm.json으로 저장한다.
 *
 * 출력 shape (ChainEntry):
 *   chainId:       string  — CAIP-19 namespace only, e.g. "eip155:1"
 *   family:        'ethereum'
 *   displayName:   string  — human readable name
 *   defaultKeyPath: string — default BIP32 derivation path
 *
 * 실행: node scripts/extract-chains.js
 * 또는 yarn extract-chains (package.json scripts에 등록)
 *
 * 출력 경로: playground/chains.evm.json
 */

'use strict'

const fs = require('fs')
const path = require('path')

const OUTPUT_PATH = path.resolve(__dirname, '..', 'playground', 'chains.evm.json')

// ── 소스 결정: npm 패키지 우선, 없으면 refer-repos TypeScript 파싱 ──
function findEthereumFamilySource () {
  // 1) npm 패키지 (빌드 환경)
  const npmCandidates = [
    path.resolve(__dirname, '..', 'node_modules', '@iotrustgithub', 'dcent-wallet-models'),
    path.resolve(__dirname, '..', 'node_modules', 'dcent-wallet-models'),
  ]
  for (const base of npmCandidates) {
    const candidates = [
      path.join(base, 'lib', 'common', 'assets', 'coins', 'families', 'ethereum-family.js'),
      path.join(base, 'src', 'common', 'assets', 'coins', 'families', 'ethereum-family.ts'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return { path: p, type: fs.extname(p) === '.ts' ? 'ts' : 'js' }
    }
  }

  // 2) refer-repos (로컬 개발 환경)
  // scripts/ → connector/ → main-repos/ → dcent-web-sdk-uap/ → refer-repos/
  const referReposTs = path.resolve(
    __dirname, '..', '..', '..', 'refer-repos', 'dcent-wallet-models',
    'src', 'common', 'assets', 'coins', 'families', 'ethereum-family.ts'
  )
  if (fs.existsSync(referReposTs)) return { path: referReposTs, type: 'ts' }

  return null
}

// ── TypeScript 소스를 regex 파싱하여 EVM mainnet 체인 추출 ──
function parseEthereumFamilyTs (tsPath) {
  const src = fs.readFileSync(tsPath, 'utf8')
  const chains = []
  const seen = new Set()

  // 전략:
  // caip19 line을 pivot으로, 해당 entry block 경계 안에서만 필드를 스캔한다.
  // entry block 시작: caip19 이전에 나오는 가장 가까운 "  'KEY': {" 또는 "  KEY: {" 패턴
  // entry block 종료: caip19 이후에 나오는 가장 가까운 단독 "  }," 또는 "  }"
  // 이렇게 하면 다른 entry의 필드(예: 파일 상단 공유 units 상수)가 섞이지 않는다.

  const lines = src.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const caip19Match = line.match(/caip19:\s*['"]([^'"]+)['"]/)
    if (!caip19Match) continue

    const caip19Full = caip19Match[1]
    if (!caip19Full.startsWith('eip155:')) continue

    const chainId = caip19Full.replace(/\/slip44:\d+$/, '')
    if (isNaN(parseInt(chainId.replace('eip155:', ''), 10))) continue

    // entry block 시작을 뒤로 탐색 (indent 2칸 + id key 패턴)
    let blockStart = i
    for (let j = i - 1; j >= Math.max(0, i - 40); j--) {
      if (/^  ['"]?[\w:.-]+['"]?\s*:\s*\{/.test(lines[j])) {
        blockStart = j
        break
      }
    }

    // entry block 끝을 앞으로 탐색 (indent 2칸의 닫는 괄호)
    let blockEnd = i
    for (let j = i + 1; j < Math.min(lines.length, i + 80); j++) {
      if (/^  \},?$/.test(lines[j])) {
        blockEnd = j
        break
      }
    }

    let isTestnet = false
    let displayName = null
    let bip44CoinType = 60

    for (let j = blockStart; j <= blockEnd; j++) {
      const l = lines[j]
      if (/isTestnet:\s*true/.test(l)) isTestnet = true
      // name 필드: indent 4칸 이상의 "name:" (공유 units 상수는 파일 상단 indent 0)
      const nameMatch = l.match(/^    name:\s*['"]([^'"]+)['"]/)
      if (nameMatch && displayName === null) displayName = nameMatch[1]
      const bip44Match = l.match(/bip44CoinType:\s*(\d+)/)
      if (bip44Match) bip44CoinType = parseInt(bip44Match[1], 10)
    }

    if (isTestnet) continue
    if (!displayName) continue
    if (seen.has(chainId)) continue
    seen.add(chainId)

    const defaultKeyPath = `m/44'/${bip44CoinType}'/0'/0/0`
    chains.push({ chainId, family: 'ethereum', displayName, defaultKeyPath })
  }

  return chains
}

// ── JS 모듈에서 추출 (npm 패키지 빌드 결과) ──
function parseEthereumFamilyJs (jsPath) {
  // eslint-disable-next-line import/no-dynamic-require
  const mod = require(jsPath)
  const currencies = mod.ethereumFamilyCurrencies || mod.default || {}
  const chains = []
  const seen = new Set()

  for (const [, entry] of Object.entries(currencies)) {
    if (!entry || !entry.caip19) continue
    if (!entry.caip19.startsWith('eip155:')) continue
    if (entry.isTestnet) continue

    const chainId = entry.caip19.replace(/\/slip44:\d+$/, '')
    if (seen.has(chainId)) continue
    seen.add(chainId)

    const bip44 = entry.bip44CoinType || 60
    chains.push({
      chainId,
      family: 'ethereum',
      displayName: entry.name,
      defaultKeyPath: `m/44'/${bip44}'/0'/0/0`,
    })
  }
  return chains
}

// ── Main ──
function main () {
  const source = findEthereumFamilySource()
  if (!source) {
    console.error([
      'extract-chains: wallet-models source not found.',
      '  Expected one of:',
      '    node_modules/@iotrustgithub/dcent-wallet-models/...',
      '    ../../../../refer-repos/dcent-wallet-models/src/...',
      '',
      '  In CI: npm/yarn install with wallet-models in devDependencies.',
      '  Locally: clone refer-repos/dcent-wallet-models (see refer-repos/README.md).',
    ].join('\n'))
    process.exit(1)
  }

  console.log('extract-chains: reading', source.path)

  let chains
  if (source.type === 'js') {
    chains = parseEthereumFamilyJs(source.path)
  } else {
    chains = parseEthereumFamilyTs(source.path)
  }

  if (chains.length < 5) {
    console.error('extract-chains: suspiciously few chains extracted (' + chains.length + '). Aborting.')
    process.exit(1)
  }

  // 출력 디렉터리 생성
  const outDir = path.dirname(OUTPUT_PATH)
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(chains, null, 2) + '\n')
  console.log('extract-chains: wrote ' + chains.length + ' chains to ' + OUTPUT_PATH)
}

main()
