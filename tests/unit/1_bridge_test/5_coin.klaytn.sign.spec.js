const DcentWebConnector = require('../../../index')
const LOG = require('../../../src/utils/log')
const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

describe('[dcent-web-connector] Bridge - init', () => {
    let bowser
    let page
    beforeAll(async () => {
        bowser = await puppeteer.launch({
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

    it('getKlaytnSignedTransaction() - invalid coin type 1', async (done) => { 
        let coinType = 'KLAYTNNNN'
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let value = '50000000000000000'
        let data = '0x'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType ) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid coin type 2', async (done) => { 
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let value = '50000000000000000'
        let data = '0x'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType ) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid coin type 3', async (done) => { 
        let coinType = DcentWebConnector.coinType.BITCOIN
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let value = '50000000000000000'
        let data = '0x'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType ) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid nonce', async (done) => { 
        let coinType = DcentWebConnector.coinType.KLAYTN
        let nonce = '8A'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let value = '50000000000000000'
        let data = '0x'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType ) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid gasPrice', async (done) => { 
        let coinType = DcentWebConnector.coinType.KLAYTN
        let nonce = '8'
        let gasPrice = '2A000000000'
        let gasLimit = '21000'
        let to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let value = '50000000000000000'
        let data = '0x'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

        var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType ) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid gasLimit', async (done) => { 
        let coinType = DcentWebConnector.coinType.KLAYTN
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '2A000'
        let to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let value = '50000000000000000'
        let data = '0x'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

       var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType ) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid value', async (done) => { 
        let coinType = DcentWebConnector.coinType.KLAYTN
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let value = '5A000000000000000'
        let data = '0x'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

       var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType ) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid chinId', async (done) => { 
        let coinType = DcentWebConnector.coinType.KLAYTN
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let value = '50000000000000000'
        let data = '0x'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 'a'
        let txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

       var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType ) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid key path', async (done) => { 
        let coinType = DcentWebConnector.coinType.KLAYTN
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let value = '50000000000000000'
        let data = '0x'
        let key = "o/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

       var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType ) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid coin type 1', async (done) => { 
        var contract = {
            "name":"BAOBABTOKEN",
            "decimals":"8",
            "symbol":"BAO"
          }        
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        let value = '50000000000000000'
        let data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
        let from = ''
        let feeRatio = 0
        
       var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType, from, feeRatio, contract)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid coin type 2', async (done) => { 
        var contract = {
            "name":"BAOBABTOKEN",
            "decimals":"8",
            "symbol":"BAO"
          }        
        let coinType = DcentWebConnector.coinType.BITCOIN
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        let value = '50000000000000000'
        let data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
        let from = ''
        let feeRatio = 0
        
       var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType, from, feeRatio, contract)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    // it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid coin type 3', async (done) => { 
    //     var contract = {
    //         "name":"BAOBABTOKEN",
    //         "decimals":"8",
    //         "symbol":"BAO"
    //       }        
    //     let coinType = DcentWebConnector.coinType.KLAYTN
    //     let nonce = '8'
    //     let gasPrice = '25000000000'
    //     let gasLimit = '21000'
    //     let to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
    //     let value = '50000000000000000'
    //     let data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
    //     let key = "m/44'/8217'/0'/0/0"
    //     let chainId = 8217
    //     let txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
    //     let from = ''
    //     let feeRatio = 0
        
    //    var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
    //         return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
    //             data, key, chainId, txType, from, feeRatio, contract)  
    //     }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract )

    //     expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
    //     done()
    // })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid coin type 4', async (done) => { 
        var contract = {
            "name":"BAOBABTOKEN",
            "decimals":"8",
            "symbol":"BAO"
          }        
        let coinType = 'KCT-odsfsf'
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        let value = '50000000000000000'
        let data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
        let from = ''
        let feeRatio = 0
        
       var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType, from, feeRatio, contract)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid decimal of contract', async (done) => { 
        var contract = {
            "name":"BAOBABTOKEN",
            "decimals":"a1",
            "symbol":"BAO"
        }        
        let coinType = DcentWebConnector.coinType.KLAYTN_KCT
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        let value = '50000000000000000'
        let data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
        let from = ''
        let feeRatio = 0
        
       var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType, from, feeRatio, contract)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract )

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - success', async (done) => { 
        let coinType = DcentWebConnector.coinType.KLAYTN
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let value = '50000000000000000'
        let data = '0x'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

       var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType ) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType )

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
        let coinType = DcentWebConnector.coinType.KLAYTN
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        let value = '50000000000000000'
        let data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
        
       var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType)

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
            "name":"BAOBABTOKEN",
            "decimals":"8",
            "symbol":"BAO"
        }        
        let coinType = DcentWebConnector.coinType.KLAYTN_KCT
        let nonce = '8'
        let gasPrice = '25000000000'
        let gasLimit = '21000'
        let to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        let value = '50000000000000000'
        let data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        let key = "m/44'/8217'/0'/0/0"
        let chainId = 8217
        let txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
        let from = ''
        let feeRatio = 0
        
       var response = await page.evaluate( (coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value, 
                data, key, chainId, txType, from, feeRatio, contract)  
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract )

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
