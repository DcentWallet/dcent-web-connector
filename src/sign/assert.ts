/**
 * v2 sign — _assertV1Success helper (m08-01-02, D-08 결정)
 *
 * v1 호환 wrapper(m08-01-03/04)가 explicit throw 의미를 원할 때 사용한다.
 * V1Response를 받아 status를 검사하고, failure이면 dcent 호환 Error로 throw.
 *
 * 단, v1의 특이 동작(`body.command === 'transaction' && error.code === 'user_cancel'`은
 * reject가 아닌 resolve)을 보존하기 위해 해당 케이스는 그대로 반환한다.
 *
 * 룰 준수:
 *   - error-handling-consistency: 자산/서명 함수가 explicit throw 패턴을 원할 때 1줄로 사용
 *   - mutation-isolation: 입력 response를 그대로 반환 (defensive copy 불필요 — 호출자 책임)
 */

import { ProviderError } from '../error/ProviderError'
import { ErrorCode } from '../error/ErrorCode'
import type { V1Response } from './types'

/**
 * V1Response의 status를 검사하여 failure이면 throw, success이면 그대로 반환.
 *
 * v1 특례: `body.command === 'transaction' && body.error.code === 'user_cancel'`은
 * status === 'failure'여도 resolve로 처리되었던 v1 동작을 보존하기 위해 그대로 반환.
 *
 * @param response V1Response
 * @returns success인 V1Response (또는 transaction.user_cancel 특례)
 * @throws ProviderError — failure인 경우 (특례 제외)
 */
export function _assertV1Success (response: V1Response): V1Response {
  if (response.header.status === 'success') return response

  // v1 특례: transaction + user_cancel은 resolve로 처리
  const cmd = response.body.command
  const errCode = response.body.error?.code
  if (cmd === 'transaction' && errCode === 'user_cancel') {
    return response
  }

  // 그 외 failure → throw
  const code = errCode ?? 'internal_error'
  const message = response.body.error?.message ?? `sign failed (${code})`
  throw new ProviderError(ErrorCode.INTERNAL_ERROR, message, { v1Code: code })
}
