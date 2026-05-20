# dcent-web-connector v0.16.0 → v2 Facade 마이그레이션 가이드

`dcent-web-connector` v2 facade는 dApp이 v0.16.0에서 사용하던 모든 API를 **무수정으로 호환**하면서, 새로운 통합 sign API와 더 명확한 타입 시스템을 제공한다.

본 가이드는 v0.16.0 사용자가 v2로 옮길 때 알아야 할 사항을 정리한다.

---

## 변경 없음 (Backward Compatible)

기존 dApp 코드는 **무수정으로 동작**한다.

- 진입점은 동일: `import dcent from 'dcent-web-connector'` 또는 `const dcent = require('dcent-web-connector')`
- v1 sign wrapper 함수 시그니처 1:1 호환:
  - EVM: `getEthereumSignedTransaction`, `getEthereumSignedMessage`, `getTokenSignedTransaction`, `getKlaytnSignedTransaction`
  - Bitcoin / XRP / Hedera / Stellar / Tron: `getBitcoinSignedTransaction`, `getXrpSignedTransaction`, `getHederaSignedTransaction`, `getHederaSignedMessage`, `getStellarSignedTransaction`, `getTronSignedTransaction`
  - 기타 generic: `getSignedMessage`, `getSignedData`
  - Complex chains: `getTrcTokenSignedTransaction`, `getTezosSignedTransaction`, `getVechainSignedTransaction`, `getNearSignedTransaction`, `getHavahSignedTransaction`, `getPolkadotSignedTransaction`, `getCosmosSignedTransaction`, `getAlgorandSignedTransaction`, `getParachainSignedTransaction`
- v1 read-only / configure / Bitcoin tx-builder 모두 동일 시그니처:
  - `info`, `getDeviceInfo`, `getAccountInfo`, `getAddress`, `getXPUB`, `setLabel`, `syncAccount`, `selectAddress`
  - `getBitcoinTransactionObject`, `addBitcoinTransactionInput`, `addBitcoinTransactionOutput`
  - `isAvaliableCoinType`, `isCzoneCoinType`, `isParachainCoinType`, `isBitcoinTxCoinType`, `isTokenType`, `getCzonePrifix`, `isAvaliableLabel`, `isAvaliableCoinGroup`, `isAvailableSyncAccountCoinName`, `getCzonDecimal`
- v1 lifecycle 동일: `setTimeOutMs`, `setConnectionListener`, `popupWindowClose`
- v1 enum 동일: `coinType`, `coinGroup`, `coinName`, `bitcoinTxType`, `klaytnTxType`, `xrpTxType`, `state`, `coinDecimals`
- v1 utility 동일: `unitConverter`

```javascript
// v0.16.0 코드 — v2에서 그대로 동작
const dcent = require('dcent-web-connector')

dcent.setTimeOutMs(30000)
const info = await dcent.info()
const tx = await dcent.getEthereumSignedTransaction(
  dcent.coinType.ETHEREUM,
  '0x0', '0x77359400', '0x5208',
  '0x0000000000000000000000000000000000000000', '0x0', '0x',
  "m/44'/60'/0'/0/0", 1
)
dcent.popupWindowClose()
```

응답 형식, 에러 형식, 호출 패턴 모두 v0.16.0과 동일하다.

---

## 새 통합 sign API

v2는 모든 chain에 사용할 수 있는 **단일 통합 sign API**를 추가했다. 기존 wrapper와 병행 사용 가능하다.

```javascript
const dcent = require('dcent-web-connector')

// CAIP-19 chain 식별자 사용 (eip155:1 = Ethereum mainnet)
const signed = await dcent.sign({
  chain: 'eip155:1',
  payload: {
    chainId: 'eip155:1',
    keyPath: "m/44'/60'/0'/0/0",
    transaction: { /* tx fields */ }
  }
})

// CAIP-19 미정의 네트워크는 v1 method 문자열 fallback (chainToMethod 매핑)
const signedSui = await dcent.sign({
  chain: 'signTransaction',  // bridge sdk가 인식하는 v1 method 이름
  payload: { coinType: 'SUI', /* ... */ }
})
```

내부적으로 `dcent.sign({chain, payload})`은:
1. `chain` 인자를 sanitize (whitelist + prototype key 제거 + length/type 검증)
2. CAIP-19 prefix 매칭 (`eip155:` → `signTransaction`, `bip122:` → `signTransaction`, etc.) 또는 v1 method 문자열로 fallback
3. popup으로 송신 후 응답을 v1 호환 envelope으로 반환

---

## 신규 네트워크 추가 시나리오

새 네트워크(예: Sui)를 추가하려는 dApp은 더 이상 connector SDK에 wrapper를 추가할 필요가 없다.

1. `dcent-bridge-service`(popup UI 측)에 새 method 핸들러 추가 — connector 외부 작업
2. dApp이 `dcent.sign({ chain: 'sip-1:...', payload })` 호출 — connector는 그대로 popup으로 pass-through

기존 v1 wrapper 패턴(`getSuiSignedTransaction`)을 새로 추가할 필요가 없다. 통합 sign API가 모든 chain을 커버한다.

---

## breaking change 없음

v0.16.0 → v2 minor bump. dApp 코드는 무수정으로 동작.

| 변경 영역 | v0.16.0 | v2 |
|---|---|---|
| 진입점 | `require('dcent-web-connector')` | 동일 |
| Default export shape | dcent object (50+ methods) | 동일 + 신규 `sign` 메서드 추가 |
| Named exports | 미제공 (default object 안에서만) | 추가 — `import { coinType, getEthereumSignedTransaction } from ...` 가능 |
| TypeScript types | 미제공 | 추가 — `dist/v2/index.d.ts` |
| Sign wrapper 시그니처 | 21개 함수 동일 | 100% 호환 |
| Lifecycle / read-only / enum | 동일 | 동일 |
| postMessage popup URL | `https://bridge.dcentwallet.com/v2` | 동일 |
| 에러 응답 형식 | v1 envelope | 동일 (v2는 ProviderError를 internal에서 사용 + dApp 시야에는 v1 형식으로 매핑) |

---

## 내부 변화 (참고 — dApp 영향 없음)

v2 facade는 다음 layer로 구성:

- `src/index.ts` — 모든 named exports + default export object
- `src/lifecycle.ts` — setTimeOutMs / setConnectionListener / popupWindowClose
- `src/types/` — 8개 enum + 23개 type
- `src/sign/` — 통합 `sign` + `_call` helper + 21개 v1 wrapper + 11개 read-only/configure + 9개 v1 validator + ProviderError 매퍼
- `src/transport/PopupTransport.ts` — popup window 관리 + postMessage 통신 (m02-01 SHIPPED)
- `src/queue/RequestQueue.ts` — SerialRequestQueue (단일 inflight 보장, m02-02 SHIPPED)
- `src/error/{ErrorCode,ProviderError}.ts` — JSON-RPC 2.0 호환 에러 (m07-02 SHIPPED)
- `src/singleton.ts` — module-level lazy singleton (PopupTransport + SerialRequestQueue 자동 관리, dApp이 직접 인스턴스화할 필요 없음)

dApp은 이 내부 구조를 알 필요가 없다. v1 호환 표면(default export object)만 사용하면 된다.

---

## error 형식

v1 호환 envelope 그대로 유지:

```javascript
try {
  await dcent.getEthereumSignedTransaction(...)
} catch (err) {
  // err: { header: { status: 'failure' }, body: { error: { code, message } } }
}
```

`code` 값은 v1과 동일:

| Code | 의미 |
|---|---|
| `'pop-up_closed'` | 사용자가 popup을 닫음 |
| `'time_out'` | 디바이스 응답 타임아웃 |
| `'user_cancel'` | 사용자가 디바이스에서 거절 |
| `'param_error'` | 입력 파라미터 검증 실패 |
| `'connection_failed'` | popup ↔ device 통신 실패 |

v2 내부 에러(ProviderError, JSON-RPC 2.0 형식)는 dApp 경계에서 v1 envelope으로 자동 매핑되므로 기존 `try/catch` 코드는 무수정.

---

## 살아있는 reference — playground

리포 root의 `playground.js`(브라우저에서 `index-v2.html`로 실행)가 v1 wrapper + 통합 sign API 양쪽 사용 패턴의 살아있는 예시다. m08-01-05에서 facade default export 호출로 전환되었다.

```bash
# 빌드
npm run build

# 브라우저에서 열기
open index-v2.html
# 또는 dev server
npm run dev  # http://localhost:9090/index-v2.html
```

playground 코드는 v0.16.0 dApp이 작성하는 패턴과 동일하다 — `require('dcent-web-connector')` 대신 `<script>` 태그로 로드 후 `window.dcent.<method>()`를 호출하는 차이만 있다.

---

## 참고

- m08-01 chain의 5개 PR(facade 뼈대, 통합 sign, read-only, EVM/non-EVM wrappers, playground rewrite)에 v2 구현 상세
- v1 코드는 `src-v1/`에 read-only로 보존 — npm published 패키지의 진입점은 v2이지만 v1 소스 파일은 디버깅 reference로 남아있음

---

## Sign 흐름 — v1 vs v2 비교

dApp이 D'CENT 디바이스로 트랜잭션/메시지를 서명하는 흐름이 v1과 v2에서 어떻게 다른지 비교한다. **v0.16.0 사용자는 무수정으로 v2에서 동작**하지만, 새로 작성하는 dApp은 v2 통합 sign API를 선택할 수 있다.

### v1 흐름 (v0.16.0 master 브랜치 시점)

```
┌────────┐   1. selectAddress         ┌──────────┐
│  dApp  │ ─────────────────────────▶ │ connector│
└────────┘                            └────┬─────┘
    ▲                                      │
    │                                      │ 2. window.open(popup)
    │ 8. address (string)                  │    + postMessage selectAddress
    │                                      ▼
    │                                 ┌──────────┐
    │                                 │  popup   │ ── 3. USB selectAddress
    │                                 │ (Vue 2)  │      (devices read)
    │                                 └────┬─────┘
    │                                      │ 4. address
    │                                      │ 5. user confirm UI (needUserConfirm)
    │                                      │ 6. postMessage result
    └──────────────────────────────────────┘
    │ 9. getEthereumSignedTransaction(coinType, ..., keyPath, chainId)
    ▼                                ┌──────────┐
┌────────┐ ────────────────────────▶ │ connector│
│  dApp  │                           └────┬─────┘
└────────┘                                │ 10. popup signTransaction (chain별 wrapper)
                                          ▼
                                     ┌──────────┐
                                     │  popup   │ ── 11. USB sign
                                     │          │      (user confirm again)
                                     └──────────┘
```

**v1 핵심 특징**:

- **popup이 디바이스와 직접 통신**: wm 없음. popup이 매번 chain-specific 분기를 가짐 (`if (coinType === 'BITCOIN') ...`).
- **selectAddress → sign 2단계 명시 호출**: dApp이 먼저 `selectAddress`로 주소를 받고, 받은 주소를 들고 `getEthereumSignedTransaction`을 다시 호출. dApp 측에서 주소 관리.
- **매 호출 사용자 confirm**: `method-info.js`의 `needUserConfirm` flag에 따라 popup이 매 단계 confirm UI를 강제.
- **chain 추가 시 popup 매번 수정**: 새 chain(예: Sui) 지원 → popup `if` 분기 추가 → wrapper 추가 → connector publish 필요.
- **sign API 표면**: chain별 21개 wrapper (`getEthereumSignedTransaction`, `getBitcoinSignedTransaction`, `getXrpSignedTransaction`, ...). dApp은 자신이 다루는 chain마다 다른 함수 시그니처를 학습.

v1 reference: `src-v1/src/pages/v2/Main.vue:155, 200-292` (selectAddress → needUserConfirm 흐름), `src-v1/src/js/method-info.js:105` (method 메타데이터의 `needUserConfirm` 정의).

### v2 single wire 흐름 (현재)

```
┌────────┐   1. dcent.sign({ method, chainId, payload })   ┌──────────┐
│  dApp  │ ───────────────────────────────────────────────▶│ connector│
└────────┘                                                 │ (light   │
    ▲                                                      │ validate)│
    │                                                      └────┬─────┘
    │                                                           │ 2. PopupTransport.send
    │ 8. v1-envelope 응답 (header/body shape)                   │    + RequestQueue (single inflight)
    │                                                           ▼
    │                                                      ┌──────────┐
    │                                                      │  popup   │
    │                                                      │ (Vue/    │
    │                                                      │  React)  │
    │                                                      └────┬─────┘
    │                                                           │ 3. handleRequest(method, chainId, payload)
    │                                                           ▼
    │                                                      ┌──────────┐
    │                                                      │   sdk    │ ── 4. resolveChainId
    │                                                      │ Layer 4  │      → cryptoCurrencies registry
    │                                                      │ inject   │ ── 5. self-match ceremony
    │                                                      │          │      (sdk-side address inject)
    │                                                      └────┬─────┘
    │                                                           │ 6. wm WalletConnect* API
    │                                                           ▼
    │                                                      ┌──────────┐
    │                                                      │  wm +    │ ── 7. USB sign
    │                                                      │  family  │      (single confirm)
    │                                                      │ handler  │
    │                                                      └──────────┘
```

**v2 핵심 특징**:

- **chain-agnostic single wire**: connector는 light validation만 (keyPath 강제 / prototype 차단 / size limit / character whitelist). chain enum / 정적 매핑 부재.
- **sdk Layer 4 (sdk-side inject)**: dApp이 keyPath만 알면, sdk가 self-match ceremony로 wm 등록 가능한 account를 만든 뒤 wm으로 위양. dApp은 더 이상 address를 들고 다닐 필요 없음.
- **wm이 family별 dispatch**: chain 추가 시 wm registry + family handler만 추가. connector / sdk 수정 0건.
- **sign API 표면**: 단일 진입점 `dcent.sign({ method, chainId, payload })`. CAIP-19 chainId로 chain 식별, method로 sign 종류 구분 (`signTransaction`, `personal_sign`, `signTypedData_v4`, ...).
- **v1 호환**: v1 wrapper 21개는 그대로 동작 (내부적으로 `dcent.sign`으로 라우팅). dApp 코드 무수정.

### 차이점 표

| 영역 | v1 | v2 |
|---|---|---|
| chain 추가 시 connector 수정 | 매번 wrapper 추가 + publish | 0건 (wm + sdk 메시지 핸들러만) |
| 사용자 명시 confirm | 매 단계 강제 (`needUserConfirm`) | 점진 복원 (m09-03-06/10/11 별도 child) |
| Address 관리 | dApp이 selectAddress → sign 2단계 호출 | sdk Layer 4 self-match (dApp은 keyPath만) |
| Sign API 표면 | chain별 21개 wrapper | 단일 `dcent.sign({ method, chainId, payload })` |
| Payload 검증 | popup if 분기 | connector light validate (m09-04-05) + sdk Layer 4 (m09-03-05) |
| v1 호환성 | — | 무수정 호환 (v0.16.0 wrapper 모두 유지) |
| popup ↔ wm | popup이 USB 직접 호출 | popup이 wm WalletConnect* API 호출 |

### dApp 마이그레이션 가이드 (v1 → v2 sign 흐름)

**기존 v0.16.0 코드는 무수정**으로 동작한다. 그러나 새 chain을 추가하거나 코드 재작성 시점에 v2 통합 API로 점진 마이그레이션을 권장한다.

#### EVM signTransaction

```javascript
// v1 (그대로 동작)
const tx = await dcent.getEthereumSignedTransaction(
  dcent.coinType.ETHEREUM,
  '0x0',                          // nonce
  '0x77359400',                   // maxFeePerGas
  '0x5208',                       // gasLimit
  '0x0000000000000000000000000000000000000000',  // to
  '0x0',                          // value
  '0x',                           // data
  "m/44'/60'/0'/0/0",             // keyPath
  1                               // chainId (number)
)

// v2 (권장)
const signed = await dcent.sign({
  method: 'signTransaction',
  chainId: 'eip155:1/slip44:60',
  payload: {
    keyPath: "m/44'/60'/0'/0/0",
    transaction: {
      type: 2,                                  // EIP-1559
      to: '0x0000000000000000000000000000000000000000',
      value: '0x0',
      gasLimit: '0x5208',
      maxFeePerGas: '0x77359400',
      maxPriorityFeePerGas: '0x3b9aca00',
      nonce: '0x0',
      data: '0x'
    }
  }
})
```

#### EVM personal_sign

```javascript
// v1
const sig = await dcent.getSignedMessage(
  dcent.coinType.ETHEREUM,
  "m/44'/60'/0'/0/0",
  'Hello, D\'CENT!'
)

// v2
const sig = await dcent.sign({
  method: 'personal_sign',
  chainId: 'eip155:1/slip44:60',
  payload: {
    keyPath: "m/44'/60'/0'/0/0",
    message: 'Hello, D\'CENT!'
  }
})
```

#### EVM eth_signTypedData_v4

```javascript
// v1
const sig = await dcent.getSignedData(
  dcent.coinType.ETHEREUM,
  "m/44'/60'/0'/0/0",
  JSON.stringify({
    types: { /* EIP-712 typed data */ },
    primaryType: 'Transfer',
    domain: { /* ... */ },
    message: { /* ... */ }
  })
)

// v2
const sig = await dcent.sign({
  method: 'signTypedData_v4',
  chainId: 'eip155:1/slip44:60',
  payload: {
    keyPath: "m/44'/60'/0'/0/0",
    message: JSON.stringify({ /* EIP-712 typed data */ })
  }
})
```

#### Solana

```javascript
// v1 (Solana는 별도 wrapper가 없어 generic getSignedMessage 사용)
const sig = await dcent.getSignedMessage(
  dcent.coinType.SOLANA,
  "m/44'/501'/0'/0'",
  'Hello Solana!'
)

// v2 (family-agnostic)
const sig = await dcent.sign({
  method: 'signMessage',
  chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
  payload: {
    keyPath: "m/44'/501'/0'/0'",
    message: 'Hello Solana!'
  }
})
```

### dApp이 keyPath/path를 알아내는 5가지 방법

v2에서 `dcent.sign({ method, chainId, payload })`의 `payload.keyPath`는 필수다 (connector light validation이 강제). dApp이 keyPath를 알아내는 방법:

1. **v1 `dcent.getAddress`** — v0.16.0 그대로 유지. chain별로 keyPath 후보를 사용자에게 받아 디바이스 주소 1건을 반환.
2. **v1 `dcent.selectAddress`** — v0.16.0 그대로 유지. 디바이스가 다중 account를 노출할 때 사용자 선택 UI를 popup이 띄움.
3. **v2 `dcent.connect(chain)` + popup picker UI** — m09-03-06 (별도 child) 도입 예정. WalletConnect 표준 흐름과 호환.
4. **WC 표준 `eth_requestAccounts`** — wallet adapter / EIP-6963 통합 시. picker UI는 wallet 측이 제공.
5. **dApp 내장 BIP44 표준** — dApp이 `m/44'/{coinType}'/0'/0/{index}` 패턴을 직접 생성. 사용자가 디바이스 PIN으로 한 번 확인.

v1 path-only sign 흐름(선택지 1, 2)은 v2에서도 그대로 동작한다 — connector 표면이 호환이므로 기존 dApp은 마이그레이션 불필요.

### 회귀 사례 후기 — m09-03-03 UAT (EVM signMessage)

**증상** (m09-03-03 UAT, 2026-05-12):

- testnet currency(eip155:5)로 personal_sign 호출 → sdk 내부에서 "currency mismatch" 에러로 무한 대기
- 사용자 화면: sign 버튼 클릭 → 응답 없음 → UAT 진행 불가

**근본 원인** (m09-03-03 UAT 시나리오 매트릭스 분석 결과):

1. **sdk-side currency registry drift**: testnet currency가 wm `cryptoCurrencies` registry에 등록되지 않은 상태에서 sdk가 self-match ceremony 수행 → `_assertWmRegistrable`이 throw해야 할 자리에서 silent fall-through.
2. **connector 측 payload validation 부재**: `keyPath` 누락 / prototype 오염 시도 / 잘못된 chainId 형식에 대해 친절한 에러 없이 silent pass → popup 측에서 cryptic error.

**Fix chain** (sign 한바퀴 완성):

1. **m09-03-05 (sdk)**: invariant guard 추가 — `_assertWmRegistrable`이 currency mismatch 시 즉시 throw + Layer 4 sdk-side address inject로 self-match ceremony 안정화.
2. **m09-04-05 (connector)**: family-agnostic light validation — `keyPath` 강제, `__proto__` / `constructor` 차단, payload size limit 1MB, character whitelist (`_sanitizeChain` regex).
3. **m09-04-06 (본 문서)**: 마이그레이션 가이드 + 회귀 사례 후기로 문서화.
4. **m09-04-07 (별도 child)**: end-to-end e2e 통합 검증 (mock sdk fixture + sign 한바퀴 round-trip).

**사용자가 직접 마주칠 수 있는 에러 메시지 매핑**:

| 증상 | v1 (v0.16.0) | v2 (현재) |
|---|---|---|
| keyPath 누락 | popup이 cryptic timeout 또는 silent fail | connector immediate throw: `INVALID_PARAMS: 'keyPath' field required` |
| testnet currency mismatch | popup 무한 대기 | sdk Layer 4 throw + user-facing 에러: `Currency mismatch — testnet not registered` |
| `__proto__` 오염 시도 | popup이 prototype pollution 노출 가능 | connector immediate throw: `INVALID_PARAMS: prototype keys not allowed` |
| 잘못된 chain string | popup if 분기에서 silent skip | connector `_sanitizeChain` throw: `INVALID_PARAMS: chain format invalid` |

이 fix chain 머지 후 m09-03-03 UAT 시나리오는 전체 PASS — sign 한바퀴 완성.

---

## 살아있는 reference — playground (sign 시나리오 포함)

리포 root의 `playground.js`(브라우저에서 `index-v2.html`로 실행)에 v2 sign API 사용 예시가 포함되어 있다.

- **Sign Message tree** (`playground.js:144-191`): personal_sign / signTypedData_v3 / signTypedData_v4 / Solana raw message
- **Sign Transaction tree** (`playground.js:192-215`): EVM EIP-1559 (chains.json에서 동적 빌드) / Bitcoin / Solana / XRP / Hedera / Stellar / Tron
- **Sample presets** (`playground.js:218-271`): 각 sign method에 대한 입력 예시 (message / typed data fixture)
- **Transaction presets** (`playground/presets.evm.json`, `playground/presets.non-evm.json`): chain별 transaction template

playground는 dApp이 작성하는 패턴과 동일한 호출 흐름을 사용하며, v1 wrapper 호환 + v2 통합 sign API 양쪽 사용 예시를 한 페이지에서 확인할 수 있다.

