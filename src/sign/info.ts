/**
 * v1 read-only info functions port (m08-01-02.5)
 *
 * v1 src-v1/index.js의 `dcent.info` (l439-443), `dcent.getDeviceInfo` (l464-468),
 * `dcent.getAccountInfo` (l752-756)를 1:1 port.
 *
 * **m12-03**:
 *   - `getDeviceInfo()` 반환 타입을 `V1Response<DeviceInfoPayload>`로 narrow (Layer A).
 *     options arg는 비스코프 (first-call / device-discovery 성격).
 *   - `getAccountInfo(opts?)` — MEDIUM priority facade, deviceId 옵션 추가 (Layer B).
 *
 * 룰 준수:
 *   - error-handling-consistency: `_call`이 V1Response를 반환 (throw 없음, mutation 격리)
 *   - reuse-shared-utils: m08-01-02-generic-sign-core의 `_call` 재사용
 */

import { _call } from './call'
import type { V1Response, DeviceInfoPayload, CallOptions } from './types'

/**
 * v1 dcent.info — Bridge (Tray Daemon) status 정보 조회.
 */
export function info (): Promise<V1Response> {
  return _call({ method: 'info' })
}

/**
 * v1 dcent.getDeviceInfo — D'CENT Biometric Wallet 디바이스 정보 조회.
 *
 * **m12-03 Layer A**: 반환 타입을 `V1Response<DeviceInfoPayload>`로 narrow.
 * dApp이 `resp.body.parameter?.label` 등 typed field를 직접 접근 가능.
 * options arg는 비스코프 (first-call / device-discovery 성격 — deviceId 없이 시작).
 */
export function getDeviceInfo (): Promise<V1Response<DeviceInfoPayload>> {
  return _call({ method: 'getDeviceInfo' }) as Promise<V1Response<DeviceInfoPayload>>
}

/**
 * v1 dcent.getAccountInfo — Wallet에 등록된 account 리스트 조회.
 *
 * **m12-03 Layer B (MEDIUM)**: `opts?.deviceId` 추가.
 * dApp이 세션 deviceId를 전달해 특정 디바이스의 account 목록을 조회.
 * opts 미명시 시 기존 흐름 유지 (backward-compat).
 */
export function getAccountInfo (opts?: CallOptions): Promise<V1Response> {
  return _call({ method: 'getAccountInfo', deviceId: opts?.deviceId })
}
