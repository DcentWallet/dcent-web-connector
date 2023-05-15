const DcentWebConnector = require('../../../src/index')

const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
// const elliptic = require('elliptic')
// const { sha256 } = require('js-sha256')
// const AccountLib = require('eth-lib/lib/account')
const CosmosApi = require('@cosmjs/crypto') // node version 14+

// function uint8ArrayToBase64 (data) {
//     return btoa(Array.from(data).map((c) => String.fromCharCode(c)).join(''))
// }

async function verify (rawMessage, signature, pubkey) {
    // const vals = AccountLib.decodeSignature(signature)
    // const vrs = { r: vals[1].slice(2), s: vals[2].slice(2) }
    // const cosSig = new CosmosApi.Secp256k1Signature(new Uint8Array(Buffer.from(vrs.r, 'hex')), new Uint8Array(Buffer.from(vrs.s, 'hex')))
    // const cosSig = CosmosApi.Secp256k1Signature.fromDer(new Uint8Array(Buffer.from('304402202ecfd965fdddf99b2c8eec70fba8d3358ab4624e27b9eaf8ae2a1ce59357cdda022011bb169e0ece4a7a7bbd48af93e8b704a31e17c70c7745d22302be29e10a7eed', 'hex')))
    const cosSig = CosmosApi.Secp256k1Signature.fromFixedLength(new Uint8Array(Buffer.from(signature.substr(2, signature.length - 2).toString(), 'hex'))) 
    console.log('cosSig ', Buffer.from(cosSig.r()).toString('hex'))
    console.log('cosSig ', Buffer.from(cosSig.s()).toString('hex'))
    
    const hash = new CosmosApi.Sha256(new Uint8Array(Buffer.from(rawMessage.substr(4, rawMessage.length - 4).toString(), 'hex'))).digest() // new Uint8Array(sha256.array(Buffer.from(rawMessage, 'hex')))
    // const exSig = new CosmosApi.ExtendedSecp256k1Signature(new Uint8Array(Buffer.from(vrs.r, 'hex')), new Uint8Array(Buffer.from(vrs.s, 'hex')), 0)
    console.log('hash ', Buffer.from(hash).toString('hex'))
    // const recPub = CosmosApi.Secp256k1.recoverPubkey(exSig, hash)    
    // console.log('recPub ', recPub)
    // console.log('recPub comp ', CosmosApi.Secp256k1.compressPubkey(recPub).toString())
    const decPubKey = CosmosApi.Secp256k1.uncompressPubkey(new Uint8Array(Buffer.from(pubkey.substr(2, pubkey.length - 2).toString(), 'hex')))
    console.log('decPubKey ', Buffer.from(decPubKey).toString('hex'))

    return await CosmosApi.Secp256k1.verifySignature(cosSig, hash, decPubKey)
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

    it('getCosmosSignedTransaction() - success ', async (done) => {
        const rawData = '0a94010a8f010a1c2f636f736d6f732e62616e6b2e763162657461312e4d736753656e64126f0a2d636f736d6f73317235763573726461377866746833686e327332367478767263726e746c646a756d74386d686c122d636f736d6f733138766864637a6a7574343467707379383034637266686e64356e713030336e7a306e663230761a0f0a057561746f6d1206313030303030120012670a500a460a1f2f636f736d6f732e63727970746f2e736563703235366b312e5075624b657912230a21ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff12040a020801180a12130a0d0a057561746f6d12043530303010c09a0c1a0b636f736d6f736875622d34208f3a'
        
        var transactionJson = {
            coinType: DcentWebConnector.coinType.COSMOS,
            sigHash: rawData,
            path: `m/44'/118'/0'/0/0`,
            decimals: 6,
            fee: '00000000000000FA',
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
        const res = await verify(rawData, response.body.parameter.signed_tx, response.body.parameter.pubkey)
        
        // const res = await verify(rawData, '0x80234094578ad04a6eba46cb555dec75546e744ab1f39841d7ab6540c3a63bd721c1f601a3eebe77980ae5a95c4eb6f37d90c5d79c77704fea6128b541639678', '0x0202903dcb36135bf94e046c2ec85fb9a74ab7dbff2d6234eed603d05ee9c50280')

        expect(res).toEqual(true)

        done()
    })

    // it('getCosmosSignedTransaction() - czone transaction success ', async (done) => {
    //     const rawData = '0a8d010a88010a1c2f636f736d6f732e62616e6b2e763162657461312e4d736753656e6412680a2b6f736d6f316e63796c757736636d75686635677868796a6d746c326e7064746a6a6864617465346533356d122b6f736d6f317875367a656a797978776c703675386438746a33767468336c6a746e306c396c37686a7039751a0c0a05756f736d6f1203313030120012670a500a460a1f2f636f736d6f732e63727970746f2e736563703235366b312e5075624b657912230a21ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff12040a020801181a12130a0d0a05756f736d6f12043230303010c09a0c1a096f736d6f7369732d31209fc720'
    //     var transactionJson = {
    //         coinType: DcentWebConnector.coinType.CZONE,
    //         sigHash: rawData,
    //         path: `m/44'/118'/0'/0/0`,
    //         decimals: 6,
    //         fee: '00000000000000FB',
    //         symbol: 'OSMO',
    //     }
    //     var response = await page.evaluate((transactionJson) => {
    //         // eslint-disable-next-line no-undef
    //         return getCosmosSignedTransaction(transactionJson)
    //     }, transactionJson)

    //     console.log('response ', response)
    //     expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
    //     expect(response.body.command).toBe(Values.CMD.TRANSACTION)
    //     expect(response.body.parameter).toBeDefined()
    //     // TODO: address, sign value format check !!
    //     expect(response.body.parameter.signed_tx).toBeDefined()
    //     expect(response.body.parameter.pubkey).toBeDefined()
    //     const res = verify(rawData, response.body.parameter.signed_tx, response.body.parameter.pubkey)
    //     expect(res).toEqual(true)

    //     done()
    // })


})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
