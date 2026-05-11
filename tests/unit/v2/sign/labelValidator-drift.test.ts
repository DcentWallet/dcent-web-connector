/**
 * labelValidator drift 방어 테스트 (m08-01-02.5)
 *
 * v1 isAvaliableLabel (src-v1/index.js#l470-477) regex `/^[a-zA-Z\d.!#$%&\+\-_]{2,14}$/` 1:1.
 *
 * T-DRIFT-LABEL-01: valid 4종 + reject 5종 + 경계값
 */

import { isAvaliableLabel } from '../../../../src/sign/labelValidator'

describe('labelValidator drift — m08-01-02.5 (v1 regex 1:1)', () => {
  // 정상 케이스 — v1 regex가 허용하는 문자 집합 + 길이 2~14
  describe('T-DRIFT-LABEL-01: valid labels', () => {
    test.each([
      'ab', // 길이 2 (최소)
      'a-z_AZ09', // 영숫자 + - _
      'AAAAAAAAAAAAAA', // 길이 14 (최대)
      '.!#$%&+_-', // 모든 허용 특수문자
      'mywallet',
      'D-CENT_001',
    ])('valid "%s" → true', (label) => {
      expect(isAvaliableLabel(label)).toBe(true)
    })
  })

  // 거부 케이스 — regex unmatch
  describe('T-DRIFT-LABEL-01b: invalid labels', () => {
    test.each([
      '', // 빈 문자열 (falsy 가드)
      'a', // 길이 1 (< 2)
      'A'.repeat(15), // 길이 15 (> 14)
      '한글', // 비ASCII
      '한글라벨',
      'has space', // 공백 (regex 미허용)
      'has@email', // @ 미허용
      'with(paren)', // ( ) 미허용
      'with[bracket]', // [ ] 미허용
      'with/slash', // / 미허용
    ])('invalid "%s" → false', (label) => {
      expect(isAvaliableLabel(label)).toBe(false)
    })
  })

  // null/undefined도 falsy 가드로 false (런타임 검증)
  test('null → false', () => {
    expect(isAvaliableLabel(null as unknown as string)).toBe(false)
  })
  test('undefined → false', () => {
    expect(isAvaliableLabel(undefined as unknown as string)).toBe(false)
  })
})
