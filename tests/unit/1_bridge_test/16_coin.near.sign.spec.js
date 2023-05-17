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
            fee: '0.000860039223625', // '000000000000002e9f711d342edd9a00', // 
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

    it('getNearSignedTransaction() - near token success ', async (done) => {
        var rawData = '400000006364663837313939386530343164333037383432383063636530313362666435633764653339643264333236373262623239666163636530363333373066333200cdf871998e041d30784280cce013bfd5c7de39d2d32672bb29facce063370f32c25215a29572000014000000757364632e7370696e2d66692e746573746e6574a37a00484ecbde6e6c436dece0ce845369657857deff857a2acb645e0a20799e02000000020f00000073746f726167655f6465706f7369746a0000007b226163636f756e745f6964223a2230626238343733363130336633336265623330356432316262333235396464653666646437313764616432656562336366356137666232323730666362353866222c22726567697374726174696f6e5f6f6e6c79223a747275657d00e057eb481b00000000485637193cc34300000000000000020b00000066745f7472616e73666572610000007b2272656365697665725f6964223a2230626238343733363130336633336265623330356432316262333235396464653666646437313764616432656562336366356137666232323730666362353866222c22616d6f756e74223a22313530227d00f0ab75a40d000001000000000000000000000000000000'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.NEAR_TOKEN,
            sigHash: rawData,
            path: `m/44'/397'/0'`,
            decimals: 2,
            fee: '0.000860039223625', // '000000000000002ea3e4bd9e0b140000', // 
            symbol: 'USDC',
            optionParam: '02'
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
