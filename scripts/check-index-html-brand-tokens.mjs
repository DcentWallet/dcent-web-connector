#!/usr/bin/env node
/**
 * docs/index.html + index-v2.html 의 브랜드 색 하드코딩(G1) · 대비(G2, 양방향) · 해석 스냅샷(G3) 게이트.
 * (m15-02-01)
 *
 * 왜 필요한가 — 브랜드 색이 `:root` 앵커 블록 한 곳으로 모였다(BRAND-ANCHOR:BEGIN/END, docs/index.html).
 * 이 게이트가 없으면 (a) 누군가 앵커 밖에 브랜드 색을 다시 하드코딩해도 아무도 못 잡고,
 * (b) `--accent`/`--accent-soft` 파생이 앵커를 실제로 추종하는지 확인할 수단이 없고,
 * (c) AA 대비 미달이 방치돼도 조용히 넘어간다. 다음 브랜드 색 교체(`m15-02-02`)가 "상수만 바꾸면 되는"
 * 작업이 되려면 이 세 가지가 코드로 고정돼 있어야 한다.
 *
 * G1 — 앵커 라인 범위 밖 브랜드 리터럴 하드코딩 0건 (+ 구조 floor 5축)
 * G2 — 대비, 양방향:
 *   방향 A: 브랜드가 전경일 때 (--accent 텍스트/아이콘) — 6개 고정 짝
 *   방향 B: 브랜드가 배경일 때 (브랜드 배경 규칙의 잉크) — B-1(캐스케이드 쌍) · B-2(같은 블록) · B-3(인라인, 명시 열거)
 * G3 — `--accent`/`--accent-soft` 해석값 스냅샷 (커밋 파일과 대조, 앵커 9키 + 파생 2키 = 11 엔트리)
 *
 * 🔴 jest 로 돌리지 않는다 — connector 의 기본 jest preset 이 jest-puppeteer 라 `yarn jest` 는
 *    Chromium 을 띄운다. 이 스크립트는 형제 `scripts/check-*.mjs` 6개와 같은 모양의 node 직접 실행 CLI다.
 *
 * 사용법:
 *   node scripts/check-index-html-brand-tokens.mjs             # 실제 리포 스캔
 *   node scripts/check-index-html-brand-tokens.mjs --test      # tests/fixtures/brand-tokens/* 전부
 *   node scripts/check-index-html-brand-tokens.mjs --fixture <dir>
 *
 * exit code: 0=clean(or warn 모드) · 1=findings(하드코딩/대비/스냅샷 불일치) · 2=usage/구조 오류
 *
 * 🔴 예외/알려진 위반은 "건수"가 아니라 "명시 목록"으로 등록한다(§4-4). 목록 길이는 실제 스캔 결과와
 *    항상 비교되므로(양방향), 목록에만 항목을 추가하고 파일은 안 바꾸면 즉시 FAIL — 이 자체가
 *    T-G-01e(추가 뮤테이션)의 검출 메커니즘이다.
 */
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const FIXTURES_ROOT = join(here, '..', 'tests', 'fixtures', 'brand-tokens')

// 🔴 fixture/manifest/snapshot 파싱 중 예상치 못한 예외(손상된 JSON, 누락 키 등)가 uncaught 로
//    새면 exit code 가 process 기본값(1) 이 되어 "findings"(1)와 "구조 오류"(2)가 구분 안 된다.
//    이 스크립트의 exit 규약(0/1/2)을 어떤 경로에서도 지키기 위한 최후 안전망.
process.on('uncaughtException', (e) => {
  console.error(`ERROR: 예상치 못한 예외 — 구조 오류로 처리 (exit 2): ${e && e.stack ? e.stack : e}`)
  process.exit(2)
})

// ════════════════════════════════════════════════════════════════════════
// 색 연산 (순수 함수 — 어떤 파일 I/O 도 없다)
// ════════════════════════════════════════════════════════════════════════

/** '#abc' / '#aabbcc' → [r,g,b] (0~255). 잘못된 입력이면 null. */
function parseHex(hex) {
  if (typeof hex !== 'string') return null
  let h = hex.trim().toLowerCase()
  if (!h.startsWith('#')) return null
  h = h.slice(1)
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')
}

/** WCAG 상대 휘도 */
function relativeLuminance([r, g, b]) {
  const f = (c) => {
    const cs = c / 255
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG 대비비, 소수점 2자리 반올림. (bridge 형제와 같은 골든값·반올림 자릿수 — T-U-03) */
function contrastRatio(hexA, hexB) {
  const a = parseHex(hexA)
  const b = parseHex(hexB)
  if (!a || !b) return null
  const lA = relativeLuminance(a)
  const lB = relativeLuminance(b)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100
}

/** HSL hue(도) + chroma(0~255, max-min). 채도 비율 대신 절대 chroma 를 쓴다 —
 * 근흑색(#050506 류)에서 상대 채도 비율이 분모가 작아 임계값을 스퓨리어스하게 넘는 문제를 피한다. */
function hueAndChroma([r, g, b]) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = max - min
  if (chroma === 0) return { hue: 0, chroma: 0 }
  const rN = r / 255
  const gN = g / 255
  const bN = b / 255
  const maxN = max / 255
  const dN = chroma / 255
  let h
  if (maxN === rN) h = (gN - bN) / dN + (gN < bN ? 6 : 0)
  else if (maxN === gN) h = (bN - rN) / dN + 2
  else h = (rN - gN) / dN + 4
  return { hue: h * 60, chroma }
}

/** CSS `color-mix(in srgb, hexA pctA%, hexB)` — sRGB 인코딩값 그대로 채널별 선형 보간 후 반올림. */
function colorMixSrgb(hexA, pctA, hexB) {
  const a = parseHex(hexA)
  const b = parseHex(hexB)
  if (!a || !b) return null
  const p = pctA / 100
  return toHex([a[0] * p + b[0] * (1 - p), a[1] * p + b[1] * (1 - p), a[2] * p + b[2] * (1 - p)])
}

// ════════════════════════════════════════════════════════════════════════
// 구조 파서 — 정규식으로 HTML 을 자르지 않는다. `:root{...}` 를 괄호 균형으로 전부 열거한다.
// ════════════════════════════════════════════════════════════════════════

/** 텍스트에서 모든 `:root{...}` 블록을 열거한다 (중첩 `{}` 균형 매칭). */
function findRootBlocks(text) {
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
    if (depth !== 0) continue // 균형 안 맞으면 스킵 (구조 오류는 상위에서 판정)
    blocks.push({ start: m.index, bodyStart, bodyEnd: i - 1, content: text.slice(bodyStart, i - 1) })
  }
  return blocks
}

/** `:root{...}` 블록 본문에서 `--name:value;` 선언을 전부 파싱한다. (주석은 먼저 제거)
 *  🔴 CSS 는 블록의 마지막 선언에 세미콜론을 요구하지 않는다(`:root{--toc-w:0px}`) — 끝에 없으면
 *  보충해서 매칭한다. 빠뜨리면 이런 짧은 :root 블록의 선언이 통째로 안 잡혀 custom-property floor 가
 *  조용히 과소집계된다. */
function parseCustomProps(blockContent) {
  const noComments = blockContent.replace(/\/\*[\s\S]*?\*\//g, '')
  const trimmed = noComments.trimEnd()
  const padded = trimmed.length > 0 && !trimmed.endsWith(';') ? trimmed + ';' : noComments
  const re = /--([a-zA-Z][a-zA-Z0-9-]*)\s*:\s*([^;]+);/g
  const props = []
  let m
  while ((m = re.exec(padded))) {
    props.push([m[1], m[2].trim()])
  }
  return props
}

const ANCHOR_KEYS = [
  'brand-100', 'brand-200', 'brand-400',
  'brand', 'brand-600', 'brand-900',
  'brand-ink', 'brand-ink-lite', 'on-brand',
]
const ANCHOR_BEGIN_MARKER = 'BRAND-ANCHOR:BEGIN'
const ANCHOR_END_MARKER = 'BRAND-ANCHOR:END'

/** 파일 텍스트에서 앵커 블록(=='brand' 키를 가진 :root 블록) 을 찾는다.
 *  반환: { rootBlocks, anchorBlock|null, anchorProps|null, markerLineRange|null, structuralErrors: [] } */
function analyzeFile(text) {
  const rootBlocks = findRootBlocks(text)
  const errors = []
  let anchorBlock = null
  let anchorProps = null
  for (const block of rootBlocks) {
    const props = parseCustomProps(block.content)
    if (props.some(([name]) => name === 'brand')) {
      if (anchorBlock) {
        errors.push('여러 :root 블록이 --brand 를 선언 — 앵커가 중복됨')
      }
      anchorBlock = block
      anchorProps = props
    }
  }

  // 🔴 markerCharRange 는 "라인" 이 아니라 "문자 인덱스" 로 면제 범위를 정한다. 라인 기반이면
  //    END 마커와 같은 줄 뒤에 붙인 하드코딩("/* ...END... */ .sneak{color:#xxxxxx}")이 면제된다
  //    (같은 라인이므로 포함) — 문자 인덱스면 마커 텍스트 끝(endIdx + marker.length) 뒤의 문자는
  //    전부 범위 밖이라 이 우회가 막힌다.
  //    추가로 "마커가 앵커 9개 선언만 감싸는지"(다른 콘텐츠를 삼키도록 END 를 옮기는 우회 방지)를
  //    범위 안 hex 리터럴 개수 == 9 로 검증하고, 마커가 앵커(--brand) :root 블록 밖으로 나가지
  //    않았는지도 확인한다.
  let markerCharRange = null
  const beginIdx = text.indexOf(ANCHOR_BEGIN_MARKER)
  const endIdx = text.indexOf(ANCHOR_END_MARKER)
  if (anchorBlock) {
    const beginIdxLast = text.lastIndexOf(ANCHOR_BEGIN_MARKER)
    const endIdxLast = text.lastIndexOf(ANCHOR_END_MARKER)
    if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
      errors.push('BRAND-ANCHOR:BEGIN/END 마커 불일치')
    } else if (beginIdx !== beginIdxLast || endIdx !== endIdxLast) {
      errors.push('BRAND-ANCHOR:BEGIN/END 마커가 2쌍 이상 존재 — 어느 쪽이 유효 범위인지 모호함')
    } else if (beginIdx < anchorBlock.bodyStart || endIdx > anchorBlock.bodyEnd) {
      errors.push('BRAND-ANCHOR 마커가 앵커(--brand) :root 블록 밖에 있음')
    } else {
      const range = [beginIdx, endIdx + ANCHOR_END_MARKER.length]
      const regionHexCount = scanHexLiterals(text.slice(range[0], range[1])).length
      if (regionHexCount !== ANCHOR_KEYS.length) {
        errors.push(
          `마커 범위 안 hex 리터럴 수 ${regionHexCount} != 앵커 키 수 ${ANCHOR_KEYS.length} ` +
            '(마커가 9개 선언만 감싸지 않음 — END 를 옮겨 다른 콘텐츠를 삼켰거나 선언 일부가 범위 밖)',
        )
      } else {
        markerCharRange = range
      }
    }
    const anchorMap = Object.fromEntries(anchorProps)
    for (const key of ANCHOR_KEYS) {
      if (!(key in anchorMap)) errors.push(`앵커 키 누락: --${key}`)
    }
    // 9키 값이 서로 달라야 한다 (라벨↔값 뒤바뀜을 어떤 단언도 못 잡는 것을 방지)
    const values = ANCHOR_KEYS.filter((k) => anchorMap[k]).map((k) => normalizeHex(anchorMap[k])).filter(Boolean)
    const uniq = new Set(values)
    if (uniq.size !== values.length) errors.push('앵커 9키 중 값이 중복됨 — 서로 달라야 한다')
  }

  return { rootBlocks, anchorBlock, anchorProps: anchorProps ? Object.fromEntries(anchorProps) : null, markerCharRange, structuralErrors: errors }
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

function normalizeHex(v) {
  if (typeof v !== 'string') return null
  const p = parseHex(v.trim())
  return p ? toHex(p) : null
}

// ════════════════════════════════════════════════════════════════════════
// G1 — 하드코딩 스캔
// ════════════════════════════════════════════════════════════════════════

/** 앵커(현재+과거 세대)에서 유도한 "브랜드 유채색 밴드" (D6 결정 — hue 상수를 박지 않는다). */
function computeBrandBand(anchorMap) {
  const chromaticKeys = ANCHOR_KEYS.filter((k) => k !== 'on-brand')
  const hues = []
  for (const k of chromaticKeys) {
    const v = anchorMap[k]
    if (!v) continue
    const rgb = parseHex(v)
    if (!rgb) continue
    hues.push(hueAndChroma(rgb).hue)
  }
  if (hues.length === 0) return null
  return [Math.min(...hues) - 15, Math.max(...hues) + 15]
}

const CHROMA_MIN = 24 // 절대 chroma(0~255) 임계 — 근흑색 오탐 방지

/** hex 가 "브랜드 리터럴"인지 판정. exactSet=정확 일치 대상(현재+과거 9값 전체), band=[min,max] hue. */
function isBrandLiteral(hex, exactSet, band) {
  const norm = normalizeHex(hex)
  if (!norm) return { match: false }
  if (exactSet.has(norm)) return { match: true, reason: 'exact' }
  if (!band) return { match: false }
  const rgb = parseHex(norm)
  const { hue, chroma } = hueAndChroma(rgb)
  if (chroma >= CHROMA_MIN && hue >= band[0] && hue <= band[1]) return { match: true, reason: 'band' }
  return { match: false }
}

/** 파일 텍스트에서 모든 `#hex` 리터럴(3/6자리)을 라인번호와 함께 열거. */
function scanHexLiterals(text) {
  // 🔴 %23 = URI 인코딩된 # — 데이터 URI(favicon 등) 안의 브랜드 hex 가 이 축이 없어
  //    **완전히 안 보였다**(2026-08-13 R4 W-2). favicon 에 옛 보라가 살아남아 탭 아이콘과
  //    헤더 로고가 서로 다른 브랜드로 보였고, "보라 잔재 소진" 주장이 사실과 어긋났다.
  const re = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|%23[0-9a-fA-F]{6}\b|%23[0-9a-fA-F]{3}\b/g
  const hits = []
  let m
  while ((m = re.exec(text))) {
    hits.push({ hex: normalizeHex(m[0].replace(/^%23/, '#')), raw: m[0], line: lineOf(text, m.index), index: m.index })
  }
  return hits.filter((h) => h.hex)
}

/** 문자 인덱스가 [start, end) 범위 안에 있는지. range=null 이면 전부 밖(제외 없음). */
function inRange(index, range) {
  return !!range && index >= range[0] && index < range[1]
}

/** `col:'#hex'` (체인 카탈로그 필드) 패턴 위치를 열거. 라인 범위 무관 — 구조적 필드명으로 식별한다.
 *  하드코딩된 라인 범위(:580~:610) 대신 이 방식을 쓰는 이유: 카탈로그 위에 줄이 삽입되면 라인 범위는
 *  즉시 깨지지만, `col:` 필드명은 카탈로그가 자라도 안정적으로 남는다.
 *  🔴 G7(2026-08-12 4축 크로스 리뷰) — `range`(문자 인덱스 [start,end))를 함께 반환한다. 예전엔
 *  호출부가 `line`(줄 번호)만으로 제외해 "이 col: 필드가 있는 **줄 전체**"의 다른 hex 리터럴까지
 *  모두 하드코딩 집계에서 빠졌다 — 같은 줄에 col: 데코이 주석(hex 값을 담은 짧은 인라인 주석)을
 *  붙이면 미등록 브랜드 하드코딩이 G1 시야에서 통째로 사라졌다(대조군 실험 실증). 마커
 *  범위(markerCharRange)와 같은 문자 인덱스 기법으로 바꿔 "이 col: 매치 자신의 hex 리터럴만"
 *  제외하도록 좁힌다. */
function scanCatalogColFields(text) {
  const re = /col:\s*'(#[0-9a-fA-F]{6})'/g
  const hits = []
  let m
  while ((m = re.exec(text))) {
    hits.push({ hex: normalizeHex(m[1]), line: lineOf(text, m.index), range: [m.index, m.index + m[0].length] })
  }
  return hits
}

/**
 * G1 실행. `spec` = { files: [{key, text}], anchorFile: key, exceptions: {key: {hex:count}},
 *   catalogExempt: {key: count}, floors: {rootBlocks, customProps, accentUses, accentSoftUses, scannedFiles} }
 * 반환: { ok, errors: [structural], findings: [content violation], floors: {...actual} }
 */
function runG1(spec) {
  const errors = []
  const findings = []
  const analyses = {}
  let totalRootBlocks = 0
  let totalCustomProps = 0
  let anchorMap = null
  let brandBand = null
  const exactSet = new Set()

  for (const { key, text } of spec.files) {
    const a = analyzeFile(text)
    analyses[key] = a
    totalRootBlocks += a.rootBlocks.length
    for (const block of a.rootBlocks) totalCustomProps += parseCustomProps(block.content).length
    if (key === spec.anchorFile) {
      if (!a.anchorBlock) {
        errors.push(`${key}: 앵커(--brand) :root 블록을 찾지 못함`)
      } else {
        anchorMap = a.anchorProps
      }
    }
    // 🔴 anchorFile 전용이 아니다 — 다른 파일도 자체 BRAND-ANCHOR 블록을 가질 수 있다
    // (index-v2.html, D1 parity 표면). 그 블록의 구조 오류(마커 불일치/9키 누락/중복값 등)도
    // 똑같이 잡아야 한다 — "전역 유일 --brand 전제 금지" (01 의 T-U-02).
    if (a.anchorBlock) {
      errors.push(...a.structuralErrors)
    }
  }

  if (errors.length > 0) return { ok: false, errors, findings: [], floors: null }

  for (const key of ANCHOR_KEYS) {
    if (anchorMap[key]) exactSet.add(normalizeHex(anchorMap[key]))
  }
  for (const past of spec.pastGenerations || []) {
    for (const key of ANCHOR_KEYS) {
      if (past[key]) exactSet.add(normalizeHex(past[key]))
    }
  }
  brandBand = computeBrandBand(anchorMap)

  // 🔴 앵커 parity — anchorFile 이 아닌 파일도 자기 앵커 블록을 가지면(index-v2.html) 9값이
  // anchorFile 과 정확히 같아야 한다. G1은 지금까지 이걸 "하드코딩 스캔"으로만 간접 검사했는데
  // (마커 안이라 excludeRange 로 면제되므로 하드코딩 스캔이 아예 못 봄), 값이 서로 다르면
  // 아무 게이트도 못 잡는 구멍이 생긴다(T-R-10 — "index-v2.html 앵커 값이 docs/index.html 과
  // 다름 → G1 이 FAIL"). 명시로 비교한다.
  for (const { key } of spec.files) {
    if (key === spec.anchorFile) continue
    const a = analyses[key]
    if (!a.anchorBlock) continue
    for (const k of ANCHOR_KEYS) {
      const mainVal = normalizeHex(anchorMap[k])
      const otherVal = normalizeHex(a.anchorProps[k])
      if (mainVal !== otherVal) {
        findings.push(`${key}: 앵커 값 불일치 --${k} ${spec.anchorFile}=${mainVal} vs ${key}=${otherVal}`)
      }
    }
  }

  // 스캔: 파일별 하드코딩 탐지
  const perFileCatalogCount = {}
  const perFileHexCount = {}
  for (const { key, text } of spec.files) {
    const a = analyses[key]
    // 🔴 anchorFile 단일 파일 전제를 깬다 — 앵커(--brand) 블록을 가진 어떤 파일이든 자신의
    // markerCharRange 로 자기 리터럴을 면제한다. 예전엔 anchorFile 이 아닌 파일의 BRAND-ANCHOR
    // 블록 안 리터럴이 그대로 하드코딩 스캔에 걸렸다(index-v2.html 9값이 매번 FAIL).
    const excludeRange = a.markerCharRange
    const catalogHits = scanCatalogColFields(text)
    // 🔴 G7 수정 — 예전엔 `catalogLines`(줄 번호 Set)로 "이 줄의 다른 hex 도 전부" 면제했다.
    //    문자 인덱스 range 로 좁혀 "이 col: 매치 자신의 hex 만" 면제한다(마커 범위와 동일 기법).
    const catalogRanges = catalogHits.map((h) => h.range)
    let catalogCount = 0
    for (const c of catalogHits) {
      const r = isBrandLiteral(c.hex, exactSet, brandBand)
      if (r.match) catalogCount++
    }
    perFileCatalogCount[key] = catalogCount

    const hits = scanHexLiterals(text)
    const hexCount = {}
    for (const h of hits) {
      if (inRange(h.index, excludeRange)) continue
      if (catalogRanges.some((range) => inRange(h.index, range))) continue // col: 필드 자신만 면제 (같은 줄 데코이는 안 면제)
      const r = isBrandLiteral(h.hex, exactSet, brandBand)
      if (!r.match) continue
      hexCount[h.hex] = (hexCount[h.hex] || 0) + 1
    }
    perFileHexCount[key] = hexCount
  }

  // 예외 목록과 양방향 대조 (실측==명시, 추가/누락 모두 FAIL)
  for (const { key } of spec.files) {
    const expected = (spec.exceptions && spec.exceptions[key]) || {}
    const actual = perFileHexCount[key] || {}
    const allHex = new Set([...Object.keys(expected), ...Object.keys(actual)])
    for (const hex of allHex) {
      const e = expected[hex] || 0
      const act = actual[hex] || 0
      if (e !== act) {
        findings.push(`${key}: ${hex} 실측 ${act}건 vs 예외목록 ${e}건 (불일치 — 새 하드코딩 또는 목록 drift)`)
      }
    }
    const expectedCatalog = (spec.catalogExempt && spec.catalogExempt[key]) || 0
    const actualCatalog = perFileCatalogCount[key] || 0
    if (expectedCatalog !== actualCatalog) {
      findings.push(`${key}: 카탈로그 col: 브랜드밴드 실측 ${actualCatalog}건 vs 기대 ${expectedCatalog}건`)
    }
  }

  // floor 5(+1)축
  const accentUses = spec.files.reduce((n, { text }) => n + (text.match(/var\(--accent\)/g) || []).length, 0)
  const accentSoftUses = spec.files.reduce((n, { text }) => n + (text.match(/var\(--accent-soft\)/g) || []).length, 0)
  const scannedFiles = spec.files.length

  const floors = {
    rootBlocks: totalRootBlocks,
    customProps: totalCustomProps,
    accentUses,
    accentSoftUses,
    scannedFiles,
  }
  const expFloors = spec.floors
  if (floors.rootBlocks < expFloors.rootBlocks) errors.push(`:root 블록 수 ${floors.rootBlocks} < floor ${expFloors.rootBlocks}`)
  if (floors.customProps < expFloors.customProps) errors.push(`custom property 수 ${floors.customProps} < floor ${expFloors.customProps}`)
  if (floors.accentUses !== expFloors.accentUses) errors.push(`var(--accent) 사용 수 ${floors.accentUses} != ${expFloors.accentUses}`)
  if (floors.accentSoftUses !== expFloors.accentSoftUses) errors.push(`var(--accent-soft) 사용 수 ${floors.accentSoftUses} != ${expFloors.accentSoftUses}`)
  if (floors.scannedFiles < expFloors.scannedFiles) errors.push(`스캔 파일 수 ${floors.scannedFiles} < floor ${expFloors.scannedFiles}`)

  if (errors.length > 0) return { ok: false, errors, findings, floors }
  return { ok: findings.length === 0, errors: [], findings, floors, anchorMap, brandBand }
}

// ════════════════════════════════════════════════════════════════════════
// G2 — 대비 (양방향)
// ════════════════════════════════════════════════════════════════════════

const AA_THRESHOLD = 4.5

/** 방향 A — 6개 고정 짝(brand vs bg/bg-2/panel/panel-2/code-bg/accent-soft).
 *  반환의 `structuralErrors` 는 exit 2(구조 오류) 대상, `errors` 는 exit 1(콘텐츠 위반/findings) 대상 —
 *  호출자가 각각 다른 누적 배열로 분리해 push 한다. */
function checkDirectionA(mainRootProps, accentSoftResolved, knownViolations, forceHardFail) {
  const brand = mainRootProps.brand // alias for --accent resolved value
  const pairs = [
    { key: 'brand-bg', bg: mainRootProps.bg },
    { key: 'brand-bg-2', bg: mainRootProps['bg-2'] },
    { key: 'brand-panel', bg: mainRootProps.panel },
    { key: 'brand-panel-2', bg: mainRootProps['panel-2'] },
    { key: 'brand-code-bg', bg: mainRootProps['code-bg'] },
    { key: 'brand-accent-soft', bg: accentSoftResolved },
  ]
  const validKeys = new Set(pairs.map((p) => p.key))
  // ratio 를 pair 당 한 번만 계산 — "해석 불가(null)" 와 "대비 미달(숫자<4.5)" 을 분리한다.
  // 이전 구현은 null >= 4.5 가 false 이므로 두 사건이 같은 failing 목록에 섞여, 배경 토큰이
  // 사라지거나 리네임돼도(해석 불가) known-violation 등록 뒤에 조용히 흡수되는 fail-open 이 있었다.
  const results = pairs.map((p) => {
    const ratio = contrastRatio(brand, p.bg)
    return { key: p.key, ratio, resolved: ratio !== null, pass: ratio !== null && ratio >= AA_THRESHOLD }
  })
  const structuralErrors = []
  for (const r of results) {
    if (!r.resolved) structuralErrors.push(`${r.key}: 대비를 계산할 수 없음 — 배경 토큰 값 해석 실패(누락/리네임 가능성)`)
  }
  const failing = results.filter((r) => r.resolved && !r.pass)
  const failingKeys = new Set(failing.map((f) => f.key))
  const unresolvedKeys = new Set(results.filter((r) => !r.resolved).map((r) => r.key))

  const mode = forceHardFail ? 'hard-fail' : deriveMode(knownViolations || [])
  const errors = []
  const seenPairs = new Set()
  for (const v of knownViolations || []) {
    if (!validKeys.has(v.pair)) {
      errors.push(`known-violation ${v.pair}: 방향 A 6쌍 밖의 알 수 없는 짝`)
      continue
    }
    if (seenPairs.has(v.pair)) {
      errors.push(`known-violation ${v.pair}: 중복 등록`)
      continue
    }
    seenPairs.add(v.pair)
    if (!v.resolvedBy) errors.push(`known-violation ${v.pair}: 해소 objective ID 없음`)
    // 🔴 stale waiver — 등록된 짝이 더 이상 실제로 미달이 아니면(=대비가 이미 고쳐졌으면) 등록을
    //    방치하는 것 자체가 findings. 이 검사가 없으면 02 가 색을 바꿔 대비를 고친 뒤 등록 해제를
    //    깜빡해도 영구히 warn 모드로 남아 hard-fail 전환(§4-8 "2단계 전환")이 침묵 속에 무산된다.
    //    unresolvedKeys(배경 토큰 해석 실패)는 제외 — 그 경우는 이미 위 structuralErrors 에
    //    "대비를 계산할 수 없음"으로 잡힌다. 여기서도 중복으로 잡으면 "해석 불가"와 "고쳐서 통과"가
    //    같은 메시지로 뭉뚱그려져 원인 파악이 흐려진다(라운드 2 크로스 리뷰 WARNING).
    if (mode === 'warn' && !failingKeys.has(v.pair) && !unresolvedKeys.has(v.pair)) {
      errors.push(`known-violation ${v.pair}: 더 이상 대비 미달이 아님 — 등록 해제 필요 (stale waiver)`)
    }
  }
  if (mode === 'warn') {
    for (const f of failing) {
      if (!seenPairs.has(f.key)) errors.push(`미등록 대비 미달: ${f.key} (${f.ratio})`)
    }
  } else {
    // hard-fail 모드: 등록 여부와 무관하게 미달 짝 전부가 findings
    for (const f of failing) errors.push(`대비 미달(hard-fail): ${f.key} (${f.ratio})`)
  }
  return { mode, results, failing, structuralErrors, errors, warnCount: mode === 'warn' ? failing.length : 0 }
}

/** deriveMode — 순수 함수. 플래그가 아니라 등록 배열 길이에서 파생. */
function deriveMode(violations) {
  return violations.length === 0 ? 'hard-fail' : 'warn'
}

/** `var(--name)` 1단계 참조를 mainRootProps 에서 해석. 해석 불가면 원본 그대로 반환. */
function resolveValue(raw, mainRootProps, depth = 0) {
  if (!raw || depth > 4) return raw
  const m = raw.trim().match(/^var\(\s*--([a-zA-Z0-9-]+)\s*\)$/)
  if (!m) return raw
  const next = mainRootProps[m[1]]
  if (!next) return raw
  return resolveValue(next, mainRootProps, depth + 1)
}

/** 방향 B — 브랜드가 배경일 때의 잉크 심사. B-1(캐스케이드 쌍)·B-2(같은 블록, 파일 전체 스캔)·B-3(명시 열거).
 *  `mainFileText` = docs/index.html 역할(B-1/B-3 가 정의되는 곳). `b2ScanTexts` = B-2 구조 스캔 대상
 *  전체(anchor 유무 무관 — 카탈로그 col: 와 같은 이유로 line-range 가 아니라 필드 패턴으로 식별한다).
 *  `pgText` = index-v2.html 역할(B-3c~e, playground 버튼 3규칙이 정의되는 곳) — 없으면(undefined)
 *  해당 target 은 스킵한다(픽스처가 playground 파일을 안 줄 수 있음). */
function checkDirectionB(mainFileText, b2ScanTexts, mainRootProps, brandResolved, pgText) {
  const targets = []

  // B-1: 명시된 셀렉터 쌍(.flow .num .n 의 color × .flow .num .n.c 의 background)
  const baseColorRaw = extractDeclFromSelector(mainFileText, '.flow .num .n', 'color')
  const variantBg = extractDeclFromSelector(mainFileText, '.flow .num .n.c', 'background')
  if (baseColorRaw && variantBg && /var\(--(?:accent|brand)\)/.test(variantBg)) {
    targets.push({ id: 'B-1', hasText: true, ink: resolveValue(baseColorRaw, mainRootProps), bg: brandResolved })
  }

  // B-2: 같은 블록에 background:var(--brand|accent) + color:#hex 리터럴 (구조 스캔, 파일 전체)
  let b2Index = 0
  for (const text of b2ScanTexts) {
    const blockRe = /([^{}]+)\{([^{}]*)\}/g
    let bm
    while ((bm = blockRe.exec(text))) {
      const body = bm[2]
      const hasBrandBg = /background\s*:\s*var\(--(?:brand|accent)\)/.test(body)
      const colorMatch = body.match(/color\s*:\s*(#[0-9a-fA-F]{3,6})/)
      if (hasBrandBg && colorMatch) {
        b2Index++
        targets.push({ id: `B-2:${b2Index}:${bm[1].trim()}`, hasText: true, ink: colorMatch[1], bg: brandResolved })
      }
    }
  }

  // B-3: 명시 열거 (파서 범위 밖 — 인라인/JS 조립 스타일)
  // B-3a: 텍스트 없는 dot span (:512 부근) — 잉크 심사 제외, 스캔 대상으로만 존재 확인
  if (/<span class="dot" style="background:var\(--accent\)">/.test(mainFileText)) {
    targets.push({ id: 'B-3a-dot', hasText: false })
  }
  // B-3b: 티커 이니셜(:758 부근) — 텍스트 있음. 브랜드 배경은 ce-falsy 폴백 분기 하나뿐이다
  // (카탈로그의 ce.col 은 네트워크별 임의 hex 라 브랜드가 아니다). m15-02-02 재수정: 최초 구현은
  // `.net-ico` 클래스 기본 잉크 자체를 on-brand 로 바꿔 카탈로그 30여 항목(임의 hex 배경)의 대비를
  // 붕괴시켰다(로컬 크로스 리뷰가 잡음, 예: on-brand on 흑색 배경 ~1.2:1). 지금은 클래스 기본값이
  // 다시 `#fff`이고, ce-falsy 분기만 인라인으로 on-brand 잉크를 덧씌운다 — 그래서 클래스 선언이
  // 아니라 그 인라인 조건부 리터럴의 존재를 확인한다.
  const netIcoInlineInkPresent = /ce\s*\?\s*''\s*:\s*';color:var\(--on-brand\)'/.test(mainFileText.replace(/\s+/g, ' '))
  if (netIcoInlineInkPresent && /col\s*=\s*ce\s*\?\s*ce\.col\s*:\s*'var\(--accent\)'/.test(mainFileText.replace(/\s+/g, ' '))) {
    targets.push({ id: 'B-3b-ticker', hasText: true, ink: resolveValue('var(--on-brand)', mainRootProps), bg: brandResolved })
  }
  // B-3c~e: playground(index-v2.html) 버튼 3규칙 — 각각 같은 규칙 안에 background:var(--brand|accent)
  // 와 color:var(--on-brand) 를 함께 선언한다(m15-02-02). B-2 가 안 잡는 이유: B-2 는 리터럴
  // hex ink 만 구조 스캔한다(하드코딩 금지 원칙상 여기 ink 는 var() 다 — B-2 의 정규식이 원천적으로
  // var() 를 대상으로 안 한다). 그래서 B-1/B-3b 와 같은 명시 열거로 다룬다.
  if (pgText) {
    const pgButtonSelectors = ['#btn-connect', '#btn-send', '#log-toolbar button.active']
    for (const sel of pgButtonSelectors) {
      const bg = extractDeclFromSelector(pgText, sel, 'background')
      const ink = extractDeclFromSelector(pgText, sel, 'color')
      if (ink && bg && /var\(--(?:accent|brand)\)/.test(bg)) {
        targets.push({ id: `B-3-pg:${sel}`, hasText: true, ink: resolveValue(ink, mainRootProps), bg: brandResolved })
      }
    }
  }

  // G2-C: `.net-ico` 클래스 기본 잉크 회귀 가드 (2026-08-13, 로컬 크로스 리뷰 렌즈2 실결함).
  // 카탈로그 ~30개 항목은 배경이 브랜드가 아니라 카탈로그가 주입하는 임의 hex(JS 조립)라, 클래스
  // 기본 색이 브랜드 잉크(--on-brand)로 승격되면 즉시 대비가 붕괴한다(예: on-brand on 흑색 배경
  // ~1.2:1). 브랜드 배경이 확정되는 곳은 B-3b 의 인라인 분기 하나뿐이므로, 클래스 선언 자체는
  // 브랜드 잉크를 전제할 수 없다는 것이 인바리언트다.
  // 🔴 targets 에는 넣지 않는다 — B-1~B-3 은 "짝이 있으면 그 짝의 대비를 잰다"지만 이건 "이 짝을
  // 만들면 안 된다"는 구조 규칙이라 형식이 다르고, targets.length 는 REPO_DIRECTION_B_FLOOR(==6,
  // T-R-11)가 그대로 참조하므로 여기 얹으면 그 카운트가 흔들린다.
  const classGuardViolations = []
  const netIcoClassColor = extractDeclFromSelector(mainFileText, '.net-ico', 'color')
  if (netIcoClassColor) {
    const resolvedClassColor = normalizeHex(resolveValue(netIcoClassColor, mainRootProps))
    const resolvedOnBrand = normalizeHex(resolveValue('var(--on-brand)', mainRootProps))
    if (resolvedClassColor && resolvedOnBrand && resolvedClassColor === resolvedOnBrand) {
      classGuardViolations.push(
        'G2-C 위반: .net-ico 클래스 기본 color 가 --on-brand — 카탈로그가 주입하는 임의 배경 위에서 ' +
          '대비 붕괴 위험(브랜드 배경은 B-3b 인라인 분기에서만 확정된다)'
      )
    }
  }

  const judged = targets.filter((t) => t.hasText)
  const failing = judged.filter((t) => contrastRatio(t.ink, t.bg) < AA_THRESHOLD)
  return { targets, judged, failing, classGuardViolations }
}

/** styleText 안에서 `SELECTOR{...}` (정확 문자열 매치) 블록의 특정 선언값을 추출. */
function extractDeclFromSelector(styleText, selector, decl) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(escaped.replace(/\\ /g, '\\s+') + '\\s*\\{([^}]*)\\}')
  const m = styleText.match(re)
  if (!m) return null
  const declRe = new RegExp(decl + '\\s*:\\s*([^;]+);?')
  const dm = m[1].match(declRe)
  return dm ? dm[1].trim() : null
}

// ════════════════════════════════════════════════════════════════════════
// G3 — 해석 스냅샷
// ════════════════════════════════════════════════════════════════════════

/** `--accent-soft` 의 원본 선언 문자열(`color-mix(in srgb,var(--brand) N%,var(--bg))`)에서 N 을 파싱.
 *  🔴 하드코딩 25 를 쓰지 않는다 — 그러면 비율을 뮤테이션해도(T-G-03a/b) 스냅샷이 실제 파일을 안 보고
 *  항상 같은 값을 재계산해 뮤테이션이 no-op 이 된다. */
function parseColorMixPercent(rawDecl) {
  if (!rawDecl) return null
  const m = rawDecl.match(/color-mix\([^,]*,\s*var\(--brand\)\s*(\d+(?:\.\d+)?)%/)
  return m ? parseFloat(m[1]) : null
}

function resolveSnapshot(anchorMap, mainRootProps) {
  const snapshot = {}
  for (const key of ANCHOR_KEYS) snapshot[key] = normalizeHex(anchorMap[key])
  // 🔴 --accent 는 anchorMap.brand 를 그대로 복사하지 않고 실제 선언(`mainRootProps.accent`,
  //    보통 `var(--brand)`)을 resolveValue 로 해석한다. 전에는 별칭이 끊겨도(예: `--accent:#2e8bfd`
  //    로 직접 하드코딩) 스냅샷이 항상 anchorMap.brand 값을 재계산해 tautological 하게 통과했다 —
  //    거울상 짝 `--accent-soft`(바로 아래)는 이미 원본 선언을 파싱해서 가드되고 있었다.
  snapshot.accent = normalizeHex(resolveValue(mainRootProps.accent, mainRootProps))
  const pct = parseColorMixPercent(mainRootProps['accent-soft'])
  snapshot['accent-soft'] = pct === null ? null : colorMixSrgb(anchorMap.brand, pct, mainRootProps.bg)
  return snapshot
}

// 🔴 m15-02-02 — 라임 전환으로 이 기준값을 다시 베이스라인한다. 리브랜드 자체가 --accent-soft
// 파생값을 바꾸는 게 목적이므로 옛 퍼플 기준(#251b4d)을 그대로 두면 이 불변식이 매번 FAIL한다
// (이 축의 목적은 "브랜드가 고정" 이라는 전제가 아니라 "color-mix 공식/비율이 조용히 안 깨진다"
// 는 것 — 리브랜드 시 새 브랜드의 실측값으로 재기준한다).
const ACCENT_SOFT_TARGET = '#2f4314'
const ACCENT_SOFT_MAX_DELTA = 3

function withinDelta(hexA, hexB, maxDelta) {
  const a = parseHex(hexA)
  const b = parseHex(hexB)
  if (!a || !b) return false
  return Math.max(...a.map((v, i) => Math.abs(v - b[i]))) <= maxDelta
}

/** accentSoftCheck = {target, maxDelta} | null. 실제 리포는 항상 §4-3 의 역사적 기준값(#251b4d)을
 *  쓴다. fixture 는 자신의 팔레트가 그 기준과 무관하면(예: 라임/근백색 합성 팔레트) 이 축을 생략할 수
 *  있다 — 무관한 팔레트에 고정 기준값을 강제하면 그 자체가 오탐이 된다. */
function runG3(anchorMap, mainRootProps, committedSnapshot, accentSoftCheck) {
  const errors = []
  const live = resolveSnapshot(anchorMap, mainRootProps)
  const entries = [...ANCHOR_KEYS, 'accent', 'accent-soft']
  if (entries.length !== 11) errors.push('스냅샷 엔트리 수가 11이 아님 (구현 오류)')
  for (const key of entries) {
    if (!committedSnapshot || normalizeHex(committedSnapshot[key]) !== live[key]) {
      errors.push(`스냅샷 불일치: ${key} 실측=${live[key]} vs 커밋된 스냅샷=${committedSnapshot ? committedSnapshot[key] : '(없음)'}`)
    }
  }
  if (accentSoftCheck) {
    const deltaOk = withinDelta(live['accent-soft'], accentSoftCheck.target, accentSoftCheck.maxDelta)
    if (!deltaOk) {
      errors.push(`--accent-soft 근사 불변 위반: ${live['accent-soft']} vs 목표 ${accentSoftCheck.target} (허용 ±${accentSoftCheck.maxDelta})`)
    }
  }
  return { ok: errors.length === 0, errors, live }
}

// ════════════════════════════════════════════════════════════════════════
// 실제 리포 상수 (기본 실행 모드)
// ════════════════════════════════════════════════════════════════════════

// 🔴 m15-02-02 — 이전(docs 11건 + index-v2.html 4건)은 전부 옛 퍼플 hue 밴드에 우연히 걸려
// 등록됐던 값이다: docs 11건은 SVG 다이어그램/로고 장식색(§3 비스코프 · m15-02-01 §4-4),
// index-v2.html 의 `#c4b5fd`(로그 패널 텍스트)·`#312e63`(--pg-selected)도 옛 인디고/퍼플 hue가
// 우연히 밴드 안이었을 뿐이다. `#4f46e5`/`#4338ca`는 이 커밋에서 var(--brand)/var(--brand-600)
// 로 실제 전환되어 리터럴 자체가 사라졌다. 라임으로 밴드가 옮겨가며(hue ~80-90도) 전부 밴드
// 밖으로 나가 실측이 0으로 떨어졌다 — 등록을 전부 지운다(REPO_G1_PAST_GENERATIONS 가 옛 9값
// 리터럴 자체의 잔여는 별도로 계속 잡는다). 현재 두 파일 모두 등록이 필요한 항목이 없다.
// 🔴 favicon 데이터 URI 는 **CSS 토큰을 쓸 수 없다** — 독립 SVG 문서라 `var(--brand)` 가 해석되지
//    않는다. 그래서 브랜드 값을 하드코딩할 수밖에 없고, 여기에 명시 예외로 등록해 **다음 색 변경
//    때 반드시 눈에 띄게** 한다(양방향 대조라 값이 바뀌면 즉시 불일치로 터진다).
//    경위: 이 favicon 은 %23 인코딩이라 스캐너에 **안 보였고**, 그래서 m15-02-04 가 "보라 잔재
//    소진" 이라고 보고하는 동안 옛 보라(#6c2ef3)가 탭 아이콘에 살아 있었다(2026-08-13 R4 W-2).
//    스캐너에 %23 축을 추가해 보이게 만든 뒤 등록한다 — 안 보이던 것을 보이게 하는 게 먼저다.
const REPO_G1_EXCEPTIONS = {
  'docs/index.html': { '#90e01f': 1 }, // favicon 데이터 URI(로고 심볼). CSS 토큰 사용 불가
}
// 🔴 옛 퍼플 밴드에 우연히 걸렸던 카탈로그 col: 항목(Ethereum/Ravencoin/Solana/Cosmos/Stellar/
// Stacks)도 라임 밴드 밖으로 나가 실측 0 — 6 을 그대로 두면 즉시 불일치.
const REPO_G1_CATALOG_EXEMPT = { 'docs/index.html': 0 }
// 🔴 m15-02-02 — index-v2.html 이 자체 BRAND-ANCHOR :root 블록(9토큰)을 신설하며 rootBlocks +1(4→5).
// 🔴 **숫자는 아래 상수만이 출처다** (2026-08-13 R4 W-3). 초판 주석은 "docs 38 + index-v2 16 = 54"
//    였는데 m15-02-04 가 `--purple` 을 은퇴시켜 docs 37 · 총 53 이 됐고, accentSoftUses 도 15→16 이
//    됐는데 주석만 옛 숫자에 멈춰 stale 이 됐다. 하필 같은 라운드에 형제 스크립트 docstring 에
//    "숫자를 두 곳에 적으면 한쪽이 반드시 stale 이 된다" 고 써 넣고서 여기서 그대로 재현했다.
//    ⇒ 여기엔 **무엇이 세어지는지(산문)만** 적는다. 실측은 스크립트 출력으로 확인한다.
//    customProps = docs/index.html 의 커스텀 프로퍼티 + index-v2.html(pg 토큰 + BRAND-ANCHOR 9토큰).
// 관례: REPO_G1_FLOORS 는 항상 실측과 일치시킨다("신설분을 지키지 못하는" 여유를 안 둔다).
const REPO_G1_FLOORS = { rootBlocks: 5, customProps: 53, accentUses: 21, accentSoftUses: 16, scannedFiles: 2 }
// 🔴 m15-02-02 — 01 의 3(docs: B-1 쌍 · B-3a-dot · B-3b-ticker) + playground 버튼 3규칙
// (#btn-connect/#btn-send/#log-toolbar button.active, index-v2.html) = 6.
const REPO_DIRECTION_B_FLOOR = 6
// 🔴 위반 fixture 모수 floor (epic 크로스 리뷰 W1) — 실측 일치. 형제 스크립트와 같은 조항.
const REPO_VIOL_FIXTURE_FLOOR = 23

// 🔴 과거 세대 앵커 값 — 브랜드 색을 다시 교체할 때(다음 리브랜드) 이 배열에 "직전 세대 9값"을
//    통째로 추가해야 G1 이 그 세대의 잔여 리터럴을 계속 잡는다. 현재 앵커(9값)는 교체 순간
//    exactSet 에서 자동으로 빠지고 새 hue 밴드 밖으로도 나가므로, 여기 등록하지 않으면 이전 세대
//    리터럴은 어떤 게이트에도 영원히 안 걸린다. 01 시점엔 이전 세대가 없어 빈 배열이었다.
//    m15-02-02(라임 전환)가 첫 리브랜드라 여기서 옛 퍼플 9값을 채운다.
//    갱신 절차: docs/brand-color-replacement.md.
const REPO_G1_PAST_GENERATIONS = [
  {
    'brand-100': '#E2E1FD', 'brand-200': '#927DFF', 'brand-400': '#C7C3FB',
    brand: '#7231ff', 'brand-600': '#6422E6', 'brand-900': '#22003C',
    'brand-ink': '#4F46E5', 'brand-ink-lite': '#ABA2FE', 'on-brand': '#0B0E14',
  },
]

// 🔴 m15-02-02 — 등록 0건 ⇒ deriveMode([]) 가 'hard-fail' 로 자동 전환(플래그 조작 없음, §4-8).
// 01 이 등록했던 6쌍(brand-bg/brand-bg-2/brand-panel/brand-panel-2/brand-code-bg/
// brand-accent-soft)은 라임 전환으로 전부 해소되어(§4 "대비" 표) 등록을 지운다.
const REPO_KNOWN_CONTRAST_VIOLATIONS = []

function mainRootPropsOf(anchorFileAnalysis) {
  // 파일 안의 모든 :root 블록을 문서 순서대로 병합해 하나의 맵으로 (마지막 선언이 이긴다 — CSS
  // cascade 와 동일). 🔴 예전 구현은 anchorBlock.content 를 두 번(anchorProps 경유 + 직접 파싱)
  // 합쳐 사실상 no-op 이었다 — 비앵커 :root 블록(`:root{--toc-w:0px}` 류)은 전혀 안 들어갔다.
  // 지금은 우연히 `--bg`/`--panel` 등이 앵커와 같은 블록에 있어 통과했을 뿐, 다른 :root 블록에
  // G2 가 참조하는 토큰이 생기면(예: m15-02-03 의 `--pg-*`) 조용히 누락됐을 것이다.
  const merged = {}
  for (const block of anchorFileAnalysis.rootBlocks) {
    for (const [k, v] of parseCustomProps(block.content)) merged[k] = v
  }
  return merged
}

function loadRepoSpec() {
  const docsPath = resolve(REPO_ROOT, 'docs/index.html')
  const pgPath = resolve(REPO_ROOT, 'index-v2.html')
  const docsText = readFileSync(docsPath, 'utf8')
  const pgText = existsSync(pgPath) ? readFileSync(pgPath, 'utf8') : null
  const files = [{ key: 'docs/index.html', text: docsText }]
  if (pgText !== null) files.push({ key: 'index-v2.html', text: pgText })
  return {
    files,
    anchorFile: 'docs/index.html',
    exceptions: REPO_G1_EXCEPTIONS,
    catalogExempt: REPO_G1_CATALOG_EXEMPT,
    floors: REPO_G1_FLOORS,
    pastGenerations: REPO_G1_PAST_GENERATIONS,
    docsText,
    pgText,
  }
}

function loadCommittedSnapshot() {
  const p = join(FIXTURES_ROOT, 'resolved.snapshot.json')
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))
}

// ════════════════════════════════════════════════════════════════════════
// 실행 — 실제 리포
// ════════════════════════════════════════════════════════════════════════

function runReal({ forceHardFailA = false } = {}) {
  const spec = loadRepoSpec()
  const g1 = runG1(spec)
  const lines = []
  const errors = [...g1.errors]
  const findings = [...g1.findings]

  if (g1.errors.length > 0) {
    return { exit: 2, lines: [], errors, findings }
  }

  const docsAnalysis = analyzeFile(spec.docsText)
  const mainRootProps = mainRootPropsOf(docsAnalysis)

  const accentSoftResolved = colorMixSrgb(mainRootProps.brand, 25, mainRootProps.bg)
  const dirA = checkDirectionA(mainRootProps, accentSoftResolved, REPO_KNOWN_CONTRAST_VIOLATIONS, forceHardFailA)
  // 배경 토큰 해석 실패는 구조 오류(exit 2), 대비 미달/등록 불일치는 콘텐츠 위반(exit 1).
  errors.push(...dirA.structuralErrors)
  findings.push(...dirA.errors)

  const b2ScanTexts = [spec.docsText]
  if (spec.pgText !== null) b2ScanTexts.push(spec.pgText)
  const dirB = checkDirectionB(spec.docsText, b2ScanTexts, mainRootProps, mainRootProps.brand, spec.pgText)
  if (dirB.targets.length < REPO_DIRECTION_B_FLOOR) {
    errors.push(`방향 B 검사 대상 수 ${dirB.targets.length} < floor ${REPO_DIRECTION_B_FLOOR}`)
  }
  if (dirB.targets.length !== REPO_DIRECTION_B_FLOOR) {
    findings.push(`방향 B 검사 대상 수 ${dirB.targets.length} != 기대 ${REPO_DIRECTION_B_FLOOR} (02 시점)`)
  }
  findings.push(...dirB.failing.map((f) => `방향 B 대비 미달: ${f.id}`))
  findings.push(...dirB.classGuardViolations)

  const committedSnapshot = loadCommittedSnapshot()
  const g3 = runG3(mainRootProps, mainRootProps, committedSnapshot, { target: ACCENT_SOFT_TARGET, maxDelta: ACCENT_SOFT_MAX_DELTA })
  findings.push(...g3.errors)

  if (errors.length > 0) return { exit: 2, lines: [], errors, findings }

  const exit = findings.length > 0 ? 1 : 0

  lines.push(`scanned-files: ${g1.floors.scannedFiles}`)
  lines.push(`accent-uses: ${g1.floors.accentUses}`)
  lines.push(`accent-soft-uses: ${g1.floors.accentSoftUses}`)
  lines.push(`known-violations: ${REPO_KNOWN_CONTRAST_VIOLATIONS.length}`)
  lines.push(`contrast-warnings: ${dirA.mode === 'warn' ? dirA.warnCount : 0}`)
  lines.push(`mode: ${dirA.mode}`)

  return { exit, lines, errors, findings, dirA, dirB, g3 }
}

// ════════════════════════════════════════════════════════════════════════
// 픽스처 하네스
// ════════════════════════════════════════════════════════════════════════

/**
 * 픽스처 디렉터리 규약:
 *   index.html        (필수) — docs/index.html 역할의 합성 파일
 *   playground.html   (선택) — index-v2.html 역할
 *   manifest.json      (필수) — { anchorFile, exceptions, catalogExempt, floors, directionBFloor,
 *                                 knownViolations, snapshot, forceHardFailA, pastGenerations }
 *   expected-exit      (필수) — 기대 exit code
 */
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

  const files = []
  for (const f of manifest.files) {
    const p = join(dir, f.path)
    if (!existsSync(p)) {
      // ABSENT 를 고정하는 fixture (구조 오류 케이스)
      files.push({ key: f.key, text: null, missing: true })
      continue
    }
    files.push({ key: f.key, text: readFileSync(p, 'utf8') })
  }
  if (files.length === 0) {
    console.error(`fixture 에 files 가 0개: ${dir}`)
    return 2
  }
  if (files.some((f) => f.missing)) {
    console.error(`fixture 표면 파일 누락: ${dir}`)
    return 2
  }

  const g1 = runG1({
    files,
    anchorFile: manifest.anchorFile,
    exceptions: manifest.exceptions || {},
    catalogExempt: manifest.catalogExempt || {},
    floors: manifest.floors,
    pastGenerations: manifest.pastGenerations || [],
  })

  const errors = [...g1.errors]
  const findings = [...g1.findings]
  let rc

  if (g1.errors.length > 0) {
    rc = 2
  } else {
    const anchorFileEntry = files.find((f) => f.key === manifest.anchorFile)
    const docsAnalysis = analyzeFile(anchorFileEntry.text)
    const mainRootProps = mainRootPropsOf(docsAnalysis)
    const accentSoftResolved = colorMixSrgb(mainRootProps.brand, 25, mainRootProps.bg)

    const knownViolations = manifest.knownViolations || []
    const dirA = checkDirectionA(mainRootProps, accentSoftResolved, knownViolations, !!manifest.forceHardFailA)
    // 배경 토큰 해석 실패는 구조 오류(exit 2), 대비 미달/등록 불일치는 콘텐츠 위반(exit 1).
    errors.push(...dirA.structuralErrors)
    findings.push(...dirA.errors)

    const styleText = anchorFileEntry.text
    const b2ScanTexts = files.map((f) => f.text)
    // playground 역할 파일 = anchorFile 이 아닌 첫 파일(픽스처는 최대 2파일 관례 — index.html +
    // playground.html/index-v2.html). 없으면 undefined — checkDirectionB 가 B-3c~e 를 스킵한다.
    const pgEntry = files.find((f) => f.key !== manifest.anchorFile)
    const dirB = checkDirectionB(styleText, b2ScanTexts, mainRootProps, mainRootProps.brand, pgEntry ? pgEntry.text : undefined)
    const dbFloor = manifest.directionBFloor ?? 0
    if (dirB.targets.length < dbFloor) errors.push(`방향 B 대상 수 ${dirB.targets.length} < floor ${dbFloor}`)
    findings.push(...dirB.failing.map((f) => `방향 B 대비 미달: ${f.id}`))
    findings.push(...dirB.classGuardViolations)

    if (manifest.snapshot) {
      const g3 = runG3(mainRootProps, mainRootProps, manifest.snapshot, manifest.accentSoftCheck || null)
      findings.push(...g3.errors)
    }

    rc = errors.length > 0 ? 2 : findings.length > 0 ? 1 : 0
  }

  if (rc === expected) {
    console.log(`  ✓ ${dir.split('/').pop()}  (exit ${rc})`)
    return 0
  }
  console.log(`  ✗ ${dir.split('/').pop()}  expected exit ${expected}, got ${rc}`)
  for (const e of errors) console.log(`      ERROR: ${e}`)
  for (const f of findings) console.log(`      FINDING: ${f}`)
  return 1
}

/** fixture 루트의 하위 디렉터리 목록을 열거. 루트 부재/0건이면 exit-2 사유와 함께 null 반환.
 *  (T-G-07a 가 이 함수를 임시 빈 디렉터리에 대해 직접 호출해 "비우면 exit 2" 를 능동 검증한다.) */
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
  // 🔴 **위반 fixture 모수 floor** (2026-08-13 epic 크로스 리뷰 W1) — 형제 스크립트
  //    check-playground-surface.mjs 와 같은 조항. `rm -rf tests/fixtures/*/viol*` 한 줄로
  //    위반 fixture 23개를 전부 지워도 exit 0 이었다. 정상 fixture 만으로는 "게이트가 무언가를
  //    잡는다" 를 보장하지 못한다 — 아무것도 안 잡아도 정상 fixture 는 통과하기 때문이다.
  const violCount = dirs.length - okCount
  if (violCount < REPO_VIOL_FIXTURE_FLOOR) {
    console.error(`위반 fixture 가 ${violCount}건 (floor ${REPO_VIOL_FIXTURE_FLOOR} 미만 — 검출력 증명이 사라졌다)`)
    return 2
  }
  console.log(`fixtures: ${dirs.length}건 (정상 ${okCount}건 · 위반 ${violCount}건)`)

  // ── T-U-03: contrastRatio 골든 케이스 (bridge 형제와 같은 골든값·반올림 자릿수) ──
  if (contrastRatio('#FFFFFF', '#000000') !== 21) {
    console.error(`T-U-03 실패: contrastRatio(#FFFFFF,#000000) = ${contrastRatio('#FFFFFF', '#000000')} != 21`)
    fail = 1
  } else {
    console.log('T-U-03 OK: contrastRatio(#FFFFFF,#000000) = 21.00')
  }

  // ── T-U-01/02: 앵커 9키 파싱 + 여러 :root 중 --brand 를 가진 블록 선택 (다중 :root 합성 텍스트) ──
  {
    const multiRootText = `:root{--toc-w:0px}\n:root{\n${ANCHOR_KEYS.map((k, i) => `--${k}:#${(i + 1).toString(16).padStart(6, '0')};`).join('\n')}\n}\n:root{--sidebar-w:0px}`
    const a = analyzeFile(multiRootText)
    const okAnchor = a.anchorBlock && a.rootBlocks.length === 3 && ANCHOR_KEYS.every((k) => a.anchorProps[k])
    if (!okAnchor) {
      console.error(`T-U-01/02 실패: 3개 :root 중 --brand 를 가진 블록을 정확히 못 골랐음`)
      fail = 1
    } else {
      console.log('T-U-01/02 OK: 다중 :root 블록에서 --brand 보유 블록을 정확히 선택 + 9키 전수 파싱')
    }
  }

  // ── T-G-07a: fixture 디렉터리를 비우면 exit 2. 실제 --test 진입점(listFixtureDirsOrNull)을
  //    임시 빈 디렉터리에 직접 호출해 "되돌리면(=비우면) 잡힌다"를 능동 검증한다. ──
  {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'brand-tokens-empty-'))
    try {
      const result = listFixtureDirsOrNull(tmpRoot, { silent: true })
      if (result !== null) {
        console.error(`T-G-07a 실패: 빈 fixture 디렉터리인데 listFixtureDirsOrNull 이 null 을 반환하지 않음 (${JSON.stringify(result)})`)
        fail = 1
      } else {
        console.log('T-G-07a OK: 빈 fixture 루트 → listFixtureDirsOrNull 이 null 반환 (실제 --test 진입점이 이 경우 exit 2)')
      }
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  }

  // ── deriveMode 순수 함수 자기검증 (m15-02-02 — REPO_KNOWN_CONTRAST_VIOLATIONS 는 이제 항상
  //    빈 배열이라 "등록 있음" 케이스는 그 상수에 기대지 않고 리터럴로 준다. 순수 함수 검증을
  //    리포 상수의 값(0건)에 결합하면 상수가 항상 []인 지금은 "6건일 때" 분기를 영원히 실행
  //    못 한다) ──
  const modeEmpty = deriveMode([])
  const modeWithViolations = deriveMode([{ pair: 'brand-bg', resolvedBy: 'test' }])
  if (modeEmpty !== 'hard-fail' || modeWithViolations !== 'warn') {
    console.error(`deriveMode 자기검증 실패: deriveMode([])=${modeEmpty}, deriveMode(1건)=${modeWithViolations}`)
    fail = 1
  } else {
    console.log('deriveMode self-test OK: deriveMode([])=hard-fail, deriveMode(1건)=warn')
  }

  // ── T-G-04: 실제 docs/index.html 을 hard-fail 모드로 강제 실행해도 방향 A 6쌍이 전부
  //    통과(0건 미달)하는지 확인 (m15-02-02 — 라임 전환으로 6쌍 모두 AA 통과, 등록 0건이라
  //    실제 모드도 이미 hard-fail 이지만 강제 플래그로 한 번 더 고정한다) ──
  const real = runReal({ forceHardFailA: true })
  const hardFailFindings = (real.findings || []).filter((f) => f.includes('hard-fail'))
  if (real.exit !== 0 || hardFailFindings.length !== 0) {
    console.error(`T-G-04 실패: 실제 docs/index.html 을 hard-fail 모드로 돌렸는데 방향 A 미달이 남아있음 (검출 ${hardFailFindings.length}건, exit ${real.exit})`)
    console.error(JSON.stringify(real, null, 2))
    fail = 1
  } else {
    console.log('T-G-04 OK: hard-fail 모드에서 실제 docs/index.html 의 방향 A 6쌍 전부 통과 (exit 0)')
  }

  // ── 실제 리포 스캔 (hard-fail 모드, 등록 0건으로 자동 전환) — 기계 판독 라인 출력 형식 자기검증 ──
  const realWarn = runReal()
  if (realWarn.exit !== 0) {
    console.error('실제 리포 스캔(hard-fail 모드)이 exit 0 이 아님')
    console.error(JSON.stringify(realWarn, null, 2))
    fail = 1
  } else {
    for (const line of realWarn.lines) console.log(line)
    const required = [/^scanned-files: \d+$/, /^accent-uses: 21$/, /^accent-soft-uses: 16$/, /^known-violations: 0$/, /^contrast-warnings: 0$/, /^mode: hard-fail$/]
    for (const re of required) {
      if (!realWarn.lines.some((l) => re.test(l))) {
        console.error(`기계 판독 출력 형식 불일치: ${re} 매칭 라인 없음`)
        fail = 1
      }
    }
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
  const idx = args.indexOf('--fixture')
  const dir = args[idx + 1]
  if (!dir) {
    console.error('Usage: check-index-html-brand-tokens.mjs --fixture <dir>')
    process.exit(2)
  }
  process.exit(runFixture(resolve(dir)))
} else {
  const result = runReal()
  for (const line of result.lines) console.log(line)
  for (const e of result.errors) console.error(`ERROR: ${e}`)
  for (const f of result.findings) console.error(`FINDING: ${f}`)
  if (result.exit === 0) {
    console.log(`brand-tokens OK (${result.dirA ? result.dirA.mode : 'n/a'} mode)`)
  }
  process.exit(result.exit)
}
