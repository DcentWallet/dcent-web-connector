const DcentWebConnector = require('../../../src/index')
const Values = require('../test-constants')
const puppeteer = require('puppeteer')
// const LOG = require('../../../src/utils/log')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

describe('[dcent-web-connector] Bridge - init', () => {
    let browser
    let page
    beforeAll(async () => {
        browser = await puppeteer.launch({
            headless: false,
        })
        page = await browser.newPage()

        await page.goto('http://localhost:9090')
    })
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
        browser.close()
    })

    it('getDeviceInfo() - success ', async (done) => {
        await page.exposeFunction('dcentGetDeviceInfo', DcentWebConnector.getDeviceInfo)
        var response = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
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
        const coinType = 'KLAYTNNNN'
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const value = '50000000000000000'
        const data = '0x'
        const key = "'m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

        var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType) => {
            // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid coin type 2', async (done) => {
        const coinType = DcentWebConnector.coinType.ETHEREUM
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const value = '50000000000000000'
        const data = '0x'
        const key = "'m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

        var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType) => {
            // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid coin type 3', async (done) => {
        const coinType = DcentWebConnector.coinType.BITCOIN
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const value = '50000000000000000'
        const data = '0x'
        const key = "'m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

        var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType) => {
            // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid nonce', async (done) => {
        const coinType = DcentWebConnector.coinType.KLAYTN
        const nonce = '8A'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const value = '50000000000000000'
        const data = '0x'
        const key = "'m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

        var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType) => {
            // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid gasPrice', async (done) => {
        const coinType = DcentWebConnector.coinType.KLAYTN
        const nonce = '8'
        const gasPrice = '2A000000000'
        const gasLimit = '21000'
        const to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const value = '50000000000000000'
        const data = '0x'
        const key = "'m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

        var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType) => {
            // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid gasLimit', async (done) => {
        const coinType = DcentWebConnector.coinType.KLAYTN
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '2A000'
        const to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const value = '50000000000000000'
        const data = '0x'
        const key = "'m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

       var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType) => {
           // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid value', async (done) => {
        const coinType = DcentWebConnector.coinType.KLAYTN
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const value = '5A000000000000000'
        const data = '0x'
        const key = "'m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

       var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType) => {
           // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid chinId', async (done) => {
        const coinType = DcentWebConnector.coinType.KLAYTN
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const value = '50000000000000000'
        const data = '0x'
        const key = "'m/44'/8217'/0'/0/0"
        const chainId = 'a'
        const txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

       var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType) => {
           // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - invalid key path', async (done) => {
        const coinType = DcentWebConnector.coinType.KLAYTN
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const value = '50000000000000000'
        const data = '0x'
        const key = "o/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

       var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType) => {
           // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid coin type 1', async (done) => {
        var contract = {
            'name': 'BAOBABTOKEN',
            'decimals': '8',
            'symbol': 'BAO',
        }
        const coinType = DcentWebConnector.coinType.ETHEREUM
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        const value = '50000000000000000'
        const data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const key = "'m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
        const from = ''
        const feeRatio = 0

       var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
           // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType, from, feeRatio, contract)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid coin type 2', async (done) => {
        var contract = {
            'name': 'BAOBABTOKEN',
            'decimals': '8',
            'symbol': 'BAO',
        }
        const coinType = DcentWebConnector.coinType.BITCOIN
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        const value = '50000000000000000'
        const data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const key = "m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
        const from = ''
        const feeRatio = 0

       var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
           // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType, from, feeRatio, contract)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    // it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid coin type 3', async (done) => {
    //     var contract = {
    //         'name':'BAOBABTOKEN',
    //         'decimals':'8',
    //         'symbol':'BAO'
    //       }
    //     const coinType = DcentWebConnector.coinType.KLAYTN
    //     const nonce = '8'
    //     const gasPrice = '25000000000'
    //     const gasLimit = '21000'
    //     const to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
    //     const value = '50000000000000000'
    //     const data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
    //     const key = "'m/44'/8217'/0'/0/0"
    //     const chainId = 8217
    //     const txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
    //     const from = ''
    //     const feeRatio = 0
    //    var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
    //         return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
    //             data, key, chainId, txType, from, feeRatio, contract)
    //     }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract)

    //     expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
    //     done()
    // })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid coin type 4', async (done) => {
        var contract = {
            'name': 'BAOBABTOKEN',
            'decimals': '8',
            'symbol': 'BAO',
        }
        const coinType = 'KCT-odsfsf'
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        const value = '50000000000000000'
        const data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const key = "'m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
        const from = ''
        const feeRatio = 0
       var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
           // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType, from, feeRatio, contract)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION invalid decimal of contract', async (done) => {
        var contract = {
            'name': 'BAOBABTOKEN',
            'decimals': 'a1',
            'symbol': 'BAO',
        }
        const coinType = DcentWebConnector.coinType.KLAYTN_KCT
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        const value = '50000000000000000'
        const data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const key = "'m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
        const from = ''
        const feeRatio = 0
       var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
           // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType, from, feeRatio, contract)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getKlaytnSignedTransaction() - success', async (done) => {
        const coinType = DcentWebConnector.coinType.KLAYTN
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0xdcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const value = '50000000000000000'
        const data = '0x'
        const key = "m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.VALUE_TRANSFER

       var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType) => {
           // eslint-disable-next-line no-undef
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

    it('getKlaytnSignedTransaction() - SMART_CONTRACT_EXECUTION success 1', async (done) => {
        const coinType = DcentWebConnector.coinType.KLAYTN
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        const value = '50000000000000000'
        const data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const key = "m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION

       var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
           // eslint-disable-next-line no-undef
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
            'name': 'BAOBABTOKEN',
            'decimals': '8',
            'symbol': 'BAO',
        }
        const coinType = DcentWebConnector.coinType.KLAYTN_KCT
        const nonce = '8'
        const gasPrice = '25000000000'
        const gasLimit = '21000'
        const to = '0x52CFDA3E278837d852C4315586C9464BE762647E'
        const value = '50000000000000000'
        const data = '0xa9059cbb000000000000000000000000dcaBc4E7BD685498e8464a9CaCBf99587C74310c'
        const key = "m/44'/8217'/0'/0/0"
        const chainId = 8217
        const txType = DcentWebConnector.klaytnTxType.SMART_CONTRACT_EXECUTION
        const from = ''
        const feeRatio = 0

       var response = await page.evaluate((coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract) => {
           // eslint-disable-next-line no-undef
            return getKlaytnSignedTransaction(coinType, nonce, gasPrice, gasLimit, to, value,
                data, key, chainId, txType, from, feeRatio, contract)
        }, coinType, nonce, gasPrice, gasLimit, to, value, data, key, chainId, txType, from, feeRatio, contract)

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
