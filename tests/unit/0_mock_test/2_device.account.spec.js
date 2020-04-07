import DcentWebConnector from '../../../index'
import LOG from '../../../src/utils/log'

var NilMock = require('../../../src/native/__mocks__/nil')
const Values = require('../test-constants')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

// Before TEST : Set Message Receiver and window.open
NilMock.setMessageReceiver(DcentWebConnector.messageReceive)
window.open = () => {
    // # 
    // Send Event
    setTimeout(() => {
        let messageEvent = {
            isTrusted: true,
            data: {
                event: 'BridgeEvent',
                type: 'data',
                payload: 'popup-success'
            }
        }
        DcentWebConnector.messageReceive(messageEvent)
    }, 1000)
    
    let result = {
        closed: false,
        location: {
            href: ''
        },
        postMessage: NilMock.postMessage
    }
    return result
}

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

describe('[dcent-web-connector] MOCK - device account', () => {
    afterAll(() => {
        DcentWebConnector.popupWindowClose()
    })

    it('syncAccount() - invalid Account label length ', async (done) => {
        let accountInfo = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: 'ABCDEFGhijklmnopQRStuvwx123456',
                address_path: "m/44'/60'/0'/0/0",
                balance: '1 ETH'
            }
        ]

        var response 
        try {
            response = await DcentWebConnector.syncAccount(accountInfo)        
        } catch (e) {
            
            response = e
        }       
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('syncAccount() - invalid Account label characters ', async (done) => {

        let accountInfo = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: ';;;;;;;;;',
                address_path: "m/44'/60'/0'/0/0",
                balance: '0 ETH'
            }
        ]

        var response 
        try {
            response = await DcentWebConnector.syncAccount(accountInfo)        
        } catch (e) {
            response = e
        }        

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('syncAccount() - invalid coin group ', async (done) => {
        let accountInfo = [
            {
                coin_group: 'ETHEREUM-C',
                coin_name: 'ETHEREUM-C',
                label: 'IoTrust',
                address_path: "m/44'/60'/0'/0/0",
                balance: '0 ETH'
            }
        ]
        var response
        try {
            response = await DcentWebConnector.syncAccount(accountInfo)        
        } catch (e) {
            response = e
        }    
        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('syncAccount() - invalid coin group ', async (done) => {
        let accountInfo = [
            {
                coin_group: 'ETHEREUM-C',//
                coin_name: 'ETHEREUM-C',//
                label: 'IoTrust',
                address_path: "m/44'/60'/0'/0/0",
                balance: '0 ETH'
            }
        ]
        var response
        try {
            response = await DcentWebConnector.syncAccount(accountInfo)        
        } catch (e) {
            response = e
        }    

        expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
        done()
    })

    it('syncAccount() - success ', async (done) => { 
        let account_infos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: "ether_1",
                address_path: "m/44'/60'/0'/0/0",
                balance: '0 ETH'
            },
            {
                coin_group: DcentWebConnector.coinGroup.ERC20,
                coin_name: "0xd26114cd6EE28", // 15-byte contract address, including `0x`
                label: 'OMG_1',
                balance: '0 OMG',
                address_path: "m/44'/60'/0'/0/0"
            }
        ]

        var response 
        try { 
            response = await DcentWebConnector.syncAccount(account_infos)        
        } catch (e) {
            response = e
        }

        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.SYNC_ACCOUNT)

        done()
    })

    it('getAccountInfo() - success ', async (done) => {
        let account_infos = [
            {
                coin_group: DcentWebConnector.coinGroup.ETHEREUM,
                coin_name: DcentWebConnector.coinName.ETHEREUM,
                label: "ether_1",
                address_path: "m/44'/60'/0'/0/0",
                balance: '0 ETH'
            },
            {
                coin_group: DcentWebConnector.coinGroup.ERC20,
                coin_name: "0xd26114cd6EE28", // 15-byte contract address, including `0x`
                label: 'OMG_1',
                balance: '0 OMG',
                address_path: "m/44'/60'/0'/0/0"
            }
        ]

        var response
        try { 
            response = await DcentWebConnector.getAccountInfo()    
        } catch (e) {
            response = e
        }
        
        expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
        expect(response.body.command).toBe(Values.CMD.GET_ACCOUNT_INFO)
        expect(response.body.parameter).toBeDefined()
        expect(response.body.parameter.account).toBeDefined()
        
        let respAccounts = response.body.parameter.account
        for (let i = 0; i < respAccounts.length; i++) {
            expect( respAccounts[i].coin_group ).toEqual(account_infos[i].coin_group)
            expect( respAccounts[i].coin_name ).toEqual(account_infos[i].coin_name)
            expect( respAccounts[i].label ).toEqual(account_infos[i].label)
            expect( respAccounts[i].address_path ).toEqual(account_infos[i].address_path)
        }

        done()
    })
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
