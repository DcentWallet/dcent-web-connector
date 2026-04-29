import { ErrorCode } from './ErrorCode'

/**
 * v2 Provider 에러 클래스
 *
 * Error를 확장하며 code + message + data 필드를 보존.
 * instanceof Error / instanceof ProviderError 모두 true.
 * EIP-1193 호환 에러 구조 (code, message, data).
 */
export class ProviderError extends Error {
  public readonly code: ErrorCode | number
  public readonly data?: unknown

  constructor(code: ErrorCode | number, message: string, data?: unknown) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.data = data
    // V8 stack trace 보존 — non-V8 환경에서는 무시됨
    // tsconfig types:[] 환경에서는 captureStackTrace가 미정의이므로 타입 단언 사용
    const ErrorCtor = Error as unknown as { captureStackTrace?: (target: Error, ctor: unknown) => void }
    if (typeof ErrorCtor.captureStackTrace === 'function') {
      ErrorCtor.captureStackTrace(this, ProviderError)
    }
  }
}
