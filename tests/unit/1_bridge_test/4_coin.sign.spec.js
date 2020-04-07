//var DcentWebConnector = require('../../../src/index')
import DcentWebConnector from '../../../src/index'
import LOG from '../../../src/utils/log'

const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

describe('[dcent-web-connector] Bridge - init', () => {
    let bowser
    let page
    beforeAll(async () => {
        let bowser = await puppeteer.launch({
            headless: false
        })
        page = await bowser.newPage();

        await page.goto('http://localhost:9090')
    })
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
        bowser.close()
    })
    
    it('getDeviceInfo() - success ', async (done) => {
        await page.exposeFunction( 'dcentGetDeviceInfo', DcentWebConnector.getDeviceInfo )
        var response = await page.evaluate( () => {
            return getInfo()        
        })
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

    it('getEthereumSignedTransaction() - invalid coin type 1', async (done) => { 
        let coinType = 'ETHEREUM-KKK'
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let to = '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B'
        let value = '100000000000000000'
        let data = '0x'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId) => {
            return getEthereumSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid coin type 2', async (done) => { 
        let coinType = DcentWebConnector.coinType.BITCOIN
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let to = '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B'
        let value = '100000000000000000'
        let data = '0x'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId) => {
            return getEthereumSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid coin type 3', async (done) => { 
        let coinType = DcentWebConnector.coinType.ERC20
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let to = '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B'
        let value = '100000000000000000'
        let data = '0x'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId) => {
            return getEthereumSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid nonce', async (done) => { 
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let nonce = '8A'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let to = '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B'
        let value = '100000000000000000'
        let data = '0x'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId) => {
            return getEthereumSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid gasPrice', async (done) => { 
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let nonce = '8'
        let gasPrice = '2A00000000'
        let gasLimit = '210000'
        let to = '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B'
        let value = '100000000000000000'
        let data = '0x'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId) => {
            return getEthereumSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid gasLimit', async (done) => { 
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '2A0000'
        let to = '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B'
        let value = '100000000000000000'
        let data = '0x'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId) => {
            return getEthereumSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid value', async (done) => { 
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let to = '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B'
        let value = 'A0000000000000000'
        let data = '0x'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId) => {
            return getEthereumSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid chinId', async (done) => { 
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let to = '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B'
        let value = '10000000000000000'
        let data = '0x'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 'a'
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId) => {
            return getEthereumSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - invalid key path', async (done) => { 
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let to = '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B'
        let value = '10000000000000000'
        let data = '0x'
        let key = "k/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId) => {
            return getEthereumSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid coin type 1', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '100000000000000000',
            symbol: 'OMG'
        }        
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid coin type 2', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '100000000000000000',
            symbol: 'OMG'
        }        
        let coinType = DcentWebConnector.coinType.BITCOIN
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid coin type 3', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '100000000000000000',
            symbol: 'OMG'
        }        
        let coinType = 'ERC20-abc'
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid decimal of contract', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: '18',
            value: '100000000000000000',
            symbol: 'OMG'
        }        
        let coinType = DcentWebConnector.coinType.ERC20
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid value of contract', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: 'a00000000000000000',
            symbol: 'OMG'
        }        
        let coinType = DcentWebConnector.coinType.ERC20
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid address of contract', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: 'E289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '1000000000000000000',
            symbol: 'OMG-abcdefghi'
        }        
        let coinType = DcentWebConnector.coinType.ERC20
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid to of contract', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x3546F6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '1000000000000000000',
            symbol: 'OMG'
        }        
        let coinType = DcentWebConnector.coinType.ERC20
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid nonce', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '1000000000000000000',
            symbol: 'OMG'
        }        
        let coinType = DcentWebConnector.coinType.ERC20
        let nonce = 'a8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid gas price', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '1000000000000000000',
            symbol: 'OMG'
        }        
        let coinType = DcentWebConnector.coinType.ERC20
        let nonce = '8'
        let gasPrice = '2A00000000'
        let gasLimit = '210000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid gas limit', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '1000000000000000000',
            symbol: 'OMG'
        }        
        let coinType = DcentWebConnector.coinType.ERC20
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '2A0000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })
    
    it('getTokenSignedTransaction() - invalid key path', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '1000000000000000000',
            symbol: 'OMG'
        }        
        let coinType = DcentWebConnector.coinType.ERC20
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let key = "k/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getTokenSignedTransaction() - invalid chainId', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '1000000000000000000',
            symbol: 'OMG'
        }        
        let coinType = DcentWebConnector.coinType.ERC20
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = '03'
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedMessage() - invalid key ', async (done) => { 

        let message = 'This is a message!'
        let key = 'k/44\'/60\'/0\'/0/0'        
        var response = await page.evaluate( (message, key) => {
            return getEthereumSignedMessage(message, key)
        }, message, key )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getEthereumSignedTransaction() - success', async (done) => { 
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let to = '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B'
        let value = '10000000000000000'
        let data = '0x'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId) => {
            return getEthereumSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId )
        //LOG.test('response = ', response)
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

    it('getTokenSignedTransaction() - success', async (done) => { 
        var contract = {
            name: 'OmiseGO',
            address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            to: '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
            decimals: 18,
            value: '1000000000000000000',
            symbol: 'OMG'
        }        
        let coinType = DcentWebConnector.coinType.ERC20
        let nonce = '8'
        let gasPrice = '2400000000'
        let gasLimit = '210000'
        let key = "m/44'/60'/0'/0/0"
        let chainId = 1
        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, key, chainId, contract ) => {
            return getTokenSignedTransaction( coinType, nonce, gasPrice, gasLimit, key, chainId, contract )
        }, coinType, nonce, gasPrice, gasLimit, key, chainId, contract  )

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

        let message = 'This is a message!'
        let key = 'm/44\'/60\'/0\'/0/0'        
        var response = await page.evaluate( (message, key) => {
            return getEthereumSignedMessage(message, key)
        }, message, key )

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
