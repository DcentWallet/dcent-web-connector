/**
 * v2 sign — public 통합 sign API (m09-04-01 NEW schema)
 *
 * dApp이 호출하는 단일 진입점.
 *
 * Schema (2026-05-21 사용자 결정):
 *   기존: sign({chain, payload})  — chain 문자열이 곧 method
 *   신규: sign({method, chainId, payload}) — method intent literal + chainId(CAIP-19) 분리
 *
 * 동작:
 *   1. method / chainId 값을 각각 sanitize (type/length/whitelist/prototype 키)
 *   2. _call({method, chainId, params: payload})로 위임
 *
 * connector-chain-addition-isolation 룰: chain enum / 정적 매핑 부재.
 * connector는 chain-agnostic transport이며, chain 식별자 → method dispatch 책임은
 * bridge sdk 측이 `resolveChainId(chainId)` + wallet-models registry로 처리한다.
 *
 * 룰 준수:
 *   - dapp-input-sanitization: method / chainId 검증 (C3). payload는 bridge sdk 책임
 *   - error-handling-consistency: V1Response를 그대로 반환 (throw는 sanitize에서만)
 *   - provider-security-checklist C3: method / chainId는 dApp-controllable, sanitize가 origin-fixed가 아닌
 *     항목에 대한 whitelist 적용
 *   - connector-chain-addition-isolation: chain enum / 정적 매핑 부재
 */

import { _call } from './call'
import { _sanitizeMethod, _sanitizeChainId } from './sanitize'
import type { V1Response } from './types'

/** sign 입력 — method intent + chainId(CAIP-19) + payload (bridge로 그대로 전달). */
export interface SignInput {
  /**
   * Method intent literal — 일반적으로 'signMessage' 또는 'signTransaction'.
   * connector는 enum을 두지 않고 sdk로 그대로 forward (passthrough).
   */
  method: string
  /**
   * CAIP-19 chain identifier (예: 'eip155:1', 'eip155:1/slip44:60', 'bip122:000000...')
   * sdk가 본 값을 wallet-models registry로 dispatch에 사용.
   */
  chainId: string
  /** bridge sdk가 받을 payload (transaction body, account info, etc.) */
  payload: Record<string, unknown>
}

/**
 * 통합 sign API — dApp이 method + chainId + payload만 알면 호출 가능.
 *
 * @param input { method, chainId, payload }
 * @returns V1Response (v1 호환 응답 shape)
 * @throws ProviderError(INVALID_PARAMS) — method / chainId 검증 실패 시
 */
export async function sign (input: SignInput): Promise<V1Response> {
  const safeMethod = _sanitizeMethod(input.method)
  const safeChainId = _sanitizeChainId(input.chainId)
  return _call({ method: safeMethod, chainId: safeChainId, params: input.payload })
}
