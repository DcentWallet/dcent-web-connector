/**
 * v2 sign — internal `_call({method, params})` helper (m08-01-02)
 *
 * v1의 `dcent.call(params)` (src-v1/index.js#L172-L222)와 1:1 호환되는 internal helper.
 * - PopupTransport.send를 통해 popup으로 메시지 송신
 * - SerialRequestQueue로 요청 직렬화 (v1과 동등한 단일 inflight 보장)
 * - 응답을 V1Response 형태로 변환하여 dApp 호환성 유지
 *
 * 응답 envelope 매핑 정책 (R3):
 *   - PopupTransport.send 응답 = ResponseEnvelope<T> = { id, result?, error? }
 *   - 성공 case (result 채워짐):
 *       - result가 이미 v1 형식 ({header, body}) → 그대로 V1Response로 사용
 *       - result가 raw payload (header/body shape이 아님) → wrapV1Success로 v1 형식 wrap
 *   - 실패 case (error 채워짐 또는 reject) → providerErrorToV1로 V1Response (failure) 변환
 *
 * v1 특례 동작 (src-v1/index.js#L213-L218):
 *   - response.header.status === 'failure' && body.command === 'transaction' && body.error.code === 'user_cancel'
 *     → reject 아닌 resolve. _call은 v1과 동등하게 V1Response를 그대로 반환 (throw 안 함).
 *   - explicit throw가 필요한 wrapper는 _assertV1Success(resp)를 사용 (m08-01-03/04)
 *
 * 룰 준수:
 *   - error-handling-consistency: _call은 throw하지 않고 항상 V1Response 반환
 *   - mutation-isolation: 매 호출마다 새 V1Response 객체 (T-MUT-RESP-01/02)
 *   - dapp-input-sanitization: chain은 sign.ts가 sanitize. payload는 bridge sdk 책임 (pass-through)
 *   - boundary-validation: response shape 검증 — header/body 필드 존재 가드
 *   - async-hygiene: 모든 Promise는 await 또는 catch — dangling unhandled rejection 0
 *   - reuse-shared-utils: PopupTransport / SerialRequestQueue는 m02-01·m02-02·m07-02 SHIPPED 재사용
 */

import { _getQueue, _getTransport } from '../singleton'
import { _genId } from './idGen'
import { providerErrorToV1 } from './error'
import { ProviderError } from '../error/ProviderError'
import { ErrorCode } from '../error/ErrorCode'
import type { V1Response, V1ResponseHeader, V1ResponseBody } from './types'

/** _call 입력 — method 이름 + optional chainId(CAIP-19) + optional params 객체. */
export interface CallInput {
  method: string
  /**
   * CAIP-19 chain identifier — m09-04-01 NEW schema에서 sign API가 별도 필드로 분리.
   * sign 외 read-only/lifecycle 메서드(getDeviceInfo / info 등)는 chainId가 없을 수 있어 optional.
   */
  chainId?: string
  params?: Record<string, unknown>
}

/**
 * 응답 result가 이미 v1 형식인지 확인 (header.status 필드 보유).
 * boundary-validation: shape 검증을 통해 매핑 분기 결정.
 */
function isV1ResponseShape (result: unknown): result is V1Response {
  if (!result || typeof result !== 'object') return false
  const r = result as Partial<V1Response>
  if (!r.header || typeof r.header !== 'object') return false
  if (!r.body || typeof r.body !== 'object') return false
  const status = (r.header as Partial<V1ResponseHeader>).status
  return status === 'success' || status === 'failure'
}

/**
 * v1 payload(parameter) deep-clone helper — mutation-isolation.
 *
 * shallow spread(`{ ...parameter }`)는 top-level 키만 분리하므로, parameter가
 * **중첩 객체/배열**을 담으면(예: getPublicKey의 `{payment,stake,drep}` role 객체,
 * getAccountInfo의 account 배열) dApp이 `parameter.payment.publicKey`를 in-place 변경할 때
 * popup이 보낸 원본(또는 같은 객체를 재사용하는 다음 응답)에 leak된다.
 * deep-clone으로 반환 시점에 완전히 분리한다.
 *
 * v1 wire payload는 postMessage(structured clone)를 거친 JSON-호환 데이터이므로
 * structuredClone이 안전하다. 비-cloneable 값이 섞인 예외는 JSON 라운드트립으로 fallback,
 * 그조차 실패하면 원본을 그대로 반환(가용성 우선).
 */
function deepClonePlain<T> (value: T): T {
  try {
    return structuredClone(value)
  } catch {
    try {
      return JSON.parse(JSON.stringify(value)) as T
    } catch {
      return value
    }
  }
}

/**
 * raw payload를 v1 호환 success V1Response로 wrap한다.
 * popup이 v1 형식이 아닌 raw 결과를 보낸 경우의 매퍼.
 *
 * 매 호출마다 새 객체 생성 — mutation-isolation (중첩 payload는 deep-clone).
 */
function wrapV1Success (result: unknown, method: string): V1Response {
  const header: V1ResponseHeader = {
    version: '1.0',
    status: 'success',
    response_from: method,
  }
  const body: V1ResponseBody = {
    command: method,
  }
  if (result !== undefined && result !== null) {
    if (typeof result === 'object') {
      // deep clone으로 호출자 mutation 격리 — 중첩 객체/배열까지 분리 (mutation-isolation)
      body.parameter = deepClonePlain(result as Record<string, unknown>)
    } else {
      // primitive는 'value' 키로 wrap
      body.parameter = { value: result }
    }
  }
  return { header, body }
}

/**
 * v1 형식 응답을 매 호출마다 새 객체로 복사 (mutation-isolation T-MUT-RESP-01/02).
 *
 * 두 번 _call 호출 시 두 V1Response가 서로 다른 reference여야 하며,
 * dApp이 한쪽 parameter를 변경해도 다른 호출 결과 또는 popup이 보낸 원본에 영향을 주지 않아야 한다.
 */
function cloneV1Response (response: V1Response): V1Response {
  const cloned: V1Response = {
    header: { ...response.header },
    body: { command: response.body.command },
  }
  if (response.body.parameter) {
    // deep clone — 중첩 객체/배열(role별 publicKey, account 목록 등)까지 호출자 mutation 격리
    cloned.body.parameter = deepClonePlain(response.body.parameter)
  }
  if (response.body.error) {
    cloned.body.error = {
      code: response.body.error.code,
      message: response.body.error.message,
    }
  }
  return cloned
}

/**
 * internal `_call` helper — v1 dcent.call() 호환.
 *
 * @param input { method, params? }
 * @returns V1Response (success 또는 failure 형태). throw하지 않음.
 */
export async function _call (input: CallInput): Promise<V1Response> {
  const queue = _getQueue()
  const transport = _getTransport()
  const id = _genId()

  // (DC-2701) transport 힌트는 연결 단위 dcent.setTransport()가 singleton에 등록한다.
  // _call은 더 이상 per-call transport를 다루지 않는다 (handshake first-wins).

  try {
    const envelope = await queue.enqueue(() =>
      transport.send({
        id,
        method: input.method,
        // chainId는 optional — sign API에서만 채워지고 그 외 lifecycle 메서드는 undefined.
        // MessageTransport.send는 임의 envelope 필드를 그대로 forward하므로 sdk 측이 수신.
        ...(input.chainId !== undefined ? { chainId: input.chainId } : {}),
        params: input.params,
      }),
    )

    if (envelope && envelope.error) {
      // popup(sdk PopupListener)이 envelope.error로 실패를 보낸 경우. sdk는 ProviderRpcError의
      // number code (예: -32601 method_not_found, -32603 internal_error, -32602 invalid_params)를
      // 그대로 envelope.error.code에 보존해 송신한다. dApp이 보는 v1 string code 의미를
      // 보존하려면 ProviderError 인스턴스로 wrap해 V2_TO_V1_CODE 테이블을 거쳐야 한다 —
      // plain Error로 넘기면 'internal_error'로 평탄화되어 -32601 등 JSON-RPC 표준 의미가 유실됨.
      // 매핑 테이블에 없는 code는 여전히 'internal_error' fallback (V2_TO_V1_CODE 정의 기준).
      const rawCode = envelope.error.code
      const code = typeof rawCode === 'number' ? rawCode : ErrorCode.INTERNAL_ERROR
      const message = envelope.error.message ?? ''
      const providerErr = new ProviderError(code, message, envelope.error.data)
      const v1Err = providerErrorToV1(providerErr)
      return v1Err
    }

    const result = envelope?.result

    let v1: V1Response
    if (isV1ResponseShape(result)) {
      v1 = cloneV1Response(result)
    } else {
      v1 = wrapV1Success(result, input.method)
    }
    return v1
  } catch (err) {
    // PopupTransport.send가 reject한 ProviderError 또는 generic Error
    return providerErrorToV1(err as Error)
  }
}
