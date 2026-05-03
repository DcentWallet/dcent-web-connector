# dcent-web-connector
This is package for connecting WEB and D'CENT biometric wallet.<br>
`dcent-web-connector` is modules for easy integration of D'CENT into 3rd party services.<br>
User interface is presented in a popup window served from `https://bridge.dcentwallet.com/v2`.

- [Integration](doc/index.md)

## Installation

### Node.js 
```
npm i dcent-web-connector
```

## Usage

```js
// in Node.js
const DcentWebConnector = require('dcent-web-connector')

var result
try{
    result = await DcentWebConnector.info()
    // If you want to close the popup window.
    DcentWebConnector.popupWindowClose()
}catch(e){
    result = e
}
```

## Preparence

- install `D'CENT Bridge`

    https://bridge.dcentwallet.com/v2/download

- connect D'CENT device using USB cable


## Test 

- `tests/unit/0_mock_test` is mockup test.

- `tests/unit/1_bridge_test` is test for real D'CENT Device.

### Preparence
If you want to test `tests/unit/1_bridge_test`,

- run test-server 
```
npm run dev
```

- install `D'CENT Bridge` 

    http://bridge.dcentwallet.com/v2/download

- connect D'CENT device using USB cable



### Run 
```
npm run test
```

## v2 Playground

The v2 Playground is a manual test page for the connector v2 API.

### Usage

```bash
# 1. Build the v2 bundle
yarn build

# 2. Open the playground in your browser
open index-v2.html
# Or serve locally:
# yarn dev  →  http://localhost:9090/index-v2.html
```

### Features

- **Device Indicator** — shows connection status, firmware version, and model
- **Method Tree** — browse and select connector v2 methods (`getDeviceInfo`, `signMessage`)
- **Request Log** — append-only log with JSONL export (`Copy all`)
- **Form (B1 pattern)** — per-method input form with boundary validation

> Note: `index-v2.html` and `playground.js` are excluded from the npm tarball (`.npmignore`).
