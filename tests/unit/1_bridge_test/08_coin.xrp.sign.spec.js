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

    it('getXrpSignedTransaction() - invalid TransactionType', async (done) => {
        
        const transaction = {
            TransactionType: 'AccountGet',
            Account: 'rfQrsnD8ywrgSX457qshpBTDru7EDnM2Lb',
            Fee: '10',
            Sequence: 38,
            MessageKey: '02000000000000000000000000415F8315C9948AD91E2CCE5B8583A36DA431FB61',
            Flags: 2147483648,
        }
        const key = "m/44'/144'/0'/0/0"
        
        var response = await page.evaluate((transaction, key) => {
            // eslint-disable-next-line no-undef
            return getXrpSignedTransaction(transaction, key)
        }, transaction, key)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)        
        done()
    })

    it('getXrpSignedTransaction() - invalid KeyPath', async (done) => {
        
        const transaction = {
            TransactionType: 'AccountSet',
            Account: 'rfQrsnD8ywrgSX457qshpBTDru7EDnM2Lb',
            Fee: '10',
            Sequence: 38,
            MessageKey: '02000000000000000000000000415F8315C9948AD91E2CCE5B8583A36DA431FB61',
            Flags: 2147483648,
        }
        const key = "m/a'/144'/0'/0/0"
        
        var response = await page.evaluate((transaction, key) => {
            // eslint-disable-next-line no-undef
            return getXrpSignedTransaction(transaction, key)
        }, transaction, key)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)        
        done()
    })

    it('getXrpSignedTransaction() - invalid Account', async (done) => {
        
        const transaction = {
            TransactionType: 'AccountSet',
            Account: 'gfQrsnD8ywrgSX457qshpBTDru7EDnM2Lb',
            Fee: '10',
            Sequence: 38,
            MessageKey: '02000000000000000000000000415F8315C9948AD91E2CCE5B8583A36DA431FB61',
            Flags: 2147483648,
        }
        const key = "m/44'/144'/0'/0/0"
        
        var response = await page.evaluate((transaction, key) => {
            // eslint-disable-next-line no-undef
            return getXrpSignedTransaction(transaction, key)
        }, transaction, key)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)        
        done()
    })

    it('getXrpSignedTransaction() - invalid Flags', async (done) => {
        
        const transaction = {
            TransactionType: 'AccountSet',
            Account: 'rfQrsnD8ywrgSX457qshpBTDru7EDnM2Lb',
            Fee: '10',
            Sequence: 38,
            MessageKey: '02000000000000000000000000415F8315C9948AD91E2CCE5B8583A36DA431FB61',
            Flags: 147483648,
        }
        const key = "m/44'/144'/0'/0/0"
        
        var response = await page.evaluate((transaction, key) => {
            // eslint-disable-next-line no-undef
            return getXrpSignedTransaction(transaction, key)
        }, transaction, key)
        
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)        
        done()
    })

    it('getXrpSignedTransaction() - success', async (done) => {
        
        const transaction = {
            TransactionType: 'AccountSet',
            Account: 'rfQrsnD8ywrgSX457qshpBTDru7EDnM2Lb',
            Fee: '10',
            Sequence: 38,
            MessageKey: '02000000000000000000000000415F8315C9948AD91E2CCE5B8583A36DA431FB61',
            Flags: 2147483648,
        }
        const key = "m/44'/144'/0'/0/0"
        
        var response = await page.evaluate((transaction, key) => {
            // eslint-disable-next-line no-undef
            return getXrpSignedTransaction(transaction, key)
        }, transaction, key)

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
