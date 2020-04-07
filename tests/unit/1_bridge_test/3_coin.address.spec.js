//var DcentWebConnector = require('../../../src/index')
import DcentWebConnector from '../../../src/index'
import LOG from '../../../src/utils/log'

const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

describe('[dcent-web-connector] Bridge - init', () => {
    let bowser
    let page
    beforeAll(async () => {
        let bowser = await puppeteer.launch({
            headless: false
        })
        page = await bowser.newPage();

        await page.goto('http://localhost:9090')
    })
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
        bowser.close()
    })
    
    it('getDeviceInfo() - success ', async (done) => {
        await page.exposeFunction( 'dcentGetDeviceInfo', DcentWebConnector.getDeviceInfo )
        var response = await page.evaluate( () => {
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
    
    it('getXPUB() - invalid key path', async (done) => {
        let keyPath = '9/44\'/0\'/0\''
        var response = await page.evaluate( (keyPath) => {
            return getXpub(keyPath)  
        }, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getXPUB() - invalid key path 2', async (done) => {
        let keyPath = 'm/a\'/0\'/0\''
        var response = await page.evaluate( (keyPath) => {
            return getXpub(keyPath)  
        }, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getXPUB() - success', async (done) => {
        let keyPath = 'm/44\'/60\'/0\''
        var response = await page.evaluate( (keyPath) => {
            return getXpub(keyPath)  
        }, keyPath)
        
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_XPUB)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.public_key).toBeDefined()
        expect(response.body.parameter.public_key.startsWith('xpub')).toBeTruthy()
        done()
    })

    it('getAddress() - invalid coinType ', async (done) => {
        let coinType = 'ETHEREUM-ds'
        let keyPath = "m/44'/60'/0'/0/0"
        var response = await page.evaluate( (coinType, keyPath) => {
            return getAddress(coinType, keyPath)  
        }, coinType, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getAddress() - invalid keypath 1', async (done) => {
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let keyPath = "k/44'/60'/0'/0/0"
        var response = await page.evaluate( (coinType, keyPath) => {
            return getAddress(coinType, keyPath)  
        }, coinType, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('getAddress() - invalid keypath 2', async (done) => {
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let keyPath = "m/a'/60'/0'/0/0"
        var response = await page.evaluate( (coinType, keyPath) => {
            return getAddress(coinType, keyPath)  
        }, coinType, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    // it('getAddress() - success ETHEREUM', async (done) => {
    //     let coinType = DcentWebConnector.coinType.ETHEREUM
    //     let keyPath = "m/44'/60'/0'/0/0"
    //     var response = await page.evaluate( (coinType, keyPath) => {
    //         return getAddress(coinType, keyPath)  
    //     }, coinType, keyPath)
    //     expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
    //     expect(response.body.parameter.address).toBeDefined()
    //     expect(response.body.parameter.address.startsWith('1')).toBeTruthy()
    //     done()
    // })

    it('getAddress() - success ETHEREUM', async (done) => {
        let coinType = DcentWebConnector.coinType.ETHEREUM
        let keyPath = "m/44'/60'/0'/0/0"
        var response = await page.evaluate( (coinType, keyPath) => {
            return getAddress(coinType, keyPath)  
        }, coinType, keyPath)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.parameter.address).toBeDefined()
        expect(response.body.parameter.address.startsWith('0x')).toBeTruthy()
        done()
    })

})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
