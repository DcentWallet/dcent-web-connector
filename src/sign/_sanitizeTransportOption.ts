/**
 * transport 옵션 sanitize + wire 변환 (m09-04-03)
 *
 * dApp이 dcent.sign() 옵션으로 넘긴 transport 값을 sanitize한다.
 *
 * 적용 룰:
 *   - dapp-input-sanitization: known whitelist ('hid' | 'ble' | undefined)만 허용, 나머지 throw
 *   - provider-security-checklist C3: transport는 dApp-controllable — connector facade에서 검증
 *   - provider-security-checklist C6: invalid 값 → ProviderError(INVALID_PARAMS) 래핑
 *   - error-handling-consistency: invalid 값은 throw로 통일 (silent return 금지)
 *   - boundary-validation: "throw 우선" 원칙 — null / '' / 그 외 string / object 모두 throw
 *
 * audit 2026-05-19:
 *   R5: _sanitize{Concern} 컨벤션 정렬 (_sanitizeChain / _sanitizeEthereumTypeOptions sibling 패턴)
 *   R6: sanitize 출력 3-state ('hid'|'ble'|undefined) → toWireTransport에서 wire 3-state로 변환
 *   R9: invalid value → throw ProviderError(INVALID_PARAMS) — C4 WARN 반영 (복수형 INVALID_PARAMS)
 *   R10: null / 빈 문자열은 undefined로 coerce 금지, throw로 통일
 */

import { ProviderError } from '../error/ProviderError'
import { ErrorCode } from '../error/ErrorCode'

/**
 * dApp이 dcent.sign 옵션으로 넘긴 transport 값을 sanitize.
 *
 * - 정상: 'hid' | 'ble' → 그대로 반환
 * - 미사용: undefined → undefined (toWireTransport에서 'hid'로 변환 — DC-2701)
 * - invalid: null / '' / 그 외 string / object → throw ProviderError(INVALID_PARAMS)
 *
 * @param transport dApp이 넘긴 transport 값 (unknown)
 * @returns 'hid' | 'ble' | undefined
 * @throws ProviderError(INVALID_PARAMS) — invalid 값
 */
export function _sanitizeTransportOption (
  transport: unknown,
): 'hid' | 'ble' | undefined {
  if (transport === undefined) return undefined
  if (transport === 'hid' || transport === 'ble') return transport
  throw new ProviderError(
    ErrorCode.INVALID_PARAMS,
    `Invalid transport option: "${String(transport)}". Expected 'hid' | 'ble' | undefined.`,
  )
}

/**
 * sanitize 결과를 wire 값으로 변환.
 * handshake message body params.transport 동봉 시점에 호출.
 *
 * (DC-2701) 'auto' 제거 + 3-state wire — dApp이 명시한 transport를 그대로 sdk로 전달한다.
 * sdk가 3가지를 분기한다:
 *   - 'hid'      → USB 전용 picker + HID 자동연결 (Case A/B)
 *   - 'ble'      → BLE 전용 picker, 자동연결 안 함 (Case B)
 *   - undefined  → default. HID/BLE 둘 다 picker + HID 자동연결 가능 (Case A/B)
 *
 * 미지정(undefined)을 'hid'로 coerce하지 않는다 — default와 명시 'hid'는 picker 옵션 노출이
 * 다르므로(default=둘 다, hid=USB only) wire에서 구분되어야 한다.
 *
 * - 'hid' → 'hid'
 * - 'ble' → 'ble'
 * - undefined → undefined (default)
 */
export function toWireTransport (
  sanitized: 'hid' | 'ble' | undefined,
): 'hid' | 'ble' | undefined {
  return sanitized
}
