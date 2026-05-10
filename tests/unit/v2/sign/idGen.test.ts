/**
 * idGen.ts 단위 테스트 (m08-01-02)
 *
 * T-U-IDGEN-01: _genId() — 매 호출마다 다른 string 반환
 */

import { _genId } from '../../../../src/sign/idGen'

describe('idGen — _genId', () => {
  test('T-U-IDGEN-01: 매 호출마다 다른 string 반환', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(_genId())
    }
    expect(ids.size).toBe(100)
  })

  test('T-U-IDGEN-01b: 반환값은 string 타입', () => {
    expect(typeof _genId()).toBe('string')
  })

  test('T-U-IDGEN-01c: 반환값은 비어있지 않음', () => {
    expect(_genId().length).toBeGreaterThan(0)
  })
})
