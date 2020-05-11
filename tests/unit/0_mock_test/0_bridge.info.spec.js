const DcentWebConnector = require('../../../index')

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

describe('[dcent-web-connector] MOCK - bridge init', () => {
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
    })

    it('info() - success ', async (done) => {
        var response 
        try {
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
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
