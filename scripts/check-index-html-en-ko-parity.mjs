#!/usr/bin/env node
/**
 * docs/legacy-v2-dev-doc.html 의 **EN ↔ KO 언어별 존재** 검사 (m19-01, 2026-08-14).
 *
 * 왜 필요한가 — `check:docs` 6종(preset-refs / dup-keys / page-refs / fw-models / brand-tokens /
 * playground-surface) 어디에도 **EN↔KO parity 게이트가 없다.** 한쪽 언어에만 들어간 서술은 어떤
 * 게이트도 못 잡고, 사람이 원소별로 손으로 대조해야만 걸린다.
 *
 * 🔴 왜 `grep -c <token> docs/legacy-v2-dev-doc.html` 총합 단언으로는 안 되는가 (2026-08-14 크로스 리뷰 실측):
 *    총합은 **한 축이 통째로 사라져도** 다른 축이 메워 통과한다. 당시 실측 —
 *      awaiting-connect-approval  총15 → KO 를 전부 지워도 EN 잔량만으로 `-ge 2` 통과
 *      deviceReason               총19 → 동일
 *      timeoutMs                  총 2 → 이것만 우연히(EN 1 + KO 1) 판별력이 있었다
 *    "parity 를 검사한다"는 서술이 3개 토큰 중 2개에서 거짓이었다. **언어별로 나눠 센다.**
 *
 * 🔴 EN 과 KO 는 파일에서 **교차 배치**된다 — 단일 경계선으로 자르면 안 된다(첫 시도의 실패).
 *    실측 배치: EN `DOC.register(` 975~ → KO `'key':{bcko:` 2382~ → EN 3013 → KO 3319~.
 *    그래서 각 등장 줄마다 **바로 위의 마커**가 EN 인지 KO 인지로 귀속시킨다.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const INDEX = resolve(here, '../docs/legacy-v2-dev-doc.html')

/** 각 토큰은 EN·KO **양쪽에 각각 1회 이상** 있어야 한다. */
const TOKENS = ['awaiting-connect-approval', 'deviceReason', 'timeoutMs']

/**
 * 🔴 모수 floor — 토큰 목록을 비우면 "위반 0건"으로 조용히 초록이 된다(검사 대상 집합 축).
 *    개수를 바꾸려면 이 상수도 함께 고쳐야 하므로 삭제가 지나가지 않는다.
 */
const EXPECTED_TOKENS = 3

const lines = readFileSync(INDEX, 'utf8').split('\n')

if (TOKENS.length !== EXPECTED_TOKENS) {
  console.error(`ABORT: 토큰 ${TOKENS.length}개 != 기대 ${EXPECTED_TOKENS}개 — 추가/삭제 시 EXPECTED_TOKENS 도 함께 고쳐라.`)
  process.exit(2)
}

// 언어 마커: EN = DOC.register('<key>' / KO = '<key>':{bcko:
const EN_MARKER = /^DOC\.register\(['"][a-z0-9-]+['"]/
const KO_MARKER = /^['"][a-z0-9-]+['"]:\{bcko:/

/** 줄 번호(0-base) → 그 지점의 언어. 마커를 만나면 전환된다. */
const langAt = []
let cur = null
for (let i = 0; i < lines.length; i++) {
  if (EN_MARKER.test(lines[i])) cur = 'en'
  else if (KO_MARKER.test(lines[i])) cur = 'ko'
  langAt[i] = cur
}

// 🔴 마커가 양쪽 다 실제로 잡혔는지 확인 — 문서 구조가 바뀌어 정규식이 0건이 되면
//    모든 토큰이 한쪽 0 으로 떨어져 "전부 FAIL" 이 되므로 원인을 명확히 구분해 준다(L20⑤).
const enMarkers = lines.filter((l) => EN_MARKER.test(l)).length
const koMarkers = lines.filter((l) => KO_MARKER.test(l)).length
if (enMarkers === 0 || koMarkers === 0) {
  console.error(`ABORT: 언어 마커 추출 실패 (EN ${enMarkers} / KO ${koMarkers}) — docs/legacy-v2-dev-doc.html 구조가 바뀌었다.`)
  process.exit(2)
}

let failed = false
const pad = (s, n) => String(s).padEnd(n)
console.log(`${pad('TOKEN', 30)}${pad('EN', 8)}${pad('KO', 8)}VERDICT`)

for (const tok of TOKENS) {
  let en = 0
  let ko = 0
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(tok)) continue
    if (langAt[i] === 'en') en++
    else if (langAt[i] === 'ko') ko++
  }
  const ok = en >= 1 && ko >= 1
  if (!ok) failed = true
  console.log(`${pad(tok, 30)}${pad(en, 8)}${pad(ko, 8)}${ok ? 'OK' : 'FAIL(한쪽 언어에만 존재)'}`)
}

console.log(`(마커: EN ${enMarkers} / KO ${koMarkers})`)

if (failed) {
  console.error('=== RESULT: FAIL — EN·KO 중 한쪽에만 있는 토큰이 있다 ===')
  process.exit(1)
}
console.log(`=== RESULT: PASS — 토큰 ${TOKENS.length}종이 EN·KO 양쪽에 각각 존재 ===`)
