/**
 * info / getDeviceInfo / getAccountInfo 단위 테스트 (m08-01-02.5)
 *
 * T-U-INFO-01: info() — _call({method: 'info'}) 호출
 * T-U-DEVINFO-01: getDeviceInfo() — _call({method: 'getDeviceInfo'})
 * T-U-ACC-01: getAccountInfo() — _call({method: 'getAccountInfo'})
 *
 * 모두 인자 없이 _call로 method를 그대로 위임하는 wrapper.
 */

import { info, getDeviceInfo, getAccountInfo } from '../../../../src/sign/info'
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
      result: { device_id: 'D-XYZ', label: 'mywallet' },
    })

    const resp = await getDeviceInfo()

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].method).toBe('getDeviceInfo')
    expect(sendSpy.mock.calls[0][0].params).toBeUndefined()
    expect(resp.body.parameter?.device_id).toBe('D-XYZ')
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
