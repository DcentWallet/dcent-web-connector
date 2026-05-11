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
