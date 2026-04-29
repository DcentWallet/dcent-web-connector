const isDebug = process.env.NODE_ENV !== 'production'
const isTest = process.env.NODE_ENV === 'test'

const normalizeCallerLine = (line) => {
    if (line.indexOf('at ') < 0) {
        return line
    }

    var index = line.indexOf('at ')
    var clean = line.slice(index + 3, line.length)
    var block = clean.split(' ')
    // console.log(block)

    var funcName = block[0]
    var filePath = block[1]
    var normalized = ''
    var pathArray = filePath.split(/\\|\//)
    normalized = pathArray[pathArray.length - 1]
    normalized = normalized.replace(')', '')
    normalized = normalized + ':' + funcName

    return normalized
}

let info = console.log.bind(console, '[INFO] ') // eslint-disable-line no-console
if (isTest) {
    info = () => { }
}

let debug = console.log.bind(console, '[DEBUG] ') // eslint-disable-line no-console
if (!isDebug) {
    debug = () => { }
}
if (isTest) {
    debug = () => { }
}

const warn = console.warn.bind(console, '[WARN] ') // eslint-disable-line no-console
const error = console.error.bind(console, '[ERROR] ') // eslint-disable-line no-console
const test = console.warn.bind(console, '[TEST] ') // eslint-disable-line no-console

const NOT_IMPLEMENTED = function () {
    var callerLine = (new Error()).stack.toString().split(/\r\n|\n/)[2]
    var clean = normalizeCallerLine(callerLine)
    console.log('[NOT_IMPLEMENTED]' + clean) // eslint-disable-line no-console
    throw new Error('NOT_IMPLEMENTED')
}

module.exports = {
    test,
    info,
    debug,
    warn,
    error,
    NOT_IMPLEMENTED,
}
