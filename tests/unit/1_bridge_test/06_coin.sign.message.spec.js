const DcentWebConnector = require('../../../src/index')
const Values = require('../test-constants')
const puppeteer = require('puppeteer')
// const LOG = require('../../../src/utils/log')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
const utils = require('caver-js/packages/caver-utils')
const AccountLib = require('eth-lib/lib/account')
const Hash = require('eth-lib/lib/hash')

function recover (message, signature, preFixed) {

    if (!preFixed) {
        message = hashMessage(message)
    }

    return AccountLib.recover(message, signature)
}

function hashMessage (data) {
    const message = utils.isHexStrict(data) ? utils.hexToBytes(data) : data
    const messageBuffer = Buffer.from(message)
    const preamble = `\x19Klaytn Signed Message:\n${message.length}`
    const preambleBuffer = Buffer.from(preamble)
    // klayMessage is concatenated buffer (preambleBuffer + messageBuffer)
    const klayMessage = Buffer.concat([preambleBuffer, messageBuffer])
    // Finally, run keccak256 on klayMessage.
    return Hash.keccak256(klayMessage)
}


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

    // it('getSignedMessage() - current not support', async (done) => {
      
    //     const coinType = DcentWebConnector.coinType.KLAYTN
    //     const key = "m/44'/8217'/0'/0/0"
    //     const message = 'This is a message!!'

    //     var response = await page.evaluate((coinType, key, message) => {
    //         // eslint-disable-next-line no-undef
    //         return getSignedMessage(coinType, key, message)
    //     }, coinType, key, message)

    //     expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
    //     done()
    // })

    it('getSignedMessage() - current not support', async (done) => {
      
        const coinType = DcentWebConnector.coinType.KLAYTN
        const key = "m/44'/8217'/0'/0/0"
        const message = 'This is a message!!'

        var response = await page.evaluate((coinType, key, message) => {
            // eslint-disable-next-line no-undef
            return getSignedMessage(coinType, key, message)
        }, coinType, key, message)

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.parameter.address).toBeDefined()
        expect(response.body.parameter.sign).toBeDefined()

        // value check 
        const sign = response.body.parameter.sign
        const addr = recover(message, sign)
        expect(addr).toBe(response.body.parameter.address)

        done()
    })

    
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
