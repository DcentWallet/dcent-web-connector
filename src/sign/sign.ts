/**
 * v2 sign — public 통합 sign API (m08-01-02)
 *
 * dApp이 호출하는 단일 진입점. v1의 분산된 sign 함수들(`getEthereumSignedTransaction`,
 * `getBitcoinSignedTransaction`, `getXrpSignedTransaction`, ...)을 chain 인자 하나로 통합.
 *
 * 동작:
 *   1. chain 값을 _sanitizeChain으로 검증 (type/length/whitelist/prototype 키)
 *   2. chainToMethod로 bridge method 결정 (CAIP-19 prefix 매칭 또는 fallback)
 *   3. _call({method, params: payload})로 위임 — popup으로 송신 후 응답 수신
 *
 * 주의: v1 wrapper(m08-01-03/04)는 sign을 거치지 않고 _call을 직접 호출한다 (D-05).
 * 따라서 본 함수는 dApp이 새로 통합 API를 사용할 때만 진입점.
 *
 * 룰 준수:
 *   - dapp-input-sanitization: chain 검증 (C3). payload는 bridge sdk 책임으로 pass-through
 *   - error-handling-consistency: V1Response를 그대로 반환 (throw는 _sanitizeChain에서만)
 *   - provider-security-checklist C3: chain은 dApp-controllable, _sanitizeChain이 origin-fixed가 아닌
 *     항목에 대한 whitelist 적용
 */

import { _call } from './call'
import { chainToMethod } from './chainToMethod'
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
  const method = chainToMethod(safeChain)
  return _call({ method, params: input.payload })
}
