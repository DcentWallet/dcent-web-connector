/**
 * v2 Bitcoin transaction builder (m09-04-15)
 *
 * `getBitcoinTransactionObject` / `addBitcoinTransactionInput` / `addBitcoinTransactionOutput`는
 * wm v2 wire가 기대하는 **flat `BitcoinWireTransaction`**(`{ inputs[], outputs[] }`)을 직접 누적한다.
 * App은 별도 변환 없이 builder 산출물을 그대로 송신한다:
 *
 *   const tx = dcent.getBitcoinTransactionObject()
 *   dcent.addBitcoinTransactionInput(tx, prevTxHex, utxoIdx, 'p2wpkh', keyPath)
 *   dcent.addBitcoinTransactionOutput(tx, 'p2wpkh', '200000', toAddress)
 *   await dcent.sign({ method: 'signTransaction', chainId: 'bip122:.../slip44:0', payload: { keyPath, transaction: tx } })
 *
 * (m09-04-15 이전에는 builder가 v1 nested envelope를 만들고 `bitcoinTxToWire`로 변환했으나,
 *  bridge sdk가 v2에서 flat wire를 기대하므로 obsolete nested를 거치지 않고 builder가 flat을 직접 생성.
 *  `sign.ts`/`_call`은 chain-agnostic 유지 — 변환/검증은 builder surface 안에서만.)
 *
 * **flat wire shape (wm 계약 — README-bitcoin-wire.md §2 / wire-convert.ts)**:
 *   - inputs[].{ rawTransaction, index, txType, keyPath, sequence? }
 *   - outputs[].{ txType, amount(satoshi string), addresses[] }
 *
 * 룰 준수:
 *   - boundary-validation / dapp-input-sanitization: 각 add 시점에 필드 위생 검증 (fail-fast).
 *     malformed txType(비문자열/빈 문자열/과길이/prototype 키) / 비-satoshi amount / malformed 인자
 *     → param_error throw. 🔴 txType 의 **값** 판정은 하지 않는다 — wm 소관
 *     (`NOTE(decision-anchor: connector-txtype-open-enum)` 참조).
 *   - error-handling-consistency: 검증 실패는 모두 dcentException('param_error') (v2 builder는 coinType 미사용 — m09-04-15).
 *   - mutation-isolation (T-MUT-TX-01/02): getBitcoinTransactionObject는 매 호출마다 새 객체 반환.
 *     add*는 명시적 in-place mutation (v1 1:1 chaining) — 두 별도 호출 결과는 서로 독립.
 *   - connector-chain-addition-isolation: bitcoin 전용 builder surface 안에서만 동작. sign.ts/_call 미터치.
 *   - 출력 구성 검증(non-change dest 1개 + change ≤1) / hex·BIP32 format은 wm convertWireTransaction 위임(R9).
 */

import { dcentException } from '../v1/dcent-exception'

/**
 * 현재 **알려진** wire **input** txType. `p2tr` 은 "Taproot UTXO 를 **소비해 서명**한다" 는 뜻이며
 * output 의 `p2tr`("Taproot 주소로 **수취**")과 다른 축이다. p2pk/multisig 는 양쪽 모두 미지원.
 *
 * ⚠️ 자동완성·문서용 목록일 뿐 **런타임 게이트가 아니다** — 어느 값이 실제로 동작하는지는 wm 이
 * 정하고 시점에 따라 바뀐다. 여기에 "지금 무엇이 개통됐나" 를 더 적지 말 것(wm 이 움직이면 낡는다).
 */
export type KnownBitcoinWireTxType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr'

/**
 * 현재 **알려진** wire **output** txType. `'change'` 는 wire 상의 output 전용 마커다.
 * 🔴 `'p2tr'` 을 input union 에서 상속받지 않고 **명시적으로 다시 쓴다** — 축이 별개라 input union
 * 이 어떤 이유로 좁아져도 output 은 따라 좁아지면 안 된다.
 */
export type KnownBitcoinWireOutputTxType = KnownBitcoinWireTxType | 'p2tr' | 'change'

/**
 * wire input txType — **열린 문자열**. 같은 리포 `address.ts` 의 `AddressFormat` 과 같은 규율이다:
 * 🔴 **connector 는 이 값을 해석하지 않는다.** 알려진 값은 `KnownBitcoinWireTxType` 이 자동완성용
 * 으로만 들고 있고, **유효성 판정은 wm `wire-convert.ts` 의 `VALID_TX_TYPES` 하나가 소유**한다
 * (거기서 `-32602`). 그래야 새 txType 이 열릴 때 **connector 를 재배포하지 않아도** 된다 —
 * connector 는 npm 이라 App 이 의존성을 올려야 반영되고, bridge/wm 은 즉시 배포된다.
 */
export type BitcoinWireTxType = KnownBitcoinWireTxType | (string & {})

/** wire output txType — 열린 문자열. 판정은 wm `VALID_OUTPUT_TX_TYPES` 소유. 위와 같은 규율. */
export type BitcoinWireOutputTxType = KnownBitcoinWireOutputTxType | (string & {})

// 🔴 타입이 **열려 있다**는 것의 컴파일타임 검출자 (`address.ts` 의 `_AddressFormatAcceptsUnknown`
//    과 동일 패턴). v2 테스트는 babel 이 타입을 벗겨내고 돌기 때문에(`jest.v2.config.js`) union 을
//    되좁혀도 빨개지는 런타임 테스트가 없다. `tsc --noEmit` 이 보는 `src/**` 안에 단언을 둔다.
//    두 번째 검출자는 아래 `push` 의 무캐스트 대입이다 — 좁히면 `string` 대입이 깨진다.
// 🔴 실패 분기는 반드시 `false` — `never` 로 두면 `never extends true` 가 참이라 단언이 inert 해진다.
// 🔴 export 하지 않는다 — 배포 `.d.ts` 에 내부 이름을 남길 이유가 없고, 없어도 단언은 작동한다.
type _AssertTrue<T extends true> = T
type _InputTxTypeAcceptsUnknown = _AssertTrue<string extends BitcoinWireTxType ? true : false>
type _OutputTxTypeAcceptsUnknown = _AssertTrue<string extends BitcoinWireOutputTxType ? true : false>
// 거울상 — union 이 **좁아지는 것**을 잡는다. 여기서는 프로브가 리터럴이어야 하고(열림 단언은
// 리터럴 제거를 못 본다), 검사 대상은 열린 별칭이 아니라 `Known*` 이다(열린 쪽에 걸면 inert).
type _AssertP2trKnownInput = _AssertTrue<'p2tr' extends KnownBitcoinWireTxType ? true : false>
type _AssertChangeKnownOutput = _AssertTrue<'change' extends KnownBitcoinWireOutputTxType ? true : false>

/** flat wire input — wm `BitcoinWireInput` 1:1. */
export interface BitcoinWireInput {
  /** 이전 tx raw hex. */
  rawTransaction: string
  /** prevout index (0-origin, non-neg integer). */
  index: number
  /** script type. */
  txType: BitcoinWireTxType
  /** BIP32 signing path. */
  keyPath: string
  /** (선택) nSequence/RBF. builder는 미설정. */
  sequence?: number
}

/** flat wire output — wm `BitcoinWireOutput` 1:1. */
export interface BitcoinWireOutput {
  /** script type(`'p2tr'` 포함) 또는 'change'. */
  txType: BitcoinWireOutputTxType
  /** Satoshi 단위 금액 문자열. */
  amount: string
  /** 수신 주소 배열 (builder는 단일 `to` → `[to]`). */
  addresses: string[]
}

/** flat wire transaction — wm `BitcoinWireTransaction` 1:1. builder 누적 대상. */
export interface BitcoinWireTransaction {
  inputs: BitcoinWireInput[]
  outputs: BitcoinWireOutput[]
  /** (선택) auto-fetch 경량 payload용 계정 레벨 keyPath. builder 경로에서는 미설정. */
  keyPath?: string
}

/** txType 문자열 위생 상한 — script type 식별자라 형제 `_sanitizeAddressFormat`(256)보다 좁다. */
const TX_TYPE_MAX_LEN = 64

/** 값으로 실려도 prototype 오염 벡터가 되는 문자열 — `address.ts` 의 동명 가드와 같은 집합. */
const FORBIDDEN_TX_TYPE_VALUES = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * txType 의 **모양만** 검증한다 — 값이 무엇인지는 보지 않는다(그건 wm 소관).
 *
 * 여기 남기는 것은 **드리프트하지 않는 위생**뿐: 비문자열 / 빈 문자열 / 과길이 / prototype 키.
 * 전부 `dcentException('param_error')` (boundary-validation + error-handling-consistency).
 */
function assertWireTxTypeShape (value: unknown, fn: string): void {
  if (typeof value !== 'string') {
    throw dcentException('param_error', `${fn}: type must be a string, got ${typeof value}`)
  }
  if (value.length === 0) {
    throw dcentException('param_error', `${fn}: type must not be empty`)
  }
  if (value.length > TX_TYPE_MAX_LEN) {
    throw dcentException(
      'param_error',
      `${fn}: type length exceeds ${TX_TYPE_MAX_LEN} chars (got ${value.length})`,
    )
  }
  if (FORBIDDEN_TX_TYPE_VALUES.has(value.toLowerCase())) {
    throw dcentException('param_error', `${fn}: type rejected: prototype-pollution key '${value}'`)
  }
}

/** satoshi 값 검증 — number는 safe integer(≥0), string은 canonical 10진 정수 문자열. */
function isValidSatoshi (value: unknown): boolean {
  return (
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ||
    (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value))
  )
}

/**
 * add* 진입 시 transaction 컨테이너가 유효한 flat wire 객체인지 검증 (boundary-validation).
 * null / 비객체 / inputs·outputs 비배열(예: pre-migration v1 nested 객체)이면 raw TypeError 대신
 * dcentException('param_error') throw — breaking 마이그레이션 경계에서 명확한 에러 보장.
 */
function assertWireTxContainer (transaction: unknown, fn: string): asserts transaction is BitcoinWireTransaction {
  const t = transaction as { inputs?: unknown; outputs?: unknown } | null
  if (!t || typeof t !== 'object' || !Array.isArray(t.inputs) || !Array.isArray(t.outputs)) {
    throw dcentException(
      'param_error',
      `${fn}: transaction must be a BitcoinWireTransaction (call getBitcoinTransactionObject first)`,
    )
  }
}

/**
 * 빈 v2 flat wire transaction을 생성한다 (builder 시작점).
 *
 * 코인 식별자는 wire에 싣지 않는다 — 실제 코인은 `dcent.sign` 호출 시 chainId(CAIP-19)가 결정한다.
 * v1의 `coinType` 인자는 v2에서 검증-후-폐기(vestigial)였고 chainId 라우팅과 비일관 + 불일치 footgun을
 * 야기하므로 제거했다 (m09-04-15 RE-AUDIT 2026-06-15). 코인 호환성 검증은 sign 시점 chainId가 담당.
 *
 * @returns 빈 inputs/outputs를 가진 BitcoinWireTransaction (매 호출 새 객체 — mutation-isolation)
 */
export function getBitcoinTransactionObject (): BitcoinWireTransaction {
  return { inputs: [], outputs: [] }
}

/**
 * UTXO input을 flat wire에 push한다 (in-place mutation, v1 1:1 chaining).
 *
 * @param transaction `getBitcoinTransactionObject` 산출물
 * @param prevTx 이전 tx raw hex (wire `rawTransaction`)
 * @param utxoIdx prevout index (wire `index`, non-neg integer)
 * @param type 이 input(UTXO)의 script type (wire `txType`). 알려진 값은 `KnownBitcoinWireTxType`
 *   (p2pkh/p2sh/p2wpkh/p2wsh/**p2tr**)이지만 **connector 는 값으로 거르지 않는다** — 모양만 본다.
 *   여기서의 `p2tr` 은 "Taproot UTXO 를 **소비해 서명**한다" 는 뜻이며, output 쪽 `p2tr`
 *   ("Taproot 주소로 **수취**")과 **다른 축**이다. 지원 여부의 최종 판정은 wm 이 -32602 로 한다.
 *   ⚠️ `'p2tr'` 은 v1 호환 enum `bitcoinTxType` 에 **없다**(그 enum 은 v1 과 1:1 로 동결).
 *   raw 문자열 `'p2tr'` 로 전달할 것.
 * @param key BIP32 signing path (wire `keyPath`)
 * @returns 같은 transaction 객체 (chaining)
 * @throws dcentException('param_error') malformed 인자 / malformed txType (값 판정 아님 — wm 소관)
 */
export function addBitcoinTransactionInput (
  transaction: BitcoinWireTransaction,
  prevTx: string,
  utxoIdx: number,
  type: string,
  key: string,
): BitcoinWireTransaction {
  assertWireTxContainer(transaction, 'addBitcoinTransactionInput')
  if (typeof prevTx !== 'string') {
    throw dcentException('param_error', 'addBitcoinTransactionInput: prevTx must be a string')
  }
  if (typeof utxoIdx !== 'number' || !Number.isInteger(utxoIdx) || utxoIdx < 0) {
    throw dcentException('param_error', 'addBitcoinTransactionInput: utxoIdx must be a non-negative integer')
  }
  // NOTE(decision-anchor: connector-txtype-open-enum): **값 화이트리스트를 여기 되살리지 말 것.**
  // 되살리면 wm `wire-convert.ts` 의 `VALID_TX_TYPES` 와 같은 사실이 두 곳에 복제되고, 상류 사본이
  // npm tarball 에 박혀 **새 txType 마다 connector 재배포**가 필요해진다(실측: `p2tr` 개통이 정확히
  // 그 이유로 재배포를 요구했다 — wm 이 먼저 열었는데 connector 가 막아 App 이 못 썼다).
  // 유효성은 wm 이 소유하고 `-32602` 로 거절하며, 하류가 **전 경로를 덮는 것은 실측했다**:
  //   명시-inputs / PSBT(`convertWireTransaction` Step 1b 가 `parsePsbtToWire` 후 자기 자신을
  //   tail-call 해 같은 게이트를 탄다) / auto-fetch(inputs 부재라 input 축 비대상).
  // ⚠️ 그래서 output 전용 마커 `'change'` 도 이제 여기를 통과한다 — wm `VALID_TX_TYPES` 에 없어
  //    거기서 거절된다(fail-closed 유지). connector 에 그 한 값만 되살리는 것도 복제다.
  // 근거: 같은 리포 `address.ts` 의 `AddressFormat` 선례 + 사용자 결정(2026-09-11, DC-4379).
  assertWireTxTypeShape(type, 'addBitcoinTransactionInput')
  if (typeof key !== 'string' || key.length === 0) {
    throw dcentException('param_error', 'addBitcoinTransactionInput: key must be a non-empty string')
  }
  transaction.inputs.push({
    rawTransaction: prevTx,
    index: utxoIdx,
    // 🔴 캐스트 없이 대입한다 — union 을 다시 좁히면 여기서 `tsc` 가 깨진다(열림의 검출자 2/2).
    txType: type,
    keyPath: key,
  })
  return transaction
}

/**
 * output을 flat wire에 push한다 (in-place mutation, v1 1:1 chaining).
 *
 * @param transaction `getBitcoinTransactionObject` 산출물
 * @param type 수신 script type (wire `txType`). 알려진 값은 `KnownBitcoinWireOutputTxType`
 *   (p2pkh/p2sh/p2wpkh/p2wsh/**p2tr** 또는 'change')이지만 **connector 는 값으로 거르지 않는다**.
 *   `p2tr` 은 Taproot 수신 주소(`bc1p…`)로 보낼 때 쓴다 — 허용 여부의 최종 판정(currency 의
 *   witness v1 선언 · 주소 hrp 일치)은 wm 이 -32602 로 한다.
 *   🔴 input 쪽 `p2tr`(Taproot UTXO 를 **소비해 서명**)과 **다른 축**이다 — 같은 문자열이지만
 *   여기는 "수취 주소 인식", 저기는 "서명 능력". 두 whitelist 를 합치지 말 것.
 *   `'change'` 는 output 전용이라 input 은 계속 거부한다.
 *   ⚠️ `'p2tr'` 은 v1 호환 enum `bitcoinTxType` 에 **없다**(그 enum 은 v1 과 키·값 1:1 로 동결돼
 *   있고 `types-drift` 테스트가 그것을 강제한다). raw 문자열 `'p2tr'` 로 전달할 것.
 * @param value satoshi 금액 — number(safe int ≥0) 또는 canonical 10진 문자열 (wire `amount`로 String화, 단위 변환 없음)
 * @param to 수신 주소 (wire `addresses: [to]`)
 * @returns 같은 transaction 객체 (chaining)
 * @throws dcentException('param_error') malformed 인자 / malformed txType / 비-satoshi value
 */
export function addBitcoinTransactionOutput (
  transaction: BitcoinWireTransaction,
  type: string,
  value: number | string,
  to: string,
): BitcoinWireTransaction {
  assertWireTxContainer(transaction, 'addBitcoinTransactionOutput')
  // NOTE(decision-anchor: connector-txtype-open-enum): input 쪽과 **같은 결정, 다른 축**이다 —
  // 값 목록을 여기 되살리지 말 것. 되살리면 wm `wire-convert.ts` 의 `VALID_OUTPUT_TX_TYPES` 사본이
  // npm 에 박혀 새 output txType 마다 connector 재배포가 필요해진다. 유효성(및 `p2tr` 의 currency
  // witness-v1 게이트·주소 hrp 대조)은 wm `validateOutputs` 가 소유하고 `-32602` 로 거절한다 —
  // auto-fetch 경량 payload 에서도 placeholder 반환 **전에** 돈다(실측).
  // 근거: `address.ts` 의 `AddressFormat` 선례 + 사용자 결정(2026-09-11, DC-4379).
  assertWireTxTypeShape(type, 'addBitcoinTransactionOutput')
  if (!isValidSatoshi(value)) {
    throw dcentException(
      'param_error',
      'addBitcoinTransactionOutput: value must be a non-negative integer satoshi (number or canonical decimal string)',
    )
  }
  if (typeof to !== 'string' || to.length === 0) {
    throw dcentException('param_error', 'addBitcoinTransactionOutput: to must be a non-empty string')
  }
  transaction.outputs.push({
    // 🔴 캐스트 없이 대입 — 좁히면 `tsc` 가 깨진다(열림의 검출자 2/2).
    txType: type,
    // satoshi 계약 — 단위 변환 없이 문자열화만.
    amount: String(value),
    addresses: [to],
  })
  return transaction
}
