#!/usr/bin/env node
/**
 * docs/index.html 의 **문서 키 중복** 검사 (m13-02-08).
 *
 * 왜 필요한가 — `docs/index.html` 은 페이지를 두 방식으로 등록한다:
 *   EN: `DOC.register('<key>', {...})`
 *   KO: `Object.assign(window.KO, { '<key>': {bcko:…, ko:`…`} })`  ← **여러 블록으로 나뉘어 있다**
 *
 * KO 는 `Object.assign` 이 여러 번 호출되므로 **같은 키가 두 블록에 있으면 뒤가 앞을 덮는다.**
 * 그러면 앞쪽 항목을 아무리 정확히 고쳐도 **사용자에게는 안 보인다** — 실측 사고:
 * m13-02-08 이 `sync-account` KO 페이지를 갱신했는데, 뒤쪽에 stale 사본이 있어 옛
 * `contractAddress` 시그니처가 계속 렌더됐다. 크로스 리뷰(Codex)가 아니었으면 못 잡았다.
 *
 * "고쳤는데 아무 효과 없음"은 테스트로도 안 잡히는 부류라 게이트로 막는다.
 *
 * 🔴 KNOWN_DUPLICATES — 이 커밋 시점에 **이미 중복이던** 키들이다. 본 objective 의 스코프가
 *    아니라 지금 병합하지 않고 **명시적으로 드러낸다**(no-silent-caps: 알려진 예외는 침묵시키지
 *    말고 목록으로 남긴다). 정리하는 사람은 두 사본의 내용을 병합한 뒤 이 목록에서 지운다.
 *    목록에 없는 새 중복이 생기면 즉시 실패한다.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const INDEX = resolve(here, '../docs/index.html')

/** 이미 중복이던 KO 키 — 후속 정리 대상. 새 중복은 여기 추가하지 말고 **고칠 것**. */
const KNOWN_DUPLICATES = new Set([
  'device-overview',
  'set-connection-listener',
  'popup-close',
  'get-device-info',
  'set-label',
  'get-account-info',
  'get-xpub',
  'select-address',
])

function collect(html, re) {
  const seen = new Map()
  for (const m of html.matchAll(re)) {
    const key = m[1]
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return seen
}

const html = readFileSync(INDEX, 'utf8')

const ko = collect(html, /^'([a-z0-9-]+)':\{bcko:/gm)
const en = collect(html, /DOC\.register\('([a-z0-9-]+)'/g)

const problems = []
for (const [lang, map] of [['KO', ko], ['EN', en]]) {
  for (const [key, count] of map) {
    if (count <= 1) continue
    if (lang === 'KO' && KNOWN_DUPLICATES.has(key)) continue
    problems.push(`${lang} '${key}' × ${count}`)
  }
}

// allowlist 가 stale 해지는 것도 막는다 — 정리가 끝났는데 목록에 남아 있으면 다음 중복을
// 조용히 통과시키는 구멍이 된다.
const staleAllow = [...KNOWN_DUPLICATES].filter((k) => (ko.get(k) ?? 0) <= 1)

if (problems.length > 0 || staleAllow.length > 0) {
  if (problems.length > 0) {
    console.error('index.html 문서 키 중복 — 뒤 정의가 앞을 덮어 앞쪽 수정이 무효가 됩니다:')
    for (const p of problems) console.error(`  - ${p}`)
  }
  if (staleAllow.length > 0) {
    console.error('KNOWN_DUPLICATES 가 stale — 이미 정리된 키를 목록에서 제거하세요:')
    for (const k of staleAllow) console.error(`  - ${k}`)
  }
  process.exit(1)
}

const knownNote = KNOWN_DUPLICATES.size > 0 ? ` (알려진 KO 중복 ${KNOWN_DUPLICATES.size}건은 후속 정리 대상)` : ''
console.log(`index.html duplicate keys OK: KO ${ko.size} / EN ${en.size} 고유 키${knownNote}`)
