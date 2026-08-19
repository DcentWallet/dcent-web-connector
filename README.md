# dcent-web-connector

npm connector for integrating the **DCENT hardware wallet** into web apps. It opens a popup served from `https://v2bridge.dcentwallet.com/` and talks to the device over **WebHID (USB)** or **Web Bluetooth** — no native bridge app to install.

- 📘 **v2 Developer Guide** (full API + per-chain reference): [**dev-docs.dcentwallet.com**](https://dev-docs.dcentwallet.com/dcent-biometric-wallet-for-pc/dcent-web-connector) — the canonical guide
  - `docs/legacy-v2-dev-doc.html` is a **frozen** offline snapshot (the single-file prototype the guide was built from, EN + KO). It is no longer updated — do not edit it.
- [Per-family payload contract](docs/v2-payload-contract.md)
- **v0.16.x (v1) → v2 migration:** [MIGRATION-v1-to-v2.md](./MIGRATION-v1-to-v2.md)

> **v2 is a breaking change from v0.16.x.** The v1 `get*Signed*Transaction/Message` wrappers are replaced by a single `dcent.sign({ method, chainId, payload })`. Existing v0.16.x Apps keep working — see [v0.16.x users](#v016x-v1-users) below.

## Install

```bash
npm i dcent-web-connector
```

Runs in **Chromium browsers** (Chrome, Edge, Brave, Opera). Firefox and Safari do not support WebHID / Web Bluetooth.

## Quick Start

```js
import dcent from 'dcent-web-connector'

// 1. Pick a transport once (WebHID over USB; 'ble' for Web Bluetooth)
dcent.setTransport('hid')

// 2. Get an address
const res = await dcent.getAddress({
  chainId: 'eip155:1/slip44:60',
  keyPath: "m/44'/60'/0'/0/0",
})
const address = res.body.parameter.address

// 3. Sign a transaction
const signed = await dcent.sign({
  method: 'signTransaction',
  chainId: 'eip155:1/slip44:60',
  payload: {
    keyPath: "m/44'/60'/0'/0/0",
    transaction: { /* chain-specific fields — see the Developer Guide */ },
  },
})

if (signed.header.status === 'success') {
  const rawTx = signed.body.parameter.signature
  // broadcast rawTx with your own provider
}
```

Every method takes a `chainId` and a payload and returns the same `{ header, body }` envelope — the call shape does not change from one network to the next. Full per-chain payloads, `chainId` formats, `keyPath` rules, and error codes are in the **[Developer Guide](https://dev-docs.dcentwallet.com/dcent-biometric-wallet-for-pc/dcent-web-connector)**.

## Transport

`dcent.setTransport('hid' | 'ble')` selects the browser-native transport — **no DCENT Bridge app to install**. Each call opens the DCENT popup where the user approves the action on the device. `dcent.getDeviceInfo()` and `dcent.popupWindowClose()` remain available.

## Using in a Chrome extension

The connector runs **unmodified** inside a Chrome MV3 extension — measured end to end on a real device over USB (extension page → handshake with the DCENT popup → `getDeviceInfo` success), against a locally hosted DCENT popup that the connector was built to point at. Import and call it exactly as you would on a web page.

Where it works, and where it does not:

| Extension surface | Supported | Why |
|---|---|---|
| Extension **tab** (`chrome-extension://<id>/page.html`) | ✅ | Measured with a real device over USB |
| **Side panel** | ✅ | Measured. The DCENT popup opens as a tab rather than a separate window — a UX difference only; the reply channel is unaffected |
| **Toolbar popup** (browser action) | ❌ | Measured: `window.open` returns `null` there — the page opens with no `opener` and the popup itself is destroyed within 100 ms. The connector rejects with *"window.open returned null — popup blocked by browser?"*, which points at a popup blocker; the real cause is the surface |
| **Background service worker** | ❌ | The connector calls `window.open` and `postMessage`, and the DCENT popup replies through `window.opener`; a service worker has no `window` at all |

Two more things to know:

- **MV3 CSP (`script-src 'self'`)** — extension pages cannot load remote scripts, so ship the connector inside your extension bundle. The published bundle is `eval`-free; keep your own bundler that way too (webpack's `eval-source-map` devtool would break the policy).
- **The user sees which extension is asking** — the DCENT popup shows `chrome-extension://<id>` as the requesting origin in its connection info.

## Common methods

| Method | Purpose |
|---|---|
| `setTransport('hid' \| 'ble')` | Choose WebHID (USB) or Web Bluetooth |
| `getDeviceInfo()` | Device model / firmware / connection state |
| `getAddress({ chainId, keyPath })` | Account address for a keyPath |
| `getPublicKey({ chainId, keyPath })` | Public key for a keyPath |
| `sign({ method, chainId, payload })` | `method`: `signTransaction` / `signMessage` / … |
| `popupWindowClose()` | Close the popup |

See the [Developer Guide](https://dev-docs.dcentwallet.com/dcent-biometric-wallet-for-pc/dcent-web-connector) for the full method + chain reference.

## v0.16.x (v1) users

v0.16.x is **frozen** (security fixes only). Existing Apps keep working:

```bash
npm i dcent-web-connector@0.16.x
```

- Legacy v1 docs: [README](./v1/README.md) · [Integration Guide](./v1/INTEGRATION-GUIDE.md)
- v1 → v2 migration guide: [MIGRATION-v1-to-v2.md](./MIGRATION-v1-to-v2.md)

## Development

```bash
yarn build          # build the v2 bundle
open index-v2.html  # v2 Playground (manual test page) — or `yarn dev` → http://localhost:9090/index-v2.html
yarn test           # v1 legacy suite (lint + jest puppeteer)
yarn unit-v2        # v2 unit tests (jest.v2.config.js)
yarn unit-v2-e2e    # v2 e2e tests
yarn check:docs     # docs lint + payload-contract coverage/shape
```

## License

MIT
