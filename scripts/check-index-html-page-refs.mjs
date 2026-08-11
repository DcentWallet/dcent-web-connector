#!/usr/bin/env node
/**
 * docs/index.html 의 **참조 id ↔ 등록 페이지 정합** 검사 (m13-02-09).
 *
 * 왜 필요한가 — 이 문서는 페이지를 **두 가지 방식**으로 등록한다:
 *   ① 리터럴   `DOC.register("chain-bitcoin", {...})`
 *   ② 동적 루프 `STUBS.forEach(s => DOC.register(s.id, ...))` / `METHODS.forEach(...)`
 *
 * 🔴 그래서 **정적 grep/regex 로 세면 안 된다.** `DOC.register\(["']` 패턴만 세면 ②로 등록된
 *    11개(UTXO 스텁 6 + method 인덱스 5)가 통째로 "미등록"으로 잡힌다 — 실제로 그 오탐이
 *    핸드오프 노트에 "사이드 링크 11건이 죽어 있다(실측)"로 기록됐고, 다음 세션이 없는 페이지
 *    11개를 새로 쓸 뻔했다. 정적 스캔은 **없는 결함을 만들어내는** 쪽으로도 틀린다.
 *
 * 그래서 이 게이트는 문서를 **실제로 실행**해서(jsdom) `window.PAGES` 를 읽고, 세 방향을 본다:
 *   (a) 사이드바 트리(`window.NAV`)의 모든 id 가 등록돼 있는가
 *   (b) 카드/표 데이터(`MATRIX` / `STUBS` / `METHODS`)의 모든 id 가 등록돼 있는가
 *   (c) **모든 페이지를 실제로 렌더**했을 때 나오는 `href="#/…"` 앵커가 전부 살아 있는가
 *
 * (c)가 핵심이다 — 라우터(`route()`)는 미등록 id 를 조용히 `overview` 로 접기 때문에, 죽은
 * 링크를 눌러도 404 가 아니라 "엉뚱한 페이지"가 뜬다. 사용자에게는 오동작으로 안 보인다.
 *
 * 참고: `check:index-dup`(중복 KO 키)과 짝. 저쪽은 "고쳤는데 안 보임", 이쪽은 "링크가 딴 데로 감".
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'

const here = dirname(fileURLToPath(import.meta.url))
const INDEX = resolve(here, '../docs/index.html')

const html = readFileSync(INDEX, 'utf8')

// jsdom 이 구현하지 않은 브라우저 API(`window.scrollTo` 등)가 jsdomError 로 올라온다 —
// 페이지 렌더 자체와 무관하므로 삼킨다. 단 **삼키는 대상을 그것으로 한정**하고, 아래에서
// PAGES 가 비면 실패시켜 "조용히 아무것도 검사 안 함"이 되지 않게 한다.
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

const pages = new Set(Object.keys(w.PAGES ?? {}))

const failures = []

// 🔴 fail-closed — 스크립트 실행이 깨져 PAGES 가 비면 아래 검사가 전부 "참조 0건, 미등록 0건"
//    으로 공허하게 통과한다. 그 침묵이 이 게이트의 가장 위험한 실패 모드다.
if (pages.size === 0) {
  console.error('✗ window.PAGES 가 비어 있다 — docs/index.html 스크립트 실행 실패로 검사가 성립하지 않는다.')
  process.exit(1)
}

/** 사이드바 트리는 중첩 구조다 — 자식 키 이름이 바뀌어도 놓치지 않게 후보를 모두 훑는다. */
function walkNav(nodes, out) {
  for (const n of nodes ?? []) {
    if (!n) continue
    if (typeof n.id === 'string') out.push(n.id)
    walkNav(n.c ?? n.children ?? n.items, out)
  }
  return out
}

const navIds = walkNav(w.NAV, [])
if (navIds.length === 0) {
  failures.push('window.NAV 에서 id 를 하나도 못 찾았다 — 트리 형태가 바뀌었다면 walkNav 를 갱신할 것.')
}
for (const id of navIds) {
  if (!pages.has(id)) failures.push(`NAV id 미등록: ${id}`)
}

for (const key of ['MATRIX', 'STUBS', 'METHODS']) {
  const arr = w[key]
  if (!Array.isArray(arr) || arr.length === 0) {
    failures.push(`window.${key} 가 배열이 아니거나 비어 있다 — 데이터 소스가 사라졌다.`)
    continue
  }
  for (const item of arr) {
    if (typeof item?.id !== 'string') continue
    if (!pages.has(item.id)) failures.push(`${key} id 미등록: ${item.id}`)
  }
}

// (c) 모든 페이지를 실제로 렌더해 그 안의 in-page 앵커를 전수 확인한다.
const dangling = new Set()
for (const id of pages) {
  w.location.hash = `#/${id}`
  try {
    w.dispatchEvent(new w.Event('hashchange'))
  } catch {
    // 라우팅 트리거 실패는 아래 앵커 수집이 이전 페이지를 다시 보게 만들 뿐 — 오탐이 아니라
    // 미탐 방향이라 여기서 중단하지 않는다(빈 catch 금지: 사유를 남긴다).
  }
  for (const a of w.document.querySelectorAll('a[href^="#/"]')) {
    const target = a.getAttribute('href').slice(2)
    if (target && !pages.has(target)) dangling.add(`${id} → ${target}`)
  }
}
for (const d of dangling) failures.push(`죽은 in-page 링크: ${d}`)

if (failures.length > 0) {
  console.error('✗ docs/index.html 참조 id ↔ 등록 페이지 정합 실패')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(
  `✓ docs/index.html 페이지 정합 — 등록 ${pages.size} · NAV ${navIds.length} · ` +
    `MATRIX ${w.MATRIX.length} · STUBS ${w.STUBS.length} · METHODS ${w.METHODS.length} · 죽은 링크 0`,
)
