/**
 * setLabel / syncAccount / selectAddress (m08-01-02.5, v2 전환 m09-04-12)
 *
 * - setLabel: v1 1:1 port (m08-01-02.5) — 변경 없음
 * - syncAccount: **v2 전환 (m09-04-12)** — SyncAccountInfo(coin_group/coin_name) →
 *   V2SyncAccountInfo(chainId/keyPath/label/token?). (m13-02-08) 토큰은 top-level
 *   `contractAddress` 대신 서명 경로와 같은 이름의 `token` descriptor로 기술한다.
 *   v1 chain 검증(isAvaliableCoinGroup / isAvailableSyncAccountCoinName) 제거.
 *   connector-chain-addition-isolation: chain-agnostic light sanitize만 수행.
 *   실제 chain resolve는 sdk/wm(m09-03-21) 위임.
 * - selectAddress: v1 1:1 port (m08-01-02.5) — 변경 없음
 *
 * 룰 준수:
 *   - connector-chain-addition-isolation: chain enum / coin_group 검증 제거
 *   - dapp-input-sanitization: _sanitizeSyncAccountItem per-item sanitize
 *   - boundary-validation: 비배열 accountInfos → throw
 *   - error-handling-consistency: 모든 검증 실패는 dcentException throw
 *   - reuse-shared-utils: validators는 sibling 모듈에서 import
 */

import { _call } from './call'
import { isAvaliableLabel } from './labelValidator'
import { _sanitizeSyncAccountItem } from './_sanitizeSyncAccountItem'
import { dcentException } from '../v1/dcent-exception'
import type { V1Response, V2SyncAccountInfo } from './types'

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
 * dcent.syncAccount v2 — chainId + keyPath 기반 account 동기화 (m09-04-12 breaking change).
 *
 * **v2 전환**: 입력 타입이 v1 `SyncAccountInfo{coin_group, coin_name, label}[]` 에서
 * v2 `V2SyncAccountInfo{chainId, keyPath, label, token?, meta?}[]` 로 변경됨.
 * v1 chain 검증(isAvaliableCoinGroup / isAvailableSyncAccountCoinName) 제거.
 *
 * connector는 chain-agnostic transport:
 *   - chainId 형식 whitelist(_sanitizeChainId) + keyPath BIP44 + label regex 검증만 수행
 *   - chain resolve / coin_group-coin_name 매핑은 sdk(m09-03-21) → wm 위임
 *
 * **BREAKING**: v1 SyncAccountInfo 파라미터 타입은 더 이상 허용되지 않는다.
 * 마이그레이션: { coin_group, coin_name, label } → { chainId, keyPath, label }
 * (마이그레이션 가이드는 m09-04-04/06 docs child 담당)
 *
 * @param accountInfos v2 account 항목 배열 — 각 항목은 _sanitizeSyncAccountItem으로 검증
 * @throws dcentException('param_error') — 비배열 / invalid 항목
 */
export function syncAccount (accountInfos: V2SyncAccountInfo[]): Promise<V1Response> {
  // boundary-validation: 비배열 입력 → throw (selectAddress T-U-SEL-02 패턴 통일)
  if (!Array.isArray(accountInfos)) {
    throw dcentException('param_error', 'accountInfos is not array')
  }

  // per-item sanitize — _sanitizeSyncAccountItem이 throw on invalid
  const safe = accountInfos.map(_sanitizeSyncAccountItem)

  return _call({ method: 'syncAccount', params: { accountInfos: safe } })
}

/**
 * v1 dcent.selectAddress (src-v1/index.js#l762-772) 1:1 port.
 *
 * @param addresses 선택할 address 배열
 * @throws dcentException('param_error') Array가 아닌 경우
 */
export function selectAddress (addresses: string[]): Promise<V1Response> {
  if (!Array.isArray(addresses)) {
    throw dcentException('param_error', 'addresses is not array')
  }
  return _call({ method: 'selectAddress', params: { addresses } })
}
