/**
 * sign.ts (public sign API) 단위 테스트 (m09-04-01 fallback-only)
 *
 * chainToMethod 정적 매핑 제거 후, sign()은 chain 문자열을 method로 그대로 전달한다.
 *
 * T-U-01 / T-U-07: signTransaction / signMessage chain 그대로 전달
 * T-U-CAIP-01~04: CAIP-19 chain 4종 (eip155 / bip122 / xrpl / cosmos) method 그대로 전달 회귀 가드
 *                  (PITFALLS P2 mitigation — chainToMethod 제거 후 chain별 silent fail 방지)
 * + chain sanitize 통합 검증 (sanitize.test.ts와 별개로, sign 진입점에서 호출되는지 확인)
 */

import { sign } from '../../../../src/sign/sign'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'
import { ProviderError } from '../../../../src/error/ProviderError'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('sign — method 그대로 전달 (fallback-only)', () => {
  test('T-U-01: chain "signTransaction" → method "signTransaction" 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: {
        header: { version: '1.0', status: 'success' as const },
        body: { command: 'transaction', parameter: { signed_tx: '0xdeadbeef' } },
      },
    })

    const resp = await sign({
      chain: 'signTransaction',
      payload: { tx: { to: '0xdef', value: '0x1' } },
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].method).toBe('signTransaction')
    expect(sendSpy.mock.calls[0][0].params).toEqual({ tx: { to: '0xdef', value: '0x1' } })
    expect(resp.body.parameter?.signed_tx).toBe('0xdeadbeef')
  })

  test('T-U-07: chain "signMessage" → method "signMessage" 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r2',
      result: {
        header: { version: '1.0', status: 'success' as const },
        body: { command: 'sign_message', parameter: { sign: '0xsig' } },
      },
    })

    await sign({
      chain: 'signMessage',
      payload: { message: 'hello' },
    })

    expect(sendSpy.mock.calls[0][0].method).toBe('signMessage')
    expect(sendSpy.mock.calls[0][0].params).toEqual({ message: 'hello' })
  })

  test('T-U-CAIP-01: chain "eip155:1" → method 그대로 전달 (CAIP-19 fallback)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r3', result: {} })

    await sign({
      chain: 'eip155:1',
      payload: { tx: { to: '0xdef' } },
    })

    // chainToMethod 정적 매핑 제거 후: bridge sdk가 chain 식별자를 받아 자동 dispatch
    expect(sendSpy.mock.calls[0][0].method).toBe('eip155:1')
  })

  test('T-U-CAIP-02: chain "bip122:000000000019d6689c085ae165831e93" → method 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r4', result: {} })

    await sign({
      chain: 'bip122:000000000019d6689c085ae165831e93',
      payload: {},
    })

    expect(sendSpy.mock.calls[0][0].method).toBe('bip122:000000000019d6689c085ae165831e93')
  })

  test('T-U-CAIP-03: chain "xrpl:0" → method 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r5', result: {} })

    await sign({
      chain: 'xrpl:0',
      payload: {},
    })

    expect(sendSpy.mock.calls[0][0].method).toBe('xrpl:0')
  })

  test('T-U-CAIP-04: chain "cosmos:cosmoshub-4" → method 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r6', result: {} })

    await sign({
      chain: 'cosmos:cosmoshub-4',
      payload: {},
    })

    expect(sendSpy.mock.calls[0][0].method).toBe('cosmos:cosmoshub-4')
  })

  test('미정의 chain (SUI) → method로 그대로 사용 (fallback)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r7',
      result: { signed: 'sui_sig' },
    })

    const resp = await sign({
      chain: 'SUI',
      payload: { tx: 'serialized' },
    })

    expect(sendSpy.mock.calls[0][0].method).toBe('SUI')
    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter?.signed).toBe('sui_sig')
  })
})

describe('sign — chain sanitize 통합', () => {
  test('잘못된 type → throw ProviderError (sanitize 진입점 호출 확인)', async () => {
    await expect(sign({ chain: 123 as unknown as string, payload: {} })).rejects.toThrow(
      ProviderError,
    )
  })

  test('프로토타입 키 → throw', async () => {
    await expect(sign({ chain: '__proto__', payload: {} })).rejects.toThrow(ProviderError)
  })

  test('whitelist 위반 → throw', async () => {
    await expect(sign({ chain: 'evil<script>', payload: {} })).rejects.toThrow(ProviderError)
  })
})
