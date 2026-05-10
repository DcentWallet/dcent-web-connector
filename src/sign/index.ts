/**
 * v2 sign — barrel export (m08-01-02)
 *
 * sign 디렉토리의 public surface를 한 곳에서 export.
 * src/index.ts (v2 facade entry)가 본 모듈을 import하여 dApp에 노출한다.
 */

// public API
export { sign } from './sign'
export type { SignInput } from './sign'

// V1 호환 응답 타입
export type { V1Response, V1ResponseHeader, V1ResponseBody } from './types'

// internal helpers — sibling module(m08-01-03/04)이 사용. 이름 prefix `_`로 표기.
export { _call } from './call'
export type { CallInput } from './call'
export { _genId } from './idGen'
export { _sanitizeChain } from './sanitize'
export { _assertV1Success } from './assert'
export { providerErrorToV1 } from './error'
export { chainToMethod, PREFIX_TO_METHOD } from './chainToMethod'
