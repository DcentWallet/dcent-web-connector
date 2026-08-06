/**
 * T-DOC-01 — `docs/index.html` 의 syncAccount 예제가 **실제 sanitizer** 를 통과하는지.
 *
 * docs-must-match-real-behavior: 문서에 적힌 것을 그대로 넣으면 동작해야 한다.
 *
 * 🔴 **문서를 실제로 파싱한다**(크로스 리뷰 R1/R4). 초판은 예제를 이 파일에 복사해 두고
 *    검증해서, 이름은 "docs/index.html 의 예제"인데 **문서가 드리프트해도 통과**했다 —
 *    이번 objective 가 반복해서 부딪힌 "서술이 실제 검증 범위보다 넓다" 부류 그 자체다.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { _sanitizeSyncAccountItem } from '../../../../src/sign/_sanitizeSyncAccountItem'

const INDEX_HTML = resolve(__dirname, '../../../../docs/index.html')

/** `<pre>await dcent.syncAccount([ … ])</pre>` 블록에서 배열 리터럴만 뽑는다. */
function extractSyncAccountExamples (html: string): string[] {
  const out: string[] = []
  const re = /<pre>await dcent\.syncAccount\(\[([\s\S]*?)\]\)<\/pre>/g
  for (const m of html.matchAll(re)) out.push(`[${m[1]}]`)
  return out
}

/** HTML 엔티티 최소 복원 — 예제 코드에 쓰이는 것만. */
function unescapeHtml (s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * 문서의 JS 배열 리터럴을 값으로 만든다.
 *
 * `JSON.parse` 로는 안 된다 — 예제는 홑따옴표 / 주석 / 미따옴표 키를 쓰는 **사람이 읽는
 * JS 코드**다. 대상이 리포 자신의 문서 파일이고 테스트 프로세스 안이므로 `Function`
 * 평가를 쓴다(외부 입력 아님).
 */
function evalArrayLiteral (literal: string): Array<Record<string, unknown>> {
  // eslint-disable-next-line no-new-func
  return new Function(`return ${unescapeHtml(literal)}`)() as Array<Record<string, unknown>>
}

const html = readFileSync(INDEX_HTML, 'utf8')
const examples = extractSyncAccountExamples(html)

describe('T-DOC-01: docs/index.html syncAccount 예제 ↔ 실제 sanitizer', () => {
  test('문서에서 예제 블록을 실제로 찾는다 (추출 실패가 초록으로 접히지 않게)', () => {
    // 🔴 이 단언이 없으면 정규식이 안 맞을 때 examples=[] 가 되어 아래 테스트가
    //    "0건 검증"으로 조용히 통과한다 — 이 파일이 고치려던 바로 그 실패 모드다.
    expect(examples.length).toBeGreaterThanOrEqual(2) // EN + KO
  })

  test('문서 예제의 모든 항목이 sanitizer 를 통과하고 값이 보존된다', () => {
    for (const literal of examples) {
      const items = evalArrayLiteral(literal)
      expect(items.length).toBeGreaterThan(0)

      for (const item of items) {
        const out = _sanitizeSyncAccountItem(item)
        expect(out.chainId).toBe(item.chainId)
        expect(out.keyPath).toBe(item.keyPath)
        expect(out.label).toBe(item.label)
        // 토큰 예제면 token 이 그대로 보존돼야 한다(문서가 약속한 필드 집합).
        if (item.token !== undefined) {
          expect(out.token).toEqual(item.token)
        } else {
          expect(out.token).toBeUndefined()
        }
      }
    }
  })

  test('문서가 명시한 체인별 온체인 식별자 6종이 전부 통과한다', () => {
    // 파라미터 표가 "이 형식으로 보내라"고 적어 둔 값들. 표 자체를 파싱하긴 어려우므로
    //   목록은 여기 두되, **그 값이 문서에 실제로 남아 있는지**를 함께 단언한다 —
    //   표에서 지워졌는데 여기만 남으면 "문서 검증"이라는 이름이 다시 거짓이 된다.
    const docIdentifiers = [
      '0xdac17f958d2ee523a2206206994597c13d831ec7',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      '0.0.333611',
      'token.sweat',
      'AQUA-GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
      'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token::diko',
    ]
    for (const contract of docIdentifiers) {
      expect(html).toContain(contract)

      const r = _sanitizeSyncAccountItem({
        chainId: 'eip155:1/slip44:60', keyPath: "m/44'/60'/0'/0/0", label: 'tok', token: { contract },
      })
      expect(r.token?.contract).toBe(contract)
    }
  })
})
