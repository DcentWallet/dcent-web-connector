const DcentWebConnector = require('../../../src/index')

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
            headless: false,
        })
        page = await bowser.newPage()

        await page.goto('http://localhost:9090')
    })
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
        bowser.close()
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

    it('getHederaSignedTransaction() - success ', async (done) => {

        var transactionJson = {
            unsignedTx: '0a1a0a0c088dfbbc9006108885e6a90112080800100018d6c0151800120608001000180318c0843d22020878320072260a240a100a080800100018d6c01510ef8de29a030a100a080800100018f6a72810f08de29a03',
            path: `m/44'/3030'/0'`,
            symbol: 'HBAR',
            decimals: '8',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getHederaSignedTransaction(transactionJson)
        }, transactionJson)

        console.log('response ', response)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        expect(response.body.parameter.pubkey).toBeDefined()
        done()
    })

    it('getHederaSignedTransaction() - HTS transaction success ', async (done) => {

        var transactionJson = {
            unsignedTx: '0a190a0b08c08ebd900610b181d17212080800100018d6c0151800120608001000180318c0843d22020878320072300a00122c0a08080010001885e707120f0a080800100018d6c01510ff83af5f120f0a080800100018e6e825108084af5f',
            path: `m/44'/3030'/0'`,
            symbol: 'JAM',
            decimals: '8',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getHederaSignedTransaction(transactionJson)
        }, transactionJson)

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        expect(response.body.parameter.pubkey).toBeDefined()
        done()
    })

    it('getHederaSignedMessage() - success ', async (done) => {

        var transactionJson = {
            unsignedMsg: '19486564657261205369676e6564204d6573736167653a0a333654686973206973206865646572615f7369676e4d6573736167652773206d657373616765',
            path: `m/44'/3030'/0'`,
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getHederaSignedMessage(transactionJson)
        }, transactionJson)

        console.log('response ', response)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.SIGN_MSG)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_msg).toBeDefined()
        expect(response.body.parameter.pubkey).toBeDefined()
        done()
    })

})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
