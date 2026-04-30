/**
 * Jest 설정 — v2 TypeScript 테스트 전용
 * babel-jest + @babel/preset-typescript로 트랜스파일 (기존 babel 7 환경 일관)
 */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/unit/v2/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  coverageDirectory: 'tests/coverage-v2',
  collectCoverage: false,
}
