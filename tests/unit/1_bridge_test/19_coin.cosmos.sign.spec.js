const DcentWebConnector = require('../../../src/index')

const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
import { secp256k1 } from '@noble/curves/secp256k1'
const { sha256 } = require('js-sha256')

function verify (rawMessage, signature, pubkey) {
    const hash = sha256.array(Buffer.from(rawMessage, 'hex')) 
    return secp256k1.verify(Buffer.from(signature.substr(2, signature.length - 2).toString(), 'hex'), Buffer.from(hash, 'hex'), Buffer.from(pubkey, 'hex'))
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

    it('getCosmosSignedTransaction() - success ', async (done) => {
        const rawDataStd = '0a94010a8f010a1c2f636f736d6f732e62616e6b2e763162657461312e4d736753656e64126f0a2d636f736d6f73317235763573726461377866746833686e327332367478767263726e746c646a756d74386d686c122d636f736d6f733138766864637a6a7574343467707379383034637266686e64356e713030336e7a306e663230761a0f0a057561746f6d1206313030303030120012670a500a460a1f2f636f736d6f732e63727970746f2e736563703235366b312e5075624b657912230a21'
        const rawDataPubkeyTmp = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
        const rawDataEnd = '12040a020801180a12130a0d0a057561746f6d12043530303010c09a0c1a0b636f736d6f736875622d34208f3a'
        
        var transactionJson = {
            coinType: DcentWebConnector.coinType.COSMOS,
            sigHash: rawDataStd + rawDataPubkeyTmp + rawDataEnd,
            path: `m/44'/118'/0'/0/0`,
            decimals: 6,
            fee: '0.00025', // '00000000000000FA', // '0.00025'
            symbol: 'ATOM',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getCosmosSignedTransaction(transactionJson)
        }, transactionJson)

        console.log('response ', response)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        expect(response.body.parameter.pubkey).toBeDefined()
        const pubKey = response.body.parameter.pubkey.substr(2, response.body.parameter.pubkey.length - 2).toString()
        const res = verify(rawDataStd + pubKey + rawDataEnd, response.body.parameter.signed_tx, pubKey)
        expect(res).toEqual(true)

        done()
    })

    it('getCosmosSignedTransaction() - coreum transaction success ', async (done) => {
        const rawDataStd = '0a90010a8b010a1c2f636f736d6f732e62616e6b2e763162657461312e4d736753656e64126b0a2b636f7265317432656d347a6b77346161716d7139373939656e756b66366538343577656671776e63667a78122b636f726531666c343876736e6d73647a637638357135643271347a35616a646861387975337834333537761a0f0a057561746f6d1206313030303030120012670a500a460a1f2f636f736d6f732e63727970746f2e736563703235366b312e5075624b657912230a21'
        const rawDataPubkeyTmp = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
        const rawDataEnd = '12040a020801180012130a0d0a057561746f6d12043530303010c09a0c1a0b636f736d6f736875622d342000'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.COREUM,
            sigHash: rawDataStd + rawDataPubkeyTmp + rawDataEnd,
            path: `m/44'/990'/0'/0/0`,
            decimals: 6,
            fee: '0.000251', // 00000000000000FB', // '0.000251'
            symbol: 'CORE',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getCosmosSignedTransaction(transactionJson)
        }, transactionJson)

        console.log('response ', response)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        expect(response.body.parameter.pubkey).toBeDefined()
        const pubKey = response.body.parameter.pubkey.substr(2, response.body.parameter.pubkey.length - 2).toString()
        const res = verify(rawDataStd + pubKey + rawDataEnd, response.body.parameter.signed_tx, pubKey)
        expect(res).toEqual(true)

        done()
    })

    it('getCosmosSignedTransaction() - transaction fail - invalid cointype', async (done) => {
        const rawDataStd = '0a90010a8b010a1c2f636f736d6f732e62616e6b2e763162657461312e4d736753656e64126b0a2b636f7265317432656d347a6b77346161716d7139373939656e756b66366538343577656671776e63667a78122b636f726531666c343876736e6d73647a637638357135643271347a35616a646861387975337834333537761a0f0a057561746f6d1206313030303030120012670a500a460a1f2f636f736d6f732e63727970746f2e736563703235366b312e5075624b657912230a21'
        const rawDataPubkeyTmp = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
        const rawDataEnd = '12040a020801180012130a0d0a057561746f6d12043530303010c09a0c1a0b636f736d6f736875622d342000'
        var transactionJson = {
            coinType: 'czone',
            sigHash: rawDataStd + rawDataPubkeyTmp + rawDataEnd,
            path: `m/44'/990'/0'/0/0`,
            decimals: 6,
            fee: '0.000251', 
            symbol: 'CZONE',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getCosmosSignedTransaction(transactionJson)
        }, transactionJson)

        console.log('response ', response)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)

        done()
    })


})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
