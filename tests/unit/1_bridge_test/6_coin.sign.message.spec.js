const DcentWebConnector = require('../../../src/index')
const Values = require('../test-constants')
const puppeteer = require('puppeteer')
// const LOG = require('../../../src/utils/log')

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

    it('getSignedMessage() - current not support', async (done) => {
      
        const coinType = DcentWebConnector.coinType.KLAYTN
        const key = "m/44'/8217'/0'/0/0"
        const message = 'This is a message!!'

        var response = await page.evaluate((coinType, key, message) => {
            // eslint-disable-next-line no-undef
            return getSignedMessage(coinType, key, message)
        }, coinType, key, message)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
