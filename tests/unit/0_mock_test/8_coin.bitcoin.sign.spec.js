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

    it('getBitcoinSignedTransaction() - invalid coin type 1', async (done) => {
        var response
        try {
            const transaction = DcentWebConnector.getBitcoinTransactionObject(DcentWebConnector.coinType.ETHEREUM) 
            response = await DcentWebConnector.getBitcoinSignedTransaction(transaction)            
        } catch (e) {
            response = e            
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getBitcoinSignedTransaction() - invalid coin type 2', async (done) => {
        var response
        try {
            const transaction = DcentWebConnector.getBitcoinTransactionObject('BIT_BTE') 
            response = await DcentWebConnector.getBitcoinSignedTransaction(transaction)            
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getBitcoinSignedTransaction() - BITCOIN success', async (done) => {
        var response
        try {
            let transaction = DcentWebConnector.getBitcoinTransactionObject(DcentWebConnector.coinType.BITCOIN) 
            transaction = DcentWebConnector.addBitcoinTransactionInput(transaction, 
                '01000000013163cadbb482e229c652a09d14a5eba146581b6779181b639c6ae74c684eb4a7010000006b48304502210094b94c7694b5325d62da5d225b0be813aa0fa461658a94d25b4e8db2e90af858022031dff44a0ac5e9315ead8bd9dae125e37d369eb3af92f3104536039ea2bbebdd012103e118eaec58bc80840c234745fd27c1c37a64a035e099e1481118920575844ba5ffffffff0220a10700000000001976a914e17b0853135b205d784ad0d83a63d5b29e2b0ade88acdb230400000000001976a9148ebb5bde87ed7444b8d3e1929d12ebfbb4ba672c88ac00000000',
                1, 
                DcentWebConnector.bitcoinTxType.p2pkh, 
                "m/44'/0'/0'/1/3")
            transaction = DcentWebConnector.addBitcoinTransactionInput(transaction,
                '0100000001e297417c4607617bdb083f54b859cff3ae36c714c0f8ef6aab01c134fa2e9a4a010000006a47304402207dfeeb09c88e60d74be5d9c3e7c11d73af1cf42b8d171dbbb88321c58ab1c94402202649d517ed38c22d5a518e95b57791d1883ad76819666ea4d7c664693620d76a012102d69564b9d04220fca66d0ed68f0d5bcdeba8021bc7385e30d973be3662c71b71ffffffff02b80b0000000000001976a914705d92811e3ec14b4b90f975ef8676c56f31b63b88ac1fc70000000000001976a91440d06ce0cb98954e53d3633ca908b44293fce63b88ac00000000',
                0, 
                DcentWebConnector.bitcoinTxType.p2pkh, 
                "m/44'/0'/0'/0/7")
            transaction = DcentWebConnector.addBitcoinTransactionOutput(transaction,
                DcentWebConnector.bitcoinTxType.p2pkh,
                '10000',
                ['1Ckii7MpiquSxcmo2ch1UTfQMConz31rpB'])

             response = await DcentWebConnector.getBitcoinSignedTransaction(transaction)            
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        done()
    })

    it('getBitcoinSignedTransaction() - MONACOIN success', async (done) => {
        var response
        try {
            let transaction = DcentWebConnector.getBitcoinTransactionObject(DcentWebConnector.coinType.MONACOIN) 
            transaction = DcentWebConnector.addBitcoinTransactionInput(transaction, 
                '01000000013163cadbb482e229c652a09d14a5eba146581b6779181b639c6ae74c684eb4a7010000006b48304502210094b94c7694b5325d62da5d225b0be813aa0fa461658a94d25b4e8db2e90af858022031dff44a0ac5e9315ead8bd9dae125e37d369eb3af92f3104536039ea2bbebdd012103e118eaec58bc80840c234745fd27c1c37a64a035e099e1481118920575844ba5ffffffff0220a10700000000001976a914e17b0853135b205d784ad0d83a63d5b29e2b0ade88acdb230400000000001976a9148ebb5bde87ed7444b8d3e1929d12ebfbb4ba672c88ac00000000',
                1, 
                DcentWebConnector.bitcoinTxType.p2pkh, 
                "m/44'/0'/0'/1/3")
            transaction = DcentWebConnector.addBitcoinTransactionInput(transaction,
                '0100000001e297417c4607617bdb083f54b859cff3ae36c714c0f8ef6aab01c134fa2e9a4a010000006a47304402207dfeeb09c88e60d74be5d9c3e7c11d73af1cf42b8d171dbbb88321c58ab1c94402202649d517ed38c22d5a518e95b57791d1883ad76819666ea4d7c664693620d76a012102d69564b9d04220fca66d0ed68f0d5bcdeba8021bc7385e30d973be3662c71b71ffffffff02b80b0000000000001976a914705d92811e3ec14b4b90f975ef8676c56f31b63b88ac1fc70000000000001976a91440d06ce0cb98954e53d3633ca908b44293fce63b88ac00000000',
                0, 
                DcentWebConnector.bitcoinTxType.p2pkh, 
                "m/44'/0'/0'/0/7")
            transaction = DcentWebConnector.addBitcoinTransactionOutput(transaction,
                DcentWebConnector.bitcoinTxType.p2pkh,
                '10000',
                ['1Ckii7MpiquSxcmo2ch1UTfQMConz31rpB'])

             response = await DcentWebConnector.getBitcoinSignedTransaction(transaction)            
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
