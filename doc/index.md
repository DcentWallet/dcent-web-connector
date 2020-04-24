<div style="text-align: right"><img src="./image/dcent-logo.png"</img></div>
<br><br>

# DCENT Web SDK Integration Guide

<br><br>

### VERSION HISTORY
| version | date | modification |
|---|---|---|
| v0.6.2-beta | 2019. 04. 07 | First version of D'CENT Web SDK connector release |

<br><br><br>

## 1. INTRODUCTION
D'CENT Web SDK allows your web application to quickly create an wallet application using D'CENT dongle.<br>
This guide explains how to install DCENT Web SDK and use the SDK for your web wallet application.

## 2. Architecture
The figure below is a D'CENT Web SDK structure.
<div><img src="./image/dcent-web-sdk-arch.png"</img></div>
<br>

When the functions is called, if the D'CENT Bridge Service is not running as a popup, the popup window is automatically opened internally and a request to process the function is transmitted.

## 3. PACKAGES
D'CENT Web SDK includes:
- doc : Integration guide and API documentation of DCENT Web SDK.
- src : DCENT Web SDK library file.

## 4. GETTING STARTED

Developers can develop wallet application using our web sdk. Install the `dcent-web-connector` from npm repository.

```js
const DcentWebConnector = require('dcent-web-connector').default
```

Developer can access api through `window.DcentWebConnector` object or `DcentWebConnector` object.

### Requirement
- Must have a `D'CENT Biometric wallet`. You can get "Order Now" page of D'CENT homepage. (http://dcentwallet.com)
- You need to install the lastest `D'CENT Bridge`. (http://bridge.dcentwallet.com/download)
- D'CENT Biometric will be connected with your PC or Labtop using USB Cable(Micro USB 5-pin type).


## 5. DEVELOPMENT

### Functions
All API functions return a `Promise`. <br>
When function processing is completed, it is resolved. If an error occurs, it is rejected.<br>
In either case, respond with a JSON object.<br>


### Returned JSON object type
```js
{
    "header": {
        "version": "1.0",
        "request_from": "",
        "status": ""
    },
    "body": {
        "command" : "",
        "parameter" : {}
    }
}
```
<br>

### Common Errors

If D'CENT wallet isn't connected via USB, you'll get the following error:
```js
{
    "header": {
        "version": "1.0",
        "request_from": "wam",
        "status": "error"
    },
    "body": {
        "error": {
            "code": "no_device",
            "message": "D'CENT Biometric Wallet is not connected"
        }
    }
}
```

If the bridge service popup window is closed while calling a function and waiting, the following error occurs:
```js
{
    "header": {
        "version": "1.0",
        "request_from": "dcent-web",
        "status": "error"
    },
    "body": {
        "error": {
            "code": "pop-up_closed",
            "message": "Pop-up windows has been closed"
        }
    }
}
```

When executing a function that requires user authentication, an error occurs if the user cancels the authentication.
The following shows the user cancel error in the Ethereum signed Transaction.
```js
{
    "header": {
        "version": "1.0",
        "request_from": "ethereum",
        "status": "error"
    },
    "body": {
        "command": "transaction",
        "error": {
            "code": "user_cancel",
            "message": "user cancel"
        }
    }
}
```

### DcentWebConnector initialize
`dcent-web-connector` provides functions for using D'CENT Biometric Wallet.

```js
var result
try{
    result = await DcentWebConnector.info()
}catch(e){
    result = e
}
```
`info()` returns :
```js
{
    "header": {
        "version": "1.0",
        "request_from": "",
        "status": ""
    },
    "body": {
        "command" : "",
        "parameter" : {
            "version": "1.0.0",
            "isUsbAttached": "true | false"
        }
    }    
}
```

When the function is called from your web application, if D'CENT Bridge Service is not running as a pop-up, `dcent-web-connector` will automatically open a pop-up window and send a function request

### Set TimeOut Time
Sets the maximum time the function will run.
Once set the timeout Time, it is valid until the value is set again.
The default value is 60 seconds.

You can set the timeout time by calling `setTimeOutMs ()` as shown below.
```js  
  try {
    await dcent.setTimeOutMs(60000) // 60 sec, The default value is 60 seconds.
  } catch (e) {
    console.log(e)    
  }
```

All functions except setTimeOutMs function are called and then respond with `JSON Object` as below when timeout occurs.

```json
  {
    "header": {
      "version": "1.0",
      "response_from": "dcent-web",
      "status": "error"
    },
    "body": {
      "error": {
        "code": "time_out",
        "message": "The function execution time has expired"
      }
    }
  }
```

### Close pop-up window 
`dcent-web-connector` will automatically open a pop-up window and send a function request. 
After each request to device is ended, it is recommended to close popup for enhancing user experience.
```js
var result
try{
    result = await DcentWebConnector.info()
    // close pop-up window of D'CENT Bridge Service
    DcentWebConnector.popupWindowClose()
}catch(e){
    result = e
}
```


### Get Device Info
You can get connected device information using `getDeviceInfo()` function.
```js
// Get connected device information
var result
try{
    result = await DcentWebApi.getDeviceInfo()
}catch(e){
    result = e
}
```
`getDeviceInfo()` returns :
```json
{
    "header": {
        "version": "1.0",
        "response_from": "device",
        "status": "success"
    },
    "body": {
        "command": "get_info",
        "parameter": {
            "device_id": "1234567890123456789012345678901234567890123456789012345678901234",
            "fw_version": "1.2.1.7c65",
            "ksm_version": "1.0.0.1139",
            "state": "secure",
            "coin_list": [
                {
                    "name": "BITCOIN"
                },
                {
                    "name": "ETHEREUM"
                },
                {
                    "name": "ERC20"
                },
                {
                    "name": "RSK"
                },
                {
                    "name": "RRC20"
                },
                {
                    "name": "RIPPLE"
                },
                {
                    "name": "MONACOIN"
                },
                {
                    "name": "EOS"
                }
            ],
            "fingerprint": {
                "max": 2,
                "enrolled": 1
            },
            "label": "My D'CENT"
        }
    }
}
```
- deviceId : device unique identifier
- label : label of the device
- fw_Version : firmware version of the device
- ksm_Version : KSM(software running on SE) version of the device
- coin_List : the list of coin which the device supported

### Set Device Label
If you want to change the label of device, you can do it using `setLabel()` fucntion.
```js
var result
try{
    result = await DcentWebApi.setLabel("IoTrust")
}catch(e){
    result = e
}
```
After execute above code, you can see the modified label on your device when reboot the device.

### Add & Sync Account
You can add account using `syncAccount()` function. You can create an account by specifying the coin type and key path of the account you want to add.
If you want to add token type coin account, you must specify the coin name as the first 14 digits of contract address.

```js
let account_infos = [{
    coin_group: DcentWebApi.coinGroup.ETHEREUM,
    coin_name: DcentWebApi.coinName.ETHEREUM,
    label: 'ETHEREUM_1', // account label
    balance: '0 ETH', // {String} balance of account. This string will be displayed on device.
    address_path: "m/44'/60'/0'/0/0" // key path of the account. This address_path is displayed on the device with the corresponding address and QR code.
}]

var result
try{
    // Ethereum account will be created.
    result = await DcentWebApi.syncAccount(account_infos)
}catch(e){
    result = e
}
```
`syncAccount()` method can be used also for updating account. If the account of the specified key path is already exist, the `syncAccount()` method do not create account just sync the account information. For example, if you want to change the label of account or modify the balance, you can use the `syncAccount()` method.

```js
let account_infos = [{
    coin_group: DcentWebApi.coinGroup.ETHEREUM,
    coin_name: DcentWebApi.coinName.ETHEREUM,
    label: 'ETH_1', // account label
    balance: '1 ETH', // {String} balance of account. This string will be displayed on device.
    address_path: "m/44'/60'/0'/0/1" // key path of the account. This address_path is displayed on the device with the corresponding address and QR code.
}]

// This Ethereum account is already created.
// So the Ethereum account label and balance will be just modified.
var result
try{
    // Ethereum account will be updated.
    result = await DcentWebApi.syncAccount(account_infos)
}catch(e){
    result = e
}
```

### address_path
address_path follows the BIP44 rules.
```
m / purpose' / coin_type' / account' / change / address_index
```
Accounts are distinguished by `account'` in address_path.

```js
let account_infos = [{
    coin_group: DcentWebApi.coinGroup.ETHEREUM,
    coin_name: DcentWebApi.coinName.ETHEREUM,
    label: 'ETH_2', // account label
    balance: '0 ETH', // balance of account. This string will be displayed on device.
    address_path: "m/44'/60'/1'/0/0" // key path of the account. This address_path is displayed on the device with the corresponding address and QR code.
}]

var result
try{
    // A New Ethereum account is created.
    result = await DcentWebApi.syncAccount(account_infos)
}catch(e){
    result = e
}
```


### Retrieve Account
You can retrieve account list of connected device using `getAccountInfo()` function.

```js
var result
try{
    // A New Ethereum account is created.
    result = await DcentWebConnector.getAccountInfo()
}catch(e){
    result = e
}
```
Returned account object has:
```json
{
    "header": {
        "version": "1.0",
        "response_from": "coin",
        "status": "success"
    },
    "body": {
        "command": "get_account_info",
        "parameter": {
            "account": [
                {
                    "coin_group": "ETHEREUM",
                    "coin_name": "ETHEREUM",
                    "label": "eth_1",
                    "address_path": "m/44'/60'/0'/0/0"                    
                }
            ]
        }
    }
}
```
- label : label of account
- coinGroup : coin group name of account
- coinName : coin name of account
- addressPath : address path of account

### Get Address
You can get address of account using `getAddress()` function.
```js
var coinType = DcentWebConnector.coinType.ETHEREUM
var keyPath = "m/44'/60'/0'/0/0" // key path of the account

var result
try{
    // Get Ethereum Address corresponding to keyPath
    result = await DcentWebConnector.getAddress(coinType, keyPath)
}catch(e){
    result = e
}
```

### Get XPUB
You can get xpub using `getXPUB()` function.
The BIP32 key pass must be at least 2 depth or more.
```js
var keyPath = "m/44'/0'" // key path of the account

var result
try{
    // Get extended public key corresponding to keyPath
    result = await DcentWebConnector.getXPUB(keyPath)
}catch(e){
    result = e
}
```

### Ethereum Signed Massage
You can get a signature value to sign a user message with that private key With a given key path (BIP32).
```js
var message = 'This is a message!'
var result
try {
    result = await dcent.getEthereumSignedMessage(message, "m/44'/60'/0'/0/0");
} catch (e) {
    console.log(e)
    result = e
}
```

### Signed Transaction
The D'CENT Web SDK provides functions for signing transaction of coins.
- ETHEREUM, RSK : getEthereumSignedTransaction()
- ERC20, RRC20 : getTokenSignedTransaction()

Call the function that matches the type of signed transaction you want to get.

Please Refer to the `index.html` to learn more about how to use the SDK APIs. There is an Web project using our Web SDK.
