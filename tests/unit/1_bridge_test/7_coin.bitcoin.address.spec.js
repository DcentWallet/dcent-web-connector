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

    it('getAddress() - success BITCOiN', async (done) => {
        const coinType = DcentWebConnector.coinType.BITCOIN
        const keyPath = "m/44'/0'/0'/0/0"
        var response = await page.evaluate((coinType, keyPath) => {
            // eslint-disable-next-line no-undef
            return getAddress(coinType, keyPath)
        }, coinType, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.parameter.address).toBeDefined()
        expect(response.body.parameter.address.startsWith('1')).toBeTruthy()
        done()
    })

    it('getAddress() - success MONACOIN', async (done) => {
        const coinType = DcentWebConnector.coinType.MONACOIN
        const keyPath = "m/44'/22'/0'/0/0"
        var response = await page.evaluate((coinType, keyPath) => {
            // eslint-disable-next-line no-undef
            return getAddress(coinType, keyPath)
        }, coinType, keyPath)

        console.log(response)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.parameter.address).toBeDefined()
        expect(response.body.parameter.address.startsWith('M')).toBeTruthy()
        done()
    })
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
