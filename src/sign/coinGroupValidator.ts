/**
 * v1 coinGroup validators port (m08-01-02.5)
 *
 * v1 src-v1/index.js#l479-543 1:1 port.
 *
 * 함수:
 *   - `isAvaliableCoinGroup` (l479-516) — 지원되는 coinGroup 화이트리스트
 *   - `_contractNotStartWith0x` (l518-529, internal) — 0x prefix가 필요 없는 contract 그룹
 *   - `isAvailableSyncAccountCoinName` (l531-543) — coin_group + coin_name 짝 검증
 *
 * 룰 준수:
 *   - boundary-validation: falsy 가드 + switch default
 *   - error-handling-consistency: boolean 반환 (throw는 caller — syncAccount)
 *   - reuse-shared-utils: m08-01-01 enum + isTokenType (coinTypeValidators) 재사용
 */

import { coinGroup as dcentCoinGroup } from '../types/coinGroup'
import { isTokenType } from './coinTypeValidators'

/**
 * v1 isAvaliableCoinGroup (src-v1/index.js#l479-516) 1:1 port.
 *
 * 지원되는 coinGroup이면 true. 모든 비교는 toLowerCase.
 */
export function isAvaliableCoinGroup (coinGroup: string): boolean {
  if (!coinGroup) {
    return false
  }
  switch (coinGroup.toLowerCase()) {
    case dcentCoinGroup.BITCOIN.toLowerCase():
    case dcentCoinGroup.BITCOIN_TESTNET.toLowerCase():
    case dcentCoinGroup.MONACOIN.toLowerCase():
    case dcentCoinGroup.MONACOIN_TESTNET.toLowerCase():
    case dcentCoinGroup.ERC20.toLowerCase():
    case dcentCoinGroup.ERC20_KOVAN.toLowerCase():
    case dcentCoinGroup.ETHEREUM.toLowerCase():
    case dcentCoinGroup.ETHEREUM_KOVAN.toLowerCase():
    case dcentCoinGroup.RRC20.toLowerCase():
    case dcentCoinGroup.RRC20_TESTNET.toLowerCase():
    case dcentCoinGroup.RSK.toLowerCase():
    case dcentCoinGroup.RSK_TESTNET.toLowerCase():
    case dcentCoinGroup.KLAYTN.toLowerCase():
    case dcentCoinGroup.KLAY_BAOBAB.toLowerCase():
    case dcentCoinGroup.KLAYTN_KCT.toLowerCase():
    case dcentCoinGroup.KCT_BAOBAB.toLowerCase():
    case dcentCoinGroup.RIPPLE.toLowerCase():
    case dcentCoinGroup.RIPPLE_TESTNET.toLowerCase():
    case dcentCoinGroup.XDC.toLowerCase():
    case dcentCoinGroup.XDC_APOTHEM.toLowerCase():
    case dcentCoinGroup.XRC20.toLowerCase():
    case dcentCoinGroup.XRC20_APOTHEM.toLowerCase():
    case dcentCoinGroup.HEDERA.toLowerCase():
    case dcentCoinGroup.HEDERA_HTS.toLowerCase():
    case dcentCoinGroup.HEDERA_TESTNET.toLowerCase():
    case dcentCoinGroup.HTS_TESTNET.toLowerCase():
    case dcentCoinGroup.STELLAR.toLowerCase():
    case dcentCoinGroup.TRON.toLowerCase():
      return true
    default:
      return false
  }
}

/**
 * v1 _contractNotStartWith0x (src-v1/index.js#l518-529, internal) 1:1 port.
 *
 * 0x prefix가 필요 없는 contract group이면 true.
 * (TRC token / XRC20 / HTS / Algorand asset/app / PARA XC20)
 *
 * 본 함수는 module-internal이며 export하지 않는다 (`isAvailableSyncAccountCoinName` 내부에서만 사용).
 */
function _contractNotStartWith0x (coinGroup: string): boolean {
  if (
    coinGroup === dcentCoinGroup.TRC_TOKEN.toLowerCase() ||
    coinGroup === dcentCoinGroup.TRC_TESTNET.toLowerCase() ||
    coinGroup === dcentCoinGroup.XRC20.toLowerCase() ||
    coinGroup === dcentCoinGroup.XRC20_APOTHEM.toLowerCase() ||
    coinGroup === dcentCoinGroup.HTS_TESTNET.toLowerCase() ||
    coinGroup === dcentCoinGroup.HEDERA_HTS.toLowerCase() ||
    coinGroup === dcentCoinGroup.ALGORAND_ASSET.toLowerCase() ||
    coinGroup === dcentCoinGroup.ALGORAND_ASSET_TESTNET.toLowerCase() ||
    coinGroup === dcentCoinGroup.ALGORAND_APP.toLowerCase() ||
    coinGroup === dcentCoinGroup.ALGORAND_APP_TESTNET.toLowerCase() ||
    coinGroup === dcentCoinGroup.PARA_XC20.toLowerCase() ||
    coinGroup === dcentCoinGroup.PARA_XC20_TESTNET.toLowerCase()
  ) {
    return true
  }
  return false
}

/**
 * v1 isAvailableSyncAccountCoinName (src-v1/index.js#l531-543) 1:1 port.
 *
 * Token 그룹이면 coin_name이 0x로 시작하거나 (`_contractNotStartWith0x`이 true인 그룹).
 * Non-token 그룹이면 coin_name이 valid coinGroup이어야 함.
 *
 * NOTE: v1 함수명에 typo (`isAvailable` vs `isAvaliable`) 차이가 있음 — 이 함수는 `isAvailable` (정확).
 * v2도 동일 이름 보존.
 *
 * @param account `{coin_group, coin_name}` 짝
 */
export function isAvailableSyncAccountCoinName (account: {
  // eslint-disable-next-line camelcase
  coin_group: string
  // eslint-disable-next-line camelcase
  coin_name: string
}): boolean {
  if (isTokenType(account.coin_group)) {
    if (
      !account.coin_name.startsWith('0x') &&
      !account.coin_name.startsWith('0X') &&
      _contractNotStartWith0x(account.coin_group.toLowerCase()) !== true
    ) {
      return false
    }
  } else {
    if (!isAvaliableCoinGroup(account.coin_name)) {
      return false
    }
  }
  return true
}
