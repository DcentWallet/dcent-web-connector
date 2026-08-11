/**
 * info / getDeviceInfo / getAccountInfo 단위 테스트 (m08-01-02.5)
 *
 * T-U-INFO-01: info() — _call({method: 'info'}) 호출
 * T-U-DEVINFO-01: getDeviceInfo() — _call({method: 'getDeviceInfo'})
 * T-U-ACC-01: getAccountInfo() — _call({method: 'getAccountInfo'})
 *
 * 모두 인자 없이 _call로 method를 그대로 위임하는 wrapper.
 *
 * T-U-TYPE-01~03: DeviceInfoPayload / V1Response generic 타입 계약 검증.
 *   (m09-04-16에서 deviceid-facade.test.ts 삭제 시 함께 사라진 still-existing
 *    타입 커버리지를 이 파일로 이전 — deviceId 옵션과 무관한 getDeviceInfo
 *    반환 타입 narrow + V1Response generic default 계약이므로 보존. 삭제된
 *    T-U-TYPE-04(CallOptions)는 CallOptions 제거로 함께 폐기. T-U-TYPE-03은
 *    getAccountInfo가 V1Response<AccountListV2Payload>로 narrow된 현재 시점에
 *    맞춰 default-generic을 쓰는 info()로 대상 변경.)
 */

import { readFileSync } from 'fs'
import { resolve as resolvePath } from 'path'

import { info, getDeviceInfo, getAccountInfo } from '../../../../src/sign/info'
import type { DeviceInfoPayload } from '../../../../src/sign/types'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('read-only info functions — m08-01-02.5', () => {
  test('T-U-INFO-01: info() → _call({method: "info"})', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-info',
      result: { build: '1.2.3', running: true },
    })

    const resp = await info()

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0]).toMatchObject({ method: 'info' })
    expect(sendSpy.mock.calls[0][0].params).toBeUndefined()
    expect(resp.header.status).toBe('success')
    expect(resp.body.command).toBe('info')
    expect(resp.body.parameter).toEqual({ build: '1.2.3', running: true })
  })

  test('T-U-DEVINFO-01: getDeviceInfo() → _call({method: "getDeviceInfo"})', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-dev',
      result: { deviceId: 'D-XYZ', label: 'mywallet' },
    })

    const resp = await getDeviceInfo()

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].method).toBe('getDeviceInfo')
    expect(sendSpy.mock.calls[0][0].params).toBeUndefined()
    expect(resp.body.parameter?.deviceId).toBe('D-XYZ')
  })

  test('T-U-ACC-01: getAccountInfo() → _call({method: "getAccountInfo"})', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-acc',
      result: { accounts: [{ coin_group: 'BITCOIN', coin_name: 'BITCOIN', label: 'main' }] },
    })

    const resp = await getAccountInfo()

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].method).toBe('getAccountInfo')
    expect(resp.header.status).toBe('success')
    expect(Array.isArray(resp.body.parameter?.accounts)).toBe(true)
  })
})

// ── T-U-TYPE-* — 타입 계약 (deviceid-facade.test.ts에서 이전, m09-04-16) ──────
// deviceId 옵션과 무관한 still-existing 타입 커버리지. deviceId-facade 전용
// 테스트 삭제 시 함께 사라지지 않도록 여기로 보존한다.
// 주의: unit-v2는 babel-jest로 실행되어 TS 타입 어노테이션이 erase되므로
//   TYPE-01/03의 타입 할당은 "compile-time 강제"가 아니라 문서화 + 런타임 스모크다.
//   진짜 compile-time 강제는 src/를 대상으로 한 `yarn tsc`(tsconfig include=src)가 담당.
//   TYPE-02는 getDeviceInfo 반환 payload 전 필드를 runtime로 단언한다.
describe('T-U-TYPE-* — DeviceInfoPayload / V1Response generic 타입 계약', () => {
  test('T-U-TYPE-01: DeviceInfoPayload — 모든 필드 optional (타입 할당 + 런타임 스모크)', () => {
    // 빈 객체가 DeviceInfoPayload에 할당 가능 = 모든 필드 optional
    const empty: DeviceInfoPayload = {}
    expect(empty).toBeDefined()
    // 부분 필드 할당도 가능
    const partial: DeviceInfoPayload = { deviceId: 'D1', version: '2.8.1', label: 'mywallet', connectType: 'usb' }
    expect(partial.deviceId).toBe('D1')
    expect(partial.version).toBe('2.8.1')
    expect(partial.label).toBe('mywallet')
    expect(partial.connectType).toBe('usb')
  })

  test('T-U-TYPE-02: getDeviceInfo() 반환 타입이 V1Response<DeviceInfoPayload>로 narrowed (runtime + 전 필드)', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r-dev',
      result: {
        deviceId: 'D-123',
        label: 'test',
        version: '2.8.1',
        connectType: 'usb',
        coin_list: [{ name: 'ETHEREUM' }],
        fingerprint: { max: 5, enrolled: 2 },
        ksm_version: 'v1.0',
        state: 'initialised',
        isAttached: true,
        deviceModel: 'DCENT-X',
      },
    })
    const resp = await getDeviceInfo()
    // Typed narrow: parameter가 DeviceInfoPayload 필드를 전부 carry
    expect(resp.body.parameter?.deviceId).toBe('D-123')
    expect(resp.body.parameter?.label).toBe('test')
    expect(resp.body.parameter?.version).toBe('2.8.1')
    expect(resp.body.parameter?.connectType).toBe('usb')
    expect(resp.body.parameter?.coin_list?.[0]?.name).toBe('ETHEREUM')
    expect(resp.body.parameter?.fingerprint).toEqual({ max: 5, enrolled: 2 })
    expect(resp.body.parameter?.ksm_version).toBe('v1.0')
    expect(resp.body.parameter?.state).toBe('initialised')
    expect(resp.body.parameter?.isAttached).toBe(true)
    expect(resp.body.parameter?.deviceModel).toBe('DCENT-X')
  })

  test('T-U-TYPE-03: V1Response generic default — 타입 인자 없는 호출자(info())는 Record<string,unknown>', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r-generic',
      result: { foo: 'bar' },
    })
    // info()는 V1Response(default generic)을 반환 — 임의 키 접근 가능
    const resp = await info()
    expect(resp.body.parameter?.foo).toBe('bar')
  })
})

// ── T-U-DEVMODEL-* — deviceModel(모델 축) relay 계약 (m09-04-28) ────────────────
// connector 는 모델을 **판정하지 않고 relay 만** 한다. 값을 채우는 것은 bridge(m13-02-10).
describe('T-U-DEVMODEL-* — DeviceInfoPayload.deviceModel relay 계약', () => {
  test('T-U-DEVMODEL-01: _deviceInfoWireKeyContract 가 deviceModel 을 wire 키로 고정', () => {
    // babel-jest 는 타입을 지우므로 아래 할당은 문서화 + 런타임 스모크다.
    const payload: DeviceInfoPayload = { deviceId: 'D1', version: '1.0.0', deviceModel: 'DCENT-X' }
    expect(payload.deviceModel).toBe('DCENT-X')

    // 진짜 compile-time 강제는 `yarn tsc`(include=src) 가 보는 src/sign/types.ts 의
    // `_deviceInfoWireKeyContract` 다. 그 선언에서 키가 빠지면 여기서도 잡히도록 소스를 직접 읽는다
    // (필드를 지우면 이 단언이 실패 → discriminating-test-required).
    const src = readFileSync(resolvePath(__dirname, '../../../../src/sign/types.ts'), 'utf8')
    const contract = /const _deviceInfoWireKeyContract: DeviceInfoPayload = \{([^}]*)\}/.exec(src)
    expect(contract).not.toBeNull()
    expect(contract?.[1]).toContain('deviceModel')
    // 모델 값 표기 결정(하이픈 'DCENT-X')의 앵커 주석이 사라지지 않았는지도 함께 고정
    expect(src).toContain('NOTE(decision-anchor: dcentx-model-id-naming)')
  })

  test('T-U-DEVMODEL-02: bridge 가 deviceModel 을 보내면 dApp payload 에 그대로 실린다', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r-model',
      result: { deviceId: 'D-X-1', version: '1.0.0', deviceModel: 'DCENT-X' },
    })

    const resp = await getDeviceInfo()

    // 재매핑 금지 — wm 표기('DCENT-X', 하이픈)가 그대로 dApp 까지 간다
    expect(resp.body.parameter?.deviceModel).toBe('DCENT-X')
    expect(resp.body.parameter?.version).toBe('1.0.0')
  })

  test('T-U-DEVMODEL-03: 옛 bridge(deviceModel 부재) 도 throw 없이 나머지 필드가 전달된다', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'r-nomodel',
      result: { deviceId: 'D-BIO-1', version: '2.35.0', label: 'bio' },
    })

    const resp = await getDeviceInfo()

    expect(resp.header.status).toBe('success')
    expect(resp.body.parameter?.deviceModel).toBeUndefined()
    expect(resp.body.parameter?.deviceId).toBe('D-BIO-1')
    expect(resp.body.parameter?.version).toBe('2.35.0')
    expect(resp.body.parameter?.label).toBe('bio')
  })
})
