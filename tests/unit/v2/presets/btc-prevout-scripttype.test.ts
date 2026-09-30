/**
 * DC-4379 — BTC preset 의 `txType` ↔ **실제 prevout scriptPubKey** 전수 게이트.
 *
 * 배경: preset 들이 같은 더미 `rawTransaction` 을 복제해 쓰면서, `p2wpkh`/`p2sh`/`p2tr` 을 선언한
 * 7건의 prevout 이 전부 **P2PKH**(`76a914…88ac`)였다. taproot 만 드러난 이유는 wm 에 `p2tr` 전용
 * prevout shape 게이트가 있기 때문이고(`-32602 … not witness-v1`), 나머지는 검사가 없어 **조용히**
 * 지나갔다. 7년 동안 아무도 못 본 근본 원인은 **어떤 테스트도 preset 의 rawTransaction 을 파싱하지
 * 않았다**는 것이다 — 이 파일이 그 구멍을 닫는다.
 *
 * 🔴 실기기 경로에서는 `Prepare`(또는 playground 의 prevout 합성)가 실제 UTXO 주소로
 *    `rawTransaction` 을 덮어쓴다. 이 더미가 쓰이는 것은 그 단계를 **건너뛰는** 경로다
 *    (시뮬레이터 E2E · 단위 테스트 · Prepare 없이 Sign 직행).
 */
import nonEvmPresets from '../../../../playground/presets.non-evm.json'
import bitcoinTxPresets from '../../../../playground/presets.bitcoin-tx.json'
import { decodeRawTx, classifyScriptPubKey } from './helpers/btcRawTx'

/** 검사 대상 하나 — 어느 파일/preset 의 몇 번째 input 인지까지 이름에 담는다. */
interface Subject {
  file: string
  presetId: string
  inputIdx: number
  txType: string
  rawTx: string
  outIndex: number
}

type NonEvmPreset = {
  id: string
  family?: string
  transaction?: { inputs?: Array<{ rawTransaction?: unknown; index?: unknown; txType?: unknown }> }
}
type BtxPreset = { id: string; input?: { prev_tx?: unknown; utxo_idx?: unknown; type?: unknown } }

const subjects: Subject[] = []

for (const p of nonEvmPresets as NonEvmPreset[]) {
  const inputs = p.transaction?.inputs ?? []
  inputs.forEach((inp, i) => {
    if (typeof inp.rawTransaction !== 'string') return
    expect(typeof inp.txType).toBe('string')
    expect(typeof inp.index).toBe('number')
    subjects.push({
      file: 'presets.non-evm.json',
      presetId: p.id,
      inputIdx: i,
      txType: inp.txType as string,
      rawTx: inp.rawTransaction,
      outIndex: inp.index as number,
    })
  })
}

for (const p of bitcoinTxPresets as BtxPreset[]) {
  const inp = p.input
  if (!inp || typeof inp.prev_tx !== 'string') continue
  expect(typeof inp.type).toBe('string')
  expect(typeof inp.utxo_idx).toBe('number')
  subjects.push({
    file: 'presets.bitcoin-tx.json',
    presetId: p.id,
    inputIdx: 0,
    txType: inp.type as string,
    rawTx: inp.prev_tx,
    outIndex: inp.utxo_idx as number,
  })
}

/**
 * 🔴 **모수 floor** — 검사 대상이 0건이어도 초록이면 "preset 을 지우는 것" 이 게이트를 통과하는
 *    가장 싼 길이 된다. 파일별 하한과 **txType 종류** 하한을 함께 건다: 종류 하한이 없으면
 *    `p2tr` preset 만 전부 지워도 개수 floor 는 그대로라 통과해버린다.
 */
const FLOOR_NON_EVM = 10
const FLOOR_BITCOIN_TX = 2
const REQUIRED_TX_TYPES = ['p2pkh', 'p2sh', 'p2wpkh', 'p2tr'] as const

describe('BTC preset prevout scriptPubKey ↔ inputs[].txType (DC-4379 전수 게이트)', () => {
  it('모수 floor — 검사 대상이 줄어드는 것 자체를 실패로 본다', () => {
    const nonEvm = subjects.filter((s) => s.file === 'presets.non-evm.json')
    const btx = subjects.filter((s) => s.file === 'presets.bitcoin-tx.json')
    expect(nonEvm.length).toBeGreaterThanOrEqual(FLOOR_NON_EVM)
    expect(btx.length).toBeGreaterThanOrEqual(FLOOR_BITCOIN_TX)
    for (const t of REQUIRED_TX_TYPES) {
      expect(subjects.filter((s) => s.txType === t).length).toBeGreaterThanOrEqual(1)
    }
  })

  it.each(subjects.map((s) => [`${s.file} · ${s.presetId} · inputs[${s.inputIdx}] (${s.txType})`, s] as const))(
    '%s — prevout script 가 선언한 txType 과 같은 종류다',
    (_name, s) => {
      const tx = decodeRawTx(s.rawTx)
      const out = tx.outputs[s.outIndex]
      expect(out).toBeDefined()
      // 🔴 classify 결과를 그대로 비교한다 — `toContain`/접두사 매칭은 p2wpkh↔p2wsh 를 구별 못 한다.
      expect(classifyScriptPubKey(out.scriptHex)).toBe(s.txType)
    },
  )
})

describe('디코더 자체의 판별력 (이게 죽으면 위 게이트가 조용히 초록이 된다)', () => {
  const RAW = subjects[0].rawTx

  // 🔴 실기기에서 잡힌 실결함의 회귀 (2026-09-11) — 이 케이스가 없으면 게이트가 거짓 초록이 된다.
  //    sequence 를 `(-1).toString(16)` 으로 만들면 `'-1'` 이 박히는데,
  //    `Number.parseInt('-1', 16)` 은 NaN 이 **아니라** -1 이라 NaN 검사만으로는 통과한다.
  //    그 구멍으로 preset 7건이 깨진 채 이 스위트를 초록으로 지나갔고, wm 이
  //    `input.rawTransaction must be hex string` 으로 뒤늦게 잡았다.
  it("부호가 섞인 hex('-1')를 거부한다 — parseInt 가 NaN 을 안 주는 자리", () => {
    // 정상 tx 의 sequence(ffffffff)를 -1-1-1-1 로 바꾼 것 = 당시 실제 데이터
    const good = RAW
    const broken = good.replace('ffffffff', '-1-1-1-1')
    expect(broken).not.toBe(good)
    expect(() => decodeRawTx(broken)).toThrow(/bad hex char/)
  })

  it('hex 문자만 받는다 — 공백·접두사도 거부', () => {
    expect(() => decodeRawTx('0x' + RAW)).toThrow(/bad hex/)
    expect(() => decodeRawTx(RAW.slice(0, -2) + ' 0')).toThrow(/bad hex/)
  })

  it('끝까지 소비하지 못한 hex 는 파싱 성공으로 넘기지 않는다', () => {
    expect(() => decodeRawTx(RAW + '00')).toThrow(/trailing bytes/)
    expect(() => decodeRawTx(RAW.slice(0, RAW.length - 4))).toThrow()
  })

  it('script 종류를 opcode + 길이로 구별한다', () => {
    const h20 = '11'.repeat(20)
    const h32 = '22'.repeat(32)
    expect(classifyScriptPubKey(`76a914${h20}88ac`)).toBe('p2pkh')
    expect(classifyScriptPubKey(`a914${h20}87`)).toBe('p2sh')
    expect(classifyScriptPubKey(`0014${h20}`)).toBe('p2wpkh')
    expect(classifyScriptPubKey(`0020${h32}`)).toBe('p2wsh')
    expect(classifyScriptPubKey(`5120${h32}`)).toBe('p2tr')
    // payload 길이가 어긋나면 종류로 인정하지 않는다 (opcode 만 보는 구현이면 여기서 잡힌다)
    expect(classifyScriptPubKey(`0014${'11'.repeat(19)}`)).toBeNull()
    expect(classifyScriptPubKey(`5120${'22'.repeat(31)}`)).toBeNull()
  })
})
