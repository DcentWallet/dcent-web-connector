# dcent-web-connector

npm connector for integrating the **D'CENT hardware wallet** into web dApps. It opens a popup served from `https://v2bridge.dcentwallet.com/` and talks to the device over **WebHID (USB)** or **Web Bluetooth** — no native bridge app to install.

- 📘 **v2 Developer Guide** (EN / KO — full API + per-chain reference): [**GitHub Pages**](https://dcentwallet.github.io/dcent-web-connector/) — or download [`docs/index.html`](docs/index.html) and open it in a browser (self-contained, works offline)
- [Per-family payload contract](docs/v2-payload-contract.md)
- **v0.16.x (v1) → v2 migration:** [MIGRATION-v1-to-v2.md](./MIGRATION-v1-to-v2.md)

> **v2 is a breaking change from v0.16.x.** The v1 `get*Signed*Transaction/Message` wrappers are replaced by a single `dcent.sign({ method, chainId, payload })`. Existing v0.16.x dApps keep working — see [v0.16.x users](#v016x-v1-users) below.

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

Every method takes a `chainId` and a payload and returns the same `{ header, body }` envelope — the call shape does not change from one network to the next. Full per-chain payloads, `chainId` formats, `keyPath` rules, and error codes are in the **[Developer Guide](https://dcentwallet.github.io/dcent-web-connector/)**.

## Transport

`dcent.setTransport('hid' | 'ble')` selects the browser-native transport — **no D'CENT Bridge app to install**. Each call opens the D'CENT popup where the user approves the action on the device. `dcent.getDeviceInfo()` and `dcent.popupWindowClose()` remain available.

## Common methods

| Method | Purpose |
|---|---|
| `setTransport('hid' \| 'ble')` | Choose WebHID (USB) or Web Bluetooth |
| `getDeviceInfo()` | Device model / firmware / connection state |
| `getAddress({ chainId, keyPath })` | Account address for a keyPath |
| `getPublicKey({ chainId, keyPath })` | Public key for a keyPath |
| `sign({ method, chainId, payload })` | `method`: `signTransaction` / `signMessage` / … |
| `popupWindowClose()` | Close the popup |

See the [Developer Guide](https://dcentwallet.github.io/dcent-web-connector/) for the full method + chain reference.

## v0.16.x (v1) users

v0.16.x is **frozen** (security fixes only). Existing dApps keep working:

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
