/**
 * v2 e2e — puppeteer.launch 공통 헬퍼
 *
 * env var로 시각 디버그 / slowMo 토글:
 *   E2E_HEADLESS=false  → 실제 Chrome 창 띄움 (popup 동작 시각 확인)
 *   E2E_DEVTOOLS=true   → 자동으로 devtools 열기
 *   E2E_SLOWMO=200      → 매 puppeteer 명령 사이 200ms delay (시각 디버그 가독성)
 *
 * 예시:
 *   yarn unit-v2-e2e                                              # 기본 — headless: 'new'
 *   E2E_HEADLESS=false yarn unit-v2-e2e --testPathPattern=01_     # 한 spec만 시각 디버그
 *   E2E_HEADLESS=false E2E_SLOWMO=200 yarn unit-v2-e2e            # 전체 슬로우 모션
 *   E2E_HEADLESS=false E2E_DEVTOOLS=true yarn unit-v2-e2e         # devtools 자동 오픈
 */
const puppeteer = require('puppeteer')

const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-popup-blocking']

function launchBrowser () {
  const headless = process.env.E2E_HEADLESS === 'false' ? false : 'new'
  const devtools = process.env.E2E_DEVTOOLS === 'true'
  const slowMo = process.env.E2E_SLOWMO ? Number(process.env.E2E_SLOWMO) : 0

  return puppeteer.launch({
    headless,
    devtools,
    slowMo,
    args: LAUNCH_ARGS,
  })
}

module.exports = { launchBrowser, LAUNCH_ARGS }
