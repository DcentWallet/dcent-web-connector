/**
 * getTokenSignedTransaction 단위 테스트 (m08-01-03)
 *
 * T-U-TOKEN-01: ERC20 happy path — params keys snake_case (gas_price/gas_limit/chain_id)
 * T-U-TOKEN-02: chainId 또는 contract.decimals 타입 위반 → throw param_error
 * T-U-TOKEN-03: 지원하지 않는 token → throw 'coin_type_error: not supported token type'
 * T-U-TOKEN-04: contract.value invalid → checkParameter throw
 * T-U-TOKEN-05: token=XRC20 → contract.to + contract.address가 XDCPrefixConverter 변환됨
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getTokenSignedTransaction } from '../../../../../src/sign/evm'
import { ensureSingleton, _resetForTesting } from '../../../../../src/singleton'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

const expectV1Error = (code: string, msg?: string) =>
  expect.objectContaining({
    body: {
      error: msg
        ? expect.objectContaining({ code, message: expect.stringContaining(msg) })
        : expect.objectContaining({ code }),
    },
  })

const baseContract = (): any => ({
  address: '0xcontractaddr',
  symbol: 'TST',
  decimals: 18,
  value: '0x1000',
  to: '0xrecipient',
})

describe('getTokenSignedTransaction — happy path', () => {
  test('T-U-TOKEN-01: ERC20 → snake_case params', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r1', result: {} })

    await getTokenSignedTransaction(
      'erc20', '0x1', '0x10', '0x21000', "m/44'/60'/0'/0/0", 1, baseContract()
    )

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getTokenSignedTransaction')
    expect(callArg.params).toMatchObject({
      token: 'erc20',
      nonce: '0x1',
      gas_price: '0x10',
      gas_limit: '0x21000',
      key: "m/44'/60'/0'/0/0",
      chain_id: 1,
    })
    expect(callArg.params?.contract).toBeDefined()
  })

  test('T-U-TOKEN-01b: KLAYTN_KCT (klaytn-erc20) 통과', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r2', result: {} })

    await getTokenSignedTransaction(
      'klaytn-erc20', '0x1', '0x10', '0x21000', "m/44'/8217'/0'/0/0", 8217, baseContract()
    )

    expect(sendSpy.mock.calls[0][0].params?.token).toBe('klaytn-erc20')
  })
})

describe('getTokenSignedTransaction — 인자 검증', () => {
  test('T-U-TOKEN-02a: chainId !== number → throw param_error', async () => {
    await expect(
      getTokenSignedTransaction(
        'erc20', '0x1', '0x10', '0x21000', "m/44'/60'/0'/0/0",
        'not-number' as any, baseContract()
      )
    ).rejects.toEqual(expectV1Error('param_error'))
  })

  test('T-U-TOKEN-02b: contract.decimals !== number → throw param_error', async () => {
    const c = baseContract()
    c.decimals = '18' // string
    await expect(
      getTokenSignedTransaction('erc20', '0x1', '0x10', '0x21000', "m/44'/60'/0'/0/0", 1, c)
    ).rejects.toEqual(expectV1Error('param_error'))
  })

  test('T-U-TOKEN-04: contract.value invalid → checkParameter throw', async () => {
    const c = baseContract()
    c.value = 'garbage'
    await expect(
      getTokenSignedTransaction('erc20', '0x1', '0x10', '0x21000', "m/44'/60'/0'/0/0", 1, c)
    ).rejects.toEqual(expectV1Error('param_error'))
  })
})

describe('getTokenSignedTransaction — token switch (T-U-TOKEN-03/05)', () => {
  test('T-U-TOKEN-03: unknown token → throw "not supported token type"', async () => {
    await expect(
      getTokenSignedTransaction(
        'unknown_token', '0x1', '0x10', '0x21000', "m/44'/60'/0'/0/0", 1, baseContract()
      )
    ).rejects.toEqual(expectV1Error('coin_type_error', 'not supported token type'))
  })

  test('T-U-TOKEN-05: XRC20 → contract.to + contract.address XDC prefix 변환', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r3', result: {} })

    const c = baseContract()
    c.to = 'xdcrecipient1'
    c.address = 'xdccontract2'

    await getTokenSignedTransaction(
      'xrc20', '0x1', '0x10', '0x21000', "m/44'/550'/0'/0/0", 50, c
    )

    const sentContract = sendSpy.mock.calls[0][0].params?.contract as any
    expect(sentContract.to).toBe('0xrecipient1')
    expect(sentContract.address).toBe('0xcontract2')
  })
})
