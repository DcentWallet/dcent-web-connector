/**
 * m21-02 — variant preset **배선 행위** 테스트 (2026-09-02 크로스 리뷰 R2 대응).
 *
 * 🔴 왜 별도 파일인가: 형제 `address-format-variant-presets.test.ts` 는 preset **데이터**를
 *    본다. 이 파일은 그 데이터가 **실제로 요청까지 도달하는가**를 본다. R2 에서 이 축을
 *    소스 문자열 정규식으로 잡았다가 **뮤테이션 5/5 가 생존**했다 —
 *    `out.meta = {addressFormat:'legacy'}` 로 하드코딩하거나 `&& false` 를 붙여도 정규식은
 *    그대로 매칭돼 초록이었다. 정규식은 **모양**을 지키지 **행위**를 지키지 않는다.
 *    ⇒ jsdom 으로 playground 를 실제 로드해 함수를 호출한다.
 */
import * as fs from 'fs'
import * as path from 'path'

import accountPresets from '../../../../playground/presets.account.json'
import nonEvmPresets from '../../../../playground/presets.non-evm.json'

const ROOT = path.resolve(__dirname, '../../../..')

function loadPlayground(): any {
  const html = fs.readFileSync(path.join(ROOT, 'index-v2.html'), 'utf8')
  document.documentElement.innerHTML = html
  ;(window as any).PopupTransport = function () {
    return {
      send: jest.fn().mockResolvedValue({ id: 'stub', result: {} }),
      on: jest.fn(),
      off: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    }
  }
  ;(window as any).SerialRequestQueue = function () {
    return {
      enqueue: jest.fn((t: any) => t()),
      size: jest.fn().mockReturnValue(0),
      clear: jest.fn(),
    }
  }
  ;(window as any).ProviderError = class extends Error {
    code: number
    constructor(code: number, message: string) {
      super(message)
      this.code = code
    }
  }
  // eslint-disable-next-line no-new-func
  new Function(fs.readFileSync(path.join(ROOT, 'playground.js'), 'utf8'))()
  return (window as any)._playgroundTestAPI
}

const BTC_MAINNET = 'bip122:000000000019d6689c085ae165831e93'
const BTC_MAINNET_CAIP = `${BTC_MAINNET}/slip44:0`
const BCH_CAIP = 'bip122:000000000000000000651ef99cb9fcbe/slip44:145'

const LEDGER_PRESET_IDS = [
  'syncAccount:btc-segwit-wrapped',
  'syncAccount:btc-native-84',
  'syncAccount:btc-taproot',
  'syncAccount:polkadot-ledger',
  'syncAccount:algorand-ledger',
  'syncAccount:astar-ledger',
  'syncAccount:creditcoin-ledger',
]

describe('m21-02 preset 배선 — 행위', () => {
  let api: any
  beforeEach(() => {
    api = loadPlayground()
  })

  // ──────────────────────────────────────────────────────────────────────────
  it('T-U-CON-17: syncAccount preset 7건의 meta.addressFormat 이 전송 payload 까지 살아남는다', () => {
    // 🔴 whitelist 에서 `meta` 가 빠지면 `algorand-ledger` 는 base 계정 요청과
    //    **바이트 단위로 같은 요청**이 된다(keyPath 가 base 와 동일하므로).
    const out: string[] = []
    for (const id of LEDGER_PRESET_IDS) {
      const preset: any = (accountPresets as any[]).find((p) => p.id === id)
      const sent = api._sanitizeSyncAccountInfos(preset.value)
      out.push(`${id}=${sent[0].meta?.addressFormat}`)
    }
    const expected = LEDGER_PRESET_IDS.map((id) => {
      const p: any = (accountPresets as any[]).find((x) => x.id === id)
      return `${id}=${p.value[0].meta.addressFormat}`
    })
    expect(out.join('\n')).toBe(expected.join('\n'))
    // 🔴 하드코딩 방어 — 7건이 **서로 다른 값 4종**을 낸다. 한 값으로 고정하면 여기서 깨진다.
    expect(new Set(out.map((x) => x.split('=')[1])).size).toBe(4)
  })

  it('T-U-CON-17b: meta 는 own-enumerable 만 읽는다 (상속·비열거 값 거부)', () => {
    const inherited = Object.create({ addressFormat: 'ledger' })
    const hidden: any = {}
    Object.defineProperty(hidden, 'addressFormat', { value: 'ledger', enumerable: false })
    const base = { chainId: 'c', keyPath: 'k', label: 'l' }
    expect(`inherited=${api._sanitizeSyncAccountInfos([{ ...base, meta: inherited }])[0].meta}`).toBe(
      'inherited=undefined'
    )
    expect(`hidden=${api._sanitizeSyncAccountInfos([{ ...base, meta: hidden }])[0].meta}`).toBe(
      'hidden=undefined'
    )
    expect(
      `own=${api._sanitizeSyncAccountInfos([{ ...base, meta: { addressFormat: 'ledger' } }])[0].meta?.addressFormat}`
    ).toBe('own=ledger')
    // meta 밖 임의 키는 여전히 버린다 (whitelist 가 넓어지지 않았다)
    expect(
      `extra=${(api._sanitizeSyncAccountInfos([{ ...base, extraKey: 'x' }])[0] as any).extraKey}`
    ).toBe('extra=undefined')
  })

  // ──────────────────────────────────────────────────────────────────────────
  // T-U-CON-18 계열 — top-level keyPath 배선. 폼을 실제로 띄워 값을 읽는다.
  //
  // 🔴 wm 의 경로 축이 보는 것은 payload 의 **top-level keyPath** 다. 여기가 어긋나면
  //    `inputs[].keyPath` 와 갈려 wm prevout ownership 게이트가 -32602 를 내고, 그 -32602 는
  //    이 트랙이 가르치려는 "하류 미배포" 신호와 **구별되지 않는다.**
  function openBitcoinSignForm(presetsOverride?: any[]): void {
    const chains = [
      { chainId: BTC_MAINNET_CAIP, family: 'bitcoin', name: 'Bitcoin', defaultKeyPath: "m/44'/0'/0'/0/0" },
      { chainId: BCH_CAIP, family: 'bitcoin', name: 'Bitcoin Cash', defaultKeyPath: "m/44'/145'/0'/0/0" },
    ]
    api.simulateNonEvmLoad(chains, presetsOverride ?? nonEvmPresets)
    api.simulateConnect(
      {
        sign: jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
        getDeviceInfo: jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
        popupWindowClose: jest.fn(),
        setConnectionListener: jest.fn(),
      },
      null,
      { model: 'Bio', firmware: '3.0' }
    )
    const node = document.querySelector(
      `[data-method-id="signTx:bitcoin:${BTC_MAINNET_CAIP}"]`
    ) as HTMLElement
    if (!node) {
      const ids = Array.from(document.querySelectorAll('[data-method-id^="signTx:bitcoin"]'))
        .map((e) => e.getAttribute('data-method-id'))
        .join(' | ')
      throw new Error(`bitcoin 노드 없음. 존재하는 id: ${ids}`)
    }
    node.click()
  }

  const kp = (): string => (document.getElementById('field-keyPath') as HTMLInputElement).value
  const selectPreset = (id: string): void => {
    const sel = document.getElementById('field-preset') as HTMLSelectElement
    sel.value = id
    sel.dispatchEvent(new Event('change'))
  }

  it("T-U-CON-18: wrapped preset 을 고르면 top-level keyPath 가 m/49' 로 바뀐다", () => {
    openBitcoinSignForm()
    selectPreset('btc-transfer')
    expect(`legacy=${kp()}`).toBe("legacy=m/44'/0'/0'/0/0")
    selectPreset('btc-wrapped-transfer')
    expect(`wrapped=${kp()}`).toBe("wrapped=m/49'/0'/0'/0/0")
  })

  it('T-U-CON-18b: keyPath 를 선언하지 않은 preset 으로 되돌리면 기본값으로 복원된다 (누수 금지)', () => {
    // 🔴 R2 CRITICAL 4 — 종전 배선은 되돌릴 때 값을 복원하지 않아, legacy preset 인데
    //    top-level 이 m/49' 로 남았다(= inputs 는 m/44'). 방향만 반대인 같은 불일치다.
    openBitcoinSignForm()
    selectPreset('btc-wrapped-transfer')
    expect(`before=${kp()}`).toBe("before=m/49'/0'/0'/0/0")
    selectPreset('btc-transfer')
    expect(`after=${kp()}`).toBe("after=m/44'/0'/0'/0/0")
  })

  it('T-U-CON-18c: 같은 chainId 로 input 이 다시 떠도 preset keyPath 가 유지된다 (경합 금지)', () => {
    // 🔴 R2 CRITICAL 3 — `_wireKeyPathSync` 가 chainId `input` 마다 defaultKeyPath 로
    //    **무조건 덮어써서**, preset 선택 뒤 chainId 를 만지면 조용히 legacy 로 돌아갔다.
    //    (같은 값으로 다시 입력해도 event 는 뜬다 — 그게 원래 경합의 모양이다.)
    openBitcoinSignForm()
    selectPreset('btc-wrapped-transfer')
    const chainEl = document.getElementById('field-chainId') as HTMLInputElement
    chainEl.value = BTC_MAINNET_CAIP
    chainEl.dispatchEvent(new Event('input'))
    expect(`same=${kp()}`).toBe("same=m/49'/0'/0'/0/0")
  })

  it('T-U-CON-18c-2: preset 이 선언하지 않은 체인으로 옮기면 **체인 기본값으로 자기 교정**한다', () => {
    // 🔴 R3 WARNING — `applicableChainIds` 를 BTC mainnet 으로 좁혀도 **폼은 같은 family
    //    전체를 chainId datalist 로 제공**하므로 축소만으로는 우회가 안 막힌다.
    //    `btc-wrapped-transfer` 의 keyPath 는 coinType 이 박힌 절대 경로라, 다른 체인에
    //    그대로 남으면 chainId ↔ coinType 이 어긋난다(축소의 근거와 정반대 방향).
    //    ⇒ 범위를 벗어나면 preset 을 무시한다. 범위로 돌아오면 다시 preset 이 이긴다.
    openBitcoinSignForm()
    selectPreset('btc-wrapped-transfer')
    expect(`inScope=${kp()}`).toBe("inScope=m/49'/0'/0'/0/0")
    const chainEl = document.getElementById('field-chainId') as HTMLInputElement
    chainEl.value = BCH_CAIP
    chainEl.dispatchEvent(new Event('input'))
    expect(`outOfScope=${kp()}`).toBe("outOfScope=m/44'/145'/0'/0/0")
    chainEl.value = BTC_MAINNET_CAIP
    chainEl.dispatchEvent(new Event('input'))
    expect(`backInScope=${kp()}`).toBe("backInScope=m/49'/0'/0'/0/0")
  })

  it('T-U-CON-18e: **자동선택**된 preset 의 keyPath 도 반영된다 (거울상 짝)', () => {
    // 🔴 `presetSelect.value = …` 는 change 를 **발화하지 않는다.** 자동선택 분기는 change
    //    핸들러의 사본이라, 배선을 한쪽에만 걸면 여기가 빈다(R2 CRITICAL 2).
    // 🔴 이 결함은 실제 파일 순서에서는 `btc-transfer` 가 먼저라 **잠재**다 — 순서에 기대면
    //    테스트가 아무것도 못 잡는다(실측: 순서를 안 바꾸면 이 뮤테이션이 SURVIVE 한다).
    //    그래서 keyPath 를 선언한 preset 이 **첫째가 되도록 순서를 주입**해 활성화시킨다.
    const wrapped = (nonEvmPresets as any[]).find((p) => p.id === 'btc-wrapped-transfer')
    const reordered = [wrapped, ...(nonEvmPresets as any[]).filter((p) => p !== wrapped)]
    openBitcoinSignForm(reordered)
    const sel = document.getElementById('field-preset') as HTMLSelectElement
    expect(`autoselected=${sel.value}`).toBe('autoselected=btc-wrapped-transfer')
    expect(`keyPath=${kp()}`).toBe("keyPath=m/49'/0'/0'/0/0")
  })

  it('T-U-CON-18f: preset 선택을 비우면(null preset) chainId 기본값 경로로 떨어진다', () => {
    // 🔴 R4 WARNING — 이 델타가 `preset.applicableChainIds` 를 **선평가**하는 식을 새로 만들면서
    //    `!preset ||` null 가드가 그 역참조를 막는 **새 표면**이 됐다. 그런데 테스트가 0건이라
    //    가드를 지워도 초록이었다(실측 SURVIVED). 도달성은 실재한다 — preset 을
    //    `-- select preset --` 로 되돌린 뒤 chainId 를 만지는 경로, 그리고 `field-preset` 이
    //    `nonEvmPresetsMap` 에 없는 **다른 폼 5종 전부**가 이 경로를 탄다.
    //    (`review-finding-class-closure` 4문항 #3 — 내 수정이 연 표면에도 가드가 닿아야 한다.)
    openBitcoinSignForm()
    selectPreset('btc-wrapped-transfer')
    expect(`picked=${kp()}`).toBe("picked=m/49'/0'/0'/0/0")
    // 선택 해제 — preset 객체가 없는 상태로 chainId 훅이 돈다
    const sel = document.getElementById('field-preset') as HTMLSelectElement
    sel.value = ''
    sel.dispatchEvent(new Event('change'))
    const chainEl = document.getElementById('field-chainId') as HTMLInputElement
    chainEl.value = BCH_CAIP
    chainEl.dispatchEvent(new Event('input'))
    expect(`cleared=${kp()}`).toBe('cleared=m/44\'/145\'/0\'/0/0')
    chainEl.value = BTC_MAINNET_CAIP
    chainEl.dispatchEvent(new Event('input'))
    expect(`backToBtc=${kp()}`).toBe('backToBtc=m/44\'/0\'/0\'/0/0')
  })

  it('T-U-CON-18d: preset 이 없으면 chainId 기본값이 그대로 적용된다 (기존 폼 동작 불변)', () => {
    openBitcoinSignForm()
    selectPreset('btc-transfer')
    const chainEl = document.getElementById('field-chainId') as HTMLInputElement
    chainEl.value = BCH_CAIP
    chainEl.dispatchEvent(new Event('input'))
    expect(`bch=${kp()}`).toBe("bch=m/44'/145'/0'/0/0")
  })
})
