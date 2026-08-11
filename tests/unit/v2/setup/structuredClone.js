/**
 * jsdom 테스트 환경에 `structuredClone`을 공급한다.
 *
 * 이 프로젝트가 쓰는 jest-environment-jsdom은 `structuredClone`을 노출하지 않는데,
 * connector v2의 타깃 환경(WebHID/WebBluetooth를 지원하는 브라우저 = Chrome 98+ / Safari 15.4+)은
 * 전부 네이티브로 제공한다. 폴리필 없이 두면 `structuredClone`에 의존하는 코드가 catch로
 * 흘러 **가드가 꺼진 채 테스트만 초록**이 된다 (실측: sign()의 요청 스냅샷이 이 경로로
 * 무력화되어 T-MUT-REQ-01/02가 처음부터 실패했다).
 *
 * 구현은 V8 구조화 복제 직렬화를 그대로 쓴다 — 브라우저의 structured clone algorithm과
 * 동일하게 Date/Map/Set은 보존하고 함수 등 비-cloneable 값은 throw한다.
 * (JSON 라운드트립으로 대체하면 Date가 문자열로 바뀌어 "전송값 ≠ 의도값"을 검증해야 할
 *  테스트가 오히려 그 결함을 흉내내게 된다.)
 */

// `node:` prefix는 이 jest 런타임의 모듈 resolver가 처리하지 못한다 (ENOENT) — bare specifier 사용.
const v8 = require('v8')

// `globalThis`(ES2020)는 .eslintrc의 ecmaVersion 2017에서 미정의로 잡히므로,
// env.node가 이미 선언하는 `global`을 쓴다 (jest 환경의 전역 객체와 동일 대상).
if (typeof global.structuredClone !== 'function') {
  global.structuredClone = function structuredClone (value) {
    return v8.deserialize(v8.serialize(value))
  }
}
