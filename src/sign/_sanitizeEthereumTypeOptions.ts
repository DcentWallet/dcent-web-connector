/**
 * EVM type_options sanitize helper (m08-01-03)
 *
 * `getEthereumSignedTransaction(..., typeOptions)`이 dApp에서 받는 `typeOptions` 객체를
 * known fields whitelist로만 추출. `dapp-input-sanitization` / `provider-security-checklist` C3 룰 준수.
 *
 * 적용 룰:
 *   - dapp-input-sanitization: dApp 입력 객체 직접 spread/pass-through 금지. known fields만 추출.
 *   - provider-security-checklist C3: typeOptions는 dApp-controllable 필드. EIP-1559/2930 spec 정의 필드만 통과.
 *
 * 검증 단계:
 *   1. opts가 null/undefined/non-object → 빈 객체 반환
 *   2. `__proto__` / `constructor` / `prototype` 키 명시 차단 (대소문자 무시)
 *   3. `maxFeePerGas` / `maxPriorityFeePerGas`: string 타입만 통과
 *   4. `accessList`: Array 타입 + 각 entry가 `{address: string, storageKeys: string[]}` shape인 것만 통과
 *
 * 결과는 매 호출마다 새 객체 (`mutation-isolation` 룰).
 */

/* eslint-disable camelcase */
/** EVM EIP-1559 + EIP-2930 type_options known fields. v2 spec 추가 시 본 인터페이스 확장. */
export interface EthereumTypeOptions {
  /** EIP-1559 max fee per gas (hex string). */
  maxFeePerGas?: string
  /** EIP-1559 max priority fee per gas (hex string). */
  maxPriorityFeePerGas?: string
  /** EIP-2930 access list entries. */
  accessList?: Array<{ address: string; storageKeys: string[] }>
}
/* eslint-enable camelcase */

/** prototype pollution 방어 — 명시적으로 차단할 키 (case-insensitive). */
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * dApp이 전달한 typeOptions를 known fields만 추출하여 새 객체로 반환한다.
 *
 * @param opts dApp이 전달한 typeOptions (검증되지 않은 입력)
 * @returns 매 호출마다 새 EthereumTypeOptions 객체 (mutation-isolation)
 */
export function _sanitizeEthereumTypeOptions (opts?: unknown): EthereumTypeOptions {
  const safe: EthereumTypeOptions = {}

  if (opts === null || opts === undefined || typeof opts !== 'object') {
    return safe
  }

  const o = opts as Record<string, unknown>

  // maxFeePerGas — string only
  if (typeof o.maxFeePerGas === 'string' && !PROTOTYPE_KEYS.has('maxFeePerGas'.toLowerCase())) {
    safe.maxFeePerGas = o.maxFeePerGas
  }

  // maxPriorityFeePerGas — string only
  if (typeof o.maxPriorityFeePerGas === 'string') {
    safe.maxPriorityFeePerGas = o.maxPriorityFeePerGas
  }

  // accessList — Array of { address: string, storageKeys: string[] }
  if (Array.isArray(o.accessList)) {
    const cleaned: Array<{ address: string; storageKeys: string[] }> = []
    for (const entry of o.accessList) {
      if (entry === null || entry === undefined || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      if (typeof e.address !== 'string') continue
      if (!Array.isArray(e.storageKeys)) continue
      const storageKeys: string[] = []
      let allStrings = true
      for (const k of e.storageKeys) {
        if (typeof k !== 'string') { allStrings = false; break }
        storageKeys.push(k)
      }
      if (!allStrings) continue
      cleaned.push({ address: e.address, storageKeys })
    }
    safe.accessList = cleaned
  }

  // prototype pollution 방어 — known field 추출만 했으므로 unknown / __proto__ 등은 자동 차단됨.
  // 명시적 검증으로 추가 안전장치:
  for (const key of Object.keys(safe)) {
    if (PROTOTYPE_KEYS.has(key.toLowerCase())) {
      delete (safe as Record<string, unknown>)[key]
    }
  }

  return safe
}
