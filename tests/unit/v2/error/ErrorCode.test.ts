/**
 * T-U-03, T-U-04, T-U-05: ErrorCode enum 값 검증
 *
 * JSON-RPC 2.0 표준 5개 + EIP-1193 표준 5개 + D'CENT 디바이스 5개 = 총 15개
 */
import { ErrorCode } from '../../../../src/error/ErrorCode'

describe('ErrorCode', () => {
  describe('JSON-RPC 2.0 표준 코드 (T-U-03)', () => {
    it('PARSE_ERROR === -32700', () => {
      expect(ErrorCode.PARSE_ERROR).toBe(-32700)
    })

    it('INVALID_REQUEST === -32600', () => {
      expect(ErrorCode.INVALID_REQUEST).toBe(-32600)
    })

    it('METHOD_NOT_FOUND === -32601', () => {
      expect(ErrorCode.METHOD_NOT_FOUND).toBe(-32601)
    })

    it('INVALID_PARAMS === -32602', () => {
      expect(ErrorCode.INVALID_PARAMS).toBe(-32602)
    })

    it('INTERNAL_ERROR === -32603', () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe(-32603)
    })
  })

  describe('EIP-1193 표준 코드 (T-U-04)', () => {
    it('USER_REJECTED === 4001', () => {
      expect(ErrorCode.USER_REJECTED).toBe(4001)
    })

    it('UNAUTHORIZED === 4100', () => {
      expect(ErrorCode.UNAUTHORIZED).toBe(4100)
    })

    it('UNSUPPORTED_METHOD === 4200', () => {
      expect(ErrorCode.UNSUPPORTED_METHOD).toBe(4200)
    })

    it('DISCONNECTED === 4900', () => {
      expect(ErrorCode.DISCONNECTED).toBe(4900)
    })

    it('CHAIN_DISCONNECTED === 4901', () => {
      expect(ErrorCode.CHAIN_DISCONNECTED).toBe(4901)
    })
  })

  describe("D'CENT 디바이스 전용 코드 (T-U-05)", () => {
    it('DEVICE_NOT_CONNECTED === 5001', () => {
      expect(ErrorCode.DEVICE_NOT_CONNECTED).toBe(5001)
    })

    it('DEVICE_LOCKED === 5002', () => {
      expect(ErrorCode.DEVICE_LOCKED).toBe(5002)
    })

    it('DEVICE_TIMEOUT === 5003', () => {
      expect(ErrorCode.DEVICE_TIMEOUT).toBe(5003)
    })

    it('DEVICE_USER_CANCELLED === 5004', () => {
      expect(ErrorCode.DEVICE_USER_CANCELLED).toBe(5004)
    })

    it('DEVICE_FW_INCOMPATIBLE === 5005', () => {
      expect(ErrorCode.DEVICE_FW_INCOMPATIBLE).toBe(5005)
    })
  })

  describe('Transport layer (T-U-16)', () => {
    // m02-01에서 추가 — DEVICE_TIMEOUT(5003)은 하드웨어 timeout,
    // TIMEOUT(5006)은 popup-postMessage transport layer timeout
    it('TIMEOUT === 5006', () => {
      expect(ErrorCode.TIMEOUT).toBe(5006)
    })
  })
})
