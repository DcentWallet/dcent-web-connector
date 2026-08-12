/**
 * sign-one-round-trip.spec.ts — m09-04-07 sign 한바퀴 통합 e2e
 *
 * sign chain의 마지막 검증:
 *   m09-04-01 (connector 새 schema) →
 *   m09-03-05 (sdk Layer 4 inject) →
 *   m09-04-05 (connector payload validation) →
 *   m09-04-06 (docs) →
 *   ★ m09-04-07 (본 spec — 통합 e2e)
 *
 * 범위 (objective 4-1 + Pre-Plan 4-2 scope 조정):
 *
 * 본 spec은 **Pre-popup connector facade boundary**를 검증한다.
 * Real 디센트 디바이스 또는 mock-sdk popup 인프라가 부재한 CI 환경에서는
 * 실 sdk popup으로의 round-trip이 디바이스 응답 대기로 hang된다 (30s timeout).
 * 따라서 본 spec은 다음만 자동 검증:
 *   - App이 `dcent.sign({method, chainId, payload})`를 호출했을 때 connector facade가
 *     수행하는 input validation / sanitize / chain-passthrough 동작
 *   - m09-04-05 _validateSignPayload contract 회귀 가드
 *   - m09-04-01 NEW schema {method, chainId, payload} entry point 동작 확인
 *   - chain-isolation 룰 (connector가 chain-specific 분기 없음) 회귀 가드
 *   - m09-03-05 sdk helper SYNC drift 검사 (fixture와 sdk 양쪽 grep)
 *
 * Full envelope round-trip + Layer 4 silent override + 실 디바이스 sign 성공은
 * **manual UAT 영역** (objective DoD §9 마지막 항목). 실 디센트 디바이스 +
 * v2bridge.dcentwallet.com + connector v2 + App(playground)에서 사용자가 수행.
 *
 * SYNC: m09-03-05 _assertValidAccount / _assertWmRegistrable / _injectDappParamsAddress
 *
 * 전제조건:
 *   - globalSetup이 harness server (:9091) + sdk static server (:5174) 구동 중
 *   - connector v2 번들 build 산출물 (dist/v2/dcent-web-connector.min.js)
 */
import { SDK_INVARIANT_HELPER_NAMES } from './fixtures/mock-sdk-helpers'

const { launchBrowser } = require('./launchBrowser')

const HARNESS_BASE = 'http://localhost:9091'
const HARNESS_URL = `${HARNESS_BASE}/tests/unit/2_v2_e2e/harness.html`

const VALID_KEY_PATH = "m/44'/60'/0'/0/0"
const SAMPLE_MESSAGE = '0x48656c6c6f' // "Hello" hex

describe('[v2 e2e] m09-04-07 sign one-round-trip — connector facade boundary', () => {
  let browser: any
  let page: any

  beforeAll(async () => {
    browser = await launchBrowser()
    page = await browser.newPage()
    await page.goto(HARNESS_URL)
  })

  afterAll(async () => {
    await browser.close()
  })

  // ──────────────────────────────────────────────────────────────────────────
  // T-E2E-OTRT-04 / 05 / 08 + EXTRA — Pre-popup connector validation
  // m09-04-05 _validateSignPayload contract 회귀 가드
  // ──────────────────────────────────────────────────────────────────────────

  it('T-E2E-OTRT-04: payload.keyPath 누락 → connector helpful error throw', async () => {
    const result = await page.evaluate(() => {
      const dcent = (window as any).dcent
      return dcent
        .sign({
          method: 'signMessage',
          chainId: 'eip155:1',
          payload: { message: '0xdeadbeef' }, // keyPath 누락
        })
        .then(() => ({ ok: true }))
        .catch((err: any) => ({
          ok: false,
          code: err?.code,
          message: err?.message,
          name: err?.name,
        }))
    })

    expect(result.ok).toBe(false)
    // m09-04-05 _validateSignPayload → ProviderError(INVALID_PARAMS = -32602)
    expect(result.code).toBe(-32602)
    expect(result.message).toMatch(/keyPath/i)
    // helpful error: chainId echo + example 포함 (m09-04-05 메시지 contract)
    expect(result.message).toContain('eip155:1')
  }, 15000)

  it('T-E2E-OTRT-05: payload prototype 오염 → connector 차단 throw', async () => {
    const result = await page.evaluate(() => {
      const dcent = (window as any).dcent
      // own-property __proto__ 강제 주입 — Object.defineProperty로 hasOwnProperty 통과
      const payload: any = { keyPath: "m/44'/60'/0'/0/0", message: '0xdeadbeef' }
      Object.defineProperty(payload, '__proto__', {
        value: { polluted: true },
        enumerable: true,
        configurable: true,
        writable: true,
      })
      return dcent
        .sign({
          method: 'signMessage',
          chainId: 'eip155:1',
          payload,
        })
        .then(() => ({ ok: true }))
        .catch((err: any) => ({
          ok: false,
          code: err?.code,
          message: err?.message,
          name: err?.name,
        }))
    })

    expect(result.ok).toBe(false)
    expect(result.code).toBe(-32602)
    expect(result.message).toMatch(/prototype/i)
  }, 15000)

  it('T-E2E-OTRT-VAL-NULL: payload가 null이면 -32602', async () => {
    const result = await page.evaluate(() => {
      const dcent = (window as any).dcent
      return dcent
        .sign({
          method: 'signMessage',
          chainId: 'eip155:1',
          payload: null,
        })
        .then(() => ({ ok: true }))
        .catch((err: any) => ({ ok: false, code: err?.code, message: err?.message }))
    })

    expect(result.ok).toBe(false)
    expect(result.code).toBe(-32602)
  }, 15000)

  it('T-E2E-OTRT-VAL-EMPTY-KEYPATH: payload.keyPath가 빈 문자열이면 -32602', async () => {
    const result = await page.evaluate(() => {
      const dcent = (window as any).dcent
      return dcent
        .sign({
          method: 'signMessage',
          chainId: 'eip155:1',
          payload: { keyPath: '', message: '0xdeadbeef' },
        })
        .then(() => ({ ok: true }))
        .catch((err: any) => ({ ok: false, code: err?.code, message: err?.message }))
    })

    expect(result.ok).toBe(false)
    expect(result.code).toBe(-32602)
    expect(result.message).toMatch(/empty/i)
  }, 15000)

  // ──────────────────────────────────────────────────────────────────────────
  // T-E2E-OTRT-08 — method passthrough (chain-isolation 회귀 가드)
  // connector가 method enum / dispatch 없이 transparent하게 forward하는지 검증
  // ──────────────────────────────────────────────────────────────────────────

  it('T-E2E-OTRT-08: 잘못된 method 명도 sanitize 통과 (passthrough — chain-isolation)', async () => {
    // connector는 method를 sanitize(char whitelist)만 하고 enum whitelist는 두지 않음.
    // 비정상 method가 sanitize 단계에서 즉시 -32602로 reject되지 않아야 한다.
    // (실제 -32601 응답은 wm 측 — 본 spec은 connector boundary만 검증)
    const result = await page.evaluate(() => {
      const dcent = (window as any).dcent
      const promise = dcent.sign({
        method: 'totallyNotARealMethod',
        chainId: 'eip155:1',
        payload: { keyPath: "m/44'/60'/0'/0/0" },
      })
      // popup 도달 전 connector 동기 단계만 200ms로 race
      return Promise.race([
        promise.then(() => ({ phase: 'resolved' })),
        promise.catch((err: any) => ({ phase: 'rejected', code: err?.code, message: err?.message })),
        new Promise((resolve) =>
          setTimeout(() => resolve({ phase: 'pending' }), 200),
        ),
      ])
    })

    // 가능한 결과:
    //   1. 'pending' — popup 단계까지 진행 (connector는 method를 통과시킴) → PASS
    //   2. 'rejected' with code != -32602 — popup/transport error → PASS
    //   3. 'rejected' with code == -32602 → connector가 method를 validation함 → 회귀 FAIL
    if ((result as any).phase === 'rejected') {
      // -32602 (invalid params)가 즉시 나오면 connector가 method를 validation한 것 — 회귀
      expect((result as any).code).not.toBe(-32602)
    } else {
      expect(['pending', 'resolved']).toContain((result as any).phase)
    }
  }, 15000)

  // ──────────────────────────────────────────────────────────────────────────
  // T-E2E-OTRT-07 — Solana chainId passthrough (chain-isolation 회귀 가드)
  // ──────────────────────────────────────────────────────────────────────────

  it('T-E2E-OTRT-07: Solana chainId passthrough — connector chain-agnostic 회귀 가드', async () => {
    // connector는 chain enum / dispatch가 없어야 함 (connector-chain-addition-isolation 룰).
    // Solana chainId가 connector sanitize에서 즉시 reject되지 않아야 한다.
    const result = await page.evaluate(() => {
      const dcent = (window as any).dcent
      const promise = dcent.sign({
        method: 'signTransaction',
        chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        payload: { keyPath: "m/44'/501'/0'/0'", transaction: { serialized: '0xdeadbeef' } },
      })
      return Promise.race([
        promise.then(() => ({ phase: 'resolved' })),
        promise.catch((err: any) => ({ phase: 'rejected', code: err?.code, message: err?.message })),
        new Promise((resolve) =>
          setTimeout(() => resolve({ phase: 'pending' }), 200),
        ),
      ])
    })

    // connector가 chain-specific dispatch로 reject하지 않아야 함
    if ((result as any).phase === 'rejected') {
      // chain whitelist enum이 있어서 reject되면 -32602 + 'chain' 메시지 — 회귀 FAIL
      if ((result as any).code === -32602 && /chain.*not.*supported|unknown.*chain|chain.*invalid/i.test((result as any).message || '')) {
        throw new Error(
          `connector가 chain-specific reject — chain-isolation 룰 회귀: ${(result as any).message}`,
        )
      }
    }
  }, 15000)

  // ──────────────────────────────────────────────────────────────────────────
  // T-E2E-OTRT-01 / 02 / 03 / 06 — Manual UAT 영역
  // ──────────────────────────────────────────────────────────────────────────
  //
  // 다음 시나리오는 real 디센트 디바이스 또는 mock-sdk popup 인프라가 필요하며
  // 본 PR 범위 밖이다. objective 비스코프 (4-1) + DoD §9 마지막 항목 (manual UAT) 참조.
  //
  //   T-E2E-OTRT-01: v1 path-only (address 없음) round-trip success
  //   T-E2E-OTRT-02: WC 표준 (address 일치) round-trip success
  //   T-E2E-OTRT-03: WC 표준 (address mismatch) → Layer 4 silent override
  //   T-E2E-OTRT-06: signTransaction (from 누락) → sdk Layer 4 inject
  //
  // 사용자 manual UAT (objective DoD §9):
  //   실 디센트 디바이스 + v2bridge.dcentwallet.com + connector v2 + App(playground)에서
  //   sign 한바퀴 (v1 path-only 패턴 + WC 표준 모두) 성공 — m09-03-03 UAT 회귀 종료 확인

  it.todo('T-E2E-OTRT-01: v1 path-only round-trip success — manual UAT 영역')
  it.todo('T-E2E-OTRT-02: WC 표준 (address 일치) round-trip — manual UAT 영역')
  it.todo('T-E2E-OTRT-03: WC 표준 (mismatch) Layer 4 silent override — manual UAT 영역')
  it.todo('T-E2E-OTRT-06: signTransaction Layer 4 from inject — manual UAT 영역')

  // ──────────────────────────────────────────────────────────────────────────
  // T-SYNC-01 (in-process): mock fixture SYNC drift assertion
  // 자동 검증 명령(grep)이 sdk 측 + fixture 양쪽 helper name 보존 확인
  // ──────────────────────────────────────────────────────────────────────────

  it('T-SYNC-01 (in-process): mock fixture가 m09-03-05 3개 helper name 모두 보유', () => {
    expect(SDK_INVARIANT_HELPER_NAMES).toContain('_assertValidAccount')
    expect(SDK_INVARIANT_HELPER_NAMES).toContain('_assertWmRegistrable')
    expect(SDK_INVARIANT_HELPER_NAMES).toContain('_injectDappParamsAddress')
    expect(SDK_INVARIANT_HELPER_NAMES.length).toBe(3)
  })
})
