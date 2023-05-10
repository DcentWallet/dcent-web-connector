const DcentWebConnector = require('../../../src/index')

const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

const {utils} = require('near-api-js')
const bs58Lib = require('bs58')
const { sha256 } = require('js-sha256')

function verify (message, signature, address) {
    const encodePub = bs58Lib.encode(Buffer.from(address, 'hex'))
    const publickey = utils.PublicKey.from(encodePub) // 'ed25519:' + 
    const hash = new Uint8Array(sha256.array(Buffer.from(message, 'hex')))
    const sig = Buffer.from(signature.substr(2, signature.length - 2).toString(), 'hex')

    return publickey.verify(hash, sig)
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

    it('getNearSignedTransaction() - success ', async (done) => {
        var rawData = '4000000033666164666339326631633631643261303138626166333738383566376633363331313439616331356163303438613263303137316566316661356139633366003fadfc92f1c61d2a018baf37885f7f3631149ac15ac048a2c0171ef1fa5a9c3f41b15753844300004000000033666164666339326631633631643261303138626166333738383566376633363331313439616331356163303438613263303137316566316661356139633366d5e91d9515257370e4763c0da089ca544c1292bd188ad3fee466e17024e941f40100000003000000a1edccce1bc2d3000000000000'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.NEAR,
            sigHash: rawData,
            path: `m/44'/397'/0'`,
            decimals: 24,
            fee: '000000000000002e9f711d342edd9a00', // 0.000860039.....
            symbol: 'NEAR',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getNearSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.NEAR, `m/44'/397'/0'`)
        })

        console.log('response ', response)
        console.log('responseAddress ', responseAddress)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()

        const res = verify(rawData, response.body.parameter.signed_tx, responseAddress.body.parameter.address)
        expect(res).toEqual(true)

        done()
    })

})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
