const DcentWebConnector = require('../../../index').default

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

describe('[dcent-web-connector] MOCK - coin sign', () => {
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
    })
    
    it('getEthereumSignedTransaction() - invalid coin type ', async (done) => { 
        var response 
        try {
            response = await DcentWebConnector.getEthereumSignedTransaction( 'ETHEREUM-KKK',
            '8',
            '2400000000',
            '210000',
            '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            '100000000000000000',
            '0x',
            "m/44'/60'/0'/0/0",
            42)
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid coin type ', async (done) => { 
        var response 
        try {
            response = await DcentWebConnector.getEthereumSignedTransaction( DcentWebConnector.coinType.BITCOIN,
            '8',
            '2400000000',
            '210000',
            '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            '100000000000000000',
            '0x',
            "m/44'/60'/0'/0/0",
            42)
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid nonce ', async (done) => { 
        var response 
        try {
            response = await DcentWebConnector.getEthereumSignedTransaction( DcentWebConnector.coinType.ETHEREUM,
            '8A',
            '2400000000',
            '210000',
            '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            '100000000000000000',
            '0x',
            "m/44'/60'/0'/0/0",
            42)
        } catch (e) {
            response = e
        }
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid gasprice ', async (done) => { 
        var response 
        try {
            response = await DcentWebConnector.getEthereumSignedTransaction( DcentWebConnector.coinType.ETHEREUM,
            '8',
            '2A00000000',
            '210000',
            '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            '100000000000000000',
            '0x',
            "m/44'/60'/0'/0/0",
            42)
        } catch (e) {
            response = e
        }
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid gaslimit ', async (done) => { 
        var response 
        try {
            response = await DcentWebConnector.getEthereumSignedTransaction( DcentWebConnector.coinType.ETHEREUM,
            '8',
            '2400000000',
            '2A0000',
            '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            '100000000000000000',
            '0x',
            "m/44'/60'/0'/0/0",
            42)
        } catch (e) {
            response = e
        }
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid value ', async (done) => { 
        var response 
        try {
            response = await DcentWebConnector.getEthereumSignedTransaction( DcentWebConnector.coinType.ETHEREUM,
            '8',
            '2400000000',
            '210000',
            '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            'A00000000000000000',
            '0x',
            "m/44'/60'/0'/0/0",
            42)
        } catch (e) {
            response = e
        }
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - success ', async (done) => { 
        var response 
        try {
            response = await DcentWebConnector.getEthereumSignedTransaction( DcentWebConnector.coinType.ETHEREUM,
            '8',
            '2400000000',
            '210000',
            '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            '100000000000000000',
            '0x',
            "m/44'/60'/0'/0/0",
            42)
        } catch (e) {
            response = e
        }
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !! 
        expect(response.body.parameter.signed).toBeDefined()
        expect(response.body.parameter.sign_v).toBeDefined()
        expect(response.body.parameter.sign_r).toBeDefined()
        expect(response.body.parameter.sign_s).toBeDefined()

        done()
    })

    it('getTokenSignedTransaction() - invalid coin type ', async (done) => { 

        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '100000000000000000',
            symbol: 'OMG'
        }        
        var response 
        try {
            response = await DcentWebConnector.getTokenSignedTransaction( DcentWebConnector.coinType.ETHEREUM, 
            '21', 
            '2400000000',
            '1000000', 
            "m/44'/60'/0'/0/0", 
            1, 
            contract )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid coin type ', async (done) => { 

        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '100000000000000000',
            symbol: 'OMG'
        }        
        var response 
        try {
            response = await DcentWebConnector.getTokenSignedTransaction( 'ERC20-abc', 
            '21', 
            '2400000000',
            '1000000', 
            "m/44'/60'/0'/0/0", 
            1, 
            contract )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid decimals of contract', async (done) => { 

        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 'ef',
            value: '100000000000000000',
            symbol: 'OMG'
        }        
        var response 
        try {
            response = await DcentWebConnector.getTokenSignedTransaction(  DcentWebConnector.coinType.ERC20, 
            '21', 
            '2400000000',
            '1000000', 
            "m/44'/60'/0'/0/0", 
            1, 
            contract )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid value of contract', async (done) => { 

        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: 'A0000000000000000',
            symbol: 'OMG'
        }        
        var response 
        try {
            response = await DcentWebConnector.getTokenSignedTransaction(  DcentWebConnector.coinType.ERC20, 
            '21', 
            '2400000000',
            '1000000', 
            "m/44'/60'/0'/0/0", 
            1, 
            contract )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

     it('getTokenSignedTransaction() - invalid gas price', async (done) => { 

        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '100000000000000000',
            symbol: 'OMG'
        }        
        var response 
        try {
            response = await DcentWebConnector.getTokenSignedTransaction(  DcentWebConnector.coinType.ERC20, 
            '21', 
            '2A00000000',
            '1000000', 
            "m/44'/60'/0'/0/0", 
            1, 
            contract )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid gas limit', async (done) => { 

        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '100000000000000000',
            symbol: 'OMG'
        }        
        var response 
        try {
            response = await DcentWebConnector.getTokenSignedTransaction(  DcentWebConnector.coinType.ERC20, 
            '21', 
            '2400000000',
            'A00000', 
            "m/44'/60'/0'/0/0", 
            1, 
            contract )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid nonce', async (done) => { 

        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '100000000000000000',
            symbol: 'OMG'
        }        
        var response 
        try {
            response = await DcentWebConnector.getTokenSignedTransaction(  DcentWebConnector.coinType.ERC20, 
            '2a', 
            '2400000000',
            '1000000', 
            "m/44'/60'/0'/0/0", 
            1, 
            contract )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - success ', async (done) => { 

        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '100000000000000000',
            symbol: 'OMG'
          }        
        var response 
        try {
            response = await DcentWebConnector.getTokenSignedTransaction( DcentWebConnector.coinType.ERC20, 
            '21', 
            '2400000000',
            '1000000', 
            "m/44'/60'/0'/0/0", 
            1, 
            contract )
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !! 
        expect(response.body.parameter.signed).toBeDefined()
        expect(response.body.parameter.sign).toBeDefined()
        expect(response.body.parameter.sign.sign_v).toBeDefined()
        expect(response.body.parameter.sign.sign_r).toBeDefined()
        expect(response.body.parameter.sign.sign_s).toBeDefined()
        done()
    })
  
    it('getEthereumSignedMessage() - success ', async (done) => { 

        const response = await DcentWebConnector.getEthereumSignedMessage('This is a message!', 'm/44\'/60\'/0\'/0/0')
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.MSG_SIGN)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !! 
        expect(response.body.parameter.address).toBeDefined()
        expect(response.body.parameter.sign).toBeDefined()

        done()
    })
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
