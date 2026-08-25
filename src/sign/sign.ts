/**
 * v2 sign — public 통합 sign API (m09-04-01 NEW schema, m09-04-05 payload contract)
 *
 * App이 호출하는 단일 진입점.
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
 *   - provider-security-checklist C3: method / chainId / payload는 App-controllable.
 *     connector 경계에서 universal shape contract를 강제하고, family-specific 필드는 sdk가 처리.
 *   - connector-chain-addition-isolation: chain enum / 정적 매핑 부재. _validateSignPayload는 family-agnostic.
 */

import { _call } from './call'
import { _sanitizeMethod, _sanitizeChainId } from './sanitize'
import { _validateSignPayload } from './_validateSignPayload'
import type { V1Response } from './types'

export type { SignPayload } from './_validateSignPayload'

/**
 * 검증을 통과한 payload의 **전송용 스냅샷**을 만든다 (mutation-isolation).
 *
 * `_call`은 SerialRequestQueue(`chain.then(task, task)`)로 요청을 직렬화하므로 검증 시점과
 * 실제 `postMessage`(구조화 복제) 사이에 **실제 지연 창**이 생긴다. 원본 참조를 그대로 넘기면
 * 그 사이 호출자가 payload를 in-place 변경했을 때 **검증을 통과한 내용과 다른 값**이 서명
 * 요청으로 나간다. keyPath / 프로토타입 키 / 64KB 크기 가드가 전부 검증 시점 기준이라
 * 값뿐 아니라 가드 자체도 검증 후 무력화될 수 있다.
 *
 * 같은 함수 안의 비대칭도 함께 해소한다 — method / chainId는 `_sanitize*`가 반환한 **새 값**을
 * 쓰는데 payload만 원본 참조였다. 응답 방향은 `call.ts`의 `deepClonePlain`이 이미 격리 중.
 *
 * 비-cloneable 값(함수 등)이 섞여 `structuredClone`이 실패하면 **원본을 그대로 반환**한다.
 * 그 payload는 `postMessage`도 동일하게 거부하므로 기존 동작이 그대로 보존된다
 * (JSON 라운드트립 폴백을 두면 함수가 조용히 탈락해 없던 성공 경로가 생기므로 두지 않는다).
 */
function _snapshotPayload (payload: Record<string, unknown>): Record<string, unknown> {
  try {
    return structuredClone(payload)
  } catch {
    return payload
  }
}

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
   *
   * **Bitcoin family 전용 optional 필드 `addressFormat`** (`'legacy' | 'segwit-wrapped' |
   * 'segwit-native' | 'taproot'` — `getAddress` / `getPublicKey` 와 같은 enum): BTC 는 legacy 와
   * segwit 계정이 같은 chainId 와 같은 `m/44'` keyPath 를 쓰므로 그 둘만으로는 어느 계정이
   * 서명하는지 가려지지 않는다. `getAccountInfo` 응답의 `meta.addressFormat` 을 그대로 실어
   * 보내면 된다. 생략하면 sdk/wm 이 `transaction.inputs[].txType` 에서 추론하는 종전 동작으로
   * 폴백한다(PSBT payload 에는 그 신호가 없다). connector 는 값을 해석하지 않고 forward 만 한다
   * (`connector-chain-addition-isolation` — chain enum/매핑 0건). enum 검증은 sdk 경계에서 수행.
   */
  payload: Record<string, unknown>
  // (DC-2701) per-call transport 옵션 제거 — transport는 기기 연결 속성이므로 연결 단위
  // `dcent.setTransport('hid'|'ble')`로 일원화(lifecycle). handshake first-wins라 per-call
  // 옵션은 두 번째 호출부터 무시되어 오해를 유발했음.
}

/**
 * 통합 sign API — App이 method + chainId + payload만 알면 호출 가능.
 *
 * @example EVM personal_sign (signMessage)
 *   await dcent.sign({
 *     method: 'signMessage',
 *     chainId: 'eip155:1',
 *     payload: {
 *       keyPath: "m/44'/60'/0'/0/0",
 *       message: '0x48656c6c6f',
 *       // EVM family는 sdk가 wallet-models proxy에 address를 자동 inject (m09-03-05).
 *       // App이 address를 보내도 sdk가 무시 (family-specific은 sdk 책임).
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
 * @example Bitcoin signTransaction (addressFormat 로 legacy/segwit 계정 지정)
 *   await dcent.sign({
 *     method: 'signTransaction',
 *     chainId: 'bip122:000000000019d6689c085ae165831e93',
 *     payload: {
 *       keyPath: "m/44'/0'/0'/0/0",
 *       // getAccountInfo 응답의 meta.addressFormat 을 그대로 되돌려준다.
 *       // 생략 시 inputs[].txType 추론으로 폴백 (종전 동작).
 *       addressFormat: 'segwit-native',
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
  // 검증 통과 직후 스냅샷 — 검증 대상과 전송 대상을 같은 값으로 고정한다 (mutation-isolation).
  // 원본을 먼저 검증하는 순서를 유지해야 프로토타입 키 등 거부 사유가 clone 과정에서
  // 흡수되지 않는다. 두 줄은 같은 tick의 동기 실행이라 사이에 끼어들 창이 없다.
  const safePayload = _snapshotPayload(input.payload)
  // (DC-2701) transport는 연결 단위 dcent.setTransport()로 분리 — sign per-call 옵션 제거.
  return _call({
    method: safeMethod,
    chainId: safeChainId,
    params: safePayload,
  })
}
