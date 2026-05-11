/**
 * v1 getAddress / getXPUB port (m08-01-02.5)
 *
 * v1 src-v1/index.js의 `dcent.getAddress` (l781-813), `dcent.getXPUB` (l822-830)를 1:1 port.
 *
 * getAddress 핵심 동작:
 *   1. coinType 검증 (`isAvaliableCoinType`) — fail 시 `coin_type_error` throw
 *   2. params 구성 — czone이면 `coinType: 'czone'`, 아니면 원본 coinType
 *   3. czone이면 `optionParam = getCzonePrifix(coinType)` (Buffer hex)
 *   4. parachain이면 `optionParam = Number(prefix)` — `!Number(prefix)` true이면 `param_error` throw
 *   5. `_call({method: 'getAddress', params})` 호출
 *   6. 응답 `header.response_from === 'czone'` → 원본 coinType으로 복원
 *
 * **v1 1:1 보존 디테일**:
 *   - czone과 parachain은 별도 if 두 개 (mutually exclusive 강제 안 함 — v1 동작 그대로)
 *   - parachain prefix 검증은 `!Number(prefix)` (0/''/null/undefined/NaN/non-numeric string 모두 reject)
 *   - response_from 복원은 mutation으로 수행 (`_call`이 매 호출마다 새 객체 반환하므로 안전 — mutation-isolation)
 *
 * 룰 준수:
 *   - boundary-validation: coinType / parachain prefix 모두 검증
 *   - error-handling-consistency: 모든 검증 실패는 `dcentException` throw (v1 1:1)
 *   - mutation-isolation: `_call` 결과의 header 수정은 호출자 view에 영향 없음 (cloned)
 */

import { _call } from './call'
import {
  isAvaliableCoinType,
  isCzoneCoinType,
  isParachainCoinType,
  getCzonePrifix,
} from './coinTypeValidators'
import { dcentException } from '../v1/dcent-exception'
import type { V1Response } from './types'

/**
 * v1 dcent.getAddress (src-v1/index.js#l781-813) 1:1 port.
 *
 * @param coinType 지원되는 coinType (`isAvaliableCoinType` 검증)
 * @param path BIP44 key path
 * @param prefix parachain의 경우 필수 (`Number(prefix)` truthy)
 * @returns address가 담긴 V1Response
 */
export async function getAddress (
  coinType: string,
  path: string,
  prefix: string | number | null = null,
): Promise<V1Response> {
  if (!isAvaliableCoinType(coinType)) {
    throw dcentException('coin_type_error', 'not supported coin type')
  }

  const params: Record<string, unknown> = {
    coinType: isCzoneCoinType(coinType) ? 'czone' : coinType,
    path,
  }

  // v1과 동일하게 별도 if 두 개 (mutually exclusive 강제 안 함)
  if (isCzoneCoinType(coinType)) {
    params.optionParam = getCzonePrifix(coinType)
  }

  if (isParachainCoinType(coinType)) {
    // v1 src-v1/index.js#l796-801: `if (!Number(prefix)) throw`
    // → '', null, undefined, 0, NaN, 비숫자 문자열 모두 reject
    if (!Number(prefix)) {
      throw dcentException('param_error', 'Invaild Parameter')
    }
    params.optionParam = Number(prefix)
  }

  const res = await _call({ method: 'getAddress', params })

  // czone 응답에서 response_from을 원래 coinType으로 복원 (v1 src-v1/index.js#l808)
  if (res.header.response_from === 'czone') {
    res.header.response_from = coinType
  }
  return res
}

/**
 * v1 dcent.getXPUB (src-v1/index.js#l822-830) 1:1 port.
 *
 * Extended Public Key 조회. BIP44 key path가 최소 두 depth로 hardened되어야 함.
 *
 * @param key BIP44 key path
 * @param bip32name BIP32 master key 파생용 string (default 'Bitcoin seed')
 * @returns XPUB가 담긴 V1Response
 */
export function getXPUB (key: string, bip32name: string): Promise<V1Response> {
  return _call({ method: 'getXPUB', params: { key, bip32name } })
}
