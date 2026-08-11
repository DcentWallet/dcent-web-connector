/**
 * 요청 방향 mutation-isolation 회귀 테스트 (PR #177 리뷰 P3).
 *
 * 결함: `sign()`이 `_validateSignPayload`로 검증한 payload와 **같은 참조**를 `_call`에 넘겼다.
 * `_call`은 SerialRequestQueue(`chain.then(task, task)`)로 요청을 직렬화하므로 검증 시점과
 * 실제 `transport.send`(→ postMessage 구조화 복제) 사이에 **실제 지연 창**이 생기고,
 * 그 사이 호출자가 payload를 in-place 변경하면 검증을 통과하지 않은 값이 서명 요청으로 나간다.
 *
 * 응답 방향은 `call.ts`의 `deepClonePlain`이 이미 격리하고 있어(T-MUT-RESP-01/02),
 * 요청 방향만 비어 있던 비대칭을 닫는다.
 *
 * 클래스 전수 (`_call`에 호출자 소유 참조를 넘기는 지점):
 *   - sign()            payload 객체        → T-MUT-REQ-01 / 02
 *   - selectAddress()   addresses 배열      → T-MUT-REQ-03
 *   - syncAccount()     _sanitizeSyncAccountItem이 새 객체 생성 → 이미 격리됨 (T-MUT-REQ-04)
 *   - getAddress / getPublicKey / getXPUB / setLabel — 원시값으로 새 객체 조립 → 비대상
 *
 * 각 테스트는 **큐 지연 창을 실제로 재현**한다 (선행 요청을 물려 send를 지연시킨 뒤 mutate).
 * 스냅샷을 되돌리면(원본 참조 전달) 전부 실패한다 — 뮤테이션 검증 완료.
 */

import { sign } from '../../../../src/sign/sign'
import { selectAddress, syncAccount } from '../../../../src/sign/configure'
import { ensureSingleton, _resetForTesting } from '../../../../src/singleton'

const OK_RESPONSE = {
  id: 'r',
  result: {
    header: { version: '1.0', status: 'success' as const },
    body: { command: 'transaction', parameter: { signed_tx: '0xsigned' } },
  },
}

beforeEach(() => {
  _resetForTesting()
})

afterAll(() => {
  _resetForTesting()
})

/**
 * transport.send를 gate로 감싼다. 첫 요청은 release()를 호출할 때까지 미완으로 붙잡아
 * SerialRequestQueue가 후속 요청을 대기시키는 **실제 지연 창**을 만든다.
 */
function installGatedTransport () {
  const { transport } = ensureSingleton()
  let releaseFirst: () => void = () => {}
  const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve })
  let callIndex = 0

  const sendSpy = jest.spyOn(transport, 'send').mockImplementation(async () => {
    const idx = callIndex++
    if (idx === 0) await firstHeld
    return OK_RESPONSE
  })

  return { sendSpy, releaseFirst }
}

describe('요청 방향 mutation-isolation — 검증한 값 == 전송한 값', () => {
  test('T-MUT-REQ-01: 큐 대기 중 payload를 변경해도 검증 시점 값이 전송된다', async () => {
    const { sendSpy, releaseFirst } = installGatedTransport()

    // (1) 선행 요청으로 큐를 점유 — 후속 요청의 send가 지연된다
    const blocker = sign({
      method: 'signTransaction',
      chainId: 'eip155:1',
      payload: { keyPath: "m/44'/60'/0'/0/0", transaction: { to: '0xaaa', value: '0x1' } },
    })

    // (2) 대상 요청 — 검증은 지금 통과하지만 send는 아직 실행되지 않는다
    const payload: Record<string, unknown> = {
      keyPath: "m/44'/60'/0'/0/0",
      transaction: { to: '0xVICTIM', value: '0x1' },
    }
    const target = sign({ method: 'signTransaction', chainId: 'eip155:1', payload })

    // (3) send 전에 호출자가 payload를 갈아치운다 (top-level + 중첩 둘 다)
    payload.keyPath = "m/44'/60'/0'/0/99"
    ;(payload.transaction as Record<string, unknown>).to = '0xATTACKER'
    ;(payload.transaction as Record<string, unknown>).value = '0xdeadbeef'

    releaseFirst()
    await Promise.all([blocker, target])

    expect(sendSpy).toHaveBeenCalledTimes(2)
    const sent = sendSpy.mock.calls[1][0].params as Record<string, unknown>
    expect(sent.keyPath).toBe("m/44'/60'/0'/0/0")
    expect(sent.transaction).toEqual({ to: '0xVICTIM', value: '0x1' })
  })

  test('T-MUT-REQ-02: 전송 envelope의 params가 호출자 payload와 다른 참조다', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue(OK_RESPONSE)

    const payload: Record<string, unknown> = {
      keyPath: "m/44'/60'/0'/0/0",
      transaction: { to: '0xdef' },
    }
    await sign({ method: 'signTransaction', chainId: 'eip155:1', payload })

    const sent = sendSpy.mock.calls[0][0].params as Record<string, unknown>
    // 값은 같지만 참조는 달라야 한다 — 중첩 객체까지 분리 (얕은 복사로는 통과 못 함)
    expect(sent).toEqual(payload)
    expect(sent).not.toBe(payload)
    expect(sent.transaction).not.toBe(payload.transaction)
  })

  test('T-MUT-REQ-03: selectAddress — 큐 대기 중 배열을 변경해도 호출 시점 값이 전송된다', async () => {
    const { sendSpy, releaseFirst } = installGatedTransport()

    const blocker = selectAddress(['0xblocker'])

    const addresses = ['0xVICTIM']
    const target = selectAddress(addresses)

    addresses.push('0xATTACKER')
    addresses[0] = '0xREPLACED'

    releaseFirst()
    await Promise.all([blocker, target])

    const sent = sendSpy.mock.calls[1][0].params as { addresses: string[] }
    expect(sent.addresses).toEqual(['0xVICTIM'])
    expect(sent.addresses).not.toBe(addresses)
  })

  test('T-MUT-REQ-04: syncAccount — sanitize 산출물이라 이미 격리됨 (회귀 고정)', async () => {
    const { sendSpy, releaseFirst } = installGatedTransport()

    const blocker = selectAddress(['0xblocker'])

    const items = [
      { chainId: 'eip155:1', keyPath: "m/44'/60'/0'/0/0", label: 'acct1' },
    ]
    const target = syncAccount(items)

    items[0].label = 'MUTATED'
    items.push({ chainId: 'eip155:1', keyPath: "m/44'/60'/0'/0/1", label: 'extra' })

    releaseFirst()
    await Promise.all([blocker, target])

    const sent = sendSpy.mock.calls[1][0].params as { accountInfos: Array<{ label: string }> }
    expect(sent.accountInfos).toHaveLength(1)
    expect(sent.accountInfos[0].label).toBe('acct1')
  })

  test('T-MUT-REQ-05: 비-cloneable payload는 기존 동작 보존 (원본 그대로 전달)', async () => {
    const { transport } = ensureSingleton()
    const sendSpy = jest.spyOn(transport, 'send').mockResolvedValue(OK_RESPONSE)

    // 함수 값은 structuredClone이 거부한다. JSON 라운드트립 폴백을 두면 함수가 조용히
    // 탈락해 **없던 성공 경로**가 생기므로, 폴백 없이 원본을 그대로 넘겨 기존 동작(=
    // postMessage가 동일하게 거부)을 보존한다.
    const payload: Record<string, unknown> = {
      keyPath: "m/44'/60'/0'/0/0",
      onDone: () => {},
    }
    await sign({ method: 'signTransaction', chainId: 'eip155:1', payload })

    expect(sendSpy.mock.calls[0][0].params).toBe(payload)
  })
})
