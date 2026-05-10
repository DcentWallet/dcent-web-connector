/**
 * v2 facade — coinType enum (m08-01-01)
 *
 * v1 src-v1/type/dcent-web-type.js의 coinType과 키·값 1:1 일치.
 * tests/unit/v2/types-drift.test.ts가 require('src-v1/type/dcent-web-type')로 v1을 직접 로드하여
 * 키·값 일치를 단언하므로, v1이 변경되면 drift 테스트가 깨진다 (수동 동기화 정책).
 *
 * Object.freeze로 mutation 격리 (`mutation-isolation` 룰).
 * `as const`로 union literal 타입 자동 추론.
 */
export const coinType = Object.freeze({
  BITCOIN: 'bitcoin',
  BITCOIN_TESTNET: 'bitcoin-testnet',
  ERC20: 'erc20',
  ERC20_KOVAN: 'erc20',
  ETHEREUM: 'ethereum',
  ETHEREUM_KOVAN: 'ethereum',
  KLAYTN: 'klaytn',
  KLAY_BAOBAB: 'klaytn-testnet',
  KLAYTN_KCT: 'klaytn-erc20',
  KCT_BAOBAB: 'krc20-testnet',
  MONACOIN: 'monacoin',
  MONACOIN_TESTNET: 'monacoin-testnet',
  RIPPLE: 'ripple',
  RIPPLE_TESTNET: '',
  RRC20: 'rrc20',
  RRC20_TESTNET: 'rrc20',
  RSK: 'rsk',
  RSK_TESTNET: 'rsk-testnet',
  XDC: 'xinfin',
  XRC20: 'xrc20',
  XDC_APOTHEM: 'xinfin',
  XRC20_APOTHEM: 'xrc20',
  HEDERA: 'hedera',
  HEDERA_TESTNET: 'hedera-testnet',
  HEDERA_HTS: 'hedera-hts',
  HTS_TESTNET: 'hedera-hts-test',
  STELLAR: 'stellar',
  STELLAR_TESTNET: 'stellar-testnet',
  TRON: 'tron',
  TRON_TESTNET: 'tron-testnet',
  TRON_TRC_TOKEN: 'trc-token',
  TRON_TRC_TESTNET: 'trc-testnet',
  TEZOS: 'tezos',
  TEZOS_TESTNET: 'tezos-testnet',
  XTZ_FA: 'xtz-fa',
  XTZ_FA_TESTNET: 'xtz-fa-testnet',
  VECHAIN: 'vechain',
  VECHAIN_ERC20: 'vechain-erc20',
  NEAR: 'near',
  NEAR_TESTNET: 'near-testnet',
  NEAR_TOKEN: 'near-token',
  HAVAH: 'havah',
  HAVAH_TESTNET: 'havah-testnet',
  HAVAH_HSP20: 'havah-hsp20',
  HAVAH_HSP20_TESTNET: 'havah-hsp20-testnet',
  POLKADOT: 'polkadot',
  COSMOS: 'cosmos',
  COREUM: 'coreum',
  ALGORAND: 'algorand',
  ALGORAND_TESTNET: 'algo-testnet',
  ALGORAND_ASSET: 'algo-asset',
  ALGORAND_ASSET_TESTNET: 'algo-asset-test',
  ALGORAND_APP: 'algo-app',
  ALGORAND_APP_TESTNET: 'algo-app-test',
  PARA: 'para',
  PARA_TESTNET: 'para-testnet',
  PARA_XC20: 'para-xc20',
  PARA_XC20_TESTNET: 'para-xc20-testnet',
} as const)

export type CoinType = keyof typeof coinType
export type CoinTypeValue = typeof coinType[CoinType]
