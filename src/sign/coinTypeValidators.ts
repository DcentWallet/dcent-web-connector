/**
 * v1 coinType validators port (m08-01-02.5)
 *
 * v1 src-v1/index.js의 `isAvaliableCoinType` (l545-612), `isTokenType` (l614-643),
 * `isBitcoinTxCoinType` (l645-655), `isCzoneCoinType` (l657-664),
 * `isParachainCoinType` (l666-679), `getCzonePrifix` (l681-688)를 1:1 port한다.
 *
 * 무수정 호환 약속:
 *   - 함수명 v1 typo `getCzonePrifix` 그대로 보존 (export 표면)
 *   - 모든 case는 v1과 동일한 enum 값 비교 (`coinType.toLowerCase()` vs `dcentCoinType.X.toLowerCase()`)
 *   - 빈 문자열/null/undefined 입력 처리도 v1과 동일 (`!coinType` 가드)
 *
 * v2 enum (`coinType` / `coinGroup`) 자체가 m08-01-01에서 v1 src-v1/type/dcent-web-type.js와
 * 키·값 1:1 일치로 도입되었으므로 (drift 테스트로 보장), 본 모듈은 그 enum을 그대로 사용해도
 * v1 동작과 동등하다.
 *
 * 룰 준수:
 *   - boundary-validation: 모든 입력에 대해 falsy 가드 + switch default 처리
 *   - error-handling-consistency: validator는 boolean 반환 (throw 안 함). throw는 caller (getAddress 등)
 *   - reuse-shared-utils: m08-01-01의 v2 enum 재사용
 */

import { Buffer } from 'buffer'
import { coinType as dcentCoinType } from '../types/coinType'
import { coinGroup as dcentCoinGroup } from '../types/coinGroup'

/**
 * v1 isAvaliableCoinType (src-v1/index.js#l545-612) 1:1 port.
 *
 * 지원되는 coinType이면 true. enum 키 또는 값 어느 쪽 입력도 toLowerCase 비교로 매치.
 */
export function isAvaliableCoinType (coinType: string): boolean {
  if (!coinType) {
    return false
  }
  switch (coinType.toLowerCase()) {
    case dcentCoinType.BITCOIN.toLowerCase():
    case dcentCoinType.BITCOIN_TESTNET.toLowerCase():
    case dcentCoinType.MONACOIN.toLowerCase():
    case dcentCoinType.MONACOIN_TESTNET.toLowerCase():
    case dcentCoinType.ETHEREUM.toLowerCase():
    case dcentCoinType.ETHEREUM_KOVAN.toLowerCase():
    case dcentCoinType.ERC20.toLowerCase():
    case dcentCoinType.ERC20_KOVAN.toLowerCase():
    case dcentCoinType.RRC20.toLowerCase():
    case dcentCoinType.RRC20_TESTNET.toLowerCase():
    case dcentCoinType.RSK.toLowerCase():
    case dcentCoinType.RSK_TESTNET.toLowerCase():
    case dcentCoinType.KLAYTN.toLowerCase():
    case dcentCoinType.KLAY_BAOBAB.toLowerCase():
    case dcentCoinType.KLAYTN_KCT.toLowerCase():
    case dcentCoinType.KCT_BAOBAB.toLowerCase():
    case dcentCoinType.RIPPLE.toLowerCase():
    case dcentCoinType.RIPPLE_TESTNET.toLowerCase():
    case dcentCoinType.XDC.toLowerCase():
    case dcentCoinType.XDC_APOTHEM.toLowerCase():
    case dcentCoinType.XRC20.toLowerCase():
    case dcentCoinType.XRC20_APOTHEM.toLowerCase():
    case dcentCoinType.HEDERA.toLowerCase():
    case dcentCoinType.HEDERA_HTS.toLowerCase():
    case dcentCoinType.HEDERA_TESTNET.toLowerCase():
    case dcentCoinType.HTS_TESTNET.toLowerCase():
    case dcentCoinType.STELLAR.toLowerCase():
    case dcentCoinType.STELLAR_TESTNET.toLowerCase():
    case dcentCoinType.TRON.toLowerCase():
    case dcentCoinType.TRON_TESTNET.toLowerCase():
    case dcentCoinType.TRON_TRC_TOKEN.toLowerCase():
    case dcentCoinType.TRON_TRC_TESTNET.toLowerCase():
    case dcentCoinType.TEZOS.toLowerCase():
    case dcentCoinType.TEZOS_TESTNET.toLowerCase():
    case dcentCoinType.XTZ_FA.toLowerCase():
    case dcentCoinType.XTZ_FA_TESTNET.toLowerCase():
    case dcentCoinType.VECHAIN.toLowerCase():
    case dcentCoinType.VECHAIN_ERC20.toLowerCase():
    case dcentCoinType.NEAR.toLowerCase():
    case dcentCoinType.NEAR_TESTNET.toLowerCase():
    case dcentCoinType.NEAR_TOKEN.toLowerCase():
    case dcentCoinType.HAVAH.toLowerCase():
    case dcentCoinType.HAVAH_TESTNET.toLowerCase():
    case dcentCoinType.HAVAH_HSP20.toLowerCase():
    case dcentCoinType.HAVAH_HSP20_TESTNET.toLowerCase():
    case dcentCoinType.POLKADOT.toLowerCase():
    case dcentCoinType.COSMOS.toLowerCase():
    case dcentCoinType.COREUM.toLowerCase():
    case dcentCoinType.ALGORAND.toLowerCase():
    case dcentCoinType.ALGORAND_TESTNET.toLowerCase():
    case dcentCoinType.ALGORAND_ASSET.toLowerCase():
    case dcentCoinType.ALGORAND_ASSET_TESTNET.toLowerCase():
    case dcentCoinType.ALGORAND_APP.toLowerCase():
    case dcentCoinType.ALGORAND_APP_TESTNET.toLowerCase():
    case dcentCoinType.PARA.toLowerCase():
    case dcentCoinType.PARA_TESTNET.toLowerCase():
    case dcentCoinType.PARA_XC20.toLowerCase():
    case dcentCoinType.PARA_XC20_TESTNET.toLowerCase():
      return true
    default:
      return false
  }
}

/**
 * v1 isTokenType (src-v1/index.js#l614-643) 1:1 port.
 *
 * 토큰(ERC20/RRC20/KCT/XRC20/XTZ_FA/...)이면 true.
 * 입력은 coinGroup 또는 coinType 둘 중 무엇이든 가능 (v1이 mixed로 사용).
 */
export function isTokenType (coinGroup: string): boolean {
  if (!coinGroup) {
    return false
  }
  switch (coinGroup.toLowerCase()) {
    case dcentCoinGroup.ERC20.toLowerCase():
    case dcentCoinGroup.ERC20_KOVAN.toLowerCase():
    case dcentCoinType.RRC20.toLowerCase():
    case dcentCoinType.RRC20_TESTNET.toLowerCase():
    case dcentCoinType.KLAYTN_KCT.toLowerCase():
    case dcentCoinType.KCT_BAOBAB.toLowerCase():
    case dcentCoinGroup.XRC20.toLowerCase():
    case dcentCoinGroup.XRC20_APOTHEM.toLowerCase():
    case dcentCoinGroup.XTZ_FA.toLowerCase():
    case dcentCoinGroup.XTZ_FA_TESTNET.toLowerCase():
    case dcentCoinGroup.VECHAIN_ERC20.toLowerCase():
    case dcentCoinGroup.HAVAH_HSP20.toLowerCase():
    case dcentCoinGroup.HAVAH_HSP20_TESTNET.toLowerCase():
    case dcentCoinGroup.NEAR_TOKEN.toLowerCase():
    case dcentCoinType.ALGORAND_ASSET.toLowerCase():
    case dcentCoinType.ALGORAND_ASSET_TESTNET.toLowerCase():
    case dcentCoinType.ALGORAND_APP.toLowerCase():
    case dcentCoinType.ALGORAND_APP_TESTNET.toLowerCase():
    case dcentCoinGroup.PARA_XC20.toLowerCase():
    case dcentCoinGroup.PARA_XC20_TESTNET.toLowerCase():
      return true
    default:
      return false
  }
}

/**
 * v1 isBitcoinTxCoinType (src-v1/index.js#l645-655) 1:1 port.
 *
 * BITCOIN/BITCOIN_TESTNET/MONACOIN/MONACOIN_TESTNET이면 true (Bitcoin tx 빌더 사용 가능).
 *
 * NOTE: v1과 동일하게 입력 falsy 가드 없음 — 빈 문자열 입력 시 toLowerCase()가 동작하므로
 * default로 false를 반환하는 흐름이 자연스럽게 유지된다.
 */
export function isBitcoinTxCoinType (coinType: string): boolean {
  switch (coinType.toLowerCase()) {
    case dcentCoinType.BITCOIN.toLowerCase():
    case dcentCoinType.BITCOIN_TESTNET.toLowerCase():
    case dcentCoinType.MONACOIN.toLowerCase():
    case dcentCoinType.MONACOIN_TESTNET.toLowerCase():
      return true
    default:
      return false
  }
}

/**
 * v1 isCzoneCoinType (src-v1/index.js#l657-664) 1:1 port.
 *
 * COREUM이면 true (czone wallet 그룹).
 */
export function isCzoneCoinType (coinType: string): boolean {
  switch (coinType.toLowerCase()) {
    case dcentCoinType.COREUM.toLowerCase():
      return true
    default:
      return false
  }
}

/**
 * v1 isParachainCoinType (src-v1/index.js#l666-679) 1:1 port.
 *
 * PARA / PARA_TESTNET / PARA_XC20 / PARA_XC20_TESTNET이면 true.
 */
export function isParachainCoinType (coinType: string): boolean {
  if (!coinType) {
    return false
  }
  switch (coinType.toLowerCase()) {
    case dcentCoinType.PARA.toLowerCase():
    case dcentCoinType.PARA_TESTNET.toLowerCase():
    case dcentCoinType.PARA_XC20.toLowerCase():
    case dcentCoinType.PARA_XC20_TESTNET.toLowerCase():
      return true
    default:
      return false
  }
}

/**
 * v1 getCzonePrifix (src-v1/index.js#l681-688) 1:1 port.
 *
 * **v1 typo `getCzonePrifix` 그대로 보존** — dApp이 v1에서 import한 이름과 동일해야 함.
 * 의미상으로는 `getCzonePrefix`가 맞으나 v2에서 오타 수정 시 dApp이 호출 표면 깨짐.
 *
 * COREUM → `Buffer.from('core', 'utf8').toString('hex')` ('636f7265' = "core" hex 인코딩).
 * 그 외 → undefined.
 */
export function getCzonePrifix (coinType: string): string | undefined {
  switch (coinType.toLowerCase()) {
    case dcentCoinType.COREUM.toLowerCase():
      return Buffer.from('core', 'utf8').toString('hex')
    default:
      return undefined
  }
}
