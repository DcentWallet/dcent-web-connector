const DcentWebConnector = require('../../../index')

const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

describe('[dcent-web-connector] device - init', () => {
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

    it('setLabel() - with Invalid label length ', async (done) => {
        var response = await page.evaluate( () => {
            return setLabel('AbcdeFghijkLMNOPQRS12345')  
        })
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('setLabel() - with null label ', async (done) => {
        var response = await page.evaluate( () => {
            return setLabel() 
        })
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('setLabel() - with Invalid charactor label ', async (done) => {
        var response = await page.evaluate( () => {
            return setLabel(';;;;;;;;') 
        })
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })
    
    it('setLabel() - success ', async (done) => {
        var response = await page.evaluate( () => {
            var result 
            try {
                result = setLabel('IoTrust')        
            } catch (e) {
                result = e
            }
            return  result   
        })
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        done()
    })


})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
