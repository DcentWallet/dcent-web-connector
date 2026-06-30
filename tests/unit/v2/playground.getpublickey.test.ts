/**
 * playground.getpublickey.test.ts — getPublicKey 노드 + getAddress rewardAddress 렌더 (m09-04-21)
 *
 * jsdom 환경에서 index-v2.html + playground.js 로드 후
 * getPublicKey 트리 노드 / 폼 / 결과 요약 렌더, getAddress rewardAddress 라인을 검증.
 *
 *   T-CONN-PG-03: playground getPublicKey 노드 — 트리 존재 + 폼(chainId/keyPath) +
 *                 결과 요약(payment/stake/drep 각 keyPath+publicKey) 렌더.
 *   T-CONN-PG-04: getAddress 결과가 Cardano(rewardAddress 보유)면 rewardAddress 라인 표시,
 *                 비-Cardano(rewardAddress 부재)면 라인 미표시 (undefined-safe).
 */
import * as fs from 'fs'
import * as path from 'path'

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

const CARDANO_PUBKEY_RESULT = {
  payment: { keyPath: "m/1852'/1815'/0'/0/0", publicKey: 'aa11' },
  stake: { keyPath: "m/1852'/1815'/0'/2/0", publicKey: 'bb22' },
  drep: { keyPath: "m/1852'/1815'/0'/3/0", publicKey: 'cc33' },
}

// facade-shaped mock dcent — getPublicKey가 v1 success envelope을 resolve
function makeMockDcent(getPublicKeyImpl?: jest.Mock) {
  return {
    getPublicKey:
      getPublicKeyImpl ||
      jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: CARDANO_PUBKEY_RESULT } }),
    getDeviceInfo: jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }
}

// ─────────────────────────────────────────────────────────
// T-CONN-PG-03: getPublicKey 노드 — 트리 + 폼 + 결과 요약
// ─────────────────────────────────────────────────────────
describe('T-CONN-PG-03: getPublicKey 노드 렌더', () => {
  it('트리에 account:getPublicKey method 노드가 존재한다', () => {
    const api = (window as any)._playgroundTestAPI
    expect(api).toBeDefined()

    function find(items: any[]): any {
      for (const item of items) {
        if (item.kind === 'method' && item.id === 'account:getPublicKey') return item
        if (item.items) {
          const hit = find(item.items)
          if (hit) return hit
        }
      }
      return null
    }
    const node = find(api.TREE)
    expect(node).toBeTruthy()
    expect(node.label).toBe('getPublicKey')

    // DOM 트리 노드로도 렌더링된다
    const domNode = document.querySelector('[data-method-id="account:getPublicKey"]')
    expect(domNode).toBeTruthy()
  })

  it('노드 선택 시 chainId/keyPath 폼 필드가 default 값으로 렌더된다', () => {
    const node = document.querySelector('[data-method-id="account:getPublicKey"]') as HTMLElement
    node.click()

    const chainIdEl = document.getElementById('field-chainId') as HTMLInputElement
    const keyPathEl = document.getElementById('field-keyPath') as HTMLInputElement
    expect(chainIdEl).toBeTruthy()
    expect(keyPathEl).toBeTruthy()
    expect(chainIdEl.value).toBe('cip34:1-764824073')
    expect(keyPathEl.value).toBe("m/1852'/1815'/0'/0/0")
  })

  it('Send 클릭 시 dcent.getPublicKey({chainId, keyPath})로 dispatch된다', () => {
    const api = (window as any)._playgroundTestAPI
    const mockGetPublicKey = jest
      .fn()
      .mockResolvedValue({ header: { status: 'success' }, body: { parameter: CARDANO_PUBKEY_RESULT } })

    const node = document.querySelector('[data-method-id="account:getPublicKey"]') as HTMLElement
    node.click()
    api.simulateConnect(makeMockDcent(mockGetPublicKey), null, { model: 'Bio', firmware: '3.0' })

    // 폼 값 수정 (default와 다른 값으로 — 실제 입력 반영 검증)
    ;(document.getElementById('field-chainId') as HTMLInputElement).value = 'cip34:1-764824073'
    ;(document.getElementById('field-keyPath') as HTMLInputElement).value = "m/1852'/1815'/0'/2/0"
    ;(document.getElementById('btn-send') as HTMLButtonElement).click()

    expect(mockGetPublicKey).toHaveBeenCalledTimes(1)
    expect(mockGetPublicKey).toHaveBeenCalledWith({
      chainId: 'cip34:1-764824073',
      keyPath: "m/1852'/1815'/0'/2/0",
    })
  })

  it('결과 요약 helper가 payment/stake/drep 각 keyPath+publicKey를 추출한다 (undefined-safe)', () => {
    const api = (window as any)._playgroundTestAPI
    const rows = api._summarizeGetPublicKeyResult(CARDANO_PUBKEY_RESULT)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ role: 'payment', keyPath: "m/1852'/1815'/0'/0/0", publicKey: 'aa11' })
    expect(rows[1]).toEqual({ role: 'stake', keyPath: "m/1852'/1815'/0'/2/0", publicKey: 'bb22' })
    expect(rows[2]).toEqual({ role: 'drep', keyPath: "m/1852'/1815'/0'/3/0", publicKey: 'cc33' })

    // undefined-safe: 빈/부분 입력에도 throw 없이 가능한 만큼만 반환
    expect(api._summarizeGetPublicKeyResult(undefined)).toEqual([])
    expect(api._summarizeGetPublicKeyResult({})).toEqual([])
    expect(api._summarizeGetPublicKeyResult({ payment: { keyPath: "m/1'" } })).toEqual([
      { role: 'payment', keyPath: "m/1'", publicKey: undefined },
    ])
  })

  it('appendLog(getPublicKey)가 payment/stake/drep keyPath+publicKey 요약 라인을 렌더한다', () => {
    const api = (window as any)._playgroundTestAPI
    api.appendLog({ method: 'getPublicKey', request: {}, response: CARDANO_PUBKEY_RESULT })

    const summary = document.querySelector('.pubkey-summary')
    expect(summary).toBeTruthy()
    const roleLines = document.querySelectorAll('.pubkey-summary .pubkey-role')
    expect(roleLines.length).toBe(3)

    const text = summary!.textContent || ''
    // 번들(role) + keyPath + publicKey가 표시됨
    expect(text).toContain('payment')
    expect(text).toContain("m/1852'/1815'/0'/0/0")
    expect(text).toContain('aa11')
    expect(text).toContain('stake')
    expect(text).toContain('bb22')
    expect(text).toContain('drep')
    expect(text).toContain('cc33')
  })
})

// ─────────────────────────────────────────────────────────
// T-CONN-PG-04: getAddress rewardAddress 라인 (Cardano 한정)
// ─────────────────────────────────────────────────────────
describe('T-CONN-PG-04: getAddress rewardAddress 렌더', () => {
  it('요약 helper가 rewardAddress를 추출한다 (있을 때만)', () => {
    const api = (window as any)._playgroundTestAPI
    expect(api._summarizeGetAddressResult({ address: 'addr1...', rewardAddress: 'stake1...' }))
      .toEqual({ address: 'addr1...', rewardAddress: 'stake1...' })
    // 비-Cardano: rewardAddress 부재 → 미포함 (undefined-safe)
    expect(api._summarizeGetAddressResult({ address: '0xabc' })).toEqual({ address: '0xabc' })
    expect(api._summarizeGetAddressResult(undefined)).toEqual({})
  })

  it('appendLog(getAddress) — Cardano 응답이면 rewardAddress 라인 표시', () => {
    const api = (window as any)._playgroundTestAPI
    api.appendLog({
      method: 'getAddress',
      request: {},
      response: { address: 'addr1qxy...', rewardAddress: 'stake1uxy...' },
    })

    const rwLine = document.querySelector('.reward-address-line')
    expect(rwLine).toBeTruthy()
    expect(rwLine!.textContent).toContain('rewardAddress')
    expect(rwLine!.textContent).toContain('stake1uxy...')
  })

  it('appendLog(getAddress) — 비-Cardano 응답(rewardAddress 부재)이면 라인 미표시', () => {
    const api = (window as any)._playgroundTestAPI
    api.appendLog({
      method: 'getAddress',
      request: {},
      response: { address: '0xabc123' },
    })

    expect(document.querySelector('.reward-address-line')).toBeNull()
  })

  it('appendLog(getAddress) — rewardAddress가 string이 아니면 라인 미표시 (undefined-safe)', () => {
    const api = (window as any)._playgroundTestAPI
    api.appendLog({
      method: 'getAddress',
      request: {},
      response: { address: '0xabc', rewardAddress: 12345 as any },
    })

    expect(document.querySelector('.reward-address-line')).toBeNull()
  })
})
