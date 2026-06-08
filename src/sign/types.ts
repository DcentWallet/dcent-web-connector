/**
 * v2 sign 응답 타입 — v1 호환 형태 (m08-01-02)
 *
 * v1의 `messageReceive` 핸들러가 dApp에 돌려주던 payload(`{header, body}`) 구조와 1:1 호환.
 * dApp이 v2 통합 sign API를 호출할 때 받는 응답이 v1 시절과 동일한 shape을 갖도록 보장한다.
 *
 * **m12-03**: V1Response를 generic으로 확장해 `body.parameter`에 typed narrow를 지원.
 * 기존 호출자는 default `TParam = Record<string, unknown>`으로 backward-compat.
 * `CallOptions` / `DeviceInfoPayload` 신설.
 *
 * 룰 준수:
 *   - mutation-isolation: V1Response는 매 호출마다 새 객체로 생성 (call.ts 참조)
 *   - boundary-validation: header/body 필드 존재 여부는 호출자 또는 _assertV1Success가 검증
 */

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
  /**
   * (Session deviceId, 2026-05-22) sdk가 응답 envelope top-level에 echo한 HW device_id.
   * dApp이 첫 응답에서 캡처하여 후속 호출의 method param `deviceId`로 사용. transport
   * 미초기화 / disconnect 후 응답이면 undefined. cross-repo-interface-edit 룰의 양방향 짝.
   */
  deviceId?: string
}

/**
 * dApp-facing 메서드 옵션 — deviceId (m12-03).
 *
 * HIGH / MEDIUM priority facade 메서드의 마지막 optional 인자.
 * dApp이 이전 응답 `V1Response.deviceId` 에서 캡처한 값을 전달하면
 * `_call` → PopupTransport.setPendingDeviceId → sdk handshake로 전달되어
 * 특정 디바이스에 자동 연결 (picker 없음).
 *
 * 미명시 시 기존 흐름 (picker UI 또는 이전 session binding).
 */
export interface CallOptions {
  deviceId?: string
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
 * v2 account wire — getAccountInfo 응답 항목 (m09-04-12).
 *
 * sdk(m09-03-21)가 enrich한 결과 shape. connector는 응답을 forward만 — 타입 narrow 전용.
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
