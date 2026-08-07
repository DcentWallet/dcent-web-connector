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
 * 🔴 그리고 "찾은 것의 모양"만 보지 않는다 — **모수(母數)에 floor** 를 건다. 모양만 보면
 *    "보호 대상을 지우면 초록"이 성립하고(체인 삭제 / `fw` 키 삭제 / `<thead>` 통째 삭제),
 *    그게 빨간 게이트를 만난 사람이 실제로 택하는 경로다. 크로스 리뷰 R1 에서 이 클래스로
 *    6종의 뮤테이션이 전부 통과했다(M11~M16).
 *
 * ⚖️ **이 게이트의 범위 — 실수를 막고, 의도적 우회는 막지 않는다** (크로스 리뷰 R2 판정).
 *    floor 는 "총량"을 보지 identity 를 보지 않는다. 그래서 원리적으로는 우회가 가능하다:
 *    메서드 행을 지우는 대신 **중복 이름으로 치환**해 60행을 유지하거나, 체인 표시명을
 *    allowlist 의 다른 이름으로 **rename 하면서 동시에 원래 그 이름 행에 fw 를 보충**하면 통과한다.
 *    그 상태까지 막으려면 체인별 메서드 집합을 상수로 박아 exact 비교해야 하는데, 체인·메서드가
 *    추가될 때마다 상수를 갱신해야 해 상시 유지보수 비용이 붙는다. 이 게이트가 막으려는 것은
 *    **"2모델 전환을 부분적으로만 하는 실수"** 이고 위 경로는 실수로 도달하지 않으므로,
 *    비용 대비 이득이 맞지 않아 **의도적으로 범위 밖에 둔다.** 우회하려면 floor 상수나 allowlist 를
 *    함께 고쳐야 하고, 그건 diff 에 드러나 사람 리뷰가 본다.
 *
 * objective m09-04-28 테스트 항목 매핑:
 *   T-DOC-MODEL-01 → (a) FWREQ 전수      T-DOC-MODEL-02 → (b) MATRIX(fw 보유 행)
 *   T-DOC-MODEL-03 → (c)/(d)/(e) EN·KO 4블록 + Min FW 헤더 2개 + 동적 렌더러
 *   T-DOC-MODEL-04 → 뮤테이션 검출(이 스크립트를 대상으로 objective §8 3번 명령이 수행)
 *   T-DOC-SYNC-01  → `yarn check:docs` 체인에 배선됨
 *
 * 검사 5종:
 *   (a) FWREQ — 전 체인 × 전 메서드 행의 값이 `{bio, x}` 두 키를 non-empty 로 보유
 *              + 체인/행 수 floor (삭제로 초록 만들기 차단)
 *   (b) MATRIX — `fw` 키가 있는 행은 `{bio, x}` 필수. `fw` 부재는 **allowlist 안에서만** 허용
 *              (지금도 `—` 로 렌더되는 11행) + 행 수·검사 행 수 floor
 *   (b2) FWNOTE — 체인별 note 8건의 EN/KO 가 "어느 모델 기준인지" 를 밝히는가
 *   (c) 하드코딩 Requirements/요구사항 블록 — EN/KO **각각** 두 모델 이름 보유.
 *       블록 containment 뿐 아니라 **DOM 파싱 후 조각 단위**(`thead` / `.rq` 카드 / lead 산문)로 본다.
 *       정규식으로 자르지 않는 이유: `<thead class="…">` 처럼 속성 하나만 붙어도 리터럴 매칭이
 *       전량 무력화되고 검사가 0건으로 조용히 통과한다(M12/M13).
 *       기기/펌웨어 카드는 두 모델 **필수**(둘 다 지워 "your device" 로 되돌리는 회귀 차단),
 *       그 밖의 카드는 "한 모델만 말하는 상태" 금지.
 *       (EN 만 고치고 KO 를 빠뜨린 상태를 잡는 것이 이 검사의 목적 — 실사고 선례가 있다)
 *   (d) Support Matrix 표 헤더 + 하단 note 산문 — EN/KO 각각
 *   (e) 동적 렌더러 `injectFwReq` — EN/KO 각각 **실제 호출**해 `<thead>` + lead 산문 + note 렌더를 단언
 *   (f) Support Matrix **row 렌더러** — 실제 렌더한 행의 `.m-fw` 셀이 정확히 2개이고 헤더와 컬럼 수가
 *       맞는지, `[object Object]` 가 없는지 (데이터·헤더만 보면 row 렌더러 회귀를 통째로 놓친다)
 *
 * 🧭 **산문(prose)도 검사 대상이다** — 표만 지키면 "표는 2컬럼인데 설명은 단일 모델"이 남는다.
 *    설명이 오해의 1차 진입점이므로 lead·note·FWNOTE 를 표와 같은 급으로 본다 (크로스 리뷰 R2).
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

/* 🔴 모수(母數) floor — "찾은 것의 모양"만 보면 **보호 대상을 지우는 것**이 게이트를 초록으로
   만드는 가장 쉬운 길이 된다(빨간 게이트를 만난 사람이 실제로 택하는 경로다). 그래서 아래 하한을
   함께 단언한다. 값이 정당하게 늘면 이 상수를 올리는 것이 리뷰 대상이 된다 — 줄이는 쪽은 막는다.

   ※ "FWREQ 에 id 가 있는 MATRIX 행은 fw 필수" 같은 구조적 교차 단언은 **이 문서엔 성립하지 않는다**:
     Ethereum/EVM·XDC(id=chain-ethereum), BNB Beacon Chain·Coreum·Hippo(id=chain-cosmos)는 FWREQ 키를
     공유하면서도 정당하게 fw 가 없다(패밀리 페이지를 공유하는 행). 그래서 fw 부재는 **이름 allowlist**
     로 고정한다 — 가드되던 행에서 fw 를 지우면 allowlist 밖이라 즉시 실패한다. */
const MIN_FWREQ_CHAINS = 25
const MIN_FWREQ_ROWS = 60
const MIN_MATRIX_ROWS = 38
const MIN_MATRIX_FW_ROWS = 27
/** fw 가 정당하게 없는 행(= 지금도 `—` 로 렌더). MATRIX 의 `n` 은 38행 전부 고유하다. */
const MATRIX_FW_EXEMPT = new Set([
  'Ethereum / EVM',
  'XDC (XinFin)',
  'eCash',
  'Zcash',
  'Bitcoin Gold',
  'DigiByte',
  'Ravencoin',
  'Horizen',
  'BNB Beacon Chain',
  'Coreum',
  'Hippo Protocol',
])

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
  // floor — 체인/행을 **지워서** 초록을 만드는 경로를 막는다
  const chainCount = Object.keys(fwreq).length
  if (chainCount < MIN_FWREQ_CHAINS) {
    failures.push(`FWREQ 체인이 ${chainCount}개다 — 최소 ${MIN_FWREQ_CHAINS}개여야 한다(체인이 삭제됐다).`)
  }
  if (fwreqCells < MIN_FWREQ_ROWS) {
    failures.push(`FWREQ 메서드 행이 ${fwreqCells}개다 — 최소 ${MIN_FWREQ_ROWS}개여야 한다(행이 삭제됐다).`)
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
    const name = row?.n ?? row?.id ?? '(unnamed)'
    if (row?.fw === undefined) {
      // 🔴 skip 은 **allowlist 안에서만** 허용한다. 그러지 않으면 "fw 키를 지우면 검사 대상에서
      //    빠진다" 가 되어, 게이트를 초록으로 만드는 가장 쉬운 방법이 보호 대상 삭제가 된다.
      if (MATRIX_FW_EXEMPT.has(name)) matrixSkipped += 1
      else failures.push(`MATRIX "${name}" 에 fw 가 없다 — 지금까지 fw 를 갖던 행이다(삭제됐거나 오타).`)
      continue
    }
    const bad = badModelPair(row.fw)
    if (bad) failures.push(`MATRIX "${name}" fw: ${bad}`)
    else matrixChecked += 1
  }
  // floor — 행 자체를 지우는 경로를 막는다
  if (matrix.length < MIN_MATRIX_ROWS) {
    failures.push(`MATRIX 가 ${matrix.length}행이다 — 최소 ${MIN_MATRIX_ROWS}행이어야 한다(행이 삭제됐다).`)
  }
  if (matrixChecked < MIN_MATRIX_FW_ROWS) {
    failures.push(
      `MATRIX 에서 fw 를 검사한 행이 ${matrixChecked}개다 — 최소 ${MIN_MATRIX_FW_ROWS}개여야 한다(fw 가 사라졌다).`,
    )
  }
}

// ── (b2) FWNOTE — 체인별 보충 설명이 어느 모델 기준인지 밝히는가 ───────────────
// FWNOTE 의 버전(예: BSC `2.6.1`)은 전부 Biometric 라인 값이다. "어느 모델 기준"이 빠지면
// X 사용자가 자기 `1.0.0` 과 비교해 미지원으로 읽는다 — 표를 2컬럼으로 바꾼 이유와 같은 오해다.
let fwnoteChecked = 0
const fwnote = w.FWNOTE
if (fwnote === null || typeof fwnote !== 'object' || Object.keys(fwnote).length === 0) {
  failures.push('window.FWNOTE 가 비어 있다 — 문서 스크립트 실행 실패 또는 note 가 통째로 삭제됐다.')
} else {
  for (const [chainId, note] of Object.entries(fwnote)) {
    for (const lang of ['en', 'ko']) {
      const text = note?.[lang]
      if (typeof text !== 'string' || text.length === 0) {
        failures.push(`FWNOTE["${chainId}"].${lang} 가 비어 있다.`)
        continue
      }
      const absent = absentLabels(text)
      if (absent.length > 0) failures.push(`FWNOTE["${chainId}"].${lang} 에 모델 기준 표기 누락: ${absent.join(' / ')}`)
      else fwnoteChecked += 1
    }
  }
}

// ── (c) 하드코딩 Requirements / 요구사항 블록 (EN·KO 각각) ────────────────────
// 🔴 정규식으로 자르지 않는다 — `<thead class="...">` 처럼 속성 하나만 붙어도 리터럴 매칭이
//    전량 무력화되고(검사 0건 = 조용한 통과), `.rq` 카드의 끝 앵커도 뒤에 형제가 붙는 순간
//    무너진다. 문서를 이미 jsdom 으로 실행하고 있으므로 **DOM 으로 파싱**한다.
const pages = w.PAGES ?? {}
const reqBlocks = []
for (const [id, page] of Object.entries(pages)) {
  for (const field of ['html', 'ko']) {
    const src = page?.[field]
    if (typeof src !== 'string') continue
    const frag = JSDOM.fragment(src)
    for (const h2 of frag.querySelectorAll('h2')) {
      const heading = h2.textContent.trim()
      if (heading !== 'Requirements' && heading !== '요구사항') continue
      // 다음 h2 전까지의 형제를 블록으로 모은다. 원본을 옮기지 않도록 clone 해서 담는다.
      const box = frag.ownerDocument.createElement('div')
      for (let el = h2.nextElementSibling; el !== null && el.tagName !== 'H2'; el = el.nextElementSibling) {
        box.appendChild(el.cloneNode(true))
      }
      reqBlocks.push({ id, field, box })
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
/** 두 모델 중 이 조각에 없는 이름들. */
function absentLabels(text) {
  return [BIO, X].filter((label) => !text.includes(label))
}
/** 한 조각이 한 모델만 말하고 있으면 그 누락분. 둘 다 없으면 `null`(모델 무관 조각). */
function partialModelLabels(text) {
  const absent = absentLabels(text)
  return absent.length === 1 ? absent : null
}
/**
 * 두 모델을 **반드시 함께** 말해야 하는 카드의 `.k` 라벨.
 *
 * 펌웨어 카드만 넣으면 형제인 기기(Device) 카드에서 라벨을 **둘 다** 지웠을 때
 * "모델 무관 조각"으로 접혀 통과한다(크로스 리뷰 R2). 두 카드 모두 현재 dual-model 조각이므로
 * 함께 앵커한다. 그리고 **두 앵커가 각각 존재하는지**를 따로 본다 — 하나만 세면 그 카드의 `.k` 를
 * rename 하는 것만으로 그 카드가 검사에서 빠지는데, 다른 앵커가 남아 있어 fail-closed 가드가
 * 발동하지 않는다(자가 검증 M14r'').
 */
const DUAL_MODEL_CARD_ANCHORS = {
  기기: /^(Device|기기)$/,
  펌웨어: /^(Firmware|펌웨어)$/,
}
const DUAL_MODEL_CARD_KEY = /^(Firmware|펌웨어|Device|기기)$/

for (const b of reqBlocks) {
  const where = `[${b.id}.${b.field}]`
  const blockText = b.box.textContent

  // 블록 전체에 두 모델이 다 있어야 한다 (통째로 단일 모델로 되돌린 상태를 잡는다)
  const missing = absentLabels(blockText)
  if (missing.length > 0) {
    failures.push(`Requirements 블록 ${where} 에 모델 표기 누락: ${missing.join(' / ')}`)
  }

  const theads = b.box.querySelectorAll('thead')
  const cards = b.box.querySelectorAll('.rq')
  // fail-closed — 표도 카드도 없으면 아래 조각 검사가 전부 0건으로 공허하게 통과한다.
  if (theads.length === 0 && cards.length === 0) {
    failures.push(`Requirements 블록 ${where} 에 표(thead)도 카드(.rq)도 없다 — 구조가 사라졌다.`)
  }
  // 표가 있는데 헤더가 없으면(<thead> 통째 삭제) 그것도 실패다.
  if (b.box.querySelector('table') !== null && theads.length === 0) {
    failures.push(`Requirements 블록 ${where} 의 표에 <thead> 가 없다 — 모델 컬럼 검사가 성립하지 않는다.`)
  }

  // 🔴 블록 전체 containment 만으로는 부족하다 — 표 헤더에서 X 컬럼만 지워도 lead 문단에 이름이
  //    남아 블록 단위로는 통과한다. 그래서 **조각 단위**로 본다.
  for (const thead of theads) {
    const absent = absentLabels(thead.textContent)
    if (absent.length > 0) {
      failures.push(`Requirements 표 헤더 ${where} 에 모델 컬럼 누락: ${absent.join(' / ')}`)
    }
  }
  // 기기/펌웨어 카드는 **두 모델 필수**다. 라벨을 둘 다 지워 "your device" 류로 되돌리는 회귀를
  // "모델 무관 조각"으로 봐주면 안 되는 카드들이기 때문이다.
  const dualCards = [...cards].filter((c) =>
    DUAL_MODEL_CARD_KEY.test((c.querySelector('.k')?.textContent ?? '').trim()),
  )
  if (cards.length > 0) {
    // 앵커는 **각각** 있어야 한다 — 하나만 세면 그 카드의 `.k` 를 rename 하는 것만으로 검사에서
    // 빠지는데 다른 앵커가 남아 fail-closed 가 발동하지 않는다.
    for (const [anchorName, re] of Object.entries(DUAL_MODEL_CARD_ANCHORS)) {
      if (![...cards].some((c) => re.test((c.querySelector('.k')?.textContent ?? '').trim()))) {
        failures.push(`Requirements 카드 ${where} 에 ${anchorName} 카드가 없다 — 앵커가 사라졌거나 이름이 바뀌었다.`)
      }
    }
  }
  for (const card of dualCards) {
    const absent = absentLabels(card.textContent)
    if (absent.length > 0) {
      const key = (card.querySelector('.k')?.textContent ?? '').trim()
      failures.push(`Requirements ${key} 카드 ${where} 에 모델 표기 누락: ${absent.join(' / ')}`)
    }
  }
  // (g1) 표가 있는 블록은 **표를 설명하는 산문(lead)** 도 두 모델을 말해야 한다.
  //      표만 지키면 "표는 2컬럼인데 설명이 단일 모델"인 상태가 남고, 산문이 오해의 1차 진입점이다.
  if (b.box.querySelector('table') !== null) {
    const paras = [...b.box.querySelectorAll('p')]
    if (!paras.some((p) => absentLabels(p.textContent).length === 0)) {
      failures.push(`Requirements lead 산문 ${where} 에 두 모델을 함께 말하는 문단이 없다.`)
    }
  }
  // 나머지 카드는 "한 모델만 말하는 상태"만 금지 — 모델 무관 카드(브라우저/연결)는 비대상
  for (const card of cards) {
    if (dualCards.includes(card)) continue
    const partial = partialModelLabels(card.textContent)
    if (partial !== null) {
      failures.push(`Requirements 카드 ${where} 가 한 모델만 언급한다 — 누락: ${partial.join(' / ')}`)
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
  // (g2) 표 아래 note 산문 — "두 컬럼은 서로 다른 버전 라인" 설명이 사라지면 사용자는 두 값을
  //      비교 가능한 값으로 읽는다(이 objective 가 막으려는 바로 그 오해다).
  const notes = [...JSDOM.fragment(h.src).querySelectorAll('.note')]
  if (!notes.some((n) => absentLabels(n.textContent).length === 0)) {
    failures.push(`Support Matrix note 산문 [${h.id}.${h.field}] 에 두 모델을 함께 말하는 설명이 없다.`)
  }
}

// ── (e) 동적 렌더러 injectFwReq (EN·KO 각각) ─────────────────────────────────
// 🔴 노출 면적이 가장 큰 표면이다 — 이 렌더러 하나가 **FWREQ 를 가진 25개 체인 페이지 전부**의
//    Requirements 표 헤더를 만든다. 헤더 상수(`bh`/`xh`)가 비면 25페이지에서 모델 컬럼이
//    통째로 사라지는데, (a)~(d) 는 그것을 못 본다(하드코딩 4블록 + Support Matrix 2개만 본다).
//    그래서 소스 문자열이 아니라 **렌더러를 실제로 호출**해 나온 `<thead>` 를 단언한다 —
//    상수만 남고 실제 사용이 끊긴 경우까지 잡힌다.
let rendererChecked = 0
if (typeof w.injectFwReq !== 'function') {
  failures.push('window.injectFwReq 가 함수가 아니다 — 렌더러가 사라졌거나 스크립트 실행이 깨졌다.')
} else {
  const sampleChain = Object.keys(fwreq ?? {})[0]
  if (!sampleChain) {
    failures.push('injectFwReq 렌더 검사를 돌릴 FWREQ 체인이 없다 — (a) 검사와 함께 실패한 상태다.')
  } else {
    for (const ko of [false, true]) {
      const lang = ko ? 'KO' : 'EN'
      const host = w.document.createElement('div')
      // injectFwReq 는 `.method-chips` 를 앵커로 `afterend` 삽입한다 — 부모가 있어야 한다.
      host.innerHTML = '<div class="method-chips"></div>'
      try {
        w.injectFwReq(host, sampleChain, ko)
      } catch (e) {
        failures.push(`injectFwReq(${lang}) 렌더 중 예외: ${e && e.message ? e.message : String(e)}`)
        continue
      }
      const thead = host.querySelector('table.params thead')
      if (thead === null) {
        // fail-closed — 표가 안 나오면 아래 라벨 검사가 "위반 0건"으로 공허하게 통과한다.
        failures.push(`injectFwReq(${lang}) 가 Requirements 표를 렌더하지 않았다 (체인 ${sampleChain}).`)
        continue
      }
      const missing = [BIO, X].filter((label) => !thead.textContent.includes(label))
      if (missing.length > 0) {
        failures.push(`injectFwReq(${lang}) 표 헤더에 모델 컬럼 누락: ${missing.join(' / ')} — 체인 페이지 전부에 영향.`)
      } else {
        rendererChecked += 1
      }
      // (g3) 같은 렌더러의 **형제 표면** — lead 산문과 FWNOTE note. 헤더만 단언하면 산문에서
      //      모델 이름이 빠져도 안 잡힌다(축 (e)를 헤더로만 좁힌 것이 R2 지적의 클래스였다).
      const lead = host.querySelector('p')
      if (lead === null || absentLabels(lead.textContent).length > 0) {
        failures.push(`injectFwReq(${lang}) lead 산문에 두 모델을 함께 말하는 설명이 없다 — 체인 페이지 전부에 영향.`)
      }
      if (w.FWNOTE?.[sampleChain] !== undefined && host.querySelector('.note') === null) {
        failures.push(`injectFwReq(${lang}) 가 FWNOTE(${sampleChain}) 를 렌더하지 않았다 — note 경로가 끊겼다.`)
      }
    }
  }
}

// ── (f) Support Matrix **row 렌더러** ────────────────────────────────────────
// (d)는 헤더 문자열, (b)는 데이터만 본다 — 그 사이의 **row 렌더러**(`.m-fw` 셀)는 무방비였다.
// 옛 단일 셀 `${r.fw||'—'}` 로 되돌리면 헤더는 2컬럼인데 body 는 1셀이라 컬럼이 밀리고 사용자는
// `[object Object]` 를 본다 — (a)~(e) 는 그것을 못 본다(크로스 리뷰 R2). 축 (e)와 같은 방식으로
// **실제 렌더 결과**를 단언한다. EN/KO 는 `mount()` 를 공유하므로 렌더러는 한 번만 검사하면 된다
// (언어별 헤더 문자열은 (d)가 EN/KO 각각 본다).
let matrixRowsChecked = 0
{
  w.location.hash = '#/support-matrix'
  try {
    w.dispatchEvent(new w.Event('hashchange'))
  } catch (e) {
    failures.push(`support-matrix 라우팅 실패: ${e && e.message ? e.message : String(e)}`)
  }
  await new Promise((r) => setTimeout(r, 200))

  const table = w.document.querySelector('table.matrix')
  const headerCells = table === null ? 0 : table.querySelectorAll('thead th').length
  const rows = table === null ? [] : [...table.querySelectorAll('tbody tr')]
  // fail-closed — 0행이면 아래 셀 검사가 전부 공허하게 통과한다.
  if (rows.length === 0) {
    failures.push('Support Matrix 가 한 행도 렌더되지 않았다 — row 렌더러 검사가 성립하지 않는다.')
  }
  for (const row of rows) {
    const label = row.querySelector('td')?.textContent?.trim() ?? '(unnamed)'
    const fwCells = row.querySelectorAll('td.m-fw')
    if (fwCells.length !== 2) {
      failures.push(`Support Matrix row "${label}" 의 .m-fw 셀이 ${fwCells.length}개다 — 모델별 2개여야 한다.`)
      break // 렌더러는 전 행 공통이라 첫 위반이면 충분하다 (38행 × 같은 메시지 방지)
    }
    if (row.querySelectorAll('td').length !== headerCells) {
      failures.push(
        `Support Matrix row "${label}" 의 셀 수(${row.querySelectorAll('td').length})가 헤더(${headerCells})와 다르다 — 컬럼이 밀렸다.`,
      )
      break
    }
    if (row.textContent.includes('[object Object]')) {
      failures.push(`Support Matrix row "${label}" 에 [object Object] 가 렌더됐다 — fw 객체를 그대로 출력하고 있다.`)
      break
    }
    matrixRowsChecked += 1
  }
  // 값이 실제로 bio/x 로 갈라져 나오는지 — 두 셀이 전부 `—` 인 행만 있으면 렌더가 데이터를 잃은 것이다.
  const versionRow = rows.find((r) => {
    const c = r.querySelectorAll('td.m-fw')
    return c.length === 2 && /\d+\.\d+\.\d+/.test(c[0].textContent) && /\d+\.\d+\.\d+/.test(c[1].textContent)
  })
  if (rows.length > 0 && versionRow === undefined) {
    failures.push('Support Matrix 에 bio/x 두 셀이 모두 버전으로 채워진 행이 하나도 없다 — 렌더가 fw 값을 잃었다.')
  }
}

if (failures.length > 0) {
  console.error('✗ docs/index.html 펌웨어 표 모델 축(bio/x) 검사 실패')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(
  `✓ docs/index.html 펌웨어 모델 축 — FWREQ ${fwreqCells}행(체인 ${Object.keys(fwreq).length}) · ` +
    `MATRIX ${matrixChecked}행 검사 / ${matrixSkipped}행 skip(fw 미지정) · FWNOTE ${fwnoteChecked}건(EN·KO) · ` +
    `Requirements 블록 ${reqBlocks.length} · Support Matrix 헤더 ${matrixHeaders.length} · ` +
    `injectFwReq 렌더 ${rendererChecked}/2 (EN·KO) · Support Matrix row ${matrixRowsChecked}행 렌더 검사`,
)
