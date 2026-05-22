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
import type { V1Response, V1ResponseHeader, V1ResponseBody } from './types'

/** _call 입력 — method 이름 + optional chainId(CAIP-19) + optional params 객체. */
export interface CallInput {
  method: string
  /**
   * CAIP-19 chain identifier — m09-04-01 NEW schema에서 sign API가 별도 필드로 분리.
   * sign 외 read-only/lifecycle 메서드(getDeviceInfo / info 등)는 chainId가 없을 수 있어 optional.
   */
  chainId?: string
  /**
   * (Session deviceId, 2026-05-22) dApp이 이전 응답에서 캡처한 deviceId를 후속 호출에 전달.
   * PopupTransport의 setPendingDeviceId로 등록되어 sdk handshake params로 송신됨. sdk는
   * 권한 캐시된 device 중 deviceId 매칭하는 것에 자동 연결 (picker 없음). mismatch면 sdk가
   * ProviderRpcError(4001)을 envelope.error로 반환 → V1Response failure.
   *
   * 미명시 시 기존 흐름 (picker UI). 첫 호출에는 dApp이 deviceId를 모르므로 undefined.
   */
  deviceId?: string
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
 * raw payload를 v1 호환 success V1Response로 wrap한다.
 * popup이 v1 형식이 아닌 raw 결과를 보낸 경우의 매퍼.
 *
 * 매 호출마다 새 객체 생성 — mutation-isolation.
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
      // shallow copy로 호출자 mutation 격리 (mutation-isolation)
      body.parameter = { ...(result as Record<string, unknown>) }
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
    cloned.body.parameter = { ...response.body.parameter }
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

  // (Session deviceId, 2026-05-22) deviceId hint를 다음 handshake에 전달. PopupTransport의
  // 첫 send가 sendHandshake를 trigger하기 전 본 setter가 호출되어야 함. 본 _call이 모든
  // dcent.* method의 단일 entry이므로 setter call site는 1곳으로 충분.
  // PopupTransport 외 transport 타입은 본 메서드를 가지지 않을 수 있으므로 type guard.
  if (
    'setPendingDeviceId' in transport &&
    typeof (transport as { setPendingDeviceId?: unknown }).setPendingDeviceId === 'function'
  ) {
    ;(transport as { setPendingDeviceId: (id: string | undefined) => void }).setPendingDeviceId(
      input.deviceId,
    )
  }

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

    // boundary-validation: envelope shape. (Session deviceId) envelope.deviceId 캐시 — 성공/
    // 에러 두 경로 모두 응답에 echo.
    const responseDeviceId = envelope?.deviceId

    if (envelope && envelope.error) {
      // popup이 envelope.error로 실패를 보낸 경우 (드물지만 spec 가능)
      const code = envelope.error.code
      const message = envelope.error.message ?? ''
      // ProviderError-equivalent로 매핑 (providerErrorToV1 재사용)
      // mock된 ProviderError-like 객체 생성 — 구조만 맞추면 매핑 동작
      const errLike = Object.assign(new Error(message), { code }) as Error & { code: number }
      // providerErrorToV1는 instanceof ProviderError 검사로 구분하므로 이 경로는 fallback
      // 'internal_error' 또는 specific code 매핑이 필요하면 별도 헬퍼 사용
      // 여기서는 일반 Error 경로로 fallback (T-U-ERR-04 동등)
      const v1Err = providerErrorToV1(errLike)
      if (responseDeviceId !== undefined) v1Err.deviceId = responseDeviceId
      return v1Err
    }

    const result = envelope?.result

    let v1: V1Response
    if (isV1ResponseShape(result)) {
      v1 = cloneV1Response(result)
    } else {
      v1 = wrapV1Success(result, input.method)
    }
    // (Session deviceId) 응답에 deviceId echo — dApp이 result.deviceId 캡처 가능.
    if (responseDeviceId !== undefined) v1.deviceId = responseDeviceId
    return v1
  } catch (err) {
    // PopupTransport.send가 reject한 ProviderError 또는 generic Error
    return providerErrorToV1(err as Error)
  }
}
