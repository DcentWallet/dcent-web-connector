# dcent-web-connector v0.16.x → v2 마이그레이션 가이드

v2는 **breaking change**다. v0.16.x에서 chain별로 나뉘어 있던 `get*Signed*` sign wrapper 21개를 제거하고, 모든 chain을 하나로 처리하는 통합 **`dcent.sign({ method, chainId, payload })`** API로 대체했다.

> 📘 전체 API · chain별 payload · 에러 코드는 [v2 Developer Guide](https://dcentwallet.github.io/dcent-web-connector/), chain별 payload 계약은 [docs/v2-payload-contract.md](docs/v2-payload-contract.md) 참조.

---

## 요약: 무엇이 바뀌나

| | v0.16.x | v2 |
|---|---|---|
| 서명 API | chain별 `get*Signed*` wrapper 21개 | 단일 `dcent.sign({ method, chainId, payload })` |
| chain 식별 | 함수명 + `coinType` enum | `chainId` (CAIP-19 문자열) |
| 트랜스포트 | D'CENT Bridge 네이티브 앱 설치 필요 | 브라우저 네이티브 `setTransport('hid' \| 'ble')` — 앱 설치 불필요 |
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
  - \u26a0\ufe0f `getAccountInfo` \ub294 \uc774\ub984\uc740 \uac19\uc73c\ub098 **\uc751\ub2f5 shape \uac00 v2 \ub85c \ubc14\ub00c\uc5c8\ub2e4** (`V1Response<AccountListV2Payload>` \u2014 `src/sign/types.ts:124`).
  - \u26a0\ufe0f `syncAccount` \ub294 **\uc785\ub825\uc774 breaking** \uc774\ub2e4: v1 `{coin_group, coin_name, label}` \u2192 v2 `{chainId, contractAddress?, keyPath, label}` (`src/sign/configure.ts:50`). v1 shape \ub294 \uac70\ubd80\ub41c\ub2e4.
  - \ud83c\udd95 `getPublicKey` \ub294 v1 \ub300\uc751 \ud568\uc218\uac00 \uc5c6\ub294 **v2 \uc2e0\uaddc verb** \ub2e4 (`src/sign/publicKey.ts:9`).
- **Bitcoin tx builder**: `getBitcoinTransactionObject`, `addBitcoinTransactionInput`, `addBitcoinTransactionOutput`
- **lifecycle**: `setTimeOutMs`, `setConnectionListener`, `popupWindowClose`
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

`dcent.setTransport('hid' | 'ble')` — WebHID(USB) / Web Bluetooth. **D'CENT Bridge 앱 설치 불필요** (Chromium 브라우저 전용).

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
