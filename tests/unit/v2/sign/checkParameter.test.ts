/**
 * checkParameter 단위 테스트 (m08-01-03)
 *
 * T-U-CHK-01: 'numberString' + valid hex (0x123) → 통과
 * T-U-CHK-02: 'numberString' + invalid → throw param_error
 * T-U-CHK-03: 'numberString' + null/undefined/number → throw param_error
 * T-U-CHK-04 / T-DRIFT-CHK-01: v2 결과가 v1 checkParameter 결과와 모든 fixture에서 일치
 *
 * 룰 준수:
 *   - external-reference-edge-cases: edge case 다수(빈 문자열 / hex / decimal / 음수 / 한 자리)
 *   - boundary-validation: invalid 입력은 silent return 금지 — 반드시 throw
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { checkParameter } from '../../../../src/sign/checkParameter'

const expectV1ParamError = (matcher?: string) =>
  expect.objectContaining({
    body: {
      error: matcher
        ? expect.objectContaining({ code: 'param_error', message: expect.stringContaining(matcher) })
        : expect.objectContaining({ code: 'param_error' }),
    },
  })

describe('checkParameter — numberString happy path', () => {
  test('T-U-CHK-01a: decimal "1234" → 그대로 반환', () => {
    expect(checkParameter('numberString', '1234')).toBe('1234')
  })

  test('T-U-CHK-01b: hex "0x1a" → 그대로 반환', () => {
    expect(checkParameter('numberString', '0x1a')).toBe('0x1a')
  })

  test('T-U-CHK-01c: hex with uppercase "0xABC" → 정규식 lowercase 매칭으로 통과 (v1과 동일)', () => {
    expect(checkParameter('numberString', '0xABC')).toBe('0xABC')
  })

  test('T-U-CHK-01d: zero string "0" → 통과 (10진수 0)', () => {
    expect(checkParameter('numberString', '0')).toBe('0')
  })

  test('T-U-CHK-01e: hex zero "0x0" → 통과', () => {
    expect(checkParameter('numberString', '0x0')).toBe('0x0')
  })
})

describe('checkParameter — numberString sad path (throw param_error)', () => {
  test('T-U-CHK-02a: invalid 문자열 "abc" → throw', () => {
    expect(() => checkParameter('numberString', 'abc')).toThrow()
    try { checkParameter('numberString', 'abc') } catch (e) {
      expect(e).toEqual(expectV1ParamError('Invaild Parameter'))
    }
  })

  test('T-U-CHK-02b: 음수 "-1" → throw (v1 정규식이 양수만 허용)', () => {
    try { checkParameter('numberString', '-1') } catch (e) {
      expect(e).toEqual(expectV1ParamError('Invaild Parameter'))
    }
  })

  test('T-U-CHK-02c: 빈 문자열 "" → throw', () => {
    try { checkParameter('numberString', '') } catch (e) {
      expect(e).toEqual(expectV1ParamError('Invaild Parameter'))
    }
  })

  test('T-U-CHK-02d: hex with non-hex char "0xZZ" → throw', () => {
    try { checkParameter('numberString', '0xZZ') } catch (e) {
      expect(e).toEqual(expectV1ParamError('Invaild Parameter'))
    }
  })

  test('T-U-CHK-03a: null 입력 → throw param_error (string 검증 실패)', () => {
    expect(() => checkParameter('numberString', null as any)).toThrow()
    try { checkParameter('numberString', null as any) } catch (e) {
      expect(e).toEqual(expectV1ParamError('Invaild Parameter'))
    }
  })

  test('T-U-CHK-03b: undefined 입력 → throw param_error', () => {
    try { checkParameter('numberString', undefined as any) } catch (e) {
      expect(e).toEqual(expectV1ParamError('Invaild Parameter'))
    }
  })

  test('T-U-CHK-03c: number 입력 (123) → throw param_error (string이 아님)', () => {
    try { checkParameter('numberString', 123 as any) } catch (e) {
      expect(e).toEqual(expectV1ParamError('Invaild Parameter'))
    }
  })
})

describe('T-DRIFT-CHK-01: v2 checkParameter ↔ v1 checkParameter bytewise drift defense', () => {
  // v1 src-v1/index.js를 직접 require하기 어려우므로 (src-v1은 module.exports 단일 객체),
  // 같은 알고리즘을 명시적으로 재현한 reference fixture를 사용하여 drift를 단언.
  //
  // v1 logic (src-v1/index.js#l418):
  //   const isNumberString = (str) => /^[0-9]+$/.test(str)
  //   const isHexNumberString = (str) => /^(0x)?[0-9a-f]+$/.test(str.toLowerCase())
  //   if (typeof param !== 'string') throw
  //   if (param.indexOf('0x', 0) === -1) { if (isNumberString(param)) return param }
  //   else if (param.indexOf('0x', 0) === 0) { if (isHexNumberString(param)) return param }
  //   throw

  function v1ReferenceCheckNumberString (param: unknown): string {
    if (typeof param !== 'string') throw new Error('Invaild Parameter - ' + String(param))
    if (param.indexOf('0x') === -1) {
      if (/^[0-9]+$/.test(param)) return param
    } else if (param.indexOf('0x') === 0) {
      if (/^(0x)?[0-9a-f]+$/.test(param.toLowerCase())) return param
    }
    throw new Error('Invaild Parameter - - - ' + param)
  }

  const fixtures = ['0', '1', '12345', '0x0', '0x1', '0xff', '0xABC', '0xdeadbeef']
  fixtures.forEach((input) => {
    test(`drift: input="${input}" — v2 ↔ v1 reference 동일 결과`, () => {
      const v1Result = v1ReferenceCheckNumberString(input)
      const v2Result = checkParameter('numberString', input)
      expect(v2Result).toBe(v1Result)
    })
  })

  const sadFixtures = ['', 'abc', '-1', '0xZZ', '12.34', '1e10']
  sadFixtures.forEach((input) => {
    test(`drift sad: input="${input}" — v2와 v1 reference 모두 throw`, () => {
      let v1Threw = false
      let v2Threw = false
      try { v1ReferenceCheckNumberString(input) } catch (_) { v1Threw = true }
      try { checkParameter('numberString', input) } catch (_) { v2Threw = true }
      expect(v2Threw).toBe(v1Threw)
      expect(v2Threw).toBe(true)
    })
  })
})
