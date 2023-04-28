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

    it('getHavahSignedTransaction() - success ', async (done) => {
        // To address: hx58321d171c8394ea440687ebb4b582b075795fc5
        // amount: 0.017088174982...
        // From address: hx1e13...b2bd
        var transactionJson = {
            coinType: DcentWebConnector.coinType.HAVAH,
            signHash: '6963785f73656e645472616e73616374696f6e2e66726f6d2e6878316531333433353935303532383335613064396137643064396533353839633433323831623262642e6e69642e30783130302e6e6f6e63652e3078312e737465704c696d69742e307831616462302e74696d657374616d702e3078356661316631343633666161302e746f2e6878353833323164313731633833393465613434303638376562623462353832623037353739356663352e76616c75652e307833636235396163376237353734652e76657273696f6e2e307833',
            path: `m/44'/858'/0'/0/0`,
            decimals: 18,
            fee: '0004e28e2290f000', // 0.001375
            symbol: 'HVH',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getUnionSignedTransaction(transactionJson)
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

    // it('getHederaSignedTransaction() - HTS transaction success ', async (done) => {

    //     var transactionJson = {
    //         unsignedTx: '0a190a0b08c08ebd900610b181d17212080800100018d6c0151800120608001000180318c0843d22020878320072300a00122c0a08080010001885e707120f0a080800100018d6c01510ff83af5f120f0a080800100018e6e825108084af5f',
    //         path: `m/44'/858'/0'/0/0`,
    //         symbol: 'PER',
    //         decimals: '8',
    //     }
    //     var response = await page.evaluate((transactionJson) => {
    //         // eslint-disable-next-line no-undef
    //         return getUnionSignedTransaction(transactionJson)
    //     }, transactionJson)

    //     expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
    //     expect(response.body.command).toBe(Values.CMD.TRANSACTION)
    //     expect(response.body.parameter).toBeDefined()
    //     // TODO: address, sign value format check !!
    //     expect(response.body.parameter.signed_tx).toBeDefined()
    //     expect(response.body.parameter.pubkey).toBeDefined()
    //     done()
    // })

})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
