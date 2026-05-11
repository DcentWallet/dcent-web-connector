/**
 * coinGroupValidator drift 방어 테스트 (m08-01-02.5)
 *
 * v1 isAvaliableCoinGroup (l479-516) + isAvailableSyncAccountCoinName (l531-543) 1:1.
 *
 * T-DRIFT-SYNCACC-01: 정상/invalid 짝 검증 + token group + non-token group 분기
 */

import {
  isAvaliableCoinGroup,
  isAvailableSyncAccountCoinName,
} from '../../../../src/sign/coinGroupValidator'

describe('isAvaliableCoinGroup — m08-01-02.5 (v1 enum 1:1)', () => {
  test.each([
    'BITCOIN', 'BTC-TESTNET',
    'MONACOIN', 'MONA-TESTNET',
    'ERC20', 'ERC20_KOVAN',
    'ETHEREUM', 'ETH-KOVAN',
    'RRC20', 'RRC20-TESTNET',
    'RSK', 'RSK-TESTNET',
    'KLAYTN', 'KLAYTN-TESTNET', 'KLAYTN-ERC20', 'KRC20-TESTNET',
    'RIPPLE', 'XRP-TESTNET',
    'XINFIN', 'XDC-APOTHEM', 'XRC20', 'XRC20-APOTHEM',
    'HEDERA', 'HEDERA-HTS', 'HEDERA-TESTNET', 'HTS-TESTNET',
    'STELLAR', 'TRON',
  ])('valid coinGroup "%s" → true', (input) => {
    expect(isAvaliableCoinGroup(input)).toBe(true)
  })

  test.each(['', 'random_unknown', 'foo-bar', 'COREUM', 'POLKADOT', 'ALGORAND'])(
    'invalid coinGroup "%s" → false',
    (input) => {
      expect(isAvaliableCoinGroup(input)).toBe(false)
    },
  )

  test('null → false (falsy guard)', () => {
    expect(isAvaliableCoinGroup(null as unknown as string)).toBe(false)
  })
})

describe('isAvailableSyncAccountCoinName — m08-01-02.5', () => {
  describe('T-DRIFT-SYNCACC-01: non-token group → coin_name이 valid coinGroup이어야', () => {
    test('BITCOIN + BITCOIN → true', () => {
      expect(
        isAvailableSyncAccountCoinName({ coin_group: 'BITCOIN', coin_name: 'BITCOIN' }),
      ).toBe(true)
    })

    test('ETHEREUM + ETHEREUM → true', () => {
      expect(
        isAvailableSyncAccountCoinName({ coin_group: 'ETHEREUM', coin_name: 'ETHEREUM' }),
      ).toBe(true)
    })

    test('BITCOIN + invalid coin_name → false', () => {
      expect(
        isAvailableSyncAccountCoinName({ coin_group: 'BITCOIN', coin_name: 'invalid_name' }),
      ).toBe(false)
    })
  })

  describe('T-DRIFT-SYNCACC-01b: token group (ERC20) → coin_name 0x prefix 필수', () => {
    test('ERC20 + 0xabc → true', () => {
      expect(
        isAvailableSyncAccountCoinName({ coin_group: 'ERC20', coin_name: '0xabc123' }),
      ).toBe(true)
    })

    test('ERC20 + 0XABC (uppercase 0X) → true', () => {
      expect(
        isAvailableSyncAccountCoinName({ coin_group: 'ERC20', coin_name: '0XABC123' }),
      ).toBe(true)
    })

    test('ERC20 + no prefix → false', () => {
      expect(
        isAvailableSyncAccountCoinName({ coin_group: 'ERC20', coin_name: 'noprefix' }),
      ).toBe(false)
    })
  })

  describe('T-DRIFT-SYNCACC-01c: contract group exemption — token-typed only', () => {
    /**
     * v1 동작:
     *   - isTokenType(coin_group)=true이면 token 분기로 진입하여 coin_name 0x prefix 또는
     *     `_contractNotStartWith0x(coin_group)` 둘 중 하나라도 true면 valid.
     *   - isTokenType=false이면 non-token 분기로 가서 coin_name이 valid coinGroup이어야.
     *
     * `_contractNotStartWith0x`는 token이 아닌 coin_group(TRC-TOKEN, HTS-TESTNET 등)도 포함하지만,
     * 그 그룹들은 isTokenType=false이므로 token 분기에 도달하지 못함. 따라서 _contractNotStartWith0x
     * exemption이 실제 효과를 주는 case는 isTokenType=true이면서 _contractNotStartWith0x도 true인
     * coin_group뿐이다 — 즉 XRC20 / XRC20-APOTHEM / ALGO-ASSET / ALGO-APP / XC20 등.
     */

    test('XRC20 + non-0x coin_name → true (token + _contractNotStartWith0x exemption)', () => {
      expect(
        isAvailableSyncAccountCoinName({ coin_group: 'XRC20', coin_name: 'token-id' }),
      ).toBe(true)
    })

    test('XRC20-APOTHEM + non-0x coin_name → true', () => {
      expect(
        isAvailableSyncAccountCoinName({ coin_group: 'XRC20-APOTHEM', coin_name: 'token-id' }),
      ).toBe(true)
    })

    test('XC20 + non-0x coin_name → true (PARA_XC20)', () => {
      expect(
        isAvailableSyncAccountCoinName({ coin_group: 'XC20', coin_name: 'xc20-id' }),
      ).toBe(true)
    })

    test('ALGO-ASSET + non-0x coin_name → true', () => {
      expect(
        isAvailableSyncAccountCoinName({ coin_group: 'ALGO-ASSET', coin_name: 'asset-id' }),
      ).toBe(true)
    })
  })
})
