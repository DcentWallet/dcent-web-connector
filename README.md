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

## Useage

```js
// in Node.js
const DcentWebConnector = require('dcent-web-connector').default

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

    http://bridge.dcentwallet.com/v2/download

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
