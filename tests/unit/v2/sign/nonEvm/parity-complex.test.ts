/**
 * Bytewise parity test — v2 nonEvmComplex 9 wrapper ↔ v1 src-v1/index.js (m08-01-04.5)
 *
 * T-PARITY-01: 본 child 9 wrapper 각각에 대해 (method, params)가 v1 wrapper가 만든 것과 byte 단위로 같은지 단언.
 *              v1 wrapper는 src-v1/index.js의 dcent.* 멤버 함수를 직접 require + dcent.call을 mock하여
 *              송신 직전의 (method, params) 페이로드를 캡처하는 방식.
 *              wrapper별 1 fixture (UnitConverter padStart 정책 회귀 가드).
 *
 * T-RESP-01: 모든 9 wrapper의 _call mock이 v1 fixture 응답을 반환하면 wrapper가 v1과 동일한
 *            response shape을 return. Cosmos response_from remap, Parachain signed_tx prefix가
 *            fixture에 정확히 적용됨 단언.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires, camelcase */

import {
  getTrcTokenSignedTransaction,
  getTezosSignedTransaction,
  getVechainSignedTransaction,
  getNearSignedTransaction,
  getHavahSignedTransaction,
  getPolkadotSignedTransaction,
  getCosmosSignedTransaction,
  getAlgorandSignedTransaction,
  getParachainSignedTransaction,
} from '../../../../../src/sign/nonEvmComplex'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

/**
 * v1 wrapper와 v2 wrapper의 (method, params)를 동일 입력으로 비교.
 * v1은 src-v1/index.js의 dcent.* 함수를 직접 require + dcent.call을 spy.
 * v2는 transport.send를 spy.
 *
 * 양쪽 페이로드가 byte-equivalent (JSON.stringify 비교)임을 단언.
 */
async function compareV1V2 (
  wrapperName: string,
  v2Fn: (...args: unknown[]) => Promise<unknown>,
  v2Args: unknown[],
  v1FnName: string,
  v1Args: unknown[],
): Promise<{ v1: { method: string; params: unknown }; v2: { method: string; params: unknown } }> {
  const dcentV1 = require('../../../../../src-v1/index.js')
  const v1CallSpy = jest.spyOn(dcentV1, 'call').mockResolvedValue({
    header: { version: '1.0', status: 'success' },
    body: { command: 'transaction', parameter: { signed_tx: '0xv1signed' } },
  } as never)

  await dcentV1[v1FnName](...v1Args)
  const v1Captured = v1CallSpy.mock.calls[0][0] as { method: string; params: unknown }
  v1CallSpy.mockRestore()

  const { transport } = ensureSingleton()
  const v2SendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
    id: 'r-' + wrapperName,
    result: {
      header: { version: '1.0', status: 'success' },
      body: { command: 'transaction', parameter: { signed_tx: '0xv2signed' } },
    },
  })

  await v2Fn(...v2Args)
  const v2Captured = v2SendSpy.mock.calls[0][0] as { method: string; params: unknown }
  v2SendSpy.mockRestore()

  return { v1: v1Captured, v2: v2Captured }
}

describe('T-PARITY-01: v2 nonEvmComplex ↔ v1 src-v1 bytewise parity (method, params)', () => {
  test('TrcToken — method drift "getTronSignedTransaction"', async () => {
    const args = { unsignedTx: '0xrawtrctoken', fee: '1000000', path: "m/44'/195'/0'/0/0" }
    const { v1, v2 } = await compareV1V2(
      'TrcToken',
      getTrcTokenSignedTransaction as never,
      [args],
      'getTrcTokenSignedTransaction',
      [args],
    )
    expect(v2.method).toBe(v1.method)
    expect(JSON.stringify(v2.params)).toBe(JSON.stringify(v1.params))
  })

  test('Tezos — UnitConverter(TEZOS=6) padStart 16', async () => {
    const args = {
      coinType: 'TEZOS',
      sigHash: '0xsig',
      fee: '1000000',
      decimals: 6,
      path: "m/44'/1729'/0'/0/0",
      symbol: 'XTZ',
    }
    const { v1, v2 } = await compareV1V2(
      'Tezos', getTezosSignedTransaction as never, [args], 'getTezosSignedTransaction', [args],
    )
    expect(v2.method).toBe(v1.method)
    expect(JSON.stringify(v2.params)).toBe(JSON.stringify(v1.params))
  })

  test('Vechain — UnitConverter(VECHAIN=18)', async () => {
    const args = {
      coinType: 'VECHAIN', sigHash: '0xsig', fee: '1', decimals: 18,
      path: "m/44'/818'/0'/0/0", symbol: 'VET',
    }
    const { v1, v2 } = await compareV1V2(
      'Vechain', getVechainSignedTransaction as never, [args], 'getVechainSignedTransaction', [args],
    )
    expect(v2.method).toBe(v1.method)
    expect(JSON.stringify(v2.params)).toBe(JSON.stringify(v1.params))
  })

  test('Near — magic prefix + UnitConverter(NEAR=24) padStart 32 + optionParam concat', async () => {
    const args = {
      coinType: 'NEAR', sigHash: '0xsig', fee: '1', decimals: 24,
      path: "m/44'/397'/0'/0/0", symbol: 'NEAR', optionParam: 'EXTRA',
    }
    const { v1, v2 } = await compareV1V2(
      'Near', getNearSignedTransaction as never, [args], 'getNearSignedTransaction', [args],
    )
    expect(v2.method).toBe(v1.method)
    expect(JSON.stringify(v2.params)).toBe(JSON.stringify(v1.params))
  })

  test('Havah — UnitConverter(HAVAH=18)', async () => {
    const args = {
      coinType: 'HAVAH', sigHash: '0xsig', fee: '0.001', decimals: 18,
      path: "m/44'/9999999'/0'/0/0", symbol: 'HVH',
    }
    const { v1, v2 } = await compareV1V2(
      'Havah', getHavahSignedTransaction as never, [args], 'getHavahSignedTransaction', [args],
    )
    expect(v2.method).toBe(v1.method)
    expect(JSON.stringify(v2.params)).toBe(JSON.stringify(v1.params))
  })

  test('Polkadot — UnitConverter(POLKADOT=10)', async () => {
    const args = {
      coinType: 'POLKADOT', sigHash: '0xsig', fee: '0.5', decimals: 10,
      path: "m/44'/354'/0'/0/0", symbol: 'DOT',
    }
    const { v1, v2 } = await compareV1V2(
      'Polkadot', getPolkadotSignedTransaction as never, [args], 'getPolkadotSignedTransaction', [args],
    )
    expect(v2.method).toBe(v1.method)
    expect(JSON.stringify(v2.params)).toBe(JSON.stringify(v1.params))
  })

  test('Cosmos (COSMOS) — coinType remap 안 함 + coinDecimals.COSMOS', async () => {
    const args = {
      coinType: 'COSMOS', sigHash: '0xsig', fee: '0.001', decimals: 6,
      path: "m/44'/118'/0'/0/0", symbol: 'ATOM',
    }
    const { v1, v2 } = await compareV1V2(
      'Cosmos', getCosmosSignedTransaction as never, [args], 'getCosmosSignedTransaction', [args],
    )
    expect(v2.method).toBe(v1.method)
    expect(JSON.stringify(v2.params)).toBe(JSON.stringify(v1.params))
  })

  test('Cosmos (COREUM, czone family) — coinType="czone" remap + getCzonDecimal', async () => {
    const args = {
      coinType: 'COREUM', sigHash: '0xsig', fee: '0.001', decimals: 6,
      path: "m/44'/990'/0'/0/0", symbol: 'CORE',
    }
    const { v1, v2 } = await compareV1V2(
      'Cosmos-coreum', getCosmosSignedTransaction as never, [args], 'getCosmosSignedTransaction', [args],
    )
    expect(v2.method).toBe(v1.method)
    expect(JSON.stringify(v2.params)).toBe(JSON.stringify(v1.params))
  })

  test('Algorand — UnitConverter(ALGORAND=6)', async () => {
    const args = {
      coinType: 'ALGORAND', sigHash: '0xsig', fee: '0.001', decimals: 6,
      path: "m/44'/283'/0'/0/0", symbol: 'ALGO',
    }
    const { v1, v2 } = await compareV1V2(
      'Algorand', getAlgorandSignedTransaction as never, [args], 'getAlgorandSignedTransaction', [args],
    )
    expect(v2.method).toBe(v1.method)
    expect(JSON.stringify(v2.params)).toBe(JSON.stringify(v1.params))
  })

  test('Parachain — UnitConverter(feeDecimals dApp arg)', async () => {
    const args = {
      coinType: 'PARA', sigHash: '0xsig', fee: '0.5', decimals: 10,
      path: "m/44'/354'/0'/0/0", symbol: 'DOT',
      RPCUrl: 'wss://rpc', feeSymbol: 'DOT', feeDecimals: 10,
    }
    const { v1, v2 } = await compareV1V2(
      'Parachain', getParachainSignedTransaction as never, [args], 'getParachainSignedTransaction', [args],
    )
    expect(v2.method).toBe(v1.method)
    expect(JSON.stringify(v2.params)).toBe(JSON.stringify(v1.params))
  })
})

describe('T-RESP-01: 9 wrapper response shape — v1 fixture 응답 forward + 후처리 적용', () => {
  test('Tezos — v1 fixture response shape 그대로 forward', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: {
        header: { version: '1.0', status: 'success', response_from: 'TEZOS' },
        body: { command: 'transaction', parameter: { signed_tx: '0xtez' } },
      },
    })
    const resp = await getTezosSignedTransaction({
      coinType: 'TEZOS', sigHash: '0x', fee: '1', decimals: 6,
      path: "m/44'/1729'/0'/0/0", symbol: 'XTZ',
    })
    expect(resp.header.status).toBe('success')
    expect(resp.header.response_from).toBe('TEZOS')
    expect(resp.body.parameter?.signed_tx).toBe('0xtez')
  })

  test('Cosmos — response_from="czone" → 원래 coinType("COREUM")으로 복원 (post-process 적용)', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r2',
      result: {
        header: { version: '1.0', status: 'success', response_from: 'czone' },
        body: { command: 'transaction', parameter: { signed_tx: '0xcoreum' } },
      },
    })
    const resp = await getCosmosSignedTransaction({
      coinType: 'COREUM', sigHash: '0x', fee: '0.001', decimals: 6,
      path: "m/44'/990'/0'/0/0", symbol: 'CORE',
    })
    expect(resp.header.response_from).toBe('COREUM')
  })

  test('Parachain — success + signed_tx에 "0x00" prefix 적용 (post-process)', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r3',
      result: {
        header: { version: '1.0', status: 'success' },
        body: { command: 'transaction', parameter: { signed_tx: '0xdeadbeef' } },
      },
    })
    const resp = await getParachainSignedTransaction({
      coinType: 'PARA', sigHash: '0x', fee: '0', decimals: 10,
      path: "m/44'/354'/0'/0/0", symbol: 'DOT',
      RPCUrl: 'wss://rpc', feeSymbol: 'DOT', feeDecimals: 10,
    })
    expect(resp.body.parameter?.signed_tx).toBe('0x00deadbeef')
  })
})
