const DcentWebConnector = require('../../../index').default

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
    
    it('syncAccount() - invalid coin group ', async (done) => {
        let accountInfos = [
            {
                coin_group: 'ETHEREUM-CC',
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'IoTrust',
                address_path: "m/44'/60'/0'/0/0",
                balance: '0 ETH'
            }
        ]
        var response = await page.evaluate( (accountInfos) => {
            return syncAccount(accountInfos)        
        }, accountInfos)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('syncAccount() - invalid coin name ', async (done) => {
        let accountInfos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: 'ETHEREUM-01',
                label: 'IoTrust',
                address_path: "m/44'/60'/0'/0/0",
                balance: '1 ETH'
            }
        ]
        var response = await page.evaluate( (accountInfos) => {
            return syncAccount(accountInfos)        
        }, accountInfos)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('syncAccount() - invalid Account label length ', async (done) => {
        let accountInfos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'ABCDEFG1234ABCDEF12340123456789',
                address_path: "m/44'/60'/0'/0/0",
                balance: '0 ETH'
            }
        ]
        var response = await page.evaluate( (accountInfos) => {
            return syncAccount(accountInfos)        
        }, accountInfos)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    
    it('syncAccount() - invalid Account label characters ', async (done) => {
        let accountInfos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: ';;;;;;;;;',
                address_path: "m/44'/60'/0'/0/0",
                balance: '0 ETH'
            }
        ]        
        var response = await page.evaluate( (accountInfos) => {
            return syncAccount(accountInfos)        
        }, accountInfos)
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('syncAccount() - error with length 0 accunt info ', async (done) => {
        let accountInfos = []
        var response = await page.evaluate( (accountInfos) => {
           return syncAccount(accountInfos)        
        }, accountInfos)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })  

    it('syncAccount() - invalid key address path ', async (done) => {
        let accountInfos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'IoTrust-ETH',
                address_path: "k/44'/0'/0'/0/0",
                balance: '0 ETH'
            }
        ]     
        var response = await page.evaluate( (accountInfos) => {
           return syncAccount(accountInfos)        
        }, accountInfos)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })  

    it('syncAccount() - invalid key address path 2', async (done) => {
        let accountInfos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'IoTrust-ETH',
                address_path: "m/a'/0'/0'/0/0",
                balance: '0 ETH'
            }
        ]     
        var response = await page.evaluate( (accountInfos) => {
           return syncAccount(accountInfos)        
        }, accountInfos)

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })  

    it('syncAccount() - invalid balance length ', async (done) => {
        let accountInfos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'IoTrust-ETH',
                address_path: "m/a'/60'/0'/0/0",
                balance: '100000000000000000000 ETH'
            }
        ]     
        var response = await page.evaluate( (accountInfos) => {
           return syncAccount(accountInfos)        
        }, accountInfos)
        
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })  

    it('syncAccount() - success ETHEREUM', async (done) => {
        let accountInfos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'ETH-01',
                address_path: "m/44'/60'/0'/0/0",
                balance: '0 ETH'
            }
        ]
        var response = await page.evaluate( (accountInfos) => {            
            return syncAccount(accountInfos)        
        }, accountInfos)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        done()
    })

    it('getAccountInfo() - success, ETHEREUM Check ', async (done) => {
        let account_infos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'ETH-01',
                address_path: "m/44'/60'/0'/0/0"
            }
        ]

        var response = await page.evaluate( () => {            
            return getAccountInfo()        
        })
        
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_ACCOUNT_INFO)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.account).toBeDefined()
        
        let respAccounts = response.body.parameter.account
        var result = false
        for (let i = 0; i < respAccounts.length; i++) {
            if ( respAccounts[i].coin_group === account_infos[0].coin_group && 
                respAccounts[i].coin_name === account_infos[0].coin_name && 
                respAccounts[i].address_path === account_infos[0].address_path 
            ) {
                expect( respAccounts[i].label ).toEqual(account_infos[0].label )
                result = true
            }           
        }
        expect(result).toBeTruthy()
        done()
    })

    it('syncAccount() - success chagne label', async (done) => {
        let accountInfos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'ETH-0001',
                address_path: "m/44'/60'/0'/0/0",
                balance: '0 ETH'
            }
        ]
        var response = await page.evaluate( (accountInfos) => {            
            return syncAccount(accountInfos)        
        }, accountInfos)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        done()
    })

    it('getAccountInfo() - success, ETHEREUM changed check ', async (done) => {
        let account_infos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'ETH-0001',
                address_path: "m/44'/60'/0'/0/0"
            }
        ]

        var response = await page.evaluate( () => {            
            return getAccountInfo()        
        })
        
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_ACCOUNT_INFO)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.account).toBeDefined()
        
        let respAccounts = response.body.parameter.account
        var result = false
        for (let i = 0; i < respAccounts.length; i++) {
            if ( respAccounts[i].coin_group === account_infos[0].coin_group && 
                respAccounts[i].coin_name === account_infos[0].coin_name && 
                respAccounts[i].address_path === account_infos[0].address_path 
            ) {
                expect( respAccounts[i].label ).toEqual(account_infos[0].label )
                result = true
            }           
        }
        expect(result).toBeTruthy()
        done()
    })

    it('syncAccount() - success ETHEREUM', async (done) => {
        let accountInfos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'ETH-01',
                address_path: "m/44'/60'/0'/0/0",
                balance: '10 ETH'
            }
        ]
        var response = await page.evaluate( (accountInfos) => {            
            return syncAccount(accountInfos)        
        }, accountInfos)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        done()
    })

    it('getAccountInfo() - success, ETHEREUM Check ', async (done) => {
        let account_infos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'ETH-01',
                address_path: "m/44'/60'/0'/0/0"
            }
        ]

        var response = await page.evaluate( () => {            
            return getAccountInfo()        
        })
        
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_ACCOUNT_INFO)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.account).toBeDefined()
        
        let respAccounts = response.body.parameter.account
        var result = false
        for (let i = 0; i < respAccounts.length; i++) {
            if ( respAccounts[i].coin_group === account_infos[0].coin_group && 
                respAccounts[i].coin_name === account_infos[0].coin_name && 
                respAccounts[i].address_path === account_infos[0].address_path 
            ) {
                expect( respAccounts[i].label ).toEqual(account_infos[0].label )
                result = true
            }           
        }
        expect(result).toBeTruthy()
        done()
    })

    it('syncAccount() - success ERC20', async (done) => {
        let accountInfos = [
            {
                coin_group: DcentWebConnector.coinGroup.ERC20,
                coin_name: '0XD26114CD6EE28',
                label: 'OMG-01',
                address_path: "m/44'/60'/0'/0/0",
                balance: '1 OMG'
            }
        ]
        var response = await page.evaluate( (accountInfos) => {            
            return syncAccount(accountInfos)        
        }, accountInfos)
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        done()
    })

    it('getAccountInfo() - success, ERC20 Check ', async (done) => {
        let account_infos = [
            {
                coin_group: DcentWebConnector.coinGroup.ERC20,
                coin_name: '0XD26114CD6EE28',
                label: 'OMG-01',
                address_path: "m/44'/60'/0'/0/0"
            }
        ]

        var response = await page.evaluate( () => {            
            return getAccountInfo()        
        })
        
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_ACCOUNT_INFO)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.account).toBeDefined()
        
        let respAccounts = response.body.parameter.account
        var result = false
        for (let i = 0; i < respAccounts.length; i++) {
            if ( respAccounts[i].coin_group === account_infos[0].coin_group && 
                respAccounts[i].coin_name === account_infos[0].coin_name && 
                respAccounts[i].address_path === account_infos[0].address_path 
            ) {
                expect( respAccounts[i].label ).toEqual(account_infos[0].label )
                result = true
            }           
        }
        expect(result).toBeTruthy()
        done()
    })


})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
