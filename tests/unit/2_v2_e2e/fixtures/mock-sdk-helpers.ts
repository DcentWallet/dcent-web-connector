/**
 * mock-sdk-helpers.ts — m09-04-07 sign one-round-trip e2e용 fixture
 *
 * **역할**: 본 fixture는 mock sdk server가 아니다. 실제 e2e는 globalSetup이 띄우는
 * 실 sdk static server(:5174)를 통해 round-trip한다. 이 fixture의 유일한 목적은
 * m09-03-05에서 sdk로 도입된 3개 invariant helper의 시그니처를 **drift 검증용**으로
 * static하게 보존하는 것이다.
 *
 * SYNC drift 검사 (T-SYNC-01):
 *   - 본 파일이 SYNC 마커 + 3개 helper 이름 모두를 명시
 *   - 본 파일과 sdk 실제 코드를 둘 다 grep으로 비교하여 drift 감지
 *
 * SYNC: m09-03-05 _assertValidAccount
 * SYNC: m09-03-05 _assertWmRegistrable
 * SYNC: m09-03-05 _injectDappParamsAddress
 *
 * 참조: main-repos/dcent-web-sdk/src/lib/client/DcentSdkClient.ts
 */

/**
 * sdk Layer 4 helper 시그니처 — drift 검사 reference.
 *
 * 본 인터페이스는 sdk 실제 구현과 1:1로 매칭되어야 하며, sdk가 시그니처를 변경하면
 * T-SYNC-01 grep이 양쪽 모두에서 동일 이름을 확인하여 drift를 1차로 감지한다.
 *
 * 실제 시그니처 (sdk 측, m09-03-05):
 *   private _assertValidAccount(account: AccountInfo, source: 'synthesized' | 'handleRequest'): void
 *   private _assertWmRegistrable(currency: CurrencyInfo, testnetFor?: string): void
 *   private _injectDappParamsAddress(method: string, params: unknown[], derivedAddress: string): unknown[]
 *
 * 본 fixture는 시뮬레이션을 수행하지 않는다 (실 sdk popup이 round-trip 책임).
 * 타입만 보존하여 drift 1차 감지의 grep target을 제공.
 */
export interface SdkInvariantHelpers {
  /**
   * SYNC: m09-03-05 _assertValidAccount
   *
   * universal address shape check. account.addresses[0].address가 non-empty string인지 확인.
   * 호출 위치: sdk handleRequest 진입점 + _synthesizeAccount 직후 (안전망).
   */
  _assertValidAccount: (account: unknown, source: 'synthesized' | 'handleRequest') => void

  /**
   * SYNC: m09-03-05 _assertWmRegistrable
   *
   * wm getSelectedCurrencyAccounts filter를 sdk-side로 시뮬레이션.
   * testnet currency mismatch (testnetFor=ETHEREUM vs currencyId=GOERLI)를 wm 도달 전 차단.
   */
  _assertWmRegistrable: (currency: unknown, testnetFor?: string) => void

  /**
   * SYNC: m09-03-05 _injectDappParamsAddress
   *
   * `_addressArgPosition.ts` 화이트리스트 lookup으로 personal_sign / eth_sign /
   * eth_signTransaction / signTypedData_v4 의 dApp methodParams address 자리에
   * sdk가 keyPath-derive한 address를 silent overwrite (Layer 4 (c) silent ignore 정책).
   */
  _injectDappParamsAddress: (method: string, params: unknown[], derivedAddress: string) => unknown[]
}

/**
 * 본 fixture의 SYNC 검증 식별자 — T-SYNC-01이 grep으로 확인하는 anchor.
 *
 * 추가/제거가 필요하면 sdk 실제 코드 변경과 동시에 본 export 배열도 갱신해야 한다.
 */
export const SDK_INVARIANT_HELPER_NAMES = [
  '_assertValidAccount',
  '_assertWmRegistrable',
  '_injectDappParamsAddress',
] as const

export type SdkInvariantHelperName = typeof SDK_INVARIANT_HELPER_NAMES[number]
