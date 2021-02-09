module.exports = (str) => {
  if (!str.startsWith('0x')) {
    if (str.startsWith('xdc')) {
      str = '0x' + str.substring(3)
    } else {
      str = '0x' + str.address
    }
  }
  return str
}
