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

    it('getXPUB() - invalid key path', async (done) => {
        const keyPath = '9/44\'/0\'/0\''
        var response = await page.evaluate((keyPath) => {
            // eslint-disable-next-line no-undef
            return getXpub(keyPath)
        }, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getXPUB() - invalid key path 2', async (done) => {
        const keyPath = 'm/a\'/0\'/0\''
        var response = await page.evaluate((keyPath) => {
            // eslint-disable-next-line no-undef
            return getXpub(keyPath)
        }, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getXPUB() - success', async (done) => {
        const keyPath = 'm/44\'/60\'/0\''
        var response = await page.evaluate((keyPath) => {
            // eslint-disable-next-line no-undef
            return getXpub(keyPath)
        }, keyPath)

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_XPUB)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.public_key).toBeDefined()
        expect(response.body.parameter.public_key.startsWith('xpub')).toBeTruthy()
        done()
    })

    it('getAddress() - invalid coinType ', async (done) => {
        const coinType = 'ETHEREUM-ds'
        const keyPath = "m/44'/60'/0'/0/0"
        var response = await page.evaluate((coinType, keyPath) => {
            // eslint-disable-next-line no-undef
            return getAddress(coinType, keyPath)
        }, coinType, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getAddress() - invalid keypath 1', async (done) => {
        const coinType = DcentWebConnector.coinType.ETHEREUM
        const keyPath = "k/44'/60'/0'/0/0"
        var response = await page.evaluate((coinType, keyPath) => {
            // eslint-disable-next-line no-undef
            return getAddress(coinType, keyPath)
        }, coinType, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getAddress() - invalid keypath 2', async (done) => {
        const coinType = DcentWebConnector.coinType.ETHEREUM
        const keyPath = "m/a'/60'/0'/0/0"
        var response = await page.evaluate((coinType, keyPath) => {
            // eslint-disable-next-line no-undef
            return getAddress(coinType, keyPath)
        }, coinType, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    // it('getAddress() - success ETHEREUM', async (done) => {
    //     const coinType = DcentWebConnector.coinType.ETHEREUM
    //     const keyPath = "m/44'/60'/0'/0/0"
    //     var response = await page.evaluate((coinType, keyPath) => {
    //         return getAddress(coinType, keyPath)
    //     }, coinType, keyPath)
    //     expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
    //     expect(response.body.parameter.address).toBeDefined()
    //     expect(response.body.parameter.address.startsWith('1')).toBeTruthy()
    //     done()
    // })

    it('getAddress() - success ETHEREUM', async (done) => {
        const coinType = DcentWebConnector.coinType.ETHEREUM
        const keyPath = "m/44'/60'/0'/0/0"
        var response = await page.evaluate((coinType, keyPath) => {
            // eslint-disable-next-line no-undef
            return getAddress(coinType, keyPath)
        }, coinType, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.parameter.address).toBeDefined()
        expect(response.body.parameter.address.startsWith('0x')).toBeTruthy()
        done()
    })

    it('getAddress() - success HEDERA', async (done) => {
        const coinType = DcentWebConnector.coinType.HEDERA
        const keyPath = "m/44'/3030'/0'"
        var response = await page.evaluate((coinType, keyPath) => {
            // eslint-disable-next-line no-undef
            return getAddress(coinType, keyPath)
        }, coinType, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.parameter.address).toBeDefined()
        done()
    })

})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
