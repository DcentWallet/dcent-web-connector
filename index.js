'use strict'

import {
  coinType as dcentCoinType,
  coinGroup as dcentCoinGroup,
  coinName as dcentCoinName,
  // # 
  // Now, Bitcoin Transaction not support 
  // bitcoinTxType as dcentBitcoinTxType
} from './src/type/dcent-web-type'
import {
  config as dcentConfig
} from './src/conf/dcent-web-conf'

import LOG from './src/utils/log'
import Event from 'events'

const dcent = {}

// TimeOut Default Time 
var dcentCallTimeOutMs = dcentConfig.timeOutMs

dcent.messageRequestIdx = 0
dcent.messageResponsetIdx = 0

dcent.popupWindow = undefined

dcent.dcentWebDeferred = function () {
  let localResolve
  let localReject

  const promise = new Promise(async function (resolve, reject) {
    localResolve = resolve
    localReject = reject
  })

  return {
    resolve: localResolve,
    reject: localReject,
    promise
  }
}

dcent.dcentWebPromise = dcent.dcentWebDeferred()

dcent.dcentException = function (code, message) {
  let exception = {
    'header': {
      'version': '1.0',
      'request_from': 'dcent-web',
      'status': 'error'
    },
    'body': {
      'error': {
        'code': code,
        'message': message
      }
    }
  }
  return exception
}

dcent.dcentPopupWindow = async function () {
  // popup Open
  if (!dcent.popupWindow || dcent.popupWindow.closed) {
    //var strWindowFeatures = 'width=1600, height=900, left=200, top=0'
    //var strWindowFeatures = ''
    dcent.popupWindow = window.open('', '_blank')
    if (
      !dcent.popupWindow ||
      dcent.popupWindow.closed ||
      typeof dcent.popupWindow.closed === 'undefined'
    ) {
      return {
        header: {
          version: '1.0',
          response_from: 'api',
          status: 'error'
        },
        body: {
          error: {
            code: 'pop-up_blocked',
            message: 'Pop-up blocked. Please enable pop-up'
          }
        }
      }
    }
    if (dcent.popupWindow) {
      dcent.popupWindow.location.href = dcentConfig.popUpUrl
    }
    return null
  }
}

dcent._call = function (idx, params) {
  LOG.debug('call', params)
  if (dcent.popupWindow) {
    var messageEvent = {
      idx: idx,
      event: 'BridgeRequest',
      type: 'json',
      payload: params
    }

    LOG.debug('messageSend', messageEvent)

    dcent.popupWindow.postMessage(messageEvent,
      '*'
    )
  }
  // TODO : Error  Popup is not Opened.  
}

let ee = new Event.EventEmitter()

const getEventName = (idx) => {
  let eventName = ''
  eventName = 'Dcent.Event.' + idx
  return eventName
}

dcent.call = async function (params) {

  let idx = dcent.messageRequestIdx++

  return new Promise(async (resolve, reject) => {

    LOG.debug('in Promise')
    
    if (!dcent.popupWindow || dcent.popupWindow.closed) {
      var result = await dcent.dcentPopupWindow()
      if (result !== null) {
        reject(result)
      }
    }

    dcent.dcentWebPromise.promise.then(async function () {
      LOG.debug('dcentWebPromise - resolve')
      dcent._call(idx, params)
    })

    let popUpClosedListener = () => {
      LOG.debug ('Promise - reject')
      reject(dcent.dcentException('pop-up_closed', 'Pop-up windows has been closed'))
    }

    let timeOutCall = () => {
      ee.removeListener(getEventName(idx), eventEmitListener)
      ee.removeListener('popUpClosed', popUpClosedListener)
      reject(dcent.dcentException('time_out', 'The function execution time has expired'))
    }

    let timer = setTimeout(timeOutCall, dcentCallTimeOutMs)

    let eventEmitListener = (messageEvent) => {
      clearTimeout(timer)
      ee.removeListener('popUpClosed', popUpClosedListener)
      LOG.debug('eventEmitter - emit', messageEvent)
      try {
      if (messageEvent.data.payload.header.status === "success") {
        resolve(messageEvent.data.payload)
      } else {
        reject(messageEvent.data.payload)
      }
      } catch(e) {
        LOG.error(e)
      }
    }
    ee.once('popUpClosed', popUpClosedListener)
    ee.once(getEventName(idx), eventEmitListener)

  })
}

dcent.messageReceive = function (messageEvent) {
  LOG.debug("messageReceive", messageEvent)

  if (
    messageEvent.data.event === 'BridgeEvent' &&
    messageEvent.data.type === 'data' &&
    messageEvent.data.payload === 'popup-success'
  ) {
    dcent.dcentWebPromise.resolve()
    return
  }

  if (
    messageEvent.data.event === 'BridgeEvent' &&
    messageEvent.data.type === 'data' &&
    messageEvent.data.payload === 'popup-close'
  ) {
    dcent.popupWindow = undefined
    dcent.dcentWebPromise = dcent.dcentWebDeferred()
    ee.emit('popUpClosed')
    ee.removeAllListeners()
    return
  }

  if (
    messageEvent.data.event != 'BridgeResponse' ||
    messageEvent.data.type != 'json'
  ) {
    return
  }
  let idx = messageEvent.data.idx || dcent.messageResponsetIdx++

  ee.emit(getEventName(idx), messageEvent)

}

dcent.popupWindowClose = function () {
  if (dcent.popupWindow) {
    dcent.popupWindow.postMessage({
      event: 'BridgeEvent',
      type: 'data',
      payload: 'popup-close'
    },
      '*'
    )
  }
}

window.addEventListener('message', dcent.messageReceive, false)
window.addEventListener('beforeunload', dcent.popupWindowClose)

let isNumberString = (str) => {
  if (/^[0-9]+$/.test(str)) {
    return true
  }
  return false
};

let isHexNumberString = (str) => {
  if (/^(0x)?[0-9a-f]+$/.test(str.toLowerCase())) {
    // Check if it has the basic requirements of an address
    return true
  }
  return false
};

let checkParameter = (type, param) => {
  if (type === 'numberString') {
    if (typeof param !== 'string') throw dcent.dcentException('param_error', 'Invaild Parameter') // must string

    if (param.indexOf('0x', 0) === -1) {
      // number string
      if (isNumberString(param)) return param
    } else if (param.indexOf('0x', 0) === 0) {
      // hex string
      if (isHexNumberString(param)) return param
    }
    throw dcent.dcentException('param_error', 'Invaild Parameter')
  }

}

/**
 * Returns D'CENT Bridge (Tray Daemon) status infomation.
 * 
 * @returns {Object} that Bridge Status Infomation.  
 */
dcent.info = async function () {
  return await dcent.call({
    method: 'info'
  })
}

/**
 * Set the function execution timeout time. 
 * The default value is 60000ms, that is 1 minute.
 * 
 * @param {number} timeOutMs the timeout time that the function execution. The unit is `ms`
 * @returns {Object} void on success, excption on failure.
 */
dcent.setTimeOutMs = function (timeOutMs) {
  if (typeof timeOutMs !== 'number') {
    throw dcent.dcentException('param_error', 'timeOutMs is not Number Type')
  }
  dcentCallTimeOutMs = timeOutMs
}

/**
 * Returns D'CENT Biometric Wallet status infomation.
 * 
 * @returns {Object} that Wallet device information.
 */
dcent.getDeviceInfo = async function () {
  return await dcent.call({
    method: 'getDeviceInfo'
  })
}

function isAvaliableLabel(label) {
  var regExp = /^[a-zA-Z\d.!#$%&\+\-_]{2,14}$/;
  if ( !label || !regExp.test(label) ) {
    return false
  }  
  return true
}

function isAvaliableCoinGroup (coinGroup) {
  
  if (!coinGroup) {
    return false
  }
  switch (coinGroup.toLowerCase()) {
    case dcentCoinGroup.ERC20.toLowerCase():
    case dcentCoinGroup.ERC20_KOVAN.toLowerCase():
    case dcentCoinGroup.ETHEREUM.toLowerCase():
    case dcentCoinGroup.ETHEREUM_KOVAN.toLowerCase():
    case dcentCoinGroup.RRC20.toLowerCase():
    case dcentCoinGroup.RRC20_TESTNET.toLowerCase():
    case dcentCoinGroup.RSK.toLowerCase():
    case dcentCoinGroup.RSK_TESTNET.toLowerCase():
      return true
    case dcentCoinGroup.BITCOIN.toLowerCase():
    case dcentCoinGroup.BITCOIN_TESTNET.toLowerCase():
    case dcentCoinGroup.MONACOIN.toLowerCase():
    case dcentCoinGroup.MONACOIN_TESTNET.toLowerCase():
    case dcentCoinGroup.RIPPLE.toLowerCase():
    case dcentCoinGroup.RIPPLE_TESTNET.toLowerCase():
    default:
      return false
  }
}

function isAvaliableCoinType (coinType) {
  if (!coinType) {
    return false
  }
  switch (coinType.toLowerCase()) {
    case dcentCoinType.ERC20.toLowerCase():
    case dcentCoinType.ERC20_KOVAN.toLowerCase():
    case dcentCoinType.ETHEREUM.toLowerCase():
    case dcentCoinType.ETHEREUM_KOVAN.toLowerCase():
    case dcentCoinType.RRC20.toLowerCase():
    case dcentCoinType.RRC20_TESTNET.toLowerCase():
    case dcentCoinType.RSK.toLowerCase():
    case dcentCoinType.RSK_TESTNET.toLowerCase():
      return true
    case dcentCoinType.BITCOIN.toLowerCase():
    case dcentCoinType.BITCOIN_TESTNET.toLowerCase():
    case dcentCoinType.MONACOIN.toLowerCase():
    case dcentCoinType.MONACOIN_TESTNET.toLowerCase():
    case dcentCoinType.RIPPLE.toLowerCase():
    case dcentCoinType.RIPPLE_TESTNET.toLowerCase():
    default:
      return false
  }
}

function isTokenType (coinGroup) {
  if (!coinGroup) {
    return false
  }
  switch (coinGroup.toLowerCase()) {
    case dcentCoinGroup.ERC20.toLowerCase():
    case dcentCoinGroup.ERC20_KOVAN.toLowerCase():
    case dcentCoinType.RRC20.toLowerCase():
    case dcentCoinType.RRC20_TESTNET.toLowerCase():
      return true
    default:
      return false
  }
}

/**
 * Set your label name to the D'CENT biometric Wallet. If you reboot your D'CENT, you can see the label name.
 * 
 * @param {string} label the label name of D'CENT biometric Wallet.
 * @returns {Object} set result. true, if you set completely otherwise false.
 */
dcent.setLabel = async function (label) {
  if ( !isAvaliableLabel(label) ) {
    throw dcent.dcentException('param_error', 'Invalid Label : ' + label)
  }  

  return await dcent.call({
    method: 'setLabel',
    params: {
      label: label
    }
  })
}

/**
 * Synchronize accounts between applications and Wallets. Call this function to add an account or update account information (for example, a balance or label).
 * 
 * @param {Object} accountInfos An array object for the account informations.
 * @returns {Object} sync result. true if you sync completely otherwise false.
 */
dcent.syncAccount = async function (accountInfos) {
  // check account info parameter 
  for (var i=0 ; i<accountInfos.length ; i = i + 1){
    let account = accountInfos[i]
    if ( !isAvaliableCoinGroup( account.coin_group ) ) {
      throw dcent.dcentException('coin_group_error', 'not supported coin group')
    }
    if ( !isTokenType(account.coin_group) && !isAvaliableCoinGroup( account.coin_name ) ) {
      throw dcent.dcentException('coin_name_error', 'not supported coin name')
    }
    if ( !isAvaliableLabel(account.label) ) {
      throw dcent.dcentException('param_error', 'Invalid Label - ' + account.label)
    }
  }
  return await dcent.call({
    method: 'syncAccount',
    params: {
      accountInfos: accountInfos
    }
  })
}

/**
 * Returns current account list in Wallet
 * 
 * @returns {Object} account list
 */
dcent.getAccountInfo = async function () {
  return await dcent.call({
    method: 'getAccountInfo'
  })
}

/**
 * Returns Coin address value of all coin types using string value of key path.
 * 
 * @param {string} coinType coin type. 
 * @param {string} path string value of key path to get address
 * @returns {Object} address.
 */
dcent.getAddress = async function (coinType, path) {

  if ( !isAvaliableCoinType(coinType) ) {
    throw dcent.dcentException('coin_type_error', 'not supported coin type')
  }
  
  return await dcent.call({
    method: 'getAddress',
    params: {
      coinType: coinType,
      path: path
    }
  })
}

/**
 * Returns Extended Public Key
 *
 * @param {string} key BIP44 Key Path that wants to extract public key. Must be hardened at least two depth of path. ex) m/44'/0'
 * @param {string} bip32name String to derivate BIP32 master key. Default value is "Bitcoin seed"
 * @returns {Object} XPUB
 */
dcent.getXPUB = async function (key, bip32name) {
  return await dcent.call({
    method: 'getXPUB',
    params: {
      key: key,
      bip32name: bip32name
    }
  })
}

/**
 * Returns ethereum signed transaction. If you want to get sign value of "ETHEREUM" or "RSK" transaction, must call this function.
 *
 * @param {string} coinType coin type 
 * @param {string} nonce account nonce
 * @param {string} gasPrice GAS price
 * @param {string} gasLimit GAS limit 
 * @param {string} to recipient's address
 * @param {string} value amount of ether to be sent. ( WEI unit value )
 * @param {string} data transaction data (ex: "0x")
 * @param {string} key key path (BIP44)
 * @param {number} chainId chain id
 * @returns {Object} signed transaction value
 */
dcent.getEthereumSignedTransaction = async function (
  coinType,
  nonce,
  gasPrice,
  gasLimit,
  to,
  value,
  data,
  key,
  chainId
) {

  try {
    nonce = checkParameter('numberString', nonce)
    gasPrice = checkParameter('numberString', gasPrice)
    gasLimit = checkParameter('numberString', gasLimit)
    value = checkParameter('numberString', value)
  } catch (error) {
    throw error
  }

  if (typeof chainId !== 'number') {
    throw dcent.dcentException('param_error', 'Invaild Parameter')
  }

  switch (coinType.toLowerCase()) {
    case dcentCoinType.ETHEREUM.toLowerCase():
    case dcentCoinType.ETHEREUM_KOVAN.toLowerCase():
    case dcentCoinType.RSK.toLowerCase():
    case dcentCoinType.RSK_TESTNET.toLowerCase():
      break
    default:
      throw dcent.dcentException('coin_type_error', 'not supported coin type')
  }

  return await dcent.call({
    method: 'getEthereumSignedTransaction',
    params: {
      coinType: coinType,
      nonce: nonce,
      gas_price: gasPrice,
      gas_limit: gasLimit,
      to: to,
      value: value,
      data: data,
      key: key,
      chain_id: chainId
    }
  })
}

/**
 * Returns signed value of Token transaction. If you want to get sign value of "ERC20" or "RRC20" transaction, must call this function.
 *
 * @param {string} token token(coin) type of a transaction (`ERC20` or `RRC20`). coin type 
 * @param {string} nonce account nonce
 * @param {string} gasPrice GAS price
 * @param {string} gasLimit GAS limit 
 * @param {string} key key path (BIP44)
 * @param {number} chainId chain id
 * @param {Object} contract contract Address 
 * @returns {Object} signed transaction value
 */
dcent.getTokenSignedTransaction = async function (
  token,
  nonce,
  gasPrice,
  gasLimit,
  key,
  chainId,
  contract
) {

  try {
    nonce = checkParameter('numberString', nonce)
    gasPrice = checkParameter('numberString', gasPrice)
    gasLimit = checkParameter('numberString', gasLimit)
    contract.value = checkParameter('numberString', contract.value)
  } catch (error) {
    throw error
  }

  if (
    typeof chainId !== 'number' ||
    typeof contract.decimals !== 'number'
  ) {
    throw dcent.dcentException('param_error', 'Invaild Parameter')
  }

  switch (token.toLowerCase()) {
    case dcentCoinType.ERC20.toLowerCase():
    case dcentCoinType.ERC20_KOVAN.toLowerCase():
    case dcentCoinType.RRC20.toLowerCase():
    case dcentCoinType.RRC20_TESTNET.toLowerCase():
      break
    default:
      throw dcent.dcentException('coin_type_error', 'not supported token type')
  }

  return await dcent.call({
    method: 'getTokenSignedTransaction',
    params: {
      token: token,
      nonce: nonce,
      gas_price: gasPrice,
      gas_limit: gasLimit,
      key: key,
      chain_id: chainId,
      contract: contract
    }
  })
}

/**
 * Returns Signature value that sign the user message with the corresponding private key with the given key path (BIP32) 
 * 
 * @param {string} message Message to be Signed
 * @param {string} key string value of key path to get address
 * @returns {Object} ethereum Address & Signature for user message.
 */
dcent.getEthereumSignedMessage = async function (message, key) {
  return await dcent.call({
    method: 'getEthereumSignedMessage',
    params: {
      message: message,
      key: key
    }
  })
}

dcent.coinType = dcentCoinType
dcent.coinGroup = dcentCoinGroup
dcent.coinName = dcentCoinName
// # 
// Now, Bitcoin Transaction not support 
//dcent.bitcoinTxType = dcentBitcoinTxType

const DcentWebConnector = dcent

export default DcentWebConnector// for nodejs

window.DcentWebConnector = dcent // for inline script
window.DcentWebConnector.coinType = dcentCoinType
window.DcentWebConnector.coinGroup = dcentCoinGroup
window.DcentWebConnector.coinName = dcentCoinName
// # 
// Now, Bitcoin Transaction not support 
// window.DcentWebConnector.bitcoinTxType = dcentBitcoinTxType