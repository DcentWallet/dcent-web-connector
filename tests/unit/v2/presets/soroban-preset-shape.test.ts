/**
 * soroban-preset-shape.test.ts — Soroban preset 의 `sorobanData` 선언 + 서술 정정 회귀 (m20-05)
 *
 * 이 리포의 규약은 "앱이 채울 값도 preset 이 **선언**하고 앱은 값만 치환한다" 다.
 * 선언이 없으면 하네스가 필드를 신설하게 되고 bridge `shapeDiff` 계약이 깨진다.
 *
 * T-C-PRESET-01: soroban preset 2건이 `sorobanData` 키를 보유
 * T-C-PRESET-02: `sorobanData` 는 빈 문자열 (더미 값이면 fail-closed 가 무력화된다)
 * T-C-PRESET-03: transaction 키 집합·순서 불변 (개수만 세면 개명을 못 잡는다)
 * T-C-PRESET-04: 정정 대상 검색어 3종이 playground/docs 에서 잔존 0
 * T-C-PRESET-05: preset 총수 55 (모수 floor)
 * T-C-PRESET-06: 정정 대상 6건을 preset id · 파일 경로로 각각 대조
 * T-C-PRESET-07: `fee` 는 number, `sequenceNumber` 는 string
 *
 * 🔴 제목의 `soroban` 토큰은 CI 게이트가 `yarn unit-v2 -t soroban` 으로 필터하므로 필수다.
 */
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../../../..')
const PRESETS_PATH = path.join(ROOT, 'playground/presets.non-evm.json')
const DOC_EN_PATH = path.join(ROOT, 'docs/v2-payload-contract.md')
const DOC_KO_PATH = path.join(ROOT, 'docs/v2-payload-contract-ko.md')

interface Preset {
  id: string
  note: string
  transaction: Record<string, unknown>
}

const presets: Preset[] = JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf8'))
const presetsRaw = fs.readFileSync(PRESETS_PATH, 'utf8')
const docEn = fs.readFileSync(DOC_EN_PATH, 'utf8')
const docKo = fs.readFileSync(DOC_KO_PATH, 'utf8')

const SOROBAN_IDS = ['stellar-soroban-invoke-hello', 'stellar-soroban-invoke-set-admin']

/** 정정 전 서술의 검색어 — 좁힌 형태여야 한다(`sorobanData` 선언 자체가 잡히면 영구 red). */
const STALE_TERMS = [
  'Soroban return `-32602`',
  'Soroban 은 `-32602`',
  '게이트(5.3)가 `{xdr}` 봉투만 허용',
]

/** 전이 아니라 정정 이후 불변식 — soroban 2건 transaction 의 키 순서. */
const EXPECTED_TX_KEYS = [
  'type',
  'contractAddress',
  'functionName',
  'args',
  'fee',
  'sequenceNumber',
  'timeBounds',
  'sorobanData',
]

function byId(id: string): Preset {
  const p = presets.find((x) => x.id === id)
  if (!p) throw new Error(`preset not found: ${id}`)
  return p
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('soroban preset shape (m20-05)', () => {
  it('T-C-PRESET-01: soroban preset 2건의 transaction 이 sorobanData 키를 보유한다', () => {
    for (const id of SOROBAN_IDS) {
      expect(Object.prototype.hasOwnProperty.call(byId(id).transaction, 'sorobanData')).toBe(true)
    }
  })

  it('T-C-PRESET-02: soroban preset 의 sorobanData 는 빈 문자열이다 (더미 금지)', () => {
    for (const id of SOROBAN_IDS) {
      expect(byId(id).transaction.sorobanData).toBe('')
    }
  })

  it('T-C-PRESET-03: soroban preset 의 transaction 키가 순서까지 불변이다', () => {
    for (const id of SOROBAN_IDS) {
      const keys = Object.keys(byId(id).transaction)
      expect(keys.length).toBe(EXPECTED_TX_KEYS.length)
      EXPECTED_TX_KEYS.forEach((expected, i) => {
        expect(`${id}[${i}]=${keys[i]}`).toBe(`${id}[${i}]=${expected}`)
      })
    }
  })

  it('T-C-PRESET-04: soroban 정정 대상 검색어 3종이 playground/docs 에서 잔존 0 이다', () => {
    for (const term of STALE_TERMS) {
      expect(`presets.non-evm.json:${term}:${countOf(presetsRaw, term)}`).toBe(
        `presets.non-evm.json:${term}:0`
      )
      expect(`v2-payload-contract.md:${term}:${countOf(docEn, term)}`).toBe(
        `v2-payload-contract.md:${term}:0`
      )
      expect(`v2-payload-contract-ko.md:${term}:${countOf(docKo, term)}`).toBe(
        `v2-payload-contract-ko.md:${term}:0`
      )
    }
  })

  it('T-C-PRESET-05: soroban preset 이 든 presets.non-evm.json 의 총 preset 수가 55 다', () => {
    expect(presets.length).toBe(55)
  })

  it('T-C-PRESET-06: soroban 2건 + XLM payment 2건 + payload-contract EN/KO 6건이 각각 정정됐다', () => {
    const OLD_SNIPPET = '게이트(5.3)가 `{xdr}` 봉투만 허용'

    for (const id of ['xlm-payment', 'xlm-usdc-payment']) {
      const note = byId(id).note
      expect(`${id}:old=${note.includes(OLD_SNIPPET)}`).toBe(`${id}:old=false`)
      expect(`${id}:new=${note.includes('noNetwork 구조화 경로로 서명된다')}`).toBe(`${id}:new=true`)
      // 🔴 버전 조건부로 쓰면 "m20-06 이후에 열린다" 는 새 거짓이 된다 — 지금 이미 열려 있다.
      expect(`${id}:m20-06=${note.includes('m20-06')}`).toBe(`${id}:m20-06=false`)
    }

    for (const id of SOROBAN_IDS) {
      const note = byId(id).note
      expect(`${id}:old=${note.includes(OLD_SNIPPET)}`).toBe(`${id}:old=false`)
      expect(`${id}:m20-06=${note.includes('m20-06')}`).toBe(`${id}:m20-06=true`)
      expect(`${id}:blind=${note.includes('blind-sign')}`).toBe(`${id}:blind=true`)
    }

    expect(`docs/v2-payload-contract.md:old=${docEn.includes('Soroban return `-32602`')}`).toBe(
      'docs/v2-payload-contract.md:old=false'
    )
    expect(`docs/v2-payload-contract.md:new=${docEn.includes('sorobanData')}`).toBe(
      'docs/v2-payload-contract.md:new=true'
    )
    expect(`docs/v2-payload-contract-ko.md:old=${docKo.includes('Soroban 은 `-32602`')}`).toBe(
      'docs/v2-payload-contract-ko.md:old=false'
    )
    expect(`docs/v2-payload-contract-ko.md:new=${docKo.includes('sorobanData')}`).toBe(
      'docs/v2-payload-contract-ko.md:new=true'
    )
  })

  it('T-C-PRESET-07: soroban preset 의 fee 는 number, sequenceNumber 는 string 이다', () => {
    for (const id of SOROBAN_IDS) {
      const tx = byId(id).transaction
      expect(`${id}:fee=${typeof tx.fee}`).toBe(`${id}:fee=number`)
      expect(`${id}:seq=${typeof tx.sequenceNumber}`).toBe(`${id}:seq=string`)
    }
  })
})
