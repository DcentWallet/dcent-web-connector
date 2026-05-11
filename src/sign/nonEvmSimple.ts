/**
 * v1 non-EVM simple sign wrappers — module-level functions (m08-01-04)
 *
 * v1 src-v1/index.js의 단순 pass-through 패턴 8개 sign 함수를 v2 facade에 1:1 호환 port:
 *   - getBitcoinSignedTransaction (l929-942)
 *   - getXrpSignedTransaction (l1240-1263)
 *   - getHederaSignedTransaction (l1265-1280)
 *   - getHederaSignedMessage (l1282-1293)
 *   - getStellarSignedTransaction (l1295-1308)
 *   - getTronSignedTransaction (l1310-1323)
 *   - getSignedMessage (l1212-1221, coin-agnostic)
 *   - getSignedData (l1223-1230, coin-agnostic)
 *
 * 핵심 동작:
 *   - 모두 인자 검증 + `_call({method, params})` 직접 dispatch
 *   - UnitConverter 변환 / coinType remap / response 후처리 없음 (그건 m08-01-04.5의 복잡 wrapper에서 처리)
 *   - bridge sdk wire format이 snake_case를 기대하는 곳은 `unsignedTx → unsigned_tx` 매핑
 *     (Hedera/Stellar/Tron) → camelCase로 보내면 silent fail
 *   - Hedera Message는 v1 동작과 동일하게 `unsignedMsg`를 받아 `message` 키로 forward
 *   - XRP는 Account/TransactionType/Fee/Sequence 타입 검증 + xrpTxType enum lookup +
 *     Fee numberString 검증 (v1 1:1)
 *
 * 룰 준수:
 *   - boundary-validation: 입력 객체의 type/필드 존재 검증, 실패 시 throw (silent return 금지)
 *   - error-handling-consistency: 검증 실패는 throw, popup/network 에러는 _call이 v1 호환 응답으로 변환
 *   - mutation-isolation: _call이 매 호출마다 새 V1Response 객체 반환
 *   - cross-repo-interface-edit: bridge sdk가 알아야 하는 method 이름 + snake_case params shape 보존
 *   - reuse-shared-utils: `_call`, `dcentException`, `checkParameter`, `xrpTxType` 모두 재사용
 *   - dapp-input-sanitization: 현 v1 동작 그대로 보존 — C3 sanitization은 후속 m08-01-06에서 강화
 *   - external-reference-edge-cases: pass-through wrapper라 primitive 변환 없음. 해당 없음
 *   - no-version-bump: package.json version 미수정
 */

/* eslint-disable camelcase */

import { _call } from './call'
import { checkParameter } from './checkParameter'
import { dcentException } from '../v1/dcent-exception'
import { xrpTxType as dcentXrpTxType } from '../types/xrpTxType'
import type { V1Response } from './types'
import type { BitcoinTxObject } from './bitcoinTxBuilder'

/** XRP 트랜잭션 객체 — bridge sdk가 받는 wire shape (v1과 동일). */
export interface XrpTxObject {
  /** classic XRP address — 'r...' */
  Account: string
  /** XRP TransactionType — Payment / TrustSet / OfferCreate 등 (xrpTxType enum 참조) */
  TransactionType: string
  /** Fee in drops, numberString 형태 — '12' 등 */
  Fee: string
  /** Sequence number — uint32 */
  Sequence: number
  /** XRP wire format 추가 필드 (Amount, Destination, Memos 등 — bridge sdk가 직접 파싱) */
  [key: string]: unknown
}

/** Hedera 트랜잭션 wrapper 인자 — destructured. */
export interface HederaTxParams {
  /** unsigned tx hex/base64 — bridge로 forward 시 `unsigned_tx` (snake_case) 키로 변환 */
  unsignedTx: string
  /** BIP44 path — `m/44'/3030'/0'/0/0` 등 */
  path: string
  /** 토큰 symbol (Hedera HTS) */
  symbol?: string
  /** 토큰 decimals (Hedera HTS) */
  decimals?: number | string
}

/** Hedera 메시지 wrapper 인자 — destructured. */
export interface HederaMsgParams {
  /** unsigned message — bridge로 forward 시 `message` (key 변경) 키로 변환 */
  unsignedMsg: string
  /** BIP44 path */
  path: string
}

/** Stellar 트랜잭션 wrapper 인자 — destructured. */
export interface StellarTxParams {
  /** unsigned tx — bridge로 forward 시 `unsigned_tx` 키로 변환 */
  unsignedTx: string
  /** Stellar fee (stroops) — 변환 없이 그대로 forward (m08-01-04.5의 UnitConverter 적용 안 함) */
  fee: string | number
  /** BIP44 path */
  path: string
}

/** Tron 트랜잭션 wrapper 인자 — destructured. */
export interface TronTxParams {
  /** unsigned tx — bridge로 forward 시 `unsigned_tx` 키로 변환 */
  unsignedTx: string
  /** Tron fee — 변환 없이 그대로 forward (TRC token wrapper는 m08-01-04.5) */
  fee: string | number
  /** BIP44 path */
  path: string
}

/**
 * v1 dcent.getBitcoinSignedTransaction (src-v1/index.js#l929-942) 1:1 port.
 *
 * 동작:
 *   1. transaction === null || undefined → `dcentException('param_error', '...')` throw
 *   2. `_call({method: 'getBitcoinSignedTransaction', params: {transaction}})` dispatch
 *
 * @param transaction Bitcoin tx object (BitcoinTxObject 타입 — bitcoinTxBuilder가 만든 객체)
 * @returns V1Response (v1 호환 `{header, body}` shape)
 */
export async function getBitcoinSignedTransaction (
  transaction: BitcoinTxObject
): Promise<V1Response> {
  if (transaction === null || typeof transaction === 'undefined') {
    throw dcentException('param_error', 'transaction object is undefined or null')
  }
  return _call({
    method: 'getBitcoinSignedTransaction',
    params: { transaction },
  })
}

/**
 * v1 dcent.getXrpSignedTransaction (src-v1/index.js#l1240-1263) 1:1 port.
 *
 * 동작:
 *   1. Account/TransactionType/Fee/Sequence 타입 검증 → 위반 시 throw 'TypeError: Required field type is not matched'
 *   2. xrpTxType[transaction.TransactionType] === undefined → throw 'Invalid Transaction Type: ...'
 *   3. checkParameter('numberString', Fee) → invalid이면 checkParameter가 throw
 *   4. `_call({method: 'getXrpSignedTransaction', params: {key, transaction}})` dispatch
 *
 * v1 try/catch는 throw를 단순 propagate하므로 v2에서는 try/catch 생략 (동등 의미).
 */
export async function getXrpSignedTransaction (
  transaction: XrpTxObject,
  key: string
): Promise<V1Response> {
  if (
    typeof transaction.Account !== 'string' ||
    typeof transaction.TransactionType !== 'string' ||
    typeof transaction.Fee !== 'string' ||
    typeof transaction.Sequence !== 'number'
  ) {
    throw dcentException('param_error', 'TypeError: Required field type is not matched')
  }

  if (typeof (dcentXrpTxType as Record<string, unknown>)[transaction.TransactionType] === 'undefined') {
    throw dcentException('param_error', 'Invalid Transaction Type: ' + transaction.TransactionType)
  }

  checkParameter('numberString', transaction.Fee)

  return _call({
    method: 'getXrpSignedTransaction',
    params: { key, transaction },
  })
}

/**
 * v1 dcent.getHederaSignedTransaction (src-v1/index.js#l1265-1280) 1:1 port.
 *
 * 동작: destructure → `unsignedTx → unsigned_tx` snake_case 변환 후 forward.
 */
export async function getHederaSignedTransaction ({
  unsignedTx,
  path,
  symbol,
  decimals,
}: HederaTxParams): Promise<V1Response> {
  return _call({
    method: 'getHederaSignedTransaction',
    params: {
      unsigned_tx: unsignedTx,
      path,
      symbol,
      decimals,
    },
  })
}

/**
 * v1 dcent.getHederaSignedMessage (src-v1/index.js#l1282-1293) 1:1 port.
 *
 * 동작: destructure → `unsignedMsg → message` 키 변경 후 forward (v1 동작과 동일).
 */
export async function getHederaSignedMessage ({
  unsignedMsg,
  path,
}: HederaMsgParams): Promise<V1Response> {
  return _call({
    method: 'getHederaSignedMessage',
    params: {
      message: unsignedMsg,
      path,
    },
  })
}

/**
 * v1 dcent.getStellarSignedTransaction (src-v1/index.js#l1295-1308) 1:1 port.
 *
 * 동작: destructure → `unsignedTx → unsigned_tx`, fee는 변환 없이 그대로 forward.
 * (UnitConverter 적용은 m08-01-04.5의 복잡 wrapper 영역 — 본 wrapper는 fee를 raw string/number 그대로)
 */
export async function getStellarSignedTransaction ({
  unsignedTx,
  fee,
  path,
}: StellarTxParams): Promise<V1Response> {
  return _call({
    method: 'getStellarSignedTransaction',
    params: {
      unsigned_tx: unsignedTx,
      fee,
      path,
    },
  })
}

/**
 * v1 dcent.getTronSignedTransaction (src-v1/index.js#l1310-1323) 1:1 port.
 *
 * 동작: destructure → `unsignedTx → unsigned_tx`, fee는 변환 없이 그대로 forward.
 * method 이름은 `'getTronSignedTransaction'` (Tron 자체의 wrapper — TRC token은 m08-01-04.5).
 */
export async function getTronSignedTransaction ({
  unsignedTx,
  fee,
  path,
}: TronTxParams): Promise<V1Response> {
  return _call({
    method: 'getTronSignedTransaction',
    params: {
      unsigned_tx: unsignedTx,
      fee,
      path,
    },
  })
}

/**
 * v1 dcent.getSignedMessage (src-v1/index.js#l1212-1221) 1:1 port.
 *
 * coin-agnostic — 모든 chain이 공통으로 사용. params는 camelCase 그대로 forward
 * (v1 wire format이 camelCase 사용 — snake_case 변환 안 함).
 *
 * @param coinType v1 coinType 문자열 (예: 'BITCOIN', 'ETHEREUM' 등)
 * @param key BIP44 path
 * @param message 서명할 메시지 (hex 또는 utf-8 — bridge가 dispatch)
 */
export async function getSignedMessage (
  coinType: string,
  key: string,
  message: string
): Promise<V1Response> {
  return _call({
    method: 'getSignedMessage',
    params: { coinType, key, message },
  })
}

/**
 * v1 dcent.getSignedData (src-v1/index.js#l1223-1230) 1:1 port.
 *
 * coin-agnostic — typed data 서명. params는 camelCase 그대로 forward.
 *
 * @param key BIP44 path
 * @param message 서명할 typed data (chain-specific encoding)
 */
export async function getSignedData (
  key: string,
  message: string
): Promise<V1Response> {
  return _call({
    method: 'getSignedData',
    params: { key, message },
  })
}
