/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

const DcentWebConnector = require('../../../src/index')
const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

import pkg from 'hi-base32'
const { decode } = pkg
const nacl = require('tweetnacl')

function getPubKey (address) {  
    const decoded = decode.asBytes(address)
    return decoded.slice(0, 32)
}

function verify (message, signature, address) {
    const recPub = getPubKey(address)
    return nacl.sign.detached.verify(new Uint8Array(Buffer.from(message, 'hex')), new Uint8Array(Buffer.from(signature.substr(2, signature.length - 2), 'hex')), new Uint8Array(recPub))
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

    it('getAlgorandSignedTransaction() - success ', async (done) => {
        const rawData = '54588aa3616d74cf000000174876e800a3666565cd03e8a26676ce01f60f1ca367656eac746573746e65742d76312e30a26768c4204863b518a4b3c84ec810f22d4f1081cb0f71f059a7ac20dec62f7f70e5093a22a26c76ce01f61304a46e6f7465c4084669727374205478a3726376c420568d5f7efc21a0928e50234dfa58764a84128d1c127971f6a26f350500d0ce24a3736e64c420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a474797065a3706179'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.ALGORAND,
            sigHash: rawData,
            path: `m/44'/283'/0'/0/0`,
            decimals: 6,
            fee: '0.001', // '0004e28e2290f000', // 
            symbol: 'ALGO',
            optionParam: '00' // Algorand Transfer
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getAlgorandSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.ALGORAND, `m/44'/283'/0'/0/0`)
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
        expect(res).toEqual(true)
        done()
    })

    it('getAlgorandSignedTransaction() - ASSET transaction success(trsansfer) ', async (done) => {
        const rawData = '54588aa461616d7464a461726376c420568d5f7efc21a0928e50234dfa58764a84128d1c127971f6a26f350500d0ce24a3666565cd03e8a26676ce01f618f6a367656eac746573746e65742d76312e30a26768c4204863b518a4b3c84ec810f22d4f1081cb0f71f059a7ac20dec62f7f70e5093a22a26c76ce01f61cdea3736e64c420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a474797065a56178666572a478616964ce11fb87c5'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.ALGORAND_ASSET,
            sigHash: rawData,
            path: `m/44'/283'/0'/0/0`,
            decimals: 2,
            fee: '0.001', // '0354a6ba7a180000', // 
            symbol: 'DTN',
            optionParam: '01' // FT Transfer
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getAlgorandSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.ALGORAND, `m/44'/283'/0'/0/0`)
        })

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()

        const res = verify(rawData, response.body.parameter.signed_tx, responseAddress.body.parameter.address)
        expect(res).toEqual(true)

        done()
    })

    it('getAlgorandSignedTransaction() - ASSET OPTIN transaction success', async (done) => {
        const rawData = '545889a461726376c4201474f393e0b165ba4551256c5f4b4929248b7bd52fe965648009f3461fef3063a3666565cd03e8a26676ce01f61771a367656eac746573746e65742d76312e30a26768c4204863b518a4b3c84ec810f22d4f1081cb0f71f059a7ac20dec62f7f70e5093a22a26c76ce01f61b59a3736e64c420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a474797065a56178666572a478616964ce009f973d'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.ALGORAND_ASSET,
            sigHash: rawData,
            path: `m/44'/283'/0'/0/0`,
            decimals: 2,
            fee: '0.001', // '0354a6ba7a180000', // 
            symbol: 'DTN',
            optionParam: '02' // NFT Transfer
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getAlgorandSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.ALGORAND, `m/44'/283'/0'/0/0`)
        })

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()

        const res = verify(rawData, response.body.parameter.signed_tx, responseAddress.body.parameter.address)
        expect(res).toEqual(true)

        done()
    })

    it('getAlgorandSignedTransaction() - APP Contract call transaction success', async (done) => {
        const rawData = '545889a46170616191c43a5475652053657020313220323032332031353a34303a343220474d542b303930302028eb8c80ed959cebafbceab5ad20ed919ceca480ec8b9c29a461706964ce068fee9aa3666565cd03e8a26676ce01f6204fa367656eac746573746e65742d76312e30a26768c4204863b518a4b3c84ec810f22d4f1081cb0f71f059a7ac20dec62f7f70e5093a22a26c76ce01f62437a3736e64c420568d5f7efc21a0928e50234dfa58764a84128d1c127971f6a26f350500d0ce24a474797065a46170706c'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.ALGORAND_APP,
            sigHash: rawData,
            path: `m/44'/283'/0'/0/0`,
            decimals: 2,
            fee: '0.001', // '0354a6ba7a180000', // 
            symbol: 'DTN',
            optionParam: '03' // Contract call
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getAlgorandSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.ALGORAND, `m/44'/283'/0'/0/0`)
        })

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()

        const res = verify(rawData, response.body.parameter.signed_tx, responseAddress.body.parameter.address)
        expect(res).toEqual(true)

        done()
    })

    it('getAlgorandSignedTransaction() - APP OPTIN transaction success', async (done) => {
        const rawData = '545889a46170616e01a461706964ce068fee9aa3666565cd03e8a26676ce01f61f1ba367656eac746573746e65742d76312e30a26768c4204863b518a4b3c84ec810f22d4f1081cb0f71f059a7ac20dec62f7f70e5093a22a26c76ce01f62303a3736e64c420568d5f7efc21a0928e50234dfa58764a84128d1c127971f6a26f350500d0ce24a474797065a46170706c'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.ALGORAND_APP,
            sigHash: rawData,
            path: `m/44'/283'/0'/0/0`,
            decimals: 2,
            fee: '0.001', // '0354a6ba7a180000', // 
            symbol: 'DTN',
            optionParam: '04' // Token Deploy
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getAlgorandSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.ALGORAND, `m/44'/283'/0'/0/0`)
        })

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()

        const res = verify(rawData, response.body.parameter.signed_tx, responseAddress.body.parameter.address)
        expect(res).toEqual(true)

        done()
    })

    it('getAlgorandSignedTransaction() - ASSET FT Create transaction success', async (done) => {
        const rawData = '545888a46170617288a2616eb04443656e742054657374204173736574a163c420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a2646302a166c420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a16dc420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a172c420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a174ce000186a0a2756ea56463656e74a3666565cd03e8a26676ce0209ca75a367656eac746573746e65742d76312e30a26768c4204863b518a4b3c84ec810f22d4f1081cb0f71f059a7ac20dec62f7f70e5093a22a26c76ce0209ce5da3736e64c420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a474797065a461636667'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.ALGORAND_ASSET,
            sigHash: rawData,
            path: `m/44'/283'/0'/0/0`,
            decimals: 2,
            fee: '0.001', // '0354a6ba7a180000', // 
            symbol: 'dcent',
            optionParam: '05'
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getAlgorandSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.ALGORAND, `m/44'/283'/0'/0/0`)
        })

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()

        const res = verify(rawData, response.body.parameter.signed_tx, responseAddress.body.parameter.address)
        expect(res).toEqual(true)

        done()
    })

    it('getAlgorandSignedTransaction() - ASSET NFT Create transaction success', async (done) => {
        const rawData = '545889a46170617288a2616eae4443656e7420417374726f202331a26175d942697066733a2f2f62616679626569687633653637796d77376463676132646c3568343467736f69676e646c706e79366172626b326f6b6732676167327964696d6765a163c420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a166c420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a16dc420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a172c420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a1740aa2756ea3444341a3666565cd03e8a26676ce0209ca8fa367656eac746573746e65742d76312e30a26768c4204863b518a4b3c84ec810f22d4f1081cb0f71f059a7ac20dec62f7f70e5093a22a26c76ce0209ce77a46e6f7465c4c37b226e616d65223a224443656e7420417374726f202331222c226465736372697074696f6e223a224443656e74204e46542054657374202d20417374726f2c20416e204e465420436f6c6c656374696f6e222c22646563696d616c73223a302c22756e69744e616d65223a22444341222c22696d6167655f6d696d6574797065223a22696d6167652f706e67222c2270726f70657274696573223a7b224c6f676f223a224443656e744e4654222c224261636b67726f756e64223a22436f6465227d7da3736e64c420302be92b2e5fb14e540554f3b652c0350fcc77ea53488fed81c97555179040c8a474797065a461636667'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.ALGORAND_ASSET,
            sigHash: rawData,
            path: `m/44'/283'/0'/0/0`,
            decimals: 0,
            fee: '0.001', // '0354a6ba7a180000', // 
            symbol: 'DCA',
            optionParam: '06' // 
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getAlgorandSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.ALGORAND, `m/44'/283'/0'/0/0`)
        })

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.TRANSACTION)
        expect(response.body.parameter).toBeDefined()
        // TODO: address, sign value format check !!
        expect(response.body.parameter.signed_tx).toBeDefined()
        // expect(response.body.parameter.pubkey).toBeDefined()

        const res = verify(rawData, response.body.parameter.signed_tx, responseAddress.body.parameter.address)
        expect(res).toEqual(true)

        done()
    })
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
