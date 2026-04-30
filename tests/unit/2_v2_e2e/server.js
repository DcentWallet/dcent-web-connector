/**
 * v2 e2e 정적 server — 두 정적 server를 한 process에서 launch
 * - harness server (port 9091): connector tests/dist/v2 serve. dApp 가짜 페이지 호스팅.
 * - sdk static server (port 5174): main-repos/dcent-web-sdk/dist/ serve. m02-03 vite build 산출물.
 *   sdk SPA fallback 처리(unmatched route → /index.html).
 *
 * dev mode HMR 의존을 제거하여 autopilot/CI 무인 실행 가능.
 * jest.v2-e2e.config.js의 globalSetup이 두 server를 launch.
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const CONNECTOR_ROOT = path.resolve(__dirname, '../../..')
const SDK_DIST_ROOT = path.resolve(CONNECTOR_ROOT, '../dcent-web-sdk/dist')

const HARNESS_PORT = process.env.E2E_HARNESS_PORT || 9091
const SDK_PORT = process.env.E2E_SDK_PORT || 5174

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function makeStaticServer (rootDir, defaultPath, isSpa) {
  return http.createServer((req, res) => {
    const reqUrl = req.url.split('?')[0]
    const urlPath = reqUrl === '/' ? defaultPath : reqUrl
    const filePath = path.join(rootDir, urlPath)

    // path traversal 방어 — 정규화 후 root 외부 접근 차단
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(path.resolve(rootDir))) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    fs.readFile(resolved, (err, data) => {
      if (err) {
        if (isSpa) {
          // SPA fallback — unmatched route → /index.html
          fs.readFile(path.join(rootDir, '/index.html'), (e2, d2) => {
            if (e2) {
              res.writeHead(404)
              res.end('Not found: ' + urlPath)
              return
            }
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(d2)
          })
        } else {
          res.writeHead(404)
          res.end('Not found: ' + urlPath)
        }
        return
      }
      const ext = path.extname(resolved)
      const mime = MIME[ext] || 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': mime })
      res.end(data)
    })
  })
}

const harnessServer = makeStaticServer(CONNECTOR_ROOT, '/tests/unit/2_v2_e2e/harness.html', false)
const sdkServer = makeStaticServer(SDK_DIST_ROOT, '/index.html', true)

// 단독 실행 디버깅 — node tests/unit/2_v2_e2e/server.js
if (require.main === module) {
  harnessServer.listen(HARNESS_PORT, () => {
    console.log(`harness server: http://localhost:${HARNESS_PORT}/`)
  })
  sdkServer.listen(SDK_PORT, () => {
    console.log(`sdk server: http://localhost:${SDK_PORT}/`)
  })
}

module.exports = {
  harnessServer,
  sdkServer,
  HARNESS_PORT,
  SDK_PORT,
  CONNECTOR_ROOT,
  SDK_DIST_ROOT,
}
