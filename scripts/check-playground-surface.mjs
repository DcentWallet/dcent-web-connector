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
 *   P4 사용처 floor — var(--pg-*) 사용처 ≥ 13. 토큰 블록만 남기고 사용처를 되돌리는 우회를 막는다.
 *   P5 구조 floor   — 주석 제거 후 CSS 규칙 수 ≥ 실측 기준선. 문자열 `background` 카운트는
 *                     주석으로 패딩 가능하므로 폐기.
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

function findRootBlockRange(text) {
  const re = /:root\s*\{/
  const m = re.exec(text)
  if (!m) return null
  const bodyStart = m.index + m[0].length
  let depth = 1
  let i = bodyStart
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') depth--
    i++
  }
  if (depth !== 0) return null
  return [m.index, i]
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

/** 스캔 모수의 모든 hex 리터럴을 열거(파일 전체 — 프로퍼티 역할 무관). excludeRanges 안은 제외
 *  (--pg-* 선언 자체는 대상이 아니다 — P1이 막으려는 건 "선언 밖" 리터럴이다). */
function scanAllHex(text, excludeRanges) {
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
  '.tree-item': '#sidebar',
  '#form-panel h3': '#sidebar', // #form-panel 자체는 배경 미선언(→ 조상 #sidebar 로)
  '.form-row label': '#sidebar',
  '#conn-dot': '#header',
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
const P3_KNOWN_EXCEPTIONS = new Set(['#sidebar::border-right'])

function runP3(styleTextRaw, pgMap, literalAnchors) {
  // 🔴 규칙 사이의 블록 주석(예: `/* ── Left sidebar ── */`)을 먼저 제거한다 — 안 그러면
  // 그 주석 텍스트가 다음 규칙의 셀렉터 문자열에 섞여(정규식은 `{`/`}` 만 경계로 보므로)
  // `#sidebar` 셀렉터가 정확히 매칭되지 않고 조용히 스킵된다(실측: 이 버그로 #sidebar 규칙
  // 자체가 rules 배열에서 통째로 빠졌었다).
  const styleText = styleTextRaw.replace(/\/\*[\s\S]*?\*\//g, '')
  const rootRange = findRootBlockRange(styleText)
  const rules = findCssRules(styleText, rootRange ? [rootRange] : [])

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
  'pg-border': '#334155',
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
    '#fff': { count: 5, resolvedBy: 'pre-existing' }, // :44 헤더잉크·:72/:75 브랜드버튼·:205 danger버튼·:249 send버튼(5건, :88 사이드바 배경은 이미 var(--pg-panel)로 전환되어 여기 안 잡힘)
    '#e2e8f0': { count: 3, resolvedBy: 'pre-existing' }, // 로그 패널 전경(이미 다크였던 log-toolbar/log-scroll 영역) 리터럴 사용처 3건 — --pg-fg 와 같은 값이지만 로그 패널은 --pg-* 시스템 밖(m15-02-01 이전부터 다크)
    '#4ade80': { count: 2, resolvedBy: 'pre-existing' }, // #conn-dot.connected · 로그 레벨 뱃지 등 "연결됨" semantic 상태색 — 작은 상태 점/뱃지이며 D18 의 "표면"이 아니다
    '#c4b5fd': { count: 1, resolvedBy: 'pre-existing' }, // .log-method 잉크 — G1 예외목록에도 이미 등록된 로그 패널 텍스트
    '#a8d8a8': { count: 1, resolvedBy: 'pre-existing' }, // 로그 패널의 다른 semantic 텍스트 색
    '#fca5a5': { count: 2, resolvedBy: 'm15-02-03' }, // .field-error(크로스 리뷰 R1) + .log-json.err-json(기존) — 다크세이프 danger 잉크 재사용
  },
  'playground.js': {
    '#fff3cd': { count: 1, resolvedBy: 'm15-02-04' }, // banner(:1320) 밝은 경고 배너 — §3 과 같은 부류, 후속 objective
    '#f7f7f7': { count: 2, resolvedBy: 'm15-02-04' }, // sdResolveRow·resolveRow 배경 — 후속 objective
    '#ffeaa7': { count: 1, resolvedBy: 'm15-02-04' }, // banner 테두리(:1320, #fff3cd 와 같은 규칙)
    // 🔴 배너 텍스트 잉크는 여기 없다 — 실측 휘도 0.141로 P1(휘도>0.5) 판정 밖이라 애초에
    // 안 잡힌다(배너 배경은 밝지만 그 위 텍스트는 의도적으로 어두운 잉크라 정상).
    '#fca5a5': { count: 3, resolvedBy: 'm15-02-03' }, // _btcSetStatus + setHint(C2) 다크세이프 danger 잉크
    '#fff': { count: 1, resolvedBy: 'pre-existing' }, // 기존 버튼/뱃지 잉크
  },
}

function loadFileWithExcludes(path) {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (text === null) return null
  const rootRange = findRootBlockRange(text)
  return { text, excludeRanges: rootRange ? [rootRange] : [] }
}

/** C1/C2/.field-error 회귀 앵커 — var(--pg-*) 가 아니라 "재사용 리터럴"이라 P3 의 var() 스캔에
 *  안 걸린다. 색은 파일에서 실측으로 읽는다(하드코딩 금지) — 정규식으로 못 찾으면 null 반환해
 *  runP3 가 "값 해석 실패"로 findings 에 넣는다(삭제/rename 되돌리기 우회 방지). */
function buildLiteralAnchors(indexHtml, pgText) {
  const anchors = []
  {
    // .field-error { color: #fca5a5 ... } 의 배경은 #form-panel → #sidebar(panel)
    const m = /\.field-error\s*\{[^}]*color:\s*(#[0-9a-fA-F]{3,6})/.exec(indexHtml)
    anchors.push({ name: '.field-error color', ink: m ? normalizeHex(m[1]) : null, bg: ALLOWED_PG_MAP['pg-panel'], threshold: AA_TEXT })
  }
  if (pgText) {
    // isErr ? '#hex' : ('#hex' | 'var(--pg-x)') — 두 함수(_btcSetStatus/setHint)에 정확히 2곳.
    // 함수명과 실제 대입문 사이에 주석 블록이 끼어 있어 창을 넉넉히 둔다(500자).
    const m1 = /_btcSetStatus[\s\S]{0,500}?isErr\s*\?\s*'(#[0-9a-fA-F]{3,6})'\s*:\s*'(?:#[0-9a-fA-F]{3,6}|var\(--pg-muted\))'/.exec(pgText)
    anchors.push({ name: '_btcSetStatus isErr ink', ink: m1 ? normalizeHex(m1[1]) : null, bg: ALLOWED_PG_MAP['pg-panel'], threshold: AA_TEXT })
    const m2 = /setHint[\s\S]{0,500}?isErr\s*\?\s*'(#[0-9a-fA-F]{3,6})'\s*:\s*'(?:#[0-9a-fA-F]{3,6}|var\(--pg-muted\))'/.exec(pgText)
    anchors.push({ name: 'setHint isErr ink', ink: m2 ? normalizeHex(m2[1]) : null, bg: ALLOWED_PG_MAP['pg-panel'], threshold: AA_TEXT })
  }
  return anchors
}

const REPO_P4_FLOOR = 13
const REPO_P5_FLOOR = 13 // 실측 기준선(2026-08-12) — 아래 loadRepoSpec 근처 참고

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
  const rootContent = spec.indexText.slice(rootRange[0] + ':root{'.length - 1, rootRange[1])
  const pgMap = extractPgTokenMap(spec.indexText.slice(rootRange[0], rootRange[1]))

  findings.push(...runP2(pgMap, spec.allowedMap))

  const literalAnchors = buildLiteralAnchors(spec.indexText, spec.pgText)
  const p3 = runP3(spec.indexText, pgMap, literalAnchors)
  findings.push(...p3.findings)

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
