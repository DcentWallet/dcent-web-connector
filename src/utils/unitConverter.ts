/**
 * v2 facade — unitConverter (m08-01-01)
 *
 * v1 src-v1/utils/unit-converter.js의 동작을 .ts로 옮긴 버전.
 * 시그니처와 반환값은 v1과 1:1 호환:
 *   `unitConverter(val, decimal)` → `{ num: string, bignum: BigNumber }`
 *
 * v1 동작 보존 사항:
 *   - val은 string만 허용 (number 입력은 throw — `Please pass numbers as strings...`)
 *   - val은 정규식 `^-?[0-9.]+$`만 통과
 *   - val이 `'.'`이면 throw (`invalid value`)
 *   - decimal은 number로 강제 변환 후 사용
 *   - 음수 처리: 앞에 `-` 제거 후 양수로 계산하고 마지막에 -1 곱함
 *   - 분수 부분이 baseLength보다 길면 throw (`too many decimal places`)
 *   - 분수 부분이 baseLength보다 짧으면 우측 0으로 패딩
 *
 * 주의: BigNumber 산술은 v1과 동일하게 bignumber.js 인스턴스를 사용.
 */

import BigNumber from 'bignumber.js'

export interface UnitConvertResult {
  num: string
  bignum: BigNumber
}

export function unitConverter (val: string, decimal: number | string): UnitConvertResult {
  const dec = Number(decimal)

  // v1 호환 검증 — 메시지 문구도 동일
  if (typeof val !== 'string') {
    throw new Error('Please pass numbers as strings to avoid precision errors.')
  }
  if (!val.match(/^-?[0-9.]+$/)) {
    throw new Error(
      `while converting number to string, invalid number value '${val}', should be a number matching (^-?[0-9.]+).`,
    )
  }

  let ether: string = val
  const baseString = (10 ** dec).toString(10)
  const base = new BigNumber(baseString)
  const baseLength = dec || 1

  const negative = ether.substring(0, 1) === '-'
  if (negative) {
    ether = ether.substring(1)
  }

  if (ether === '.') {
    throw new Error(`while converting number ${val} to wei, invalid value`)
  }

  const comps = ether.split('.')
  if (comps.length > 2) {
    throw new Error(`while converting number ${val} to wei,  too many decimal points`)
  }

  let whole = comps[0]
  let fraction = comps[1]

  if (!whole) whole = '0'
  if (!fraction) fraction = '0'
  if (fraction.length > baseLength) {
    throw new Error(
      `while converting number ${val} to wei, too many decimal places fraction.length ${fraction.length}, base ${base.toString(10)}`,
    )
  }
  while (fraction.length < baseLength) {
    fraction += '0'
  }

  const wholeBN = new BigNumber(whole)
  const fractionBN = new BigNumber(fraction)
  let wei = wholeBN.times(base).plus(fractionBN)

  if (negative) {
    wei = wei.times(new BigNumber(-1))
  }

  const weiValue = new BigNumber(wei.toString(10), 10)
  return {
    num: weiValue.toString(10),
    bignum: weiValue,
  }
}
