'use strict'

const { 
  coinType: dcentCoinType, 
  coinGroup: dcentCoinGroup, 
  coinName: dcentCoinName,
  bitcoinTxType: dcentBitcoinTxType,
  klaytnTxType: dcentKlaytnTxType,
  xrpTxType: dcentXrpTxType  
} = require('./type/dcent-web-type')

const {
  state: dcentState
} = require('./type/dcent-state')


const { config: dcentConfig } = require('./conf/dcent-web-conf')

const LOG = require('./utils/log')
const XDCPrefixConverter = require('./utils/xdc-prefix-converter')
const Event = require('events')

const dcent = {}
// TimeOut Default Time 
var dcentCallTimeOutMs = dcentConfig.timeOutMs

dcent.messageRequestIdx = 0
dcent.messageResponsetIdx = 0

dcent.popupWindow = undefined
dcent.popupTab = undefined
dcent.iframe = undefined

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
  const exception = {
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

let connectionListener = null

dcent.setConnectionListener = function (listener) {
  connectionListener = listener
}

const clearPopup = () => {
  if (dcent.popupWindow) {
    dcent.popupWindow = undefined
    if (dcent.popupTab) {
      dcent.popupTab = undefined
    }
    dcent.dcentWebPromise = dcent.dcentWebDeferred()
    ee.emit('popUpClosed')
    ee.removeAllListeners()
  }
}
const popupErrorException = (message) => {
  return {
    header: {
      version: '1.0',
      response_from: 'api',
      status: 'error'
    },
    body: {
      error: {
        code: 'pop-up_blocked',
        message: message
      }
    }
  }
}

dcent.dcentPopupWindow = async function () {
  try {
    // popup Open
    LOG.debug('dcent.dcentPopupWindow  called ')

   // eslint-disable-next-line no-undef
   const extension = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.onConnect !== 'undefined'
   if (!extension) {
      dcent.popupWindow = window.open('', '_blank')
      
      if (dcent.popupWindow) {
        LOG.debug('window.open create dcent.popupWindow opener = ', dcent.popupWindow.opener) 
        dcent.popupWindow.location.href = dcentConfig.popUpUrl
      } else {
        return popupErrorException('window is not open')
      }
   } else {
        LOG.debug('create iframe') 
        const dcentIframe = document.getElementById('dcent-connect')
        if (dcentIframe) {
          dcentIframe.parentNode.removeChild(dcentIframe)
        }
        dcent.iframe = document.createElement('iframe')
        dcent.iframe.src = dcentConfig.popUpUrl + '/iframe'
        dcent.iframe.id = 'dcent-connect'
        document.body.appendChild(dcent.iframe)
        dcent.popupWindow = dcent.iframe.contentWindow
        if (dcent.popupTab) {
          dcent.popupTab = undefined
        }
        return null
    }
  } catch (e) {
    return popupErrorException(e || e.message)
  }
  return null
}

dcent._call = function (idx, params) {
  var messageEvent = {
    idx: idx,
    event: 'BridgeRequest',
    type: 'json',
    payload: params
  }

  postMessage(messageEvent)
  // TODO : Error  Popup is not Opened.  
}

const ee = new Event.EventEmitter()

const getEventName = (idx) => {
  let eventName = ''
  eventName = 'Dcent.Event.' + idx
  return eventName
}

dcent.call = async function (params) {

  const idx = dcent.messageRequestIdx++
  
  return new Promise(async (resolve, reject) => {

    if (!dcent.popupWindow || dcent.popupWindow.closed) {
      var result = await dcent.dcentPopupWindow()
      if (result !== null) {
        reject(result)
      }
    }
   // LOG.debug('dcent.dcentWebPromise.promise - ', dcent.dcentWebPromise.promise)
    dcent.dcentWebPromise.promise.then(async function () {
       dcent._call(idx, params)
    })

    const popUpClosedListener = () => {
      reject(dcent.dcentException('pop-up_closed', 'Pop-up windows has been closed'))
    }

    const timeOutCall = () => {
      ee.removeListener(getEventName(idx), eventEmitListener)
      ee.removeListener('popUpClosed', popUpClosedListener)
      reject(dcent.dcentException('time_out', 'The function execution time has expired'))
    }

    const timer = setTimeout(timeOutCall, dcentCallTimeOutMs)

    const eventEmitListener = (messageEvent) => {
      clearTimeout(timer)
      ee.removeListener('popUpClosed', popUpClosedListener)
      LOG.debug('eventEmitter - emit', messageEvent)
      try {
      if (messageEvent.data.payload.header.status === 'success') {
        resolve(messageEvent.data.payload)
      } else {
        if (messageEvent.data.payload.body.command === 'transaction' && messageEvent.data.payload.body.error.code === 'user_cancel') {
          resolve(messageEvent.data.payload)
        } else {
          reject(messageEvent.data.payload)
        }
      }
      } catch (e) {
        // LOG.error(e)
      }
    }
    ee.once('popUpClosed', popUpClosedListener)
    ee.once(getEventName(idx), eventEmitListener)

  })
}

const createDcentTab = () => {
  LOG.debug('createDcentTab')
  if (typeof chrome === 'undefined') return

  if (dcent.popupTab !== undefined && dcent.popupTab !== null) return 

  const url = dcentConfig.popUpUrl + '?_from_extension=true'
  // eslint-disable-next-line no-undef
  chrome.windows.getCurrent(null, function (currentWindow) {
    if (currentWindow.type !== 'normal') {
      // eslint-disable-next-line no-undef
      chrome.windows.create({
        url: url
      }, function (newWindow) {
        // eslint-disable-next-line no-undef
        chrome.tabs.query({
          windowId: newWindow.id,
          active: true
        }, function (tabs) {
           LOG.debug('create window and tab')
           dcent.popupTab = tabs[0]
        })
      })
    } else {
       // eslint-disable-next-line no-undef
       chrome.tabs.query({
        currentWindow: true,
        active: true
      }, function (tabs) {
        let index = 0
        if (tabs.length > 0) {
          index = tabs[0].index + 1
        }
        // eslint-disable-next-line no-undef
        chrome.tabs.create({
          url: url,
          index: index
        }, function (tab) {
          dcent.popupTab = tab
        })
      })
    }
  })
}

dcent.messageReceive = function (messageEvent) {
  // LOG.debug("messageReceive", messageEvent)
  if (
    messageEvent.data.event === 'BridgeEvent' ||
    messageEvent.data.event === 'BridgeResponse'
  ) {
    LOG.debug('messageReceive', messageEvent)
  }

  if (
    messageEvent.data.event === 'BridgeEvent' &&
    messageEvent.data.type === 'data'
   ) {
    if (messageEvent.data.payload === 'dcent-iframe-init') {
      dcent.eventSource = messageEvent.source
      createDcentTab()
      return
    }
    if (messageEvent.data.payload === 'popup-success') {
      dcent.dcentWebPromise.resolve()
      return
    }
    if (messageEvent.data.payload === 'popup-close') {
      clearPopup()
      return
    }
    if (messageEvent.data.payload === 'dcent-connected' ||
     messageEvent.data.payload === 'dcent-disconnected') {
      if (connectionListener) {
        connectionListener(messageEvent.data.payload)
        return
      }
    }
  }

  if (
    messageEvent.data.event !== 'BridgeResponse' ||
    messageEvent.data.type !== 'json'
  ) {
    return
  }
  const idx = messageEvent.data.idx || dcent.messageResponsetIdx++

  ee.emit(getEventName(idx), messageEvent)

}

dcent.popupWindowClose = function () {
  // eslint-disable-next-line no-undef
  const extension = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.onConnect !== 'undefined'
  if (!extension) {
    postMessage({
      event: 'BridgeEvent',
      type: 'data',
      payload: 'popup-close'
    })  
  } else {
    if (dcent.popupTab && dcent.popupTab.id) {
      // eslint-disable-next-line no-undef
      chrome.tabs.remove(dcent.popupTab.id, () => {
        dcent.popupWindow = undefined
        dcent.popupTab = undefined
      })
    }
    const dcentIframe = document.getElementById('dcent-connect')
    if (dcentIframe) {
      dcentIframe.parentNode.removeChild(dcentIframe)
    }    
    clearPopup()
  }
}

const postMessage = (message) => {
  if (dcent.popupWindow) {
    try {
      let origin = '*' 
      if (dcent.iframe) {
        // eslint-disable-next-line no-useless-escape
        origin = dcent.iframe.src.match(/^.+\:\/\/[^\/]+/)[0]
      } 
      dcent.popupWindow.postMessage(message, origin)     
    } catch (e) {
      // LOG.error(e)
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', dcent.messageReceive, false)
  window.addEventListener('beforeunload', dcent.popupWindowClose)
}

const isNumberString = (str) => {
  if (/^[0-9]+$/.test(str)) {
    return true
  }
  return false
}

const isHexNumberString = (str) => {
  if (/^(0x)?[0-9a-f]+$/.test(str.toLowerCase())) {
    // Check if it has the basic requirements of an address
    return true
  }
  return false
}

const checkParameter = (type, param) => {
  if (type === 'numberString') {
    if (typeof param !== 'string') throw dcent.dcentException('param_error', 'Invaild Parameter - ' + param) // must string

    if (param.indexOf('0x', 0) === -1) {
      // number string
      if (isNumberString(param)) return param
    } else if (param.indexOf('0x', 0) === 0) {
      // hex string
      if (isHexNumberString(param)) return param
    }
    throw dcent.dcentException('param_error', 'Invaild Parameter - - - ' + param)
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

function isAvaliableLabel (label) {
  // eslint-disable-next-line no-useless-escape
  var regExp = /^[a-zA-Z\d.!#$%&\+\-_]{2,14}$/
  if (!label || !regExp.test(label)) {
    return false
  }  
  return true
}

function isAvaliableCoinGroup (coinGroup) {
  
  if (!coinGroup) {
    return false
  }
  switch (coinGroup.toLowerCase()) {
    case dcentCoinGroup.BITCOIN.toLowerCase():
    case dcentCoinGroup.BITCOIN_TESTNET.toLowerCase():
    case dcentCoinGroup.MONACOIN.toLowerCase():
    case dcentCoinGroup.MONACOIN_TESTNET.toLowerCase():    
    case dcentCoinGroup.ERC20.toLowerCase():
    case dcentCoinGroup.ERC20_KOVAN.toLowerCase():
    case dcentCoinGroup.ETHEREUM.toLowerCase():
    case dcentCoinGroup.ETHEREUM_KOVAN.toLowerCase():
    case dcentCoinGroup.RRC20.toLowerCase():
    case dcentCoinGroup.RRC20_TESTNET.toLowerCase():
    case dcentCoinGroup.RSK.toLowerCase():
    case dcentCoinGroup.RSK_TESTNET.toLowerCase():
    case dcentCoinGroup.KLAYTN.toLowerCase():
    case dcentCoinGroup.KLAY_BAOBAB.toLowerCase():
    case dcentCoinGroup.KLAYTN_KCT.toLowerCase():
    case dcentCoinGroup.KCT_BAOBAB.toLowerCase():
    case dcentCoinGroup.RIPPLE.toLowerCase():
    case dcentCoinGroup.RIPPLE_TESTNET.toLowerCase():
    case dcentCoinGroup.XDC.toLowerCase():
    case dcentCoinGroup.XDC_APOTHEM.toLowerCase():
    case dcentCoinGroup.XRC20.toLowerCase():
    case dcentCoinGroup.XRC20_APOTHEM.toLowerCase():
      return true
    default:
      return false
  }
}

function isAvaliableCoinType (coinType) {
  if (!coinType) {
    return false
  }
  switch (coinType.toLowerCase()) {
    case dcentCoinType.BITCOIN.toLowerCase():
    case dcentCoinType.BITCOIN_TESTNET.toLowerCase():
    case dcentCoinType.MONACOIN.toLowerCase():
    case dcentCoinType.MONACOIN_TESTNET.toLowerCase():
    case dcentCoinType.ETHEREUM.toLowerCase():
    case dcentCoinType.ETHEREUM_KOVAN.toLowerCase():
    case dcentCoinType.ERC20.toLowerCase():
    case dcentCoinType.ERC20_KOVAN.toLowerCase():
    case dcentCoinType.RRC20.toLowerCase():
    case dcentCoinType.RRC20_TESTNET.toLowerCase():
    case dcentCoinType.RSK.toLowerCase():
    case dcentCoinType.RSK_TESTNET.toLowerCase():
    case dcentCoinType.KLAYTN.toLowerCase():
    case dcentCoinType.KLAY_BAOBAB.toLowerCase():
    case dcentCoinType.KLAYTN_KCT.toLowerCase():
    case dcentCoinType.KCT_BAOBAB.toLowerCase():
    case dcentCoinType.RIPPLE.toLowerCase():
    case dcentCoinType.RIPPLE_TESTNET.toLowerCase():
    case dcentCoinType.XDC.toLowerCase():
    case dcentCoinType.XDC_APOTHEM.toLowerCase():
    case dcentCoinType.XRC20.toLowerCase():
    case dcentCoinType.XRC20_APOTHEM.toLowerCase():
    case dcentCoinType.HEDERA.toLowerCase():
    case dcentCoinType.HEDERA_HTS.toLowerCase():
    case dcentCoinType.HEDERA_TESTNET.toLowerCase():
    case dcentCoinType.HTS_TESTNET.toLowerCase():
      return true
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
    case dcentCoinType.KLAYTN_KCT.toLowerCase():
    case dcentCoinType.KCT_BAOBAB.toLowerCase():
    case dcentCoinGroup.XRC20.toLowerCase():
    case dcentCoinGroup.XRC20_APOTHEM.toLowerCase():
      return true
    default:
      return false
  }
}

function isBitcoinTxCoinType (coinType) {
  switch (coinType.toLowerCase()) {
    case dcentCoinType.BITCOIN.toLowerCase():
    case dcentCoinType.BITCOIN_TESTNET.toLowerCase():
    case dcentCoinType.MONACOIN.toLowerCase():
    case dcentCoinType.MONACOIN_TESTNET.toLowerCase():
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
  if (!isAvaliableLabel(label)) {
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
  for (var i = 0; i < accountInfos.length; i = i + 1) {
    const account = accountInfos[i]
    if (!isAvaliableCoinGroup(account.coin_group)) {
      throw dcent.dcentException('coin_group_error', 'not supported coin group')
    }
    if (!isTokenType(account.coin_group) && !isAvaliableCoinGroup(account.coin_name)) {
      throw dcent.dcentException('coin_name_error', 'not supported coin name')
    }
    if (!isAvaliableLabel(account.label)) {
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
 * 
 * @param {Array} addresses 
 */
dcent.selectAddress = async function (addresses) {
  if (!Array.isArray(addresses)) {
    throw dcent.dcentException('param_error', 'addresses is not array')
  }
  return await dcent.call({
    method: 'selectAddress',
    params: {
      addresses: addresses
    }
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

  if (!isAvaliableCoinType(coinType)) {
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
 * Returns a JSON Object for Bitcoin transaction.
 * @param {string} coinType coin type
 * @returns {Object} that D'CENT Bitcoin Transaction JSON Object.
 */
dcent.getBitcoinTransactionObject = function (coinType) {
  if (!isBitcoinTxCoinType(coinType)) {
    throw dcent.dcentException('coin_type_error', 'not supported coin type')
  }
  const txObject = {
    request: {
      header: {
        version: '1.0',
        request_to: ''
      },
      body: {
        command: '',
        parameter: {}
      }
    }
  }
  txObject.request.header.request_to = coinType
  txObject.request.body.command = 'transaction'
  txObject.request.body.parameter = {}
  txObject.request.body.parameter.version = 1
  txObject.request.body.parameter.locktime = 0

  return txObject
}


/**
 *  previous transaction output information to be used. Max Number of “input” is 50.
 *
 * @param {Object} transaction JSON Object Returned from getBitCoinTransaction Function
 * @param {string} prevTx Previous full transaction data. This data will be used for generating previous transaction hash, and for check the amount of coin to be sent. Raw Transaction data with Hex formatted.
 * @param {number} utxoIdx index of transaction output from prev_tx
 * @param {string} type p2pkh | p2pk | p2sh 
 * @param {string} key key path for generating signature
 * @returns {Object} setting result. if you setting completely is true otherwise false.
 */
dcent.addBitcoinTransactionInput = function (
  transaction,
  prevTx,
  utxoIdx,
  type,
  key
) {

  const parameter = transaction.request.body.parameter

  parameter.input = parameter.input || []

  parameter.input.push({
    prev_tx: prevTx,
    utxo_idx: utxoIdx,
    type: type,
    key: key
  })

  return transaction
}

/**
 * bitcoin spending information. Max number of “output” is 10.
 *
 * @param {Object} transaction JSON Object Returned from getBitCoinTransaction Function
 * @param {string} type p2pkh | p2pk | p2sh | change
 * @param {number} value amount of coin to send
 * @param {string} to address of receiver
 * @returns {Object} setting result. if you setting completely is true otherwise false.
 */
dcent.addBitcoinTransactionOutput = function (
  transaction,
  type,
  value,
  to
) {
  const parameter = transaction.request.body.parameter

  parameter.output = parameter.output || []

  parameter.output.push({
    type: type,
    value: value,
    to: to
  })

  return transaction
}

/**
 * Returns signed transaction value. If you want to get sign value of "BITCOIN" or "MONACOIN" transaction, must call this function.
 *
 * @param {Object} transaction JSON Object Returned from getBitCoinTransaction Function
 * @returns {Object} signed transaction value
 */
dcent.getBitcoinSignedTransaction = async function (transaction) {

  if (transaction === null || typeof transaction === 'undefined') {
    throw dcent.dcentException('param_error', 'transaction object is undefined or null')
  }

  LOG.debug('transaction : ', JSON.stringify(transaction))
  return await dcent.call({
    method: 'getBitcoinSignedTransaction',
    params: {
      transaction: transaction
    }
  })
}


/**
 * Returns ethereum signed transaction. If you want to get sign value of "ETHEREUM" or "RSK" transaction, must call this function.
 *
 * @param {string} coinType coin type 
 * @param {string} nonce account nonce
 * @param {string} gasPrice GAS price or maxFeePerGas(EIP1559)
 * @param {string} gasLimit GAS limit 
 * @param {string} to recipient's address
 * @param {string} value amount of ether to be sent. ( WEI unit value )
 * @param {string} data transaction data (ex: "0x")
 * @param {string} key key path (BIP44)
 * @param {number} chainId chain id
 * @param {number} txType EIP 2718 TransactionType 
 * @param {Object} typeOption EIP 2718 TransactionPayload except above parameter(nonce, ..., chainId) 
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
  chainId,
  txType = 0,
  typeOptions = {}
) {

  if (typeof chainId !== 'number' || typeof txType !== 'number' || txType < 0 || txType > 2) {
    throw dcent.dcentException('param_error', 'Invaild Parameter')
  }

  try {
    nonce = checkParameter('numberString', nonce)
    if (txType !== 2) {
      gasPrice = checkParameter('numberString', gasPrice)
    }
    gasLimit = checkParameter('numberString', gasLimit)
    value = checkParameter('numberString', value)
  } catch (error) {
    throw error
  }

  switch (coinType.toLowerCase()) {
    case dcentCoinType.ETHEREUM.toLowerCase():
    case dcentCoinType.ETHEREUM_KOVAN.toLowerCase():
    case dcentCoinType.RSK.toLowerCase():
    case dcentCoinType.RSK_TESTNET.toLowerCase():
      break
    case dcentCoinType.XDC.toLowerCase():
    case dcentCoinType.XDC_APOTHEM.toLowerCase():
      to = XDCPrefixConverter(to)
      break
    default:
      throw dcent.dcentException('coin_type_error', 'not supported coin type')
  }

  const params = {
    coinType: coinType,
    nonce: nonce,
    gas_price: gasPrice,
    gas_limit: gasLimit,
    to: to,
    value: value,
    data: data,
    key: key,
    chain_id: chainId,
    tx_type: txType,
    type_options: typeOptions
  }

  let method = 'getEthereumSignedTransaction'

  // #
  // 
  if (txType !== 0) {
    params.tx_type = txType
    params.type_options = typeOptions
    method = 'getEthereumSignedTypedTransaction'
  }

  return await dcent.call({
    method: method,
    params: params
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
    case dcentCoinGroup.KLAYTN_KCT.toLowerCase():
    case dcentCoinGroup.KCT_BAOBAB.toLowerCase():
      break
    case dcentCoinType.XRC20.toLowerCase():
    case dcentCoinType.XRC20_APOTHEM.toLowerCase():
      contract.to = XDCPrefixConverter(contract.to)
      contract.address = XDCPrefixConverter(contract.address)
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

/**
 * Returns klaytn / KCT signed transaction. If you want to get sign value of "KLAYTN" or "KCT" transaction, must call this function.
 *
 * @param {string} coinType coin type 
 * @param {string} txType transaction type 
 * @param {string} nonce account nonce
 * @param {string} gasPrice GAS price
 * @param {string} gasLimit GAS limit 
 * @param {string} to recipient's address
 * @param {string} value amount of ether to be sent. ( WEI unit value )
 * @param {string} data transaction data (ex: "0x")
 * @param {string} key key path (BIP44)
 * @param {number} chainId chain id
 * @param {string} feeRatio fee ratio
 * @returns {Object} signed transaction value
 */
dcent.getKlaytnSignedTransaction = async function (
  coinType,
  nonce,
  gasPrice,
  gasLimit,
  to,
  value,
  data,
  key,
  chainId,
  txType,
  from,  
  feeRatio,
  contract
) {
  
  try {
    nonce = checkParameter('numberString', nonce)
    gasPrice = checkParameter('numberString', gasPrice)
    gasLimit = checkParameter('numberString', gasLimit)
    value = checkParameter('numberString', value)
    if (contract) {
      contract.decimals = checkParameter('numberString', contract.decimals)
    }
  } catch (error) {
    throw error
  }
  
  if (typeof chainId !== 'number') {
    throw dcent.dcentException('param_error', 'Invaild Parameter chainId - ' + chainId)
  }
 
  switch (coinType.toLowerCase()) {
    case dcentCoinType.KLAYTN.toLowerCase():
    case dcentCoinType.KLAY_BAOBAB.toLowerCase():
      coinType = dcentCoinType.KLAYTN
      break
    case dcentCoinType.KLAYTN_KCT.toLowerCase():
    case dcentCoinType.KCT_BAOBAB.toLowerCase():
      coinType = dcentCoinType.KLAYTN_KCT
      break
    default:
      throw dcent.dcentException('coin_type_error', 'not supported coin type')
  }
  
  if (!txType) {
    txType = dcentKlaytnTxType.LEGACY
  }
  
  if (!from) {
    const addressResponse = await this.getAddress(coinType, key)
    if (addressResponse.body.parameter.address) {
      from = addressResponse.body.parameter.address
    }
  }
 
  return await dcent.call({
    method: 'getKlaytnSignedTransaction',
    params: {
      coinType: coinType,
      nonce: nonce,
      gas_price: gasPrice,
      gas_limit: gasLimit,
      to: to,
      value: value,
      data: data,
      key: key,
      chain_id: chainId,
      tx_type: txType,      
      from: from,
      fee_ratio: feeRatio,
      contract: contract,
    }
  })
}

dcent.getSignedMessage = async function (coinType, key, message) {
  return await dcent.call({
    method: 'getSignedMessage',
    params: {
      coinType: coinType,
      key: key,
      message: message,
    }
  })
}

dcent.getSignedData = async function (key, message) {
  return await dcent.call({
    method: 'getSignedData',
    params: {
      key: key,
      message: message,
    }
  })
}

/**
 * Returns XRP signData
 *
 * @param {Object} transaction to be sign
 * @param {string} key key path (BIP44) ex) "m/44'/144'/0'/0/0"
 * @returns {Object} SignData {sign:'string', pubkey:'string', accountId:'string' } in body.parameter
 */
dcent.getXrpSignedTransaction = async function (transaction, key) {
  try {
    if (typeof transaction.Account !== 'string' || typeof transaction.TransactionType !== 'string' ||
        typeof transaction.Fee !== 'string' || typeof transaction.Sequence !== 'number') {
          throw dcent.dcentException('param_error', 'TypeError: Required field type is not matched')
    }
    
    if (typeof dcentXrpTxType[transaction.TransactionType] === 'undefined') {
      throw dcent.dcentException('param_error', 'Invalid Transaction Type: ' + transaction.TransactionType)
    }

    checkParameter('numberString', transaction.Fee)
  } catch (error) {
    throw error
  }

  return await dcent.call({
    method: 'getXrpSignedTransaction',
    params: {
      key: key,
      transaction: transaction
    }
  })
}

dcent.getHederaSignedTransaction = async function ({
  unsignedTx,
  path,
  symbol,
  decimals,
}) {
  return await dcent.call({
    method: 'getHederaSignedTransaction',
    params: {
      unsigned_tx: unsignedTx,
      path,
      symbol,
      decimals,
    }
  })
}

dcent.state = dcentState
dcent.coinType = dcentCoinType
dcent.coinGroup = dcentCoinGroup
dcent.coinName = dcentCoinName
dcent.bitcoinTxType = dcentBitcoinTxType
dcent.klaytnTxType = dcentKlaytnTxType
dcent.xrpTxType = dcentXrpTxType
// # 
// Now, Bitcoin Transaction not support 
// dcent.bitcoinTxType = dcentBitcoinTxType

const DcentWebConnector = dcent

module.exports = DcentWebConnector// for nodejs

if (typeof window !== 'undefined') {
  window.DcentWebConnector = dcent // for inline script
  window.DcentWebConnector.state = dcentState
  window.DcentWebConnector.coinType = dcentCoinType
  window.DcentWebConnector.coinGroup = dcentCoinGroup
  window.DcentWebConnector.coinName = dcentCoinName
  window.DcentWebConnector.bitcoinTxType = dcentBitcoinTxType
  window.DcentWebConnector.klaytnTxType = dcentKlaytnTxType
}
