/**
 * T-U-01, T-U-02: ProviderError 클래스 검증
 */
import { ProviderError } from '../../../../src/error/ProviderError'
import { ErrorCode } from '../../../../src/error/ErrorCode'

describe('ProviderError', () => {
  describe('T-U-01: 생성 시 code / message / data 필드 보존', () => {
    it('code와 message를 정확히 보존한다', () => {
      const err = new ProviderError(ErrorCode.USER_REJECTED, '사용자가 요청을 거부했습니다')
      expect(err.code).toBe(ErrorCode.USER_REJECTED)
      expect(err.message).toBe('사용자가 요청을 거부했습니다')
    })

    it('data 필드가 제공되면 보존한다', () => {
      const data = { reason: 'timeout', elapsed: 5000 }
      const err = new ProviderError(ErrorCode.DEVICE_TIMEOUT, 'device timeout', data)
      expect(err.data).toEqual(data)
    })

    it('data 필드가 생략되면 undefined이다', () => {
      const err = new ProviderError(ErrorCode.INTERNAL_ERROR, 'internal error')
      expect(err.data).toBeUndefined()
    })

    it('임의의 숫자 코드도 code로 보존한다', () => {
      const err = new ProviderError(9999, 'custom error')
      expect(err.code).toBe(9999)
    })
  })

  describe('T-U-02: instanceof 체인 및 name 필드', () => {
    it('instanceof Error === true', () => {
      const err = new ProviderError(ErrorCode.UNAUTHORIZED, 'unauthorized')
      expect(err instanceof Error).toBe(true)
    })

    it('instanceof ProviderError === true', () => {
      const err = new ProviderError(ErrorCode.UNAUTHORIZED, 'unauthorized')
      expect(err instanceof ProviderError).toBe(true)
    })

    it("name === 'ProviderError'", () => {
      const err = new ProviderError(ErrorCode.DISCONNECTED, 'disconnected')
      expect(err.name).toBe('ProviderError')
    })
  })
})
