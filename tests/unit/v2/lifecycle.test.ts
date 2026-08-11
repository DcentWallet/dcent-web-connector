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
 *
 * m09-04-27 추가: setSignProgressListener — singleton 캐시 경유 실디스패치(API-01/02) + export 표면(API-04)
 */

import {
  setTimeOutMs,
  setConnectionListener,
  setSignProgressListener,
  setTransport,
  popupWindowClose,
} from '../../../src/lifecycle'
import { ensureSingleton, _resetForTesting } from '../../../src/singleton'
import { ProviderError } from '../../../src/error/ProviderError'
import { ErrorCode } from '../../../src/error/ErrorCode'
import dcent, { setSignProgressListener as namedSetSignProgressListener } from '../../../src/index'
import type { SignProgressListener, SignProgressInfo } from '../../../src/index'

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

describe('lifecycle — setSignProgressListener (m09-04-27)', () => {
  interface TransportInternals {
    ensureMessageListener: () => void
    pending: Map<string, unknown>
    // origin은 하드코딩하지 않고 인스턴스에서 읽는다(popUpUrl 기본값 변경에 영향받지 않도록).
    origin: string
  }

  /**
   * 실제 bridge가 push하는 것과 동일한 `_signProgress` window message를 발생시킨다.
   * PopupTransport.messageListener는 popup이 열릴 때 설치되므로, 여기서는
   * private ensureMessageListener()를 직접 호출해 리스너만 설치한다(popup 불필요).
   */
  function dispatchSignProgress (
    transport: unknown,
    id: string,
    step: number,
    total: number,
    role?: string,
  ): void {
    // eslint-disable-next-line uap/no-as-unknown-as -- private 메서드/필드(ensureMessageListener/pending/origin) 직접 접근 목적, mock factory 아님(실 인스턴스 캐스팅)
    const t = transport as unknown as TransportInternals
    t.ensureMessageListener()
    // `_signProgress` 분기는 pending.has(id)만 검사하고 값은 읽지 않는다 → dummy로 충분.
    t.pending.set(id, {} as never)
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: t.origin,   // messageListener의 origin 검증을 통과시키기 위해 인스턴스 값 사용
        data: { id, type: '_signProgress', step, total, role } as never,
      }),
    )
    // 필수: close()가 pending을 순회하며 p.reject/p.timer를 건드리므로 dummy를 반드시 제거한다.
    // 남겨두면 _resetForTesting()의 close()가 throw하고 message listener가 누수되어
    // 이후 테스트가 오염된다.
    t.pending.delete(id)
  }

  test('T-U-SIGNPROGRESS-CONN-06 (lifecycle wrapper): transport 생성 전 등록 → ensureSingleton 이후 정상 발동', () => {
    const listener = jest.fn<void, [SignProgressInfo]>()
    // singleton 미생성 상태에서 등록
    setSignProgressListener(listener)

    const { transport } = ensureSingleton()
    dispatchSignProgress(transport, 'req-1', 1, 2, 'payment')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ requestId: 'req-1', step: 1, total: 2, role: 'payment' })
  })

  test('T-U-SIGNPROGRESS-CONN-07-LC: 리스너 2개 등록 시 둘 다 호출 (API-02, singleton 캐시 경유)', () => {
    const first = jest.fn<void, [SignProgressInfo]>()
    const second = jest.fn<void, [SignProgressInfo]>()
    // 둘 다 transport 생성 전에 등록 → _signProgressListeners 캐시에 쌓였다가 일괄 재등록
    setSignProgressListener(first)
    setSignProgressListener(second)

    const { transport } = ensureSingleton()
    dispatchSignProgress(transport, 'req-2', 2, 3, 'stake')

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledWith({ requestId: 'req-2', step: 2, total: 3, role: 'stake' })
    expect(second).toHaveBeenCalledWith({ requestId: 'req-2', step: 2, total: 3, role: 'stake' })
  })

  test('T-U-SIGNPROGRESS-CONN-EXPORT-01: index.ts export 표면 (API-04)', () => {
    expect(typeof dcent.setSignProgressListener).toBe('function')
    expect(typeof namedSetSignProgressListener).toBe('function')
    expect(dcent.setSignProgressListener).toBe(namedSetSignProgressListener)

    // 컴파일 타임 단언 — SignProgressListener / SignProgressInfo 타입 export가 빠지면
    // `npm run tsc`가 실패한다 (런타임 테스트로는 타입 export를 검증할 수 없다).
    const typed: SignProgressListener = (info: SignProgressInfo) => {
      void info.requestId
      void info.step
      void info.total
      void info.role
    }
    expect(typeof typed).toBe('function')
  })
})
