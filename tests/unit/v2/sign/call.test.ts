/**
 * call.ts (_call) 단위 테스트 (m08-01-02)
 *
 * T-U-CALL-01: _call({method: 'info'}) — transport.send 호출 + V1Response 반환
 * T-U-CALL-02a: pre-handshake popup close → pop-up_closed (DISCONNECTED 4900 매핑)
 * T-U-CALL-02b: mid-send popup close → 동일 close 경로 (D-07: DISCONNECTED 4900 단일 매핑)
 * T-U-CALL-03: timeout → time_out (TIMEOUT 5006 → time_out)
 * T-U-CALL-04: transaction + user_cancel 응답 → reject 아닌 resolve (v1 특례, _call은 V1Response 반환만)
 * T-U-CALL-05: getDeviceInfo response → V1Response.body.parameter.device_id 보존
 * T-U-CALL-06: header.response_from === 'czone' 응답 → _call이 그대로 통과
 * T-MUT-RESP-01: 두 번 _call 호출 → 두 V1Response가 서로 다른 객체 reference
 * T-MUT-RESP-02: V1Response.body.parameter mutation이 다음 _call에 leak 안 됨
 */

import { _call } from '../../../../src/sign/call'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'
import { ProviderError } from '../../../../src/error/ProviderError'
import { ErrorCode } from '../../../../src/error/ErrorCode'
import type { V1Response } from '../../../../src/sign/types'

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

describe('_call — happy path', () => {
  test('T-U-CALL-01: transport.send 호출 + V1Response 반환 (raw payload wrap)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-1',
      result: { device_id: 'D123' },
    })

    const resp = await _call({ method: 'info' })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0]).toMatchObject({
      method: 'info',
    })
    expect(typeof sendSpy.mock.calls[0][0].id).toBe('string')

    expect(resp.header.status).toBe('success')
    expect(resp.header.version).toBe('1.0')
    expect(resp.header.response_from).toBe('info')
    expect(resp.body.command).toBe('info')
    expect(resp.body.parameter).toEqual({ device_id: 'D123' })
  })

  test('T-U-CALL-05: getDeviceInfo — popup이 v1 형식으로 응답 (이미 header/body) → 그대로 통과', async () => {
    const { transport } = ensureSingleton()
    const popupV1Response = {
      header: { version: '1.0', status: 'success' as const, response_from: 'getDeviceInfo' },
      body: { command: 'getDeviceInfo', parameter: { device_id: 'D456', label: 'mylabel' } },
    }
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-5',
      result: popupV1Response,
    })

    const resp = await _call({ method: 'getDeviceInfo' })
    expect(resp.body.parameter?.device_id).toBe('D456')
    expect(resp.body.parameter?.label).toBe('mylabel')
    expect(resp.body.command).toBe('getDeviceInfo')
  })

  test('T-U-CALL-06: response_from === czone 응답 → 그대로 통과 (coinType 복원은 호출자 레이어 책임)', async () => {
    const { transport } = ensureSingleton()
    const popupV1Response = {
      header: { version: '1.0', status: 'success' as const, response_from: 'czone' },
      body: { command: 'getAddress', parameter: { address: '0xabc' } },
    }
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-6',
      result: popupV1Response,
    })

    const resp = await _call({ method: 'getAddress' })
    expect(resp.header.response_from).toBe('czone')
    expect(resp.body.parameter?.address).toBe('0xabc')
  })
})

describe('_call — popup close / timeout', () => {
  test('T-U-CALL-02a: pre-handshake popup close → pop-up_closed', async () => {
    const { transport } = ensureSingleton()
    jest
      .spyOn(transport, 'send')
      .mockRejectedValue(
        new ProviderError(ErrorCode.DISCONNECTED, 'Transport closed before handshake completed'),
      )

    const resp = await _call({ method: 'info' })
    expect(resp.header.status).toBe('failure')
    expect(resp.body.error?.code).toBe('pop-up_closed')
  })

  test('T-U-CALL-02b: mid-send popup close → 동일 pop-up_closed (D-07: DISCONNECTED 단일 매핑)', async () => {
    const { transport } = ensureSingleton()
    jest
      .spyOn(transport, 'send')
      .mockRejectedValue(
        new ProviderError(ErrorCode.DISCONNECTED, 'Transport closed before response (id=xyz)'),
      )

    const resp = await _call({ method: 'eth_signTransaction' })
    expect(resp.header.status).toBe('failure')
    expect(resp.body.error?.code).toBe('pop-up_closed')
  })

  test('T-U-CALL-03: timeout → time_out', async () => {
    const { transport } = ensureSingleton()
    jest
      .spyOn(transport, 'send')
      .mockRejectedValue(
        new ProviderError(ErrorCode.TIMEOUT, 'Request timed out after 30000ms (id=abc)'),
      )

    const resp = await _call({ method: 'info' })
    expect(resp.header.status).toBe('failure')
    expect(resp.body.error?.code).toBe('time_out')
  })
})

describe('_call — transaction.user_cancel 특례 (v1 호환)', () => {
  test('T-U-CALL-04: popup이 status=failure + transaction.user_cancel 응답 → V1Response 그대로 반환 (throw 안 함)', async () => {
    const { transport } = ensureSingleton()
    const popupV1Response = {
      header: { version: '1.0', status: 'failure' as const, response_from: 'czone' },
      body: {
        command: 'transaction',
        error: { code: 'user_cancel', message: 'user cancelled' },
      },
    }
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-4',
      result: popupV1Response,
    })

    // _call은 v1 호환으로 throw 없이 V1Response 그대로 반환
    const resp = await _call({ method: 'eth_signTransaction' })
    expect(resp.header.status).toBe('failure')
    expect(resp.body.command).toBe('transaction')
    expect(resp.body.error?.code).toBe('user_cancel')
  })
})

describe('_call — mutation 격리 (T-MUT-RESP)', () => {
  test('T-MUT-RESP-01: 두 번 _call 호출 → 두 V1Response가 서로 다른 객체 reference', async () => {
    const { transport } = ensureSingleton()
    // 같은 popup 응답 객체를 두 번 반환 (가장 까다로운 케이스 — shared reference 검증)
    const sharedPopupResponse = {
      header: { version: '1.0', status: 'success' as const, response_from: 'info' },
      body: { command: 'info', parameter: { device_id: 'shared' } },
    }
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-mut',
      result: sharedPopupResponse,
    })

    const a = await _call({ method: 'info' })
    const b = await _call({ method: 'info' })

    expect(a).not.toBe(b)
    expect(a.body).not.toBe(b.body)
    expect(a.body.parameter).not.toBe(b.body.parameter)
    // 그러나 동일 값
    expect(a.body.parameter?.device_id).toBe('shared')
    expect(b.body.parameter?.device_id).toBe('shared')
  })

  test('T-MUT-RESP-02: 반환된 V1Response.body.parameter mutation이 다음 _call에 leak 안 됨', async () => {
    const { transport } = ensureSingleton()
    const sharedPopupResponse = {
      header: { version: '1.0', status: 'success' as const, response_from: 'info' },
      body: { command: 'info', parameter: { device_id: 'D1', label: 'orig' } },
    }
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-mut2',
      result: sharedPopupResponse,
    })

    const a = await _call({ method: 'info' })
    // dApp이 반환된 parameter를 in-place 변경
    if (a.body.parameter) {
      a.body.parameter.label = 'mutated'
    }

    const b = await _call({ method: 'info' })
    expect(b.body.parameter?.label).toBe('orig')
  })

  test('T-MUT-RESP-02b: raw payload wrap 케이스도 mutation 격리', async () => {
    const { transport } = ensureSingleton()
    const sharedRawResult = { device_id: 'raw1', label: 'raw_orig' }
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-mut3',
      result: sharedRawResult,
    })

    const a = await _call({ method: 'info' })
    if (a.body.parameter) {
      a.body.parameter.label = 'mutated'
    }
    const b = await _call({ method: 'info' })
    expect(b.body.parameter?.label).toBe('raw_orig')
  })
})

describe('_call — envelope.error 분기', () => {
  test('envelope.error code 보존 — TIMEOUT(5006) → time_out (JSON-RPC/EIP-1193 표준 의미 보존)', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-env-err',
      error: { code: 5006, message: 'envelope timeout' },
    })

    const resp: V1Response = await _call({ method: 'info' })
    expect(resp.header.status).toBe('failure')
    expect(resp.body.error?.code).toBe('time_out')
    expect(resp.body.error?.message).toBe('envelope timeout')
  })

  test('envelope.error code 보존 — METHOD_NOT_FOUND(-32601) → method_not_found', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-env-err-2',
      error: { code: -32601, message: 'unknown method' },
    })

    const resp: V1Response = await _call({ method: 'info' })
    expect(resp.body.error?.code).toBe('method_not_found')
    expect(resp.body.error?.message).toBe('unknown method')
  })

  test('envelope.error code 보존 — INVALID_PARAMS(-32602) → param_error', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-env-err-3',
      error: { code: -32602, message: 'bad params' },
    })

    const resp: V1Response = await _call({ method: 'info' })
    expect(resp.body.error?.code).toBe('param_error')
  })

  test('envelope.error 매핑 안 되는 code → internal_error fallback', async () => {
    const { transport } = ensureSingleton()
    jest.spyOn(transport, 'send').mockResolvedValue({
      id: 'req-env-err-4',
      error: { code: 99999, message: 'unknown code' },
    })

    const resp: V1Response = await _call({ method: 'info' })
    expect(resp.body.error?.code).toBe('internal_error')
    expect(resp.body.error?.message).toBe('unknown code')
  })
})
