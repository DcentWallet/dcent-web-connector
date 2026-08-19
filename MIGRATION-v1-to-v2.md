# dcent-web-connector v0.16.x → v2 Migration Guide

> 🇰🇷 한국어: [MIGRATION-v1-to-v2-ko.md](MIGRATION-v1-to-v2-ko.md)

v2 is a **breaking change**. The 21 per-chain `get*Signed*` sign wrappers of v0.16.x are removed and replaced by a single unified **`dcent.sign({ method, chainId, payload })`** API that handles every chain the same way.

> 📘 Full API, per-chain payloads and error codes: [v2 Developer Guide](https://dev-docs.dcentwallet.com/dcent-biometric-wallet-for-pc/dcent-web-connector). Per-family payload contract: [docs/v2-payload-contract.md](docs/v2-payload-contract.md).

---

## Summary: what changes

| | v0.16.x | v2 |
|---|---|---|
| Sign API | 21 per-chain `get*Signed*` wrappers | single `dcent.sign({ method, chainId, payload })` |
| Chain identity | function name + `coinType` enum | `chainId` (CAIP-19 string) |
| Transport | DCENT Bridge native app required | browser-native `setTransport('hid' \| 'ble')` — no app to install |
| Read-only API (`getAddress`, …) | — | unchanged |
| enums / `unitConverter` | — | unchanged |
| Response envelope | `{ header, body }` | unchanged |

---

## ⚠️ Removed (breaking — migration required)

The following 21 v1 sign wrappers are **gone** in v2. Calling one throws `undefined is not a function`.

- **EVM**: `getEthereumSignedTransaction`, `getEthereumSignedMessage`, `getTokenSignedTransaction`, `getKlaytnSignedTransaction`
- **Simple chains**: `getBitcoinSignedTransaction`, `getXrpSignedTransaction`, `getHederaSignedTransaction`, `getHederaSignedMessage`, `getStellarSignedTransaction`, `getTronSignedTransaction`, `getSignedMessage`, `getSignedData`
- **Complex chains**: `getTrcTokenSignedTransaction`, `getTezosSignedTransaction`, `getVechainSignedTransaction`, `getNearSignedTransaction`, `getHavahSignedTransaction`, `getPolkadotSignedTransaction`, `getCosmosSignedTransaction`, `getAlgorandSignedTransaction`, `getParachainSignedTransaction`

Also removed: the `chainToMethod` map, v1-only helpers (`getCzonDecimal` and friends), and 8 wrapper-only types.

→ All of them are replaced by **`dcent.sign({ method, chainId, payload })`**.

---

## ✅ Kept (works unmodified)

Same entry point — `import dcent from 'dcent-web-connector'` (default export object). Named exports are also available.

- **Read-only**: `info`, `getDeviceInfo`, `getAddress`, `getXPUB`, `setLabel`, `selectAddress`
  - ⚠️ `getAccountInfo` keeps its name but **the response shape changed in v2** (`V1Response<AccountListV2Payload>` — `src/sign/types.ts:124`).
  - ⚠️ `syncAccount` **takes a different input**: v1 `{coin_group, coin_name, label}` → v2 `{chainId, keyPath, label, token?, meta?}` (`src/sign/configure.ts`). The v1 shape is rejected.

    In v1 the app sent the **device wire format directly** (`coin_group` / `coin_name`). In v2 the wallet performs that translation — the app supplies only the chain and the identifier.

    | v1 | v2 | Notes |
    |---|---|---|
    | `coin_group` (e.g. `ETHEREUM`) | `chainId` (CAIP-19) | For both coins and tokens, send the **parent chain's** chainId |
    | `coin_group` for a token group (e.g. `ERC20`) | — (derived by the wallet) | Determined from `token.contract` |
    | `coin_name` (token: contract truncated to 15 chars) | `token.contract` | Send the **on-chain identifier** as is. Truncation and upper-casing are the wallet's job |
    | — (absent in v1) | `token.symbol` / `token.decimals` | Required for **unregistered tokens**. Missing them returns `-32602` |
    | `label` | `label` | Unchanged (2–14 characters) |
    | — (absent in v1) | `keyPath` | New and required in v2 (BIP-44) |

    The token field names are **identical to the `transaction.token` descriptor used on the signing path** — the same token never has to be described twice. (Early v2 had a top-level `contractAddress`; it was never published to npm and never worked because of a lookup-key mismatch, so it was removed in m13-02-08.)
  - 🆕 `getPublicKey` is a **new v2 verb** with no v1 counterpart (`src/sign/publicKey.ts:9`).
- **Bitcoin tx builder**: `getBitcoinTransactionObject`, `addBitcoinTransactionInput`, `addBitcoinTransactionOutput`
- **Lifecycle**: `setTimeOutMs`, `setConnectionListener`, `popupWindowClose`
  - ⚠️ `setConnectionListener` keeps a **backward-compatible signature** but **fires more often**. The meaning of the first argument (the popup axis) is unchanged from v1, so existing `function (state) {...}` code keeps working. However, v2 passes a device axis as a second argument and invokes the callback whenever **either axis changes** — so the first argument may be **repeated with the same value**. See "🆕 What's new › Device axis" below.
- **Enums**: `coinType`, `coinGroup`, `coinName`, `bitcoinTxType`, `klaytnTxType`, `xrpTxType`, `state`, `coinDecimals`
- **Utility**: `unitConverter`
- **Validators**: `isAvaliableCoinType`, `isCzoneCoinType`, `isParachainCoinType`, `isBitcoinTxCoinType`, `isTokenType`, `getCzonePrifix`, `isAvaliableLabel`, `isAvaliableCoinGroup`, `isAvailableSyncAccountCoinName`

---

## 🆕 What's new

### Unified sign API — `dcent.sign({ method, chainId, payload })`

- `method`: `'signTransaction'` | `'signMessage'` | `'signTypedData'` | `'signData'` | `'signAuthEntry'`
- `chainId`: the full CAIP-19 string (e.g. `'eip155:1/slip44:60'`)
- `payload`: `{ keyPath, ...method-specific fields }` — **`keyPath` lives inside the payload and is required**

### Browser-native transport

`dcent.setTransport('hid' | 'ble')` — WebHID (USB) or Web Bluetooth. **No DCENT Bridge app to install** (Chromium-based browsers only).

### 🆕 Device axis — the second argument of `setConnectionListener`

v1 exposed connection state as **one axis**. v2 makes explicit that there are really two:

| Axis | What it tells you | Where to read it |
|---|---|---|
| **Popup** | whether the bridge popup window is alive | first argument (= `detail.popup`) |
| **Device** | whether the hardware wallet is attached (including "waiting for approval" and "why it dropped") | `detail.device` · `detail.deviceReason` (new in v2) |

The two axes are **independent** — unplugging USB while the popup stays open changes only the device axis. In v1, `'connected'` meant "the popup opened", not "the device is attached", and with a single axis that distinction could not be expressed.

```ts
type TransportState = 'connected' | 'disconnected'          // popup axis (same as v1)
type DeviceState    = 'connected' | 'disconnected' | 'awaiting-connect-approval' | 'unknown'

// Why device went to 'disconnected'. This is the cause of a transition, not a state.
type DeviceDisconnectReason =
  | 'connect-approval-rejected'    // user rejected on the device screen — 🔴 USB only
  | 'connect-approval-cancelled'   // popup cancelled / BLE session taken over / cause not observed
                                   // 🔴 on BLE a user rejection also lands here (the bridge
                                   //    cannot tell rejection apart from a link drop)
  | 'device-removed'               // cable unplugged · GATT dropped · transport released explicitly
                                   // a physical disconnect reports this even while awaiting approval
  | 'reconnect-timeout'            // automatic reconnect budget exhausted
  | 'transport-failed'             // transport hit a fatal error while awaiting approval
                                   // (a physical disconnect is device-removed, not this)

interface ConnectionStateDetail {
  popup: TransportState
  device: DeviceState
  // 🔴 Both keys are **always present** in detail (only their values are conditional).
  //    Do not branch on `'deviceInfo' in detail` / `'deviceReason' in detail` — always true.
  deviceInfo?: DeviceBriefInfo           // populated only when device === 'connected'
  deviceReason?: DeviceDisconnectReason  // populated only when device === 'disconnected',
                                         // and may still be undefined there
                                         // (older bridge / unknown reason) — always keep a default branch
}

interface DeviceBriefInfo {       // for display — every field optional
  deviceId?: string               // same name as in getDeviceInfo
  label?: string                  // same name as in getDeviceInfo
  version?: string                // same name as in getDeviceInfo
  deviceModel?: string            // same name as in getDeviceInfo
  connectType?: 'usb' | 'ble'     // same name as in getDeviceInfo
  coinCount?: number              // the *count* from coin_list — the list itself is not sent (see below)
}
```

```js
dcent.setConnectionListener((state, detail) => {
  // Popup axis — existing v1 code keeps working
  if (state === 'connected') showPopupOpen()
  else showPopupClosed()

  // Device axis — new
  if (detail.device === 'connected') showDevice(detail.deviceInfo?.label, detail.deviceInfo?.connectType)
  else if (detail.device === 'awaiting-connect-approval') showApprovalWaiting()   // waiting for approval on the device screen
  else if (detail.device === 'disconnected') promptReconnectDevice(detail.deviceReason)  // may be undefined — keep a default branch
  else hideDeviceBadge()                     // 'unknown'
})
```

> 🔴 **Do not let an `else` branch swallow new values.** If `'awaiting-connect-approval'` has no explicit branch, the approval window shows up as `'unknown'` (= nothing observed), which defeats the whole point of surfacing it.
>
> 🔴 **Receiving a `deviceReason` does not settle an in-flight request promise** — it stays pending for up to `timeoutMs` (default 180000 ms / 3 minutes). To close a rejection UI immediately, cancel the request from this callback in your own code.

#### 🔴 It fires more often (check this when migrating)

**The signature itself is backward compatible** — JavaScript ignores extra arguments, so a v1 handler registered as `function (state) {...}` keeps working untouched. What changes is **how often it runs**:

- v1: called **only when the popup axis changed** → every call meant `state` had changed.
- v2: called when **either axis** changes → `state` may **repeat with the same value**. (Example: with the popup open, unplugging and replugging the device calls the handler twice more while `state === 'connected'`.)

So if your handler does something that **must not repeat**, fix it during migration:

```js
// ❌ May run twice in v2 — "the handler ran" no longer implies "state changed"
dcent.setConnectionListener((state) => {
  if (state === 'disconnected') { analytics.track('disconnected'); retryConnect() }
})

// ✅ Compare against the previous value yourself
let prev = null
dcent.setConnectionListener((state) => {
  if (state !== prev) { prev = state; if (state === 'disconnected') { analytics.track('disconnected'); retryConnect() } }
})
```

Handlers that only read state (updating a badge or a spinner) are idempotent and **need no change**.

#### What `'unknown'` means

On the device axis, `'unknown'` does not mean "no device" — it means **"not known yet / cannot be observed"**. That covers the time before the popup opens and after it closes. Collapsing it into `'disconnected'` would ship a false claim ("the device was removed") to the app, so it is kept separate. Initial values: popup `'disconnected'`, device `'unknown'`.

#### Field names match `getDeviceInfo()`

The names are deliberately identical — `label` / `version` / `deviceModel` / `connectType` — so the same value never has to be learned twice. This prevents the silent `undefined` you get from writing `firmwareVersion` where `detail.deviceInfo.version` belongs.

Only `coinCount` differs from its counterpart (`coin_list`), because the array itself is not sent: **the set of installed coins is quasi-identifying**, so shipping the list would smuggle back the `deviceId`/`ksm_version` exposure that was deliberately left out. A count does not. Call `getDeviceInfo()` if you need the list.

#### `deviceId` is included; other identifiers are not

`deviceId` **identifies a specific device**. This signal is pushed without the app asking for it, so merely subscribing lets you recognise a returning device — know that trade-off before you use it. It is included anyway because it is **the only field that distinguishes two devices of the same model**.

`label` is not a substitute — on real hardware (measured 2026-08-10) a DCENT X reported `label` as `DCENT-X`, i.e. **the same string as the model name**. Users can also set the same label on two devices. `deviceModel` has the same problem: it is identical across one model, and **absent on v1 (Biometric) devices** (it is only sent by devices that can identify their model — a missing value is an older device, not an error).

```js
// ❌ Do not identify a device by label — two devices can share the same string
if (detail.deviceInfo?.label === lastLabel) { /* assumes same device */ }

// ✅ Use deviceId
if (detail.deviceInfo?.deviceId === lastDeviceId) { /* same device */ }
```

`ksm_version` (secure-chip firmware) and the device `state` are **still not sent** — they are not needed to identify a device, and there is no reason to push internal device state automatically. Call `getDeviceInfo()` if you need them. Both `detail` and `detail.deviceInfo` are frozen, so mutating them has no effect.

With an older bridge popup that sends no device signal, `detail.device` simply stays `'unknown'` while the popup axis keeps working. For the same reason, a bridge that does not send `'awaiting-connect-approval'` / `deviceReason` never surfaces those values. 🔴 **Unknown values are handled differently per axis**: an unknown `device` value drops the whole message without touching the axis, whereas an unknown `reason` collapses only `deviceReason` to `undefined` and **still delivers the disconnect itself (`device: 'disconnected'`)** — dropping a disconnect because its reason was unreadable would be worse. Either way, upgrading the two sides in any order is safe.

---

## Migration examples

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

// v2 — payload.data is a JSON.stringify'd string, sent together with a version
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

### Other chains

Same pattern — `method` + a CAIP-19 `chainId` + the chain's `payload.transaction`. For the exact per-chain payload shape see [docs/v2-payload-contract.md](docs/v2-payload-contract.md).

---

## Response format (unchanged)

v2 returns the same `{ header, body }` envelope as v1:

```js
{
  header: { status: 'success' },
  body: { command: '...', parameter: { signature: '...' } }
}
```

On failure, `header.status !== 'success'` and `body.error.code` carries a string (`user_cancel`, `param_error`, `device_not_connected`, …). The full error catalogue is in the [Developer Guide](https://dev-docs.dcentwallet.com/dcent-biometric-wallet-for-pc/dcent-web-connector).

---

## Staying on v0.16.x

v0.16.x is frozen (security fixes only). To keep using it without migrating, pin the version:

```bash
npm i dcent-web-connector@0.16.x
```

The v0.16.x (v1) API README is at [v1/README.md](v1/README.md).

---

## Support

Migrating and something does not line up? Email **contact@iotrust.kr** — include the `chainId`, the v1 call you are replacing, the v2 call you tried, and the response you got back.
