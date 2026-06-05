/**
 * getAccountInfo v2 타입 passthrough 테스트 (m09-04-12)
 *
 * T-U-GAI-01: getAccountInfo() 반환 타입이 V1Response<AccountListV2Payload>로 narrowed.
 *   connector는 sdk(m09-03-21)가 enrich한 응답을 그대로 forward — 변환 로직 없음.
 *   dApp이 `resp.body.parameter?.account` 배열을 typed으로 접근 가능.
 *
 * connector-chain-addition-isolation: getAccountInfo는 응답 forward만.
 * 실제 enrich(chainId 주입, unresolved 마킹)는 sdk(m09-03-21) 담당.
 */

import { getAccountInfo } from '../../../../src/sign/info'
import type { AccountListV2Payload } from '../../../../src/sign/types'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('getAccountInfo v2 — m09-04-12', () => {
  test('T-U-GAI-01: getAccountInfo() → V1Response<AccountListV2Payload> passthrough (sdk enrich 응답 그대로 forward)', async () => {
    const { transport } = ensureSingleton()

    // sdk(m09-03-21)가 enrich한 응답 shape 시뮬레이션
    const v2Account = {
      chainId: 'eip155:1',
      caip19: undefined,
      contractAddress: undefined,
      keyPath: "m/44'/60'/0'/0/0",
      label: 'myETH',
      unresolved: false as const,
    }
    const unresolvedAccount = {
      chainId: null,
      unresolved: true as const,
      raw: {
        coin_group: 'HEDERA',
        coin_name: 'HEDERA',
        address_path: "m/44'/3030'/0'/0/0",
        label: 'HEDERA-01',
      },
    }

    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'gai1',
      result: {
        account: [v2Account, unresolvedAccount],
      },
    })

    const resp = await getAccountInfo()

    // 반환 타입이 V1Response<AccountListV2Payload>로 narrowed — TypeScript compile-time check
    const payload: AccountListV2Payload | undefined = resp.body.parameter
    expect(payload).toBeDefined()
    expect(Array.isArray(payload!.account)).toBe(true)
    expect(payload!.account).toHaveLength(2)

    // resolved account
    const acc0 = payload!.account[0]
    expect(acc0.chainId).toBe('eip155:1')
    // TypeScript narrow: unresolved === false → chainId는 string
    if (!acc0.unresolved) {
      expect(acc0.keyPath).toBe("m/44'/60'/0'/0/0")
      expect(acc0.label).toBe('myETH')
    }

    // unresolved account
    const acc1 = payload!.account[1]
    expect(acc1.chainId).toBeNull()
    if (acc1.unresolved) {
      expect(acc1.raw.coin_group).toBe('HEDERA')
      expect(acc1.raw.address_path).toBe("m/44'/3030'/0'/0/0")
    }
  })
})
