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

    it('getXrpSignedTransaction() - Mandatory field is not exist', async (done) => {
        var response
        try {
            const transaction = {
                TransactionType: 'AccountSet',
                Account: 'rfQrsnD8ywrgSX457qshpBTDru7EDnM2Lb',
                Fee: '10',
                MessageKey: '02000000000000000000000000415F8315C9948AD91E2CCE5B8583A36DA431FB61',
                Flags: 2147483648,
            }
            
            response = await DcentWebConnector.getXrpSignedTransaction(transaction, "m/44'/144'/0'/0/0")
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getXrpSignedTransaction() - invalid Fee', async (done) => {
        var response
        try {
            const transaction = {
                TransactionType: 'AccountSet',
                Account: 'rfQrsnD8ywrgSX457qshpBTDru7EDnM2Lb',
                Fee: 'dead',
                Sequence: 38,
                MessageKey: '02000000000000000000000000415F8315C9948AD91E2CCE5B8583A36DA431FB61',
                Flags: 2147483648,
            }
            response = await DcentWebConnector.getXrpSignedTransaction(transaction, "m/44'/144'/0'/0/0")
        } catch (e) {
            response = e
        }
        const message = response.body.error.message
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        expect(message.indexOf('dead')).toBeTruthy()
        done()
    })

    it('getXrpSignedTransaction() - success', async (done) => {
        var response
        try {
            const transaction = {
                TransactionType: 'AccountSet',
                Account: 'rfQrsnD8ywrgSX457qshpBTDru7EDnM2Lb',
                Fee: '10',
                Sequence: 38,
                MessageKey: '02000000000000000000000000415F8315C9948AD91E2CCE5B8583A36DA431FB61',
                Flags: 2147483648,
            }
            response = await DcentWebConnector.getXrpSignedTransaction(transaction, "m/44'/144'/0'/0/0")
        } catch (e) {
            response = e
        }
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_SIGN)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.sign).toBeDefined()
        expect(response.body.parameter.pubkey).toBeDefined()
        expect(response.body.parameter.accountId).toBeDefined()
        done()
    })
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
