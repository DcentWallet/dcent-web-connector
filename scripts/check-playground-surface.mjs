#!/usr/bin/env node
/**
 * playground(index-v2.html + playground.js) 다크 표면 게이트 — P1~P5. (m15-02-03)
 *
 * 왜 필요한가 — 초안의 검증은 objective 문서 안의 inline `node -e` 였다. 그건 머지되는 순간
 * 사라진다(`check:docs` 체인에 없으므로 이후 어떤 PR도 회귀를 못 잡는다). 게다가 판정 방식
 * 자체가 목적(D18 — 밝은 표면을 없앤다)을 못 쟀다. 2026-08-12 4축 크로스 리뷰가 실증한 우회:
 *
 *   - var(--pg-*) 사용처 13곳을 밝은 리터럴로 전부 되돌려도 옛 cmd3/cmd4는 :root 선언만 읽어
 *     통과했다 (사용처를 안 봄)
 *   - background-color:#fff / #ffffff / background:#fff none — 옛 cmd2는 `background: *#fff;`
 *     리터럴 문자열만 봤다
 *   - --pg-bg ↔ --pg-selected 값 스왑 — 옛 cmd3은 Set 대조라 순열에 투명했다
 *   - color: var(--pg-border)(1.58) — 옛 cmd4는 고정 6쌍만 계산해 실제 사용처를 안 봤다
 *   - .field-error 를 #dc2626(3.40)으로 되돌림 — 옛 denylist 7값에 #dc2626 이 없었다
 *   - playground.js 의 밝은 인라인 섬 — 스캔 모수에 그 파일이 아예 없었다
 *
 * 이 스크립트는 판정 기준을 "값 목록"에서 "휘도"로, 모수를 "파일 하나"에서 "표면 전체"로 바꾼다.
 *
 * 검사 5종:
 *   P1 밝은 표면    — 스캔 모수(index-v2.html + playground.js)의 모든 hex 리터럴을 열거해
 *                     상대휘도 > 0.5 인 것이 --pg-* 선언 밖에 0. 명시 예외는 양방향 대조
 *                     (실측==명시) + resolved-by 필수.
 *   P2 토큰 맵      — --pg-* 7키를 키→값 맵으로 전건 일치(Set 아님 — 값 스왑 검출).
 *   P3 사용처 대비  — CSS 블록을 순회해 실제 잉크↔배경 조합을 유도해 전건 검사(텍스트 ≥4.5,
 *                     비텍스트 ≥3.0). 고정 쌍 목록 금지.
 *   P4 사용처 floor — var(--pg-*) 사용처 ≥ REPO_P4_FLOOR(주석 제거 후 실측). 토큰 블록만 남기고
 *                     사용처를 되돌리는 우회를 막는다.
 *   P5 구조 floor   — 주석 제거 후 CSS 규칙 수 ≥ REPO_P5_FLOOR(실측). 문자열 `background`
 *                     카운트는 주석으로 패딩 가능하므로 폐기.
 *   (세 floor 의 현재 실측치와 근거는 아래 REPO_P3/P4/P5_FLOOR 선언부 주석 — 숫자를 두 곳에
 *    적으면 한쪽이 반드시 stale 이 된다)
 *
 * 🔴 알려진 한계(2026-08-12 리뷰 확정, 의도적으로 스코프 밖에 둠) — P1 은 `#rgb`/`#rrggbb` hex
 *    리터럴만 스캔한다. `rgb()`/`rgba()`/`hsl()`/8자리 hex/CSS 색 키워드(`white` 등)로 같은 값을
 *    표기하면 P1 이 못 잡는다. 지금 이 두 파일에는 그런 표기가 0건이라(실측) 당장 악용 가능한
 *    구멍은 아니지만, 원리적으로는 존재한다. 완전한 방어에는 CSS 색 파서(색 공간 전체 정규화)가
 *    필요한데, 이 objective 의 스코프(hex 리터럴을 --pg-* 로 치환)를 넘는 투자라 지금은 hex 만
 *    막는다 — `check-index-html-fw-models.mjs` 의 "실수를 막고 의도적 우회는 막지 않는다" 원칙과
 *    같은 판단이다. 다음에 이 표기들이 실제로 쓰이면 그때 확장한다.
 *
 * 🔴 알려진 한계 2 (2026-08-13 크로스 리뷰 WARNING-2) — P2 의 토큰 맵은 `findRootBlockRange` 가
 *    찾은 **`:root` 블록 안에서만** 파싱된다. 런타임에는 `body { --pg-border: … }` 같은 후속
 *    선언이 문서 전체를 덮는데 이 게이트는 그걸 못 본다(실측: `:root` 를 그대로 두고 `body` 에
 *    옛 값을 재선언하면 exit 0, P3 는 계속 새 값 기준으로 측정한다). 지금 이 파일에는 `:root`
 *    밖 `--pg-*` 선언이 0건이며(실측), 이 경로는 "실수" 보다 "의도적 우회" 에 가깝다 — 위 한계 1
 *    과 같은 원칙으로 스코프 밖에 둔다. 막으려면 <style> 전체에서 `--pg-*:` 출현 위치를 스캔해
 *    인식된 :root 범위 밖이면 finding 을 내면 된다(약 3줄).
 *
 * 🔴 알려진 한계 3 (2026-08-13 크로스 리뷰 WARNING-3) — P4/P5 floor 는 **하한**이라, 검사 대상을
 *    지우면서 동시에 같은 수의 **실선언**을 더하면 총량이 유지돼 통과한다(실측: 폼 컨트롤의
 *    background/color 를 지우고 더미 규칙 2개를 넣으면 p4 35 · p5 60 으로 오히려 늘어 exit 0).
 *    P5 주석이 말하는 "주석 패딩" 은 막았지만 **실규칙 패딩** 은 남아 있다. floor 는 "되돌리기"
 *    를 막는 장치이지 "총량 위장" 을 막는 장치가 아니다 — 후자는 개별 앵커/사용처 유도(P3)가
 *    담당한다. 의도적 우회 축이라 위 두 한계와 같은 판단으로 스코프 밖에 둔다.
 *
 * 🔴 P3 설계 노트 — jsdom 의 CSS 커스텀 프로퍼티(var()) 해석은 이 리포 jsdom 버전에서 신뢰할 수
 *    없었다(실측: `#conn-dot`의 자체 `background: var(--pg-muted)`가 getComputedStyle에서
 *    빈 문자열로 나오고 조상 리터럴 배경으로 새버림). 게다가 `.field-error`/`.tree-item.selected`
 *    같은 클래스는 playground.js가 런타임에 동적으로 붙이는 것이라 정적 마크업에 엘리먼트 자체가
 *    없다. 그래서 DOM 렌더 대신 **텍스트 기반 CSS 파서 + 구조적 포함관계 맵**을 쓴다 — 포함관계
 *    (어느 셀렉터가 어느 컨테이너 안에 있는가)는 색이 아니라 **DOM 구조**이므로, 색을 스왑해도
 *    포함관계 맵 자체는 안 깨진다(색은 항상 --pg-* 선언에서 라이브로 읽는다 — 하드코딩 안 함).
 *    이 맵은 index-v2.html/playground.js의 실제 마크업·appendChild 대상을 grep으로 확인해
 *    작성했다(§ CONTAINER_OF 주석 참조). DOM 구조가 바뀌면 이 맵도 함께 갱신해야 한다.
 *
 * 사용법:
 *   node scripts/check-playground-surface.mjs             # 실제 리포 스캔
 *   node scripts/check-playground-surface.mjs --test      # tests/fixtures/playground-surface/* 전부
 *   node scripts/check-playground-surface.mjs --fixture <dir>
 *
 * exit code: 0=clean · 1=findings(밝은 표면/대비 미달/토큰 불일치/floor 미달) · 2=usage/구조 오류
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const FIXTURES_ROOT = join(here, '..', 'tests', 'fixtures', 'playground-surface')

process.on('uncaughtException', (e) => {
  console.error(`ERROR: 예상치 못한 예외 — 구조 오류로 처리 (exit 2): ${e && e.stack ? e.stack : e}`)
  process.exit(2)
})

// ════════════════════════════════════════════════════════════════════════
// 색 유틸
// ════════════════════════════════════════════════════════════════════════

function parseHex(v) {
  if (typeof v !== 'string') return null
  let h = v.trim()
  if (!h.startsWith('#')) return null
  h = h.slice(1)
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function normalizeHex(v) {
  const rgb = parseHex(v)
  if (!rgb) return null
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('').toLowerCase()
}

function channelLin(c) {
  const cs = c / 255
  return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4
}

function relLuminance(hex) {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map(channelLin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(hexA, hexB) {
  const la = relLuminance(hexA)
  const lb = relLuminance(hexB)
  if (la === null || lb === null) return null
  const [x, y] = [la, lb].sort((m, n) => n - m)
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100
}

// ════════════════════════════════════════════════════════════════════════
// 구조 파서 — :root{...} 블록을 괄호 균형으로 찾는다(형제 check-index-html-brand-tokens.mjs 와 동일 기법)
// ════════════════════════════════════════════════════════════════════════

/** 모든 :root{...} 블록을 열거(괄호 균형, 형제 check-index-html-brand-tokens.mjs 의
 *  findRootBlocks 와 동일 기법). index-v2.html 은 이제 --pg-* 토큰 블록과 BRAND-ANCHOR
 *  블록(m15-02-02, --brand-*) 두 :root 를 가진다. */
function findAllRootBlocks(text) {
  const blocks = []
  const re = /:root\s*\{/g
  let m
  while ((m = re.exec(text))) {
    const bodyStart = m.index + m[0].length
    let depth = 1
    let i = bodyStart
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
      i++
    }
    if (depth !== 0) continue
    blocks.push({ start: m.index, end: i, content: text.slice(bodyStart, i - 1) })
  }
  return blocks
}

/** --pg-bg 를 선언한 :root 블록의 [start,end) 범위(P2 토큰 맵 추출용). 🔴 "첫 번째 :root"가
 *  아니라 **내용**으로 식별한다 — index-v2.html 이 이제 :root 블록을 두 개(pg 토큰 + m15-02-02
 *  BRAND-ANCHOR) 갖는데, 위치 기반이면 어느 블록이 먼저 오는지에 pgMap 추출이 조용히 의존하게
 *  된다(BRAND-ANCHOR 를 pg 블록보다 앞에 두는 순간 pgMap 이 전부 undefined 로 깨진다). */
function findRootBlockRange(text) {
  const blocks = findAllRootBlocks(text)
  const pg = blocks.find((b) => /--pg-bg\s*:/.test(b.content))
  if (pg) return [pg.start, pg.end]
  return blocks.length ? [blocks[0].start, blocks[0].end] : null
}

function inRange(index, range) {
  return !!range && index >= range[0] && index < range[1]
}

const PG_TOKEN_KEYS = ['pg-bg', 'pg-panel', 'pg-raised', 'pg-border', 'pg-fg', 'pg-muted', 'pg-selected']

/** :root{...} 블록에서 --pg-* 선언을 키→값 맵으로 파싱. */
function extractPgTokenMap(rootBlockContent) {
  const noComments = rootBlockContent.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /--(pg-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g
  const map = {}
  let m
  while ((m = re.exec(noComments))) {
    map[m[1]] = normalizeHex(m[2])
  }
  return map
}

/** 모든 :root{...} 밖 CSS 규칙(selector{decls})을 열거. <style> 태그 안 텍스트만 대상으로 호출한다. */
function findCssRules(text, excludeRanges) {
  const rules = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(text))) {
    if (excludeRanges.some((r) => inRange(m.index, r))) continue
    const selector = m[1].trim()
    if (selector.startsWith('/*') || selector === '') continue
    rules.push({ selector, decls: m[2], index: m.index })
  }
  return rules
}

/** 규칙의 decls 문자열에서 `prop: value;` 선언들을 파싱(주석 제거 후). */
function parseDecls(decls) {
  const noComments = decls.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  for (const part of noComments.split(';')) {
    const idx = part.indexOf(':')
    if (idx === -1) continue
    const prop = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (prop) out.push({ prop, value })
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════
// P1 — 밝은 표면 (휘도 기반, 스캔 모수 전체)
// ════════════════════════════════════════════════════════════════════════

const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g

/** 블록/줄 주석 내용을 공백으로 지운다(문자 길이·인덱스는 보존 — excludeRanges 정렬을 깨지
 *  않기 위함). 🔴 리뷰 발견 — 주석 안에 색 값을 설명 목적으로 적으면(이 세션에서 실제로 4번
 *  반복된 실수) 그게 실제 코드 리터럴처럼 P1에 잡혀 오탐이 난다. 반대로 주석에 예외 hex 를
 *  적어 "코드에 있는 척" 카운트를 부풀리는 것도 막는다. */
function blankComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/./g, ' '))
}

/** 스캔 모수의 모든 hex 리터럴을 열거(파일 전체 — 프로퍼티 역할 무관, 주석 제외). excludeRanges
 *  안은 제외(--pg-* 선언 자체는 대상이 아니다 — P1이 막으려는 건 "선언 밖" 리터럴이다). */
function scanAllHex(textRaw, excludeRanges) {
  const text = blankComments(textRaw)
  const hits = []
  let m
  while ((m = HEX_RE.exec(text))) {
    if (excludeRanges.some((r) => inRange(m.index, r))) continue
    const hex = normalizeHex(m[0])
    if (!hex) continue
    hits.push({ hex, index: m.index, line: lineOf(text, m.index) })
  }
  return hits
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

/** P1 실행. spec = { files: [{key, text, excludeRanges}], exceptions: {key: {hex: {count, resolvedBy}}} } */
function runP1(spec) {
  const findings = []
  for (const { key, text, excludeRanges } of spec.files) {
    const hits = scanAllHex(text, excludeRanges).filter((h) => relLuminance(h.hex) > 0.5)
    const actual = {}
    for (const h of hits) actual[h.hex] = (actual[h.hex] || 0) + 1

    // 🔴 예외목록 키를 정규화한다 — scanAllHex()가 3자리(#fff)를 6자리(#ffffff)로 정규화해
    // 실측 맵의 키는 항상 6자리다. 예외목록을 raw 그대로 두면 실측과 절대 안 맞아 "영원히
    // 불일치"가 나는데, 그건 검출력이 아니라 정규화 누락 버그다.
    const expectedRaw = (spec.exceptions && spec.exceptions[key]) || {}
    const expected = {}
    for (const [hex, entry] of Object.entries(expectedRaw)) {
      const norm = normalizeHex(hex)
      if (!norm) return { ok: false, errors: [`${key}: 예외목록 키 ${hex} 가 유효한 hex 아님`], findings: [] }
      expected[norm] = entry
    }
    // 명시 예외 구조 검증 — resolved-by 누락은 구조 오류(exit 2 대상)로 별도 반환
    for (const [hex, entry] of Object.entries(expected)) {
      if (!entry || typeof entry.count !== 'number' || !entry.resolvedBy) {
        return { ok: false, errors: [`${key}: 예외 ${hex} 항목에 count/resolvedBy 누락`], findings: [] }
      }
    }
    const allHex = new Set([...Object.keys(expected), ...Object.keys(actual)])
    for (const hex of allHex) {
      const e = (expected[hex] && expected[hex].count) || 0
      const a = actual[hex] || 0
      if (e !== a) {
        findings.push(`${key}: 밝은 표면 ${hex} 실측 ${a}건 vs 예외목록 ${e}건 (불일치 — 새 밝은 표면 또는 목록 drift)`)
      }
    }
  }
  return { ok: true, errors: [], findings }
}

// ════════════════════════════════════════════════════════════════════════
// P2 — 토큰 맵 (Set 아님 — 키→값 전건 일치, 값 스왑 검출)
// ════════════════════════════════════════════════════════════════════════

function runP2(pgMap, allowedMap) {
  const findings = []
  for (const key of PG_TOKEN_KEYS) {
    if (!pgMap[key]) {
      findings.push(`토큰 맵: --${key} 선언 누락`)
      continue
    }
    if (pgMap[key] !== allowedMap[key]) {
      findings.push(`토큰 맵: --${key} 값이 ${pgMap[key]} — 기대 ${allowedMap[key]} (스왑 또는 임의 변경)`)
    }
  }
  const extraKeys = Object.keys(pgMap).filter((k) => !PG_TOKEN_KEYS.includes(k))
  if (extraKeys.length) findings.push(`토큰 맵: 미등록 --pg-* 키 발견: ${extraKeys.join(', ')}`)
  return findings
}

// ════════════════════════════════════════════════════════════════════════
// P3 — 사용처 대비 (CSS 블록 순회, 실제 잉크↔배경 유도)
// ════════════════════════════════════════════════════════════════════════

const AA_TEXT = 4.5
const AA_NONTEXT = 3.0

/** 구조적 포함관계(색과 무관 — DOM 중첩 사실). index-v2.html 실제 마크업(:288~ body 태그) +
 *  playground.js 의 appendChild 대상(treePanel=#tree-panel, formFields=#form-panel #form-fields)을
 *  근거로 작성했다. 셀렉터가 자기 배경을 선언하면 그게 우선이고, 없으면 이 맵을 따라 조상의
 *  배경을 찾는다. */
const CONTAINER_OF = {
  '.tree-group-label': '#sidebar', // treePanel(#tree-panel) 안 — #tree-panel 자체는 배경 미선언
  '.tree-family-label': '#sidebar', // 🆕 m15-02-04 — 형제 .tree-group-label 과 같은 컨테이너
  '.tree-item': '#sidebar',
  '#form-panel h3': '#sidebar', // #form-panel 자체는 배경 미선언(→ 조상 #sidebar 로)
  '.form-row label': '#sidebar',
  '#conn-dot': '#header',
  // 🆕 m15-02-04 — 헤더 안 텍스트 3종. #aaa 리터럴이 var(--pg-muted) 로 통일되면서 P3 의
  // 측정 대상이 됐다. 맵에 없으면 배경 미해결로 조용히 스킵돼 "고쳤는데 안 재는" 상태가 된다.
  // (index-v2.html :303~ 실제 마크업 — 셋 다 #header 의 자식/후손)
  '#device-info': '#header',
  '#transport-selector': '#header',
  '#transport-selector label': '#transport-selector', // #transport-selector 는 배경 미선언 → 조상 #header 로 이어진다
}

/** 셀렉터의 "자기 배경"(같은 규칙에 background/background-color 선언이 있으면 그 var 또는 리터럴)
 *  또는 CONTAINER_OF 를 통해 찾은 조상의 자기 배경을 반환. 못 찾으면 null(측정 불가 — 스킵). */
function resolveBackground(selector, selfBg, bgBySelector) {
  if (selfBg) return selfBg
  let cur = selector
  const seen = new Set()
  while (CONTAINER_OF[cur] && !seen.has(cur)) {
    seen.add(cur)
    cur = CONTAINER_OF[cur]
    if (bgBySelector[cur]) return bgBySelector[cur]
  }
  return null
}

/** value 안의 `var(--pg-x)` 를 pgMap 값으로, 아니면 리터럴 hex 를 그대로 반환. 해석 불가면 null. */
function resolveColorValue(value, pgMap) {
  const varMatch = /var\(\s*--([a-zA-Z0-9-]+)\s*\)/.exec(value)
  if (varMatch) {
    const key = varMatch[1]
    return pgMap[key] || null
  }
  const hexMatch = /#[0-9a-fA-F]{3,6}\b/.exec(value)
  if (hexMatch) return normalizeHex(hexMatch[0])
  return null
}

// 🔴 shorthand(border-right: 1px solid var(...))와 longhand(border-right-color: ...)를 모두
// 잡는다 — shorthand 만 빠뜨리면 실제 파일에 shorthand 로 쓰인 테두리(#sidebar 등)가 전부
// 측정에서 새는데, 그게 정확히 이 게이트가 막으려는 "사용처를 안 본다" 클래스의 재발이다.
const BORDER_PROPS = new Set([
  'border', 'border-color',
  'border-left', 'border-right', 'border-top', 'border-bottom',
  'border-left-color', 'border-right-color', 'border-top-color', 'border-bottom-color',
])
const BG_PROPS = new Set(['background', 'background-color'])

/** index-v2.html <style> 텍스트에서 CSS 규칙을 순회해 사용처 기반 잉크↔배경 쌍을 유도한다.
 *  🔴 var(--pg-*) 를 쓰는 color/border 선언만 대상 — 브랜드 리터럴(#4f46e5 등)과 짝지어진
 *  선언은 §3/R4 로 이미 out-of-scope(m15-02-02 소관)라 스킵한다(예: .tree-item.selected 의
 *  literal color:#4f46e5). 이건 "회귀를 놓치는" 스킵이 아니라 "다른 objective 의 알려진 소관을
 *  건드리지 않는" 스킵이다 — 그 상태는 objective 문서 §"UI 요구사항 의도적 미해결"에 이미 기록.
 *  🆕 fca5a5RegressionAnchors — C1/C2/.field-error 처럼 var(--pg-*) 가 아니라 "이 파일이 이미
 *  쓰던 리터럴을 재사용"한 회귀 수정 지점은 var() 로 안 잡히므로, 알려진 앵커 3곳을 명시로
 *  더한다(색은 하드코딩하지 않고 여기서도 실제 파일 값을 읽는다 — 아래 buildLiteralAnchors 참조).
 */
/** P3 명시 예외 — WCAG 1.4.11(비텍스트 대비)은 "UI 컴포넌트 경계"를 대상으로 하며 순수
 *  장식용 구분선은 통상 그 범위 밖으로 본다. `#sidebar` 의 `border-right` 는 사이드바와 로그
 *  패널을 나누는 얇은 시각적 구분선이지 조작 가능한 컴포넌트 경계가 아니다 — `--pg-border`
 *  값은 §4-2 가 "기존 다크 램프 재사용"으로 이미 고정했고(다른 곳(`#log-toolbar button`)에서는
 *  실제로 통과하는 값이다), 이 objective 가 색을 새로 발명하지 않는다는 R2 와 상충하지 않게
 *  값을 바꾸지 않고 예외로 등록한다. selector+prop 로만 매칭 — 실제 비율은 매 실행 실측이라
 *  값이 바뀌면(예: --pg-border 나 --pg-panel 이 바뀌면) 여기 등록과 무관하게 다시 계산된다. */
/** 🔴 m15-02-04 — 비어 있다. 유일한 등록이던 `#sidebar::border-right` 는 --pg-border 상향
 *  (#334155 → raised 위 3.35 / panel 위 3.92 / bg 위 4.27)으로 **실제로 통과**하게 되어
 *  예외가 필요 없어졌다. 등록을 남기면 그 지점만 영구 무측정이 되어, --pg-border 를 되돌리는
 *  회귀를 #sidebar 에서는 못 잡는다. 메커니즘 자체는 남겨둔다(다음에 진짜 장식선이 생기면 사용). */
const P3_KNOWN_EXCEPTIONS = new Set([])

function runP3(styleTextRaw, pgMap, literalAnchors) {
  // 🔴 규칙 사이의 블록 주석(예: `/* ── Left sidebar ── */`)을 먼저 제거한다 — 안 그러면
  // 그 주석 텍스트가 다음 규칙의 셀렉터 문자열에 섞여(정규식은 `{`/`}` 만 경계로 보므로)
  // `#sidebar` 셀렉터가 정확히 매칭되지 않고 조용히 스킵된다(실측: 이 버그로 #sidebar 규칙
  // 자체가 rules 배열에서 통째로 빠졌었다).
  const styleText = styleTextRaw.replace(/\/\*[\s\S]*?\*\//g, '')
  // 🔴 :root 블록이 여러 개일 수 있다(pg 토큰 + m15-02-02 BRAND-ANCHOR) — 전부 제외해야
  // BRAND-ANCHOR 블록이 findCssRules 에 "셀렉터 :root" 규칙으로 잘못 섞이지 않는다.
  const rootRanges = findAllRootBlocks(styleText).map((b) => [b.start, b.end])
  const rules = findCssRules(styleText, rootRanges)

  // 1차 패스 — 각 규칙의 자기 배경(있으면) 수집
  const bgBySelector = {}
  for (const { selector, decls } of rules) {
    for (const { prop, value } of parseDecls(decls)) {
      if (BG_PROPS.has(prop)) {
        const resolved = resolveColorValue(value, pgMap)
        if (resolved) bgBySelector[selector] = resolved
      }
    }
  }

  const findings = []
  const checked = []

  // 2차 패스 — var(--pg-*) 를 쓰는 color/border 선언을 배경과 짝지어 검사
  for (const { selector, decls } of rules) {
    const declList = parseDecls(decls)
    const selfBg = bgBySelector[selector] || null
    for (const { prop, value } of declList) {
      const usesPgVar = /var\(\s*--pg-/.test(value)
      if (!usesPgVar) continue
      if (prop === 'color') {
        const ink = resolveColorValue(value, pgMap)
        const bg = resolveBackground(selector, selfBg, bgBySelector)
        if (!ink || !bg) continue // 배경 미해결(§3 미전환 폼 컨트롤 등) — 측정 불가, 스킵
        const ratio = contrastRatio(ink, bg)
        checked.push({ selector, prop, ink, bg, ratio, threshold: AA_TEXT })
        if (ratio < AA_TEXT) findings.push(`사용처 대비: ${selector} { ${prop} } — ${ink} on ${bg} = ${ratio} (텍스트 <${AA_TEXT})`)
      } else if (BORDER_PROPS.has(prop)) {
        const border = resolveColorValue(value, pgMap)
        // 🔴 테두리는 "조상"이 아니라 "자기 배경"에만 짝짓는다 — 자기 배경이 없으면(예: 아직
        // 배경을 선언 안 한 폼 컨트롤) 그 테두리가 실제로 어떤 면 위에 놓이는지 이 objective의
        // 스코프로는 알 수 없다(§3 미전환 영역과 겹친다). 그런 경우는 측정 불가로 스킵한다 —
        // 침묵 통과가 아니라 "이 게이트가 잴 수 없는 영역"이며, §3 이 그 경계를 문서화한다.
        if (!selfBg || !border) continue
        const ratio = contrastRatio(border, selfBg)
        checked.push({ selector, prop, ink: border, bg: selfBg, ratio, threshold: AA_NONTEXT })
        if (ratio < AA_NONTEXT && !P3_KNOWN_EXCEPTIONS.has(`${selector}::${prop}`)) {
          findings.push(`사용처 대비: ${selector} { ${prop} } — ${border} on ${selfBg} = ${ratio} (비텍스트 <${AA_NONTEXT})`)
        }
      }
    }
  }

  // 3차 — 리터럴 회귀-앵커(C1/C2/.field-error 부류, var(--pg-*) 아닌 재사용 리터럴)
  for (const a of literalAnchors) {
    if (a.ink === null || a.bg === null) {
      findings.push(`회귀 앵커 ${a.name}: 값 해석 실패(파일에서 못 찾음) — 삭제되었거나 패턴이 바뀜`)
      continue
    }
    const ratio = contrastRatio(a.ink, a.bg)
    checked.push({ selector: a.name, prop: 'anchor', ink: a.ink, bg: a.bg, ratio, threshold: a.threshold })
    if (ratio < a.threshold) findings.push(`회귀 앵커 대비: ${a.name} — ${a.ink} on ${a.bg} = ${ratio} (<${a.threshold})`)
  }

  return { findings, checked }
}

// ════════════════════════════════════════════════════════════════════════
// P4 — 사용처 floor
// ════════════════════════════════════════════════════════════════════════

/** 블록 주석(CSS/JS 공통) + 줄 주석(JS)을 제거한다 — 실측 사용처가 아니라 "사용처를 언급하는
 *  주석"이 카운트에 섞이면, 실제 사용처를 지워도 주석 문구가 남아 floor가 조용히 안 깨진다
 *  (P5가 이미 같은 이유로 CSS 규칙 수에서 주석을 제거하는 것과 동일 원칙). */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function countPgVarUsages(text) {
  const m = stripComments(text).match(/var\(\s*--pg-[a-z-]+\s*\)/g)
  return m ? m.length : 0
}

// ════════════════════════════════════════════════════════════════════════
// P5 — 구조 floor (주석 제거 후 CSS 규칙 수)
// ════════════════════════════════════════════════════════════════════════

function countCssRules(styleText) {
  const noComments = styleText.replace(/\/\*[\s\S]*?\*\//g, '')
  const m = noComments.match(/[^{}]+\{[^{}]*\}/g)
  return m ? m.length : 0
}

// ════════════════════════════════════════════════════════════════════════
// 실제 리포 상수
// ════════════════════════════════════════════════════════════════════════

const ALLOWED_PG_MAP = {
  'pg-bg': '#0f172a',
  'pg-panel': '#1e1e2e',
  'pg-raised': '#2a2a3e',
  // m15-02-04 상향(구 #334155) — 구값은 --pg-raised 위 1.35 / --pg-panel 위 1.58 / --pg-bg 위
  // 1.72 로 WCAG 1.4.11(비텍스트 3.0) 전건 미달이었다. 폼 컨트롤에 배경 선언이 생기면서 그
  // 테두리가 "측정 불가"에서 "측정 대상"으로 바뀌어 P3 가 실제로 잡게 됐다.
  // 🔴 임계(AA_NONTEXT=3.0)는 건드리지 않는다 — 값을 올려서 푼다.
  'pg-border': '#6e7d94',
  'pg-fg': '#e2e8f0',
  'pg-muted': '#94a3b8',
  'pg-selected': '#312e63',
}

// 🔴 P1 명시 예외 — 양방향 대조(실측==명시) + resolved-by 필수. 실측 근거는 본문 주석 참조.
const REPO_P1_EXCEPTIONS = {
  'index-v2.html': {
    // 헤더/버튼/danger 잉크 — §4-1 이 "표면 아님"으로 이미 분류한 것과 같은 부류(밝은 텍스트
    // 잉크가 이미 다크인 배경 위에 있는 것 — #fff 헤더 잉크·브랜드 버튼 잉크는 이 objective
    // 착수 전부터 있었다). 이 표는 index-v2.html 실측(2026-08-12)을 그대로 옮긴 것이다.
    // 🔴 m15-02-02 — 5건 중 3건(브랜드버튼 color:#fff ×2 + log-toolbar button.active ×1)이
    // var(--on-brand) 로 전환되어 실측이 2건으로 줄었다. 남은 2건: 헤더 잉크(#header h1) ·
    // #btn-disconnect(빨간 danger 버튼, 브랜드와 무관 — 전환 대상 아님).
    '#fff': { count: 2, resolvedBy: 'pre-existing' }, // 헤더잉크 · #btn-disconnect danger버튼(2건)
    '#e2e8f0': { count: 3, resolvedBy: 'pre-existing' }, // 로그 패널 전경(이미 다크였던 log-toolbar/log-scroll 영역) 리터럴 사용처 3건 — --pg-fg 와 같은 값이지만 로그 패널은 --pg-* 시스템 밖(m15-02-01 이전부터 다크)
    '#4ade80': { count: 2, resolvedBy: 'pre-existing' }, // #conn-dot.connected · 로그 레벨 뱃지 등 "연결됨" semantic 상태색 — 작은 상태 점/뱃지이며 D18 의 "표면"이 아니다
    '#c4b5fd': { count: 1, resolvedBy: 'pre-existing' }, // .log-method 잉크 — G1 예외목록에도 이미 등록된 로그 패널 텍스트
    '#a8d8a8': { count: 1, resolvedBy: 'pre-existing' }, // 로그 패널의 다른 semantic 텍스트 색
    '#fca5a5': { count: 2, resolvedBy: 'm15-02-03' }, // .field-error(크로스 리뷰 R1) + .log-json.err-json(기존) — 다크세이프 danger 잉크 재사용
  },
  'playground.js': {
    // 🔴 m15-02-04 — 밝은 섬 3규칙(경고 배너 배경·테두리 + sdResolveRow/resolveRow 배경)의
    // 예외 등록을 **제거**했다. 예외를 지운 것이 아니라 대상 자체가 없어졌다: 셋 다
    // var(--pg-raised)/var(--pg-border) 로 이관됐고, 같은 커밋에서 그 위 잉크 5종도 함께
    // 옮겼다(배경을 옮기면 그 위 잉크가 깨지는 것이 이 epic 에서 반복된 실패 클래스다).
    // 이 목록은 양방향 대조(실측==명시)라, 값만 바꾸고 등록을 남겼으면 즉시 FAIL 이었다.
    //
    // 🔴 다크세이프 danger 잉크는 3건으로 늘었다 — _btcSetStatus(기존) + 섬으로 옮겨간
    // hint 2곳(_signDataGetAddressClick · _resolveSenderFromDeviceClick). 셋 다 --pg-raised
    // 또는 --pg-panel 위 7.38/8.64 로 AA 통과하며, 아래 회귀 앵커가 매 실행 실측한다.
    '#fca5a5': { count: 3, resolvedBy: 'dark-safe-danger-ink' },
  },
}

function loadFileWithExcludes(path) {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (text === null) return null
  // 🔴 P1(밝은 표면) 면제는 :root 블록 "전부" — index-v2.html 이 pg 토큰 블록과 m15-02-02
  // BRAND-ANCHOR 블록 둘 다 가질 수 있다. 첫 블록만 면제하면 두 번째 블록의 선언 리터럴이
  // (예: 라임 앵커 9값 중 밝은 4개) 그대로 "밝은 표면"으로 오탐된다 — 선언 자체는 이 게이트가
  // 막으려는 "표면"이 아니라 토큰 정의다(§ P1 "선언 밖" 리터럴만 대상).
  const rootRanges = findAllRootBlocks(text).map((b) => [b.start, b.end])
  return { text, excludeRanges: rootRanges }
}

/** C1/.field-error/_btcSetStatus 회귀 앵커 — var(--pg-*) 가 아니라 "재사용 리터럴"이라 P3 의
 *  var() 스캔에 안 걸린다. 잉크는 파일에서 실측으로 읽는다(하드코딩 금지) — 정규식으로 못
 *  찾으면 null 반환해 runP3 가 "값 해석 실패"로 findings 에 넣는다(삭제/rename 되돌리기 우회
 *  방지). 배경은 pgMap 파라미터에서 읽는다(fixture 의 manifest.allowedMap 이 다를 수 있어
 *  모듈 상수 ALLOWED_PG_MAP 을 쓰면 fixture 에서 틀린 배경으로 측정된다 — 2026-08-12 리뷰 W2).
 *
 *  🔴 2026-08-12 리뷰 정정 — 원래 _btcSetStatus 와 함께 setHint(_signDataGetAddressClick 의
 *  지역 함수)도 "같은 삼항식 모양"이라는 이유로 앵커에 넣고 다크세이프 값으로 고쳤었다.
 *  실측하면 setHint 의 hintEl(sdResolveHint)의 부모는 --pg-panel 이 아니라 인라인
 *  background:#f7f7f7(§3/m15-02-04 이관 대상, 다크 전환 밖)이었다 — "삼항식 모양"은 판별자가
 *  아니었고 "부모 표면"이 판별자였다. 그 오적용은 playground.js 의 setHint 를 원래 값으로
 *  되돌리며 함께 제거했다. 같은 클래스의 제3 인스턴스(_resolveSenderFromDeviceClick 의
 *  setHint, `#c33`/`#0a7`)도 실측 확인함 — 그 부모도 #f7f7f7 이고 #c33 은 이미 AA 통과라
 *  손댈 필요 없다(이 objective 스코프 밖, m15-02-04 후보). */
function buildLiteralAnchors(indexHtml, pgText, pgMap) {
  const panelBg = pgMap['pg-panel'] || null
  // 🔴 raisedBg 상수는 2026-08-13 크로스 리뷰 CRITICAL-1 로 제거됐다 — 섬/배너 앵커의 배경은
  // 토큰맵에서 가정하지 않고 playground.js 에서 실측한다(아래 bgOf). 이 상수가 남아 있으면
  // 다음 앵커를 추가하는 사람이 무심코 다시 하드코딩하게 된다.
  const anchors = []
  {
    // .field-error { color: #fca5a5 ... } 의 배경은 #form-panel → #sidebar(panel)
    const m = /\.field-error\s*\{[^}]*color:\s*(#[0-9a-fA-F]{3,6})/.exec(indexHtml)
    anchors.push({ name: '.field-error color', ink: m ? normalizeHex(m[1]) : null, bg: panelBg, threshold: AA_TEXT })
  }
  if (pgText) {
    // isErr ? '#hex' : ('#hex' | 'var(--pg-x)') — _btcSetStatus 1곳(실측, grep -n "isErr ?").
    const m1 = /_btcSetStatus[\s\S]{0,500}?isErr\s*\?\s*'(#[0-9a-fA-F]{3,6})'\s*:\s*'(?:#[0-9a-fA-F]{3,6}|var\(--pg-muted\))'/.exec(pgText)
    anchors.push({ name: '_btcSetStatus isErr ink', ink: m1 ? normalizeHex(m1[1]) : null, bg: panelBg, threshold: AA_TEXT })

    // 🔴 m15-02-04 신설 앵커 (a)~(d) — P3 는 index-v2.html 의 <style> 만 파싱하므로(runP3(spec.indexText))
    // playground.js 의 인라인 색은 **오직 이 앵커를 통해서만** 측정된다. m15-02-04 가 밝은 섬 2개
    // (sdResolveRow · resolveRow)를 --pg-raised 로 옮기면서 그 위 잉크 4곳이 전부 --pg-raised 를
    // 배경으로 갖게 됐다 — 앵커가 없으면 "배경만 옮기고 잉크를 방치"하는 이 epic 최다 실패 모드가
    // 게이트에 전혀 안 잡힌다(격리 fixture 로 exit 0 실증됨).
    // 🔴 삼항식은 **두 갈래 모두** 앵커로 만든다 — 에러 갈래만 보면 정상 갈래를 옛 회색으로
    // 되돌려도(3.95, AA 미달) 통과한다. 값은 파일에서 실측하고, 패턴을 못 찾으면 ink=null 로
    // "값 해석 실패" finding 이 되어 삭제/rename 우회가 막힌다.
    //
    // 🔴 **배경도 파일에서 실측한다** (2026-08-13 크로스 리뷰 CRITICAL-1).
    // 초판은 bg 를 raisedBg 로 **하드코딩**했다 — 잉크는 실측하면서 배경은 가정한 것이다.
    // 그러면 이 게이트가 닫으려던 실패 클래스의 **거울상**(잉크를 지키고 배경을 방치)이 통과한다.
    // 실증: 섬/배너 배경만 var(--pg-muted) 나 var(--pg-fg) 로 바꾸면 실제 대비는 1.00(글자가
    // 안 보인다)인데, 게이트는 계속 raised 를 기준으로 5.46/11.36 을 "측정" 해 exit 0 였다.
    // 🔴 이건 m15-02-04 가 **새로 연** 표면이다 — 그전엔 이 배경들이 #f7f7f7/#fff3cd 리터럴이라
    // P1 의 양방향 count 대조 안에 있었는데, var() 로 옮기면서 그 창에서 빠져나갔다.
    // bg 가 null 이면 ink 와 동일하게 "값 해석 실패" 로 fail-closed 된다(P3 3차 루프).
    const bgOf = (re) => { const m = re.exec(pgText); return m ? resolveColorValue(m[1].trim(), pgMap) : null }
    // 🔴 resolveRow 는 sdResolveRow 의 부분문자열이라 앞에 비영문 경계를 둔다((d) 와 같은 이유).
    const sdRowBg = bgOf(/sdResolveRow\.style\.cssText\s*=\s*'[^']*background:\s*([^;']+)/)
    const rsRowBg = bgOf(/(?:^|[^A-Za-z])resolveRow\.style\.cssText\s*=\s*'[^']*background:\s*([^;']+)/m)
    const bannerBg = bgOf(/banner\.style\.cssText\s*=\s*'[^']*background:\s*([^;']+)/)
    for (const a of [
      { name: '(a) _signDataGetAddressClick setHint', bg: sdRowBg, re: /_signDataGetAddressClick[\s\S]{0,1200}?hintEl\.style\.color\s*=\s*isErr\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/ },
      { name: '(b) _resolveSenderFromDeviceClick setHint', bg: rsRowBg, re: /_resolveSenderFromDeviceClick[\s\S]{0,1200}?hintEl\.style\.color\s*=\s*isError\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/ },
    ]) {
      const m = a.re.exec(pgText)
      anchors.push({ name: `${a.name} err`, ink: m ? resolveColorValue(m[1], pgMap) : null, bg: a.bg, threshold: AA_TEXT })
      anchors.push({ name: `${a.name} ok`, ink: m ? resolveColorValue(m[2], pgMap) : null, bg: a.bg, threshold: AA_TEXT })
    }
    // (c)/(d) 섬 안 정적 hint 잉크. 🔴 resolveHint 는 sdResolveHint 의 부분문자열이 아니다
    // (대문자 R — 정규식은 대소문자 구분) 이라 두 앵커가 서로 오염되지 않는다.
    for (const a of [
      { name: '(c) sdResolveHint 정적 잉크', bg: sdRowBg, re: /sdResolveHint\.style\.cssText\s*=\s*'[^']*color:\s*([^;']+)/ },
      { name: '(d) resolveHint 정적 잉크', bg: rsRowBg, re: /(?:^|[^A-Za-z])resolveHint\.style\.cssText\s*=\s*'[^']*color:\s*([^;']+)/m },
    ]) {
      const m = a.re.exec(pgText)
      anchors.push({ name: a.name, ink: m ? resolveColorValue(m[1].trim(), pgMap) : null, bg: a.bg, threshold: AA_TEXT })
    }
    // (e)/(f) 경고 배너 — 섬 3규칙의 세 번째. 잉크/테두리 둘 다 앵커로 둔다. 🔴 (a)~(d) 만 두면
    // 배너 잉크(옛 값은 --pg-raised 위 2.55)를 되돌려도 안 잡힌다: 그 값은 휘도 0.141 이라
    // P1(휘도>0.5) 밖이고, 인라인이라 P3 의 CSS 순회에도 안 걸린다. 같은 클래스의 5번째 원소다.
    {
      const mInk = /banner\.style\.cssText\s*=\s*'[^']*;\s*color:\s*([^;']+)/.exec(pgText)
      anchors.push({ name: '(e) #getaddress-banner 잉크', ink: mInk ? resolveColorValue(mInk[1].trim(), pgMap) : null, bg: bannerBg, threshold: AA_TEXT })
      const mBorder = /banner\.style\.cssText\s*=\s*'[^']*border:\s*1px\s+solid\s+([^;']+)/.exec(pgText)
      anchors.push({ name: '(f) #getaddress-banner 테두리', ink: mBorder ? resolveColorValue(mBorder[1].trim(), pgMap) : null, bg: bannerBg, threshold: AA_NONTEXT })
    }
  }
  return anchors
}

// 🔴 2026-08-12 리뷰 정정 (Lens1 C2/C3) — 두 floor 모두 실측치보다 크게 낮게 잡혀 있었다.
// P4=13 은 실측 16(setHint 원복 후)보다 낮아 var(--pg-muted) 사용처를 최대 3건까지 동일 값의
// 다크 리터럴로 되돌려도(P1 은 리터럴 자체가 어둡다면 못 잡는다 — 예: #94a3b8 자체는 휘도<0.5라
// P1 대상이 아니다) 무료로 통과했다. P5=13 은 복붙 실수로 보인다(P4 상수를 그대로 옮긴 흔적) —
// 실측 56과 4배 이상 차이가 나 로그 패널 CSS 43규칙을 통째로 지워도 안 걸렸다. 둘 다 실측치로
// 맞춘다(sibling check-index-html-brand-tokens.mjs 의 REPO_G1_FLOORS.rootBlocks 처럼 floor를
// 실측과 정확히 일치시키는 관례를 따름).
// 🔴 m15-02-04 재측정 — 세 floor 를 변경 후 실측치로 정확히 맞춘다(형제 관례). 안 올리면
// 이 objective 가 새로 배선한 것을 지워도 게이트가 조용히 통과한다:
//   P4 16 → 34 : 폼 컨트롤 background/color · 버튼 규칙 · muted 통일 · 섬/배너 이관으로 늘었다.
//                16 에 두면 새로 넣은 var(--pg-*) 를 18건 지워도 통과한다.
//                (33 → 34 는 2026-08-13 크로스 리뷰 NIT-4 — #btc-fetch-status 초기값 #888 을
//                 var(--pg-muted) 로 옮기면서 사용처가 1건 늘었다)
//   P5 56 → 58 : 공용 .form-row button 규칙 + read-only/.error 특정도 규칙 분화.
//   P3  8 → 23 : CSS 사용처 13(기존 6 + 헤더 muted 3 + tree-family-label 1 + 폼 컨트롤 color/border 2
//                + #header seam 1) + 앵커 10(.field-error · _btcSetStatus · 신설 (a)~(f) 8).
const REPO_P4_FLOOR = 34
const REPO_P5_FLOOR = 58 // 실측(2026-08-13) — index-v2.html CSS 규칙 수
// 🔴 P3 도 같은 이유로 floor 가 필요하다(Lens1 C2) — checked.length 는 지금까지 무방비였다.
const REPO_P3_FLOOR = 23

function loadRepoSpec() {
  const indexPath = resolve(REPO_ROOT, 'index-v2.html')
  const pgPath = resolve(REPO_ROOT, 'playground.js')
  const indexEntry = loadFileWithExcludes(indexPath)
  if (!indexEntry) throw new Error('index-v2.html 없음')
  const pgEntry = loadFileWithExcludes(pgPath)
  return {
    files: [
      { key: 'index-v2.html', text: indexEntry.text, excludeRanges: indexEntry.excludeRanges },
      ...(pgEntry ? [{ key: 'playground.js', text: pgEntry.text, excludeRanges: pgEntry.excludeRanges }] : []),
    ],
    indexText: indexEntry.text,
    pgText: pgEntry ? pgEntry.text : null,
    exceptions: REPO_P1_EXCEPTIONS,
    allowedMap: ALLOWED_PG_MAP,
    p3Floor: REPO_P3_FLOOR,
    p4Floor: REPO_P4_FLOOR,
    p5Floor: REPO_P5_FLOOR,
  }
}

// ════════════════════════════════════════════════════════════════════════
// 실행 — 실제 리포 / fixture 공용
// ════════════════════════════════════════════════════════════════════════

function runAll(spec) {
  const errors = []
  const findings = []

  const p1 = runP1({ files: spec.files, exceptions: spec.exceptions })
  if (!p1.ok) return { exit: 2, lines: [], errors: p1.errors, findings: [] }
  findings.push(...p1.findings)

  const rootRange = findRootBlockRange(spec.indexText)
  if (!rootRange) return { exit: 2, lines: [], errors: ['index-v2.html: :root 블록을 찾지 못함'], findings: [] }
  const pgMap = extractPgTokenMap(spec.indexText.slice(rootRange[0], rootRange[1]))

  findings.push(...runP2(pgMap, spec.allowedMap))

  const literalAnchors = buildLiteralAnchors(spec.indexText, spec.pgText, pgMap)
  const p3 = runP3(spec.indexText, pgMap, literalAnchors)
  findings.push(...p3.findings)
  const p3Floor = spec.p3Floor ?? 0
  if (p3.checked.length < p3Floor) findings.push(`P3 floor: 사용처 대비 검사 건수 ${p3.checked.length} < ${p3Floor}`)

  const p4Count = countPgVarUsages(spec.indexText) + (spec.pgText ? countPgVarUsages(spec.pgText) : 0)
  if (p4Count < spec.p4Floor) findings.push(`P4 floor: var(--pg-*) 사용처 ${p4Count} < ${spec.p4Floor}`)

  const p5Count = countCssRules(spec.indexText)
  if (p5Count < spec.p5Floor) findings.push(`P5 floor: CSS 규칙 수 ${p5Count} < ${spec.p5Floor}`)

  const lines = [
    `p1-checked-files: ${spec.files.length}`,
    `p2-tokens: ${Object.keys(pgMap).length}`,
    `p3-usages-checked: ${p3.checked.length}`,
    `p4-pg-var-usages: ${p4Count}`,
    `p5-css-rules: ${p5Count}`,
  ]

  return { exit: findings.length > 0 ? 1 : 0, lines, errors, findings }
}

function runReal() {
  const spec = loadRepoSpec()
  return runAll(spec)
}

// ════════════════════════════════════════════════════════════════════════
// fixture 러너
// ════════════════════════════════════════════════════════════════════════

function runFixture(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`fixture 없음: ${dir}`)
    return 2
  }
  const manifestPath = join(dir, 'manifest.json')
  const expectedExitPath = join(dir, 'expected-exit')
  if (!existsSync(manifestPath) || !existsSync(expectedExitPath)) {
    console.error(`fixture 구조 오류(manifest.json/expected-exit 없음): ${dir}`)
    return 2
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const expected = parseInt(readFileSync(expectedExitPath, 'utf8').trim(), 10)

  const indexPath = join(dir, 'index-v2.html')
  if (!existsSync(indexPath)) {
    console.log(`  ✗ ${dir.split('/').pop()}  fixture 에 index-v2.html 없음`)
    return 1
  }
  const indexEntry = loadFileWithExcludes(indexPath)
  const pgPath = join(dir, 'playground.js')
  const pgEntry = existsSync(pgPath) ? loadFileWithExcludes(pgPath) : null

  const spec = {
    files: [
      { key: 'index-v2.html', text: indexEntry.text, excludeRanges: indexEntry.excludeRanges },
      ...(pgEntry ? [{ key: 'playground.js', text: pgEntry.text, excludeRanges: pgEntry.excludeRanges }] : []),
    ],
    indexText: indexEntry.text,
    pgText: pgEntry ? pgEntry.text : null,
    exceptions: manifest.exceptions || {},
    allowedMap: manifest.allowedMap || ALLOWED_PG_MAP,
    p3Floor: manifest.p3Floor ?? 0,
    p4Floor: manifest.p4Floor ?? 0,
    p5Floor: manifest.p5Floor ?? 0,
  }

  const result = runAll(spec)
  if (result.exit === expected) {
    console.log(`  ✓ ${dir.split('/').pop()}  (exit ${result.exit})`)
    return 0
  }
  console.log(`  ✗ ${dir.split('/').pop()}  expected exit ${expected}, got ${result.exit}`)
  for (const e of result.errors) console.log(`      ERROR: ${e}`)
  for (const f of result.findings) console.log(`      FINDING: ${f}`)
  return 1
}

function listFixtureDirsOrNull(root, { silent = false } = {}) {
  if (!existsSync(root)) {
    if (!silent) console.error(`fixture 루트 없음: ${root}`)
    return null
  }
  const dirs = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory())
  if (dirs.length === 0) {
    if (!silent) console.error('fixture 0건 (모수 floor 위반)')
    return null
  }
  return dirs
}

function runAllFixtures() {
  const dirs = listFixtureDirsOrNull(FIXTURES_ROOT)
  if (dirs === null) return 2
  let fail = 0
  let okCount = 0
  for (const d of dirs) {
    const dir = join(FIXTURES_ROOT, d)
    const expected = readFileSync(join(dir, 'expected-exit'), 'utf8').trim()
    if (expected === '0') okCount++
    if (runFixture(dir) !== 0) fail = 1
  }
  if (okCount < 2) {
    console.error(`정상(exit 0) fixture 가 ${okCount}건 (2건 미만 — 가짜 초록 방지 floor 위반)`)
    return 2
  }
  console.log(`fixtures: ${dirs.length}건 (정상 ${okCount}건)`)

  // T-G-07 류 — 빈 fixture 루트 → exit 2
  {
    const result = listFixtureDirsOrNull('/nonexistent-playground-surface-fixture-root-check', { silent: true })
    if (result !== null) {
      console.error('T-P-08a 실패: 존재하지 않는 fixture 루트인데 null 을 반환하지 않음')
      fail = 1
    } else {
      console.log('T-P-08a OK: fixture 루트 부재 → listFixtureDirsOrNull 이 null 반환')
    }
  }

  // 실제 리포 스캔 — self-test 의 마지막 단으로, 실 리포가 exit 0 인지 확인
  const real = runReal()
  if (real.exit !== 0) {
    console.error('실제 리포 스캔이 exit 0 이 아님')
    console.error(JSON.stringify(real, null, 2))
    fail = 1
  } else {
    for (const l of real.lines) console.log(l)
  }

  return fail
}

// ════════════════════════════════════════════════════════════════════════
// CLI
// ════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2)
if (args.includes('--test')) {
  process.exit(runAllFixtures())
} else if (args.includes('--fixture')) {
  const dir = args[args.indexOf('--fixture') + 1]
  if (!dir) {
    console.error('사용법: --fixture <dir>')
    process.exit(2)
  }
  process.exit(runFixture(resolve(dir)))
} else {
  const result = runReal()
  if (result.errors.length > 0) {
    console.error('✗ 구조 오류')
    for (const e of result.errors) console.error(`  - ${e}`)
    process.exit(2)
  }
  if (result.findings.length > 0) {
    console.error('✗ playground surface 검사 실패')
    for (const f of result.findings) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('✓ playground surface clean')
  for (const l of result.lines) console.log(`  ${l}`)
  console.log('light-surface-findings: 0')
  process.exit(0)
}
