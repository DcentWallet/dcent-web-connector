# dcent-web-connector v0.16.x → v2 마이그레이션 가이드

v2는 **breaking change**다. v0.16.x에서 chain별로 나뉘어 있던 `get*Signed*` sign wrapper 21개를 제거하고, 모든 chain을 하나로 처리하는 통합 **`dcent.sign({ method, chainId, payload })`** API로 대체했다.

> 📘 전체 API · chain별 payload · 에러 코드는 [v2 Developer Guide](https://dcentwallet.github.io/dcent-web-connector/), chain별 payload 계약은 [docs/v2-payload-contract.md](docs/v2-payload-contract.md) 참조.

---

## 요약: 무엇이 바뀌나

| | v0.16.x | v2 |
|---|---|---|
| 서명 API | chain별 `get*Signed*` wrapper 21개 | 단일 `dcent.sign({ method, chainId, payload })` |
| chain 식별 | 함수명 + `coinType` enum | `chainId` (CAIP-19 문자열) |
| 트랜스포트 | 디센트 Bridge 네이티브 앱 설치 필요 | 브라우저 네이티브 `setTransport('hid' \| 'ble')` — 앱 설치 불필요 |
| read-only API (`getAddress` 등) | — | 동일 유지 |
| enum / `unitConverter` | — | 동일 유지 |
| 응답 envelope | `{ header, body }` | 동일 |

---

## ⚠️ 제거된 것 (breaking — 마이그레이션 필수)

v2에서 다음 21개 v1 sign wrapper가 **제거**됐다. 호출하면 `undefined is not a function`.

- **EVM**: `getEthereumSignedTransaction`, `getEthereumSignedMessage`, `getTokenSignedTransaction`, `getKlaytnSignedTransaction`
- **단순 체인**: `getBitcoinSignedTransaction`, `getXrpSignedTransaction`, `getHederaSignedTransaction`, `getHederaSignedMessage`, `getStellarSignedTransaction`, `getTronSignedTransaction`, `getSignedMessage`, `getSignedData`
- **복합 체인**: `getTrcTokenSignedTransaction`, `getTezosSignedTransaction`, `getVechainSignedTransaction`, `getNearSignedTransaction`, `getHavahSignedTransaction`, `getPolkadotSignedTransaction`, `getCosmosSignedTransaction`, `getAlgorandSignedTransaction`, `getParachainSignedTransaction`

함께 제거: `chainToMethod` 매핑, v1 전용 helper(`getCzonDecimal` 등), wrapper 전용 타입 8개.

→ 모두 **`dcent.sign({ method, chainId, payload })`** 로 대체한다.

---

## ✅ 유지되는 것 (무수정 호환)

진입점 동일 — `import dcent from 'dcent-web-connector'` (default export object). named export도 추가 제공.

- **read-only**: `info`, `getDeviceInfo`, `getAddress`, `getXPUB`, `setLabel`, `selectAddress`
  - ⚠️ `getAccountInfo` 는 이름은 같으나 **응답 shape 가 v2 로 바뀌었다** (`V1Response<AccountListV2Payload>` — `src/sign/types.ts:124`).
  - ⚠️ `syncAccount` 는 **입력이 breaking** 이다: v1 `{coin_group, coin_name, label}` → v2 `{chainId, keyPath, label, token?, meta?}` (`src/sign/configure.ts`). v1 shape 는 거부된다.

    v1 은 App 이 **기기 wire 형식을 직접** 보냈다(`coin_group`/`coin_name`). v2 는 그 변환을
    지갑이 한다 — App 은 체인과 식별자만 준다.

    | v1 | v2 | 비고 |
    |---|---|---|
    | `coin_group` (예 `ETHEREUM`) | `chainId` (CAIP-19) | 코인·토큰 모두 **부모 체인**의 chainId 를 보낸다 |
    | `coin_group` 이 토큰 그룹인 경우 (예 `ERC20`) | — (지갑이 도출) | `token.contract` 로부터 지갑이 결정한다 |
    | `coin_name` (토큰: contract 15자 절단) | `token.contract` | **온체인 식별자**를 그대로. 절단·대문자화는 지갑이 한다 |
    | — (v1 에 없음) | `token.symbol` / `token.decimals` | **미등록 토큰**에 필요. 없으면 `-32602` |
    | `label` | `label` | 동일 (2–14자) |
    | — (v1 에 없음) | `keyPath` | v2 신규 필수 (BIP-44) |

    토큰 필드 이름은 **서명 경로의 `transaction.token` descriptor 와 동일**하다 — 같은 토큰을
    두 벌로 기술할 필요가 없다. (초기 v2 에는 top-level `contractAddress` 가 있었으나 npm 에
    배포된 적이 없고 조회 키 불일치로 동작한 적도 없어 m13-02-08 에서 제거했다.)
  - 🆕 `getPublicKey` 는 v1 대응 함수가 없는 **v2 신규 verb** 다 (`src/sign/publicKey.ts:9`).
- **Bitcoin tx builder**: `getBitcoinTransactionObject`, `addBitcoinTransactionInput`, `addBitcoinTransactionOutput`
- **lifecycle**: `setTimeOutMs`, `setConnectionListener`, `popupWindowClose`
  - ⚠️ `setConnectionListener` 는 **시그니처는 하위호환**이지만 **호출 빈도가 늘어났다**. 1번째 인자의
    의미(팝업 축)는 v1 그대로라 `function (state) {...}` 형태의 기존 코드는 수정 없이 동작한다.
    다만 v2 는 2번째 인자로 기기 축을 함께 주고 **두 축 중 하나라도 바뀌면** 호출하므로, 1번째
    인자가 직전과 **같은 값으로 반복 호출**될 수 있다.
    자세한 내용은 아래 "🆕 새로 추가된 것 › 기기 축" 절 참조.
- **enum**: `coinType`, `coinGroup`, `coinName`, `bitcoinTxType`, `klaytnTxType`, `xrpTxType`, `state`, `coinDecimals`
- **utility**: `unitConverter`
- **validators**: `isAvaliableCoinType`, `isCzoneCoinType`, `isParachainCoinType`, `isBitcoinTxCoinType`, `isTokenType`, `getCzonePrifix`, `isAvaliableLabel`, `isAvaliableCoinGroup`, `isAvailableSyncAccountCoinName`

---

## 🆕 새로 추가된 것

### 통합 sign API — `dcent.sign({ method, chainId, payload })`

- `method`: `'signTransaction'` | `'signMessage'` | `'signTypedData'` | `'signData'` | `'signAuthEntry'`
- `chainId`: 전체 CAIP-19 문자열 (예: `'eip155:1/slip44:60'`)
- `payload`: `{ keyPath, ...method별 필드 }` — **`keyPath`는 payload 안에 위치하며 필수**

### 브라우저 네이티브 트랜스포트

`dcent.setTransport('hid' | 'ble')` — WebHID(USB) / Web Bluetooth. **디센트 Bridge 앱 설치 불필요** (Chromium 브라우저 전용).

### 🆕 기기 축 — `setConnectionListener` 2번째 인자

v1 의 연결 상태는 **한 축**이었다. v2 는 그 축이 실제로 두 개라는 것을 드러낸다:

| 축 | 무엇을 말하나 | 어디서 읽나 |
|---|---|---|
| **팝업** | 브리지 팝업 창이 살아있는가 | 1번째 인자 (= `detail.popup`) |
| **기기** | 하드웨어 지갑이 붙어있는가 (승인 대기 중인가 · 왜 끊겼는가 포함) | `detail.device` · `detail.deviceReason` (v2 신규) |

두 축은 **독립**이다 — 팝업이 열린 채로 USB 를 뽑으면 기기 축만 바뀐다. v1 에서 `'connected'` 는
"팝업이 열렸다"였지 "기기가 붙었다"가 아니었는데, 한 축만 보이니 그 구분이 불가능했다.

```ts
type TransportState = 'connected' | 'disconnected'          // 팝업 축 (v1 그대로)
type DeviceState    = 'connected' | 'disconnected' | 'awaiting-connect-approval' | 'unknown'

// device === 'disconnected' 로 간 **사유**. 상태가 아니라 전이의 원인이다.
type DeviceDisconnectReason =
  | 'connect-approval-rejected'    // 기기 화면에서 사용자가 거절
  | 'connect-approval-cancelled'   // 팝업 취소 / BLE 세션 인계 / 원인 미관측 이탈
  | 'device-removed'               // 케이블 분리 · GATT 절단 · 명시적 transport 해제
  | 'reconnect-timeout'            // 자동 재연결 예산 소진
  | 'transport-failed'             // 승인 대기 도중 transport 자체가 깨짐

interface ConnectionStateDetail {
  popup: TransportState
  device: DeviceState
  deviceInfo?: DeviceBriefInfo        // device === 'connected' 일 때만
  deviceReason?: DeviceDisconnectReason  // device === 'disconnected' 일 때만
}

interface DeviceBriefInfo {       // 표시용 — 전부 optional
  deviceId?: string               // getDeviceInfo 의 deviceId 와 같은 이름
  label?: string                  // getDeviceInfo 의 label 과 같은 이름
  version?: string                // getDeviceInfo 의 version 과 같은 이름
  deviceModel?: string            // getDeviceInfo 의 deviceModel 과 같은 이름
  connectType?: 'usb' | 'ble'     // getDeviceInfo 의 connectType 과 같은 이름
  coinCount?: number              // coin_list 의 '개수' — 목록은 보내지 않는다(아래 참조)
}
```

```js
dcent.setConnectionListener((state, detail) => {
  // 팝업 축 — v1 코드 그대로 동작
  if (state === 'connected') showPopupOpen()
  else showPopupClosed()

  // 기기 축 — 신규
  if (detail.device === 'connected') showDevice(detail.deviceInfo?.label, detail.deviceInfo?.connectType)
  else if (detail.device === 'awaiting-connect-approval') showApprovalWaiting()   // 기기 화면에서 허용 대기
  else if (detail.device === 'disconnected') promptReconnectDevice(detail.deviceReason)
  else hideDeviceBadge()                     // 'unknown'
})
```

> 🔴 **`else` 가지에 새 값을 흡수시키지 말 것.** `'awaiting-connect-approval'` 을 명시 분기로
> 두지 않으면 승인 대기가 `'unknown'`(= 아무것도 관측 안 됨)으로 보여, 기기 화면 승인 구간을
> 알린다는 목적 자체가 사라진다.
>
> 🔴 **`deviceReason` 을 받아도 진행 중인 요청 promise 는 settle 되지 않는다** — 최대
> `timeoutMs`(기본 180000ms / 3분) 매달린다. 거절 UX 를 즉시 닫으려면 이 콜백에서 App 이
> 자체적으로 취소 처리해야 한다.

#### 🔴 호출 빈도가 늘어난다 (마이그레이션 시 확인할 것)

**시그니처 자체는 하위호환이다** — JS 는 남는 인자를 무시하므로 `function (state) {...}` 로 등록한
v1 코드는 수정 없이 그대로 동작한다. 바뀌는 것은 **얼마나 자주 불리는가**다:

- v1: 팝업 축이 **바뀔 때만** 호출 → 매 호출이 곧 `state` 의 변화였다.
- v2: **두 축 중 하나라도** 바뀌면 호출 → `state` 는 직전과 **같은 값으로 반복**될 수 있다.
  (예: 팝업이 열린 채 기기를 뺐다 꽂으면 `state === 'connected'` 인 채로 2회 더 호출된다.)

그래서 핸들러가 **반복되면 안 되는 일**을 하고 있다면 마이그레이션 시 손봐야 한다:

```js
// ❌ v2 에서 중복 실행될 수 있음 — "호출됐다 = state 가 바뀌었다" 가 더 이상 성립하지 않는다
dcent.setConnectionListener((state) => {
  if (state === 'disconnected') { analytics.track('disconnected'); retryConnect() }
})

// ✅ 직전 값과 직접 비교한다
let prev = null
dcent.setConnectionListener((state) => {
  if (state !== prev) { prev = state; if (state === 'disconnected') { analytics.track('disconnected'); retryConnect() } }
})
```

읽기(배지·스피너 갱신)만 하는 핸들러는 idempotent 하므로 **수정할 필요가 없다.**

#### `'unknown'` 의 의미

기기 축의 `'unknown'` 은 "기기가 없다"가 아니라 **"아직 모른다 / 관측할 수 없다"** 이다.
팝업이 열리기 전과 팝업이 닫힌 뒤가 여기 해당한다. `'disconnected'` 로 접으면 "기기가 빠졌다"는
거짓 단정이 App 에 나가므로 그렇게 하지 않는다. 초기값은 팝업 `'disconnected'` · 기기 `'unknown'`.

#### 필드 이름은 `getDeviceInfo()` 와 같다

같은 값을 두 어휘로 배우지 않도록 이름을 맞췄다 — `label` / `version` / `deviceModel` /
`connectType`. `detail.deviceInfo.version` 을 쓸 자리에 `firmwareVersion` 을 써서 조용히
`undefined` 를 읽는 사고를 없애려는 것이다.

`coinCount` 만 짝(`coin_list`)과 이름이 다른데, 배열을 그대로 보내지 않기 때문이다 —
**설치된 코인 조합 자체가 준-식별 정보**라, 목록을 실으면 아래에서 뺀 `deviceId`/`ksm_version`
을 뒷문으로 다시 들이는 셈이 된다. 개수는 그렇지 않다. 목록이 필요하면 `getDeviceInfo()` 를
호출한다.

#### `deviceId` 는 싣고, 나머지 식별자는 싣지 않는다

`deviceId` 는 **기기를 특정하는 값**이다. 이 신호는 App 이 요청하지 않아도 자동으로 나가므로,
구독만 해도 재방문한 기기를 알아볼 수 있다 — 트레이드오프를 알고 써야 한다. 그럼에도 싣는
이유는 **같은 모델의 두 기기를 구별하는 유일한 필드**이기 때문이다.

`label` 은 대체재가 못 된다 — 실기기 실측(2026-08-10)에서 X 기기의 `label` 이 `DCENT-X`,
즉 **모델명과 같은 값**으로 나왔다. 사용자가 두 기기에 같은 라벨을 설정할 수도 있다.
`deviceModel` 도 마찬가지다: 같은 모델이면 전부 같고, **v1(Biometric) 기기에는 아예 없다**
(모델 식별이 되는 기기에만 실린다 — 값이 없으면 오류가 아니라 구형 기기다).

```js
// ❌ 라벨로 기기를 구분하지 말 것 — 두 기기가 같은 문자열일 수 있다
if (detail.deviceInfo?.label === lastLabel) { /* 같은 기기라고 단정 */ }

// ✅ deviceId 로 구분한다
if (detail.deviceInfo?.deviceId === lastDeviceId) { /* 같은 기기 */ }
```

`ksm_version`(보안칩 펌웨어)과 기기 `state` 는 **여전히 싣지 않는다** — 기기 식별에 필요하지
않고, 기기 내부 상태를 자동 신호로 노출할 이유가 없다. 필요하면 `getDeviceInfo()` 를 직접
호출한다. `detail` 과 `detail.deviceInfo` 는 freeze 되어 있어 수정해도 반영되지 않는다.

기기 신호를 보내지 않는 구버전 브리지 팝업에서는 `detail.device` 가 `'unknown'` 으로 남을 뿐,
팝업 축은 그대로 동작한다. 같은 이유로 `'awaiting-connect-approval'` / `deviceReason` 을 보내지
않는 브리지에서는 두 값이 등장하지 않는다 — connector 는 모르는 값을 받으면 축을 갱신하지 않고
그대로 버리므로(구버전 브리지 호환의 근거), 양방향 어느 쪽이 먼저 올라가도 안전하다.

---

## 마이그레이션 예시

### EVM — signTransaction

```js
// v0.16.x
const tx = await dcent.getEthereumSignedTransaction(
  dcent.coinType.ETHEREUM,
  '0x0', '0x77359400', '0x5208',            // nonce, gasPrice, gasLimit
  '0xRecipient', '0x2386f26fc10000', '0x',  // to, value, data
  "m/44'/60'/0'/0/0", 1                      // keyPath, chainId
)

// v2
const tx = await dcent.sign({
  method: 'signTransaction',
  chainId: 'eip155:1/slip44:60',
  payload: {
    keyPath: "m/44'/60'/0'/0/0",
    transaction: {
      type: 2,
      to: '0xRecipient',
      value: '0x2386f26fc10000',
      gasLimit: '0x5208',
      maxFeePerGas: '0x77359400',
      maxPriorityFeePerGas: '0x3b9aca00',
      nonce: '0x0',
      data: '0x'
    }
  }
})
```

### EVM — personal message

```js
// v0.16.x
const sig = await dcent.getEthereumSignedMessage("0x48656c6c6f", "m/44'/60'/0'/0/0")

// v2
const sig = await dcent.sign({
  method: 'signMessage',
  chainId: 'eip155:1/slip44:60',
  payload: { keyPath: "m/44'/60'/0'/0/0", message: '0x48656c6c6f' }  // hex-encoded bytes
})
```

### EVM — typed data (EIP-712)

```js
// v0.16.x
const sig = await dcent.getSignedData(
  dcent.coinType.ETHEREUM, "m/44'/60'/0'/0/0", JSON.stringify(typedData)
)

// v2  — payload.data는 JSON.stringify된 문자열, version 동반
const sig = await dcent.sign({
  method: 'signTypedData',
  chainId: 'eip155:1/slip44:60',
  payload: {
    keyPath: "m/44'/60'/0'/0/0",
    data: JSON.stringify(typedData),   // { types, primaryType, domain, message }
    version: 'V4'
  }
})
```

### 다른 chain

동일 패턴 — `method` + CAIP-19 `chainId` + chain별 `payload.transaction`. chain별 정확한 payload shape는 [docs/v2-payload-contract.md](docs/v2-payload-contract.md)를 참조한다.

---

## 응답 형식 (변경 없음)

v1과 동일한 `{ header, body }` envelope를 반환한다:

```js
{
  header: { status: 'success' },
  body: { command: '...', parameter: { signature: '...' } }
}
```

실패 시 `header.status !== 'success'` 이고 `body.error.code`(문자열 — `user_cancel`, `param_error`, `device_not_connected`, ...)를 확인한다. 전체 에러 코드는 [Developer Guide](https://dcentwallet.github.io/dcent-web-connector/) 참조.

---

## v0.16.x에 머무르려면

v0.16.x는 frozen(보안 fix만). 마이그레이션 없이 계속 쓰려면 버전 고정:

```bash
npm i dcent-web-connector@0.16.x
```

v0.16.x(v1) API README는 [v1/README.md](v1/README.md).
