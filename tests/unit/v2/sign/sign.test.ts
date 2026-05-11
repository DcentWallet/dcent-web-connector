/**
 * sign.ts (public sign API) 단위 테스트 (m08-01-02)
 *
 * T-U-SIGN-01: sign({chain: 'eip155:1/...'}) → eth_signTransaction → _call
 * T-U-SIGN-02: sign({chain: 'SUI'}) — fallback (chain을 method로 그대로 사용)
 *
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

describe('sign — happy path', () => {
  test('T-U-SIGN-01: eip155 chain → eth_signTransaction method로 transport.send 호출', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r1',
      result: {
        header: { version: '1.0', status: 'success' as const },
        body: { command: 'transaction', parameter: { signed_tx: '0xdeadbeef' } },
      },
    })

    const resp = await sign({
      chain: 'eip155:1/erc20:0xabc',
      payload: { tx: { to: '0xdef', value: '0x1' } },
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].method).toBe('eth_signTransaction')
    expect(sendSpy.mock.calls[0][0].params).toEqual({ tx: { to: '0xdef', value: '0x1' } })
    expect(resp.body.parameter?.signed_tx).toBe('0xdeadbeef')
  })

  test('T-U-SIGN-02: 미정의 chain (SUI) → method로 그대로 사용 (fallback)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r2',
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

  test('bip122 → btc_signTransaction', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r3',
      result: {},
    })

    await sign({
      chain: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
      payload: {},
    })

    expect(sendSpy.mock.calls[0][0].method).toBe('btc_signTransaction')
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
