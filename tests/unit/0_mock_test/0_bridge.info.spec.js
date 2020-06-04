const DcentWebConnector = require('../../../index')

var NilMock = require('../../../src/native/__mocks__/nil')
const Values = require('../test-constants')
var LOG = require('../../../src/utils/log')
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
    }, 100)
    setTimeout(() => {
        let messageEvent = {
            isTrusted: true,
            data: {
                event: 'BridgeEvent',
                type: 'data',
                payload: 'dcent-connected'
            }
        }
        DcentWebConnector.messageReceive(messageEvent)
    }, 300)
    
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

describe('[dcent-web-connector] MOCK - bridge timeout fail', () => {
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
    })

    it('setTimeOutMs() - fail ', async (done) => {
        var response 
        try {
            DcentWebConnector.setTimeOutMs('abc')
        } catch (e) {
            response = e
        }
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        expect(response.body.error.code).toBe('param_error')
        expect(response.body.error.message).toBeDefined()

        done()
    })
})

describe('[dcent-web-connector] MOCK - bridge timeout success', () => {
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
    })

    it('setTimeOutMs() - success ', async (done) => {
        var response 
        try {
            DcentWebConnector.setTimeOutMs(30)
            response = await DcentWebConnector.info()        
        } catch (e) {
            response = e
        }
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        expect(response.body.error.code).toBe('time_out')
        expect(response.body.error.message).toBeDefined()
        done()    
    })
})

describe('[dcent-web-connector] MOCK - bridge init', () => {
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
    })

    it('info() - success ', async (done) => {
        var response 
        try {
            DcentWebConnector.setTimeOutMs(10000)
            response = await DcentWebConnector.info()        
        } catch (e) {
            response = e
        }
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.INFO)
        expect(response.body.parameter.version).toBeDefined()
        expect(response.body.parameter.isUsbAttached).toBeTruthy()

        done()
    })

    it('popup close  - success ', async (done) => {
        let messageEvent = {
            isTrusted: true,
            data: {
                event: 'BridgeEvent',
                type: 'data',
                payload: 'popup-close'
            }
        }
        DcentWebConnector.messageReceive(messageEvent)

        expect(!DcentWebConnector.popupWindow || DcentWebConnector.popupWindow.closed).toBeTruthy()

        done()
    })

    it('window open fail ', async (done) => {
        window.open = null
        var response 
        try {
            response = await DcentWebConnector.info()        
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        expect(response.body.error.code).toBe('pop-up_blocked')
        expect(response.body.error.message).toBeDefined()

        window.open = () => {
            return null
        }
        var response 
        try {
            response = await DcentWebConnector.info()        
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        expect(response.body.error.code).toBe('pop-up_blocked')
        expect(response.body.error.message).toBeDefined()
        done()
    })
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
