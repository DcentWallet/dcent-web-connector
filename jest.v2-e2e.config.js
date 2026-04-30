/**
 * Jest 설정 — v2 e2e 전용 (jest-puppeteer preset 미사용)
 *
 * 각 spec이 직접 puppeteer.launch()로 browser/page를 제어 (v1 1_bridge_test 패턴과 일관).
 * globalSetup이 harness server (:9091) + sdk static server (:5174)를 launch.
 * --runInBand 직렬 실행으로 port 충돌 방지.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/2_v2_e2e/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  globalSetup: './tests/unit/2_v2_e2e/globalSetup.js',
  globalTeardown: './tests/unit/2_v2_e2e/globalTeardown.js',
  testTimeout: 60000,
  collectCoverage: false,
}
