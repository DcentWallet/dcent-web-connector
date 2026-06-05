/**
 * v2 syncAccount per-item sanitize (m09-04-12)
 *
 * dApp이 syncAccount(accountInfos) 로 전달하는 각 항목을 사용 전에 검증한다.
 *
 * 적용 룰:
 *   - dapp-input-sanitization: known-fields({chainId, contractAddress?, keyPath, label})만 추출.
 *     unknown 필드 silent drop. __proto__ / constructor / prototype 자동 차단 (own-enumerable만 읽음).
 *   - connector-chain-addition-isolation: chainId는 _sanitizeChainId(문자 whitelist)만.
 *     chain 종류 판정 / enum 매핑 / coin_group 검증 일절 금지.
 *   - boundary-validation: 비객체 입력 → throw. 필수 필드(chainId/keyPath/label) 누락 → throw.
 *   - error-handling-consistency: 모든 검증 실패는 throw (silent return 금지).
 *
 * BIP44_PATH_REGEX 출처:
 *   chain-agnostic 형식만 검사. "m/" + hardened/non-hardened components.
 *   예: "m/44'/60'/0'/0/0" ✓  "44/60" ✗ (m/ prefix 없음)
 *
 * CONTRACT_ADDR_REGEX:
 *   EVM hex (0x + 40-64 hex) | base58-like (Solana/Tron 주소 폭넓게 허용).
 *   connector는 chain 타입 판정 안 함 — 형식만 검사.
 */

import { _sanitizeChainId } from './sanitize'
import { isAvaliableLabel } from './labelValidator'
import { dcentException } from '../v1/dcent-exception'
import type { V2SyncAccountInfo } from './types'

/** BIP44 key path — chain-agnostic 형식 검증.
 *  "m/" prefix + 하나 이상의 hardened/non-hardened 숫자 컴포넌트.
 *  예: "m/44'/60'/0'/0/0", "m/44'/195'/0'/0/0" */
const BIP44_PATH_REGEX = /^m(\/\d+'?)+$/

/** contract address — EVM hex 또는 base58-like 형식 폭넓게 허용.
 *  chain 타입 판정 안 함. 형식 검사만. */
const CONTRACT_ADDR_REGEX = /^(0x[0-9A-Fa-f]{40,64}|[1-9A-HJ-NP-Za-km-z]{25,60})$/

/** prototype 오염 방지 키 셋 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * v2 syncAccount 단일 항목을 sanitize하여 V2SyncAccountInfo를 반환한다.
 *
 * boundary-validation: 비배열 입력 가드는 caller(syncAccount)가 담당.
 * 본 함수는 배열의 각 항목 객체 검증만 담당.
 *
 * @param raw dApp이 전달한 account 항목 (unknown)
 * @returns 검증·sanitize된 V2SyncAccountInfo
 * @throws dcentException('param_error') — 형식 위반 시
 */
export function _sanitizeSyncAccountItem (raw: unknown): V2SyncAccountInfo {
  // 비객체 / null / 배열 → throw
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw dcentException('param_error', 'invalid account item: must be a plain object')
  }

  // own-enumerable만 읽어 prototype 오염 차단
  const o = raw as Record<string, unknown>

  // forbidden key 명시 차단 (방어 2중화 — toString 우회 패턴)
  for (const k of Object.keys(o)) {
    if (FORBIDDEN_KEYS.has(k.toLowerCase())) {
      throw dcentException('param_error', `forbidden key: ${k}`)
    }
  }

  // chainId — _sanitizeChainId가 형식 whitelist + throw (ProviderError).
  // syncAccount 경계에서는 dcentException('param_error')로 래핑 — error-handling-consistency.
  // (connector-chain-addition-isolation: chain enum / coin_group 검증 금지)
  let chainId: string
  try {
    chainId = _sanitizeChainId(o.chainId)
  } catch (e) {
    throw dcentException('param_error', e instanceof Error ? e.message : 'invalid chainId')
  }

  // keyPath — BIP44 형식 (chain-agnostic)
  const rawKeyPath = o.keyPath
  if (rawKeyPath === undefined || rawKeyPath === null || rawKeyPath === '') {
    throw dcentException('param_error', 'keyPath required')
  }
  const keyPath = String(rawKeyPath)
  if (!BIP44_PATH_REGEX.test(keyPath)) {
    throw dcentException('param_error', 'Invalid keyPath - ' + keyPath)
  }

  // label — v1 isAvaliableLabel 재사용 (메시지 보존)
  const rawLabel = o.label
  const label = rawLabel !== undefined ? String(rawLabel) : ''
  if (!isAvaliableLabel(label)) {
    throw dcentException('param_error', 'Invalid Label - ' + label)
  }

  // known-fields only output (unknown fields silently dropped)
  const out: V2SyncAccountInfo = { chainId, keyPath, label }

  // contractAddress — optional. 존재 시 형식 검증
  if (o.contractAddress !== undefined && o.contractAddress !== null && o.contractAddress !== '') {
    const ca = String(o.contractAddress)
    if (!CONTRACT_ADDR_REGEX.test(ca)) {
      throw dcentException('param_error', 'invalid contractAddress: ' + ca)
    }
    out.contractAddress = ca
  }

  return out
}
