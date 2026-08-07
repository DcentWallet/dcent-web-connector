#!/usr/bin/env node
/**
 * docs/index.html 의 **펌웨어 표 모델 축(bio / x) 전수 검사** (m09-04-28).
 *
 * 왜 필요한가 — DCENT X 는 펌웨어 `1.x` 라인이고 D'CENT Biometric Wallet 은 `1.x~2.x` 라인이다.
 * 두 값을 **한 컬럼**에 합치면 X 사용자에게 "내 펌웨어 1.0.0 < 2.35.0 → 미지원"으로 읽혀,
 * 실제로는 지원되는 기능을 안 쓰게 된다. 그래서 표의 값은 `{bio, x}` **두 키가 항상 함께**여야 하고,
 * 한쪽만 채운 상태는 사람 눈에 안 띈다(120셀 + 27행 규모). 이 게이트가 그 누락을 대신 본다.
 *
 * 🔴 정적 grep 이 아니라 **문서를 실제로 실행**해서(jsdom) `window.FWREQ` / `window.MATRIX` 를 읽는다 —
 *    MATRIX 값에는 `<span class=tok-acc>` HTML 이 섞여 있어 정규식 절단이 취약하다.
 *    형제 선례: `check-index-html-page-refs.mjs`(문서 실행 후 `window.PAGES` 읽기).
 *
 * objective m09-04-28 테스트 항목 매핑:
 *   T-DOC-MODEL-01 → (a) FWREQ 전수      T-DOC-MODEL-02 → (b) MATRIX(fw 보유 행)
 *   T-DOC-MODEL-03 → (c)/(d) EN·KO 4블록 + Min FW 헤더 2개
 *   T-DOC-MODEL-04 → 뮤테이션 검출(이 스크립트를 대상으로 objective §8 3번 명령이 수행)
 *   T-DOC-SYNC-01  → `yarn check:docs` 체인에 배선됨
 *
 * 검사 4종:
 *   (a) FWREQ — 전 체인 × 전 메서드 행의 값이 `{bio, x}` 두 키를 non-empty 로 보유
 *   (b) MATRIX — **`fw` 키가 있는 행만** 대상. `fw` 부재 행은 지금도 `—` 로 렌더되므로 skip
 *       (전 행에 `fw` 를 강제하면 현재 통과 중인 행이 곧바로 실패한다)
 *   (c) 하드코딩 Requirements/요구사항 블록 — EN/KO **각각** 두 모델 이름을 모두 포함
 *       (EN 만 고치고 KO 를 빠뜨린 상태를 잡는 것이 이 검사의 목적 — 실사고 선례가 있다)
 *   (d) Support Matrix 표 헤더 — EN/KO 각각 모델별 `Min FW` 컬럼 2개 보유
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const INDEX = resolve(here, '../docs/index.html')

/** 모델 라벨 — 문서 전체에서 이 표기를 정본으로 쓴다 (dcentx-model-id-naming 과 짝). */
const BIO = "D'CENT Biometric Wallet"
const X = 'DCENT X'

const html = readFileSync(INDEX, 'utf8')

// jsdom 미구현 브라우저 API(`window.scrollTo` 등)만 삼킨다. 삼킨 탓에 데이터가 비면
// 아래 fail-closed 가드가 잡는다 — "조용히 아무것도 검사 안 함"을 만들지 않는다.
const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', () => {})

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.org/',
  virtualConsole,
})
const w = dom.window
await new Promise((r) => setTimeout(r, 300))

const failures = []

/** `{bio, x}` 두 키가 non-empty string 인지. 위반 사유 문자열, 정상이면 null. */
function badModelPair(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return `모델 객체가 아님 (${JSON.stringify(v)})`
  const missing = ['bio', 'x'].filter((k) => typeof v[k] !== 'string' || v[k].trim() === '')
  return missing.length > 0 ? `${missing.join(' / ')} 키 누락 또는 빈 값 (${JSON.stringify(v)})` : null
}

// ── (a) FWREQ ────────────────────────────────────────────────────────────────
const fwreq = w.FWREQ
let fwreqCells = 0
if (fwreq === null || typeof fwreq !== 'object' || Object.keys(fwreq).length === 0) {
  failures.push('window.FWREQ 가 비어 있다 — 문서 스크립트 실행 실패로 검사가 성립하지 않는다.')
} else {
  for (const [chainId, rows] of Object.entries(fwreq)) {
    if (!Array.isArray(rows) || rows.length === 0) {
      failures.push(`FWREQ["${chainId}"] 가 비어 있다`)
      continue
    }
    for (const row of rows) {
      const method = Array.isArray(row) ? row[0] : '(unknown)'
      const bad = Array.isArray(row) ? badModelPair(row[1]) : '행이 배열이 아님'
      if (bad) failures.push(`FWREQ["${chainId}"] ${method}: ${bad}`)
      else fwreqCells += 1
    }
  }
}

// ── (b) MATRIX (fw 보유 행만) ────────────────────────────────────────────────
const matrix = w.MATRIX
let matrixChecked = 0
let matrixSkipped = 0
if (!Array.isArray(matrix) || matrix.length === 0) {
  failures.push('window.MATRIX 가 비어 있다 — 문서 스크립트 실행 실패로 검사가 성립하지 않는다.')
} else {
  for (const row of matrix) {
    if (row?.fw === undefined) {
      matrixSkipped += 1 // 지금도 `—` 로 렌더된다 — 2컬럼 전환 대상이 아니다
      continue
    }
    const bad = badModelPair(row.fw)
    if (bad) failures.push(`MATRIX "${row?.n ?? row?.id ?? '(unnamed)'}" fw: ${bad}`)
    else matrixChecked += 1
  }
}

// ── (c) 하드코딩 Requirements / 요구사항 블록 (EN·KO 각각) ────────────────────
const pages = w.PAGES ?? {}
const reqBlocks = []
for (const [id, page] of Object.entries(pages)) {
  for (const field of ['html', 'ko']) {
    const src = page?.[field]
    if (typeof src !== 'string') continue
    const re = /<h2[^>]*>(?:Requirements|요구사항)<\/h2>/g
    let m
    while ((m = re.exec(src)) !== null) {
      const start = m.index
      const nextH2 = src.indexOf('<h2', start + m[0].length)
      reqBlocks.push({ id, field, body: src.slice(start, nextH2 === -1 ? src.length : nextH2) })
    }
  }
}
// fail-closed — 블록을 하나도 못 찾으면 "위반 0건"이 공허하게 통과한다.
if (reqBlocks.length < 4) {
  failures.push(
    `하드코딩 Requirements 블록을 ${reqBlocks.length}개만 찾았다 (기대 4개 이상: overview EN/KO + get-publickey EN/KO). ` +
      '블록이 사라졌거나 마크업이 바뀌었다면 이 검사를 먼저 갱신할 것.',
  )
}
for (const field of ['html', 'ko']) {
  if (!reqBlocks.some((b) => b.field === field)) {
    failures.push(`${field === 'ko' ? 'KO' : 'EN'} 쪽 Requirements 블록이 하나도 없다 — 한쪽 언어가 통째로 빠졌다.`)
  }
}
/** 한 조각(표 헤더 / 카드)이 한 모델만 말하고 있으면 위반. 둘 다 없으면 비대상(무관 조각). */
function missingModelLabels(fragment) {
  const has = { [BIO]: fragment.includes(BIO), [X]: fragment.includes(X) }
  if (!has[BIO] && !has[X]) return null
  return [BIO, X].filter((label) => !has[label])
}

for (const b of reqBlocks) {
  // 블록 전체에 두 모델이 다 있어야 한다 (통째로 단일 모델로 되돌린 상태를 잡는다)
  const missing = [BIO, X].filter((label) => !b.body.includes(label))
  if (missing.length > 0) {
    failures.push(`Requirements 블록 [${b.id}.${b.field}] 에 모델 표기 누락: ${missing.join(' / ')}`)
  }

  // 🔴 블록 전체 containment 만으로는 부족하다 — 표 헤더에서 X 컬럼만 지워도 lead 문단에 이름이
  //    남아 블록 단위로는 통과한다. 그래서 **조각 단위**로 "한쪽만 말하는 상태"를 금지한다.
  for (const [, thead] of b.body.matchAll(/<thead>([\s\S]*?)<\/thead>/g)) {
    const m = missingModelLabels(thead)
    if (m === null) {
      failures.push(`Requirements 표 헤더 [${b.id}.${b.field}] 에 모델 컬럼이 없다 — 2모델 표가 아니다.`)
    } else if (m.length > 0) {
      failures.push(`Requirements 표 헤더 [${b.id}.${b.field}] 에 모델 컬럼 누락: ${m.join(' / ')}`)
    }
  }
  for (const [, card] of b.body.matchAll(/<div class="rq">([\s\S]*?)(?=<div class="rq">|<\/div>\s*$)/g)) {
    const m = missingModelLabels(card)
    if (m !== null && m.length > 0) {
      failures.push(`Requirements 카드 [${b.id}.${b.field}] 가 한 모델만 언급한다 — 누락: ${m.join(' / ')}`)
    }
  }
}

// ── (d) Support Matrix 헤더 (EN·KO 각각 모델별 Min FW 컬럼) ──────────────────
const matrixHeaders = []
for (const [id, page] of Object.entries(pages)) {
  for (const field of ['html', 'ko']) {
    const src = page?.[field]
    // `table class="matrix"` 는 EVM/Cosmos/Substrate 목록 표도 쓴다 — 그쪽엔 펌웨어 컬럼이 없다.
    // 대상은 **`Min FW` 컬럼을 가진 표**(Support Matrix EN/KO)뿐이다.
    if (typeof src !== 'string' || !src.includes('table class="matrix"') || !src.includes('Min FW')) continue
    matrixHeaders.push({ id, field, src })
  }
}
if (matrixHeaders.length < 2) {
  failures.push(
    `Support Matrix 표를 ${matrixHeaders.length}개만 찾았다 (기대 2개 이상: EN/KO). 마크업이 바뀌었다면 이 검사를 먼저 갱신할 것.`,
  )
}
for (const h of matrixHeaders) {
  const missing = [`Min FW · ${BIO}`, `Min FW · ${X}`].filter((label) => !h.src.includes(label))
  if (missing.length > 0) {
    failures.push(`Support Matrix 헤더 [${h.id}.${h.field}] 에 모델 컬럼 누락: ${missing.join(' / ')}`)
  }
}

if (failures.length > 0) {
  console.error('✗ docs/index.html 펌웨어 표 모델 축(bio/x) 검사 실패')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(
  `✓ docs/index.html 펌웨어 모델 축 — FWREQ ${fwreqCells}행(체인 ${Object.keys(fwreq).length}) · ` +
    `MATRIX ${matrixChecked}행 검사 / ${matrixSkipped}행 skip(fw 미지정) · ` +
    `Requirements 블록 ${reqBlocks.length} · Support Matrix 헤더 ${matrixHeaders.length}`,
)
