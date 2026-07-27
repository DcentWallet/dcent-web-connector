/**
 * singleton.ts 단위 테스트 (m08-01-01)
 *
 * T-U-01: ensureSingleton() 첫 호출 — PopupTransport + SerialRequestQueue 1쌍 생성
 * T-U-02: ensureSingleton() 두 번째 호출 — 같은 인스턴스 반환
 * T-U-03: resetSingleton() — transport.close() 호출 + 다음 ensureSingleton에서 새 인스턴스
 * T-U-06: setConnectionListener — listener 등록 + transport.on('state', listener) 1회 (lifecycle 테스트와 분리되어 있어 여기서는 _registerStateListener 직접 검증)
 * T-U-07: resetSingleton 후 listener 보존, 다음 ensureSingleton 시 자동 재등록
 *
 * jsdom 환경. PopupTransport.constructor가 window.open을 호출하지 않으므로 (send 시점에만 호출)
 * 이 단위 테스트는 popup 없이도 실행 가능 — singleton 생성 자체는 popupWindow 없이 진행됨.
 */

import {
  ensureSingleton,
  resetSingleton,
  _registerStateListener,
  _registerSignProgressListener,
  _setPendingTimeout,
  _resetForTesting,
} from '../../../src/singleton'
import { PopupTransport } from '../../../src/transport/PopupTransport'
import { SerialRequestQueue } from '../../../src/queue/RequestQueue'

beforeEach(() => {
  // 각 테스트 시작 전 module-level state 완전 초기화
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('singleton — ensureSingleton', () => {
  test('T-U-01: 첫 호출 시 PopupTransport + SerialRequestQueue 1쌍 lazy 생성', () => {
    const { transport, queue } = ensureSingleton()
    expect(transport).toBeInstanceOf(PopupTransport)
    expect(queue).toBeInstanceOf(SerialRequestQueue)
  })

  test('T-U-02: 두 번째 호출 시 동일 인스턴스 반환 (singleton 보장)', () => {
    const first = ensureSingleton()
    const second = ensureSingleton()
    expect(second.transport).toBe(first.transport)
    expect(second.queue).toBe(first.queue)
  })
})

describe('singleton — resetSingleton', () => {
  test('T-U-03: resetSingleton() 호출 시 transport.close() 실행 + 다음 ensureSingleton에서 새 인스턴스', () => {
    const first = ensureSingleton()
    const closeSpy = jest.spyOn(first.transport, 'close').mockResolvedValue(undefined)

    resetSingleton()

    expect(closeSpy).toHaveBeenCalledTimes(1)

    const second = ensureSingleton()
    expect(second.transport).not.toBe(first.transport)
    expect(second.queue).not.toBe(first.queue)
  })

  test('T-U-03b: transport.close() rejection도 silent하게 처리 (resetSingleton은 throw 안 함)', async () => {
    const first = ensureSingleton()
    jest.spyOn(first.transport, 'close').mockRejectedValue(new Error('boom'))

    // resetSingleton 자체는 동기적으로 throw하지 않음
    expect(() => resetSingleton()).not.toThrow()

    // 다음 microtask까지 unhandled rejection이 발생하지 않음을 확인
    await Promise.resolve()
    await Promise.resolve()
  })
})

describe('singleton — listener / pendingTimeout 보존', () => {
  test('T-U-06: _registerStateListener — transport 존재 시 즉시 transport.on 호출 + listener 1개 등록', () => {
    const { transport } = ensureSingleton()
    const onSpy = jest.spyOn(transport, 'on')

    const listener = jest.fn()
    _registerStateListener(listener)

    expect(onSpy).toHaveBeenCalledWith('state', listener)
    expect(onSpy).toHaveBeenCalledTimes(1)
  })

  test('T-U-07: resetSingleton 후 listener 보존 — 다음 ensureSingleton 시 자동 재등록', () => {
    // 1) singleton 만들고 listener 등록
    const first = ensureSingleton()
    const listener = jest.fn()
    _registerStateListener(listener)

    // 2) reset
    jest.spyOn(first.transport, 'close').mockResolvedValue(undefined)
    resetSingleton()

    // 3) 새 ensureSingleton — 새 transport에 listener가 자동 부착되어야 함
    const second = ensureSingleton()
    expect(second.transport).not.toBe(first.transport)

    // 새 transport의 stateHandlers Set에 listener가 들어있는지 확인
    // (PopupTransport.on은 private stateHandlers Set에 add — 리플렉션으로 확인)
    const stateHandlers = (second.transport as unknown as {
      stateHandlers: Set<(state: unknown) => void>
    }).stateHandlers
    expect(stateHandlers.has(listener)).toBe(true)
  })

  test('T-U-04: _setPendingTimeout — singleton 생성 전 호출 시 다음 ensureSingleton에서 적용', () => {
    // 1) singleton 미생성 상태에서 timeout 설정
    _setPendingTimeout(12345)

    // 2) ensureSingleton 호출 — 새 transport가 12345ms timeout을 가져야 함
    const { transport } = ensureSingleton()
    const internalTimeoutMs = (transport as unknown as { timeoutMs: number }).timeoutMs
    expect(internalTimeoutMs).toBe(12345)
  })

  test('T-U-05: _setPendingTimeout — singleton 생성 후 호출 시 즉시 transport.setTimeoutMs(N)', () => {
    const { transport } = ensureSingleton()
    const setSpy = jest.spyOn(transport, 'setTimeoutMs')

    _setPendingTimeout(54321)

    expect(setSpy).toHaveBeenCalledWith(54321)
    expect(setSpy).toHaveBeenCalledTimes(1)
  })
})

describe('singleton — signProgress listener 캐싱/재등록 (m09-04-27)', () => {
  function progressHandlersOf (transport: unknown): Set<unknown> {
    return (transport as { signProgressHandlers: Set<unknown> }).signProgressHandlers
  }

  test('T-U-SIGNPROGRESS-CONN-06: transport 생성 전 등록 → 다음 ensureSingleton에서 자동 부착', () => {
    const listener = jest.fn()
    // transport 미생성 상태에서 등록 (ensureSingleton을 아직 호출하지 않았다)
    _registerSignProgressListener(listener)

    const { transport } = ensureSingleton()
    expect(progressHandlersOf(transport).has(listener)).toBe(true)
  })

  test('T-U-SIGNPROGRESS-CONN-06b: transport 존재 시 즉시 on("signProgress", listener)', () => {
    const { transport } = ensureSingleton()
    const onSpy = jest.spyOn(transport, 'on')

    const listener = jest.fn()
    _registerSignProgressListener(listener)

    expect(onSpy).toHaveBeenCalledWith('signProgress', listener)
    expect(onSpy).toHaveBeenCalledTimes(1)
  })

  test('T-U-SIGNPROGRESS-CONN-06c: resetSingleton 후 보존 — 다음 ensureSingleton 시 자동 재등록', () => {
    const first = ensureSingleton()
    const listener = jest.fn()
    _registerSignProgressListener(listener)

    jest.spyOn(first.transport, 'close').mockResolvedValue(undefined)
    resetSingleton()

    const second = ensureSingleton()
    expect(second.transport).not.toBe(first.transport)
    expect(progressHandlersOf(second.transport).has(listener)).toBe(true)
  })

  test('T-02-02: _resetForTesting()이 _signProgressListeners 캐시를 비운다', () => {
    const listener = jest.fn()
    _registerSignProgressListener(listener)

    _resetForTesting()

    const { transport } = ensureSingleton()
    expect(progressHandlersOf(transport).size).toBe(0)
  })
})
