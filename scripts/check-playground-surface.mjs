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
 *    막는다 — "실수를 막고 의도적 우회는 막지 않는다" 는 원칙에 따른 판단이다(형제 게이트
 *    `check-index-html-fw-models.mjs` 가 같은 판단을 공유했으나, 그 파일은 동결 문서 전용이라
 *    2026-08-19 제거됐다). 다음에 이 표기들이 실제로 쓰이면 그때 확장한다.
 *
 * ✅ (구 알려진 한계 2 — **구현으로 닫음**) pg-root 블록 **밖**의 `--pg-*` 재선언은 이제
 *    `runP2Shadow` 가 잡는다. 초판은 이걸 "`body{}` 선언" 축으로 규정하고 "의도적 우회" 라며
 *    문서화만 했는데 **축 판정이 틀렸다** — 실제 도달 경로는 **두 번째 `:root`** 이고 이 파일은
 *    이미 그걸 갖고 있다(BRAND-ANCHOR, m15-02-02). 상세는 `runP2Shadow` docstring.
 *
 * 🔴 알려진 한계 4 — **CSS 캐스케이드 특정도 모델이 없다** (2026-08-13 R3 CRITICAL-3).
 *    P3 는 규칙을 **셀렉터 문자열 키**로 수집한다. 그래서 같은 엘리먼트를 **더 높은 특정도로 덮는
 *    다른 규칙**(`#form-fields .form-row input { background: … }` = (1,1,1) > (0,3,1))은 별도 키로
 *    들어가 아무와도 짝지어지지 않고, 원래 규칙은 계속 자기 배경으로 측정된다 — 실화면은 입력창이
 *    거의 흰색이 되는데 exit 0(jsdom 실측으로 확인). `!important` 판도 동일.
 *    이걸 막으려면 **실제 캐스케이드 승자 계산**(특정도 비교 + 선언 순서)이 필요한데, 그건 이 파일이
 *    쓰는 텍스트 파서의 범위를 넘고 P3 설계 노트가 밝힌 대로 jsdom 경로는 이 리포에서 신뢰할 수
 *    없었다. **이 한계는 P3 전반에 pre-existing** 이며 이 objective 가 새로 만든 것이 아니다.
 *
 *    ✅ **폼 컨트롤 축만 닫았다** (2026-08-13, 사용자 지시로 한 라운드 추가) — `runFormControlCascade`
 *    가 폼 컨트롤을 매칭하는 규칙 중 `background` 선언 개수를 알려진 집합(기본 + `:read-only`)으로
 *    고정한다. 이 objective 의 간판 산출물이고 실제로 뚫렸던 자리라 여기만 우선 막았다.
 *    ⚠️ **나머지 셀렉터(섬·배너·배지 등)는 여전히 이 한계 아래 있다.** 그래서 이 게이트의 보장은
 *    **"추적 대상의 배경을 정하는 단일 경로를 지킨다 + 폼 컨트롤은 승자까지 본다"** 이지
 *    "화면이 어둡다" 가 아니다.
 *
 * 🔴 알려진 한계 5 — `blankComments` 가 문자열 안의 `//` 를 줄 주석으로 오인한다 (R3 WARNING-3).
 *    `'https://…'` 가 있는 줄은 뒤가 통째로 blank 되어 같은 줄의 밝은 리터럴을 P1 이 못 본다
 *    (실측: URL 있는 줄에 `background:#ffffff` 를 두면 exit 0, URL 없으면 exit 1).
 *    pre-existing 이지만 R2 에서 앵커를 이 위에 올렸으므로 함께 적어 둔다.
 *
 * ✅ (구 알려진 한계 3 — **인바리언트로 보강**) floor 는 총량이라 "지우고 같은 수만큼 더하기" 로
 *    위장할 수 있다(실측 재현됨). floor 는 되돌리기를 막는 장치이지 총량 위장을 막는 장치가
 *    아니라는 진단 자체는 맞다 — 그래서 이 objective 의 **간판 산출물**(폼 컨트롤 UA 흰 배경
 *    제거)에는 총량과 무관한 **존재 인바리언트**를 따로 걸었다(`runFormControlInvariant`).
 *    형제 스크립트 `check-index-html-brand-tokens.mjs` 의 G2-C 인바리언트와 같은 패턴이다.
 *    ⚠️ 남은 축: 그 외 개별 선언은 여전히 총량 floor 에만 의존한다.
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

/** 폼 컨트롤 존재 인바리언트 (2026-08-13 크로스 리뷰 R2 WARNING-3).
 *
 *  🔴 이 objective 의 **간판 산출물**(폼 컨트롤에서 UA 기본 흰 배경 제거)에 총량 floor 말고는
 *  방어가 없었다. floor 는 하한이라 **지우면서 같은 수만큼 더하면** 통과한다(실측: 이 선언들을
 *  지우고 더미 규칙 2개를 넣으니 p4·p5 가 오히려 늘어 exit 0 — 컨트롤은 흰 배경으로 복귀).
 *  총량과 무관한 **존재 단언**을 따로 건다. 형제 `check-index-html-brand-tokens.mjs` 의
 *  G2-C 인바리언트와 같은 패턴.
 *
 *  🔴 라디오/체크박스 제외(`:not(...)`)까지 함께 고정한다 — 그게 빠지면 라디오가 배경에 묻히고,
 *  `:read-only`/`.error` 규칙과의 특정도 위계도 깨진다(이 PR 이 실제로 한 번 열었던 표면이다). */
function runFormControlInvariant(indexText, expectedBgRules) {
  const text = blankComments(indexText)
  const re = /\.form-row\s+input:not\(\[type=radio\]\):not\(\[type=checkbox\]\)\s*,\s*\.form-row\s+select\s*,\s*\.form-row\s+textarea\s*\{([^}]*)\}/
  const m = re.exec(text)
  // ⚠️ fail-closed 다 — 이 정규식은 표기에 민감해서 `[type="radio"]`(따옴표)나 선언 순서·줄바꿈
  //    변형에도 "못 찾음" 으로 떨어진다. 안전한 방향이지만 메시지가 원인을 오도하지 않도록
  //    **표기 변형**도 함께 언급한다(R3 NIT).
  if (!m) return ['폼 컨트롤 인바리언트: 라디오/체크박스를 제외한 .form-row input/select/textarea 규칙을 찾지 못함 — 선언 삭제 · 셀렉터 변경 · **표기 변형**(따옴표 있는 [type="radio"], 줄바꿈/순서 변경) 중 하나다. UA 기본 흰 배경 복귀 위험이라 fail-closed 로 막는다']
  const findings = []
  if (!/background:\s*var\(--pg-[a-z-]+\)/.test(m[1])) findings.push('폼 컨트롤 인바리언트: background 가 var(--pg-*) 로 선언돼 있지 않다 (UA 기본 흰 배경 복귀)')
  if (!/(^|[^-])color:\s*var\(--pg-[a-z-]+\)/.test(m[1])) findings.push('폼 컨트롤 인바리언트: color 가 var(--pg-*) 로 선언돼 있지 않다')
  // 🔴 ::placeholder 잉크 (R3 C-1) — 배경을 다크로 옮기면 UA 기본 placeholder(Chrome 고정
  //    rgb(117,117,117))가 흰 배경 위 4.61 → --pg-bg 위 3.87 로 **AA 미달**이 된다. 선언이 없으면
  //    P3 가 순회할 규칙이 없고 리터럴이 없어 P1 도 못 본다 — 이 존재 단언이 유일한 방어다.
  if (!/\.form-row[^{]*::placeholder[^{]*\{[^{}]*color:\s*var\(--pg-[a-z-]+\)/.test(text)) {
    findings.push('폼 컨트롤 인바리언트: ::placeholder 잉크가 var(--pg-*) 로 선언돼 있지 않다 — UA 기본 회색은 다크 배경 위 3.87 로 AA 미달이며 게이트의 다른 축은 이 잉크를 원리적으로 못 본다')
  }
  findings.push(...runFormControlCascade(text, expectedBgRules))
  return findings
}

/** 폼 컨트롤 **최종 승자** 단언 (2026-08-13 R3 CRITICAL-3, 입력창 축 한정).
 *
 *  🔴 존재 단언만으로는 부족하다. P3 는 규칙을 **셀렉터 문자열 키**로 모으므로, 같은 엘리먼트를
 *  **더 높은 특정도**로 덮는 다른 규칙(`#form-fields .form-row input { background: … }` = (1,1,1)
 *  > (0,3,1))은 별도 키로 들어가 아무와도 짝지어지지 않는다. 그 결과 입력창이 실제로는 거의 흰
 *  표면이 되는데(jsdom 실증) 원래 규칙은 계속 자기 배경으로 측정돼 **exit 0** 였다.
 *
 *  일반 해법(특정도 비교 + 선언 순서로 캐스케이드 승자 계산)은 텍스트 파서의 범위를 넘는다
 *  (알려진 한계 4). 여기서는 **폼 컨트롤 축만** 닫는다 — 이 objective 의 간판 산출물이고
 *  실제로 뚫린 자리이기 때문이다:
 *    ① 폼 컨트롤을 매칭하는 규칙을 전부 열거하고
 *    ② 그중 `background` 를 **선언한** 규칙이 알려진 집합(기본 + :read-only)뿐인지 단언한다.
 *  세 번째 규칙이 생기면 그게 정당한 변경이든 우회든 **일단 멈추고 사람이 보게** 한다. */
// 🔴 3 = 폼 컨트롤 기본 규칙 + `:read-only` + `#transport-selector select`. 늘리려면 근거를 남길 것.
//    (2026-08-13 epic 크로스 리뷰 W2 로 2 → 3. 아래 필터를 넓히면서 실측 모수가 늘었다.)
const REPO_FORM_CONTROL_BG_RULES = 3
// fixture 는 최소 파일이라 기본 2개(기본 규칙 + :read-only). manifest 로 덮어쓸 수 있다.
const DEFAULT_FORM_CONTROL_BG_RULES = 2
function runFormControlCascade(text, expected) {
  // 🔴 필터는 **셀렉터에 조상이 무엇이든** input/select/textarea 를 겨냥하면 잡는다.
  //    초판은 `.form-row|#form-fields` 를 요구했는데, 그건 docstring 이 약속한 "전부 열거" 보다
  //    좁았다 — 실측 우회 3종이 전부 exit 0 이었다(같은 파일에 실재하고 CONTAINER_OF 에도 등록된
  //    조상을 쓰면 된다): `#form-panel input` · `#sidebar input` · `body input !important`.
  //    셋 다 (1,0,1) 이상이라 기본 규칙 (0,3,1) 을 이기고 입력창이 거의 흰 표면이 된다.
  //    ⚠️ 이건 "알려진 한계 4" 가 **닫았다고 선언한** 축이라, 좁은 필터는 그 선언을 거짓으로 만든다.
  const rules = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /\b(?:input|select|textarea)\b/.test(m[1]) && !m[1].trim().startsWith('/*'))
  const withBg = rules.filter((m) => /(?:^|[^-])background(?:-color)?\s*:/.test(m[2]))
  if (withBg.length === expected) return []
  const sels = withBg.map((m) => m[1].trim().replace(/\s+/g, ' ').slice(0, 70))
  return [
    `폼 컨트롤 캐스케이드: background 를 선언하는 폼 컨트롤 규칙이 ${withBg.length}개 (기대 ${expected}) — ` +
      `더 높은 특정도의 규칙이 입력창 배경을 덮으면 P3 는 원래 규칙을 계속 자기 배경으로 측정해 통과시킨다. 실측 셀렉터: ${sels.join(' | ')}`,
  ]
}

/** 인라인 `.style.background = …` 대입 경로 (2026-08-13 크로스 리뷰 R2 WARNING-1).
 *
 *  🔴 앵커는 `cssText` 한 방 대입만 읽는다. `cssText` 를 그대로 두고 뒤에
 *  `sdResolveRow.style.background = 'var(--pg-fg)'` 한 줄을 더하면 런타임에는 그게 이기는데
 *  게이트는 아무것도 못 본다(실측 exit 0). 이 파일은 이미 `.style.display = …` 관용구를 쓰고
 *  있어 도달 가능한 형태다. 리터럴이면 P1 이 잡지만 `var()` 면 어떤 검사에도 안 닿는다.
 *  추적 대상(섬 2개·배너)에 한해 이 형태 자체를 금지한다 — 배경은 cssText 한 곳에서만 정한다. */
// 🔴 잉크 엘리먼트(…Hint)도 포함한다 — R3 실증: `sdResolveHint.style.cssText` 에 자기 `background`
//    를 넣으면 앵커 (c) 가 **바로 그 문자열에서 color 만 뽑고** background 는 무시한 채 부모 행의
//    --pg-raised 를 배경으로 계속 쓴다(실화면 2.08 인데 exit 0). 답이 읽는 창 안에 있는데 안 봤다.
const BG_ASSIGN_TRACKED = ['sdResolveRow', 'resolveRow', 'banner', 'sdResolveHint', 'resolveHint']
function runInlineBgAssign(pgTextRaw) {
  if (!pgTextRaw) return []
  const text = blankComments(pgTextRaw)
  const findings = []
  for (const name of BG_ASSIGN_TRACKED) {
    // 🔴 allowlist — 허용은 `X.style.cssText = …` **평문 대입 하나뿐**이고 나머지는 전부 금지한다.
    //    (R3 지적: 초판은 `.style.background =` 만 금지했는데 그 형태는 이 파일에 **0건**이고,
    //     실제로 24건 쓰이는 `cssText =` 의 변형들 — `+=` · setAttribute('style') ·
    //     style.setProperty('background') — 이 전부 열려 있었다. 0건짜리를 막고 24건짜리의
    //     변형을 방치한 셈이라, 열거(denylist)를 뒤집어 allowlist 로 바꾼다.)
    for (const [label, re] of [
      ['style.cssText +=', new RegExp(`(?:^|[^A-Za-z])${name}\\.style\\.cssText\\s*\\+=`, 'gm')],
      ['style.background(-Color) =', new RegExp(`(?:^|[^A-Za-z])${name}\\.style\\.(?:background|backgroundColor)\\s*=`, 'gm')],
      ["setAttribute('style', …)", new RegExp(`(?:^|[^A-Za-z])${name}\\.setAttribute\\s*\\(\\s*['"\`]style`, 'gm')],
      ["style.setProperty('background', …)", new RegExp(`(?:^|[^A-Za-z])${name}\\.style\\.setProperty\\s*\\(\\s*['"\`]background`, 'gm')],
      // ⚠️ `classList.add` 는 **일부러 넣지 않았다.** 배경을 CSS 클래스로 옮기는 것 자체는 정당한
      //    리팩터이고, 선언이 사라지면 `bgOf` 가 null → "값 해석 실패" 로 이미 fail-closed 된다.
      //    게다가 넣어보니 `viol-anchor-comment-shadow` fixture 를 이 가드가 대신 잡아
      //    **blankComments 의 load-bearing 증명을 가려버렸다**(가드 상호 은폐 — 무력화해도 fixture 가
      //    계속 빨개져 판별력이 0이 된다). 잉여 가드는 커버리지를 늘리는 게 아니라 증거를 지운다.
    ]) {
      const hits = text.match(re)
      if (hits) findings.push(`인라인 배경 경로: ${name}.${label} ${hits.length}건 — 앵커는 \`${name}.style.cssText = …\` 평문 대입만 읽는다. 이 경로로 배경을 바꾸면 게이트가 측정하지 못하므로, 배경은 그 한 곳에서만 정할 것`)
    }
  }
  return findings
}

/** P2 그림자 — pg-root 블록 **밖**의 --pg-* 재선언을 잡는다 (2026-08-13 크로스 리뷰 R2 WARNING-2).
 *
 *  🔴 이 검사가 없으면 P2 를 통째로 우회할 수 있다. `extractPgTokenMap` 은 `findRootBlockRange` 가
 *  고른 **하나의** :root(= `--pg-bg` 를 가진 블록)만 읽는데, 런타임 CSS 는 **last-wins** 라
 *  뒤에 온 선언이 이긴다. 그래서 다른 곳에 `--pg-border: #334155;` 한 줄을 넣으면 게이트는
 *  새 값(#6e7d94) 기준으로 25건을 "측정"하고 통과하는데, 실제 화면 경계선은 1.35 다.
 *
 *  🔴 초판은 이걸 "`:root` **밖**(`body{}`) 선언" 으로 규정하고 *"이 파일엔 0건이라 실수보다
 *  의도적 우회"* 라며 문서화만 했다. **축 판정이 틀렸다** — 실제 도달 경로는 **두 번째 `:root`
 *  블록**이고, 이 파일은 m15-02-02 가 넣은 BRAND-ANCHOR `:root` 를 이미 25줄 아래에 갖고 있다.
 *  두 `:root` 중 어디에 토큰을 넣는지는 **평범한 실수**다. 게다가 이건 다크 전환 epic 이라
 *  `@media (prefers-color-scheme)` / 테마 토글로 토큰을 재선언하는 것이 가장 자연스러운 다음
 *  편집이다. 비용도 한계 1(=CSS 색 파서 전체)과 달리 몇 줄이라 "같은 원칙" 이 성립하지 않았다.
 *
 *  범위는 `:root` 밖이 아니라 **인식된 pg-root 범위 밖 전부**다 — CSS 컨텍스트(두 번째 :root ·
 *  body · @media · 클래스)뿐 아니라 **JS 컨텍스트**(`playground.js` 의 `setProperty('--pg-*', …)`)
 *  도 포함한다. 🔴 R3 지적: 초판은 `index-v2.html` 만 스캔해, 같은 재선언을 JS 한 줄로 하면
 *  그대로 통과했다(`document.documentElement.style.setProperty('--pg-panel','var(--pg-fg)')`
 *  → 사이드바 전체가 거의 흰색이 되고 그 위 잉크 1.00 인데 exit 0). playground.js 는 이미 P1
 *  스캔 모수이자 앵커의 원천인데 이 검사만 안 보고 있었다. */
function runP2Shadow(indexText, rootRange, pgTextRaw) {
  const findings = []
  // 🔴 HTML 주석도 지운다 (R3 NIT-5). blankComments 는 `/* */`·`//` 만 지우므로, 이 검사가
  //    HTML 을 스캔하는 유일한 축인데 `<!-- 예전 값: --pg-border: #334155; -->` 를 "재선언" 으로
  //    오탐했다(실측 exit 1). 인덱스가 밀리지 않게 길이를 보존하며 공백으로 치환한다 —
  //    blankComments 와 같은 방식(excludeRanges 정렬 보존).
  const text = blankComments(indexText.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' ')))
  const re = /--(pg-[a-z-]+)\s*:/g
  let m
  // JS 축 — setProperty('--pg-*', …) / 문자열 안의 --pg-*: 선언 (pg-root 개념이 없으므로 전건 금지)
  if (pgTextRaw) {
    const js = blankComments(pgTextRaw)
    for (const jsRe of [/setProperty\(\s*['"`](--pg-[a-z-]+)/g, /['"`][^'"`]*?(--pg-[a-z-]+)\s*:/g]) {
      let j
      while ((j = jsRe.exec(js))) {
        const line = js.slice(0, j.index).split('\n').length
        findings.push(`토큰 맵: --${j[1].replace(/^--/, '')} 이 playground.js 에서 재선언됨 (playground.js:${line}) — 토큰은 index-v2.html 의 pg-root 한 곳에서만 정한다`)
      }
    }
  }
  while ((m = re.exec(text))) {
    if (inRange(m.index, rootRange)) continue
    const line = text.slice(0, m.index).split('\n').length
    findings.push(`토큰 맵: --${m[1]} 이 pg-root 블록 밖에서 재선언됨 (index-v2.html:${line}) — 런타임 last-wins 로 게이트가 측정한 값과 실제 렌더값이 갈린다`)
  }
  return findings
}

// ════════════════════════════════════════════════════════════════════════
// P3 — 사용처 대비 (CSS 블록 순회, 실제 잉크↔배경 유도)
// ════════════════════════════════════════════════════════════════════════

const AA_TEXT = 4.5
const AA_NONTEXT = 3.0

/** 구조적 포함관계(색과 무관 — DOM 중첩 사실). index-v2.html 실제 마크업(<body> 이하 — 🔴 줄 번호를 적지 않는다, 이 PR 이 두 번 밀었다) +
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
  // (index-v2.html 의 #header 블록 — 셋 다 #header 의 자식/후손. 줄 번호 대신 셀렉터로 참조)
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
    '#e2e8f0': { count: 2, resolvedBy: 'pre-existing' }, // 로그 패널 전경(이미 다크였던 log-toolbar/log-scroll 영역) 리터럴 사용처 — --pg-fg 와 같은 값이지만 로그 패널은 --pg-* 시스템 밖(m15-02-01 이전부터 다크). 🔴 3→2: m15-02-04 R2(W-C)가 #transport-selector select 의 잉크를 var(--pg-fg) 로 합치면서 1건 감소 — 양방향 대조가 즉시 잡아준 자리다
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
 *  🔴 2026-08-12 리뷰의 교훈(문구는 m15-02-04 에서 갱신) — 한때 setHint 를 "같은 삼항식 모양"
 *  이라는 이유로 앵커에 넣었다가 되돌린 적이 있다. 당시 그 hintEl 의 부모는 인라인
 *  `background:#f7f7f7`(밝은 섬)이어서, **판별자는 "삼항식 모양"이 아니라 "부모 표면"** 이라는
 *  것이 그때 얻은 결론이다. 이 원칙은 지금도 유효하고, 아래 (a)~(f) 가 배경을 **파일에서 실측**
 *  하는 이유이기도 하다.
 *  ⚠️ 다만 **그 시점의 사실 서술은 이제 전부 낡았다** (2026-08-13 R3 W-3): m15-02-04 가 그 섬들을
 *  `var(--pg-raised)` 로 이관했고, setHint 잉크를 다크세이프 값으로 다시 넣었으며, "스코프 밖 ·
 *  m15-02-04 후보" 라던 제3 인스턴스도 이 objective 가 처리했다. 옛 문장을 그대로 두면 자기가
 *  설명하는 앵커 배열과 정면으로 모순되므로 사실 부분은 제거하고 **원칙만** 남긴다. */
function buildLiteralAnchors(indexHtml, pgTextRaw, pgMap) {
  // 🔴 앵커는 **주석을 지운 본문**을 매칭한다 (2026-08-13 크로스 리뷰 R2 CRITICAL-2 / E1).
  //    P1 은 blankComments, P4 는 stripComments 를 쓰는데 **앵커만 원문**을 봤다. 그래서 실 선언을
  //    지우고 옛 줄을 **주석으로 남기면** 앵커가 그 주석을 읽어 계속 초록이었다 — 배경을 CSS 클래스로
  //    이관해 실화면이 2.08(거의 흰 표면 위 muted)이 돼도 exit 0. 순수 삭제는 fail-closed 인데
  //    **주석 한 줄이 그 fail-closed 를 무력화**한 것이다. 이 파일 blankComments 의 docstring 이
  //    "이 세션에서 실제로 4번 반복된 실수" 라고 적은 바로 그 축이 앵커에서 재발했다.
  const pgText = pgTextRaw ? blankComments(pgTextRaw) : pgTextRaw
  // 🔴 **유일 매치만 신뢰한다** (같은 리뷰 / E2). `re.exec` 는 첫 매치를 집으므로, 파일 앞쪽에
  //    같은 이름의 지역변수(`var banner = …`, `var resolveRow = …`)를 하나 더 두면 앵커가 그
  //    **미끼**를 읽고, 진짜 선언을 밝은 값으로 바꿔도 초록이었다(실측 exit 0, 배너 잉크 실제 1.00).
  //    2건 이상이면 null 을 돌려 기존 "값 해석 실패" 경로로 **fail-closed** 시킨다 — 모호하면 멈춘다.
  //    ⚠️ 이 앵커들의 유일성은 계약이다. 대상 변수를 복수로 만들 거라면 앵커를 함께 갱신할 것.
  const once = (re) => {
    if (!pgText) return null
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    const all = pgText.match(g)
    return all && all.length === 1 ? new RegExp(re.source, re.flags).exec(pgText) : null
  }
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
    const m1 = once(/_btcSetStatus[\s\S]{0,500}?isErr\s*\?\s*'(#[0-9a-fA-F]{3,6})'\s*:\s*'(?:#[0-9a-fA-F]{3,6}|var\(--pg-muted\))'/)
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
    const bgOf = (re) => { const m = once(re); return m ? resolveColorValue(m[1].trim(), pgMap) : null }
    // ℹ️ 앞의 `(?:^|[^A-Za-z])` 는 **방어적 경계**다 (2026-08-13 R2 NIT-1 정정).
    //    초판 주석은 "resolveRow 는 sdResolveRow 의 부분문자열이라" 고 적었는데 **사실이 아니다**
    //    — `sdResolveRow` 안에 소문자 `resolveRow` 는 없다(대문자 R). 같은 함수의 (c)/(d) 주석이
    //    Hint 짝에 대해 정반대를 옳게 적고 있어 두 주석이 서로 모순이었다. 실측상 이 경계를 빼도
    //    동작은 같다(no-op). 진짜 미끼 방어는 위 `once()` 의 유일성 단언이며, 이 경계는 앞으로
    //    소문자로 끝나는 유사 이름이 생길 때를 위한 belt-and-braces 로 남긴다.
    //    (banner 에 같은 경계가 없는 것도 같은 이유로 무해하다 — 유일성은 once() 가 본다.)
    const sdRowBg = bgOf(/sdResolveRow\.style\.cssText\s*=\s*'[^']*background:\s*([^;']+)/)
    const rsRowBg = bgOf(/(?:^|[^A-Za-z])resolveRow\.style\.cssText\s*=\s*'[^']*background:\s*([^;']+)/m)
    const bannerBg = bgOf(/banner\.style\.cssText\s*=\s*'[^']*background:\s*([^;']+)/)
    for (const a of [
      { name: '(a) _signDataGetAddressClick setHint', bg: sdRowBg, re: /_signDataGetAddressClick[\s\S]{0,1200}?hintEl\.style\.color\s*=\s*isErr\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/ },
      { name: '(b) _resolveSenderFromDeviceClick setHint', bg: rsRowBg, re: /_resolveSenderFromDeviceClick[\s\S]{0,1200}?hintEl\.style\.color\s*=\s*isError\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/ },
    ]) {
      const m = once(a.re)
      anchors.push({ name: `${a.name} err`, ink: m ? resolveColorValue(m[1], pgMap) : null, bg: a.bg, threshold: AA_TEXT })
      anchors.push({ name: `${a.name} ok`, ink: m ? resolveColorValue(m[2], pgMap) : null, bg: a.bg, threshold: AA_TEXT })
    }
    // (c)/(d) 섬 안 정적 hint 잉크. 🔴 resolveHint 는 sdResolveHint 의 부분문자열이 아니다
    // (대문자 R — 정규식은 대소문자 구분) 이라 두 앵커가 서로 오염되지 않는다.
    for (const a of [
      { name: '(c) sdResolveHint 정적 잉크', bg: sdRowBg, re: /sdResolveHint\.style\.cssText\s*=\s*'[^']*color:\s*([^;']+)/ },
      { name: '(d) resolveHint 정적 잉크', bg: rsRowBg, re: /(?:^|[^A-Za-z])resolveHint\.style\.cssText\s*=\s*'[^']*color:\s*([^;']+)/m },
    ]) {
      const m = once(a.re)
      anchors.push({ name: a.name, ink: m ? resolveColorValue(m[1].trim(), pgMap) : null, bg: a.bg, threshold: AA_TEXT })
    }
    // (e)/(f) 경고 배너 — 섬 3규칙의 세 번째. 잉크/테두리 둘 다 앵커로 둔다. 🔴 (a)~(d) 만 두면
    // 배너 잉크(옛 값은 --pg-raised 위 2.55)를 되돌려도 안 잡힌다: 그 값은 휘도 0.141 이라
    // P1(휘도>0.5) 밖이고, 인라인이라 P3 의 CSS 순회에도 안 걸린다. 같은 클래스의 5번째 원소다.
    {
      const mInk = once(/banner\.style\.cssText\s*=\s*'[^']*;\s*color:\s*([^;']+)/)
      anchors.push({ name: '(e) #getaddress-banner 잉크', ink: mInk ? resolveColorValue(mInk[1].trim(), pgMap) : null, bg: bannerBg, threshold: AA_TEXT })
      const mBorder = once(/banner\.style\.cssText\s*=\s*'[^']*border:\s*1px\s+solid\s+([^;']+)/)
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
// 이 objective 가 새로 배선한 것을 지워도 게이트가 조용히 통과한다.
//
// 🔴 **숫자는 아래 상수만이 출처다** (2026-08-13 R3 W-2). 초판은 여기에 "P4 16 → 34" 처럼
//    도착값을 함께 적었는데, 이후 라운드에서 상수가 39·40 으로 움직이는 동안 이 주석은 34 에
//    멈춰 stale 이 됐다 — 헤더 docstring 이 "숫자를 두 곳에 적으면 한쪽이 반드시 stale 이 된다"
//    고 경고한 바로 그 일이 이 주석에서 일어났다. 🔴 floor 를 **낮추는** 방향은 fixture 스위트가
//    전혀 못 잡으므로(각 fixture 는 자기 manifest floor 를 쓴다), 다음 사람이 stale 한 숫자로
//    재유도하면 게이트가 조용히 약해진다. ⇒ 여기엔 **무엇이 늘었는지(산문)만** 적고 도착값은
//    적지 않는다. 실측 확인은 `node scripts/check-playground-surface.mjs` 출력의 p3/p4/p5 로 한다.
//   P4 : 폼 컨트롤 background/color·placeholder · 버튼 규칙(base/hover/disabled) · muted 통일 ·
//        섬/배너 이관 · #transport-selector select 토큰화로 늘었다.
//   P5 : 공용 .form-row button 3규칙 + read-only/.error 특정도 규칙 분화 + placeholder 규칙.
//   P3 : CSS 사용처(기존 + 헤더 muted 3 + tree-family-label + 폼 컨트롤 color/border + #header seam)
//        + 앵커 10(.field-error · _btcSetStatus · 신설 (a)~(f) 8).
const REPO_P4_FLOOR = 42
const REPO_P5_FLOOR = 61 // 실측(2026-08-13) — index-v2.html CSS 규칙 수
// 🔴 P3 도 같은 이유로 floor 가 필요하다(Lens1 C2) — checked.length 는 지금까지 무방비였다.
const REPO_P3_FLOOR = 26
// 🔴 위반 fixture 모수 floor (epic 크로스 리뷰 W1) — 실측과 일치시킨다. 이 숫자가 없으면
//    위반 fixture 를 통째로 지워도 --test 가 초록이라 검출력 증명이 조용히 사라진다.
const REPO_VIOL_FIXTURE_FLOOR = 14

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
    formControlBgRules: REPO_FORM_CONTROL_BG_RULES,
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
  findings.push(...runP2Shadow(spec.indexText, rootRange, spec.pgText))
  findings.push(...runFormControlInvariant(spec.indexText, spec.formControlBgRules ?? DEFAULT_FORM_CONTROL_BG_RULES))
  findings.push(...runInlineBgAssign(spec.pgText))

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
    formControlBgRules: manifest.formControlBgRules ?? DEFAULT_FORM_CONTROL_BG_RULES,
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
  // 🔴 **위반 fixture 모수 floor** (2026-08-13 epic 크로스 리뷰 W1).
  //    초판은 "디렉터리 ≥1" + "정상 ≥2" 만 봤다. 그래서 `rm -rf tests/fixtures/*/viol*` 한 줄로
  //    **위반 fixture 23개를 전부 지워도 exit 0** 이었다 — 이 epic 이 쌓은 검출력 증명 전체가
  //    조용히 사라지고 CI 는 아무 말도 안 한다. 정상 fixture 만으로는 "게이트가 무언가를 잡는다" 를
  //    보장하지 못한다(아무것도 안 잡아도 정상 fixture 는 통과한다).
  const violCount = dirs.length - okCount
  if (violCount < REPO_VIOL_FIXTURE_FLOOR) {
    console.error(`위반 fixture 가 ${violCount}건 (floor ${REPO_VIOL_FIXTURE_FLOOR} 미만 — 검출력 증명이 사라졌다)`)
    return 2
  }
  console.log(`fixtures: ${dirs.length}건 (정상 ${okCount}건 · 위반 ${violCount}건)`)

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
