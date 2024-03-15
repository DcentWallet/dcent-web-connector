const DcentWebConnector = require('../../../src/index')
const Values = require('../test-constants')
const puppeteer = require('puppeteer')
// const LOG = require('../../../src/utils/log')

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

describe('[CHAIN ID] U64bit', () => {
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

    it('Long Size (withSymbol) - success(Supported v2.19.5)', async (done) => {
      var response = await page.evaluate((coinType,
                                          nonce,
                                          gasPrice,
                                          gasLimit,
                                          to,
                                          value,
                                          data,
                                          key,
                                          chainId,
                                          txType,
                                          typeOptions) => {
        // eslint-disable-next-line no-undef
        return getEthereumSignedTransaction(coinType,
                                              nonce,
                                              gasPrice,
                                              gasLimit,
                                              to,
                                              value,
                                              data,
                                              key,
                                              chainId,
                                              txType,
                                              typeOptions)
        }, DcentWebConnector.coinType.ETHEREUM,
          '8',
          '0', //
          '210000',
          '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
          '100000000000000000',
          '0x',
          "m/44'/60'/0'/0/0",
          6022140761023
      )
      // 868455272153094
      
      expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
      expect(response.body.command).toBe('transaction_v2')
      expect(response.body.parameter).toBeDefined()
      // TODO: address, sign value format check !!
      expect(response.body.parameter.signed).toBeDefined()
      expect(response.body.parameter.sign_v).toBeDefined()
      expect(response.body.parameter.sign_r).toBeDefined()
      expect(response.body.parameter.sign_s).toBeDefined()

      done()
    })
    
    it('Long Size (not have symbol) - fail ', async (done) => {
      var response = await page.evaluate((coinType,
                                          nonce,
                                          gasPrice,
                                          gasLimit,
                                          to,
                                          value,
                                          data,
                                          key,
                                          chainId) => {
        // eslint-disable-next-line no-undef
        return getEthereumSignedTransaction(coinType,
                                              nonce,
                                              gasPrice,
                                              gasLimit,
                                              to,
                                              value,
                                              data,
                                              key,
                                              chainId)
        }, DcentWebConnector.coinType.ETHEREUM,
          '8',
          '0', //
          '210000',
          '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
          '100000000000000000',
          '0x',
          "m/44'/60'/0'/0/0",
          6022140761022
      )
      
      expect(response.header.status).toBe(Values.RESP_STATUS.ERROR)
      done()
    })
    
    it('typedTx always success ', async (done) => {
      var response = await page.evaluate((coinType,
                                          nonce,
                                          gasPrice,
                                          gasLimit,
                                          to,
                                          value,
                                          data,
                                          key,
                                          chainId,
                                          txType,
                                          typeOptions) => {
        // eslint-disable-next-line no-undef
        return getEthereumSignedTransaction(coinType,
                                              nonce,
                                              gasPrice,
                                              gasLimit,
                                              to,
                                              value,
                                              data,
                                              key,
                                              chainId,
                                              txType,
                                              typeOptions)
        }, DcentWebConnector.coinType.ETHEREUM,
          '8',
          '100', //
          '210000',
          '0x354609C4c9a15d4265cF6D94010568D5Cf4d0c1B',
          '100000000000000000',
          '0x',
          "m/44'/60'/0'/0/0",
          6022140761022, 
          2, 
          {
              accessList: [],
              maxPriorityFeePerGas: '2400000000', 
              maxFeePerGas: '2400000000'
          }
      )
      console.log(response.body)
      expect(response.header.status).toBe(Values.RESP_STATUS.SUCCESS)
      expect(response.body.command).toBe(Values.CMD.TYPED_TRANSACTION)
      expect(response.body.parameter).toBeDefined()
      // TODO: address, sign value format check !!
      expect(response.body.parameter.signed).toBeDefined()
      expect(response.body.parameter.sign_v).toBeDefined()
      expect(response.body.parameter.sign_r).toBeDefined()
      expect(response.body.parameter.sign_s).toBeDefined()
      expect(response.body.parameter.signed.includes('86057a238f93be')).toBeTruthy()

      done()
    })
})

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
