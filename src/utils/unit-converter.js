const BigNum = require('bignumber.js')

module.exports = (val, decimal) => {
  decimal = Number(decimal)

  // #
  // This code is implemented from '../../../node_modules/ethjs-unit/lib/index.js'

  if (typeof val !== 'string') {
      throw new Error('Please pass numbers as strings to avoid precision errors.')
  } else {
      if (!val.match(/^-?[0-9.]+$/)) {
          throw new Error('while converting number to string, invalid number value \'' + val + '\', should be a number matching (^-?[0-9.]+).')
      }
  }

  var ether = val  // eslint-disable-line
  var baseString = (10 ** (decimal)).toString(10)
  var base = BigNum(baseString)
  var baseLength = decimal || 1 // baseString.length - 1 || 1

  // Is it negative?
  var negative = ether.substring(0, 1) === '-'  // eslint-disable-line
  if (negative) {
    ether = ether.substring(1)
  }

  if (ether === '.') {
    throw new Error('while converting number ' + val + ' to wei, invalid value')
  }

  // Split it into a whole and fractional part
  var comps = ether.split('.')  // eslint-disable-line
  if (comps.length > 2) {
    throw new Error('while converting number ' + val + ' to wei,  too many decimal points')
  }

  var whole = comps[0]
      var fraction = comps[1]  // eslint-disable-line

  if (!whole) {
      whole = '0'
  }
  if (!fraction) {
      fraction = '0'
  }
  if (fraction.length > baseLength) {
      throw new Error('while converting number ' + val + ' to wei, too many decimal places ' + 'fraction.length ' + fraction.length + ', base ' + base)
  }

  while (fraction.length < baseLength) {
      fraction += '0'
  }

  whole = new BigNum(whole)
  fraction = new BigNum(fraction)
  var wei = whole.times(base).plus(fraction)  // eslint-disable-line

  if (negative) {
      wei = wei.times(BigNum(-1))
  }

  const weiValue = new BigNum(wei.toString(10), 10)
  return {
    num: weiValue.toString(10),
    bignum: weiValue
  }
}
