# v2 popup transport round-trip e2e

connector(`dist/v2`) ↔ sdk(로컬 build dist) 양측 통합을 puppeteer e2e로 자동 검증.
m02-01/02/03 SHIPPED 후 cycle 02 통신 프로토콜 round-trip을 회귀 보호.

## 자동 실행 흐름 (autopilot/CI)

`globalSetup`이 두 정적 server를 직접 launch하므로 사용자가 별도 터미널에서 dev server를 띄울 필요 없음.

```bash
# 1. sdk vite build 산출물 사전 생성 (workflow yaml에서 자동 실행)
cd main-repos/dcent-web-sdk
npm install --legacy-peer-deps --ignore-scripts
npm run build
# → main-repos/dcent-web-sdk/dist/index.html 생성

# 2. connector dist/v2 사전 생성
cd ../dcent-web-connector
yarn install --frozen-lockfile
yarn build
# → dist/v2/dcent-web-connector.min.js 생성

# 3. e2e suite 실행 (globalSetup이 두 server launch + chromium headless)
yarn unit-v2-e2e
# → 8/8 spec PASS 기대
```

## CI workflow

`.github/workflows/e2e.yml` — `workflow_dispatch` (manual trigger) + `self-hosted` runner.
PR마다 자동 실행은 cycle 03+에서 검토 (현재는 manual trigger).

GitHub Actions UI에서 "v2 e2e" workflow → "Run workflow" 클릭하여 실행.

## dev mode 디버깅 옵션

flaky 재현 또는 시각 디버그 시 sdk dev server를 따로 띄우는 옵션:

```bash
# 터미널 A
cd main-repos/dcent-web-sdk && npm run dev   # port 5173 (HMR 활성)

# 터미널 B — globalSetup이 :5174로 launch한 정적 server를 무시하려면 spec의 popUpUrl 변경 필요
# 일반 디버그는 yarn unit-v2-e2e의 headless: false로 변경하는 것이 더 빠름:
#   spec 파일에서 puppeteer.launch({headless: false}) 로 수정 후 실행
```

## 시나리오 매핑

| Spec | T-E-XX | 검증 내용 |
|---|---|---|
| `01_handshake.spec.ts` | T-E-01 | handshake 자동 발동 + sdk ack + echo round-trip |
| `02_version_mismatch.spec.ts` | T-E-02 | 버전 mismatch → ErrorCode 5007 (PROTOCOL_VERSION_MISMATCH) |
| `03_concurrent_send.spec.ts` | T-E-03 | 동시 3 send → handshake 1회만 (postMessage spy 카운트) |
| `04_popup_close.spec.ts` | T-E-04 | popup 강제 close → ErrorCode 4900 (DISCONNECTED) |
| `05_setTimeoutMs.spec.ts` | T-E-05 | setTimeoutMs(2000) + empty.html → 5006 (TIMEOUT) |
| `06_origin_validation.spec.ts` | T-E-06 | 잘못된 origin → sdk silent drop → 5006 |
| `07_envelope_shape.spec.ts` | T-E-07 | sdk popup에서 raw invalid postMessage inject → connector silent drop |
| `08_handshake_timeout.spec.ts` | T-E-08 | empty.html (listener 없음) → 5006 |

## 사전 조건 검증

`globalSetup.js`가 다음을 자동 검증:
- `main-repos/dcent-web-sdk/dist/index.html` 존재 → 부재 시 명확한 에러로 fail
- harness server (:9091) + sdk server (:5174) listen 성공

`.github/workflows/e2e.yml` 첫 step (`chromium sanity check`)이 self-hosted runner의 chromium 가용성 검증 (T-E-SETUP-02).

## 비스코프

- 단위 테스트와 중복되는 케이스 전수 cover (m02-01/02/03 jsdom mock 검증분 sample 1-2건만)
- sdk 측 변경 — sdk는 read-only consumer (m02-03 SHIPPED 결과 그대로)
- e2e retry 정책 — flakiness 발생 시 cycle 03+에서 도입
- Playwright 마이그레이션 — jest-puppeteer flakiness 봐서 cycle 03+ 결정
- production sdk(`https://bridge.dcentwallet.com/v2`) 대상 e2e — cycle 08 prod 배포 후
