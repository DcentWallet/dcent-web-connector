/**
 * getPublicKey v2 facade 단위 테스트 (m09-04-21)
 *
 * getAddress v2 chainId facade(address.test.ts)와 동형. mock transport(`transport.send`)로
 * sdk를 대체하여 connector facade의 송신 envelope + 응답/에러 passthrough를 검증한다.
 *
 *   T-CONN-GP-01: getPublicKey({chainId, keyPath}) → method='getPublicKey' + chainId 필드 +
 *                 params={chainId, keyPath} 송신 + 응답 {payment,stake,drep} passthrough.
 *   T-CONN-GP-02: chain-agnostic — 서로 다른 chainId 다수에 대해 모두 method='getPublicKey'
 *                 (chain enum / PREFIX_TO_METHOD / chain-prefixed switch 부재).
 *   T-CONN-GP-05: sdk INVALID_PARAMS(-32602) → v1 'param_error'로 투명 surface (unknown chainId).
 *   T-CONN-GP-06: sdk METHOD_NOT_FOUND(-32601) → v1 'method_not_found'로 투명 surface
 *                 (유효한 비-Cardano chainId — facade가 모든 에러 코드를 가공 없이 전달).
 *   + 입력 검증(boundary-validation / dapp-input-sanitization):
 *     chainId 빈 문자열 / keyPath 누락 / addressFormat enum / prototype-pollution.
 *
 * NOTE: getPublicKey는 async function이므로 sync `throw`도 reject로 변환된다.
 *       에러 검증은 `await expect(...).rejects.toEqual(...)` 패턴 사용.
 */

import { getPublicKey, type GetPublicKeyV2Input } from '../../../../src/sign/publicKey'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

const expectV1Error = (code: string, message?: string) =>
  expect.objectContaining({
    body: {
      error: message !== undefined ? { code, message } : expect.objectContaining({ code }),
    },
  })

// Cardano getPublicKey 응답 fixture — sdk(m09-03-29) passthrough shape
const CARDANO_PUBKEY_RESULT = {
  payment: { keyPath: "m/1852'/1815'/0'/0/0", publicKey: 'aa11' },
  stake: { keyPath: "m/1852'/1815'/0'/2/0", publicKey: 'bb22' },
  drep: { keyPath: "m/1852'/1815'/0'/3/0", publicKey: 'cc33' },
}

describe('getPublicKey v2 facade — m09-04-21', () => {
  test('T-CONN-GP-01: {chainId, keyPath} → method=getPublicKey + params 송신 + 응답 passthrough', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'gp-r1',
      result: CARDANO_PUBKEY_RESULT,
    })

    const resp = await getPublicKey({
      chainId: 'cip34:1-764824073',
      keyPath: "m/1852'/1815'/0'/0/0",
    })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.method).toBe('getPublicKey')
    expect(callArg.chainId).toBe('cip34:1-764824073')
    expect(callArg.params).toEqual({
      chainId: 'cip34:1-764824073',
      keyPath: "m/1852'/1815'/0'/0/0",
    })
    // getAddress v1 path의 흔적(coinType/path/optionParam)이 섞이지 않는지 가드
    expect(callArg.params).not.toHaveProperty('coinType')
    expect(callArg.params).not.toHaveProperty('path')

    // 응답 passthrough — role별 {keyPath, publicKey} 그대로 surface (connector 변환 없음)
    expect(resp.header.status).toBe('success')
    const param = resp.body.parameter as any
    expect(param.payment).toEqual({ keyPath: "m/1852'/1815'/0'/0/0", publicKey: 'aa11' })
    expect(param.stake).toEqual({ keyPath: "m/1852'/1815'/0'/2/0", publicKey: 'bb22' })
    expect(param.drep).toEqual({ keyPath: "m/1852'/1815'/0'/3/0", publicKey: 'cc33' })
  })

  test('T-CONN-GP-01.b: addressFormat 지정 시 params에 동행', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'gp-r1b',
      result: CARDANO_PUBKEY_RESULT,
    })

    await getPublicKey({
      chainId: 'cip34:1-764824073',
      keyPath: "m/1852'/1815'/0'/0/0",
      addressFormat: 'legacy',
    })

    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.params.addressFormat).toBe('legacy')
  })

  test('T-CONN-GP-01.c: addressFormat 미지정 시 params에 addressFormat 필드 부재', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'gp-r1c',
      result: CARDANO_PUBKEY_RESULT,
    })

    await getPublicKey({ chainId: 'cip34:1-764824073', keyPath: "m/1852'/1815'/0'/0/0" })

    const callArg = sendSpy.mock.calls[0][0] as any
    expect(callArg.params).not.toHaveProperty('addressFormat')
  })

  test('T-CONN-GP-02: chain-agnostic — 서로 다른 chainId 모두 method=getPublicKey', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'gp-iso',
      result: CARDANO_PUBKEY_RESULT,
    })

    const chainIds = [
      'cip34:1-764824073',
      'eip155:1/slip44:60',
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    ]
    for (const chainId of chainIds) {
      await getPublicKey({ chainId, keyPath: "m/44'/0'/0'/0/0" })
    }

    expect(sendSpy).toHaveBeenCalledTimes(chainIds.length)
    for (let i = 0; i < chainIds.length; i++) {
      // chain enum / PREFIX_TO_METHOD / chain-prefixed switch 추가 없이 chain-agnostic
      expect(sendSpy.mock.calls[i][0].method).toBe('getPublicKey')
      expect(sendSpy.mock.calls[i][0].chainId).toBe(chainIds[i])
    }
  })

  test('T-CONN-GP-05: sdk INVALID_PARAMS(-32602) → v1 param_error로 투명 surface', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'gp-err-32602',
      error: { code: -32602, message: 'unknown chainId' },
    })

    const resp = await getPublicKey({
      chainId: 'cip34:9-unknown',
      keyPath: "m/1852'/1815'/0'/0/0",
    })

    // facade는 에러를 가공하지 않음 — _call 표준 매핑(-32602 → 'param_error')만 거침
    expect(resp.header.status).toBe('failure')
    expect(resp.body.error?.code).toBe('param_error')
    expect(resp.body.error?.message).toBe('unknown chainId')
  })

  test('T-CONN-GP-06: sdk METHOD_NOT_FOUND(-32601) → v1 method_not_found로 투명 surface', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'gp-err-32601',
      error: { code: -32601, message: 'getPublicKey not supported for this chain' },
    })

    // 유효한(whitelist 통과) 비-Cardano chainId — facade는 그대로 forward, sdk가 -32601 반환
    const resp = await getPublicKey({
      chainId: 'eip155:1/slip44:60',
      keyPath: "m/44'/60'/0'/0/0",
    })

    expect(resp.header.status).toBe('failure')
    expect(resp.body.error?.code).toBe('method_not_found')
    expect(resp.body.error?.message).toBe('getPublicKey not supported for this chain')
  })
})

describe('getPublicKey v2 facade — 입력 검증 (boundary-validation / dapp-input-sanitization)', () => {
  test('chainId 빈 문자열 → param_error reject', async () => {
    await expect(
      getPublicKey({ chainId: '', keyPath: "m/1852'/1815'/0'/0/0" }),
    ).rejects.toEqual(expectV1Error('param_error', 'chainId required'))
  })

  test('chainId가 string이 아님 → param_error reject', async () => {
    await expect(
      getPublicKey({ chainId: 123 as unknown as string, keyPath: "m/1852'/1815'/0'/0/0" }),
    ).rejects.toEqual(expectV1Error('param_error', 'chainId required'))
  })

  test('chainId whitelist 위반(특수문자) → param_error reject', async () => {
    await expect(
      getPublicKey({ chainId: 'cip34:1@#$', keyPath: "m/1852'/1815'/0'/0/0" }),
    ).rejects.toEqual(expectV1Error('param_error', 'chainId required'))
  })

  test('keyPath 누락 → param_error reject', async () => {
    await expect(
      getPublicKey({ chainId: 'cip34:1-764824073' } as unknown as GetPublicKeyV2Input),
    ).rejects.toEqual(expectV1Error('param_error', 'keyPath required'))
  })

  test('keyPath 빈 문자열 → param_error reject', async () => {
    await expect(
      getPublicKey({ chainId: 'cip34:1-764824073', keyPath: '' }),
    ).rejects.toEqual(expectV1Error('param_error', 'keyPath required'))
  })

  test('addressFormat invalid enum → param_error reject', async () => {
    await expect(
      getPublicKey({
        chainId: 'cip34:1-764824073',
        keyPath: "m/1852'/1815'/0'/0/0",
        addressFormat: 'invalid' as any,
      }),
    ).rejects.toEqual(expectV1Error('param_error'))
  })

  test('addressFormat 프로토타입 오염 키(__proto__) → param_error reject', async () => {
    await expect(
      getPublicKey({
        chainId: 'cip34:1-764824073',
        keyPath: "m/1852'/1815'/0'/0/0",
        addressFormat: '__proto__' as any,
      }),
    ).rejects.toEqual(expectV1Error('param_error'))
  })

  // boundary-validation / error-handling-consistency: non-object input은 raw TypeError가 아니라
  // dcentException(param_error)로 reject되어야 한다 (cross-review W2).
  test('input=undefined → param_error reject (raw TypeError 아님)', async () => {
    await expect(getPublicKey(undefined as any)).rejects.toEqual(
      expectV1Error('param_error', 'getPublicKey: input must be an object { chainId, keyPath }'),
    )
  })

  test('input=null → param_error reject', async () => {
    await expect(getPublicKey(null as any)).rejects.toEqual(
      expectV1Error('param_error', 'getPublicKey: input must be an object { chainId, keyPath }'),
    )
  })

  test('input=array → param_error reject (typeof [] === object 함정 명시 거부)', async () => {
    await expect(getPublicKey(['cip34:1-764824073'] as any)).rejects.toEqual(
      expectV1Error('param_error', 'getPublicKey: input must be an object { chainId, keyPath }'),
    )
  })

  test('input=string(primitive) → param_error reject', async () => {
    await expect(getPublicKey('cip34:1-764824073' as any)).rejects.toEqual(
      expectV1Error('param_error', 'getPublicKey: input must be an object { chainId, keyPath }'),
    )
  })
})

describe('getPublicKey v2 facade — mutation 격리 (nested payload, cross-review W1)', () => {
  // T-SEC-MUT: getPublicKey 응답의 nested role 객체(payment/stake/drep)를 호출자가 변경해도
  // popup이 보낸 원본 / 같은 객체를 재사용하는 다음 응답에 leak되지 않아야 한다.
  test('nested publicKey mutation이 다음 getPublicKey 호출에 leak되지 않음', async () => {
    const { transport } = ensureSingleton()
    // 같은 응답 객체를 두 번 반환 (popup이 객체를 재사용하는 worst case — T-MUT-RESP 패턴)
    const sharedResult = {
      payment: { keyPath: "m/1852'/1815'/0'/0/0", publicKey: 'aa11' },
      stake: { keyPath: "m/1852'/1815'/0'/2/0", publicKey: 'bb22' },
      drep: { keyPath: "m/1852'/1815'/0'/3/0", publicKey: 'cc33' },
    }
    jest.spyOn(transport, 'send').mockResolvedValue({ id: 'gp-mut', result: sharedResult })

    const a = await getPublicKey({ chainId: 'cip34:1-764824073', keyPath: "m/1852'/1815'/0'/0/0" })
    // App이 반환된 nested role 객체를 in-place 변경
    ;(a.body.parameter as any).payment.publicKey = 'ffff'

    const b = await getPublicKey({ chainId: 'cip34:1-764824073', keyPath: "m/1852'/1815'/0'/0/0" })
    // 두 번째 응답은 오염되지 않아야 함
    expect((b.body.parameter as any).payment.publicKey).toBe('aa11')
    // 두 응답의 nested 객체는 서로 다른 reference
    expect((a.body.parameter as any).payment).not.toBe((b.body.parameter as any).payment)
    // popup 원본도 오염되지 않아야 함
    expect(sharedResult.payment.publicKey).toBe('aa11')
  })
})
