/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

import LOG from '../../utils/log'
import Method from '../request-method'
import NilConfBridge from './config/nil.conf.bridge.default.js'
import NilConfDevice from './config/nil.conf.device.default.js'

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

const defaultBridgeResponse = NilConfBridge.defaultBridgeResponse
const defaultDeviceResponse = NilConfDevice.defaultDeviceResponse

const requestToBridge = (payload) => {
  let response = ''
  const method = payload.method
  switch (method) {
    case Method.INFO:
        response = defaultBridgeResponse.info
        break
    case Method.GET_DEVICE_INFO:
        response = defaultDeviceResponse.getInfo
        break
    case Method.SET_LABEL:
        response = defaultDeviceResponse.setLabel
        break
    case Method.SYNC_ACCOUNT:
        response = defaultDeviceResponse.syncAccount
        break
    case Method.GET_ACCOUNT_INFO:
        response = defaultDeviceResponse.getAccountInfo
        break
    case Method.GET_XPUB:
        response = defaultDeviceResponse.getXpub
        break
    case Method.GET_ADDRESS:
        switch (payload.params.coinType) {
            case 'bitcoin':
                response = defaultDeviceResponse.getAddressBtc
                break
            case 'ethereum':
                response = defaultDeviceResponse.getAddressEth
                break
            case 'monacoin':
                response = defaultDeviceResponse.getAddressMona
                break
            default:
                response = defaultDeviceResponse.getAddressEth // default mock 
                break
        }
        break
    case Method.GET_ETH_SIGN_TX:
        response = defaultDeviceResponse.getEthereumSignedTransaction
        break
    case Method.GET_ETH_TOKEN_SIGN_TX:
        response = defaultDeviceResponse.getTokenSignedTransaction
        break
    case Method.GET_ETH_SIGN_MSG:
        response = defaultDeviceResponse.getEthereumSignedMessage
        break
    case Method.GET_KLAY_SIGN_TX:
        response = defaultDeviceResponse.getKlaytnSignedTransaction
        break
    case Method.GET_SIGN_MSG:
        response = defaultDeviceResponse.getSignedMessage
        break
    case Method.GET_BTC_SIGN_TX:
        response = defaultDeviceResponse.getBitcoinSignedTransaction
        break
    default:
        response = 'error'
      throw new Error('Not implemented Method in Mock : ' + method)
  }
  return response
}


let messageReceiver
const setMessageReceiver = (mr) => {
    messageReceiver = mr
}

const postMessage = (message) => {
    let respPayload

    LOG.debug('message.event = ', message.event)
    LOG.debug('message.type = ', message.type)
    LOG.debug('message.payload = ', message.payload)
    if (message.event === 'BridgeRequest') {
       respPayload = requestToBridge(message.payload)
    }
    LOG.debug('respPayload = ', respPayload)

    setTimeout(() => {
        if (typeof respPayload === 'undefined') {
            // reject(new Error('fake Error'))
            // send error response
            respPayload = {
                header: {
                    version: '1.0',
                    response_from: 'device',
                    status: 'error',
                },
                body: {
                    error: {
                        code: '',
                        message: 'Device is not attached',
                    },
                },
            }
        }
        const response = {
            isTrusted: true,
            data: {
                event: 'BridgeResponse',
                type: 'json',
                payload: respPayload,
            },
        }
        messageReceiver(response)
    }, 1000)
  }

module.exports = {
    postMessage,
    setMessageReceiver,
}

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
