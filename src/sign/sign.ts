/**
 * v2 sign — public 통합 sign API (m09-04-01 fallback-only)
 *
 * dApp이 호출하는 단일 진입점. chain 식별자(CAIP-19 또는 v1 method)와 payload를
 * 그대로 bridge sdk에 전달한다.
 *
 * 동작:
 *   1. chain 값을 _sanitizeChain으로 검증 (type/length/whitelist/prototype 키)
 *   2. _call({method: safeChain, params: payload})로 위임 — chain 문자열이 곧 method
 *
 * m09-04-01 변경: chain 정적 매핑 제거. CAIP-19 prefix 매핑 책임은 bridge sdk 측이
 * `resolveChainId(chainId)` + wallet-models registry로 자동 dispatch한다. connector는
 * chain-agnostic transport (`connector-chain-addition-isolation` 룰).
 *
 * 룰 준수:
 *   - dapp-input-sanitization: chain 검증 (C3). payload는 bridge sdk 책임으로 pass-through
 *   - error-handling-consistency: V1Response를 그대로 반환 (throw는 _sanitizeChain에서만)
 *   - provider-security-checklist C3: chain은 dApp-controllable, _sanitizeChain이 origin-fixed가 아닌
 *     항목에 대한 whitelist 적용
 *   - connector-chain-addition-isolation: chain enum / 정적 매핑 부재
 */

import { _call } from './call'
import { _sanitizeChain } from './sanitize'
import type { V1Response } from './types'

/** sign 입력 — chain 식별자 + payload (bridge로 그대로 전달). */
export interface SignInput {
  /** CAIP-19 (예: 'eip155:1/erc20:0x...') 또는 v1 method 문자열 fallback */
  chain: string
  /** bridge sdk가 받을 payload (transaction body, account info, etc.) */
  payload: Record<string, unknown>
}

/**
 * 통합 sign API — dApp이 chain + payload만 알면 호출 가능.
 *
 * @param input { chain, payload }
 * @returns V1Response (v1 호환 응답 shape)
 * @throws ProviderError(INVALID_PARAMS) — chain 검증 실패 시
 */
export async function sign (input: SignInput): Promise<V1Response> {
  const safeChain = _sanitizeChain(input.chain)
  return _call({ method: safeChain, params: input.payload })
}
