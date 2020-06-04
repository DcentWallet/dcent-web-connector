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

    it('getKlaytnSignedTransaction() - invalid coin type 1', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction('KLAYTNNNN',
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0x',
            "m/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid coin type 2', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.ETHEREUM,
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0x',
            "m/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid coin type 3', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.BITCOIN,
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0x',
            "m/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid nonce', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.KLAYTN,
            '8a',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0x',
            "m/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid gasPrice', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.KLAYTN,
            '8',
            '2A000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0x',
            "m/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid gasLimit', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.KLAYTN,
            '8',
            '25000000000',
            '2A000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0x',
            "m/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid value', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.KLAYTN,
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '5A000000000000000',
            '0x',
            "m/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid chinId', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.KLAYTN,
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0x',
            "m/44'/8217'/0'/0/0",
            'a',
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid coin type 1', async (done) => {
        var contract = {
            'name': 'BAOBABTOKEN',
            'decimals': '8',
            'symbol': 'BAO',
          }
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.ETHEREUM,
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            "o/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER,
            '',
            0,
            contract
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid coin type 2', async (done) => {
        var contract = {
            'name': 'BAOBABTOKEN',
            'decimals': '8',
            'symbol': 'BAO',
          }
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.BITCOIN,
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            "o/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER,
            '',
            0,
            contract
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid coin type 4', async (done) => {
        var contract = {
            'name': 'BAOBABTOKEN',
            'decimals': '8',
            'symbol': 'BAO',
          }
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction('KCT-odsfsf',
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            "o/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER,
            '',
            0,
            contract
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid  decimal of contract', async (done) => {
        var contract = {
            'name': 'BAOBABTOKEN',
            'decimals': 'a1',
            'symbol': 'BAO',
          }
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.KLAYTN_KCT,
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            "o/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER,
            '',
            0,
            contract
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - success', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.KLAYTN,
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0x',
            "o/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.VALUE_TRANSFER,
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.sign_v).toBeDefined()
        expect(response.body.parameter.sign_r).toBeDefined()
        expect(response.body.parameter.sign_s).toBeDefined()
        done()
    })

    it('getKlaytnSignedTransaction() - success without txType', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.KLAYTN,
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0x',
            "o/44'/8217'/0'/0/0",
            8217
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.sign_v).toBeDefined()
        expect(response.body.parameter.sign_r).toBeDefined()
        expect(response.body.parameter.sign_s).toBeDefined()
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION success 1', async (done) => {
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.KLAYTN,
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            "o/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION,
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.sign_v).toBeDefined()
        expect(response.body.parameter.sign_r).toBeDefined()
        expect(response.body.parameter.sign_s).toBeDefined()
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION success 2', async (done) => {
        var contract = {
            'name': 'BAOBABTOKEN',
            'decimals': '8',
            'symbol': 'BAO',
        }
        var response
        try {
            response = await DcentWebConnector.getKlaytnSignedTransaction(DcentWebConnector.coinType.KLAYTN_KCT,
            '8',
            '25000000000',
            '21000',
            '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            '50000000000000000',
            '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c',
            "o/44'/8217'/0'/0/0",
            8217,
            DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION,
            '',
            0,
            contract
            )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.sign_v).toBeDefined()
        expect(response.body.parameter.sign_r).toBeDefined()
        expect(response.body.parameter.sign_s).toBeDefined()
        done()
    })

})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
