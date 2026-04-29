// v2 public API entry point (cycle 01 — skeleton 단계)
// cycle 02: 실제 메시지 송수신 + 핸드셰이크 구현 예정
export type {
  MessageEnvelope,
  ResponseEnvelope,
  MessageTransport,
  TransportState,
} from './transport/MessageTransport'
export { PopupTransport } from './transport/PopupTransport'

export type { RequestQueue } from './queue/RequestQueue'
export { SerialRequestQueue } from './queue/RequestQueue'

export { ErrorCode } from './error/ErrorCode'
export { ProviderError } from './error/ProviderError'
