/**
 * playground.signdata-authentry.test.ts — dApp 전용 sign 메서드 UI 노드 회귀 테스트
 *
 * m10-01-11/12/14로 SDK 핸들러(signData / signAuthEntry / Stellar signMessage)는 머지됐으나
 * connector playground에 invoke할 트리 노드/폼/dispatcher가 없던 갭을 메운 변경의 회귀 방지.
 *
 * 검증 대상:
 *   - signData (Cardano CIP-8/95): wire { method:'signData', chainId, payload:{ keyPath, address, payload } }
 *   - signAuthEntry (Stellar Soroban): wire { method:'signAuthEntry', chainId, payload:{ keyPath, authEntry } }
 *   - signMessage (Stellar raw): 기존 signMessage 경로 재사용, stellar chainId
 *
 * T-U-SIGNDATA-01~05, T-U-SIGNAUTH-01~04, T-U-SIGNMSG-XLM-01 (10개)
 */
import * as fs from 'fs'
import * as path from 'path'

// jest.v2.config.js testEnvironment: 'jsdom'

function loadPlayground(): void {
  const html = fs.readFileSync(
    path.resolve(__dirname, '../../../index-v2.html'),
    'utf8'
  )
  document.documentElement.innerHTML = html

  ;(window as any).PopupTransport = function () {
    return {
      send: jest.fn().mockResolvedValue({ id: 'stub-id', result: {} }),
      on: jest.fn(),
      off: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    }
  }
  ;(window as any).SerialRequestQueue = function () {
    return {
      enqueue: jest.fn(function (task: any) { return task() }),
      size: jest.fn().mockReturnValue(0),
      clear: jest.fn(),
    }
  }
  ;(window as any).ProviderError = class ProviderError extends Error {
    code: number
    constructor(code: number, message: string) {
      super(message)
      this.code = code
    }
  }

  const playgroundSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../playground.js'),
    'utf8'
  )
  // eslint-disable-next-line no-new-func
  new Function(playgroundSrc)()
}

// facade-shaped mock dcent — sign이 success envelope을 resolve
function makeMockDcent(signImpl?: jest.Mock) {
  return {
    sign: signImpl || jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
    getDeviceInfo: jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }
}

// 트리에서 node 선택 → connect → 폼 필드 채움 → Send 클릭
function selectAndSend(methodId: string, fields: Record<string, string>, mockSign: jest.Mock): void {
  const api = (window as any)._playgroundTestAPI
  const item = document.querySelector('[data-method-id="' + methodId + '"]') as HTMLElement
  item.click()
  api.simulateConnect(makeMockDcent(mockSign), null, { model: 'Bio', firmware: '3.0' })
  Object.keys(fields).forEach((k) => {
    const el = document.getElementById('field-' + k) as HTMLInputElement | HTMLTextAreaElement | null
    if (el) el.value = fields[k]
  })
  ;(document.getElementById('btn-send') as HTMLButtonElement).click()
}

beforeEach(() => {
  loadPlayground()
})

afterEach(() => {
  document.documentElement.innerHTML = ''
  delete (window as any)._playgroundTestAPI
  delete (window as any).PopupTransport
  delete (window as any).SerialRequestQueue
  delete (window as any).ProviderError
})

// ─────────────────────────────────────────────────────────
// signData (Cardano CIP-8/95)
// ─────────────────────────────────────────────────────────
it('T-U-SIGNDATA-01: signData:ada:cip8 노드가 cardano chainId로 트리에 존재한다', () => {
  const api = (window as any)._playgroundTestAPI
  function find(items: any[]): any {
    for (const it of items) {
      if (it.id === 'signData:ada:cip8') return it
      if (it.items) { const r = find(it.items); if (r) return r }
    }
    return null
  }
  const node = find(api.TREE)
  expect(node).toBeTruthy()
  expect(node.chainId).toBe('cip34:1-764824073')

  const dom = document.querySelector('[data-method-id="signData:ada:cip8"]')
  expect(dom).toBeTruthy()
})

it('T-U-SIGNDATA-02: signData dispatcher가 { method, chainId, payload:{ keyPath, address, payload } } wire를 전송한다', () => {
  const mockSign = jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: { signature: 'sig', key: 'k' } } })
  selectAndSend('signData:ada:cip8', {
    chainId: 'cip34:1-764824073',
    keyPath: "m/44'/1815'/0'/0/0",
    address: 'addr1qxy...',
    payload: 'deadbeef',
  }, mockSign)

  expect(mockSign).toHaveBeenCalledTimes(1)
  expect(mockSign).toHaveBeenCalledWith({
    method: 'signData',
    chainId: 'cip34:1-764824073',
    payload: { keyPath: "m/44'/1815'/0'/0/0", address: 'addr1qxy...', payload: 'deadbeef' },
  })
})

it('T-U-SIGNDATA-03: address 누락 시 dispatcher 호출 0건 (boundary-validation)', () => {
  const mockSign = jest.fn()
  selectAndSend('signData:ada:cip8', {
    chainId: 'cip34:1-764824073',
    keyPath: "m/44'/1815'/0'/0/0",
    address: '',
    payload: 'deadbeef',
  }, mockSign)

  expect(mockSign).not.toHaveBeenCalled()
})

it('T-U-SIGNDATA-04: 빈 payload는 유효 — CIP-8 opaque empty payload 수용', () => {
  const mockSign = jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } })
  selectAndSend('signData:ada:cip8', {
    chainId: 'cip34:1-764824073',
    keyPath: "m/44'/1815'/0'/0/0",
    address: 'addr1qxy...',
    payload: '',
  }, mockSign)

  expect(mockSign).toHaveBeenCalledTimes(1)
  expect(mockSign.mock.calls[0][0].payload.payload).toBe('')
})

it('T-U-SIGNDATA-05: keyPath 비거나 malformed면 dispatcher 호출 0건 (validateKeyPath 가드 회귀)', () => {
  // empty keyPath
  const mockEmpty = jest.fn()
  selectAndSend('signData:ada:cip8', {
    chainId: 'cip34:1-764824073',
    keyPath: '',
    address: 'addr1qxy...',
    payload: 'deadbeef',
  }, mockEmpty)
  expect(mockEmpty).not.toHaveBeenCalled()

  // malformed keyPath (missing 'm' prefix)
  const mockBad = jest.fn()
  selectAndSend('signData:ada:cip8', {
    chainId: 'cip34:1-764824073',
    keyPath: "44'/1815'/0'/0/0",
    address: 'addr1qxy...',
    payload: 'deadbeef',
  }, mockBad)
  expect(mockBad).not.toHaveBeenCalled()
})

// ─────────────────────────────────────────────────────────
// signAuthEntry (Stellar Soroban)
// ─────────────────────────────────────────────────────────
it('T-U-SIGNAUTH-01: signAuthEntry:xlm:soroban 노드가 stellar chainId로 트리에 존재한다', () => {
  const api = (window as any)._playgroundTestAPI
  function find(items: any[]): any {
    for (const it of items) {
      if (it.id === 'signAuthEntry:xlm:soroban') return it
      if (it.items) { const r = find(it.items); if (r) return r }
    }
    return null
  }
  const node = find(api.TREE)
  expect(node).toBeTruthy()
  expect(node.chainId).toBe('stellar:pubnet/slip44:148')

  const dom = document.querySelector('[data-method-id="signAuthEntry:xlm:soroban"]')
  expect(dom).toBeTruthy()
})

it('T-U-SIGNAUTH-02: signAuthEntry dispatcher가 { method, chainId, payload:{ keyPath, authEntry } } wire를 전송한다', () => {
  const mockSign = jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: { signedAuthEntry: 'x', signerAddress: 'G...' } } })
  selectAndSend('signAuthEntry:xlm:soroban', {
    chainId: 'stellar:pubnet/slip44:148',
    keyPath: "m/44'/148'/0'",
    authEntry: 'AAAAAgAAAAB...',
  }, mockSign)

  expect(mockSign).toHaveBeenCalledTimes(1)
  expect(mockSign).toHaveBeenCalledWith({
    method: 'signAuthEntry',
    chainId: 'stellar:pubnet/slip44:148',
    payload: { keyPath: "m/44'/148'/0'", authEntry: 'AAAAAgAAAAB...' },
  })
})

it('T-U-SIGNAUTH-03: authEntry 누락 시 dispatcher 호출 0건 (boundary-validation)', () => {
  const mockSign = jest.fn()
  selectAndSend('signAuthEntry:xlm:soroban', {
    chainId: 'stellar:pubnet/slip44:148',
    keyPath: "m/44'/148'/0'",
    authEntry: '',
  }, mockSign)

  expect(mockSign).not.toHaveBeenCalled()
})

it('T-U-SIGNAUTH-04: keyPath 비거나 malformed면 dispatcher 호출 0건 (validateKeyPath 가드 회귀)', () => {
  const mockEmpty = jest.fn()
  selectAndSend('signAuthEntry:xlm:soroban', {
    chainId: 'stellar:pubnet/slip44:148',
    keyPath: '',
    authEntry: 'AAAAAgAAAAB...',
  }, mockEmpty)
  expect(mockEmpty).not.toHaveBeenCalled()

  const mockBad = jest.fn()
  selectAndSend('signAuthEntry:xlm:soroban', {
    chainId: 'stellar:pubnet/slip44:148',
    keyPath: "44'/148'/0'",
    authEntry: 'AAAAAgAAAAB...',
  }, mockBad)
  expect(mockBad).not.toHaveBeenCalled()
})

// ─────────────────────────────────────────────────────────
// signMessage (Stellar raw) — 기존 signMessage 경로 재사용
// ─────────────────────────────────────────────────────────
it('T-U-SIGNMSG-XLM-01: stellar signMessage 노드가 기존 signMessage wire로 전송된다', () => {
  const api = (window as any)._playgroundTestAPI
  const dom = document.querySelector('[data-method-id="signMessage:xlm:raw"]')
  expect(dom).toBeTruthy()

  const mockSign = jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: { signature: 's' } } })
  selectAndSend('signMessage:xlm:raw', {
    chainId: 'stellar:pubnet/slip44:148',
    keyPath: "m/44'/148'/0'",
    message: 'Hello Stellar!',
  }, mockSign)

  expect(mockSign).toHaveBeenCalledTimes(1)
  const arg = mockSign.mock.calls[0][0]
  expect(arg.method).toBe('signMessage')
  expect(arg.chainId).toBe('stellar:pubnet/slip44:148')
  expect(arg.payload.keyPath).toBe("m/44'/148'/0'")
  expect(arg.payload.message).toBe('Hello Stellar!')
  expect(arg.payload.meta).toEqual({ kind: 'raw' })

  // 노드가 PRESETS map에도 등록되어 있어야 함 (signMessage 폼 preset selector) — 실제 단언
  const xlmPresets = api.PRESETS['signMessage:xlm:raw']
  expect(Array.isArray(xlmPresets)).toBe(true)
  expect(xlmPresets.length).toBeGreaterThan(0)
  expect(xlmPresets[0].message).toBe('Hello Stellar!')
})

// ─────────────────────────────────────────────────────────
// m09-04-22: preset selector (공유 헬퍼 renderPresetSelector)
// ─────────────────────────────────────────────────────────

// 트리 노드 선택 → 폼 렌더 (connect 불필요; 폼은 click 시 렌더)
function selectNode(methodId: string): void {
  const item = document.querySelector('[data-method-id="' + methodId + '"]') as HTMLElement
  item.click()
}

// #field-preset의 option[value=idx]를 change 디스패치
function pickPreset(idx: number): void {
  const sel = document.getElementById('field-preset') as HTMLSelectElement
  sel.value = String(idx)
  sel.dispatchEvent(new Event('change'))
}

it('T-U-PRESET-SD-01: PRESETS[signData:ada:cip8] 존재 + {label,payload} shape (address는 getAddress로)', () => {
  const api = (window as any)._playgroundTestAPI
  const presets = api.PRESETS['signData:ada:cip8']
  expect(Array.isArray(presets)).toBe(true)
  expect(presets.length).toBeGreaterThan(0)
  presets.forEach((p: any) => {
    expect(typeof p.label).toBe('string')
    expect(typeof p.payload).toBe('string')
    // m09-04-22-fix: address는 hex+디바이스 소유 필수라 preset에 없음 (📡 getAddress로 채움)
    expect(p.address).toBeUndefined()
  })
})

it('T-U-PRESET-SD-02: signData 폼 preset selector → field-payload 채움 (address 미변경)', () => {
  const api = (window as any)._playgroundTestAPI
  const p = api.PRESETS['signData:ada:cip8'][0]
  selectNode('signData:ada:cip8')

  const sel = document.getElementById('field-preset') as HTMLSelectElement
  expect(sel).toBeTruthy()
  pickPreset(0)

  const plEl = document.getElementById('field-payload') as HTMLTextAreaElement
  expect(plEl.value).toBe(p.payload)
  // preset은 address를 채우지 않는다 (getAddress 담당)
  const addrEl = document.getElementById('field-address') as HTMLInputElement
  expect(addrEl.value).toBe('')
})

it('T-U-PRESET-AE-01: PRESETS[signAuthEntry:xlm:soroban] 존재 + 유효 XDR (placeholder 아님)', () => {
  const api = (window as any)._playgroundTestAPI
  const presets = api.PRESETS['signAuthEntry:xlm:soroban']
  expect(Array.isArray(presets)).toBe(true)
  expect(presets.length).toBeGreaterThan(0)
  presets.forEach((p: any) => {
    expect(typeof p.label).toBe('string')
    expect(typeof p.authEntry).toBe('string')
    // m09-04-22-fix: 실제 생성한 유효 SorobanAuthorizationEntry XDR — placeholder 금지
    expect(p.authEntry).not.toContain('replace')
    expect(p.authEntry.length).toBeGreaterThan(100)
    // base64 형식 (device가 파싱할 수 있는 문자셋)
    expect(/^[A-Za-z0-9+/=]+$/.test(p.authEntry)).toBe(true)
  })
})

it('T-U-PRESET-AE-02: signAuthEntry 폼 preset selector → field-authEntry 채움', () => {
  const api = (window as any)._playgroundTestAPI
  const p = api.PRESETS['signAuthEntry:xlm:soroban'][0]
  selectNode('signAuthEntry:xlm:soroban')

  const sel = document.getElementById('field-preset') as HTMLSelectElement
  expect(sel).toBeTruthy()
  pickPreset(0)

  const aeEl = document.getElementById('field-authEntry') as HTMLTextAreaElement
  expect(aeEl.value).toBe(p.authEntry)
})

it('T-U-PRESET-RG-01: signMessage 폼 preset selector 회귀 0 — 공유 헬퍼 경유 후에도 field-message 채움', () => {
  const api = (window as any)._playgroundTestAPI
  const p = api.PRESETS['signMessage:xlm:raw'][0]
  selectNode('signMessage:xlm:raw')

  const sel = document.getElementById('field-preset') as HTMLSelectElement
  expect(sel).toBeTruthy()
  pickPreset(0)

  const msgEl = document.getElementById('field-message') as HTMLTextAreaElement
  expect(msgEl.value).toBe(p.message)
})

// ─────────────────────────────────────────────────────────
// m09-04-22-fix: signData getAddress-채움 버튼 (실제 디바이스 payment 주소)
// ─────────────────────────────────────────────────────────
// 알려진 mainnet base address ↔ raw bytes hex (bech32 npm 라이브러리로 디코드한 reference 벡터)
const REF_ADDR_BECH32 =
  'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x'
const REF_ADDR_HEX =
  '019493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251'

it('T-U-SIGNDATA-GA-01: signData getAddress 버튼이 디바이스 payment 주소를 hex로 변환해 field-address를 채운다', async () => {
  const api = (window as any)._playgroundTestAPI
  const mockGetAddress = jest
    .fn()
    .mockResolvedValue({ address: REF_ADDR_BECH32, rewardAddress: 'stake1DEVICE' })
  const dcent = makeMockDcent()
  ;(dcent as any).getAddress = mockGetAddress

  selectNode('signData:ada:cip8')
  api.simulateConnect(dcent, null, { model: 'Bio', firmware: '3.0' })

  const btn = document.getElementById('btn-signdata-getaddress') as HTMLButtonElement
  expect(btn).toBeTruthy()
  btn.click()
  // getAddress Promise 체인(microtask) flush
  await new Promise((r) => setTimeout(r, 0))

  // 폼 기본값(chainId=cip34, keyPath=default)으로 getAddress가 1회 호출되고
  expect(mockGetAddress).toHaveBeenCalledTimes(1)
  const gaArg = mockGetAddress.mock.calls[0][0]
  expect(gaArg.chainId).toBe('cip34:1-764824073')
  expect(typeof gaArg.keyPath).toBe('string')
  expect(gaArg.keyPath.length).toBeGreaterThan(0)

  // bech32 payment 주소가 raw hex로 변환되어 주입됨 (signData는 hex address 요구)
  const addrEl = document.getElementById('field-address') as HTMLInputElement
  expect(addrEl.value).toBe(REF_ADDR_HEX)
})

it('T-U-SIGNDATA-GA-03: 미연결 상태에서는 getAddress 버튼이 facade를 호출하지 않는다 (Connect 게이트)', () => {
  // simulateConnect 하지 않음 → state.connected = false
  const mockGetAddress = jest.fn()
  selectNode('signData:ada:cip8')
  ;(window as any).dcent = { getAddress: mockGetAddress }
  ;(document.getElementById('btn-signdata-getaddress') as HTMLButtonElement).click()
  expect(mockGetAddress).not.toHaveBeenCalled()
  delete (window as any).dcent
})

it('T-U-SIGNDATA-GA-02: getAddress 응답에 address 없으면 field-address 미변경 (boundary-validation)', async () => {
  const api = (window as any)._playgroundTestAPI
  const mockGetAddress = jest.fn().mockResolvedValue({ rewardAddress: 'stake1ONLY' }) // address 부재
  const dcent = makeMockDcent()
  ;(dcent as any).getAddress = mockGetAddress

  selectNode('signData:ada:cip8')
  api.simulateConnect(dcent, null, { model: 'Bio', firmware: '3.0' })

  const addrEl = document.getElementById('field-address') as HTMLInputElement
  addrEl.value = 'PRESERVED'
  ;(document.getElementById('btn-signdata-getaddress') as HTMLButtonElement).click()
  await new Promise((r) => setTimeout(r, 0))

  expect(mockGetAddress).toHaveBeenCalledTimes(1)
  expect(addrEl.value).toBe('PRESERVED') // 추출 실패 시 기존 값 보존
})

// ─────────────────────────────────────────────────────────
// m09-04-22-fix: 미지원 signMessage 노드 제거 lock
//   tron/tezos = wm slot DC-2296 disabled, polkadot relay(dot:raw) = isParaChain 가드 throw.
//   지원되는 Astar(paraChain) / stellar / solana signMessage는 유지.
// ─────────────────────────────────────────────────────────
it('T-U-SIGNMSG-REMOVED-01: 미지원 signMessage 노드(tron/tezos/polkadot relay)가 트리·PRESETS에서 제거됨', () => {
  const api = (window as any)._playgroundTestAPI

  // 제거된 노드 — DOM 부재
  expect(document.querySelector('[data-method-id="signMessage:tron:raw"]')).toBeNull()
  expect(document.querySelector('[data-method-id="signMessage:xtz:raw"]')).toBeNull()
  expect(document.querySelector('[data-method-id="signMessage:dot:raw"]')).toBeNull()

  // 제거된 노드 — PRESETS map 부재
  expect(api.PRESETS['signMessage:tron:raw']).toBeUndefined()
  expect(api.PRESETS['signMessage:xtz:raw']).toBeUndefined()
  expect(api.PRESETS['signMessage:dot:raw']).toBeUndefined()
})

it('T-U-SIGNMSG-REMOVED-02: 지원되는 signMessage 노드(Astar/stellar/solana)는 유지됨', () => {
  const api = (window as any)._playgroundTestAPI

  expect(document.querySelector('[data-method-id="signMessage:dot:raw:astar"]')).toBeTruthy()
  expect(document.querySelector('[data-method-id="signMessage:xlm:raw"]')).toBeTruthy()
  expect(document.querySelector('[data-method-id="signMessage:sol:raw"]')).toBeTruthy()

  // Astar preset(paraChain 지원 경로)은 유지
  const astarPresets = api.PRESETS['signMessage:dot:raw:astar']
  expect(Array.isArray(astarPresets)).toBe(true)
  expect(astarPresets.length).toBeGreaterThan(0)
})

// ─────────────────────────────────────────────────────────
// m09-04-22-fix: Cardano bech32 → hex 변환 (signData address)
// ─────────────────────────────────────────────────────────
it('T-U-BECH32-01: _cardanoBech32ToHex — reference 벡터 + hex passthrough + edge', () => {
  const api = (window as any)._playgroundTestAPI
  const f = api._cardanoBech32ToHex

  // 알려진 mainnet base address → raw bytes hex (external 라이브러리 bech32와 bytewise 동등)
  expect(f(REF_ADDR_BECH32)).toBe(REF_ADDR_HEX)

  // 이미 hex면 정규화만 (0x 제거, 소문자)
  expect(f('0x019493')).toBe('019493')
  expect(f('AABBCC')).toBe('aabbcc')

  // 형식 불량 / 빈 입력 → ''
  expect(f('')).toBe('')
  expect(f('not-an-address')).toBe('')
  expect(f('odd-len-hex-abc')).toBe('')
})

// ─────────────────────────────────────────────────────────
// m09-04-22-fix: signMessage datalist에서 미지원 polkadot relay 제외
// ─────────────────────────────────────────────────────────
it('T-U-SIGNMSG-DATALIST-01: Astar signMessage 폼 datalist가 polkadot relay(slip44:354)를 제외한다', () => {
  const api = (window as any)._playgroundTestAPI
  const chains = [
    {
      chainId: 'polkadot:91b171bb158e2d3848fa23a9f1c25182/slip44:354',
      family: 'polkadot',
      displayName: 'Polkadot',
      defaultKeyPath: "m/44'/354'/0'/0/0",
    },
    {
      chainId: 'polkadot:9eb76c5184c4ab8679d2d5d819fdf90b/slip44:810',
      family: 'polkadot',
      displayName: 'Astar',
      defaultKeyPath: "m/44'/810'/0'/0/0",
    },
  ]
  api.simulateNonEvmLoad(chains, [])
  selectNode('signMessage:dot:raw:astar')

  const datalist = document.getElementById('datalist-chainId') as HTMLDataListElement
  expect(datalist).toBeTruthy()
  const values = Array.from(datalist.querySelectorAll('option')).map(
    (o) => (o as HTMLOptionElement).value
  )
  // relay(slip44:354)는 자동완성에서 제외, Astar(slip44:810)는 포함
  expect(values.some((v) => v.indexOf('slip44:354') !== -1)).toBe(false)
  expect(values.some((v) => v.indexOf('slip44:810') !== -1)).toBe(true)
})
