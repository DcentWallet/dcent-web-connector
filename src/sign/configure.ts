/**
 * v1 setLabel / syncAccount / selectAddress port (m08-01-02.5)
 *
 * v1 src-v1/index.js의 `dcent.setLabel` (l705-716), `dcent.syncAccount` (l724-745),
 * `dcent.selectAddress` (l762-772)를 1:1 port.
 *
 * **v1 1:1 보존 디테일**:
 *   - setLabel: `isAvaliableLabel` regex 검증 → throw `param_error` ('Invalid Label : ' + label)
 *   - syncAccount: per-account 3종 검증 (early throw) — coinGroup → coinName → label 순서
 *     - coin_group: `isAvaliableCoinGroup` fail → `coin_group_error`
 *     - coin_name: `isAvailableSyncAccountCoinName` fail → `coin_name_error`
 *     - label: `isAvaliableLabel` fail → `param_error` ('Invalid Label - ' + label)
 *   - selectAddress: `Array.isArray` 검증만 → throw `param_error`
 *
 * **m12-03 Layer B (MEDIUM)**:
 *   - `syncAccount(accountInfos, opts?)` — opts?.deviceId 추가
 *   - `selectAddress(addresses, opts?)` — opts?.deviceId 추가
 *   모두 trailing optional이므로 기존 2-arg 호출자에 영향 없음 (backward-compat).
 *
 * 룰 준수:
 *   - boundary-validation: 모든 인자 검증 후 _call
 *   - error-handling-consistency: 모든 검증 실패는 dcentException throw (v1 1:1 메시지)
 *   - reuse-shared-utils: validators는 sibling 모듈에서 import
 */

import { _call } from './call'
import { isAvaliableLabel } from './labelValidator'
import { isAvaliableCoinGroup, isAvailableSyncAccountCoinName } from './coinGroupValidator'
import { dcentException } from '../v1/dcent-exception'
import type { V1Response, CallOptions } from './types'

/* eslint-disable camelcase */
/** sync account info — v1 wire format에 맞춰 snake_case. */
export interface SyncAccountInfo {
  coin_group: string
  coin_name: string
  label: string
}
/* eslint-enable camelcase */

/**
 * v1 dcent.setLabel (src-v1/index.js#l705-716) 1:1 port.
 *
 * @param label D'CENT biometric Wallet에 설정할 label (regex `/^[a-zA-Z\d.!#$%&\+\-_]{2,14}$/`)
 * @throws dcentException('param_error') label regex unmatch 시
 */
export function setLabel (label: string): Promise<V1Response> {
  if (!isAvaliableLabel(label)) {
    throw dcentException('param_error', 'Invalid Label : ' + label)
  }
  return _call({ method: 'setLabel', params: { label } })
}

/**
 * v1 dcent.syncAccount (src-v1/index.js#l724-745) 1:1 port.
 *
 * Account 정보 동기화 — 추가 또는 갱신.
 * Per-account 3종 검증 (coin_group / coin_name / label) — early throw on first failure.
 *
 * **m12-03 Layer B**: `opts?.deviceId` 추가. trailing optional → backward-compat.
 *
 * @param accountInfos 검증 후 디바이스에 sync할 account 배열
 * @param opts 선택적 CallOptions (deviceId 등)
 * @throws dcentException 첫 invalid account의 첫 invalid 필드에서 throw (v1 동일 순서)
 */
export function syncAccount (accountInfos: SyncAccountInfo[], opts?: CallOptions): Promise<V1Response> {
  for (let i = 0; i < accountInfos.length; i = i + 1) {
    const account = accountInfos[i]

    if (!isAvaliableCoinGroup(account.coin_group)) {
      throw dcentException('coin_group_error', 'not supported coin group')
    }
    if (!isAvailableSyncAccountCoinName(account)) {
      throw dcentException('coin_name_error', 'not supported coin name')
    }
    if (!isAvaliableLabel(account.label)) {
      throw dcentException('param_error', 'Invalid Label - ' + account.label)
    }
  }
  return _call({ method: 'syncAccount', params: { accountInfos }, deviceId: opts?.deviceId })
}

/**
 * v1 dcent.selectAddress (src-v1/index.js#l762-772) 1:1 port.
 *
 * **m12-03 Layer B**: `opts?.deviceId` 추가. trailing optional → backward-compat.
 *
 * @param addresses 선택할 address 배열
 * @param opts 선택적 CallOptions (deviceId 등)
 * @throws dcentException('param_error') Array가 아닌 경우
 */
export function selectAddress (addresses: string[], opts?: CallOptions): Promise<V1Response> {
  if (!Array.isArray(addresses)) {
    throw dcentException('param_error', 'addresses is not array')
  }
  return _call({ method: 'selectAddress', params: { addresses }, deviceId: opts?.deviceId })
}
