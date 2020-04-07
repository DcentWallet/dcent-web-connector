import DcentWebConnector from '../../../index'

var NilMock = require('../../../src/native/__mocks__/nil')
const Values = require('../test-constants')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

// Before TEST : Set Message Receiver and window.open
NilMock.setMessageReceiver(DcentWebConnector.messageReceive)
window.open = () => {
    // # 
    // Send Event
    setTimeout(() => {
        let messageEvent = {
            isTrusted: true,
            data: {
                event: 'BridgeEvent',
                type: 'data',
                payload: 'popup-success'
            }
        }
        DcentWebConnector.messageReceive(messageEvent)
    }, 1000)
    
    let result = {
        closed: false,
        location: {
            href: ''
        },
        postMessage: NilMock.postMessage
    }
    return result
}

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

describe('[dcent-web-connector] MOCK - coin address', () => {
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
    })

    it('getXPUB() - success ', async (done) => { 
        var response 
        try {
            response = await DcentWebConnector.getXPUB('m/44\'/0\'/0\'')
        } catch (e) {            
            response = e
        }     

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_XPUB)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.public_key).toEqual('xpub6D9VtAezPSdV4prNu6vTSvQzjFQXp3EsAhq3REM6BwzVjbCpAhPBXuQuCEBZftGiERP8uqtEbVpnUEXKCAv4aB7AfdkubLZBZuCcCy4dZtF')

        done()
    })

    it('getAddress() - invalid coin type ', async (done) => {
        var response 
        try {
            response = await DcentWebConnector.getAddress('ETHEREUM-ABCCD', "m/44'/60'/0'/0/0");  
        } catch (e) {            
            response = e
        }     

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getAddress() - success ', async (done) => {
        var response 
        try {
            response = await DcentWebConnector.getAddress(DcentWebConnector.coinType.ETHEREUM, "m/44'/60'/0'/0/0");  
        } catch (e) {            
            response = e
        }     

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_ADDRESS)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.address).toEqual('0xe5c23dAa6480e45141647E5AeB321832150a28D4')

        done()
    })
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
