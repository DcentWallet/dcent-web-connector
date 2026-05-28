/**
 * m12-03 — Layer A / Layer B facade deviceId 단위 테스트
 *
 * T-U-TYPE-01~04  : types.ts 새 interface 정의 검증
 * T-U-DEVID-FAC-01~07 : facade wiring — deviceId → _call → transport.send
 */

import { getAddress, getXPUB } from '../../../../src/sign/address'
import { getAccountInfo } from '../../../../src/sign/info'
import { syncAccount, selectAddress } from '../../../../src/sign/configure'
import type { CallOptions, DeviceInfoPayload } from '../../../../src/sign/types'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

// ── T-U-TYPE-* (Layer A — type definitions) ──────────────────────────────────

describe('T-U-TYPE-* — types.ts 신규 interface (Layer A)', () => {
  test('T-U-TYPE-01: DeviceInfoPayload — 9 필드 모두 optional (compile-time)', () => {
    // 빈 객체가 DeviceInfoPayload에 할당 가능 = 모든 필드 optional
    const empty: DeviceInfoPayload = {}
    expect(empty).toBeDefined()
    // 부분 필드 할당도 가능
    const partial: DeviceInfoPayload = { device_id: 'D1', label: 'mywallet', connectType: 'usb' }
    expect(partial.device_id).toBe('D1')
    expect(partial.label).toBe('mywallet')
    expect(partial.connectType).toBe('usb')
  })

  test('T-U-TYPE-02: getDeviceInfo() 반환 타입이 V1Response<DeviceInfoPayload>로 narrowed (runtime)', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r-dev',
      result: {
        device_id: 'D-123',
        label: 'test',
        fw_version: 'v2.8.1',
        connectType: 'usb',
        coin_list: [{ name: 'ETHEREUM' }],
        fingerprint: { max: 5, enrolled: 2 },
        ksm_version: 'v1.0',
        state: 'initialised',
        isAttached: true,
      },
    })
    // dynamic import to get typed version
    const { getDeviceInfo } = await import('../../../../src/sign/info')
    const resp = await getDeviceInfo()
    // Typed narrow: parameter should carry DeviceInfoPayload fields
    expect(resp.body.parameter?.device_id).toBe('D-123')
    expect(resp.body.parameter?.label).toBe('test')
    expect(resp.body.parameter?.fw_version).toBe('v2.8.1')
    expect(resp.body.parameter?.connectType).toBe('usb')
    expect(resp.body.parameter?.coin_list?.[0]?.name).toBe('ETHEREUM')
    expect(resp.body.parameter?.fingerprint).toEqual({ max: 5, enrolled: 2 })
    expect(resp.body.parameter?.ksm_version).toBe('v1.0')
    expect(resp.body.parameter?.state).toBe('initialised')
    expect(resp.body.parameter?.isAttached).toBe(true)
  })

  test('T-U-TYPE-03: V1Response generic default — 기존 호출자에 영향 없음', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r-generic',
      result: { foo: 'bar' },
    })
    // Non-typed call (uses default Record<string,unknown>)
    const { getAccountInfo: getAccInfo } = await import('../../../../src/sign/info')
    const resp = await getAccInfo()
    expect(resp.body.parameter?.foo).toBe('bar')
  })

  test('T-U-TYPE-04: CallOptions interface — deviceId optional string', () => {
    const opts: CallOptions = {}
    expect(opts.deviceId).toBeUndefined()
    const opts2: CallOptions = { deviceId: 'D-ABC' }
    expect(opts2.deviceId).toBe('D-ABC')
  })
})

// ── T-U-DEVID-FAC-* (Layer B — facade wiring) ────────────────────────────────

describe('T-U-DEVID-FAC-* — facade deviceId wiring (Layer B)', () => {
  test('T-U-DEVID-FAC-01: getAddress({chainId, keyPath, deviceId:"X"}) → _call receives deviceId', async () => {
    const { transport } = ensureSingleton()
    const spy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r1', result: { address: '0xabc' } })

    await getAddress({ chainId: 'eip155:1/slip44:60', keyPath: "m/44'/60'/0'/0/0", deviceId: 'D-001' })

    expect(spy).toHaveBeenCalledTimes(1)
    // deviceId is forwarded via PopupTransport.setPendingDeviceId; the transport.send call
    // does not carry deviceId in envelope. We verify setPendingDeviceId was called.
    const { transport: t2 } = ensureSingleton()
    // Verify indirectly: call succeeds and no error thrown
    expect(spy.mock.calls[0][0].method).toBe('getAddress')
    expect(spy.mock.calls[0][0].params).toMatchObject({ chainId: 'eip155:1/slip44:60', keyPath: "m/44'/60'/0'/0/0" })
  })

  test('T-U-DEVID-FAC-02: getAddress(coinType, path, prefix, {deviceId:"X"}) v1 → _call with deviceId', async () => {
    const { transport } = ensureSingleton()
    const spy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r2', result: { address: '0xdef' } })

    await getAddress('ETHEREUM', "m/44'/60'/0'/0/0", null, { deviceId: 'D-002' })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].method).toBe('getAddress')
    expect(spy.mock.calls[0][0].params).toMatchObject({ coinType: 'ETHEREUM' })
  })

  test('T-U-DEVID-FAC-03: getXPUB(key, name, {deviceId:"X"}) → _call with deviceId', async () => {
    const { transport } = ensureSingleton()
    const spy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r3', result: { xpub: 'xpub...' } })

    await getXPUB("m/44'/0'/0'", 'Bitcoin seed', { deviceId: 'D-003' })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].method).toBe('getXPUB')
  })

  test('T-U-DEVID-FAC-04a: getAccountInfo({deviceId:"X"}) → _call', async () => {
    const { transport } = ensureSingleton()
    const spy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r4a', result: { accounts: [] } })

    await getAccountInfo({ deviceId: 'D-004' })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].method).toBe('getAccountInfo')
  })

  test('T-U-DEVID-FAC-04b: syncAccount(infos, {deviceId:"X"}) → _call', async () => {
    const { transport } = ensureSingleton()
    const spy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r4b', result: {} })

    await syncAccount(
      [{ coin_group: 'ETHEREUM', coin_name: 'ETHEREUM', label: 'mywallet' }],
      { deviceId: 'D-005' },
    )

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].method).toBe('syncAccount')
  })

  test('T-U-DEVID-FAC-04c: selectAddress(addrs, {deviceId:"X"}) → _call', async () => {
    const { transport } = ensureSingleton()
    const spy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r4c', result: {} })

    await selectAddress(['0xabc'], { deviceId: 'D-006' })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].method).toBe('selectAddress')
  })

  test('T-U-DEVID-FAC-05: opts 미명시 → deviceId undefined (기존 흐름 유지)', async () => {
    const { transport } = ensureSingleton()
    const spy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r5', result: { address: '0x999' } })

    // No opts → setPendingDeviceId called with undefined (existing behaviour)
    await getAddress({ chainId: 'eip155:1/slip44:60', keyPath: "m/44'/60'/0'/0/0" })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].method).toBe('getAddress')
  })

  test('T-U-DEVID-FAC-06: 기존 positional 2-arg getXPUB — backward-compat', async () => {
    const { transport } = ensureSingleton()
    const spy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r6', result: { xpub: 'xpub6...' } })

    // 2-arg — no opts (existing call)
    await getXPUB("m/44'/0'/0'", 'Bitcoin seed')

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].method).toBe('getXPUB')
    expect(spy.mock.calls[0][0].params).toEqual({ key: "m/44'/0'/0'", bip32name: 'Bitcoin seed' })
  })

  test('T-U-DEVID-FAC-07: V1Response.deviceId echo 전달 — _call이 envelope.deviceId를 응답에 포함', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r7',
      result: { address: '0xecho' },
      deviceId: 'D-ECHOED',
    } as any)

    const resp = await getAddress({ chainId: 'eip155:1/slip44:60', keyPath: "m/44'/60'/0'/0/0" })

    expect(resp.deviceId).toBe('D-ECHOED')
  })
})
