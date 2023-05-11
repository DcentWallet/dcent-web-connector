const DcentWebConnector = require('../../../src/index')

const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
const { secp256k1, blake2b256, address } = require('thor-devkit')

function verify (message, signature, addr) {
    const sig = (signature.substr(2, signature.length - 2)).toString()
    const recoverPubkey = secp256k1.recover(blake2b256(Buffer.from(message, 'hex')), Buffer.from(sig, 'hex'))
    const recoverAddress = address.fromPublicKey(recoverPubkey)
    
    return addr.toLowerCase() === recoverAddress.toLowerCase()
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

    it('getVechainSignedTransaction() - success ', async (done) => {
        const rawData = 'f83b2787c6143a04c08fe18202d0e1e094a57105e43efa47e787d84bb6dfedb19bdcaa8a908908e3f50b173c100001808082520880860152671166bdc0'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.VECHAIN,
            sigHash: rawData,
            path: `m/44'/818'/0'/0/0`,
            decimals: 18,
            fee: '0.21', // '02ea11e32ad50000', // 0.21
            symbol: 'VET',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getVechainSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.VECHAIN, `m/44'/818'/0'/0/0`)
        })

        console.log('response ', response)
        console.log('responseAddress ', responseAddress)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()
        expect(responseAddress.body.parameter).toBeDefined()
        const res = verify(rawData, response.body.parameter.signed_tx, responseAddress.body.parameter.address)
        expect(res).toEqual(true)

        done()
    })

    it('getVechainSignedTransaction() - vechain erc20 transaction success ', async (done) => {
        const rawData = 'f8762787c4c9aecf5782e910f85ef85c940000000000000000000000000000456e6572677980b844a9059cbb0000000000000000000000001f6a5679de62414e4e6f2d7ea7a68d577687480a0000000000000000000000000000000000000000000000000de0b6b3a764000080825a988085a87ddd6b7bc0'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.VECHAIN_ERC20,
            sigHash: rawData,
            path: `m/44'/818'/0'/0/0`,
            decimals: 18,
            fee: '0.24', // '0354a6ba7a180000', // 0.24
            symbol: 'VTHO',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getVechainSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.VECHAIN, `m/44'/818'/0'/0/0`)
        })

        console.log('response ', response)
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
