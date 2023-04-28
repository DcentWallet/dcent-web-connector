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
            return getHavahSignedTransaction(transactionJson)
        }, transactionJson)

        console.log('response ', response)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()
        done()
    })

    it('getHavahSignedTransaction() - HSP20 transaction success ', async (done) => {

        var transactionJson = {
            coinType: DcentWebConnector.coinType.HAVAH_HSP20,
                sigHash: '6963785f73656e645472616e73616374696f6e2e646174612e7b6d6574686f642e7472616e736665722e706172616d732e7b5f746f2e6878656337623030666563623033393132333037306334633330383130636438636439666465623662392e5f76616c75652e30786465306236623361373634303030307d7d2e64617461547970652e63616c6c2e66726f6d2e6878653165396634626466623461316562363332323266366535653338396237386461663533323639612e6e69642e30783130312e6e6f6e63652e3078312e737465704c696d69742e30786534653163302e74696d657374616d702e3078356638663564303562623763382e746f2e6378333235313963366331316234373166663632396138656661333665633764303439393630616639382e76657273696f6e2e307833',
                path: `m/44'/858'/0'/0/0`,
                decimals: 18,
                fee: '0354a6ba7a180000',
                symbol: 'HVH',
                optionParam: '01' // Token Transfer
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getHavahSignedTransaction(transactionJson)
        }, transactionJson)

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()
        done()
    })

})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
