/**
 * 최소 Bitcoin 트랜잭션 디코더 — preset 의 prevout scriptPubKey 를 **구조적으로** 읽기 위한 것.
 *
 * 🔴 **정규식으로 읽지 않는다.** prevout script 길이가 바뀌면 그 앞의 varint 도 함께 바뀌는데,
 *    정규식은 그 드리프트를 조용히 통과시킨다(= 게이트가 죽어도 초록). 커서로 바이트를 세고
 *    **끝까지 정확히 소비했는지**까지 단언해야 길이 축이 실제로 검증된다.
 *
 * 리포에 `bitcoinjs-lib` 가 없고(런타임 의존 2개만 유지하는 published 패키지다) 서명·스크립트
 * 실행은 필요 없으므로, 파싱에 필요한 최소 문법만 여기 둔다.
 */

/** 알려진 wire input txType(= `src/types/bitcoinTxType.ts` 의 `KnownBitcoinWireTxType`)의 script 종류. */
export type ScriptKind = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr'

export interface DecodedTxOutput {
  valueSat: number
  scriptHex: string
}
export interface DecodedTx {
  version: number
  segwit: boolean
  inputs: Array<{ hash: string; index: number; scriptSig: string; sequence: number }>
  outputs: DecodedTxOutput[]
  locktime: number
}

const hexToBytes = (hex: string): Uint8Array => {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0) {
    throw new Error(`bad hex length: ${hex === undefined ? 'undefined' : hex.length}`)
  }
  // 🔴 문자 집합을 **먼저** 통째로 검사한다 — `Number.parseInt` 에 맡기면 안 된다.
  //    `parseInt('-1', 16)` 은 NaN 이 아니라 **-1** 을 돌려준다(앞의 부호를 정상 파싱).
  //    그래서 NaN 검사만으로는 `-1` 이 섞인 hex 가 조용히 통과한다 — 실제로 그 구멍으로
  //    sequence 를 `(-1).toString(16)` 으로 만든 preset 7건이 이 게이트를 초록으로 지나갔고,
  //    실기기에서 wm 이 `input.rawTransaction must be hex string` 으로 잡아냈다(2026-09-11).
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    const at = [...hex].findIndex((c) => !/[0-9a-fA-F]/.test(c))
    throw new Error(`bad hex char at ${at}: ${JSON.stringify(hex.slice(Math.max(0, at - 8), at + 8))}`)
  }
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.substr(i * 2, 2), 16)
  }
  return out
}

const bytesToHex = (b: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0')
  return s
}

class Cursor {
  private i = 0
  constructor (private readonly b: Uint8Array) {}
  take (n: number): Uint8Array {
    if (n < 0 || this.i + n > this.b.length) throw new Error(`truncated: need ${n} at ${this.i}/${this.b.length}`)
    const s = this.b.subarray(this.i, this.i + n)
    this.i += n
    return s
  }
  u32 (): number {
    const b = this.take(4)
    return b[0] | (b[1] << 8) | (b[2] << 16) | b[3] * 0x1000000
  }
  u64 (): number {
    const b = this.take(8)
    let v = 0
    for (let k = 7; k >= 0; k--) v = v * 256 + b[k]
    return v
  }
  varint (): number {
    const p = this.take(1)[0]
    if (p < 0xfd) return p
    if (p === 0xfd) { const b = this.take(2); return b[0] | (b[1] << 8) }
    if (p === 0xfe) return this.u32()
    return this.u64()
  }
  peek (n: number): number { return this.i + n < this.b.length ? this.b[this.i + n] : -1 }
  get pos (): number { return this.i }
  get len (): number { return this.b.length }
}

/**
 * raw tx hex 를 디코드한다. 남는 바이트가 있으면 throw — 길이 축이 어긋난 hex 를 "파싱 성공" 으로
 * 넘기지 않기 위한 것이다.
 */
export const decodeRawTx = (hex: string): DecodedTx => {
  const c = new Cursor(hexToBytes(hex))
  const version = c.u32()
  let segwit = false
  if (c.peek(0) === 0x00 && c.peek(1) === 0x01) { c.take(2); segwit = true }
  const nIn = c.varint()
  if (nIn === 0) throw new Error('vin count 0')
  const inputs: DecodedTx['inputs'] = []
  for (let i = 0; i < nIn; i++) {
    const hash = bytesToHex(c.take(32))
    const index = c.u32()
    const scriptSig = bytesToHex(c.take(c.varint()))
    const sequence = c.u32()
    inputs.push({ hash, index, scriptSig, sequence })
  }
  const nOut = c.varint()
  const outputs: DecodedTxOutput[] = []
  for (let i = 0; i < nOut; i++) {
    const valueSat = c.u64()
    outputs.push({ valueSat, scriptHex: bytesToHex(c.take(c.varint())) })
  }
  if (segwit) {
    for (let i = 0; i < nIn; i++) {
      const nw = c.varint()
      for (let w = 0; w < nw; w++) c.take(c.varint())
    }
  }
  const locktime = c.u32()
  if (c.pos !== c.len) throw new Error(`trailing bytes: consumed ${c.pos} of ${c.len}`)
  return { version, segwit, inputs, outputs, locktime }
}

/**
 * scriptPubKey hex → script 종류. 알려진 5종 중 어느 것도 아니면 `null`.
 * 🔴 opcode 와 **길이를 함께** 본다 — 길이를 빼면 payload 가 잘린 script 가 통과한다.
 */
export const classifyScriptPubKey = (hex: string): ScriptKind | null => {
  const b = hexToBytes(hex)
  if (b.length === 25 && b[0] === 0x76 && b[1] === 0xa9 && b[2] === 0x14 && b[23] === 0x88 && b[24] === 0xac) return 'p2pkh'
  if (b.length === 23 && b[0] === 0xa9 && b[1] === 0x14 && b[22] === 0x87) return 'p2sh'
  if (b.length === 22 && b[0] === 0x00 && b[1] === 0x14) return 'p2wpkh'
  if (b.length === 34 && b[0] === 0x00 && b[1] === 0x20) return 'p2wsh'
  if (b.length === 34 && b[0] === 0x51 && b[1] === 0x20) return 'p2tr'
  return null
}
