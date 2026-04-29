/**
 * v2 에러 코드 enum
 *
 * JSON-RPC 2.0 표준 (-32700 ~ -32603) + EIP-1193 표준 (4xxx) + D'CENT 디바이스 전용 (5xxx)
 * 총 15개 코드를 정확한 값으로 export한다.
 */
export enum ErrorCode {
  // JSON-RPC 2.0 표준 (-32700 ~ -32603)
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,

  // EIP-1193 표준 (4xxx)
  USER_REJECTED = 4001,
  UNAUTHORIZED = 4100,
  UNSUPPORTED_METHOD = 4200,
  DISCONNECTED = 4900,
  CHAIN_DISCONNECTED = 4901,

  // D'CENT 디바이스 전용 (5xxx) — EIP-1193 4xxx / JSON-RPC -32xxx와 충돌 없음
  DEVICE_NOT_CONNECTED = 5001,
  DEVICE_LOCKED = 5002,
  // DEVICE_TIMEOUT(5003)은 하드웨어(디바이스) 응답 timeout, TIMEOUT(5006)은 transport layer
  // (브라우저 popup-postMessage) timeout — 의미상 별도
  DEVICE_TIMEOUT = 5003,
  DEVICE_USER_CANCELLED = 5004,
  DEVICE_FW_INCOMPATIBLE = 5005,
  TIMEOUT = 5006,
}
