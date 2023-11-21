const DcentWebConnector = require('../../../src/index')
const Values = require('../test-constants')
const puppeteer = require('puppeteer')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
const checkResponse = (response) => {
    expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
    expect(response.body.command).toBe(Values.CMD.GET_SIGN)
    expect(response.body.parameter).toBeDefined()
    expect(response.body.parameter.sign).toBeDefined()
    expect(response.body.parameter.pubkey).toBeDefined()
    expect(response.body.parameter.accountId).toBeDefined()
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

    // it('getXrpSignedTransaction() - AccountSet', async (done) => {
        
    //     const transaction = {
    //         TransactionType: 'AccountSet',
    //         Account: 'rfQrsnD8ywrgSX457qshpBTDru7EDnM2Lb',
    //         Fee: '10',
    //         Sequence: 38,
    //         MessageKey: '02000000000000000000000000415F8315C9948AD91E2CCE5B8583A36DA431FB61',
    //         Flags: 2147483648,
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)

    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - AccountDelete', async (done) => {
        
    //     const transaction = {
    //         'TransactionType': 'AccountDelete',
    //         'Account': 'rWYkbWkCeg8dP6rXALnjgZSjjLyih5NXm',
    //         'Destination': 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    //         'DestinationTag': 13,
    //         'Fee': '5000000',
    //         'Sequence': 2470665,
    //         'Flags': 2147483648
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)

    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - CheckCancel', async (done) => {
        
    //     const transaction = {
    //         'Account': 'rUn84CUYbNjRoTQ6mSW7BVJPSVJNLb1QLo',
    //         'TransactionType': 'CheckCancel',
    //         'CheckID': '49647F0D748DC3FE26BDACBC57F251AADEFFF391403EC9BF87C97F67E9977FB0',
    //         'Fee': '12',
    //         'Sequence': 2470665,
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)
        
    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - CheckCash', async (done) => {
        
    //     const transaction = {
    //         'Account': 'rfkE1aSy9G8Upk4JssnwBxhEv5p4mn2KTy',
    //         'TransactionType': 'CheckCash',
    //         'Amount': '100000000',
    //         'CheckID': '838766BA2B995C00744175F69A1B11E32C3DBC40E64801A4056FCBD657F57334',
    //         'Fee': '12',
    //         'Sequence': 2470665
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)
        
    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - CheckCreate', async (done) => {
        
    //     const transaction = {
    //         'TransactionType': 'CheckCreate',
    //         'Account': 'rUn84CUYbNjRoTQ6mSW7BVJPSVJNLb1QLo',
    //         'Destination': 'rfkE1aSy9G8Upk4JssnwBxhEv5p4mn2KTy',
    //         'SendMax': '100000000',
    //         'Expiration': 570113521,
    //         'InvoiceID': '6F1DFD1D0FE8A32E40E1F2C05CF1C15545BAB56B617F9C6C2D63A6B704BEF59B',
    //         'DestinationTag': 1,
    //         'Fee': '12',
    //         'Sequence': 2470665
    //       }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)
    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - DepositPreauth', async (done) => {
        
    //     const transaction = {
    //         'TransactionType': 'DepositPreauth',
    //         'Account': 'rsUiUMpnrgxQp24dJYZDhmV4bE3aBtQyt8',
    //         'Authorize': 'rEhxGqkqPPSxQ3P25J66ft5TwpzV14k2de',
    //         'Fee': '10',
    //         'Flags': 2147483648,
    //         'Sequence': 2
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)

    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - EscrowCancel', async (done) => {
        
    //     const transaction = {
    //         'Account': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
    //         'TransactionType': 'EscrowCancel',
    //         'Owner': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
    //         'OfferSequence': 7,
    //         'Sequence': 2,
    //         'Fee': '10',
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)

    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - EscrowCreate', async (done) => {
        
    //     const transaction = {
    //         'Account': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
    //         'TransactionType': 'EscrowCreate',
    //         'Amount': '10000',
    //         'Destination': 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW',
    //         'CancelAfter': 533257958,
    //         'FinishAfter': 533171558,
    //         'Condition': 'A0258020E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855810100',
    //         'DestinationTag': 23480,
    //         'SourceTag': 11747,
    //         'Sequence': 2,
    //         'Fee': '10',
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)

    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - EscrowFinish', async (done) => {
        
    //     const transaction = {
    //         'Account': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
    //         'TransactionType': 'EscrowFinish',
    //         'Owner': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
    //         'OfferSequence': 7,
    //         'Condition': 'A0258020E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855810100',
    //         'Fulfillment': 'A0028000',
    //         'Sequence': 2,
    //         'Fee': '10',
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)

    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - OfferCancel', async (done) => {
        
    //     const transaction = {
    //         'TransactionType': 'OfferCancel',
    //         'Account': 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX',
    //         'Fee': '12',
    //         'Flags': '0x80000000',
    //         'LastLedgerSequence': 7108629,
    //         'OfferSequence': 6,
    //         'Sequence': 7
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)
    
    //     checkResponse(response)
    //     done()
    // })
    
    // it('getXrpSignedTransaction() - OfferCreate', async (done) => {
        
    //     const transaction = {
    //         'TransactionType': 'OfferCreate',
    //         'Account': 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX',
    //         'Fee': '12',
    //         'Flags': 2147483648,
    //         'LastLedgerSequence': 7108682,
    //         'Sequence': 8,
    //         'TakerGets': {
    //             'value': '13.1',
    //             'currency': 'FOO',
    //             'issuer': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn'
    //         },
    //         'TakerPays': {
    //           'currency': 'GKO',
    //           'issuer': 'ruazs5h1qEsqpke88pcqnaseXdm6od2xc',
    //           'value': '2'
    //         }
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)
    
    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - Payment', async (done) => {
        
    //     const transaction = {
    //         'TransactionType': 'Payment',
    //         'Account': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
    //         'Destination': 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX',
    //         'Amount': {
    //            'currency': 'USD',
    //            'value': '1',
    //            'issuer': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn'
    //         },
    //         'Fee': '12',
    //         'Flags': '0x80000000',
    //         'Sequence': 2,
    //       }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)
        
    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - PaymentChannelClaim', async (done) => {
        
    //     const transaction = {
    //         'Account': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
    //         'TransactionType': 'PaymentChannelClaim',
    //         'Channel': 'C1AE6DDDEEC05CF2978C0BAD6FE302948E9533691DC749DCDD3B9E5992CA6198',
    //         'Balance': '1000000',
    //         'Amount': '1000000',
    //         'Signature': '30440220718D264EF05CAED7C781FF6DE298DCAC68D002562C9BF3A07C1E721B420C0DAB02203A5A4779EF4D2CCC7BC3EF886676D803A9981B928D3B8ACA483B80ECA3CD7B9B',
    //         'PublicKey': '32D2471DB72B27E3310F355BB33E339BF26F8392D5A93D3BC0FC3B566612DA0F0A',
    //         'Fee': '12',
    //         'Sequence': 2,
    //         'Flags': '0x80000000'
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)
        
    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - PaymentChannelCreate', async (done) => {
        
    //     const transaction = {
    //         'Account': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
    //         'TransactionType': 'PaymentChannelCreate',
    //         'Amount': '10000',
    //         'Destination': 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW',
    //         'SettleDelay': 86400,
    //         'PublicKey': '32D2471DB72B27E3310F355BB33E339BF26F8392D5A93D3BC0FC3B566612DA0F0A',
    //         'CancelAfter': 533171558,
    //         'DestinationTag': 23480,
    //         'SourceTag': 11747,
    //         'Fee': '12',
    //         'Sequence': 2,
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)
        
    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - PaymentChannelFund', async (done) => {
        
    //     const transaction = {
    //         'Account': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
    //         'TransactionType': 'PaymentChannelFund',
    //         'Channel': 'C1AE6DDDEEC05CF2978C0BAD6FE302948E9533691DC749DCDD3B9E5992CA6198',
    //         'Amount': '200000',
    //         'Expiration': 543171558,
    //         'Fee': '12',
    //         'Sequence': 2,
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)
        
    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - SetRegularKey', async (done) => {
        
    //     const transaction = {
    //         'TransactionType': 'SetRegularKey',
    //         'Account': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
    //         'Fee': '12',
    //         'RegularKey': 'rAR8rR8sUkBoCZFawhkWzY4Y5YoyuznwD',
    //         'Sequence': 2,
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)
        
    //     checkResponse(response)
    //     done()
    // })

    // it('getXrpSignedTransaction() - SignerListSet', async (done) => {
        
    //     const transaction = {
    //         'TransactionType': 'SignerListSet',
    //         'Account': 'rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',
    //         'Fee': '12',
    //         'SignerQuorum': 3,
    //         'SignerEntries': [
    //             {
    //                 'SignerEntry': {
    //                     'Account': 'rsA2LpzuawewSBQXkiju3YQTMzW13pAAdW',
    //                     'SignerWeight': 2
    //                 }
    //             },
    //             {
    //                 'SignerEntry': {
    //                     'Account': 'rUpy3eEg8rqjqfUoLeBnZkscbKbFsKXC3v',
    //                     'SignerWeight': 1
    //                 }
    //             },
    //             {
    //                 'SignerEntry': {
    //                     'Account': 'raKEEVSGnKSD9Zyvxu4z6Pqpm4ABH8FS6n',
    //                     'SignerWeight': 1
    //                 }
    //             }
    //         ],
    //         'Sequence': 2,
    //     }
    //     const key = 'm/44\'/144\'/0\'/0/0'
        
    //     var response = await page.evaluate((transaction, key) => {
    //         // eslint-disable-next-line no-undef
    //         return getXrpSignedTransaction(transaction, key)
    //     }, transaction, key)
        
    //     checkResponse(response)
    //     done()
    // })

    it('getXrpSignedTransaction() - TrustSet', async (done) => {
        
        const transaction = {
            'TransactionType': 'TrustSet',
            'Account': 'ra5nK24KXen9AHvsdFTKHSANinZseWnPcX',
            'Fee': '12',
            'Flags': '0x80020000', // '0x80170000'
            'LastLedgerSequence': 8007750,
            'LimitAmount': {
              'currency': 'USD',
              'issuer': 'rsP3mgGb2tcYUrxiLFiHJiQXhsziegtwBc',
              'value': '100'
            },
            'Sequence': 12
        }
        const key = 'm/44\'/144\'/0\'/0/0'
        
        var response = await page.evaluate((transaction, key) => {
            // eslint-disable-next-line no-undef
            return getXrpSignedTransaction(transaction, key)
        }, transaction, key)
        
        checkResponse(response)
        done()
    })

})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
