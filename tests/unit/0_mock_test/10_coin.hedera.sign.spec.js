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

describe('[dcent-web-connector] MOCK - coin sign', () => {
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
    })

   
    it('getHederaSignedTransaction() -sucess ', async (done) => {
        var response
        try {
            const transactionJson = {
                unsignedTx: '0a1a0a0c088dfbbc9006108885e6a90112080800100018d6c0151800120608001000180318c0843d22020878320072260a240a100a080800100018d6c01510ef8de29a030a100a080800100018f6a72810f08de29a03',
                path: `m/44'/3030'/0'`,
                symbol: 'HBAR',
                decimals: '8',
            }
                       
            response = await DcentWebConnector.getHederaSignedTransaction(transactionJson)
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        done()
    })

    it('getHTSSignedTransaction() -sucess ', async (done) => {
        var response
        try {
            const transactionJson = {
                unsignedTx: '0a190a0b08c08ebd900610b181d17212080800100018d6c0151800120608001000180318c0843d22020878320072300a00122c0a08080010001885e707120f0a080800100018d6c01510ff83af5f120f0a080800100018e6e825108084af5f',
                path: `m/44'/3030'/0'`,
                symbol: 'JAM',
                decimals: '8',
            }
                       
            response = await DcentWebConnector.getHederaSignedTransaction(transactionJson)
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        done()
    })

    it('getHederaSignedMessage() -sucess ', async (done) => {
        var response
        try {
            const transactionJson = {
                unsignedMsg: '19486564657261205369676e6564204d6573736167653a0a333654686973206973206865646572615f7369676e4d6573736167652773206d657373616765',
                path: `m/44'/3030'/0'`,
            }
                       
            response = await DcentWebConnector.getHederaSignedMessage(transactionJson)
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        done()
    })
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
