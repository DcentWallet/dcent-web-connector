/**
 * v2 sign — public 통합 sign API (m09-04-01 NEW schema, m09-04-05 payload contract)
 *
 * dApp이 호출하는 단일 진입점.
 *
 * Schema (2026-05-21 사용자 결정):
 *   기존: sign({chain, payload})  — chain 문자열이 곧 method
 *   신규: sign({method, chainId, payload}) — method intent literal + chainId(CAIP-19) 분리
 *
 * 동작:
 *   1. method / chainId 값을 각각 sanitize (type/length/whitelist/prototype 키)
 *   2. payload를 family-agnostic light validation (m09-04-05) — keyPath 강제, 프로토타입 차단, DoS 가드
 *   3. _call({method, chainId, params: payload})로 위임
 *
 * connector-chain-addition-isolation 룰: chain enum / 정적 매핑 부재.
 * connector는 chain-agnostic transport이며, chain 식별자 → method dispatch 책임은
 * bridge sdk 측이 `resolveChainId(chainId)` + wallet-models registry로 처리한다.
 *
 * 룰 준수:
 *   - dapp-input-sanitization: method / chainId / payload 검증 (C3). family-specific 필드는 bridge sdk 책임
 *   - error-handling-consistency: V1Response를 그대로 반환 (throw는 sanitize / validatePayload에서만)
 *   - provider-security-checklist C3: method / chainId / payload는 dApp-controllable.
 *     connector 경계에서 universal shape contract를 강제하고, family-specific 필드는 sdk가 처리.
 *   - connector-chain-addition-isolation: chain enum / 정적 매핑 부재. _validateSignPayload는 family-agnostic.
 */

import { _call } from './call'
import { _sanitizeMethod, _sanitizeChainId } from './sanitize'
import { _validateSignPayload } from './_validateSignPayload'
import { _sanitizeTransportOption } from './_sanitizeTransportOption'
import type { V1Response } from './types'

export type { SignPayload } from './_validateSignPayload'

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
  /**
   * bridge sdk가 받을 payload — `keyPath: string` 필수, family-specific 필드는 sdk가 처리.
   * connector 경계에서 보장되는 contract는 `_validateSignPayload` 참조.
   */
  payload: Record<string, unknown>
  /**
   * (m09-04-03) per-call HW transport 힌트. 명시 시 sdk popup이 picker UI를 skip하고
   * 해당 transport로 즉시 connect한다. 미명시 시 sdk picker UI fallback.
   *
   * - 'hid': WebHID 강제
   * - 'ble': WebBLE 강제
   * - undefined: sdk picker UI (기본)
   *
   * 같은 popup lifecycle 내 두 번째 호출의 transport 옵션은 silent ignore (first-wins).
   * connector-chain-addition-isolation: transport는 chain과 직교 (모든 chain 공통).
   *
   * @throws ProviderError(INVALID_PARAMS) — invalid 값('webusb', null, '' 등)
   */
  transport?: 'hid' | 'ble'
}

/**
 * 통합 sign API — dApp이 method + chainId + payload만 알면 호출 가능.
 *
 * @example EVM personal_sign (signMessage)
 *   await dcent.sign({
 *     method: 'signMessage',
 *     chainId: 'eip155:1',
 *     payload: {
 *       keyPath: "m/44'/60'/0'/0/0",
 *       message: '0x48656c6c6f',
 *       // EVM family는 sdk가 wallet-models proxy에 address를 자동 inject (m09-03-05).
 *       // dApp이 address를 보내도 sdk가 무시 (family-specific은 sdk 책임).
 *     },
 *   })
 *
 * @example EVM signTransaction (EIP-1559)
 *   await dcent.sign({
 *     method: 'signTransaction',
 *     chainId: 'eip155:1',
 *     payload: {
 *       keyPath: "m/44'/60'/0'/0/0",
 *       transaction: { from: '0xabc...', to: '0xdef...', value: '0x...', type: '0x2' },
 *     },
 *   })
 *
 * @example Bitcoin signTransaction
 *   await dcent.sign({
 *     method: 'signTransaction',
 *     chainId: 'bip122:000000000019d6689c085ae165831e93',
 *     payload: {
 *       keyPath: "m/44'/0'/0'/0/0",
 *       transaction: { inputs: [...], outputs: [...] },
 *     },
 *   })
 *
 * @param input { method, chainId, payload }
 * @returns V1Response (v1 호환 응답 shape)
 * @throws ProviderError(INVALID_PARAMS) — method / chainId / payload 검증 실패 시
 */
export async function sign (input: SignInput): Promise<V1Response> {
  const safeMethod = _sanitizeMethod(input.method)
  const safeChainId = _sanitizeChainId(input.chainId)
  _validateSignPayload(safeChainId, input.payload)
  // (m09-04-03) transport 옵션 sanitize — 'hid' | 'ble' | undefined (INVALID_PARAMS throw 가능)
  const safeTransport = _sanitizeTransportOption(input.transport)
  return _call({
    method: safeMethod,
    chainId: safeChainId,
    params: input.payload,
    transport: safeTransport,
  })
}
