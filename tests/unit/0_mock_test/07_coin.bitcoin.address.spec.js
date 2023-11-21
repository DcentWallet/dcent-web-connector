const DcentWebConnector = require('../../../src/index')

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
        const messageEvent = {
            isTrusted: true,
            data: {
                event: 'BridgeEvent',
                type: 'data',
                payload: 'popup-success',
            },
        }
        DcentWebConnector.messageReceive(messageEvent)
    }, 100)
    setTimeout(() => {
        const messageEvent = {
            isTrusted: true,
            data: {
                event: 'BridgeEvent',
                type: 'data',
                payload: 'dcent-connected',
            },
        }
        DcentWebConnector.messageReceive(messageEvent)
    }, 300)

    const result = {
        closed: false,
        location: {
            href: '',
        },
        postMessage: NilMock.postMessage,
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

    it('getAddress() - BITCOIN ', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getAddress(DcentWebConnector.coinType.BITCOIN, "m/44'/0'/0'/0/0")
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_ADDRESS)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.address.startsWith('1')).toBeTruthy()
        done()
    })

    it('getAddress() - success ', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getAddress(DcentWebConnector.coinType.MONACOIN, "m/44'/22'/0'/0/0")
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_ADDRESS)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.address.startsWith('M')).toBeTruthy()

        done()
    })
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
