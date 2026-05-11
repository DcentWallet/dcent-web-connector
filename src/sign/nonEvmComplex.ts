/**
 * v1 non-EVM complex sign wrappers — module-level functions (m08-01-04.5)
 *
 * v1 src-v1/index.js의 9개 복잡 wrapper를 v2 facade에 1:1 호환 port:
 *   - getTrcTokenSignedTransaction (l1325-1338) — method drift `'getTronSignedTransaction'` (R1/D-14)
 *   - getTezosSignedTransaction (l1340-1365) — UnitConverter(fee, TEZOS) padStart 16 + Union method
 *   - getVechainSignedTransaction (l1367-1391) — UnitConverter(fee, VECHAIN) padStart 16 + Union
 *   - getNearSignedTransaction (l1393-1420) — magic prefix `'000000ef'+'00000010'` + UnitConverter
 *     padStart 32, fee=`'00'`, optionParam concat (`+=`)
 *   - getHavahSignedTransaction (l1422-1447) — UnitConverter(fee, HAVAH) padStart 16 + Union
 *   - getPolkadotSignedTransaction (l1449-1473) — UnitConverter(fee, POLKADOT) padStart 16 + Union
 *   - getCosmosSignedTransaction (l1475-1511) — getCzonDecimal lookup + isCzoneCoinType remap +
 *     response_from === 'czone' 시 원래 coinType 복원
 *   - getAlgorandSignedTransaction (l1513-1538) — UnitConverter(fee, ALGORAND) padStart 16 + Union
 *   - getParachainSignedTransaction (l1540-1576) — UnitConverter(fee, dApp feeDecimals) padStart 16 +
 *     Union + success 응답 시 signed_tx에 '0x00' prefix (R2)
 *
 * 핵심 동작:
 *   - 8개 wrapper가 `'getUnionSignedTransaction'` 단일 method로 dispatch (TrcToken만 method drift)
 *   - fee 인코딩: UnitConverter(fee, decimals).bignum.toString(16).padStart(16/32, '0')
 *   - Cosmos: coinType remap (czone family → 'czone') + response_from remap (응답 복원)
 *   - Parachain: success 응답의 signed_tx에 '0x00' prefix (failure이면 그대로)
 *   - inline destructured object type (F-05) — 별도 TxParams interface 파일 미신설
 *
 * 룰 준수:
 *   - boundary-validation: Cosmos getCzonDecimal lookup이 unknown coinType 시 throw (v1 1:1)
 *   - error-handling-consistency: Cosmos lookup 실패 throw, 그 외는 _call 위임
 *   - mutation-isolation: _call이 매 호출마다 새 V1Response 객체 반환 (cloneV1Response).
 *     Cosmos / Parachain 응답 mutation은 자기 wrapper가 받은 새 객체 내부에서만 수행
 *   - cross-repo-interface-edit: TrcToken method drift는 sdk dispatcher 의존성 보존 (R1/D-14)
 *   - reuse-shared-utils: _call, isCzoneCoinType (m08-01-02.5), coinType (m08-01-01),
 *     coinDecimals + getCzonDecimal (본 child 신설), unitConverter (m08-01-01) 모두 재사용
 *   - dapp-input-sanitization: 현 v1 동작 그대로 보존 — C3 sanitization은 후속 m08-01-06
 *   - external-reference-edge-cases: UnitConverter padStart 정책은 v1 src-v1을 외부 레퍼런스로
 *     bytewise parity 테스트(T-PARITY-01)로 검증
 *   - no-version-bump: package.json version 미수정
 */

/* eslint-disable camelcase */

import { _call } from './call'
import { isCzoneCoinType } from './coinTypeValidators'
import { getCzonDecimal } from './getCzonDecimal'
import { coinType as dcentCoinType } from '../types/coinType'
import { coinDecimals } from '../types/coinDecimals'
import { unitConverter } from '../utils/unitConverter'
import type { V1Response } from './types'

/**
 * v1 dcent.getTrcTokenSignedTransaction (src-v1/index.js#l1325-1338) 1:1 port.
 *
 * **method drift (R1/D-14)**: wrapper 이름이 `getTrcTokenSignedTransaction`이지만 dispatch하는
 * method는 `'getTronSignedTransaction'`이다. sdk popup의 dispatcher가 Tron과 같은 핸들러를
 * 공유하므로 의도적으로 보존. 변경하려면 cross-repo (dcent-web-sdk dispatcher) 변경 필요 —
 * 본 chain 범위 초과.
 */
export async function getTrcTokenSignedTransaction ({
  unsignedTx,
  fee,
  path,
}: {
  unsignedTx: string
  fee: string | number
  path: string
}): Promise<V1Response> {
  return _call({
    method: 'getTronSignedTransaction', // 의도적 method drift — v1 1:1 보존 (R1/D-14)
    params: {
      unsigned_tx: unsignedTx,
      fee,
      path,
    },
  })
}

/**
 * v1 dcent.getTezosSignedTransaction (src-v1/index.js#l1340-1365) 1:1 port.
 *
 * 동작: UnitConverter(fee, coinDecimals.TEZOS=6).bignum.toString(16).padStart(16, '0').
 * method='getUnionSignedTransaction'.
 * 선택 인자: nonce / optionParam (truthy일 때만 params에 추가).
 */
export async function getTezosSignedTransaction ({
  coinType,
  sigHash,
  fee,
  decimals,
  nonce,
  path,
  symbol,
  optionParam,
}: {
  coinType: string
  sigHash: string
  fee: string
  decimals: number | string
  nonce?: string
  path: string
  symbol: string
  optionParam?: string
}): Promise<V1Response> {
  const params: Record<string, unknown> = {
    coinType,
    decimals,
    sig_hash: sigHash,
    fee: unitConverter(fee, coinDecimals.TEZOS).bignum.toString(16).padStart(16, '0'),
    path,
    symbol,
  }
  if (nonce) params.nonce = nonce
  if (optionParam) params.optionParam = optionParam

  return _call({
    method: 'getUnionSignedTransaction',
    params,
  })
}

/**
 * v1 dcent.getVechainSignedTransaction (src-v1/index.js#l1367-1391) 1:1 port.
 *
 * 동일 패턴 — coinDecimals.VECHAIN=18.
 */
export async function getVechainSignedTransaction ({
  coinType,
  sigHash,
  fee,
  decimals,
  nonce,
  path,
  symbol,
  optionParam,
}: {
  coinType: string
  sigHash: string
  fee: string
  decimals: number | string
  nonce?: string
  path: string
  symbol: string
  optionParam?: string
}): Promise<V1Response> {
  const params: Record<string, unknown> = {
    coinType,
    decimals,
    sig_hash: sigHash,
    fee: unitConverter(fee, coinDecimals.VECHAIN).bignum.toString(16).padStart(16, '0'),
    path,
    symbol,
  }
  if (nonce) params.nonce = nonce
  if (optionParam) params.optionParam = optionParam

  return _call({
    method: 'getUnionSignedTransaction',
    params,
  })
}

/**
 * v1 dcent.getNearSignedTransaction (src-v1/index.js#l1393-1420) 1:1 port.
 *
 * 특수 동작:
 *   - magic prefix `'000000ef' + '00000010'` + UnitConverter(fee, NEAR=24) padStart 32 (16 아님)
 *   - params.fee는 literal `'00'` (실제 fee 값은 optionParam으로 전달)
 *   - optionParam에 nearFee를 먼저 넣고, dApp이 optionParam을 추가 전달하면 `+=`로 concat
 */
export async function getNearSignedTransaction ({
  coinType,
  sigHash,
  fee,
  decimals,
  nonce,
  path,
  symbol,
  optionParam,
}: {
  coinType: string
  sigHash: string
  fee: string
  decimals: number | string
  nonce?: string
  path: string
  symbol: string
  optionParam?: string
}): Promise<V1Response> {
  const nearFee = '000000ef' + '00000010' +
    unitConverter(fee, coinDecimals.NEAR).bignum.toString(16).padStart(32, '0')

  const params: Record<string, unknown> = {
    coinType,
    decimals,
    sig_hash: sigHash,
    fee: '00',
    path,
    symbol,
    optionParam: nearFee,
  }
  if (nonce) params.nonce = nonce
  // v1 l1414: dApp optionParam은 nearFee에 concat (`+=`)
  if (optionParam) params.optionParam = (params.optionParam as string) + optionParam

  return _call({
    method: 'getUnionSignedTransaction',
    params,
  })
}

/**
 * v1 dcent.getHavahSignedTransaction (src-v1/index.js#l1422-1447) 1:1 port.
 *
 * 동일 패턴 — coinDecimals.HAVAH=18.
 */
export async function getHavahSignedTransaction ({
  coinType,
  sigHash,
  fee,
  decimals,
  nonce,
  path,
  symbol,
  optionParam,
}: {
  coinType: string
  sigHash: string
  fee: string
  decimals: number | string
  nonce?: string
  path: string
  symbol: string
  optionParam?: string
}): Promise<V1Response> {
  const params: Record<string, unknown> = {
    coinType,
    decimals,
    sig_hash: sigHash,
    fee: unitConverter(fee, coinDecimals.HAVAH).bignum.toString(16).padStart(16, '0'),
    path,
    symbol,
  }
  if (nonce) params.nonce = nonce
  if (optionParam) params.optionParam = optionParam

  return _call({
    method: 'getUnionSignedTransaction',
    params,
  })
}

/**
 * v1 dcent.getPolkadotSignedTransaction (src-v1/index.js#l1449-1473) 1:1 port.
 *
 * 동일 패턴 — coinDecimals.POLKADOT=10.
 */
export async function getPolkadotSignedTransaction ({
  coinType,
  sigHash,
  fee,
  decimals,
  nonce,
  path,
  symbol,
  optionParam,
}: {
  coinType: string
  sigHash: string
  fee: string
  decimals: number | string
  nonce?: string
  path: string
  symbol: string
  optionParam?: string
}): Promise<V1Response> {
  const params: Record<string, unknown> = {
    coinType,
    decimals,
    sig_hash: sigHash,
    fee: unitConverter(fee, coinDecimals.POLKADOT).bignum.toString(16).padStart(16, '0'),
    path,
    symbol,
  }
  if (nonce) params.nonce = nonce
  if (optionParam) params.optionParam = optionParam

  return _call({
    method: 'getUnionSignedTransaction',
    params,
  })
}

/**
 * v1 dcent.getCosmosSignedTransaction (src-v1/index.js#l1475-1511) 1:1 port.
 *
 * 특수 동작:
 *   - decimal 결정: COSMOS면 coinDecimals.COSMOS, 아니면 getCzonDecimal(coinType) (czone family lookup)
 *   - getCzonDecimal이 unknown coinType에 throw — v1처럼 그대로 propagate
 *   - coinType remap: isCzoneCoinType(coinType)이 true면 'czone'으로 remap (czone wallet 그룹)
 *   - 응답 후처리: response_from === 'czone'이면 원래 coinType으로 복원
 *     → dApp은 czone 그룹이라는 사실을 모르고 자기가 보낸 coinType 그대로 응답받음
 *
 * 매개변수 alias: 인자명 `ct`로 받지 않고 `coinType`으로 받되, dcentCoinType enum import와의
 * 변수명 충돌은 enum을 `dcentCoinType`으로 alias함으로써 해결.
 */
export async function getCosmosSignedTransaction ({
  coinType,
  sigHash,
  fee,
  decimals,
  nonce,
  path,
  symbol,
  optionParam,
}: {
  coinType: string
  sigHash: string
  fee: string
  decimals: number | string
  nonce?: string
  path: string
  symbol: string
  optionParam?: string
}): Promise<V1Response> {
  let decimal: number
  try {
    decimal = (coinType.toLowerCase() === dcentCoinType.COSMOS.toLowerCase())
      ? coinDecimals.COSMOS
      : getCzonDecimal(coinType) // unknown coinType → throw
  } catch (error) {
    throw error
  }

  const params: Record<string, unknown> = {
    coinType: isCzoneCoinType(coinType) ? 'czone' : coinType,
    decimals,
    sig_hash: sigHash,
    fee: unitConverter(fee, decimal).bignum.toString(16).padStart(16, '0'),
    path,
    symbol,
  }
  if (nonce) params.nonce = nonce
  if (optionParam) params.optionParam = optionParam

  const res = await _call({
    method: 'getUnionSignedTransaction',
    params,
  })

  // v1 l1507-1509 — czone family 응답은 원래 coinType으로 복원
  if (res.header.response_from === 'czone') {
    res.header.response_from = coinType
  }
  return res
}

/**
 * v1 dcent.getAlgorandSignedTransaction (src-v1/index.js#l1513-1538) 1:1 port.
 *
 * 동일 패턴 — coinDecimals.ALGORAND=6.
 */
export async function getAlgorandSignedTransaction ({
  coinType,
  sigHash,
  fee,
  decimals,
  nonce,
  path,
  symbol,
  optionParam,
}: {
  coinType: string
  sigHash: string
  fee: string
  decimals: number | string
  nonce?: string
  path: string
  symbol: string
  optionParam?: string
}): Promise<V1Response> {
  const params: Record<string, unknown> = {
    coinType,
    decimals,
    sig_hash: sigHash,
    fee: unitConverter(fee, coinDecimals.ALGORAND).bignum.toString(16).padStart(16, '0'),
    path,
    symbol,
  }
  if (nonce) params.nonce = nonce
  if (optionParam) params.optionParam = optionParam

  return _call({
    method: 'getUnionSignedTransaction',
    params,
  })
}

/**
 * v1 dcent.getParachainSignedTransaction (src-v1/index.js#l1540-1576) 1:1 port.
 *
 * 특수 동작:
 *   - feeDecimals는 dApp 인자 (다른 wrapper와 달리 상수가 아님)
 *   - RPCUrl, feeSymbol, feeDecimals 모두 params에 forward (Parachain 전용)
 *   - 응답 후처리 (R2): success 응답이면 signed_tx에 '0x00' prefix 추가
 *     - 기존 signed_tx가 '0x'로 시작하면 strip 후 '0x00' prepend
 *     - '0x'로 시작하지 않으면 그대로 '0x00' prepend
 *   - failure 응답이면 그대로 return (prefix 추가 안 함 — failure 회귀 가드)
 */
export async function getParachainSignedTransaction ({
  coinType,
  sigHash,
  fee,
  decimals,
  nonce,
  path,
  symbol,
  RPCUrl,
  feeSymbol,
  feeDecimals,
  optionParam,
}: {
  coinType: string
  sigHash: string
  fee: string
  decimals: number | string
  nonce?: string
  path: string
  symbol: string
  RPCUrl: string
  feeSymbol: string
  feeDecimals: number | string
  optionParam?: string
}): Promise<V1Response> {
  const params: Record<string, unknown> = {
    coinType,
    sig_hash: sigHash,
    fee: unitConverter(fee, feeDecimals).bignum.toString(16).padStart(16, '0'),
    decimals,
    path,
    symbol,
    RPCUrl,
    feeSymbol,
    feeDecimals,
  }
  if (nonce) params.nonce = nonce
  if (optionParam) params.optionParam = optionParam

  const res = await _call({
    method: 'getUnionSignedTransaction',
    params,
  })

  // v1 l1572-1574 — success 응답일 때만 signed_tx에 '0x00' prefix
  if (res.header.status === 'success' && res.body.parameter && typeof res.body.parameter.signed_tx === 'string') {
    const signedTx = res.body.parameter.signed_tx as string
    res.body.parameter.signed_tx = '0x00' +
      (signedTx.startsWith('0x') ? signedTx.substr(2) : signedTx)
  }
  return res
}
