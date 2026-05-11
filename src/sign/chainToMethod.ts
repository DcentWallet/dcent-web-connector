/**
 * v2 sign — CAIP-19 chain identifier → bridge method 매핑 (m08-01-02)
 *
 * dApp이 통합 sign API를 호출할 때 전달하는 `chain` 값(주로 CAIP-19 형식)을
 * bridge sdk가 인지하는 v1 method 이름(`eth_signTransaction` 등)으로 변환한다.
 *
 * 매칭 정책:
 *   - CAIP-19 prefix (`eip155:`, `bip122:`, `xrpl:`, `cosmos:`)에 해당하는 정적 매핑 적용
 *   - 매칭되지 않으면 chain 문자열을 method로 그대로 사용 (Sui 등 신규 네트워크 fallback)
 *
 * 룰 준수:
 *   - mutation-isolation: PREFIX_TO_METHOD 테이블은 Object.freeze로 외부 변경 차단
 *   - external-reference-edge-cases: CAIP-19 형식 자체는 wallet-models가 source of truth.
 *     본 매퍼는 prefix 매칭만 담당하고 chain 본문(reference / asset)은 검증하지 않음.
 *
 * 참고:
 *   - CAIP-2: https://chainagnostic.org/CAIPs/caip-2 (namespace:reference)
 *   - CAIP-19: https://chainagnostic.org/CAIPs/caip-19 (chainId/asset_namespace:asset_reference)
 */

/**
 * CAIP-19 namespace prefix → v1 method 정적 매핑.
 * Object.freeze로 외부에서 PREFIX_TO_METHOD['eip155:'] = '...' 같은 변경 차단.
 */
export const PREFIX_TO_METHOD: Readonly<Record<string, string>> = Object.freeze({
  'eip155:': 'eth_signTransaction',
  'bip122:': 'btc_signTransaction',
  'xrpl:': 'xrp_signTransaction',
  'cosmos:': 'cosmos_signTransaction',
})

/**
 * chain 문자열을 bridge method 이름으로 변환한다.
 *
 * - CAIP-19 prefix와 매칭되면 정적 테이블의 method 반환
 * - 매칭되지 않으면 chain 문자열을 그대로 method로 사용 (fallback)
 *
 * @param chain CAIP-19 (예: 'eip155:1/erc20:0x...') 또는 v1 method 문자열
 * @returns bridge sdk가 인지할 method 이름
 */
export function chainToMethod (chain: string): string {
  for (const prefix of Object.keys(PREFIX_TO_METHOD)) {
    if (chain.startsWith(prefix)) return PREFIX_TO_METHOD[prefix]
  }
  // CAIP-19 미정의 fallback — chain을 method로 직접 사용 (Sui 등)
  return chain
}
