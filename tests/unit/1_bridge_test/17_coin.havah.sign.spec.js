const DcentWebConnector = require('../../../src/index')

const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
const elliptic = require('elliptic')
const sha3 = require('js-sha3')
// eslint-disable-next-line new-cap
const ec = new elliptic.ec('secp256k1')
const AccountLib = require('eth-lib/lib/account')

function hexKeyToBuffer (key) {
    let keyAsBuffer = null
  
    try {
        keyAsBuffer = Buffer.from(key, 'hex')
    } catch (err) {
        console.log('Unexpected error parsing key into buffer')
        console.log(err)
    }
  
    return keyAsBuffer
  }

function getAddress (pubK) {
    let address = null
  
    try {
        address = 'hx' + sha3.sha3_256(hexKeyToBuffer(pubK)).slice(-40)
    } catch (err) {
        console.log('Unexpected error parsing address')
        console.log(err)
    }
  
    return address
  }

function verify (message, signature, addr) {
    const vals = AccountLib.decodeSignature(signature)
    const vrs = { v: parseInt(vals[0].slice(2), 16), r: vals[1].slice(2), s: vals[2].slice(2) }
    const hash = message.length === (78 * 2) ? message.slice(42 * 2, (42 * 2) + 64) : sha3.sha3_256(Buffer.from(message, 'hex'))
    const recoverPubkey = ec.recoverPubKey(new Buffer(hash, 'hex'), vrs, vrs.v < 2 ? vrs.v : 1 - vrs.v % 2, 'hex') 
    const recoverAddress = getAddress(recoverPubkey.encode('hex', false).slice(2))
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

    it('getHavahSignedTransaction() - success ', async (done) => {
        const rawData = '6963785f73656e645472616e73616374696f6e2e66726f6d2e6878316531333433353935303532383335613064396137643064396533353839633433323831623262642e6e69642e30783130302e6e6f6e63652e3078312e737465704c696d69742e307831616462302e74696d657374616d702e3078356661316631343633666161302e746f2e6878353833323164313731633833393465613434303638376562623462353832623037353739356663352e76616c75652e307833636235396163376237353734652e76657273696f6e2e307833'
        // To address: hx58321d171c8394ea440687ebb4b582b075795fc5
        // amount: 0.017088174982...
        // From address: hx1e13...b2bd
        var transactionJson = {
            coinType: DcentWebConnector.coinType.HAVAH,
            sigHash: rawData,
            path: `m/44'/858'/0'/0/0`,
            decimals: 18,
            fee: '0004e28e2290f000', // 0.001375 
            symbol: 'HVH',
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getHavahSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.HAVAH, `m/44'/858'/0'/0/0`)
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

    it('getHavahSignedTransaction() - HSP20 transaction success(trsansfer) ', async (done) => {
        const rawData = '6963785f73656e645472616e73616374696f6e2e646174612e7b6d6574686f642e7472616e736665722e706172616d732e7b5f746f2e6878656337623030666563623033393132333037306334633330383130636438636439666465623662392e5f76616c75652e30786465306236623361373634303030307d7d2e64617461547970652e63616c6c2e66726f6d2e6878653165396634626466623461316562363332323266366535653338396237386461663533323639612e6e69642e30783130312e6e6f6e63652e3078312e737465704c696d69742e30786534653163302e74696d657374616d702e3078356638663564303562623763382e746f2e6378333235313963366331316234373166663632396138656661333665633764303439393630616639382e76657273696f6e2e307833'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.HAVAH_HSP20,
            sigHash: rawData,
            path: `m/44'/858'/0'/0/0`,
            decimals: 18,
            fee: '0354a6ba7a180000', // 0.24
            symbol: 'HVH',
            optionParam: '01' // Token Transfer
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getHavahSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.HAVAH, `m/44'/858'/0'/0/0`)
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

    it('getHavahSignedTransaction() - HSP20 transaction success(deploy) ', async (done) => {
        const rawData = '637830303030303030303030303030303030303030303030303030303030303030303030303030303030c8c8e83b5ec7a6ae037c3204c2e5a75510ce3ced65943889e304f588687dca2cf88c526f'
        var transactionJson = {
            coinType: DcentWebConnector.coinType.HAVAH_HSP20,
            sigHash: rawData,
            path: `m/44'/858'/0'/0/0`,
            decimals: 18,
            fee: '0354a6ba7a180000', // 0.24 
            symbol: 'ST',
            optionParam: '04' // Token Deploy
        }
        var response = await page.evaluate((transactionJson) => {
            // eslint-disable-next-line no-undef
            return getHavahSignedTransaction(transactionJson)
        }, transactionJson)

        var responseAddress = await page.evaluate(() => {
            // eslint-disable-next-line no-undef
            return getAddress(DcentWebConnector.coinType.HAVAH, `m/44'/858'/0'/0/0`)
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
