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
import type { AccountListV2Payload, V2AccountInfo } from '../../../../src/sign/types'
import type { AddressFormat } from '../../../../src/sign/address'
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

  // T-SYNC-01: V2AccountInfo 정본 shape B 불변식 (connector ↔ sdk drift-guard).
  // sdk accountV2.test.ts:640-706 T-SYNC-01과 대칭 — 양측이 같은 shape를 단언하여 drift를 자동 감지.
  test('T-SYNC-01: V2AccountInfo shape B 불변식 — resolved는 chainId(full CAIP-19)+keyPath+label, caip19/unresolved/raw 부재; unresolved는 chainId:null+raw', async () => {
    const { transport } = ensureSingleton()

    const resolved = {
      // 정본 B resolved: chainId=full CAIP-19, keyPath, label만. unresolved/raw discriminant 미포함
      // (sdk enrichAccountInfo가 resolved에 unresolved 키를 싣지 않음 — sdk T-SYNC-01과 대칭).
      chainId: 'eip155:1/slip44:60',
      keyPath: "m/44'/60'/0'/0/0",
      label: 'ETH',
    }
    const unresolved = {
      chainId: null,
      unresolved: true as const,
      raw: { coin_group: 'CUSTOM', coin_name: 'NONE', address_path: "m/44'/999'/0'/0/0", label: 'U' },
    }

    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'sync1',
      result: { account: [resolved, unresolved] },
    })

    const resp = await getAccountInfo()
    const accounts = resp.body.parameter!.account

    // resolved branch — shape B invariants
    const r = accounts[0]
    expect(r.chainId).toBe('eip155:1/slip44:60')
    expect(typeof r.chainId).toBe('string')
    expect((r.chainId as string)).toContain('/') // full CAIP-19 (slash 포함)
    expect(r).not.toHaveProperty('caip19') // 정본 B: 별도 caip19 필드 없음
    expect(r).not.toHaveProperty('unresolved') // resolved는 discriminant 미포함
    expect(r).not.toHaveProperty('raw') // raw는 unresolved 전용
    if (!r.unresolved) {
      expect(r.keyPath).toBe("m/44'/60'/0'/0/0")
      expect(r.label).toBe('ETH')
    }
    // v1 fields absent (v2 invariant)
    expect(r).not.toHaveProperty('coin_group')
    expect(r).not.toHaveProperty('coin_name')
    expect(r).not.toHaveProperty('address_path')

    // unresolved branch — discriminant + raw
    const u = accounts[1]
    expect(u.chainId).toBeNull()
    if (u.unresolved) {
      expect(u.raw.coin_group).toBe('CUSTOM')
      expect(u.raw.address_path).toBe("m/44'/999'/0'/0/0")
    }
    expect(u).not.toHaveProperty('keyPath')
  })

  // T-U-AF-RT-01: sdk(m09-03-27)가 도출한 meta.addressFormat이 connector를 그대로 통과(passthrough).
  // connector는 forward만 — meta 값을 해석/검증하지 않음 (connector-chain-addition-isolation).
  test('T-U-AF-RT-01: meta.addressFormat:"segwit-native" account → getAccountInfo passthrough → dApp이 meta.addressFormat 접근', async () => {
    const { transport } = ensureSingleton()

    // 컴파일 타임 검증 — V2AccountMeta가 addressFormat known key를 수용 (T-TSC-01 대상)
    const btcSegwit: V2AccountInfo = {
      chainId: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
      keyPath: "m/84'/0'/0'/0/0",
      label: 'BTC-SEGWIT',
      meta: { addressFormat: 'segwit-native' },
      unresolved: false,
    }

    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'af1',
      result: { account: [btcSegwit] },
    })

    const resp = await getAccountInfo()
    const acc = resp.body.parameter!.account[0]

    if (!acc.unresolved) {
      // 컴파일 타임 가드 — meta.addressFormat이 known key(AddressFormat)로 타입됨을 강제.
      // addressFormat이 index signature(unknown)로 회귀하면 이 binding이 컴파일 실패한다.
      const fmt: AddressFormat | undefined = acc.meta?.addressFormat
      // passthrough — dApp이 BTC legacy/segwit 구분에 사용
      expect(fmt).toBe('segwit-native')
      expect(acc.chainId).toBe('bip122:000000000019d6689c085ae165831e93/slip44:0')
    }
  })
})
