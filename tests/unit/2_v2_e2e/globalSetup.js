/**
 * Jest globalSetup — v2 e2e
 *
 * 1. sdk vite build 산출물(`main-repos/dcent-web-sdk/dist/index.html`) 사전 fs 검증
 *    - 부재 시 명확한 에러로 fail (autopilot/CI는 e2e step 직전에 sdk build 자동 실행)
 * 2. harness server (:9091) + sdk static server (:5174) launch
 * 3. global에 server 핸들 보관 (globalTeardown이 close)
 */
const fs = require('fs')
const path = require('path')
const { harnessServer, sdkServer, HARNESS_PORT, SDK_PORT, SDK_DIST_ROOT } = require('./server')

module.exports = async () => {
  const sdkIndex = path.join(SDK_DIST_ROOT, 'index.html')
  if (!fs.existsSync(sdkIndex)) {
    throw new Error(
      `sdk build output not found at ${sdkIndex} — ` +
      `run \`cd main-repos/dcent-web-sdk && npm install --legacy-peer-deps --ignore-scripts && npm run build\` first. ` +
      `(autopilot/CI workflow는 e2e step 직전에 sdk build 자동 실행)`
    )
  }

  await new Promise((resolve, reject) => {
    harnessServer.once('error', reject)
    harnessServer.listen(HARNESS_PORT, resolve)
  })
  await new Promise((resolve, reject) => {
    sdkServer.once('error', reject)
    sdkServer.listen(SDK_PORT, resolve)
  })

  global.__HARNESS_SERVER__ = harnessServer
  global.__SDK_SERVER__ = sdkServer

  console.log(`[v2-e2e] harness: http://localhost:${HARNESS_PORT}/  sdk: http://localhost:${SDK_PORT}/`)
}
