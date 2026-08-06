/**
 * T-DOC-01 — 문서(`docs/index.html`)의 syncAccount 예제가 **실제 sanitizer** 를 통과하는지.
 * docs-must-match-real-behavior: 문서에 적힌 것을 그대로 넣으면 동작해야 한다.
 */
import { _sanitizeSyncAccountItem } from '../../../../src/sign/_sanitizeSyncAccountItem'

// docs/index.html 의 syncAccount 예제(EN/KO 공통)에서 그대로 옮긴 항목들.
const docExamples = [
  { chainId: 'eip155:1/slip44:60', keyPath: "m/44'/60'/0'/0/0", label: 'ETH-1' },
  { chainId: 'eip155:1/slip44:60', keyPath: "m/44'/60'/0'/0/0", label: 'USDT-1',
    token: { contract: '0xdac17f958d2ee523a2206206994597c13d831ec7' } },
  { chainId: 'eip155:1/slip44:60', keyPath: "m/44'/60'/0'/0/0", label: 'FOO-1',
    token: { contract: '0x1111111111111111111111111111111111111111', symbol: 'FOO', decimals: 6 } },
]

// 문서 파라미터 표가 "이 형식으로 보내라"고 명시한 체인별 온체인 식별자 6종.
const docIdentifiers = [
  '0xdac17f958d2ee523a2206206994597c13d831ec7',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  '0.0.333611',
  'token.sweat',
  'AQUA-GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
  'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token::diko',
]

describe('T-DOC-01: docs/index.html syncAccount 예제 ↔ 실제 sanitizer', () => {
  test('예제 3건이 전부 통과하고 값이 보존된다', () => {
    const out = docExamples.map(_sanitizeSyncAccountItem)
    expect(out[0].token).toBeUndefined()
    expect(out[1].token).toEqual({ contract: '0xdac17f958d2ee523a2206206994597c13d831ec7' })
    expect(out[2].token).toEqual({
      contract: '0x1111111111111111111111111111111111111111', symbol: 'FOO', decimals: 6,
    })
  })

  test('문서가 명시한 체인별 온체인 식별자 6종이 전부 통과한다', () => {
    for (const contract of docIdentifiers) {
      const r = _sanitizeSyncAccountItem({
        chainId: 'eip155:1/slip44:60', keyPath: "m/44'/60'/0'/0/0", label: 'tok', token: { contract },
      })
      expect(r.token?.contract).toBe(contract)
    }
  })
})
