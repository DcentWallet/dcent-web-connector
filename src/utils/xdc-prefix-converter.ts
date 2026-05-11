/**
 * v1 XDC prefix converter port (m08-01-03)
 *
 * v1 src-v1/utils/xdc-prefix-converter.js를 v2 TypeScript로 1:1 port.
 *
 * 동작 (v1 1:1):
 *   - 입력이 `0x`로 시작하면 그대로 반환
 *   - 입력이 `xdc`로 시작하면 `xdc` 3글자를 `0x`로 치환
 *   - 그 외에는 v1과 동일하게 `'0x' + str.address` 형태로 반환 (v1 quirk: object를 string처럼 다룸)
 *
 * v1 quirk 보존: v1은 `str.address` 접근자를 사용하므로, 객체가 들어오면 `address` 필드를 꺼내서
 * 0x를 prefix하는 동작. v2도 동일하게 보존하지만 TypeScript 타입은 string으로 강제하고
 * 실패 시 원본 동작을 유지하기 위해 `string & {address?: string}` 광의 사용.
 *
 * 룰 준수:
 *   - reuse-shared-utils: v1 src-v1/utils/에 이미 존재하는 helper를 v2 경로로 옮김
 *   - boundary-validation: 입력 문자열이 0x/xdc/기타 분기 명시
 */

/**
 * XDC 주소를 0x prefix로 변환한다.
 *
 * v1 src-v1/utils/xdc-prefix-converter.js와 1:1 호환.
 *
 * @param str XDC 주소 문자열 (`xdc...` 또는 `0x...`)
 * @returns 0x로 시작하는 주소 문자열
 */
export function XDCPrefixConverter (str: string): string {
  if (!str.startsWith('0x')) {
    if (str.startsWith('xdc')) {
      str = '0x' + str.substring(3)
    } else {
      // v1 quirk: 비표준 입력은 (str.address) 필드를 사용 — object가 string으로 들어왔을 때 호환
      str = '0x' + (str as unknown as { address: string }).address
    }
  }
  return str
}
