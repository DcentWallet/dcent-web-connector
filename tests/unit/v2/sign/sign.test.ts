/**
 * sign.ts (public sign API) 단위 테스트 (m09-04-01 NEW schema)
 *
 * NEW schema: sign({method, chainId, payload}) — 3-field
 *   - method: intent literal (signMessage / signTransaction) 또는 임의 fallback 문자열
 *   - chainId: CAIP-19 chain identifier (`eip155:1`, `bip122:...` 등)
 *   - payload: bridge sdk가 받을 transaction body / message body 등
 *
 * sign() 호출 시 envelope `{method, chainId, params: payload}`로 sdk에 송신.
 *
 * T-U-01: method='signTransaction' → envelope.method='signTransaction' 그대로 전달
 * T-U-07: method='signMessage' → envelope.method='signMessage' 그대로 전달
 * T-U-CAIP-01~04: chainId(eip155 / bip122 / xrpl / cosmos) → envelope.chainId 그대로 전달
 *                  (PITFALLS P2 mitigation — chainToMethod 제거 후 chain별 silent fail 방지)
 * + method / chainId sanitize 통합 검증 (sanitize.test.ts와 별개로, sign 진입점에서 호출되는지 확인)
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

describe('sign — NEW schema {method, chainId, payload}', () => {
  test('T-U-01: method="signTransaction" → envelope.method="signTransaction" 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: {
        header: { version: '1.0', status: 'success' as const },
        body: { command: 'transaction', parameter: { signed_tx: '0xdeadbeef' } },
      },
    })

    const resp = await sign({
      method: 'signTransaction',
      chainId: 'eip155:1',
      payload: { keyPath: "m/44'/60'/0'/0/0", transaction: { to: '0xdef', value: '0x1' } },
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].method).toBe('signTransaction')
    expect(sendSpy.mock.calls[0][0].chainId).toBe('eip155:1')
    expect(sendSpy.mock.calls[0][0].params).toEqual({
      keyPath: "m/44'/60'/0'/0/0",
      transaction: { to: '0xdef', value: '0x1' },
    })
    expect(resp.body.parameter?.signed_tx).toBe('0xdeadbeef')
  })

  test('T-U-07: method="signMessage" → envelope.method="signMessage" 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r2',
      result: {
        header: { version: '1.0', status: 'success' as const },
        body: { command: 'sign_message', parameter: { sign: '0xsig' } },
      },
    })

    await sign({
      method: 'signMessage',
      chainId: 'eip155:1',
      payload: { keyPath: "m/44'/60'/0'/0/0", message: 'hello' },
    })

    expect(sendSpy.mock.calls[0][0].method).toBe('signMessage')
    expect(sendSpy.mock.calls[0][0].chainId).toBe('eip155:1')
    expect(sendSpy.mock.calls[0][0].params).toEqual({
      keyPath: "m/44'/60'/0'/0/0",
      message: 'hello',
    })
  })

  test('T-U-CAIP-01: chainId="eip155:1" → envelope.chainId 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r3', result: {} })

    await sign({
      method: 'signTransaction',
      chainId: 'eip155:1',
      payload: { tx: { to: '0xdef' } },
    })

    expect(sendSpy.mock.calls[0][0].method).toBe('signTransaction')
    expect(sendSpy.mock.calls[0][0].chainId).toBe('eip155:1')
  })

  test('T-U-CAIP-02: chainId="bip122:000000000019d6689c085ae165831e93" → envelope.chainId 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r4', result: {} })

    await sign({
      method: 'signTransaction',
      chainId: 'bip122:000000000019d6689c085ae165831e93',
      payload: {},
    })

    expect(sendSpy.mock.calls[0][0].chainId).toBe('bip122:000000000019d6689c085ae165831e93')
  })

  test('T-U-CAIP-03: chainId="xrpl:0" → envelope.chainId 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r5', result: {} })

    await sign({
      method: 'signTransaction',
      chainId: 'xrpl:0',
      payload: {},
    })

    expect(sendSpy.mock.calls[0][0].chainId).toBe('xrpl:0')
  })

  test('T-U-CAIP-04: chainId="cosmos:cosmoshub-4" → envelope.chainId 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r6', result: {} })

    await sign({
      method: 'signTransaction',
      chainId: 'cosmos:cosmoshub-4',
      payload: {},
    })

    expect(sendSpy.mock.calls[0][0].chainId).toBe('cosmos:cosmoshub-4')
  })

  test('미정의 method (fallback) → envelope.method로 그대로 전달', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r7',
      result: { signed: 'sui_sig' },
    })

    const resp = await sign({
      method: 'customSignSui',
      chainId: 'sui:mainnet',
      payload: { tx: 'serialized' },
    })

    expect(sendSpy.mock.calls[0][0].method).toBe('customSignSui')
    expect(sendSpy.mock.calls[0][0].chainId).toBe('sui:mainnet')
    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter?.signed).toBe('sui_sig')
  })
})

describe('sign — sanitize 통합', () => {
  test('잘못된 method type → throw ProviderError (sanitize 진입점 호출 확인)', async () => {
    await expect(
      sign({ method: 123 as unknown as string, chainId: 'eip155:1', payload: {} }),
    ).rejects.toThrow(ProviderError)
  })

  test('잘못된 chainId type → throw ProviderError', async () => {
    await expect(
      sign({ method: 'signTransaction', chainId: 123 as unknown as string, payload: {} }),
    ).rejects.toThrow(ProviderError)
  })

  test('method가 프로토타입 키 → throw', async () => {
    await expect(
      sign({ method: '__proto__', chainId: 'eip155:1', payload: {} }),
    ).rejects.toThrow(ProviderError)
  })

  test('chainId가 프로토타입 키 → throw', async () => {
    await expect(
      sign({ method: 'signTransaction', chainId: '__proto__', payload: {} }),
    ).rejects.toThrow(ProviderError)
  })

  test('method whitelist 위반 → throw', async () => {
    await expect(
      sign({ method: 'evil<script>', chainId: 'eip155:1', payload: {} }),
    ).rejects.toThrow(ProviderError)
  })

  test('chainId whitelist 위반 → throw', async () => {
    await expect(
      sign({ method: 'signTransaction', chainId: 'eip155:1 ;evil', payload: {} }),
    ).rejects.toThrow(ProviderError)
  })

  test('빈 chainId → throw', async () => {
    await expect(
      sign({ method: 'signTransaction', chainId: '', payload: {} }),
    ).rejects.toThrow(ProviderError)
  })
})
