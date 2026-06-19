/**
 * lifecycle.ts 단위 테스트 (m08-01-01)
 *
 * lifecycle 함수들은 singleton의 internal hook을 호출하는 thin wrapper.
 * singleton.test.ts가 hook 동작을 검증하므로, 여기서는 lifecycle 함수가
 * 올바른 hook을 호출하는지 + popup close의 no-op 동작만 검증.
 *
 * T-U-08: popupWindowClose() — transport.close() + reset
 * T-U-09: popupWindowClose() singleton 미생성 상태 — no-op (throw 안 함)
 *
 * setTimeOutMs / setConnectionListener 동작은 singleton 테스트에서
 * _setPendingTimeout / _registerStateListener를 통해 이미 검증됨 — 여기서는
 * lifecycle wrapper가 그것들을 호출하는지를 본다.
 */

import {
  setTimeOutMs,
  setConnectionListener,
  setTransport,
  popupWindowClose,
} from '../../../src/lifecycle'
import { ensureSingleton, _resetForTesting } from '../../../src/singleton'
import { ProviderError } from '../../../src/error/ProviderError'
import { ErrorCode } from '../../../src/error/ErrorCode'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('lifecycle — popupWindowClose', () => {
  test('T-U-08: 싱글톤 생성 후 popupWindowClose() 호출 시 transport.close() 실행', () => {
    const { transport } = ensureSingleton()
    const closeSpy = jest.spyOn(transport, 'close').mockResolvedValue(undefined)

    popupWindowClose()

    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  test('T-U-09: 싱글톤 미생성 상태에서 popupWindowClose() 호출 시 no-op (throw 안 함)', () => {
    // 어떤 ensureSingleton도 호출하지 않은 상태
    expect(() => popupWindowClose()).not.toThrow()
  })

  test('T-U-08b: popupWindowClose 후 ensureSingleton 호출 시 새 transport 생성', () => {
    const first = ensureSingleton()
    jest.spyOn(first.transport, 'close').mockResolvedValue(undefined)

    popupWindowClose()
    const second = ensureSingleton()

    expect(second.transport).not.toBe(first.transport)
  })
})

describe('lifecycle — setTimeOutMs', () => {
  test('T-U-04 (lifecycle wrapper): 싱글톤 미생성 상태에서 setTimeOutMs(N) → 다음 ensureSingleton에서 적용', () => {
    setTimeOutMs(7777)

    const { transport } = ensureSingleton()
    const internalTimeoutMs = (transport as unknown as { timeoutMs: number }).timeoutMs
    expect(internalTimeoutMs).toBe(7777)
  })

  test('T-U-05 (lifecycle wrapper): 싱글톤 생성 후 setTimeOutMs(N) → 즉시 transport.setTimeoutMs', () => {
    const { transport } = ensureSingleton()
    const setSpy = jest.spyOn(transport, 'setTimeoutMs')

    setTimeOutMs(8888)

    expect(setSpy).toHaveBeenCalledWith(8888)
    expect(setSpy).toHaveBeenCalledTimes(1)
  })
})

describe('lifecycle — setTransport (DC-2701, 연결 단위 transport)', () => {
  test('T-ST-LC-01: 싱글톤 미생성 상태에서 setTransport("ble") → 다음 ensureSingleton에서 pendingTransport 적용', () => {
    setTransport('ble')

    const { transport } = ensureSingleton()
    expect((transport as unknown as { pendingTransport: unknown }).pendingTransport).toBe('ble')
  })

  test('T-ST-LC-02: 싱글톤 생성 후 setTransport("hid") → 즉시 transport.setPendingTransport', () => {
    const { transport } = ensureSingleton()
    const setSpy = jest.spyOn(transport, 'setPendingTransport')

    setTransport('hid')

    expect(setSpy).toHaveBeenCalledWith('hid')
  })

  test('T-ST-LC-03: setTransport(undefined) → pendingTransport undefined (default)', () => {
    setTransport('ble')
    setTransport(undefined)
    const { transport } = ensureSingleton()
    expect((transport as unknown as { pendingTransport: unknown }).pendingTransport).toBeUndefined()
  })

  test('T-ST-LC-04: setTransport(invalid) → ProviderError(INVALID_PARAMS) throw', () => {
    expect(() => setTransport('webusb' as never)).toThrow(ProviderError)
    let caught: unknown
    try {
      setTransport('' as never)
    } catch (e) {
      caught = e
    }
    expect((caught as ProviderError).code).toBe(ErrorCode.INVALID_PARAMS)
  })
})

describe('lifecycle — setConnectionListener', () => {
  test('T-U-06 (lifecycle wrapper): setConnectionListener — transport.on 즉시 호출', () => {
    const { transport } = ensureSingleton()
    const onSpy = jest.spyOn(transport, 'on')

    const listener = jest.fn()
    setConnectionListener(listener)

    expect(onSpy).toHaveBeenCalledWith('state', listener)
  })

  test('T-U-07 (lifecycle wrapper): popupWindowClose 후 listener 보존, 다음 ensureSingleton 시 자동 재등록', () => {
    // 1) listener 등록
    const first = ensureSingleton()
    jest.spyOn(first.transport, 'close').mockResolvedValue(undefined)
    const listener = jest.fn()
    setConnectionListener(listener)

    // 2) popupWindowClose
    popupWindowClose()

    // 3) 새 ensureSingleton — listener가 새 transport에 자동 부착
    const second = ensureSingleton()
    const stateHandlers = (second.transport as unknown as {
      stateHandlers: Set<(state: unknown) => void>
    }).stateHandlers
    expect(stateHandlers.has(listener)).toBe(true)
  })
})
