const DcentWebConnector = require('../../../src/index')

const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

const TezosLib = require('@taquito/utils')

function verify (xtzTx, signature, pubkey) {
    const sig = TezosLib.b58cencode(signature.substr(2, signature.length - 2).toString(), TezosLib.prefix['edsig'])
    const enPubkey = TezosLib.b58cencode(pubkey.substr(2, pubkey.length - 2).toString(), TezosLib.prefix['edpk'])
    return TezosLib.verifySignature(xtzTx, enPubkey, sig)
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

    it('getTezosSignedTransaction() - success ', async (done) => {
        var rawData = '032923211dc76b05a644c88df7507c6f2fd5100cb6ed11c236a270d97dbd53937c6c0021298384724bff62370492fbb56f408bf6f77bcfb905b8d6f804f51219a0e7010000678a5cb8807767a9d900311890526ad77bffbb3900'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.TEZOS,
            sigHash: rawData,
            path: `m/44'/1729'/0'/0/0`,
            decimals: 6,
            fee: '00000000000002B9', // 0.000697
            symbol: 'XTZ',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getTezosSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.TEZOS, `m/44'/1729'/0'/0/0`)
        })

        console.log('response ', response)
        console.log('responseAddress ', responseAddress)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()
        const res = verify(rawData, response.body.parameter.signed_tx, responseAddress.body.parameter.pubkey)
        expect(res).toEqual(true)

        done()
    })

    it('getTezosSignedTransaction() - XTZ-FA(QUIPU) transaction success ', async (done) => {

        var rawData = '037b0bce53263cfa2b03f67f1aad1dc7db987ddf08c827f53bc653a66655e7dc5d6c0028fd10a42cf0adc6b49ed933a2d4aa22c4d540fbac08e9c98a059d286c000104fa3daf796c50d3feefd1d6065f7b5d1b6a77a100ffff087472616e736665720000004b020000004607070a00000016000028fd10a42cf0adc6b49ed933a2d4aa22c4d540fb020000002407070a0000001600003292d9c24f93f3c815f831d033581551010fda120707000000a401'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.XTZ_FA,
            sigHash: rawData,
            path: `m/44'/1729'/0'/0'`,
            decimals: 6,
            fee: '000000000000042C', // 0.001068
            symbol: 'QUIPU',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getTezosSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.TEZOS, `m/44'/1729'/0'/0'`)
        })

        console.log('response ', response)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()
        const res = verify(rawData, response.body.parameter.signed_tx, responseAddress.body.parameter.pubkey)
        expect(res).toEqual(true)

        done()
    })

})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
