/**
 * v1 read-only info functions port (m08-01-02.5)
 *
 * v1 src-v1/index.js의 `dcent.info` (l439-443), `dcent.getDeviceInfo` (l464-468),
 * `dcent.getAccountInfo` (l752-756)를 1:1 port.
 *
 * 모두 인자 없이 `_call({method})`만 호출하는 단순 wrapper.
 *
 * 룰 준수:
 *   - error-handling-consistency: `_call`이 V1Response를 반환 (throw 없음, mutation 격리)
 *   - reuse-shared-utils: m08-01-02-generic-sign-core의 `_call` 재사용
 */

import { _call } from './call'
import type { V1Response } from './types'

/**
 * v1 dcent.info — Bridge (Tray Daemon) status 정보 조회.
 */
export function info (): Promise<V1Response> {
  return _call({ method: 'info' })
}

/**
 * v1 dcent.getDeviceInfo — D'CENT Biometric Wallet 디바이스 정보 조회.
 */
export function getDeviceInfo (): Promise<V1Response> {
  return _call({ method: 'getDeviceInfo' })
}

/**
 * v1 dcent.getAccountInfo — Wallet에 등록된 account 리스트 조회.
 */
export function getAccountInfo (): Promise<V1Response> {
  return _call({ method: 'getAccountInfo' })
}
