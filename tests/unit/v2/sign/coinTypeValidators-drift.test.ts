/**
 * coinTypeValidators drift 방어 테스트 (m08-01-02.5)
 *
 * v2 helper들이 v1 src-v1/index.js의 동작과 1:1 일치하는지 검증.
 *
 * v1 helper들은 private(module-internal)이므로 require로 직접 비교 불가.
 * 대신 v1 source의 case enum을 hardcoded fixture로 추출하여 v2 결과와 대조.
 *
 * Fixture 출처: src-v1/index.js#l470-688의 각 switch case + dcentCoinType / dcentCoinGroup enum.
 *
 * T-DRIFT-VALIDATOR-01: isAvaliableCoinType — 모든 enum 값 + invalid
 * T-DRIFT-VALIDATOR-02: isCzoneCoinType
 * T-DRIFT-VALIDATOR-03: isParachainCoinType
 * T-DRIFT-VALIDATOR-04: isBitcoinTxCoinType
 * T-DRIFT-VALIDATOR-05: isTokenType
 * T-DRIFT-VALIDATOR-06: getCzonePrifix (v1 typo 보존)
 */

import { Buffer } from 'buffer'
import {
  isAvaliableCoinType,
  isCzoneCoinType,
  isParachainCoinType,
  isBitcoinTxCoinType,
  isTokenType,
  getCzonePrifix,
} from '../../../../src/sign/coinTypeValidators'
import { coinType as dcentCoinType } from '../../../../src/types/coinType'
import { coinGroup as dcentCoinGroup } from '../../../../src/types/coinGroup'

// ────────────────────────────────────────────────────────────────────────────
// Fixtures (v1 src-v1/index.js의 case enum을 그대로 옮김)
// v2 enum은 m08-01-01에서 v1과 1:1 보장되므로 enum value를 그대로 사용.
// ────────────────────────────────────────────────────────────────────────────

/** v1 isAvaliableCoinType (l545-612)이 true 반환하는 모든 case. */
const V1_AVAILABLE_COIN_TYPE_KEYS = [
  'BITCOIN', 'BITCOIN_TESTNET', 'MONACOIN', 'MONACOIN_TESTNET',
  'ETHEREUM', 'ETHEREUM_KOVAN', 'ERC20', 'ERC20_KOVAN',
  'RRC20', 'RRC20_TESTNET', 'RSK', 'RSK_TESTNET',
  'KLAYTN', 'KLAY_BAOBAB', 'KLAYTN_KCT', 'KCT_BAOBAB',
  'RIPPLE', 'RIPPLE_TESTNET',
  'XDC', 'XDC_APOTHEM', 'XRC20', 'XRC20_APOTHEM',
  'HEDERA', 'HEDERA_HTS', 'HEDERA_TESTNET', 'HTS_TESTNET',
  'STELLAR', 'STELLAR_TESTNET',
  'TRON', 'TRON_TESTNET', 'TRON_TRC_TOKEN', 'TRON_TRC_TESTNET',
  'TEZOS', 'TEZOS_TESTNET', 'XTZ_FA', 'XTZ_FA_TESTNET',
  'VECHAIN', 'VECHAIN_ERC20',
  'NEAR', 'NEAR_TESTNET', 'NEAR_TOKEN',
  'HAVAH', 'HAVAH_TESTNET', 'HAVAH_HSP20', 'HAVAH_HSP20_TESTNET',
  'POLKADOT', 'COSMOS', 'COREUM',
  'ALGORAND', 'ALGORAND_TESTNET',
  'ALGORAND_ASSET', 'ALGORAND_ASSET_TESTNET',
  'ALGORAND_APP', 'ALGORAND_APP_TESTNET',
  'PARA', 'PARA_TESTNET', 'PARA_XC20', 'PARA_XC20_TESTNET',
] as const

const INVALID_COIN_TYPES = ['', 'UNKNOWN_COIN', 'foo-bar', 'random123', '123']

describe('coinTypeValidators drift — m08-01-02.5', () => {
  describe('T-DRIFT-VALIDATOR-01: isAvaliableCoinType', () => {
    // v1 동작: 입력은 enum **value**(혹은 case-insensitive 변형)이어야 매치.
    // enum **key**는 일부만 매치(키와 값이 동일한 경우, 예: BITCOIN/ETHEREUM).
    // 따라서 모든 v1 enum value를 fixture로 사용 + key 케이스는 별도로 매치 가능한 것만 검증.
    test.each(V1_AVAILABLE_COIN_TYPE_KEYS)(
      'enum value for %s → true (input as enum value)',
      (key) => {
        const value = (dcentCoinType as Record<string, string>)[key]
        // v1 RIPPLE_TESTNET value는 빈 문자열 → falsy 가드로 false 반환 (v1 동작과 일치)
        if (value === '') {
          expect(isAvaliableCoinType(value)).toBe(false)
        } else {
          expect(isAvaliableCoinType(value)).toBe(true)
        }
      },
    )

    // 키 자체가 매치되는 케이스 — value === key.toLowerCase() 인 경우만 (case-insensitive)
    test.each([
      'BITCOIN', 'ETHEREUM', 'KLAYTN', 'RIPPLE',
      'HEDERA', 'STELLAR', 'TRON', 'TEZOS', 'VECHAIN', 'NEAR',
      'HAVAH', 'POLKADOT', 'COSMOS', 'COREUM', 'ALGORAND', 'PARA',
    ])(
      'enum key %s → true (key matches value lowercase)',
      (key) => {
        expect(isAvaliableCoinType(key)).toBe(true)
      },
    )

    test.each(INVALID_COIN_TYPES)('invalid "%s" → false', (input) => {
      expect(isAvaliableCoinType(input)).toBe(false)
    })

    // null/undefined도 falsy 가드로 false (TypeScript 타입을 우회한 런타임 검증)
    test('null → false (falsy guard)', () => {
      expect(isAvaliableCoinType(null as unknown as string)).toBe(false)
    })
    test('undefined → false (falsy guard)', () => {
      expect(isAvaliableCoinType(undefined as unknown as string)).toBe(false)
    })
  })

  describe('T-DRIFT-VALIDATOR-02: isCzoneCoinType', () => {
    test('COREUM → true', () => {
      expect(isCzoneCoinType('COREUM')).toBe(true)
    })
    test('coreum (lowercase value) → true', () => {
      expect(isCzoneCoinType(dcentCoinType.COREUM)).toBe(true)
    })
    test.each(['BITCOIN', 'ETHEREUM', 'PARA', 'COSMOS'])(
      'non-czone %s → false',
      (input) => {
        expect(isCzoneCoinType(input)).toBe(false)
      },
    )
  })

  describe('T-DRIFT-VALIDATOR-03: isParachainCoinType', () => {
    // v1과 동일: enum value 또는 enum value의 대문자 변형 모두 허용 (toLowerCase 비교).
    // enum 키 자체는 값과 다를 수 있어 사용 안 함 (e.g. PARA_TESTNET key vs 'para-testnet' value).
    test.each([
      dcentCoinType.PARA,             // 'para'
      dcentCoinType.PARA_TESTNET,     // 'para-testnet'
      dcentCoinType.PARA_XC20,        // 'para-xc20'
      dcentCoinType.PARA_XC20_TESTNET, // 'para-xc20-testnet'
      'PARA',                          // PARA key == value 'para' (toLowerCase 매치)
    ])('parachain "%s" → true', (input) => {
      expect(isParachainCoinType(input)).toBe(true)
    })
    test.each([
      dcentCoinType.BITCOIN, dcentCoinType.ETHEREUM,
      dcentCoinType.COSMOS, dcentCoinType.COREUM,
    ])('non-parachain "%s" → false', (input) => {
      expect(isParachainCoinType(input)).toBe(false)
    })
    test('null → false (falsy guard)', () => {
      expect(isParachainCoinType(null as unknown as string)).toBe(false)
    })
  })

  describe('T-DRIFT-VALIDATOR-04: isBitcoinTxCoinType', () => {
    test.each([
      dcentCoinType.BITCOIN,
      dcentCoinType.BITCOIN_TESTNET,
      dcentCoinType.MONACOIN,
      dcentCoinType.MONACOIN_TESTNET,
      'BITCOIN', // key == value 'bitcoin' 매치
    ])('bitcoin tx "%s" → true', (input) => {
      expect(isBitcoinTxCoinType(input)).toBe(true)
    })
    test.each([
      dcentCoinType.ETHEREUM, dcentCoinType.COREUM,
      dcentCoinType.PARA, 'foo',
    ])('non-bitcoin "%s" → false', (input) => {
      expect(isBitcoinTxCoinType(input)).toBe(false)
    })
  })

  describe('T-DRIFT-VALIDATOR-05: isTokenType', () => {
    // v1 src-v1/index.js#l614-643의 case 그대로
    const tokenInputs = [
      // coinGroup keys
      dcentCoinGroup.ERC20, dcentCoinGroup.ERC20_KOVAN,
      dcentCoinType.RRC20, dcentCoinType.RRC20_TESTNET,
      dcentCoinType.KLAYTN_KCT, dcentCoinType.KCT_BAOBAB,
      dcentCoinGroup.XRC20, dcentCoinGroup.XRC20_APOTHEM,
      dcentCoinGroup.VECHAIN_ERC20,
      dcentCoinGroup.HAVAH_HSP20, dcentCoinGroup.HAVAH_HSP20_TESTNET,
      dcentCoinGroup.NEAR_TOKEN,
      dcentCoinType.ALGORAND_ASSET, dcentCoinType.ALGORAND_ASSET_TESTNET,
      dcentCoinType.ALGORAND_APP, dcentCoinType.ALGORAND_APP_TESTNET,
      dcentCoinGroup.PARA_XC20, dcentCoinGroup.PARA_XC20_TESTNET,
    ]

    test.each(tokenInputs)('token group/type "%s" → true', (input) => {
      expect(isTokenType(input)).toBe(true)
    })

    test.each(['BITCOIN', 'ETHEREUM', 'COREUM', 'PARA'])(
      'non-token %s → false',
      (input) => {
        expect(isTokenType(input)).toBe(false)
      },
    )

    test('null → false (falsy guard)', () => {
      expect(isTokenType(null as unknown as string)).toBe(false)
    })
  })

  describe('T-DRIFT-VALIDATOR-06: getCzonePrifix (v1 typo 보존)', () => {
    test('COREUM → Buffer.from("core").toString("hex")', () => {
      const expected = Buffer.from('core', 'utf8').toString('hex')
      expect(getCzonePrifix('COREUM')).toBe(expected)
    })

    test('coreum (lowercase value) → 동일 hex', () => {
      const expected = Buffer.from('core', 'utf8').toString('hex')
      expect(getCzonePrifix(dcentCoinType.COREUM)).toBe(expected)
    })

    test.each(['BITCOIN', 'ETHEREUM', 'PARA'])(
      'non-czone %s → undefined',
      (input) => {
        expect(getCzonePrifix(input)).toBeUndefined()
      },
    )
  })
})
