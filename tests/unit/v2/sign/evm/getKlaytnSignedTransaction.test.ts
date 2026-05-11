/**
 * getKlaytnSignedTransaction 단위 테스트 (m08-01-03)
 *
 * T-U-KLAY-01: legacy + KLAYTN + from 제공 → snake_case params
 * T-U-KLAY-02: from 미제공 → getAddress(KLAYTN, key) 호출, body.parameter.address 채워짐
 * T-U-KLAY-03: KLAY_BAOBAB → coinType이 KLAYTN으로 정규화되어 params 송신
 * T-U-KLAY-04: KCT_BAOBAB → coinType이 KLAYTN_KCT로 정규화
 * T-U-KLAY-05: KCT (contract 인자 있음) → contract.decimals 검증 + params에 contract 포함
 * T-U-KLAY-06: chainId !== number → throw param_error
 * T-U-KLAY-07: txType falsy → klaytnTxType.LEGACY (0xff) fallback
 *
 * Klaytn from 자동 채움은 m08-01-02.5의 getAddress 의존 — 본 테스트는 transport.send 2회 호출
 * (1번째: getAddress, 2번째: getKlaytnSignedTransaction)을 모두 spy로 검증.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getKlaytnSignedTransaction } from '../../../../../src/sign/evm'
import { klaytnTxType } from '../../../../../src/types/klaytnTxType'
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

describe('getKlaytnSignedTransaction — happy path (T-U-KLAY-01)', () => {
  test('T-U-KLAY-01: legacy KLAYTN + from 제공 → snake_case params', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r1', result: {} })

    await getKlaytnSignedTransaction(
      'klaytn', '0x1', '0x10', '0x21000', '0xrecipient', '0x100', '0x',
      "m/44'/8217'/0'/0/0", 8217, klaytnTxType.LEGACY, '0xfromaddr', '50'
    )

    expect(sendSpy).toHaveBeenCalledTimes(1) // from 제공이라 getAddress 호출 안 함
    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.method).toBe('getKlaytnSignedTransaction')
    expect(callArg.params).toMatchObject({
      coinType: 'klaytn',
      nonce: '0x1',
      gas_price: '0x10',
      gas_limit: '0x21000',
      to: '0xrecipient',
      value: '0x100',
      data: '0x',
      key: "m/44'/8217'/0'/0/0",
      chain_id: 8217,
      tx_type: klaytnTxType.LEGACY,
      from: '0xfromaddr',
      fee_ratio: '50',
    })
  })
})

describe('getKlaytnSignedTransaction — from 자동 채움 (T-U-KLAY-02)', () => {
  test('T-U-KLAY-02: from 미제공 + KLAYTN → getAddress 호출되어 body.parameter.address가 from에 채워짐', async () => {
    const { transport } = ensureSingleton()
    let callCount = 0
    const sendSpy = jest.spyOn(transport, 'send').mockImplementation(async () => {
      callCount += 1
      if (callCount === 1) {
        // 1st call = getAddress
        return { id: 'r-addr', result: { address: '0xautofilled', path: "m/44'/8217'/0'/0/0" } }
      }
      // 2nd call = getKlaytnSignedTransaction
      return { id: 'r-sign', result: {} }
    })

    await getKlaytnSignedTransaction(
      'klaytn', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
      "m/44'/8217'/0'/0/0", 8217, klaytnTxType.LEGACY
      // from / feeRatio / contract 미제공
    )

    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(sendSpy.mock.calls[0][0].method).toBe('getAddress')
    expect(sendSpy.mock.calls[0][0].params?.coinType).toBe('klaytn')

    const signCall = sendSpy.mock.calls[1][0]
    expect(signCall.method).toBe('getKlaytnSignedTransaction')
    expect(signCall.params?.from).toBe('0xautofilled')
  })
})

describe('getKlaytnSignedTransaction — coinType 정규화 (T-U-KLAY-03/04)', () => {
  test('T-U-KLAY-03: KLAY_BAOBAB (klaytn-testnet) → coinType이 KLAYTN으로 정규화', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r3', result: {} })

    await getKlaytnSignedTransaction(
      'klaytn-testnet', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
      "m/44'/8217'/0'/0/0", 1001, klaytnTxType.LEGACY, '0xfrom'
    )

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params?.coinType).toBe('klaytn') // KLAY_BAOBAB → KLAYTN
  })

  test('T-U-KLAY-04: KCT_BAOBAB (krc20-testnet) → coinType이 KLAYTN_KCT로 정규화', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r4', result: {} })

    await getKlaytnSignedTransaction(
      'krc20-testnet', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
      "m/44'/8217'/0'/0/0", 1001, klaytnTxType.LEGACY, '0xfrom'
    )

    expect(sendSpy.mock.calls[0][0].params?.coinType).toBe('klaytn-erc20') // KLAYTN_KCT value
  })

  test('T-U-KLAY-04b: 지원하지 않는 coinType → throw "coin_type_error"', async () => {
    await expect(
      getKlaytnSignedTransaction(
        'unknown', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
        "m/44'/8217'/0'/0/0", 8217, klaytnTxType.LEGACY, '0xfrom'
      )
    ).rejects.toEqual(expectV1Error('coin_type_error', 'not supported coin type'))
  })
})

describe('getKlaytnSignedTransaction — KCT contract 분기 (T-U-KLAY-05)', () => {
  test('T-U-KLAY-05: contract 인자 있음 → contract.decimals 검증 + params에 contract 포함', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r5', result: {} })

    const contract = {
      address: '0xtoken',
      symbol: 'KCT',
      decimals: '18', // numberString
      value: '0x100',
      to: '0xrecipient',
    }

    await getKlaytnSignedTransaction(
      'klaytn-erc20', '0x1', '0x10', '0x21000', '0xto', '0x0', '0x',
      "m/44'/8217'/0'/0/0", 8217, klaytnTxType.LEGACY, '0xfrom', undefined, contract
    )

    const callArg = sendSpy.mock.calls[0][0]
    expect(callArg.params?.contract).toEqual({
      address: '0xtoken',
      symbol: 'KCT',
      decimals: '18',
      value: '0x100',
      to: '0xrecipient',
    })
  })
})

describe('getKlaytnSignedTransaction — 인자 검증 (T-U-KLAY-06/07)', () => {
  test('T-U-KLAY-06: chainId !== number → throw param_error chainId 메시지', async () => {
    await expect(
      getKlaytnSignedTransaction(
        'klaytn', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
        "m/44'/8217'/0'/0/0", 'not-number' as any, klaytnTxType.LEGACY, '0xfrom'
      )
    ).rejects.toEqual(expectV1Error('param_error', 'Invaild Parameter chainId'))
  })

  test('T-U-KLAY-07: txType falsy (0) → klaytnTxType.LEGACY (0xff) fallback', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r7', result: {} })

    await getKlaytnSignedTransaction(
      'klaytn', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
      "m/44'/8217'/0'/0/0", 8217, 0 as any, '0xfrom'
    )

    expect(sendSpy.mock.calls[0][0].params?.tx_type).toBe(klaytnTxType.LEGACY)
  })

  test('T-U-KLAY-07b: txType undefined → klaytnTxType.LEGACY fallback', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r8', result: {} })

    await getKlaytnSignedTransaction(
      'klaytn', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
      "m/44'/8217'/0'/0/0", 8217, undefined as any, '0xfrom'
    )

    expect(sendSpy.mock.calls[0][0].params?.tx_type).toBe(klaytnTxType.LEGACY)
  })
})

describe('T-DRIFT-EVM-01 (Klaytn snake_case 단언)', () => {
  test('Klaytn wrapper의 _call params keys는 v1과 동일한 snake_case', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({ id: 'r-d', result: {} })

    await getKlaytnSignedTransaction(
      'klaytn', '0x1', '0x10', '0x21000', '0xto', '0x100', '0x',
      "m/44'/8217'/0'/0/0", 8217, klaytnTxType.LEGACY, '0xfrom', '50'
    )

    const params = sendSpy.mock.calls[0][0].params as Record<string, unknown>
    // snake_case keys 단언
    expect(Object.keys(params)).toEqual(
      expect.arrayContaining([
        'coinType', 'nonce', 'gas_price', 'gas_limit', 'to', 'value', 'data', 'key',
        'chain_id', 'tx_type', 'from', 'fee_ratio', 'contract',
      ])
    )
    // camelCase 변종 부재 확인
    expect(params).not.toHaveProperty('gasPrice')
    expect(params).not.toHaveProperty('gasLimit')
    expect(params).not.toHaveProperty('chainId')
    expect(params).not.toHaveProperty('txType')
    expect(params).not.toHaveProperty('feeRatio')
  })
})
