/**
 * Jest 설정 — v2 TypeScript 테스트 전용
 * babel-jest + @babel/preset-typescript로 트랜스파일 (기존 babel 7 환경 일관)
 */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/unit/v2/**/*.test.ts'],
  // jsdom이 노출하지 않는 브라우저 전역을 공급 — 없으면 그 API에 의존하는 가드가
  // catch로 흘러 꺼진 채 테스트만 초록이 된다 (tests/unit/v2/setup/structuredClone.js 주석 참조).
  setupFiles: ['<rootDir>/tests/unit/v2/setup/structuredClone.js'],
  transform: {
    '^.+\\.tsx?$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  coverageDirectory: 'tests/coverage-v2',
  collectCoverage: false,
}
