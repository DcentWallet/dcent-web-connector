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

describe('[dcent-web-connector] MOCK - device init', () => {
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
    })
    
    it('getDeviceInfo() - success ', async (done) => {
        var response 
        try {
            response = await DcentWebConnector.getDeviceInfo()
        } catch (e) {
            response = e
        }
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_INFO)
        expect(response.body.parameter.device_id).toBeDefined()
        expect(response.body.parameter.fw_version).toBeDefined()
        expect(response.body.parameter.ksm_version).toBeDefined()
        expect(response.body.parameter.state).toBeDefined()
        expect(response.body.parameter.coin_list).toBeDefined()
        expect(response.body.parameter.label).toBeDefined()

        done()
    })

    it('setLabel() - with Invalid label length ', async (done) => {
        var response 
        try {
            response = await DcentWebConnector.setLabel('AbcdeFghijkLMNOPQRS12345') 
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('setLabel() - with null label ', async (done) => {
        var response 
        try {
            response = await DcentWebConnector.setLabel()    
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('setLabel() - with Invalid charactor label ', async (done) => {
        var response 
        try {
            response = await DcentWebConnector.setLabel(';;;;;;;;')      
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('setLabel() - success ', async (done) => {
        var response 
        try {
            response = await DcentWebConnector.setLabel('IoTrust')        
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.SET_LABEL)

        done()
    })
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
