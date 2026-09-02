/**
 * m21-02 — addressFormat variant preset 회귀 가드.
 *
 * 이 파일이 지키는 것은 **preset 이 도달 가능한가**다. playground 는 preset 을 UI 로 태우므로,
 * preset 이 빠지거나(유실) 서로 구별 불가해지면(투명) 실기기 검증이 조용히 다른 계정을 본다.
 *
 * 🔴 값 선택의 원칙: 한 케이스에서 여러 축을 볼 때 **축의 값이 겹치면 그 두 축은 서로 투명**해진다.
 *    이 파일의 두 쌍이 정확히 그 함정에 걸려 있어 판별자를 명시적으로 고정한다:
 *      - `polkadot-ledger` ↔ `creditcoin-ledger` : keyPath·addressFormat 이 바이트 동일 → **chainId** 만이 판별자
 *      - `btc-segwit-native`(m/44') ↔ `btc-native-84`(m/84') : chainId·addressFormat 동일 → **keyPath** 만이 판별자
 */
// 🔴 jest 의 jsdom 런타임은 `node:` prefix 를 못 읽는다(ENOENT: open 'node:fs') — 실측.
import { readFileSync } from 'fs'
import { join } from 'path'

import accountPresets from '../../../../playground/presets.account.json'
import nonEvmPresets from '../../../../playground/presets.non-evm.json'
import evmPresets from '../../../../playground/presets.evm.json'
import restPresets from '../../../../playground/presets.rest.json'
import bitcoinTxPresets from '../../../../playground/presets.bitcoin-tx.json'

type SyncValue = { chainId: string; keyPath: string; label?: string; meta?: { addressFormat?: string } }
type Preset = { id: string; scenarioCode: string; label: string; value?: SyncValue[] }

const ALL: Preset[] = ([] as Preset[]).concat(
  accountPresets as Preset[],
  nonEvmPresets as Preset[],
  evmPresets as Preset[],
  restPresets as Preset[],
  bitcoinTxPresets as Preset[]
)

const byId = (id: string): Preset => {
  const p = ALL.find((x) => x.id === id)
  if (!p) throw new Error(`preset 부재: ${id}`)
  return p
}
const first = (id: string): SyncValue => {
  const v = byId(id).value
  if (!v || v.length === 0) throw new Error(`preset ${id} 에 value[] 가 없다`)
  return v[0]
}

/** m21-02 가 추가한 preset 전건. 🔴 하나라도 빠지면 실패하도록 **열거**한다(개수 비교 아님). */
const NEW_PRESET_IDS = [
  'syncAccount:btc-segwit-wrapped',
  'syncAccount:btc-native-84',
  'syncAccount:btc-taproot',
  'syncAccount:polkadot-ledger',
  'syncAccount:algorand-ledger',
  'syncAccount:astar-ledger',
  'syncAccount:creditcoin-ledger',
  'btc-wrapped-transfer',
]

describe('m21-02 addressFormat variant presets', () => {
  it('T-U-CON-08: 신규 preset 8건이 모두 존재한다', () => {
    const missing = NEW_PRESET_IDS.filter((id) => !ALL.some((p) => p.id === id))
    expect(`missing=${missing.join(',')}`).toBe('missing=')
  })

  it('T-U-CON-05: preset id 와 scenarioCode 가 5개 파일 합집합에서 전역 유일하다', () => {
    const dupIds = ALL.map((p) => p.id).filter((v, i, a) => a.indexOf(v) !== i)
    const dupCodes = ALL.map((p) => p.scenarioCode).filter((v, i, a) => a.indexOf(v) !== i)
    expect(`dupIds=${dupIds.join(',')}|dupCodes=${dupCodes.join(',')}`).toBe('dupIds=|dupCodes=')
  })

  it('T-U-CON-05b: scenarioCode 는 zero-padded 3자리 **문자열**이다', () => {
    // 숫자로 넣으면 JSON 상 115 가 되어 기존 "088" 형제와 형식이 갈린다.
    const bad = ALL.filter((p) => typeof p.scenarioCode !== 'string' || !/^\d{3}$/.test(p.scenarioCode))
    expect(`bad=${bad.map((p) => p.id).join(',')}`).toBe('bad=')
  })

  it("T-U-CON-06: btc-segwit-native(m/44') 와 btc-native-84(m/84') 는 keyPath 로 갈린다", () => {
    const a = first('syncAccount:btc-segwit-native')
    const b = first('syncAccount:btc-native-84')
    // 전제 — 나머지 두 축이 같아야 keyPath 가 유일한 판별자라는 주장이 성립한다.
    expect(`chainId=${a.chainId === b.chainId}`).toBe('chainId=true')
    expect(`af=${a.meta?.addressFormat === b.meta?.addressFormat}`).toBe('af=true')
    expect(`keyPath=${a.keyPath}|${b.keyPath}`).toBe("keyPath=m/44'/0'/0'/0/0|m/84'/0'/0'/0/0")
  })

  it('T-U-CON-09: polkadot-ledger 와 creditcoin-ledger 는 chainId 로만 갈린다', () => {
    const a = first('syncAccount:polkadot-ledger')
    const b = first('syncAccount:creditcoin-ledger')
    // 🔴 전제 — 이 둘은 keyPath·addressFormat 이 바이트 동일하다(wm 실측: POLKADOT-LGR 과
    //    PARA-L:00012A 의 derivationFormat 이 둘 다 "m/44'/354'/<accountIdx>'/0'/0'").
    //    그래서 keyPath 축으로 비교하면 **항상 통과하는 무의미한 단언**이 된다.
    expect(`keyPath=${a.keyPath === b.keyPath}`).toBe('keyPath=true')
    expect(`af=${a.meta?.addressFormat === b.meta?.addressFormat}`).toBe('af=true')
    expect(`chainId=${a.chainId}|${b.chainId}`).toBe(
      'chainId=polkadot:91b171bb158e2d3848fa23a9f1c25182/slip44:354|' +
        'polkadot:6673c7e2c2b7bde45a60c71ef70d9c7c/slip44:354'
    )
  })

  it('T-U-CON-10: 파라체인 Ledger preset 의 keyPath tail 이 하드닝이다', () => {
    // 🔴 chains.json 의 defaultKeyPath 는 **base** 경로(`/0/0`)라 그대로 복사하면 Ledger 계정에
    //    도달하지 못한다. Cardano 에서 같은 함정으로 preset 이 도달 불가였던 전례가 있다.
    expect(`astar=${first('syncAccount:astar-ledger').keyPath}`).toBe("astar=m/44'/810'/0'/0'/0'")
    expect(`creditcoin=${first('syncAccount:creditcoin-ledger').keyPath}`).toBe(
      "creditcoin=m/44'/354'/0'/0'/0'"
    )
    expect(`polkadot=${first('syncAccount:polkadot-ledger').keyPath}`).toBe(
      "polkadot=m/44'/354'/0'/0'/0'"
    )
  })

  it('T-U-CON-11: algorand-ledger 는 keyPath 가 base 와 같아 addressFormat 만이 판별자다', () => {
    // wm 실측: ALGORAND-LGR 의 derivationFormat 은 "m/44'/283'/<accountIdx>'/0/0" 로
    // **tail 이 비하드닝**이며, connector chains.json 의 ALGORAND defaultKeyPath 와 같다.
    // 🔴 형제(Polkadot/파라체인)를 보고 여기까지 하드닝으로 "정정"하면 도달 불가해진다.
    const a = first('syncAccount:algorand-ledger')
    expect(`keyPath=${a.keyPath}`).toBe("keyPath=m/44'/283'/0'/0/0")
    expect(`af=${a.meta?.addressFormat}`).toBe('af=ledger')
  })

  it("T-U-CON-12: meta.addressFormat 을 싣는 preset 은 **그것이 유일한 판별자일 때뿐**이다", () => {
    // 🔴 2026-09-02 크로스 리뷰 R5 — 종전에는 Ledger preset 4건 전부에 `'ledger'` 를 실었다.
    //    그런데 오늘 실측(wm HEAD):
    //      polkadot / astar / creditcoin → **byKeyPath 가 LGR 을 고른다**(경로 축으로 도달)
    //      algorand                      → byKeyPath 가 base 다(경로가 base 와 바이트 동일)
    //    그리고 bridge sdk 경계의 `ADDRESS_FORMATS` 는 **4값**이라 `'ledger'` 는 -32602 다.
    //    ⇒ meta 를 실으면 **되던 경로(경로 축)까지 하류가 먼저 끊는다.** 내가 넣은 필드가
    //      도달 가능하던 3건을 막고 있었다.
    // 🔴 그래서 meta 는 **경로 축으로 못 가는 것에만** 싣는다. 되돌리지 말 것.
    const WITH_META: Record<string, string> = {
      // 경로가 base 와 동일 → addressFormat 만이 판별자. 오늘은 -32602(하류 미개통).
      'syncAccount:algorand-ledger': 'ledger',
      // 형식 축·경로 축이 **둘 다 도달**하는 유일한 케이스(byFormat=BTC-SEGWIT, byKeyPath=BTC-SW-84).
      'syncAccount:btc-native-84': 'segwit-native',
    }
    const WITHOUT_META = [
      'syncAccount:btc-segwit-wrapped',
      'syncAccount:btc-taproot',
      'syncAccount:polkadot-ledger',
      'syncAccount:astar-ledger',
      'syncAccount:creditcoin-ledger',
    ]
    const actual = [
      ...Object.keys(WITH_META).map((id) => `${id}=${first(id).meta?.addressFormat}`),
      ...WITHOUT_META.map((id) => `${id}=${first(id).meta?.addressFormat}`),
    ]
    const expected = [
      ...Object.entries(WITH_META).map(([id, v]) => `${id}=${v}`),
      ...WITHOUT_META.map((id) => `${id}=undefined`),
    ]
    expect(actual.join('\n')).toBe(expected.join('\n'))
  })

  it('T-U-CON-13: BTC 신규 preset 3건의 keyPath purpose 가 의도한 variant 를 가리킨다', () => {
    // 🔴 판별은 이제 **keyPath 축**이 소유한다(R5 실측: byFormat 은 wrapped/taproot 에서
    //    undefined 라 오히려 -32602 를 만든다). purpose 를 고정해 그 축을 지킨다.
    const pairs: Array<[string, string]> = [
      ['syncAccount:btc-segwit-wrapped', "m/49'"],
      ['syncAccount:btc-native-84', "m/84'"],
      ['syncAccount:btc-taproot', "m/86'"],
    ]
    const actual = pairs.map(([id]) => {
      const v = first(id)
      return `${id}|${v.keyPath.split('/').slice(0, 2).join('/')}`
    })
    expect(actual.join('\n')).toBe(pairs.map(([id, p]) => `${id}|${p}`).join('\n'))
  })

  it('T-U-CON-14: syncAccount label(계정 별칭)이 신규 7건에서 서로 다르다', () => {
    // label 이 겹치면 playground 결과 표에서 어느 계정의 응답인지 못 가린다.
    const labels = NEW_PRESET_IDS.filter((id) => id.startsWith('syncAccount:')).map(
      (id) => first(id).label
    )
    expect(`unique=${new Set(labels).size}/${labels.length}`).toBe('unique=7/7')
  })
  // ──────────────────────────────────────────────────────────────────────────
  // 🔴 T-U-CON-15 — chainId **전건** 고정 (2026-09-02 크로스 리뷰: 뮤테이션 4건 SURVIVED)
  //
  // 종전에는 chainId 를 단언하는 것이 3건뿐이었다(T-U-CON-09 두 건 + T-U-CON-06 형제 동일성).
  // `algorand-ledger` · `astar-ledger` · `btc-segwit-wrapped` · `btc-taproot` 의 chainId 는
  // 어떤 단언도 닿지 않아, mainnet↔testnet 을 바꿔도 스위트가 초록이었다.
  // chainId 는 **exact match CAIP-19** 라 한 글자만 틀려도 조용히 `undefined` 가 되고,
  // 그 실패가 이 트랙이 가르치려는 "하류 미배포 -32602" 와 **구별되지 않는다.**
  it('T-U-CON-15: 신규 syncAccount preset 7건의 (chainId, keyPath, addressFormat) 전건 고정', () => {
    const EXPECTED: Array<[string, string, string, string]> = [
      [
        'syncAccount:btc-segwit-wrapped',
        'bip122:000000000019d6689c085ae165831e93/slip44:0',
        "m/49'/0'/0'/0/0",
        'undefined',
      ],
      [
        'syncAccount:btc-native-84',
        'bip122:000000000019d6689c085ae165831e93/slip44:0',
        "m/84'/0'/0'/0/0",
        'segwit-native',
      ],
      [
        'syncAccount:btc-taproot',
        'bip122:000000000019d6689c085ae165831e93/slip44:0',
        "m/86'/0'/0'/0/0",
        'undefined',
      ],
      [
        'syncAccount:polkadot-ledger',
        'polkadot:91b171bb158e2d3848fa23a9f1c25182/slip44:354',
        "m/44'/354'/0'/0'/0'",
        'undefined',
      ],
      [
        'syncAccount:algorand-ledger',
        'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k/slip44:283',
        "m/44'/283'/0'/0/0",
        'ledger',
      ],
      [
        'syncAccount:astar-ledger',
        'polkadot:9eb76c5184c4ab8679d2d5d819fdf90b/slip44:810',
        "m/44'/810'/0'/0'/0'",
        'undefined',
      ],
      [
        'syncAccount:creditcoin-ledger',
        'polkadot:6673c7e2c2b7bde45a60c71ef70d9c7c/slip44:354',
        "m/44'/354'/0'/0'/0'",
        'undefined',
      ],
    ]
    const actual = EXPECTED.map(([id]) => {
      const v = first(id)
      return `${id}|${v.chainId}|${v.keyPath}|${v.meta?.addressFormat}`
    })
    expect(actual.join('\n')).toBe(
      EXPECTED.map(([id, c, k, a]) => `${id}|${c}|${k}|${a}`).join('\n')
    )
  })

  it('T-U-CON-16: btc-wrapped-transfer 의 내용이 고정된다 (존재 여부만 보지 않는다)', () => {
    // 🔴 이 preset 의 존재 이유가 `m/49'` 하나인데 종전에는 T-U-CON-08 의 **존재 검사**만
    //    받고 내용 단언이 0건이었다 — input keyPath 를 `m/44'` 로 되돌려도 초록이었다.
    // 🔴 top-level `keyPath` 선언은 필수다. wm 의 경로 축이 보는 것이 그 필드이고,
    //    없으면 playground 가 chains.json 기본값(m/44')을 그대로 보내 legacy 로 떨어진다.
    const p = byId('btc-wrapped-transfer') as Preset & {
      keyPath?: string
      transaction?: { inputs: Array<{ keyPath: string; txType: string }> }
    }
    expect(`top=${p.keyPath}`).toBe("top=m/49'/0'/0'/0/0")
    const inp = p.transaction?.inputs?.[0]
    expect(`in=${inp?.keyPath}|${inp?.txType}`).toBe("in=m/49'/0'/0'/0/0|p2sh")
    // top-level 과 input 이 **같은 계정**을 가리켜야 한다 — 갈리면 wm prevout ownership 게이트가 막는다.
    expect(`same=${p.keyPath === inp?.keyPath}`).toBe('same=true')
  })

})
