/**
 * v2 sign 응답 타입 — v1 호환 형태 (m08-01-02)
 *
 * v1의 `messageReceive` 핸들러가 dApp에 돌려주던 payload(`{header, body}`) 구조와 1:1 호환.
 * dApp이 v2 통합 sign API를 호출할 때 받는 응답이 v1 시절과 동일한 shape을 갖도록 보장한다.
 *
 * **m12-03**: V1Response를 generic으로 확장해 `body.parameter`에 typed narrow를 지원.
 * 기존 호출자는 default `TParam = Record<string, unknown>`으로 backward-compat.
 * `DeviceInfoPayload` 신설.
 *
 * 룰 준수:
 *   - mutation-isolation: V1Response는 매 호출마다 새 객체로 생성 (call.ts 참조)
 *   - boundary-validation: header/body 필드 존재 여부는 호출자 또는 _assertV1Success가 검증
 */

import type { AddressFormat } from './address'

/* eslint-disable camelcase */
/** 응답 헤더 — v1 dcent.call() 응답의 `header` 필드 형태.
 *  v1 wire format이 snake_case를 사용하므로 camelcase 룰 disable. */
export interface V1ResponseHeader {
  /** 프로토콜 버전 — '1.0' 등 */
  version: string
  /** 요청 측 식별 (sdk가 응답에 포함) */
  request_from?: string
  /** 응답 측 식별 — 'czone' 등의 wallet 그룹 식별자가 들어올 수 있다 */
  response_from?: string
  /** 처리 결과 */
  status: 'success' | 'failure'
}
/* eslint-enable camelcase */

/**
 * 응답 본문 — v1 dcent.call() 응답의 `body` 필드 형태.
 *
 * **m12-03**: `parameter` 필드를 generic `TParam`으로 typed.
 * 기존 호출자는 default `Record<string, unknown>`으로 backward-compat.
 */
export interface V1ResponseBody<TParam = Record<string, unknown>> {
  /** command 종류 — 'transaction' / 'getAddress' / 'getDeviceInfo' 등 */
  command?: string
  /** 성공 응답 페이로드 — signed_tx / address / device_id 등 */
  parameter?: TParam
  /** 실패 응답 — code/message 쌍 */
  error?: {
    code: string
    message: string
  }
}

/**
 * v1 호환 응답 — v2 통합 sign API의 반환 shape.
 *
 * v1 시절 dApp이 받던 `{header, body}` 구조와 1:1 동등.
 * v2에서는 underlying transport가 JSON-RPC 2.0 envelope을 사용하지만,
 * connector facade가 이 envelope을 V1Response로 매핑하여 dApp 호환성을 유지한다.
 *
 * **m12-03**: Generic `TParam` 지원 — `getDeviceInfo()`의 반환 타입을
 * `V1Response<DeviceInfoPayload>`로 narrow 가능. 기존 호출자는 default로 동작.
 */
export interface V1Response<TParam = Record<string, unknown>> {
  header: V1ResponseHeader
  body: V1ResponseBody<TParam>
}

/* eslint-disable camelcase */
/**
 * v2 account wire — syncAccount 입력 항목 (m09-04-12).
 *
 * connector-chain-addition-isolation: chainId는 chain-agnostic whitelist 형식 검증만.
 * 실제 chain resolve는 sdk/wm(m09-03-21)에 위임.
 *
 * dapp-input-sanitization: _sanitizeSyncAccountItem이 known-fields만 통과.
 */
export interface V2SyncAccountInfo {
  /** CAIP-19 chainId (예: 'eip155:1/slip44:60', 'bip122:000000000019d6689c085ae165831e93/slip44:0').
   *  token도 부모 체인의 CAIP-19를 그대로 두고 asset은 contractAddress로 구분. */
  chainId: string
  /** token asset일 때만 존재. native coin은 생략. */
  contractAddress?: string
  /** BIP44 key path (예: "m/44'/60'/0'/0/0"). */
  keyPath: string
  /** D'CENT 지갑 표시 레이블. */
  label: string
}

/**
 * 진화하는 account-info 부가 메타데이터 (forward-compat 확장점).
 * SYNC: sdk accountV2 `V2AccountMeta` (정본 shape B) ↔ 짝 m09-03-27(sdk, addressFormat 도출) / m09-04-20(connector).
 *
 * **connector 변경 최소화 목적**: connector는 dApp이 npm으로 가져가는 패키지라 재배포가 어렵다.
 * sdk(웹 배포)가 account-info에 추가하는 device-파생/진화 값들을 이 bag에 모아두면, sdk가 새 키를
 * 추가해도 index signature가 이미 수용하므로 connector 타입을 다시 수정·재배포할 필요가 없다.
 * (known 키는 문서화 목적의 optional 필드.) connector는 forward만 하므로 의미 해석 불필요.
 */
export interface V2AccountMeta {
  /** wm 미등록 커스텀 토큰. true면 chainId는 deviceStoreId에서 derive한 부모 체인이며,
   *  풀 contractAddress는 device가 coin_name을 15자 truncate하여 복원 불가. native와 구분용. */
  customToken?: true
  /** customToken일 때 device coin_name(EVM: 15자 contract truncate, SPL 등: 토큰 이름) 표시 힌트. */
  deviceCoinName?: string
  /** 주소 인코딩 variant 힌트 (3축 disambiguation의 encoding 축). sdk가 도출(m09-03-27), connector는
   *  forward만. 'segwit-native'=BIP-84 bech32 / 'legacy'=같은 chainId에 segwit 형제가 실재하는
   *  bitcoin-family base(BITCOIN/DIGIBYTE 등)에만 부여. 그 외(customAddressPathFor/legacyFor 변형)는
   *  인코딩이 같아 keyPath로 구분(미부여). dApp은 BTC legacy/segwit 구분에 사용. */
  addressFormat?: AddressFormat
  /** forward-compat: 추후 sdk가 추가하는 account-info 부가값. connector 재배포 없이 확장.
   *  (addressFormat은 known 키로 승격되기 전부터 이 index signature로 이미 통과되어 왔다.) */
  [key: string]: unknown
}

/**
 * v2 account wire — getAccountInfo 응답 항목 (m09-04-12).
 *
 * sdk(m09-03-21)가 enrich한 결과 shape. connector는 응답을 forward만 — 타입 narrow 전용.
 *
 * **정본 shape B** (2026-06-23 확정): resolved는 chainId=full CAIP-19(자산 caip19, 별도 caip19 필드 없음),
 * 자산 구분은 contractAddress, 인코딩 variant는 meta.addressFormat. token은 부모 체인 caip19 + contractAddress.
 * SYNC: sdk accountV2 `V2AccountInfo` ↔ 짝 m09-03-27(sdk B 정렬) / m09-04-20(connector 명문화).
 * 양측 drift는 sdk T-SYNC-01 + connector getAccountInfo.v2 drift-guard 테스트가 감지.
 *
 * mutation-isolation: V1Response가 call.ts에서 매 호출마다 새 객체로 생성.
 */
export type V2AccountInfo =
  | {
      /** resolve 성공 — CAIP-19 chainId. native는 자산 caip19(예 'eip155:1/slip44:60'),
       *  token은 부모 체인 caip19. 자산 구분은 contractAddress (별도 caip19 필드 없음). */
      chainId: string
      /** token asset address. native이면 undefined. */
      contractAddress?: string
      /** 디바이스 address_path */
      keyPath: string
      /** D'CENT 레이블 */
      label: string
      /** 진화하는 부가 메타데이터(customToken 등). sdk가 새 키를 넣어도 connector 수정 불필요. */
      meta?: V2AccountMeta
      unresolved?: false
    }
  | {
      /** resolve 실패 (custom coin / 미등록 / collision) */
      chainId: null
      unresolved: true
      /** 디바이스 raw 응답 (v1 shape 보존) */
      raw: { coin_group: string; coin_name: string; address_path: string; label: string }
    }

/**
 * getAccountInfo 응답 body.parameter shape (m09-04-12).
 */
export interface AccountListV2Payload {
  account: V2AccountInfo[]
}
/* eslint-enable camelcase */

/* eslint-disable camelcase */
/**
 * D'CENT 디바이스 정보 응답 payload (m12-03).
 *
 * `getDeviceInfo()` 응답의 `body.parameter` shape.
 * 모든 필드는 optional — b11-02(sdk)가 미SHIPPED이면 새 필드가 wire에 없어도 graceful.
 * race-safe-cross-repo exemption에 따라 옛 sdk 응답에서는 새 필드가 `undefined`로 들어온다.
 *
 * mutation-isolation: coin_list 배열은 V1Response가 call.ts에서 매 호출마다 새 객체로
 * 생성되므로 caller mutation은 내부 상태를 오염시키지 않는다 (T-SEC-MUT-01).
 */
export interface DeviceInfoPayload {
  /** 하드웨어 device_id — 연결된 디바이스 고유 식별자 */
  device_id?: string
  /** 펌웨어 버전 (예: 'v2.8.1') */
  fw_version?: string
  /** KSM 버전 (보안 칩 펌웨어) */
  ksm_version?: string
  /** 디바이스 상태 (예: 'initialised') */
  state?: string
  /** 등록된 코인 리스트 */
  coin_list?: Array<{ name: string }>
  /** 지문 등록 정보 */
  fingerprint?: { max: number; enrolled: number }
  /** 사용자 설정 레이블 */
  label?: string
  /** 연결 타입 */
  connectType?: 'usb' | 'ble'
  /** 디바이스 부착 여부 */
  isAttached?: boolean
}
/* eslint-enable camelcase */
