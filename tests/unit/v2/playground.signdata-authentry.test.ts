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
