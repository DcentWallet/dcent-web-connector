/**
 * v1 read-only info functions port (m08-01-02.5)
 *
 * v1 src-v1/index.js의 `dcent.info` (l439-443), `dcent.getDeviceInfo` (l464-468),
 * `dcent.getAccountInfo` (l752-756)를 1:1 port.
 *
 * **m12-03**:
 *   - `getDeviceInfo()` 반환 타입을 `V1Response<DeviceInfoPayload>`로 narrow (Layer A).
 *     options arg는 비스코프 (first-call / device-discovery 성격).
 * **m09-04-12**:
 *   - `getAccountInfo()` 반환 타입을 `V1Response<AccountListV2Payload>`로 narrow.
 *     connector는 sdk(m09-03-21) enrich 응답을 그대로 forward.
 *
 * 룰 준수:
 *   - error-handling-consistency: `_call`이 V1Response를 반환 (throw 없음, mutation 격리)
 *   - reuse-shared-utils: m08-01-02-generic-sign-core의 `_call` 재사용
 */

import { _call } from './call'
import type { V1Response, DeviceInfoPayload, AccountListV2Payload } from './types'

/**
 * v1 dcent.info — Bridge (Tray Daemon) status 정보 조회.
 */
export function info (): Promise<V1Response> {
  return _call({ method: 'info' })
}

/**
 * v1 dcent.getDeviceInfo — DCENT Biometric Wallet 디바이스 정보 조회.
 *
 * **m12-03 Layer A**: 반환 타입을 `V1Response<DeviceInfoPayload>`로 narrow.
 * App이 `resp.body.parameter?.label` 등 typed field를 직접 접근 가능.
 * options arg는 비스코프 (first-call / device-discovery 성격).
 */
export function getDeviceInfo (): Promise<V1Response<DeviceInfoPayload>> {
  return _call({ method: 'getDeviceInfo' }) as Promise<V1Response<DeviceInfoPayload>>
}

/**
 * v1 dcent.getAccountInfo — Wallet에 등록된 account 리스트 조회.
 *
 * **m09-04-12**: 반환 타입을 `V1Response<AccountListV2Payload>`로 narrow.
 * connector는 sdk(m09-03-21)가 enrich한 응답을 그대로 forward — 변환 로직 없음.
 * App이 `resp.body.parameter?.account` 배열을 typed으로 접근 가능.
 */
export function getAccountInfo (): Promise<V1Response<AccountListV2Payload>> {
  return _call({ method: 'getAccountInfo' }) as unknown as Promise<V1Response<AccountListV2Payload>>
}
