/**
 * playground.signtx-evm.test.ts — EVM signTransaction 기능 단위 테스트
 *
 * jsdom 환경에서 index-v2.html + playground.js 로드 후
 * EVM 체인 데이터 로드 / 트리 빌드 / 폼 렌더링 / dispatcher 호출 흐름을 검증.
 *
 * T-U-EVM-01: simulateEvmLoad 후 트리에 EVM 체인 노드가 추가된다
 * T-U-EVM-02: EVM signTx 폼 — keyPath·transaction 누락 시 dispatcher 0건
 * T-U-EVM-03: sendSignTxEvm — transaction JSON 파싱 오류 시 dispatcher 0건
 * T-U-EVM-04: sendSignTxEvm — 정상 전송 시 signTransaction 요청 파라미터 검증
 * T-U-EVM-05: simulateEvmLoad 후 CHAIN_KEY_PATH Proxy가 defaultKeyPath를 반환한다
 */
import * as fs from 'fs'
import * as path from 'path'

// ── Playground 로드 helper ──────────────────────────────────────────────────
function loadPlayground(): void {
  const html = fs.readFileSync(
    path.resolve(__dirname, '../../../index-v2.html'),
    'utf8'
  )
  document.documentElement.innerHTML = html

  ;(window as any).PopupTransport = function (_opts: any) {
    return {
      send: jest.fn().mockResolvedValue({ id: 'stub-id', result: {} }),
      on: jest.fn(),
      off: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    }
  }
  ;(window as any).SerialRequestQueue = function (_transport: any) {
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

// ── Sample fixtures ──────────────────────────────────────────────────────────
const SAMPLE_CHAINS = [
  {
    chainId: 'eip155:1',
    family: 'ethereum',
    displayName: 'Ethereum',
    defaultKeyPath: "m/44'/60'/0'/0/0",
  },
  {
    chainId: 'eip155:137',
    family: 'ethereum',
    displayName: 'Polygon',
    defaultKeyPath: "m/44'/60'/0'/0/0",
  },
  {
    chainId: 'eip155:56',
    family: 'ethereum',
    displayName: 'BSC',
    defaultKeyPath: "m/44'/60'/0'/0/0",
  },
]

const SAMPLE_PRESETS = [
  {
    id: 'evm-transfer-1559',
    label: 'EVM transfer (EIP-1559)',
    note: 'Template only — edit nonce/maxFeePerGas before send',
    applicableChainIds: ['eip155:1', 'eip155:137', 'eip155:56'],
    transaction: {
      type: 2,
      to: '0x0000000000000000000000000000000000000000',
      value: '0x2386f26fc10000',
      gasLimit: '0x5208',
      maxFeePerGas: '0x77359400',
      maxPriorityFeePerGas: '0x3b9aca00',
      nonce: '0x0',
      data: '0x',
    },
  },
]

const VALID_TX_JSON = JSON.stringify({
  type: 2,
  to: '0x0000000000000000000000000000000000000000',
  value: '0x2386f26fc10000',
  gasLimit: '0x5208',
  maxFeePerGas: '0x77359400',
  maxPriorityFeePerGas: '0x3b9aca00',
  nonce: '0x01',
  data: '0x',
})

// ── Setup / teardown ─────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// T-U-EVM-01: simulateEvmLoad 후 EVM signTx 체인 트리 노드가 추가된다
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-EVM-01: simulateEvmLoad 후 EVM 체인 노드가 TREE에 추가된다', () => {
  const api = (window as any)._playgroundTestAPI

  // 로드 전: placeholder 제외 메서드 개수
  // m11-01-01: account/device 그룹 8 method + sign message 4 method = 12
  // m11-01-03: Bitcoin Tx Builder 4 method 추가 → 16
  const beforeCount = api.countMethodNodes()
  expect(beforeCount).toBe(16)

  // EVM 체인 로드 시뮬레이션
  api.simulateEvmLoad(SAMPLE_CHAINS, SAMPLE_PRESETS)

  // 로드 후: +3 (eip155:1, eip155:137, eip155:56)
  const afterCount = api.countMethodNodes()
  expect(afterCount).toBe(beforeCount + SAMPLE_CHAINS.length)

  // evmChainsMap 채워짐
  const chainsMap = api.getEvmChainsMap()
  expect(chainsMap['eip155:1']).toBeDefined()
  expect(chainsMap['eip155:137']).toBeDefined()

  // DOM에도 signTx:evm: 노드 존재
  const evmNodes = document.querySelectorAll('[data-method-id^="signTx:evm:"]')
  expect(evmNodes.length).toBe(SAMPLE_CHAINS.length)
})

// m08-01-05 helper: facade-shaped mock dcent
function makeMockDcent (signImpl?: jest.Mock) {
  return {
    sign: signImpl || jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
    getDeviceInfo: jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: {} } }),
    popupWindowClose: jest.fn(),
    setConnectionListener: jest.fn(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T-U-EVM-02: EVM signTx 폼 — keyPath·transaction 누락 시 dispatcher 0건
// m08-01-05: facade dcent.sign 호출 여부로 검증
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-EVM-02: keyPath 누락 시 Send → dispatcher 0건', () => {
  const api = (window as any)._playgroundTestAPI

  api.simulateEvmLoad(SAMPLE_CHAINS, SAMPLE_PRESETS)

  const mockDcent = makeMockDcent()
  api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })

  // eip155:1 노드 선택
  const evmNode = document.querySelector('[data-method-id="signTx:evm:eip155:1"]') as HTMLElement
  expect(evmNode).not.toBeNull()
  evmNode.click()

  // keyPath 비움
  const keyPathEl = document.getElementById('field-keyPath') as HTMLInputElement
  if (keyPathEl) keyPathEl.value = ''

  // transaction 채움
  const txEl = document.getElementById('field-transaction') as HTMLTextAreaElement
  if (txEl) txEl.value = VALID_TX_JSON

  document.getElementById('btn-send')?.click()

  expect(mockDcent.sign).not.toHaveBeenCalled()
})

it('T-U-EVM-02b: transaction 누락 시 Send → dispatcher 0건', () => {
  const api = (window as any)._playgroundTestAPI

  api.simulateEvmLoad(SAMPLE_CHAINS, SAMPLE_PRESETS)

  const mockDcent = makeMockDcent()
  api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })

  const evmNode = document.querySelector('[data-method-id="signTx:evm:eip155:1"]') as HTMLElement
  evmNode.click()

  const keyPathEl = document.getElementById('field-keyPath') as HTMLInputElement
  if (keyPathEl) keyPathEl.value = "m/44'/60'/0'/0/0"

  // transaction 비움
  const txEl = document.getElementById('field-transaction') as HTMLTextAreaElement
  if (txEl) txEl.value = ''

  document.getElementById('btn-send')?.click()

  expect(mockDcent.sign).not.toHaveBeenCalled()
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-EVM-03: transaction JSON 파싱 오류 시 dispatcher 0건
// boundary-validation: JSON 파싱 실패 → showFieldError + return (appendLog 없음)
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-EVM-03: 잘못된 JSON transaction → dispatcher 0건 (boundary-validation early return)', () => {
  const api = (window as any)._playgroundTestAPI

  api.simulateEvmLoad(SAMPLE_CHAINS, SAMPLE_PRESETS)
  api.clearLogs()

  const mockDcent = makeMockDcent()
  api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })

  const evmNode = document.querySelector('[data-method-id="signTx:evm:eip155:1"]') as HTMLElement
  evmNode.click()

  const keyPathEl = document.getElementById('field-keyPath') as HTMLInputElement
  if (keyPathEl) keyPathEl.value = "m/44'/60'/0'/0/0"

  const txEl = document.getElementById('field-transaction') as HTMLTextAreaElement
  if (txEl) txEl.value = '{ not valid json }'

  document.getElementById('btn-send')?.click()

  // boundary-validation: JSON 파싱 실패 → dispatcher 호출 없음
  expect(mockDcent.sign).not.toHaveBeenCalled()

  // early return이므로 log entry 없음 (showFieldError만 호출)
  const entries = api.getLogEntries()
  expect(entries.length).toBe(0)
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-EVM-04 / T-U-01: 정상 전송 — facade dcent.sign({method, chainId, payload}) 호출 검증
// m09-04-01.5: NEW schema 마이그레이션 — method='signTransaction' (intent literal),
//   chainId(CAIP-19)는 top-level, payload는 { keyPath, transaction }만 포함
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-EVM-04: 정상 전송 시 dcent.sign({method: "signTransaction", chainId: CAIP-19, payload}) 호출', async () => {
  const api = (window as any)._playgroundTestAPI

  api.simulateEvmLoad(SAMPLE_CHAINS, SAMPLE_PRESETS)
  api.clearLogs()

  const mockSign = jest.fn().mockResolvedValue({ header: { status: 'success' }, body: { parameter: { signedTx: '0xabc' } } })
  const mockDcent = makeMockDcent(mockSign)
  api.simulateConnect(mockDcent, null, { model: 'Bio', firmware: '3.0' })

  // eip155:137 (Polygon) 선택 — SAMPLE_CHAINS의 chainId 그대로 사용
  const evmNode = document.querySelector('[data-method-id="signTx:evm:eip155:137"]') as HTMLElement
  evmNode.click()

  const keyPathEl = document.getElementById('field-keyPath') as HTMLInputElement
  if (keyPathEl) keyPathEl.value = "m/44'/60'/0'/0/0"

  const txEl = document.getElementById('field-transaction') as HTMLTextAreaElement
  if (txEl) txEl.value = VALID_TX_JSON

  document.getElementById('btn-send')?.click()

  // Promise 완료 대기
  await new Promise((r) => setTimeout(r, 50))

  // dcent.sign 호출 검증 — { method: 'signTransaction', chainId, payload: { keyPath, transaction } }
  // m09-04-01.5: NEW schema — method는 intent literal, chainId(CAIP-19)는 top-level,
  //   payload는 { keyPath, transaction }만 포함 (chainId 제거).
  expect(mockSign).toHaveBeenCalledTimes(1)
  const signInput = mockSign.mock.calls[0][0]
  expect(signInput.method).toBe('signTransaction')
  expect(signInput.chainId).toBe('eip155:137')
  expect(signInput.payload.keyPath).toBe("m/44'/60'/0'/0/0")
  expect(signInput.payload.transaction).toEqual(JSON.parse(VALID_TX_JSON))
  // payload에 chainId 키가 없어야 함 (top-level로 이동)
  expect(signInput.payload.chainId).toBeUndefined()

  // 로그 확인
  const entries = api.getLogEntries()
  expect(entries.length).toBeGreaterThan(0)
  const lastEntry = entries[entries.length - 1]
  expect(lastEntry.method).toBe('signTransaction')
  expect(lastEntry.error).toBeUndefined()
})

// ─────────────────────────────────────────────────────────────────────────────
// T-U-EVM-05: simulateEvmLoad 후 CHAIN_KEY_PATH Proxy가 defaultKeyPath를 반환한다
// ─────────────────────────────────────────────────────────────────────────────
it('T-U-EVM-05: simulateEvmLoad 후 CHAIN_KEY_PATH Proxy — eip155:1 defaultKeyPath 반환', () => {
  const api = (window as any)._playgroundTestAPI

  // 로드 전: fallback 반환
  expect(api.CHAIN_KEY_PATH['eip155:1']).toBe("m/44'/60'/0'/0/0")

  // 로드 후: chains 데이터의 defaultKeyPath 반환
  api.simulateEvmLoad(
    [
      {
        chainId: 'eip155:1',
        family: 'ethereum',
        displayName: 'Ethereum',
        defaultKeyPath: "m/44'/60'/0'/0/0",
      },
      {
        chainId: 'eip155:8217',
        family: 'ethereum',
        displayName: 'Kaia',
        defaultKeyPath: "m/44'/8217'/0'/0/0",
      },
    ],
    []
  )

  expect(api.CHAIN_KEY_PATH['eip155:1']).toBe("m/44'/60'/0'/0/0")
  expect(api.CHAIN_KEY_PATH['eip155:8217']).toBe("m/44'/8217'/0'/0/0")

  // m06-01-03: chains.json 통합 후 Solana keyPath는 wallet-models derivationFormat 기준 (m/44'/501'/0')
  expect(api.CHAIN_KEY_PATH['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']).toBe("m/44'/501'/0'")
})
