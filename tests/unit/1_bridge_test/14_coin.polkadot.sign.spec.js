const DcentWebConnector = require('../../../src/index')

const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

// const toU8a = require('@polkadot/util')
const Signature = require('@polkadot/util-crypto')

function verify (message, signature, address) {
    const { isValid } = Signature.signatureVerify(message, signature.substr(2, signature.length - 2).toString(), address)
    // const { isValid } = signatureVerify(toU8a.stringToU8a(message), toU8a.stringToU8a(signature.substr(2, signature.length - 2).toString()), address)
    return isValid
}

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

    it('getPolkadotSignedTransaction() - success ', async (done) => {
        var rawData = '040000163a5ee36b1243ce5241c0a45010dd1717869e9918c040bf5d305be4a5af9e7a0b00407a10f35a003400a223000007000000e143f23803ac50e8f6f8e62695d1ce9e4e1d68aa36c1cd2cfd15340213f3423ee143f23803ac50e8f6f8e62695d1ce9e4e1d68aa36c1cd2cfd15340213f3423e'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.POLKADOT,
            sigHash: rawData,
            path: `m/44'/354'/0'/0/0`,
            decimals: 12,
            fee: '00000000000001F4', // 0.0000000005
            symbol: 'DOT',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getPolkadotSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.POLKADOT, `m/44'/354'/0'/0/0`)
        })

        console.log('response ', response)
        console.log('responseAddress ', responseAddress)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()
        const res = verify(rawData, response.body.parameter.signed_tx, responseAddress.body.parameter.address)
        expect(res).toBeTruthy()

        done()
    })

})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
