import { MessageTransport, MessageEnvelope, ResponseEnvelope, TransportState } from './MessageTransport'
import { ProviderError } from '../error/ProviderError'
import { ErrorCode } from '../error/ErrorCode'

/**
 * PopupTransport — MessageTransport 첫 구현 (skeleton stub)
 *
 * cycle 02에서 실제 구현:
 *   - window.open으로 sdk popup 열기
 *   - postMessage로 MessageEnvelope 송신
 *   - addEventListener('message')로 ResponseEnvelope 수신
 *   - id 기반 요청-응답 매칭
 *
 * error-handling-consistency 룰: 모든 stub 메서드는 throw 패턴
 *   - send → Promise.reject(ProviderError(METHOD_NOT_FOUND))
 *   - on/off → no-op (void, throw 없음)
 *   - close → Promise.resolve()
 */
export class PopupTransport implements MessageTransport {
  send<TParams, TResult>(
    _message: MessageEnvelope<TParams>
  ): Promise<ResponseEnvelope<TResult>> {
    // stub — cycle 02에서 실제 postMessage 송신으로 교체
    return Promise.reject(
      new ProviderError(
        ErrorCode.METHOD_NOT_FOUND,
        'PopupTransport.send not implemented yet (cycle 02)'
      )
    )
  }

  on(_event: 'state', _handler: (state: TransportState) => void): void {
    // stub — no-op. cycle 02에서 이벤트 리스너 등록으로 교체
  }

  off(_event: 'state', _handler: (state: TransportState) => void): void {
    // stub — no-op. cycle 02에서 이벤트 리스너 해제로 교체
  }

  close(): Promise<void> {
    // stub — 즉시 resolve. cycle 02에서 popup 닫기 + cleanup으로 교체
    return Promise.resolve()
  }
}
