/**
 * T-U-10, T-U-11: PopupTransport stub contract 검증
 *
 * error-handling-consistency 룰:
 *   - send → Promise.reject(ProviderError(METHOD_NOT_FOUND))
 *   - on/off → no-op (throw 없음)
 *   - close → Promise.resolve()
 */
import { PopupTransport } from '../../../../src/transport/PopupTransport'
import { ProviderError } from '../../../../src/error/ProviderError'
import { ErrorCode } from '../../../../src/error/ErrorCode'
import type { MessageEnvelope } from '../../../../src/transport/MessageTransport'

describe('PopupTransport (stub contract)', () => {
  let transport: PopupTransport

  beforeEach(() => {
    transport = new PopupTransport()
  })

  describe('T-U-10: send — Promise.reject(ProviderError(METHOD_NOT_FOUND))', () => {
    it('send()가 ProviderError로 reject된다', async () => {
      const envelope: MessageEnvelope = { id: 'test-id', method: 'connect' }
      await expect(transport.send(envelope)).rejects.toBeInstanceOf(ProviderError)
    })

    it('reject된 에러의 code가 METHOD_NOT_FOUND이다', async () => {
      const envelope: MessageEnvelope = { id: 'test-id', method: 'connect' }
      try {
        await transport.send(envelope)
        // reject되어야 하므로 여기까지 오면 실패
        expect(true).toBe(false)
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderError)
        expect((err as ProviderError).code).toBe(ErrorCode.METHOD_NOT_FOUND)
      }
    })
  })

  describe('T-U-11: on / off / close — no-op 또는 즉시 resolve', () => {
    it('on()이 에러 없이 실행된다 (no-op)', () => {
      const handler = (_state: 'connected' | 'disconnected') => {}
      expect(() => transport.on('state', handler)).not.toThrow()
    })

    it('off()가 에러 없이 실행된다 (no-op)', () => {
      const handler = (_state: 'connected' | 'disconnected') => {}
      expect(() => transport.off('state', handler)).not.toThrow()
    })

    it('close()가 Promise.resolve()를 반환한다', async () => {
      await expect(transport.close()).resolves.toBeUndefined()
    })
  })
})
