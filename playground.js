/**
 * playground.js — DCENT Connector v2 Playground
 *
 * 외부 라이브러리 0, 표준 DOM API만 사용.
 * dist/v2/dcent-web-connector.min.js 로드 후 index-v2.html에서 alias:
 *   <script>window.dcent = (window.dcent && window.dcent.default) || window.dcent;</script>
 * 결과: window.dcent === facade default export object (v0.16.0 App이 require()로 받는 것과 동일 shape)
 *
 * m08-01-05 (D-04 B finality): playground이 PopupTransport / SerialRequestQueue / _genId 직접 사용 패턴을
 * 모두 제거하고 facade의 `dcent.<method>()` 호출로 단순화. transport/queue는 facade singleton이 내부 관리.
 *
 * 룰 준수:
 *   - error-handling-consistency: 모든 실패 경로는 appendLog({ error: ... }) 통일
 *   - boundary-validation: keyPath / message / transaction 필드 검증 후 dispatcher 호출
 *   - async-hygiene: await + catch 블록 정형화
 *   - sensitive-info-logging: console 호출 0
 *   - no-console-direct: playground.js는 src/ 바깥이나 방어적으로 0건 유지
 *
 * m06-01-02: signTransaction EVM 추가
 *   - CHAIN_KEY_PATH inline 테이블 제거 (R13=a) → chains.evm.json runtime fetch lookup
 *   - EVM 트리 그룹: Sign Transaction > Ethereum (EIP-155) > chain variants
 *   - presets.evm.json 로드 (runtime fetch)
 *
 * m06-01-03: signTransaction 비-EVM 6 family 추가
 *   - chains.evm.json → chains.json 통합 (EVM + Bitcoin/Solana/XRP/Hedera/Stellar/Tron)
 *   - FAMILY_LABELS: family → 표시명 매핑
 *   - NON_EVM_FAMILIES: 비-EVM family ID 배열 (트리 그룹 동적 생성)
 *   - loadChainsData(): chains.json + presets.evm.json + presets.non-evm.json 통합 로드
 *   - buildNonEvmSignTxGroup(): 비-EVM family별 트리 그룹 동적 빌드
 *   - sendSignTxNonEvm(): 비-EVM signTransaction dispatcher
 *
 * m06-01-04: signTransaction Rest 8 family 추가
 *   - NON_EVM_FAMILIES 6 → 13 (algorand / conflux / cosmos / fil / polkadot / stacks / tezos / vechain 추가)
 *   - FAMILY_LABELS 7 → 14 (Rest family 표시명 추가)
 *   - presets.rest.json runtime fetch + nonEvmPresetsList 병합
 *   - test API: simulateRestLoad alias + buildTree 노출 (T-U-REST-03 트리 노드 수 검증, R4=a)
 */
;(function () {
  'use strict'

  // ── Solana placeholder substitution helper ──
  // App이 보내는 Solana transaction의 feePayer + signer pubkey가 실제 wallet 주소가 아닌
  // placeholder("11111111111111111111111111111111" = SystemProgram address)면, @solana/web3.js의
  // VersionedTransaction.addSignature(walletPubkey, sig)에서 "signer가 message의 signer 자리에
  // 없다"며 reject한다.
  //
  // playground는 device에서 실제 wallet 주소를 fetch한 뒤 transaction 객체의 placeholder를
  // 치환한다 — 단, SystemProgram의 programId는 그대로 두어야 한다 (SystemProgram address가
  // 정상 값).
  //
  // 적용 대상 필드:
  //   - txObj.feePayer (Case 2 plain JSON)
  //   - txObj.instructions[*].keys[*].pubkey  ← isSigner: true 인 entry만
  //   - txObj.sender                          ← Case 3 wm-internal TransactionCommon shape
  //   ⚠ txObj.instructions[*].programId 는 절대 치환하지 않음 (SystemProgram address가 정상)
  //
  // Case 1 (base58 serialized full transaction string) 은 opaque — substitute 불가.
  // App이 직접 wallet 주소로 transaction을 construct해야 한다.
  //
  // 반환: 새 객체 (deep clone via JSON, 원본 보존). string 또는 substitute 불가 케이스는 그대로 반환.
  function _substituteSolanaSigner (txObj, walletAddress) {
    if (typeof txObj === 'string') return txObj // Case 1 opaque
    if (!txObj || typeof txObj !== 'object') return txObj
    if (!walletAddress || typeof walletAddress !== 'string') return txObj
    var clone
    try {
      clone = JSON.parse(JSON.stringify(txObj))
    } catch (e) {
      return txObj
    }
    // Case 2: plain JSON {version, feePayer, instructions, recentBlockhash}
    if (Object.prototype.hasOwnProperty.call(clone, 'feePayer')) {
      clone.feePayer = walletAddress
    }
    if (Array.isArray(clone.instructions)) {
      clone.instructions.forEach(function (ins) {
        if (!ins || !Array.isArray(ins.keys)) return
        // programId 는 건드리지 않음 — SystemProgram address("11111111111111111111111111111111") 는 정상 값
        ins.keys.forEach(function (k) {
          if (k && k.isSigner === true) {
            k.pubkey = walletAddress
          }
        })
      })
    }
    // Case 3: wm-internal TransactionCommon {type, sender, recipient, amount, ...}
    if (Object.prototype.hasOwnProperty.call(clone, 'sender')) {
      clone.sender = walletAddress
    }
    return clone
  }

  // ── Algorand placeholder substitution helper ──
  // Algorand 표준 tx({type:'pay', from, to, amount, fee, firstRound, lastRound, ...})는
  // `from` 필드가 sender. App이 placeholder("ALGORAND7XVFXWDX5..." 등)를 보내면 device
  // 서명 후 algosdk의 signTransaction이 reject한다 — sender pubkey 와 derived address 가
  // 일치해야 함.
  //
  // 적용 대상: txObj.from (Algorand 표준), txObj.sender (wm-internal)
  // 보존: txObj.to (recipient), 기타 모든 필드
  function _substituteAlgorandSender (txObj, walletAddress) {
    if (typeof txObj === 'string') return txObj // opaque (msgpack-encoded raw bytes)
    if (!txObj || typeof txObj !== 'object') return txObj
    if (!walletAddress || typeof walletAddress !== 'string') return txObj
    var clone
    try {
      clone = JSON.parse(JSON.stringify(txObj))
    } catch (e) {
      return txObj
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'from')) {
      clone.from = walletAddress
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'sender')) {
      clone.sender = walletAddress
    }
    return clone
  }

  // ── Tezos placeholder substitution helper ──
  // taquito 표준 tx({kind:'transaction', source, fee, counter, gasLimit, storageLimit, amount, destination})
  // 의 `source` 필드가 sender. App이 placeholder("tz1burnburn..." 또는 wm-internal `sender`)를
  // 보내면 device 서명 후 taquito가 reject — counter / reveal / signer pubkey 매칭 실패.
  //
  // 적용 대상: txObj.source (Tezos 표준), txObj.sender (wm-internal)
  // 보존: txObj.destination, fee, counter, gasLimit, storageLimit, amount, kind 등
  function _substituteTezosSource (txObj, walletAddress) {
    if (typeof txObj === 'string') return txObj // opaque (forged hex bytes 등)
    if (!txObj || typeof txObj !== 'object') return txObj
    if (!walletAddress || typeof walletAddress !== 'string') return txObj
    var clone
    try {
      clone = JSON.parse(JSON.stringify(txObj))
    } catch (e) {
      return txObj
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'source')) {
      clone.source = walletAddress
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'sender')) {
      clone.sender = walletAddress
    }
    return clone
  }

  // ── Hedera placeholder substitution helper ──
  // Hedera TransferTransaction({type:'CryptoTransfer', transfers:[{accountId, amount}, ...]})의
  // transfers 배열에서 **amount<0 인 entry가 sender** (HBAR 출금). App이 placeholder("0.0.2"
  // 등)를 보내면 device 서명 후 Hedera SDK가 reject — signer publicKey와 sender accountId 매칭 실패.
  //
  // 적용 대상: transfers[].accountId where amount < 0 (sender 측), txObj.sender (wm-internal)
  // 보존: amount > 0 entry (recipient), memo, maxTransactionFee 등
  //
  // 권고 (별도 작업): Hedera는 pubkey raw hex → DER format 변환이 추가로 필요. 본 helper는
  // accountId 치환만 처리하며 pubkey format 변환은 App 또는 wm 단에서 별도 처리.
  function _substituteHederaSender (txObj, walletAddress) {
    if (typeof txObj === 'string') return txObj
    if (!txObj || typeof txObj !== 'object') return txObj
    if (!walletAddress || typeof walletAddress !== 'string') return txObj
    var clone
    try {
      clone = JSON.parse(JSON.stringify(txObj))
    } catch (e) {
      return txObj
    }
    if (Array.isArray(clone.transfers)) {
      clone.transfers.forEach(function (t) {
        if (!t || typeof t !== 'object') return
        // amount 가 number / string 모두 가능. 음수면 sender 출금 entry.
        var amountNum = typeof t.amount === 'number'
          ? t.amount
          : typeof t.amount === 'string' ? Number(t.amount) : NaN
        if (Number.isFinite(amountNum) && amountNum < 0) {
          t.accountId = walletAddress
        }
      })
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'sender')) {
      clone.sender = walletAddress
    }
    return clone
  }

  // ── XRP / Xahau placeholder substitution helper ──
  // XRPL Payment({TransactionType, Account, Destination, Amount, Fee, Sequence, ...}) 의 `Account`
  // 필드가 sender. App 이 placeholder("rHb9...") 를 보내면 device 서명 시 firmware 가 Account ↔
  // derived pubkey 불일치로 'Invalid Unsigned'(firmware code='invalid_format') reject 한다.
  // Xahau 는 XRPL 사이드체인으로 동일 shape(ripple 로직 공유) → 같은 helper 적용.
  //
  // 적용 대상: txObj.Account (XRPL 표준), txObj.sender (wm-internal)
  // 보존: txObj.Destination (recipient), Amount, Fee, Sequence, Flags 등
  function _substituteXrpAccount (txObj, walletAddress) {
    if (typeof txObj === 'string') return txObj // opaque (pre-encoded blob)
    if (!txObj || typeof txObj !== 'object') return txObj
    if (!walletAddress || typeof walletAddress !== 'string') return txObj
    var clone
    try {
      clone = JSON.parse(JSON.stringify(txObj))
    } catch (e) {
      return txObj
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'Account')) {
      clone.Account = walletAddress
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'sender')) {
      clone.sender = walletAddress
    }
    return clone
  }

  // ── Constellation (DAG) placeholder substitution helper ──
  // Constellation transfer({type:'transfer', source, destination, amount, fee}) 의 `source` 필드가
  // sender. App 이 placeholder("DAG000...0000") 를 보내면 wm 이 source 주소의 last transaction
  // reference 를 live L1 API 로 조회하는데, 존재하지 않는 주소라 404 →
  // "constellation: failed to fetch last transaction reference — Not found".
  // 실 wallet DAG 주소(on-chain 이력 보유)로 치환하면 lastRef 조회가 성공한다.
  //
  // destination 도 zero-filled placeholder("DAG000...0001") 면 walletAddress 로 치환 → self-transfer.
  // 이 placeholder 는 Constellation 체크섬을 만족하지 않는 invalid 주소라, wm/firmware 가 파싱할 때
  // recipient/amount 표시가 깨진다 (실측: amount 1 DAG 가 0.01531742 DAG 로, to 가 DAG000...0000 으로
  // 뭉개짐). 다른 family 의 zero-address placeholder(EVM 0x000.., Solana 111..112)는 구조적으로
  // valid 라 통하지만 Constellation 은 체크섬 검증이 있어 통하지 않는다. 실제 수신처를 입력한
  // 경우(placeholder 아님)는 보존 — source 와 달리 destination 은 조건부 치환.
  //
  // 적용 대상: txObj.source / txObj.sender (무조건), txObj.destination (placeholder 일 때만)
  // 보존: 실제 destination(recipient), amount, fee, type
  function _substituteConstellationSource (txObj, walletAddress) {
    if (typeof txObj === 'string') return txObj
    if (!txObj || typeof txObj !== 'object') return txObj
    if (!walletAddress || typeof walletAddress !== 'string') return txObj
    var clone
    try {
      clone = JSON.parse(JSON.stringify(txObj))
    } catch (e) {
      return txObj
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'source')) {
      clone.source = walletAddress
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'sender')) {
      clone.sender = walletAddress
    }
    // zero-filled placeholder destination("DAG" + 20자 이상 연속 0)만 self-transfer 로 치환.
    // 실 DAG 주소는 parity 자리가 0이어도 20자 연속 0을 갖지 않으므로 valid recipient 는 보존.
    if (
      Object.prototype.hasOwnProperty.call(clone, 'destination') &&
      typeof clone.destination === 'string' &&
      /^DAG0{20,}/.test(clone.destination)
    ) {
      clone.destination = walletAddress
    }
    return clone
  }

  // ── Tron placeholder substitution helper ──
  // Tron tx 는 nested 봉투: raw_data.contract[].parameter.value.owner_address 가 sender.
  // App 이 placeholder owner_address 를 보내면 device 서명 후 TronWeb 이 owner_address ↔
  // derived address 불일치로 reject. flattened form(top-level owner_address) + wm-internal
  // sender 도 함께 치환. 보존: to_address(recipient), contract_address, amount, data 등.
  function _substituteTronOwner (txObj, walletAddress) {
    if (typeof txObj === 'string') return txObj
    if (!txObj || typeof txObj !== 'object') return txObj
    if (!walletAddress || typeof walletAddress !== 'string') return txObj
    var clone
    try {
      clone = JSON.parse(JSON.stringify(txObj))
    } catch (e) {
      return txObj
    }
    var contracts = clone.raw_data && clone.raw_data.contract
    if (Array.isArray(contracts)) {
      contracts.forEach(function (c) {
        var v = c && c.parameter && c.parameter.value
        if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'owner_address')) {
          v.owner_address = walletAddress
        }
      })
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'owner_address')) {
      clone.owner_address = walletAddress
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'sender')) {
      clone.sender = walletAddress
    }
    return clone
  }

  // ── `from`-field placeholder substitution helper (Conflux / Havah) ──
  // Conflux({from,to,value,...}) / Havah(ICON-native {from,to,value,nid,...}) 의 `from` 이 sender.
  // placeholder from 을 보내면 서명 후 라이브러리/firmware 가 from ↔ derived address 불일치로 reject.
  // 보존: to(recipient), value, nid, stepLimit, gas 등. wm-internal sender 도 함께 치환.
  function _substituteFromField (txObj, walletAddress) {
    if (typeof txObj === 'string') return txObj
    if (!txObj || typeof txObj !== 'object') return txObj
    if (!walletAddress || typeof walletAddress !== 'string') return txObj
    var clone
    try {
      clone = JSON.parse(JSON.stringify(txObj))
    } catch (e) {
      return txObj
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'from')) {
      clone.from = walletAddress
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'sender')) {
      clone.sender = walletAddress
    }
    return clone
  }

  // ── Cosmos placeholder substitution helper ──
  // Cosmos amino({chain_id, msgs:[{type, value:{from_address, to_address, amount}}], ...}) 의
  // msgs[].value.from_address 가 sender. placeholder 면 서명 후 signer pubkey 불일치로 reject.
  // 보존: to_address(recipient), amount, fee, memo 등. wm-internal sender 도 함께 치환.
  function _substituteCosmosSender (txObj, walletAddress) {
    if (typeof txObj === 'string') return txObj
    if (!txObj || typeof txObj !== 'object') return txObj
    if (!walletAddress || typeof walletAddress !== 'string') return txObj
    var clone
    try {
      clone = JSON.parse(JSON.stringify(txObj))
    } catch (e) {
      return txObj
    }
    if (Array.isArray(clone.msgs)) {
      clone.msgs.forEach(function (m) {
        var v = m && m.value
        if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'from_address')) {
          v.from_address = walletAddress
        }
      })
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'sender')) {
      clone.sender = walletAddress
    }
    return clone
  }

  // ── NEAR placeholder substitution helper ──
  // NEAR({type:'transfer', sender:'x.near', recipient:'y.near', amount, ...}) 의 `sender`(또는
  // 일부 포맷의 `signerId`)가 sender. placeholder named account 면 서명 후 access key 불일치로 reject.
  // 보존: recipient, amount, blockHash, publicKey 등.
  function _substituteNearSender (txObj, walletAddress) {
    if (typeof txObj === 'string') return txObj
    if (!txObj || typeof txObj !== 'object') return txObj
    if (!walletAddress || typeof walletAddress !== 'string') return txObj
    var clone
    try {
      clone = JSON.parse(JSON.stringify(txObj))
    } catch (e) {
      return txObj
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'signerId')) {
      clone.signerId = walletAddress
    }
    if (Object.prototype.hasOwnProperty.call(clone, 'sender')) {
      clone.sender = walletAddress
    }
    return clone
  }

  // ── STACKS sender substitution helper (m02-05-70) ──
  // Stacks 서명자는 항상 디바이스 계정(spending condition, 키에서 파생). SIP-010 transfer 의
  // sender 인자는 서명자와 같아야 유효하므로(자기 토큰만 전송 가능) device 주소로 치환한다.
  //  - form-E contractCall: functionArgs[1] = sender. 문자열('SP...') 또는 Clarity 값
  //    ({type:'principal', value:'SP...'}) 두 shape 모두 지원.
  //  - form-D descriptor: top-level `from` = sender(wm builder 의 resolveDescriptorSender 입력).
  // 보존: contractAddress/contractName/functionName, functionArgs[0](amount)/[2](recipient)/[3](memo),
  //       token.contract/to/amount 등. native STX(tokenTransfer)는 sender 필드 없음(키 파생) → no-op.
  function _substituteStacksSender (txObj, walletAddress) {
    if (typeof txObj === 'string') return txObj
    if (!txObj || typeof txObj !== 'object') return txObj
    if (!walletAddress || typeof walletAddress !== 'string') return txObj
    var clone
    try {
      clone = JSON.parse(JSON.stringify(txObj))
    } catch (e) {
      return txObj
    }
    // form-D descriptor: sender = top-level `from`.
    if (clone.token && typeof clone.token === 'object') {
      clone.from = walletAddress
    }
    // form-E contractCall transfer: sender = functionArgs[1].
    if (Array.isArray(clone.functionArgs) && clone.functionArgs.length > 1) {
      var arg = clone.functionArgs[1]
      if (arg && typeof arg === 'object' && Object.prototype.hasOwnProperty.call(arg, 'value')) {
        arg.value = walletAddress // Clarity 값 형태 {type:'principal', value}
      } else {
        clone.functionArgs[1] = walletAddress // 평문 'SP...' 형태
      }
    }
    // 일부 shape 의 top-level sender 도 함께 치환(방어).
    if (Object.prototype.hasOwnProperty.call(clone, 'sender')) {
      clone.sender = walletAddress
    }
    return clone
  }

  // family-aware sender substitution dispatcher. 치환 가능: ethereum(from) / solana / algorand /
  // tezos / hedera / xrp / xahau / constellation / tron / conflux / havah / cosmos / near / stacks.
  // EVM(ethereum)은 보통 from 생략(signer 암시)이라 _substituteFromField 가 대개 no-op.
  // stacks(m02-05-70): SIP-010 form-E functionArgs[1] / form-D from 을 치환(native STX는 no-op).
  // payload 에 sender 필드가 없는 family(bitcoin / stellar / polkadot / vechain / fil /
  // cardano-CBOR)는 미등록 — 원본 그대로 반환 (no-op). 버튼은 전 family 노출되며, no-op 은
  // 클릭 핸들러가 JSON 무변화로 감지해 안내한다.
  function _substituteSenderByFamily (txObj, family, walletAddress) {
    if (family === 'ethereum') return _substituteFromField(txObj, walletAddress)
    if (family === 'solana') return _substituteSolanaSigner(txObj, walletAddress)
    if (family === 'algorand') return _substituteAlgorandSender(txObj, walletAddress)
    if (family === 'tezos') return _substituteTezosSource(txObj, walletAddress)
    if (family === 'hedera') return _substituteHederaSender(txObj, walletAddress)
    if (family === 'xrp' || family === 'xahau') return _substituteXrpAccount(txObj, walletAddress)
    if (family === 'constellation') return _substituteConstellationSource(txObj, walletAddress)
    if (family === 'tron') return _substituteTronOwner(txObj, walletAddress)
    if (family === 'conflux' || family === 'havah') return _substituteFromField(txObj, walletAddress)
    if (family === 'cosmos') return _substituteCosmosSender(txObj, walletAddress)
    if (family === 'near') return _substituteNearSender(txObj, walletAddress)
    if (family === 'stacks') return _substituteStacksSender(txObj, walletAddress)
    return txObj
  }

  // ── b08-01: v1 호환 envelope unwrap helper ──
  // facade가 resolve로 돌려준 failure 응답을 throw로 변환한다.
  // src/sign/assert.ts:_assertV1Success와 유사하지만 다른 정책 — playground 인라인 버전은
  // success path에서 추가로 body.parameter까지 unwrap하고, throw 시 plain Error 사용
  // (playground는 ProviderError import 회피 — vanilla JS).
  // v1 특례(transaction.user_cancel)는 throw하지 않고 body를 그대로 반환 (호환 보존).
  function _unwrapV1Envelope (resp) {
    // v1 envelope이 아닌 경우(legacy result 형태 / null / primitive)는 그대로 반환
    if (!resp || typeof resp !== 'object' || !resp.header || typeof resp.header !== 'object') {
      return resp
    }
    var status = resp.header.status
    if (status === 'success') {
      // body.parameter가 있으면 그것을, 없으면 envelope 자체 (호출자가 알아서 처리)
      return (resp.body && resp.body.parameter) || resp.body || resp
    }
    // status === 'failure' — v1 특례 보존
    var cmd = resp.body && resp.body.command
    var errCode = resp.body && resp.body.error && resp.body.error.code
    if (cmd === 'transaction' && errCode === 'user_cancel') {
      // user_cancel은 facade가 resolve로 돌려주는 v1 특례 — playground도 동일하게 resolve 흐름 유지
      return resp.body.parameter || resp.body || resp
    }
    // 그 외 failure → throw (호출자의 .catch가 받아 normalizeError + appendLog error 분기)
    var msg = (resp.body && resp.body.error && resp.body.error.message) || 'unknown failure'
    var err = new Error(msg)
    err.code = errCode || 'internal_error'
    err.v1Envelope = resp
    throw err
  }

  // ── EVM chains runtime state (chains.json 로드 후 채워짐) ──
  // chainId → { displayName, defaultKeyPath, family }
  var evmChainsMap = {} // 로드 완료 전: 빈 객체
  var evmChainsList = [] // 순서 유지용 배열
  var evmPresetsMap = {} // presetId → preset object
  var evmPresetsList = [] // 전체 EVM preset 배열

  // ── 비-EVM chains runtime state (chains.json 로드 후 채워짐) ──
  // family → ChainEntry[]
  var nonEvmChainsByFamily = {} // e.g. { bitcoin: [...], solana: [...] }
  // chainId → ChainEntry (전체 lookup용)
  var allChainsMap = {} // m06-01-03: EVM + non-EVM 통합 map
  // 비-EVM preset
  var nonEvmPresetsMap = {} // presetId → preset object
  var nonEvmPresetsList = [] // 전체 비-EVM preset 배열

  // ── account preset runtime state (m11-01-01) ──
  // presets.account.json 로드 후 채워진다. syncAccount form의 preset selector에서 사용.
  var accountPresetsList = [] // 전체 account preset 배열
  var accountPresetsMap = {} // presetId → preset object

  // ── bitcoin tx builder preset runtime state (m11-01-03) ──
  // presets.bitcoin-tx.json 로드 후 채워진다. Builder form의 preset selector에서 사용.
  var bitcoinTxPresetsList = [] // 전체 btx preset 배열
  var bitcoinTxPresetsMap = {} // presetId → preset object

  // ── FAMILY_LABELS: family → 트리 표시명 ──
  // m06-01-03 추가, m06-01-04 신규 8 family 표시명 추가
  var FAMILY_LABELS = {
    ethereum: 'Ethereum (EIP-155)',
    bitcoin: 'Bitcoin',
    solana: 'Solana',
    xrp: 'XRP Ledger',
    hedera: 'Hedera',
    stellar: 'Stellar',
    tron: 'Tron',
    // m06-01-04 신규 8 family
    algorand: 'Algorand',
    conflux: 'Conflux',
    cosmos: 'Cosmos (cosmjs)',
    fil: 'Filecoin',
    polkadot: 'Polkadot',
    stacks: 'Stacks',
    tezos: 'Tezos',
    vechain: 'VeChain',
    // 누락 family 5개 추가 (chains.json엔 있으나 트리에서 빠져있던 family)
    cardano: 'Cardano',
    constellation: 'Constellation (DAG)',
    near: 'NEAR',
    xahau: 'Xahau',
    havah: 'Havah',
  }

  // ── NON_EVM_FAMILIES: 비-EVM family 목록 (트리 그룹 생성 순서) ──
  // m06-01-03 추가, m06-01-04 신규 8 family 추가, 누락 5 family 추가 (ethereum 제외 19개 family)
  var NON_EVM_FAMILIES = [
    'bitcoin', 'solana', 'xrp', 'hedera', 'stellar', 'tron',
    'algorand', 'conflux', 'cosmos', 'fil', 'polkadot', 'stacks', 'tezos', 'vechain',
    'cardano', 'constellation', 'near', 'xahau', 'havah',
  ]

  // ── chainId → default keyPath lookup (chains.json runtime data) ──
  // m06-01-03: allChainsMap으로 통합 (EVM + 비-EVM)
  // CHAIN_KEY_PATH Proxy: chains.json 로드 전에도 안전하게 접근 가능
  var CHAIN_KEY_PATH = new Proxy({}, {
    get: function (_, chainId) {
      if (allChainsMap[chainId]) return allChainsMap[chainId].defaultKeyPath
      // EVM fallback
      if (chainId && chainId.startsWith('eip155:')) return "m/44'/60'/0'/0/0"
      // Solana fallback
      if (chainId && chainId.startsWith('solana:')) return "m/44'/501'/0'"
      return "m/44'/60'/0'/0/0"
    },
    has: function (_, chainId) {
      return !!allChainsMap[chainId]
    },
  })

  // ── 트리 선언적 정의 ──
  // Sign Transaction > Ethereum (EIP-155) 그룹은 chains.evm.json 로드 후
  // buildEvmSignTxGroup()이 동적으로 채운다.
  var TREE = [
    {
      kind: 'group',
      label: 'Device API',
      items: [
        // m11-01-01: v1 read-only / configure API. method id는 trie 분기를 위해
        // 'account:' prefix 유지 (selectMethod / Send dispatcher가 prefix로 분기).
        { kind: 'method', id: 'account:info', label: 'info' },
        { kind: 'method', id: 'account:getDeviceInfo', label: 'getDeviceInfo' },
        { kind: 'method', id: 'account:setLabel', label: 'setLabel' },
      ],
    },
    {
      kind: 'group',
      label: 'Account API',
      items: [
        { kind: 'method', id: 'account:getAccountInfo', label: 'getAccountInfo' },
        { kind: 'method', id: 'account:syncAccount', label: 'syncAccount' },
        { kind: 'method', id: 'account:selectAddress', label: 'selectAddress' },
        { kind: 'method', id: 'account:getAddress', label: 'getAddress' },
        // m09-04-21: chain-agnostic getPublicKey verb — Cardano payment/stake/drep 공개키 조회.
        { kind: 'method', id: 'account:getPublicKey', label: 'getPublicKey' },
        { kind: 'method', id: 'account:getXPUB', label: 'getXPUB' },
      ],
    },
    {
      kind: 'group',
      label: 'Sign Message',
      items: [
        {
          kind: 'family',
          label: 'Ethereum',
          items: [
            {
              kind: 'method',
              id: 'signMessage:eth:personal',
              label: 'personal_sign',
              chainId: 'eip155:1/slip44:60',
              metaKind: 'personal',
            },
            {
              kind: 'method',
              id: 'signMessage:eth:eip712-v3',
              label: 'signTypedData_v3',
              chainId: 'eip155:1/slip44:60',
              metaKind: 'eip712',
              metaVersion: 'V3',
            },
            {
              kind: 'method',
              id: 'signMessage:eth:eip712-v4',
              label: 'signTypedData_v4',
              chainId: 'eip155:1/slip44:60',
              metaKind: 'eip712',
              metaVersion: 'V4',
            },
          ],
        },
        {
          kind: 'family',
          label: 'Solana',
          items: [
            {
              kind: 'method',
              id: 'signMessage:sol:raw',
              label: 'signMessage (raw)',
              chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
              metaKind: 'raw',
            },
          ],
        },
        {
          // m09-04-22-fix: relay chain(dot:raw, slip44/354)은 wm signMessage가 isParaChain 가드로
          // throw(internal_process / Tx Sign Fail)하여 제거. Astar 등 paraChain(slip44/810)만 지원.
          // (Tron/Tezos signMessage는 wm slot이 DC-2296 hotfix로 disabled → family 통째 제거.)
          kind: 'family',
          label: 'Polkadot',
          items: [
            {
              kind: 'method',
              id: 'signMessage:dot:raw:astar',
              label: 'signMessage (raw) — Astar',
              chainId: 'polkadot:9eb76c5184c4ab8679d2d5d819fdf90b/slip44:810',
              metaKind: 'raw',
            },
          ],
        },
        {
          // m10-01-12: Stellar signMessage — wm 0.7.14 stellar/index.js:32 slot 등록.
          // SDK는 signMessage 핸들러로 wm signMessageFromWire에 forward (EVM/Solana와 동일 경로).
          kind: 'family',
          label: 'Stellar',
          items: [
            {
              kind: 'method',
              id: 'signMessage:xlm:raw',
              label: 'signMessage (raw)',
              chainId: 'stellar:pubnet/slip44:148',
              defaultKeyPath: "m/44'/148'/0'",
              metaKind: 'raw',
            },
          ],
        },
      ],
    },
    {
      // m10-01-11 / m10-01-14: App 전용 sign 메서드 — signMessage와 별개 intent.
      //   - signData (Cardano CIP-8/CIP-95): { keyPath, address, payload } → { signature, key }
      //   - signAuthEntry (Stellar Soroban): { keyPath, authEntry } → { signedAuthEntry, signerAddress }
      // SDK 핸들러는 머지됨 (DcentSdkClient signData ~1087 / signAuthEntry ~1044).
      // connector는 chain-agnostic pass-through — method 문자열만 forward
      // (connector-chain-addition-isolation: chain enum/매핑 부재).
      kind: 'group',
      label: 'Sign Data / Auth Entry (App)',
      items: [
        {
          kind: 'family',
          label: 'Cardano',
          items: [
            {
              kind: 'method',
              id: 'signData:ada:cip8',
              label: 'signData (CIP-8/95)',
              chainId: 'cip34:1-764824073',
              defaultKeyPath: "m/44'/1815'/0'/0/0",
            },
          ],
        },
        {
          kind: 'family',
          label: 'Stellar',
          items: [
            {
              kind: 'method',
              id: 'signAuthEntry:xlm:soroban',
              label: 'signAuthEntry (Soroban)',
              chainId: 'stellar:pubnet/slip44:148',
              defaultKeyPath: "m/44'/148'/0'",
            },
          ],
        },
      ],
    },
    {
      kind: 'group',
      label: 'Bitcoin Tx Builder',
      items: [
        // m11-01-03: bitcoin tx builder (3 facade calls + buildAndSign)
        // method id prefix 'btx:' — selectMethod / Send dispatcher가 prefix로 분기
        { kind: 'method', id: 'btx:new', label: 'getBitcoinTransactionObject' },
        { kind: 'method', id: 'btx:addInput', label: 'addBitcoinTransactionInput' },
        { kind: 'method', id: 'btx:addOutput', label: 'addBitcoinTransactionOutput' },
        { kind: 'method', id: 'btx:buildAndSign', label: 'Build & Sign' },
      ],
    },
    {
      kind: 'group',
      id: 'signTx-evm-group',
      label: 'Sign Transaction',
      items: [
        {
          kind: 'family',
          id: 'signTx-evm-family',
          label: 'Ethereum (EIP-155)',
          // items는 chains.json 로드 후 buildEvmSignTxGroup()이 채운다
          items: [
            {
              kind: 'method',
              id: 'signTx:evm:loading',
              label: '(loading chains…)',
              chainId: '',
              _placeholder: true,
            },
          ],
        },
        // m06-01-03: 비-EVM family 그룹은 buildNonEvmSignTxGroups()이 동적으로 추가한다
        // (NON_EVM_FAMILIES 배열 순서: bitcoin, solana, xrp, hedera, stellar, tron)
      ],
    },
  ]

  // ── sample presets ──
  var PRESETS = {
    'signMessage:eth:personal': [
      {
        label: 'Hello World',
        message: 'Hello, DCENT!',
      },
    ],
    'signMessage:eth:eip712-v3': [
      {
        label: 'EIP-712 V3 sample',
        message: JSON.stringify({
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
            ],
            Message: [
              { name: 'content', type: 'string' },
            ],
          },
          primaryType: 'Message',
          domain: { name: 'TestApp', version: '1' },
          message: { content: 'Hello EIP-712 V3' },
        }, null, 2),
      },
    ],
    'signMessage:eth:eip712-v4': [
      {
        label: 'EIP-712 V4 sample',
        message: JSON.stringify({
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'chainId', type: 'uint256' },
            ],
            Transfer: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          primaryType: 'Transfer',
          domain: { name: 'TestToken', chainId: 1 },
          message: { to: '0xAbCd1234AbCd1234AbCd1234AbCd1234AbCd1234', amount: '1000000000000000000' },
        }, null, 2),
      },
    ],
    'signMessage:sol:raw': [
      {
        label: 'Solana raw message',
        message: 'Hello Solana!',
      },
    ],
    // m09-04-22-fix: tron/tezos signMessage preset 제거 (wm slot DC-2296 disabled),
    // polkadot relay preset 제거 — 지원되는 Astar(paraChain) preset만 유지.
    'signMessage:dot:raw:astar': [
      {
        label: 'Astar raw message',
        message: 'Hello Astar!',
      },
    ],
    'signMessage:xlm:raw': [
      {
        label: 'Stellar raw message',
        message: 'Hello Stellar!',
      },
    ],
    // m09-04-22-fix: signData preset은 payload만 제공 — address는 반드시 디바이스 소유 주소여야
    // 하고 hex 형태이므로 📡 getAddress 버튼으로 채운다 (static 주소는 ownership mismatch로 거부됨).
    'signData:ada:cip8': [
      {
        label: 'Cardano CIP-8 payload (address는 📡 getAddress로 채우세요)',
        payload: '48656c6c6f2043617264616e6f', // "Hello Cardano" utf8→hex (CIP-8 opaque sign bytes)
      },
    ],
    // m09-04-22-fix: 유효한 SorobanAuthorizationEntry XDR 샘플 (@stellar/stellar-sdk 오프라인 생성,
    // roundtrip 검증). 더미 컨트랙트/nonce — 온체인 실제 auth는 아니지만 shape 유효 →
    // 디바이스가 파싱+서명 가능. 진짜 통합 테스트는 실제 App의 authEntry로 교체.
    'signAuthEntry:xlm:soroban': [
      {
        label: 'Stellar Soroban auth entry (유효 샘플 XDR — 디바이스 파싱/서명용)',
        authEntry: 'AAAAAQAAAAAAAAAAc3b96I5M1hzA+ylKF4az8dBh9fLxyldGX6qTIhG5RtYAAAAAB1vNFQAehIAAAAABAAAAAAAAAAE/DDS/k60NmXHQTMyQ9wVRHIOKrZc0pKL7DXoD/H/omgAAAAh0cmFuc2ZlcgAAAAIAAAASAAAAAAAAAABzdv3ojkzWHMD7KUoXhrPx0GH18vHKV0ZfqpMiEblG1gAAAAoAAAAAAAAAAAAAAAAAAAABAAAAAA==',
      },
    ],
  }

  // ── 전역 상태 ──
  // m08-01-05: transport / queue는 facade singleton이 내부 관리 — playground은 connected boolean만 추적
  var state = {
    connected: false, // dcent facade 사용 여부 (true이면 popup이 활성/대기 상태)
    device: null, // 마지막 getDeviceInfo 응답
    selectedMethodId: null, // 현재 선택된 트리 아이템 id
    selectedMethodDef: null, // 선택된 메서드 정의 객체
    logs: [], // append-only LogEntry[]
    pauseAutoScroll: false,
    sdkVersion: null, // dist에서 추출한 packageVersion (있으면)
    evmChainsLoaded: false, // chains.json 로드 완료 여부 (EVM + 비-EVM 통합)
    nonEvmChainsLoaded: false, // 비-EVM chains/presets 로드 완료 여부 (m06-01-03)
    // 테스트용 inject — simulateConnect가 mock 함수 객체를 주입할 때 사용
    // null이면 진짜 window.dcent 사용
    _testDcent: null,
    // m11-01-03: bitcoin tx builder 누적 상태 (session 동안 유지, localStorage 미사용)
    bitcoinTx: {
      current: null, // BitcoinWireTransaction | null (facade가 반환한 v2 flat wire {inputs,outputs})
      chainId: null, // 'bip122:.../slip44:0' (Build & Sign 시 사용 — v2는 coinType 미사용, chainId가 코인 결정)
      inputs: 0, // count for UI
      outputs: 0,
    },
    // m09-04-15 follow-up: bitcoin signTx 폼 모드 ('json'=Transaction JSON 직접 / 'auto'=UTXO fetch→build→sign)
    btxSignMode: 'json',
    btxAuto: {}, // 자동 모드 캐시 (prevTx/vout/value/net/addr 등)
  }

  // ── DOM refs ──
  var $ = function (id) { return document.getElementById(id) }
  var connDot = $('conn-dot')
  var deviceInfoEl = $('device-info')
  var btnConnect = $('btn-connect')
  var btnDisconnect = $('btn-disconnect')
  var treePanel = $('tree-panel')
  var formTitle = $('form-title')
  var formFields = $('form-fields')
  var btnSend = $('btn-send')
  var logScroll = $('log-scroll')
  var logEmpty = $('log-empty')
  var btnPause = $('btn-pause')
  var btnClear = $('btn-clear')
  var btnCopy = $('btn-copy')

  // ── SDK facade reference (m08-01-05) ──
  // index-v2.html이 window.dcent를 default export object로 alias함:
  //   <script>window.dcent = (window.dcent && window.dcent.default) || window.dcent;</script>
  // _getDcent()는 매 호출 시점에 facade를 lookup → simulateConnect의 mock inject도 지원
  function _getDcent () {
    return state._testDcent || window.dcent
  }

  // ── Transport option helper (m09-04-03, DC-2701 재정의) ──
  // #select-transport 값을 읽어 dcent.setTransport()에 넘길 연결 단위 transport 힌트 반환.
  // (DC-2701) transport는 sign per-call이 아니라 연결 단위 속성 — Connect 시점/드롭다운 변경 시
  // dcent.setTransport(_getTransportOption())로 1회 설정한다 (handshake first-wins).
  // '' (auto/default) → undefined (힌트 미설정 = sdk가 default 3-state 라우팅)
  // 'hid' | 'ble' → string 그대로 반환
  // connector-chain-addition-isolation: transport는 chain과 직교, chain-specific 분기 없음.
  function _getTransportOption () {
    var el = document.getElementById('select-transport')
    if (!el) return undefined
    var val = el.value
    if (val === 'hid' || val === 'ble') return val
    return undefined // '' → undefined: setTransport 미설정 = sdk default 3-state 라우팅 (DC-2701: 'auto' 폐기)
  }

  // ── Build Tree DOM ──
  function buildTree () {
    treePanel.innerHTML = ''
    TREE.forEach(function (group) {
      var groupEl = document.createElement('div')
      var groupLabelEl = document.createElement('div')
      groupLabelEl.className = 'tree-group-label'
      groupLabelEl.textContent = group.label
      groupEl.appendChild(groupLabelEl)

      function renderItems (items, indent) {
        items.forEach(function (item) {
          if (item.kind === 'family') {
            var familyEl = document.createElement('div')
            familyEl.className = 'tree-family-label'
            familyEl.style.paddingLeft = (12 + indent * 8) + 'px'
            familyEl.textContent = item.label
            groupEl.appendChild(familyEl)
            renderItems(item.items, indent + 1)
          } else if (item.kind === 'method') {
            var itemEl = document.createElement('div')
            itemEl.className = 'tree-item'
            itemEl.dataset.methodId = item.id
            itemEl.style.paddingLeft = (20 + indent * 8) + 'px'
            itemEl.textContent = item.label || item.id
            itemEl.setAttribute('role', 'button')
            itemEl.setAttribute('tabindex', '0')
            itemEl.addEventListener('click', function () {
              selectMethod(item)
            })
            itemEl.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') { selectMethod(item) }
            })
            groupEl.appendChild(itemEl)
          }
        })
      }
      renderItems(group.items, 0)
      treePanel.appendChild(groupEl)
    })
  }

  // ── chains.json + presets.evm.json + presets.non-evm.json 런타임 로드 ──
  // m06-01-03: chains.evm.json → chains.json 통합 (EVM + 비-EVM)
  function loadChainsData () {
    // fetch 미지원 환경 (jsdom unit test 등) — 조용히 스킵
    if (typeof fetch !== 'function') return

    // chains.json (통합 — EVM + 비-EVM)
    var chainsPromise = fetch('/playground/chains.json')
      .then(function (r) {
        if (!r.ok) throw new Error('chains.json fetch failed: ' + r.status)
        return r.json()
      })
      .then(function (chains) {
        // allChainsMap: 전체 chainId → entry 통합 lookup
        allChainsMap = {}
        chains.forEach(function (c) { allChainsMap[c.chainId] = c })

        // EVM 분류
        var evmChains = chains.filter(function (c) { return c.family === 'ethereum' })
        evmChainsList = evmChains
        evmChainsMap = {}
        evmChains.forEach(function (c) {
          evmChainsMap[c.chainId] = { displayName: c.displayName, defaultKeyPath: c.defaultKeyPath }
        })

        // 비-EVM 분류: family별 그룹핑
        nonEvmChainsByFamily = {}
        NON_EVM_FAMILIES.forEach(function (fam) { nonEvmChainsByFamily[fam] = [] })
        chains.forEach(function (c) {
          if (c.family !== 'ethereum' && nonEvmChainsByFamily[c.family]) {
            nonEvmChainsByFamily[c.family].push(c)
          }
        })
      })
      .catch(function () {
        evmChainsList = []
        evmChainsMap = {}
        allChainsMap = {}
        nonEvmChainsByFamily = {}
      })

    // presets.evm.json
    var evmPresetsPromise = fetch('/playground/presets.evm.json')
      .then(function (r) {
        if (!r.ok) throw new Error('presets.evm.json fetch failed: ' + r.status)
        return r.json()
      })
      .then(function (presets) {
        evmPresetsList = presets
        evmPresetsMap = {}
        presets.forEach(function (p) { evmPresetsMap[p.id] = p })
      })
      .catch(function () {
        evmPresetsList = []
        evmPresetsMap = {}
      })

    // presets.non-evm.json + presets.rest.json (m06-01-04 추가)
    // 비-EVM 6 family + Rest 8 family preset을 같은 nonEvmPresetsList에 병합한다.
    // 두 fetch를 chain하여 race condition 회피 — non-evm가 reset 후 rest가 push.
    var nonEvmPresetsPromise = fetch('/playground/presets.non-evm.json')
      .then(function (r) {
        if (!r.ok) throw new Error('presets.non-evm.json fetch failed: ' + r.status)
        return r.json()
      })
      .then(function (presets) {
        nonEvmPresetsList = presets
        nonEvmPresetsMap = {}
        presets.forEach(function (p) { nonEvmPresetsMap[p.id] = p })
        // m06-01-04: presets.rest.json 병합 — 실패 시 기존 non-evm preset만 사용
        return fetch('/playground/presets.rest.json')
          .then(function (r) {
            if (!r.ok) throw new Error('presets.rest.json fetch failed: ' + r.status)
            return r.json()
          })
          .then(function (rest) {
            rest.forEach(function (p) {
              nonEvmPresetsList.push(p)
              nonEvmPresetsMap[p.id] = p
            })
          })
          .catch(function () {
            // presets.rest.json 로드 실패 — 기존 non-evm preset만 사용 (degraded mode)
          })
      })
      .catch(function () {
        nonEvmPresetsList = []
        nonEvmPresetsMap = {}
      })

    // presets.account.json (m11-01-01) — syncAccount 폼 preset
    var accountPresetsPromise = fetch('/playground/presets.account.json')
      .then(function (r) {
        if (!r.ok) throw new Error('presets.account.json fetch failed: ' + r.status)
        return r.json()
      })
      .then(function (presets) {
        accountPresetsList = presets
        accountPresetsMap = {}
        presets.forEach(function (p) { accountPresetsMap[p.id] = p })
      })
      .catch(function () {
        // account preset 로드 실패 — preset selector 없는 syncAccount 폼으로 degraded mode
        accountPresetsList = []
        accountPresetsMap = {}
      })

    // presets.bitcoin-tx.json (m11-01-03) — Bitcoin tx builder 폼 preset
    var bitcoinTxPresetsPromise = fetch('/playground/presets.bitcoin-tx.json')
      .then(function (r) {
        if (!r.ok) throw new Error('presets.bitcoin-tx.json fetch failed: ' + r.status)
        return r.json()
      })
      .then(function (presets) {
        bitcoinTxPresetsList = presets
        bitcoinTxPresetsMap = {}
        presets.forEach(function (p) { bitcoinTxPresetsMap[p.id] = p })
      })
      .catch(function () {
        // btx preset 로드 실패 — preset selector 없는 builder 폼으로 degraded mode
        bitcoinTxPresetsList = []
        bitcoinTxPresetsMap = {}
      })

    // 모두 완료 후 트리 재빌드
    Promise.all([chainsPromise, evmPresetsPromise, nonEvmPresetsPromise, accountPresetsPromise, bitcoinTxPresetsPromise]).then(function () {
      state.evmChainsLoaded = true
      buildEvmSignTxGroup()
      buildNonEvmSignTxGroups()
      buildTree()
    }).catch(function () {
      buildTree()
    })
  }

  // ── EVM SignTx 트리 그룹 빌드 (chains.evm.json 로드 후) ──
  function buildEvmSignTxGroup () {
    // TREE 내 signTx-evm-family 를 찾아 items를 교체
    var signTxGroup = TREE.find(function (g) { return g.id === 'signTx-evm-group' })
    if (!signTxGroup) return

    var evmFamily = signTxGroup.items.find(function (f) { return f.id === 'signTx-evm-family' })
    if (!evmFamily) return

    if (evmChainsList.length === 0) {
      // chains.evm.json 로드 실패 — 안내 노드
      evmFamily.items = [
        {
          kind: 'method',
          id: 'signTx:evm:error',
          label: '⚠ Run yarn extract-chains first',
          chainId: '',
          _placeholder: true,
        },
      ]
      return
    }

    // 체인별 method node 생성
    evmFamily.items = evmChainsList.map(function (c) {
      return {
        kind: 'method',
        id: 'signTx:evm:' + c.chainId,
        label: c.displayName,
        chainId: c.chainId,
        defaultKeyPath: c.defaultKeyPath,
      }
    })
  }

  // ── 비-EVM SignTx 트리 그룹 빌드 (chains.json 로드 후) ──
  // m06-01-03: NON_EVM_FAMILIES 배열 순서대로 Sign Transaction 그룹에 family 추가
  function buildNonEvmSignTxGroups () {
    var signTxGroup = TREE.find(function (g) { return g.id === 'signTx-evm-group' })
    if (!signTxGroup) return

    // 기존 비-EVM family 항목 제거 (재빌드)
    signTxGroup.items = signTxGroup.items.filter(function (f) {
      return f.id === 'signTx-evm-family'
    })

    NON_EVM_FAMILIES.forEach(function (family) {
      var familyLabel = FAMILY_LABELS[family] || family
      var familyId = 'signTx-' + family + '-family'
      var chains = nonEvmChainsByFamily[family] || []

      var familyItems
      if (chains.length === 0) {
        familyItems = [
          {
            kind: 'method',
            id: 'signTx:' + family + ':error',
            label: '⚠ Run yarn extract-chains first',
            chainId: '',
            family: family,
            _placeholder: true,
          },
        ]
      } else {
        familyItems = chains.map(function (c) {
          return {
            kind: 'method',
            id: 'signTx:' + family + ':' + c.chainId,
            label: c.displayName,
            chainId: c.chainId,
            family: family,
            defaultKeyPath: c.defaultKeyPath,
          }
        })
      }

      signTxGroup.items.push({
        kind: 'family',
        id: familyId,
        label: familyLabel,
        items: familyItems,
      })
    })
  }

  // ── Select method → populate form ──
  function selectMethod (methodDef) {
    if (methodDef._placeholder) return // placeholder는 선택 불가

    state.selectedMethodId = methodDef.id
    state.selectedMethodDef = methodDef

    // Update tree selection highlight
    document.querySelectorAll('.tree-item').forEach(function (el) {
      el.classList.remove('selected')
    })
    var selected = document.querySelector('[data-method-id="' + methodDef.id + '"]')
    if (selected) selected.classList.add('selected')

    // Populate form
    formTitle.textContent = methodDef.label || methodDef.id
    formFields.innerHTML = ''

    if (methodDef.id.startsWith('account:')) {
      // m11-01-01: account/device API form
      renderAccountForm(methodDef)
    } else if (methodDef.id.startsWith('btx:')) {
      // m11-01-03: bitcoin tx builder form
      renderBitcoinTxBuilderForm(methodDef)
    } else if (methodDef.id.startsWith('signMessage:')) {
      renderSignMessageForm(methodDef)
    } else if (methodDef.id.startsWith('signData:')) {
      renderSignDataForm(methodDef)
    } else if (methodDef.id.startsWith('signAuthEntry:')) {
      renderSignAuthEntryForm(methodDef)
    } else if (methodDef.id.startsWith('signTx:evm:')) {
      renderSignTxEvmForm(methodDef)
    } else if (methodDef.family && NON_EVM_FAMILIES.indexOf(methodDef.family) !== -1) {
      // m06-01-03: 비-EVM signTx — family 공용 폼
      renderSignTxNonEvmForm(methodDef)
    }

    // Update Send button state
    updateSendBtn()
  }

  // ── renderAccountForm (m11-01-01) ──
  // v1 호환 account/device API 8개의 동적 form 빌더.
  // methodDef.id는 'account:{name}' 형식으로 분기 — name별 input 구성이 다르다.
  // 모든 form은 _unwrapV1Envelope를 통해 v1 envelope을 unwrap한 결과를 결과 로그에 표시한다.
  //
  // 룰 준수:
  //   - dapp-input-sanitization: syncAccount JSON.parse 결과는 known fields whitelist만 추출
  //   - boundary-validation: JSON.parse 결과 Array.isArray 검증
  //   - error-handling-consistency: facade throw → catch → UI error 표시 통일 (appendLog error 분기)
  function renderAccountForm (methodDef) {
    var name = methodDef.id.slice('account:'.length)

    if (name === 'info' || name === 'getDeviceInfo' || name === 'getAccountInfo') {
      // no-arg — 안내문만
      var note = document.createElement('p')
      note.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;'
      if (name === 'info') {
        note.textContent = 'Fetches DCENT Bridge daemon status.'
      } else if (name === 'getDeviceInfo') {
        note.textContent = 'Fetches device firmware, model, and address info.'
      } else {
        note.textContent = 'Fetches account list registered in the wallet.'
      }
      formFields.appendChild(note)
      return
    }

    if (name === 'setLabel') {
      appendFormRow('label', 'Label', 'input', {
        value: '',
        placeholder: '2~14 chars: a-z A-Z 0-9 . ! # $ % & + - _',
      })
      return
    }

    if (name === 'syncAccount') {
      // preset selector (loaded from presets.account.json)
      var applicablePresets = accountPresetsList.filter(function (p) {
        return !p.applicableMethodIds || p.applicableMethodIds.indexOf(methodDef.id) !== -1
      })
      if (applicablePresets.length > 0) {
        var presetRow = document.createElement('div')
        presetRow.className = 'form-row'
        var presetLabel = document.createElement('label')
        presetLabel.setAttribute('for', 'field-preset')
        presetLabel.textContent = 'Preset'
        var presetSelect = document.createElement('select')
        presetSelect.id = 'field-preset'
        var defaultOpt = document.createElement('option')
        defaultOpt.value = ''
        defaultOpt.textContent = '-- select preset --'
        presetSelect.appendChild(defaultOpt)
        applicablePresets.forEach(function (p) {
          var opt = document.createElement('option')
          opt.value = p.id
          opt.textContent = p.label
          presetSelect.appendChild(opt)
        })
        presetSelect.addEventListener('change', function () {
          var presetId = presetSelect.value
          if (!presetId) return
          var preset = accountPresetsMap[presetId]
          if (!preset) return
          var ta = document.getElementById('field-accountInfosJson')
          if (ta) ta.value = JSON.stringify(preset.value, null, 2)
        })
        presetRow.appendChild(presetLabel)
        presetRow.appendChild(presetSelect)
        formFields.appendChild(presetRow)
      }
      var ta = appendFormRow('accountInfosJson', 'accountInfos (JSON array)', 'textarea', {
        value: '',
        placeholder: '[{"chainId":"eip155:1","keyPath":"m/44\'/60\'/0\'/0/0","label":"ETH-1"}]',
      })
      if (ta) ta.rows = 8
      return
    }

    if (name === 'selectAddress') {
      var ta2 = appendFormRow('addressesJson', 'addresses (JSON array)', 'textarea', {
        value: '',
        placeholder: '["0xabc...", "0xdef..."]',
      })
      if (ta2) ta2.rows = 4
      return
    }

    if (name === 'getAddress') {
      // m11-01-04: v1/v2 path toggle 도입.
      //   - v1 path: 기존 coinType 시그니처 (dcent.getAddress(coinType, path, prefix))
      //   - v2 path: chainId 시그니처 (dcent.getAddress({chainId, keyPath, prefix?})) — m11-01-02 facade
      // default=v2. sdk(m11-02) 미머지 상태에서 unknown_method 에러 시 form 상단 안내 배너 표시 (graceful UX).
      //
      // 룰 준수:
      //   - connector-chain-addition-isolation: chainId 문자열 pass-through만 (chain enum/switch 부재)
      //   - boundary-validation: v2 input 검증은 facade(m11-01-02 _getAddressV2)가 담당, 폼은 UI validation만
      _renderGetAddressForm()
      return
    }

    if (name === 'getPublicKey') {
      // m09-04-21: chain-agnostic getPublicKey 폼 — chainId(CAIP/CIP-34) + keyPath.
      // facade(dcent.getPublicKey)가 입력 검증을 담당하므로 폼은 단순 입력만 수집한다.
      //   - connector-chain-addition-isolation: chainId는 입력값 그대로 pass-through (chain enum 부재)
      //   - boundary-validation: 빈 chainId/keyPath는 facade가 param_error throw
      var gpkNote = document.createElement('p')
      gpkNote.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;'
      gpkNote.textContent = 'Cardano payment/stake/drep 공개키(+keyPath)를 조회합니다.'
      formFields.appendChild(gpkNote)
      appendFormRow('chainId', 'chainId (CAIP-19 / CIP-34)', 'input', {
        value: 'cip34:1-764824073',
        placeholder: 'cip34:1-764824073',
      })
      appendFormRow('keyPath', 'Key Path', 'input', {
        value: "m/1852'/1815'/0'/0/0",
        placeholder: "m/1852'/1815'/0'/0/0",
      })
      return
    }

    if (name === 'getXPUB') {
      appendFormRow('key', 'Key Path', 'input', {
        value: "m/44'/60'/0'",
        placeholder: "m/44'/60'/0'",
      })
      appendFormRow('bip32name', 'bip32name (optional)', 'input', {
        value: '',
        placeholder: '(default "Bitcoin seed")',
      })
      return
    }
  }

  // ── _renderGetAddressForm (m11-01-04) ──
  // getAddress v1/v2 path toggle 폼.
  //   - 상단 라디오: [v1 (coinType)] / [v2 (chainId)] — default=v2
  //   - v2 path: chainId <select> (allChainsMap 기반) + keyPath + optional prefix
  //   - v1 path: coinType <select> + path + optional prefix (기존 폼 그대로)
  //   - 상단 안내 배너 영역(`#getaddress-banner`)은 항상 생성되어 sendAccountCall이 표시/숨김
  //
  // 룰 준수:
  //   - connector-chain-addition-isolation: chainId는 select value 그대로 pass-through, chain enum 추가 없음
  //   - boundary-validation: chainId/keyPath 비어있을 때 Send 시 facade(m11-01-02)가 param_error throw
  //
  // path 선택 상태는 `data-getaddress-path` 속성으로 form container에 저장 ('v1' | 'v2', default 'v2')
  function _renderGetAddressForm () {
    // 상단 안내 배너 — 초기에는 hidden. sendAccountCall이 unknown_method 에러 감지 시 표시.
    var banner = document.createElement('div')
    banner.id = 'getaddress-banner'
    banner.style.cssText = 'display:none;background:#fff3cd;color:#856404;padding:8px 10px;border-radius:4px;margin-bottom:8px;font-size:11px;border:1px solid #ffeaa7;'
    banner.textContent = '⚠ sdk가 v2 payload(getAddress chainId)를 아직 처리하지 못합니다 (m11-02 미머지 상태). 임시로 v1 path (coinType)를 사용하거나 m11-02 SHIPPED를 기다리세요.'
    formFields.appendChild(banner)

    // path toggle radio
    var toggleRow = document.createElement('div')
    toggleRow.className = 'form-row'
    var toggleLabel = document.createElement('label')
    toggleLabel.textContent = 'Path'
    toggleRow.appendChild(toggleLabel)

    var toggleWrap = document.createElement('div')
    toggleWrap.style.cssText = 'display:flex;gap:12px;font-size:12px;'

    var v1Label = document.createElement('label')
    v1Label.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;'
    var v1Radio = document.createElement('input')
    v1Radio.type = 'radio'
    v1Radio.name = 'getaddress-path'
    v1Radio.id = 'field-getaddress-path-v1'
    v1Radio.value = 'v1'
    v1Label.appendChild(v1Radio)
    v1Label.appendChild(document.createTextNode('v1 (coinType)'))

    var v2Label = document.createElement('label')
    v2Label.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;'
    var v2Radio = document.createElement('input')
    v2Radio.type = 'radio'
    v2Radio.name = 'getaddress-path'
    v2Radio.id = 'field-getaddress-path-v2'
    v2Radio.value = 'v2'
    v2Radio.checked = true // default=v2
    v2Label.appendChild(v2Radio)
    v2Label.appendChild(document.createTextNode('v2 (chainId)'))

    toggleWrap.appendChild(v1Label)
    toggleWrap.appendChild(v2Label)
    toggleRow.appendChild(toggleWrap)
    formFields.appendChild(toggleRow)

    // dynamic input container (path 전환 시 교체)
    var inputContainer = document.createElement('div')
    inputContainer.id = 'getaddress-inputs'
    formFields.appendChild(inputContainer)

    function _renderV1Inputs () {
      inputContainer.innerHTML = ''

      // coinType <select> — src/types/coinType.ts enum 키 사용
      var coinTypeKeys = Object.keys((window.dcent && window.dcent.coinType) || {})
      if (coinTypeKeys.length === 0) {
        // fallback (test 환경 등에서 window.dcent 미설정 시)
        coinTypeKeys = ['BITCOIN', 'ETHEREUM', 'KLAYTN', 'RIPPLE', 'TRON', 'STELLAR']
      }
      var ctRow = document.createElement('div')
      ctRow.className = 'form-row'
      var ctLabel = document.createElement('label')
      ctLabel.setAttribute('for', 'field-coinType')
      ctLabel.textContent = 'coinType'
      var ctSelect = document.createElement('select')
      ctSelect.id = 'field-coinType'
      coinTypeKeys.forEach(function (k) {
        var opt = document.createElement('option')
        opt.value = k
        opt.textContent = k
        ctSelect.appendChild(opt)
      })
      if (coinTypeKeys.indexOf('ETHEREUM') !== -1) ctSelect.value = 'ETHEREUM'
      ctRow.appendChild(ctLabel)
      ctRow.appendChild(ctSelect)
      inputContainer.appendChild(ctRow)

      // path
      var pathRow = document.createElement('div')
      pathRow.className = 'form-row'
      var pathLabel = document.createElement('label')
      pathLabel.setAttribute('for', 'field-path')
      pathLabel.textContent = 'Key Path'
      var pathInput = document.createElement('input')
      pathInput.id = 'field-path'
      pathInput.type = 'text'
      pathInput.value = "m/44'/60'/0'/0/0"
      pathInput.placeholder = "m/44'/60'/0'/0/0"
      pathRow.appendChild(pathLabel)
      pathRow.appendChild(pathInput)
      inputContainer.appendChild(pathRow)

      // prefix
      var prefixRow = document.createElement('div')
      prefixRow.className = 'form-row'
      var prefixLabel = document.createElement('label')
      prefixLabel.setAttribute('for', 'field-prefix')
      prefixLabel.textContent = 'prefix (optional, parachain)'
      var prefixInput = document.createElement('input')
      prefixInput.id = 'field-prefix'
      prefixInput.type = 'text'
      prefixInput.value = ''
      prefixInput.placeholder = '(leave empty unless parachain)'
      prefixRow.appendChild(prefixLabel)
      prefixRow.appendChild(prefixInput)
      inputContainer.appendChild(prefixRow)
    }

    function _renderV2Inputs () {
      inputContainer.innerHTML = ''

      // chainId <select> — allChainsMap (m06-01-03 EVM+비-EVM 통합)에서 옵션 생성.
      // chains.json 로드 전이면 빈 select + placeholder option만 표시 (사용자에게 안내).
      var chainRow = document.createElement('div')
      chainRow.className = 'form-row'
      var chainLabel = document.createElement('label')
      chainLabel.setAttribute('for', 'field-chainId')
      chainLabel.textContent = 'Chain ID (CAIP-19)'
      var chainSelect = document.createElement('select')
      chainSelect.id = 'field-chainId'

      var chainIds = Object.keys(allChainsMap || {})
      if (chainIds.length === 0) {
        // chains.json 미로드 — placeholder만
        var loadingOpt = document.createElement('option')
        loadingOpt.value = ''
        loadingOpt.textContent = '-- loading chains... --'
        chainSelect.appendChild(loadingOpt)
      } else {
        // 빈 선택지 (validation 강제용 — 미선택 시 Send → param_error)
        var emptyOpt = document.createElement('option')
        emptyOpt.value = ''
        emptyOpt.textContent = '-- select chain --'
        chainSelect.appendChild(emptyOpt)
        chainIds.forEach(function (cid) {
          var opt = document.createElement('option')
          opt.value = cid
          var entry = allChainsMap[cid]
          var labelText = cid
          if (entry && entry.name) labelText = entry.name + ' (' + cid + ')'
          opt.textContent = labelText
          chainSelect.appendChild(opt)
        })
        // default — eip155:1/slip44:60 (mainnet Ethereum) 또는 eip155:1 우선
        if (allChainsMap['eip155:1/slip44:60']) {
          chainSelect.value = 'eip155:1/slip44:60'
        } else if (allChainsMap['eip155:1']) {
          chainSelect.value = 'eip155:1'
        }
      }
      chainRow.appendChild(chainLabel)
      chainRow.appendChild(chainSelect)
      inputContainer.appendChild(chainRow)

      // keyPath — chainId의 defaultKeyPath 우선, 없으면 ETH default
      var defaultKeyPath = "m/44'/60'/0'/0/0"
      var selectedEntry = allChainsMap[chainSelect.value]
      if (selectedEntry && selectedEntry.defaultKeyPath) {
        defaultKeyPath = selectedEntry.defaultKeyPath
      }
      var keyPathRow = document.createElement('div')
      keyPathRow.className = 'form-row'
      var keyPathLabel = document.createElement('label')
      keyPathLabel.setAttribute('for', 'field-keyPath')
      keyPathLabel.textContent = 'Key Path'
      var keyPathInput = document.createElement('input')
      keyPathInput.id = 'field-keyPath'
      keyPathInput.type = 'text'
      keyPathInput.value = defaultKeyPath
      keyPathInput.placeholder = "m/44'/60'/0'/0/0"
      keyPathRow.appendChild(keyPathLabel)
      keyPathRow.appendChild(keyPathInput)
      inputContainer.appendChild(keyPathRow)

      // chainId change → keyPath default 자동 갱신 (사용자가 명시적으로 수정한 값은 유지하지 않음 — 단순 UX)
      chainSelect.addEventListener('change', function () {
        var entry = allChainsMap[chainSelect.value]
        if (entry && entry.defaultKeyPath) {
          keyPathInput.value = entry.defaultKeyPath
        }
      })

      // addressFormat (optional, m09-04-09)
      // BTC family처럼 같은 chainId가 multi-variant currency (BITCOIN legacy vs BTC-SEGWIT)를
      // 공유하는 경우 명시적 disambiguation. 누락 시 wm resolver가 default(현재 legacy)
      // 사용하지만 디바이스 표시 주소와 SDK 응답 주소가 불일치할 수 있음 (HW smoke 2026-05-29).
      // 사용자가 legacy/segwit-native 둘 다 테스트할 수 있도록 dropdown 제공.
      // segwit-wrapped(P2SH-P2WPKH) / taproot(P2TR)는 AddressFormat 타입엔 있으나 wm registry에
      // 대응 currency가 아직 없어 resolveCurrencyByChainIdAndFormat이 undefined → sdk 4901.
      // 따라서 현재 사용 가능한 legacy/segwit-native만 노출 (wm이 variant 추가 시 재등록).
      var afRow = document.createElement('div')
      afRow.className = 'form-row'
      var afLabel = document.createElement('label')
      afLabel.setAttribute('for', 'field-addressFormat')
      afLabel.textContent = 'addressFormat (optional)'
      var afSelect = document.createElement('select')
      afSelect.id = 'field-addressFormat'
      var afOptions = [
        { value: '', label: '(default — wm resolver 결정)' },
        { value: 'legacy', label: 'legacy (P2PKH — 1xxx / mxxx)' },
        { value: 'segwit-native', label: 'segwit-native (P2WPKH bech32 — bc1q / tb1q)' },
      ]
      afOptions.forEach(function (o) {
        var opt = document.createElement('option')
        opt.value = o.value
        opt.textContent = o.label
        afSelect.appendChild(opt)
      })
      afRow.appendChild(afLabel)
      afRow.appendChild(afSelect)
      inputContainer.appendChild(afRow)

      // prefix (optional, parachain 등)
      var prefixRow = document.createElement('div')
      prefixRow.className = 'form-row'
      var prefixLabel = document.createElement('label')
      prefixLabel.setAttribute('for', 'field-prefix')
      prefixLabel.textContent = 'prefix (optional)'
      var prefixInput = document.createElement('input')
      prefixInput.id = 'field-prefix'
      prefixInput.type = 'text'
      prefixInput.value = ''
      prefixInput.placeholder = '(leave empty unless parachain)'
      prefixRow.appendChild(prefixLabel)
      prefixRow.appendChild(prefixInput)
      inputContainer.appendChild(prefixRow)
    }

    // radio change handler — path 전환
    v1Radio.addEventListener('change', function () {
      if (v1Radio.checked) _renderV1Inputs()
    })
    v2Radio.addEventListener('change', function () {
      if (v2Radio.checked) _renderV2Inputs()
    })

    // 초기 렌더 — default v2
    _renderV2Inputs()
  }

  // ── renderBitcoinTxBuilderForm (m11-01-03) ──
  // Bitcoin transaction builder의 4 method form 빌더.
  // methodDef.id는 'btx:{action}' 형식으로 분기 — action별 input 구성이 다르다.
  //   - btx:new           → chainId text (v2: coinType 폼 없음 — 코인은 chainId가 결정)
  //   - btx:addInput      → prev_tx / utxo_idx / type (p2pkh/p2pk/p2sh/p2wpkh) / key 입력
  //   - btx:addOutput     → type (p2pkh/p2pk/p2sh/p2wpkh/change) / value / to
  //   - btx:buildAndSign  → 누적된 tx로 dcent.sign({method:'signTransaction', chainId, payload}) 호출
  //
  // 룰 준수:
  //   - boundary-validation: utxo_idx 비숫자 가드, addInput/addOutput 전 state.bitcoinTx.current 가드
  //   - error-handling-consistency: facade throw → catch → UI error 표시 통일 (appendLog error 분기)
  //   - connector-chain-addition-isolation: chainId는 사용자 입력 그대로 pass-through (chain enum/switch 없음)
  function renderBitcoinTxBuilderForm (methodDef) {
    var action = methodDef.id.slice('btx:'.length)

    // state 표시 — 현재 builder 누적 상황을 안내
    var stateNote = document.createElement('p')
    stateNote.id = 'btx-state-note'
    stateNote.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;'
    stateNote.textContent = _renderBitcoinTxStateText()
    formFields.appendChild(stateNote)

    // 공통 preset selector (applicableMethodIds 매칭)
    var applicablePresets = bitcoinTxPresetsList.filter(function (p) {
      return !p.applicableMethodIds || p.applicableMethodIds.indexOf(methodDef.id) !== -1
    })
    if (applicablePresets.length > 0) {
      var presetRow = document.createElement('div')
      presetRow.className = 'form-row'
      var presetLabel = document.createElement('label')
      presetLabel.setAttribute('for', 'field-preset')
      presetLabel.textContent = 'Preset'
      var presetSelect = document.createElement('select')
      presetSelect.id = 'field-preset'
      var defaultOpt = document.createElement('option')
      defaultOpt.value = ''
      defaultOpt.textContent = '-- select preset --'
      presetSelect.appendChild(defaultOpt)
      applicablePresets.forEach(function (p) {
        var opt = document.createElement('option')
        opt.value = p.id
        opt.textContent = p.label
        presetSelect.appendChild(opt)
      })
      presetSelect.addEventListener('change', function () {
        var presetId = presetSelect.value
        if (!presetId) return
        var preset = bitcoinTxPresetsMap[presetId]
        if (!preset) return
        _applyBitcoinTxPreset(action, preset)
      })
      presetRow.appendChild(presetLabel)
      presetRow.appendChild(presetSelect)
      formFields.appendChild(presetRow)
    }

    if (action === 'new') {
      // v2: coinType 없음. getBitcoinTransactionObject()는 무인자 — 코인은 chainId가 결정한다.
      // chainId — Build & Sign 단계에서 사용. 사용자가 직접 입력 가능 (CAIP-19 pass-through).
      appendFormRow('chainId', 'Chain ID (CAIP-19, for Build & Sign)', 'input', {
        value: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
        placeholder: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
      })
      return
    }

    if (action === 'addInput') {
      // facade 시그니처: addBitcoinTransactionInput(tx, prevTx, utxoIdx, type, key)
      appendFormRow('prevTx', 'prev_tx (raw hex of previous tx)', 'textarea', {
        value: '',
        placeholder: 'hex string (raw signing source)',
      })
      appendFormRow('utxoIdx', 'utxo_idx (output index, integer)', 'input', {
        value: '0',
        placeholder: '0',
      })
      // bitcoinTxType select — src/types/bitcoinTxType.ts enum 값 (p2pkh/p2pk/p2sh/multisig/p2wpkh/p2wsh)
      var ttKeys = ['p2wpkh', 'p2pkh', 'p2pk', 'p2sh', 'multisig', 'p2wsh']
      var ttRow = document.createElement('div')
      ttRow.className = 'form-row'
      var ttLabel = document.createElement('label')
      ttLabel.setAttribute('for', 'field-inputType')
      ttLabel.textContent = 'type (bitcoinTxType)'
      var ttSelect = document.createElement('select')
      ttSelect.id = 'field-inputType'
      ttKeys.forEach(function (k) {
        var opt = document.createElement('option')
        opt.value = k
        opt.textContent = k
        ttSelect.appendChild(opt)
      })
      ttSelect.value = 'p2wpkh'
      ttRow.appendChild(ttLabel)
      ttRow.appendChild(ttSelect)
      formFields.appendChild(ttRow)

      appendFormRow('inputKey', 'key (BIP44 path)', 'input', {
        value: "m/84'/0'/0'/0/0",
        placeholder: "m/84'/0'/0'/0/0",
      })
      return
    }

    if (action === 'addOutput') {
      // facade 시그니처: addBitcoinTransactionOutput(tx, type, value, to)
      // output type enum 값 (change 포함)
      var otKeys = ['p2wpkh', 'p2pkh', 'p2pk', 'p2sh', 'change']
      var otRow = document.createElement('div')
      otRow.className = 'form-row'
      var otLabel = document.createElement('label')
      otLabel.setAttribute('for', 'field-outputType')
      otLabel.textContent = 'type (output script type)'
      var otSelect = document.createElement('select')
      otSelect.id = 'field-outputType'
      otKeys.forEach(function (k) {
        var opt = document.createElement('option')
        opt.value = k
        opt.textContent = k
        otSelect.appendChild(opt)
      })
      otSelect.value = 'p2wpkh'
      otRow.appendChild(otLabel)
      otRow.appendChild(otSelect)
      formFields.appendChild(otRow)

      appendFormRow('outputValue', 'value (satoshi, string or number)', 'input', {
        value: '',
        placeholder: '200000',
      })
      appendFormRow('outputTo', 'to (receiver address)', 'input', {
        value: '',
        placeholder: 'bc1q...',
      })
      return
    }

    if (action === 'buildAndSign') {
      // chainId / keyPath — Build & Sign 단계에서 필요. state.bitcoinTx에서 default 채움.
      appendFormRow('chainId', 'Chain ID (CAIP-19)', 'input', {
        value: state.bitcoinTx.chainId || 'bip122:000000000019d6689c085ae165831e93/slip44:0',
        placeholder: 'bip122:.../slip44:0',
      })
      appendFormRow('keyPath', 'Key Path (signing path)', 'input', {
        value: "m/84'/0'/0'/0/0",
        placeholder: "m/84'/0'/0'/0/0",
      })
      return
    }
  }

  // ── Bitcoin tx builder state helpers (m11-01-03) ──

  function _renderBitcoinTxStateText () {
    var b = state.bitcoinTx
    if (!b.current) return 'Current tx: (none — call getBitcoinTransactionObject first)'
    return 'Current tx: ' + (b.chainId || '?') + ' | ' + b.inputs + ' inputs / ' + b.outputs + ' outputs'
  }

  function _updateBitcoinTxStateDisplay () {
    var note = document.getElementById('btx-state-note')
    if (note) note.textContent = _renderBitcoinTxStateText()
  }

  // preset 적용 — action별로 다른 필드를 채운다 (form selector 변경 시 호출)
  function _applyBitcoinTxPreset (action, preset) {
    if (action === 'new') {
      // v2: coinType 폼 없음 — chainId만 적용 (preset.coinType는 무시)
      var chainIdEl = document.getElementById('field-chainId')
      if (chainIdEl && preset.chainId) chainIdEl.value = preset.chainId
      return
    }
    if (action === 'addInput' && preset.input) {
      var prevTxEl = document.getElementById('field-prevTx')
      if (prevTxEl) prevTxEl.value = preset.input.prev_tx || ''
      var idxEl = document.getElementById('field-utxoIdx')
      if (idxEl) idxEl.value = String(preset.input.utxo_idx == null ? 0 : preset.input.utxo_idx)
      var typeEl = document.getElementById('field-inputType')
      if (typeEl && preset.input.type) typeEl.value = preset.input.type
      var keyEl = document.getElementById('field-inputKey')
      if (keyEl && preset.input.key) keyEl.value = preset.input.key
      return
    }
    if (action === 'addOutput' && preset.output) {
      var otypeEl = document.getElementById('field-outputType')
      if (otypeEl && preset.output.type) otypeEl.value = preset.output.type
      var valEl = document.getElementById('field-outputValue')
      if (valEl) valEl.value = String(preset.output.value == null ? '' : preset.output.value)
      var toEl = document.getElementById('field-outputTo')
      if (toEl && preset.output.to) toEl.value = preset.output.to
      return
    }
    if (action === 'buildAndSign') {
      var bsChainIdEl = document.getElementById('field-chainId')
      if (bsChainIdEl && preset.chainId) bsChainIdEl.value = preset.chainId
      var bsKpEl = document.getElementById('field-keyPath')
      if (bsKpEl && preset.keyPath) bsKpEl.value = preset.keyPath
    }
  }

  // ── sanitize helper for syncAccount (m09-04-12: v2 전환) ──
  // dapp-input-sanitization 룰: known fields whitelist만 추출, __proto__ / unknown key silent drop.
  // v2 wire: {chainId, keyPath, label, contractAddress?}. v1 {coin_group, coin_name} 제거.
  // playground 로컬 helper — 실제 검증은 connector의 _sanitizeSyncAccountItem이 담당.
  function _sanitizeSyncAccountInfos (parsed) {
    if (!Array.isArray(parsed)) {
      throw new Error('accountInfos must be an array')
    }
    return parsed.map(function (a) {
      if (!a || typeof a !== 'object') {
        throw new Error('each account entry must be an object')
      }
      var out = {
        chainId: String(a.chainId == null ? '' : a.chainId),
        keyPath: String(a.keyPath == null ? '' : a.keyPath),
        label: String(a.label == null ? '' : a.label),
      }
      // contractAddress — optional, include only if present and non-empty
      if (a.contractAddress != null && a.contractAddress !== '') {
        out.contractAddress = String(a.contractAddress)
      }
      return out
    })
  }

  // ── renderPresetSelector (m09-04-22) ──
  // signMessage-family(index-based) 폼 3곳(signMessage / signData / signAuthEntry) 공용 preset selector.
  // PRESETS[presetKey]가 있으면 field-preset select를 렌더하고, change 시 fillFn(presetObj)를 호출한다.
  // ⚠️ JSON-list 기반 selector(account/bitcoinTx/evm/nonEvm)와는 shape이 달라 공용화 대상 아님 (reuse-shared-utils).
  function renderPresetSelector (presetKey, fillFn) {
    var presets = PRESETS[presetKey]
    if (presets && presets.length > 0) {
      var presetRow = document.createElement('div')
      presetRow.className = 'form-row'
      var presetLabel = document.createElement('label')
      presetLabel.textContent = 'Preset'
      var presetSelect = document.createElement('select')
      presetSelect.id = 'field-preset'
      var defaultOpt = document.createElement('option')
      defaultOpt.value = ''
      defaultOpt.textContent = '-- select preset --'
      presetSelect.appendChild(defaultOpt)
      presets.forEach(function (p, i) {
        var opt = document.createElement('option')
        opt.value = i
        opt.textContent = p.label
        presetSelect.appendChild(opt)
      })
      presetSelect.addEventListener('change', function () {
        var idx = parseInt(presetSelect.value, 10)
        if (!isNaN(idx) && presets[idx]) fillFn(presets[idx])
      })
      presetRow.appendChild(presetLabel)
      presetRow.appendChild(presetSelect)
      formFields.appendChild(presetRow)
    }
  }

  function renderSignMessageForm (methodDef) {
    // chainId — 사용자가 자유 입력 가능 (CAIP-19 pass-through). 같은 family의 chain들을 datalist로 제공.
    var smFamily = (allChainsMap[methodDef.chainId] || {}).family
    var smChainIdEl = appendFormRow('chainId', 'Chain ID (CAIP-19)', 'input', {
      value: methodDef.chainId,
      datalist: _chainIdOptions(smFamily, _signMsgExcludeUnsupported(smFamily)),
    })

    // keyPath — chainId 변경 시 자동으로 그 chain의 defaultKeyPath로 갱신
    var smKeyPathEl = appendFormRow('keyPath', 'Key Path', 'input', {
      value: CHAIN_KEY_PATH[methodDef.chainId] || "m/44'/60'/0'/0/0",
      placeholder: "m/44'/60'/0'/0/0",
    })
    _wireKeyPathSync(smChainIdEl, smKeyPathEl)

    // message
    appendFormRow('message', 'Message', 'textarea', {
      value: '',
      placeholder: methodDef.metaKind === 'eip712'
        ? 'Paste EIP-712 JSON...'
        : 'Enter message to sign',
    })

    // meta.kind (read-only)
    appendFormRow('metaKind', 'meta.kind', 'input', {
      value: methodDef.metaKind,
      readOnly: true,
    })

    // meta.version (only for eip712)
    if (methodDef.metaVersion) {
      appendFormRow('metaVersion', 'meta.version', 'input', {
        value: methodDef.metaVersion,
        readOnly: true,
      })
    }

    // preset selector
    renderPresetSelector(methodDef.id, function (p) {
      var msgEl = document.getElementById('field-message')
      if (msgEl && p.message !== undefined) msgEl.value = p.message
    })
  }

  // ── _cardanoBech32ToHex (m09-04-22-fix) ──
  // Cardano bech32 주소(addr1.../addr_test1.../stake1.../drep1...)를 raw 바이트 hex로 디코드한다.
  // wm signCardanoData가 address를 hexToBytes로 처리(≥28 bytes 요구)하므로, getAddress의
  // bech32 응답을 hex로 변환해야 signData가 동작한다. 입력이 이미 hex면(0x optional) 정규화만.
  // BIP-173 bech32 charset. Cardano는 90-char 길이 제한이 없는 변형이지만, checksum(polymod)
  // 자체는 길이와 무관하게 유효하므로 _bech32VerifyChecksum으로 검증한다(오타/손상 주소 거부).
  // 반환: hex string (실패 시 '').
  var _BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
  var _BECH32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  // BIP-173 polymod — checksum 검증용 (Cardano는 길이 제한 없는 bech32 변형).
  function _bech32Polymod (values) {
    var chk = 1
    for (var i = 0; i < values.length; i++) {
      var top = chk >>> 25
      chk = (((chk & 0x1ffffff) << 5) >>> 0) ^ values[i]
      for (var j = 0; j < 5; j++) {
        if ((top >> j) & 1) chk ^= _BECH32_GEN[j]
      }
      chk = chk >>> 0
    }
    return chk >>> 0
  }
  function _bech32HrpExpand (hrp) {
    var ret = []
    var k
    for (k = 0; k < hrp.length; k++) ret.push(hrp.charCodeAt(k) >> 5)
    ret.push(0)
    for (k = 0; k < hrp.length; k++) ret.push(hrp.charCodeAt(k) & 31)
    return ret
  }
  function _bech32VerifyChecksum (hrp, words) {
    return _bech32Polymod(_bech32HrpExpand(hrp).concat(words)) === 1
  }
  function _cardanoBech32ToHex (addr) {
    if (typeof addr !== 'string' || !addr) return ''
    var s = addr.trim()
    // Cardano bech32 HRP: addr / addr_test / stake / stake_test / drep ...
    if (/^(addr|stake|drep)(_test)?1[0-9ac-hj-np-z]+$/i.test(s)) {
      // BIP-173: mixed-case 금지 (전부 소문자 또는 전부 대문자만 허용).
      if (s !== s.toLowerCase() && s !== s.toUpperCase()) return ''
      var lower = s.toLowerCase()
      var pos = lower.lastIndexOf('1')
      if (pos < 1) return ''
      var hrp = lower.slice(0, pos)
      var dataPart = lower.slice(pos + 1)
      var words = []
      for (var i = 0; i < dataPart.length; i++) {
        var v = _BECH32_CHARSET.indexOf(dataPart.charAt(i))
        if (v === -1) return ''
        words.push(v)
      }
      if (words.length < 6) return ''
      // BIP-173 checksum 검증 (체크섬 word 포함 전체로) — 실패 시 거부 (typo/corruption 차단).
      if (!_bech32VerifyChecksum(hrp, words)) return ''
      words = words.slice(0, words.length - 6) // 마지막 6 word = checksum 제거
      var acc = 0
      var bits = 0
      var hex = ''
      for (var j = 0; j < words.length; j++) {
        acc = (acc << 5) | words[j]
        bits += 5
        while (bits >= 8) {
          bits -= 8
          var b = (acc >> bits) & 0xff
          hex += (b < 16 ? '0' : '') + b.toString(16)
        }
      }
      // bech32 padding 검증: 남은 bits<5 && leftover bit이 0이어야 유효 (malformed data 거부)
      if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) return ''
      return hex
    }
    // 이미 hex — 0x 제거 후 그대로 (짝수 길이 hex만)
    var hexCandidate = s.replace(/^0x/i, '')
    if (/^[0-9a-f]+$/i.test(hexCandidate) && hexCandidate.length % 2 === 0) {
      return hexCandidate.toLowerCase()
    }
    return ''
  }

  // ── Bitcoin prevout synthesis (Build & Sign test aid) ──
  // wm(validateBitcoinPrevoutOwnership)는 각 input의 prevout scriptPubKey가 그 input의 서명
  // keyPath가 파생하는 주소와 byte 일치할 것을 요구한다(-32602 prevout script does not match).
  // static preset prev_tx로는 디바이스별 실주소를 알 수 없으므로, Build & Sign 시점에 각 input의
  // keyPath로 getAddress → 실주소의 output script를 outs[index]로 갖는 synthetic prev_tx를
  // 생성해 rawTransaction을 교체한다. 브로드캐스트용이 아니라 서명 흐름 시연용 —
  // value는 wire fee(input-output)>=0만 만족하면 됨. (_bech32* primitive 재사용.)
  var _BECH32M_CONST = 0x2bc830a3
  // segwit(BIP-173 v0 / BIP-350 v1+) 주소 → { witver, programHex } (실패 시 null)
  function _btcSegwitDecode (addr) {
    if (typeof addr !== 'string' || !addr) return null
    var s = addr.trim()
    if (s !== s.toLowerCase() && s !== s.toUpperCase()) return null // mixed-case 금지
    var lower = s.toLowerCase()
    var pos = lower.lastIndexOf('1')
    if (pos < 1) return null
    var hrp = lower.slice(0, pos)
    if (hrp !== 'bc' && hrp !== 'tb' && hrp !== 'bcrt') return null
    var dataPart = lower.slice(pos + 1)
    var words = []
    for (var i = 0; i < dataPart.length; i++) {
      var v = _BECH32_CHARSET.indexOf(dataPart.charAt(i))
      if (v === -1) return null
      words.push(v)
    }
    if (words.length < 7) return null // >=1 data word + 6 checksum
    var witver = words[0]
    if (witver > 16) return null
    var polymod = _bech32Polymod(_bech32HrpExpand(hrp).concat(words))
    var expected = witver === 0 ? 1 : _BECH32M_CONST // v0=bech32, v1+=bech32m
    if (polymod !== expected) return null
    var prog = words.slice(1, words.length - 6)
    var acc = 0; var bits = 0; var bytes = []
    for (var j = 0; j < prog.length; j++) {
      acc = ((acc << 5) | prog[j]) >>> 0
      bits += 5
      while (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff) }
    }
    if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) return null // padding
    if (witver === 0 && bytes.length !== 20 && bytes.length !== 32) return null
    if (bytes.length < 2 || bytes.length > 40) return null
    var hex = bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16) }).join('')
    return { witver: witver, programHex: hex }
  }
  var _B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  // base58 → byte array (checksum 미검증 — device 주소는 신뢰 입력). 실패 시 null.
  function _base58Decode (str) {
    if (typeof str !== 'string' || !str) return null
    var bytes = [0]
    for (var i = 0; i < str.length; i++) {
      var c = _B58_ALPHABET.indexOf(str.charAt(i))
      if (c === -1) return null
      var carry = c
      for (var j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58
        bytes[j] = carry & 0xff
        carry >>= 8
      }
      while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8 }
    }
    for (var k = 0; k < str.length && str.charAt(k) === '1'; k++) bytes.push(0)
    bytes.reverse()
    return bytes
  }
  // 주소 → scriptPubKey hex. bitcoinjs address.toOutputScript와 byte-identical하도록
  // 주소 포맷 자체(bech32 vs base58 version byte)로 script 종류를 판정한다. 실패 시 null.
  function _btcAddressToScriptHex (addr) {
    var seg = _btcSegwitDecode(addr)
    if (seg) {
      var op = seg.witver === 0 ? '00' : (0x50 + seg.witver).toString(16)
      var lenHex = (seg.programHex.length / 2).toString(16)
      if (lenHex.length % 2) lenHex = '0' + lenHex
      return op + lenHex + seg.programHex
    }
    var dec = _base58Decode(addr)
    if (!dec || dec.length !== 25) return null // 1 version + 20 hash + 4 checksum
    var version = dec[0]
    var hash = dec.slice(1, 21).map(function (b) { return (b < 16 ? '0' : '') + b.toString(16) }).join('')
    if (version === 0x00 || version === 0x6f) return '76a914' + hash + '88ac' // p2pkh main/test
    if (version === 0x05 || version === 0xc4) return 'a914' + hash + '87' // p2sh  main/test
    return null
  }
  // uint → little-endian hex of byteLen bytes (satoshi < 2^53 정확)
  function _uintToLEHex (n, byteLen) {
    var hex = ''
    for (var i = 0; i < byteLen; i++) {
      var b = (n & 0xff)
      hex += (b < 16 ? '0' : '') + b.toString(16)
      n = Math.floor(n / 256)
    }
    return hex
  }
  function _btcVarInt (n) {
    if (n < 0xfd) return _uintToLEHex(n, 1)
    if (n <= 0xffff) return 'fd' + _uintToLEHex(n, 2)
    if (n <= 0xffffffff) return 'fe' + _uintToLEHex(n, 4)
    return 'ff' + _uintToLEHex(n, 8)
  }
  // 비-witness synthetic prev tx: outs[index]=(scriptHex,valueSat), index 이전은 dust filler(OP_RETURN).
  function _buildSyntheticPrevTx (scriptHex, index, valueSat) {
    var DUST = 546
    var version = '02000000'
    var vin = '01' +
      '1111111111111111111111111111111111111111111111111111111111111111' + // dummy prevout hash
      '00000000' + // prevout index
      '00' + // empty scriptSig
      'ffffffff' // sequence
    var nOut = index + 1
    var vout = _btcVarInt(nOut)
    for (var i = 0; i < nOut; i++) {
      if (i === index) {
        vout += _uintToLEHex(valueSat, 8) + _btcVarInt(scriptHex.length / 2) + scriptHex
      } else {
        vout += _uintToLEHex(DUST, 8) + _btcVarInt(1) + '6a' // OP_RETURN filler
      }
    }
    return version + vin + vout + '00000000'
  }

  // 각 input의 keyPath로 getAddress → 실주소 script를 outs[index]로 갖는 synthetic prev_tx로
  // rawTransaction을 교체한다. getAddress 실패/변환 실패 input은 기존 rawTransaction 유지(폴백)
  // → wm이 실제 원인 에러를 내도록. 반환: Promise<{ synthesized, skipped, notes:[] }>.
  // 디바이스 순차 호출(같은 keyPath는 캐시)로 병렬 getAddress 회피.
  function _synthesizeBitcoinPrevouts (builtTx, chainId) {
    var dcent = _getDcent()
    var inputs = (builtTx && builtTx.inputs) || []
    var outputs = (builtTx && builtTx.outputs) || []
    var result = { synthesized: 0, skipped: 0, notes: [] }
    if (!dcent || typeof dcent.getAddress !== 'function' || inputs.length === 0) {
      result.notes.push('getAddress 불가 또는 input 없음 — prevout 합성 skip')
      return Promise.resolve(result)
    }
    var outputTotal = 0
    for (var o = 0; o < outputs.length; o++) {
      var amt = Number(outputs[o] && outputs[o].amount)
      if (isFinite(amt) && amt > 0) outputTotal += amt
    }
    var FEE = 2000 // 시연용 고정 fee (wire fee = inputTotal - outputTotal >= 0만 만족하면 됨)
    var total = outputTotal + FEE
    var n = inputs.length
    var base = Math.max(1, Math.floor(total / n))
    var addrCache = {}
    var chain = Promise.resolve()
    inputs.forEach(function (inp, i) {
      chain = chain.then(function () {
        var keyPath = inp && inp.keyPath
        if (!keyPath) { result.skipped++; result.notes.push('input[' + i + '] keyPath 없음 — skip'); return }
        var valueSat = (i === n - 1) ? (total - base * (n - 1)) : base
        if (valueSat < 1) valueSat = 1
        var addrP = addrCache[keyPath]
        if (!addrP) {
          addrP = Promise.resolve().then(function () { return dcent.getAddress({ chainId: chainId, keyPath: keyPath }) })
            .then(_unwrapV1Envelope).then(function (res) {
              var a = res && (res.address || res.pubkey)
              return typeof a === 'string' ? a : null
            })
          addrCache[keyPath] = addrP
        }
        return addrP.then(function (address) {
          if (!address) { result.skipped++; result.notes.push('input[' + i + '] getAddress 주소 추출 실패 — 기존 prev_tx 유지'); return }
          var script = _btcAddressToScriptHex(address)
          if (!script) { result.skipped++; result.notes.push('input[' + i + '] 주소 script 변환 실패 (' + address + ') — 기존 prev_tx 유지'); return }
          inp.rawTransaction = _buildSyntheticPrevTx(script, (inp.index || 0), valueSat)
          result.synthesized++
          result.notes.push('input[' + i + '] prevout ← ' + address.slice(0, 10) + '… (' + valueSat + ' sat)')
        }, function (err) {
          result.skipped++
          result.notes.push('input[' + i + '] getAddress 실패 (' + ((err && err.message) || err) + ') — 기존 prev_tx 유지')
        })
      })
    })
    return chain.then(function () { return result })
  }

  // ── _signDataGetAddressClick (m09-04-22-fix) ──
  // signData 폼의 chainId/keyPath로 dcent.getAddress 호출 → 응답 payment 주소(bech32)를
  // hex로 변환하여 field-address에 채운다 (signData는 hex address 요구).
  // Connect 게이트 적용 — Send와 일관되게 state.connected 필요 (facade 직접 호출 우회 방지).
  // 기존 헬퍼(_summarizeGetAddressResult/_unwrapV1Envelope/appendLog/normalizeError/_getDcent) 재사용.
  function _signDataGetAddressClick (chainIdEl, keyPathEl, hintEl) {
    var chainId = chainIdEl ? chainIdEl.value.trim() : ''
    var keyPath = keyPathEl ? keyPathEl.value.trim() : ''
    function setHint (msg, isErr) {
      if (hintEl) {
        hintEl.textContent = msg
        // C2 와 같은 클래스(review-finding-class-closure) — 이 파일에 같은 에러잉크/보통잉크
        // 삼항식이 정확히 2곳 있었다(grep 실측). 이 hint도 다크 사이드바 위에 놓여 같은 회귀가
        // 있어 동일하게 고친다.
        hintEl.style.color = isErr ? '#fca5a5' : 'var(--pg-muted)'
      }
    }
    if (!state.connected) {
      setHint('먼저 상단 [Connect]로 연결하세요', true)
      return
    }
    if (!chainId || !keyPath) {
      setHint('chainId / keyPath 필요', true)
      return
    }
    var dcent = _getDcent()
    if (!dcent || typeof dcent.getAddress !== 'function') {
      setHint('dcent.getAddress 사용 불가', true)
      return
    }
    setHint('getAddress 요청 중...', false)
    var startMs = Date.now()
    var req = { chainId: chainId, keyPath: keyPath }
    // getAddress의 동기 throw도 .catch로 흡수하도록 .then 안에서 호출 (async-hygiene)
    Promise.resolve().then(function () { return dcent.getAddress(req) }).then(_unwrapV1Envelope).then(function (result) {
      var address = _summarizeGetAddressResult(result).address
      if (typeof address !== 'string' || !address) {
        setHint('getAddress 응답에서 address 추출 실패', true)
        return
      }
      var hex = _cardanoBech32ToHex(address)
      if (!hex || hex.length < 56) {
        setHint('주소 hex 변환 실패/길이부족(≥28B): ' + address, true)
        return
      }
      var addrEl = document.getElementById('field-address')
      if (addrEl) addrEl.value = hex
      appendLog({ method: 'getAddress', request: req, response: result, latencyMs: Date.now() - startMs })
      setHint('✅ ' + hex.slice(0, 16) + '… (payment hex)', false)
    }).catch(function (err) {
      appendLog({ method: 'getAddress', request: req, error: normalizeError(err), latencyMs: Date.now() - startMs })
      setHint('getAddress 실패 — 결과 로그 확인', true)
    })
  }

  // ── renderSignDataForm (m10-01-14) ──
  // Cardano CIP-8 / CIP-95 message signing (signData).
  // SDK 핸들러(DcentSdkClient signData ~1087)는 { keyPath, address, payload }를 wm signDataFromWire로
  // 무변환 forward하고 { signature, key }(DataSignature)를 반환한다.
  //   - address: payment / 29-byte stake / DRep credential hex (non-empty 필수)
  //   - payload: opaque sign bytes (hex) — CIP-8/95는 빈 payload도 허용
  // 폼은 signMessage(raw) 패턴 mirror — message → address + payload로 교체.
  function renderSignDataForm (methodDef) {
    var sdFamily = (allChainsMap[methodDef.chainId] || {}).family || 'cardano'
    var sdChainIdEl = appendFormRow('chainId', 'Chain ID (CAIP-19)', 'input', {
      value: methodDef.chainId,
      datalist: _chainIdOptions(sdFamily),
    })

    var sdKeyPathEl = appendFormRow('keyPath', 'Key Path', 'input', {
      value: methodDef.defaultKeyPath || CHAIN_KEY_PATH[methodDef.chainId] || "m/44'/1815'/0'/0/0",
      placeholder: "m/44'/1815'/0'/0/0",
    })
    _wireKeyPathSync(sdChainIdEl, sdKeyPathEl)

    appendFormRow('address', 'Address (payment / stake / DRep hex)', 'input', {
      value: '',
      placeholder: 'addr1... or stake/DRep credential hex',
    })

    // m09-04-22-fix: signData address는 반드시 연결된 디바이스 소유 주소여야 하므로,
    // static placeholder 대신 getAddress로 실제 payment 주소를 채우는 버튼 제공
    // (signTransaction sender resolver와 동일 UX).
    var sdResolveRow = document.createElement('div')
    sdResolveRow.className = 'form-row'
    sdResolveRow.style.cssText = 'margin-bottom:8px;padding:6px;background:#f7f7f7;border-radius:4px;'
    var sdResolveBtn = document.createElement('button')
    sdResolveBtn.id = 'btn-signdata-getaddress'
    sdResolveBtn.type = 'button'
    sdResolveBtn.textContent = '📡 getAddress → fill address'
    sdResolveBtn.style.cssText = 'font-size:11px;padding:4px 8px;'
    var sdResolveHint = document.createElement('span')
    sdResolveHint.id = 'signdata-getaddress-hint'
    sdResolveHint.style.cssText = 'font-size:10px;color:#888;margin-left:8px;'
    sdResolveHint.textContent = '연결된 디바이스의 payment 주소로 채움 (address는 디바이스 소유 필수)'
    sdResolveBtn.addEventListener('click', function () {
      _signDataGetAddressClick(sdChainIdEl, sdKeyPathEl, sdResolveHint)
    })
    sdResolveRow.appendChild(sdResolveBtn)
    sdResolveRow.appendChild(sdResolveHint)
    formFields.appendChild(sdResolveRow)

    var sdPayloadEl = appendFormRow('payload', 'Payload (hex sign bytes)', 'textarea', {
      value: '',
      placeholder: 'CIP-8/95 opaque sign payload (hex) — empty allowed',
    })
    if (sdPayloadEl) sdPayloadEl.rows = 4

    var sdNote = document.createElement('p')
    sdNote.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:6px;'
    sdNote.textContent = 'Cardano CIP-8/CIP-95 — address must belong to the connected device. Returns { signature, key }.'
    formFields.appendChild(sdNote)

    // preset selector
    renderPresetSelector(methodDef.id, function (p) {
      var addrEl = document.getElementById('field-address')
      if (addrEl && p.address !== undefined) addrEl.value = p.address
      var plEl = document.getElementById('field-payload')
      if (plEl && p.payload !== undefined) plEl.value = p.payload
    })
  }

  // ── renderSignAuthEntryForm (m10-01-11) ──
  // Stellar Soroban authorization entry signing (signAuthEntry).
  // SDK 핸들러(DcentSdkClient signAuthEntry ~1044)는 { keyPath, authEntry }를 wm signAuthEntryFromWire로
  // 무변환 forward하고 { signedAuthEntry, signerAddress }를 반환한다.
  //   - authEntry: opaque XDR string (base64) — non-empty 필수
  // 폼은 signMessage(raw) 패턴 mirror — message → authEntry로 교체.
  function renderSignAuthEntryForm (methodDef) {
    var saFamily = (allChainsMap[methodDef.chainId] || {}).family || 'stellar'
    var saChainIdEl = appendFormRow('chainId', 'Chain ID (CAIP-19)', 'input', {
      value: methodDef.chainId,
      datalist: _chainIdOptions(saFamily),
    })

    var saKeyPathEl = appendFormRow('keyPath', 'Key Path', 'input', {
      value: methodDef.defaultKeyPath || CHAIN_KEY_PATH[methodDef.chainId] || "m/44'/148'/0'",
      placeholder: "m/44'/148'/0'",
    })
    _wireKeyPathSync(saChainIdEl, saKeyPathEl)

    var saEntryEl = appendFormRow('authEntry', 'Auth Entry (XDR base64)', 'textarea', {
      value: '',
      placeholder: 'Soroban HashIDPreimage / authorization entry XDR (base64)',
    })
    if (saEntryEl) saEntryEl.rows = 6

    var saNote = document.createElement('p')
    saNote.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:6px;'
    saNote.textContent = 'Stellar Soroban — authEntry is opaque XDR. Returns { signedAuthEntry, signerAddress }.'
    formFields.appendChild(saNote)

    // preset selector
    renderPresetSelector(methodDef.id, function (p) {
      var aeEl = document.getElementById('field-authEntry')
      if (aeEl && p.authEntry !== undefined) aeEl.value = p.authEntry
    })
  }

  // ── renderSignTxEvmForm ──
  // ── Sender resolver row builder (EVM + non-EVM signTransaction 폼 공용) ─────
  // 모든 signTransaction 폼 상단에 "Resolve sender from device" 버튼을 단다(전 네트워크
  // 일관 노출). family 에 sender 필드가 있으면 device 주소로 치환(_substituteSenderByFamily),
  // 없으면 no-op — 클릭 핸들러가 "치환 대상 없음"으로 안내한다(JSON 무변화 감지).
  var SENDER_FIELD_LABELS = {
    ethereum: 'placeholder from 을 wallet 0x 주소로 치환 (EVM은 보통 from 생략 — signer 암시)',
    solana: 'placeholder feePayer/signer 를 wallet pubkey 로 치환',
    algorand: 'placeholder from(sender) 를 wallet address 로 치환',
    tezos: 'native XTZ: source 자동 치환 / FA1.2·FA2 토큰: sender(Michelson from)는 nested라 버튼 미지원 — 수동 수정',
    hedera: 'transfers[amount<0] accountId 를 wallet 0.0.X 로 치환',
    xrp: 'placeholder Account 를 wallet r... 주소로 치환',
    xahau: 'placeholder Account 를 wallet r... 주소로 치환',
    constellation: 'placeholder source 를 wallet DAG 주소로 치환',
    tron: 'placeholder owner_address 를 wallet T... 주소로 치환',
    conflux: 'placeholder from 을 wallet cfx: 주소로 치환',
    havah: 'placeholder from 을 wallet hx 주소로 치환',
    cosmos: 'msgs[].value.from_address 를 wallet cosmos1... 로 치환',
    near: 'placeholder sender 를 wallet .near 계정으로 치환',
    stacks: 'SIP-010 토큰: sender(form-E functionArgs[1] 또는 form-D from)를 wallet SP 주소로 치환 (native STX는 sender 필드 없음 — 키에서 파생)',
  }
  function _appendSenderResolveRow (family) {
    var resolveRow = document.createElement('div')
    resolveRow.className = 'form-row'
    resolveRow.style.cssText = 'margin-bottom:8px;padding:6px;background:#f7f7f7;border-radius:4px;'
    var resolveBtn = document.createElement('button')
    resolveBtn.id = 'btn-resolve-sender'
    resolveBtn.type = 'button'
    resolveBtn.textContent = '🔑 Resolve sender from device'
    resolveBtn.style.cssText = 'font-size:11px;padding:4px 8px;'
    var resolveHint = document.createElement('span')
    resolveHint.id = 'resolve-sender-hint'
    resolveHint.style.cssText = 'font-size:10px;color:#888;margin-left:8px;'
    resolveHint.textContent = SENDER_FIELD_LABELS[family] || '이 네트워크는 payload에 sender 필드가 없음 (signer=디바이스 계정) — 클릭해도 변화 없을 수 있음'
    resolveBtn.addEventListener('click', function () {
      _resolveSenderFromDeviceClick(family, resolveHint)
    })
    resolveRow.appendChild(resolveBtn)
    resolveRow.appendChild(resolveHint)
    formFields.appendChild(resolveRow)
  }

  function renderSignTxEvmForm (methodDef) {
    // chainId — 트리 선택값을 default로 두고 사용자가 자유 입력 가능.
    // EVM family의 모든 chain (Polygon/Kaia/BSC 등)을 datalist로 제공.
    var evmChainIdEl = appendFormRow('chainId', 'Chain ID (CAIP-19)', 'input', {
      value: methodDef.chainId,
      datalist: _chainIdOptions('ethereum'),
    })

    // keyPath — chainId 변경 시 자동으로 그 chain의 defaultKeyPath로 갱신 (XDC=m/44'/550' 등)
    var evmKeyPathEl = appendFormRow('keyPath', 'Key Path', 'input', {
      value: methodDef.defaultKeyPath || "m/44'/60'/0'/0/0",
      placeholder: "m/44'/60'/0'/0/0",
    })
    _wireKeyPathSync(evmChainIdEl, evmKeyPathEl)

    // Sender resolver button — EVM도 전 네트워크 일관 노출 (family='ethereum').
    // EVM tx는 보통 from 생략(signer 암시)이라 대개 no-op이며, from 필드가 있으면 치환.
    _appendSenderResolveRow(methodDef.family)

    // transaction (JSON textarea)
    var txInput = appendFormRow('transaction', 'Transaction (JSON)', 'textarea', {
      value: '',
      placeholder: '{"type":2,"to":"0x...","value":"0x...","gasLimit":"0x..."}',
    })
    if (txInput) txInput.rows = 8

    // preset note
    var noteEl = document.createElement('p')
    noteEl.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:6px;'
    noteEl.textContent = 'Edit nonce/fee before send — preset is a template only'
    formFields.appendChild(noteEl)

    // preset selector (applicable presets 필터링)
    var applicablePresets = evmPresetsList.filter(function (p) {
      return !p.applicableChainIds || p.applicableChainIds.indexOf(methodDef.chainId) !== -1
    })

    if (applicablePresets.length > 0) {
      var presetRow = document.createElement('div')
      presetRow.className = 'form-row'
      var presetLabel = document.createElement('label')
      presetLabel.setAttribute('for', 'field-preset')
      presetLabel.textContent = 'Preset'
      var presetSelect = document.createElement('select')
      presetSelect.id = 'field-preset'
      var defaultOpt = document.createElement('option')
      defaultOpt.value = ''
      defaultOpt.textContent = '-- select preset --'
      presetSelect.appendChild(defaultOpt)
      applicablePresets.forEach(function (p) {
        var opt = document.createElement('option')
        opt.value = p.id
        opt.textContent = p.label
        presetSelect.appendChild(opt)
      })
      presetSelect.addEventListener('change', function () {
        var presetId = presetSelect.value
        if (!presetId) return
        var preset = evmPresetsMap[presetId]
        if (!preset) return
        var txEl = document.getElementById('field-transaction')
        if (txEl) txEl.value = JSON.stringify(preset.transaction, null, 2)
      })

      // applicableChainIds 외 chain에서는 preset select 비활성
      var isApplicable = applicablePresets.length > 0
      if (!isApplicable) presetSelect.disabled = true

      presetRow.appendChild(presetLabel)
      presetRow.appendChild(presetSelect)
      formFields.appendChild(presetRow)
    } else {
      // 해당 chain에 applicable preset 없음 — 안내
      var noPresetEl = document.createElement('p')
      noPresetEl.style.cssText = 'font-size:10px;color:#888;margin-bottom:4px;'
      noPresetEl.textContent = 'No presets available for this chain. Enter transaction JSON manually.'
      formFields.appendChild(noPresetEl)
    }
  }

  // ── renderSignTxNonEvmForm (m06-01-03) ──
  // 비-EVM family 공용 폼: chainId(read-only) + keyPath + transaction(JSON) + preset selector
  function renderSignTxNonEvmForm (methodDef) {
    // m09-04-15 follow-up: Bitcoin은 [⚡ 자동 / Transaction(JSON)] 모드 선택.
    // 자동 = mempool UTXO fetch → getBitcoinTransactionObject()+add* 빌드 → sign.
    if (methodDef.family === 'bitcoin') {
      var btcMode = state.btxSignMode || 'json'
      var modeRow = document.createElement('div')
      modeRow.className = 'form-row'
      // 크로스 리뷰 발견(C1, 2026-08-12 4축 리뷰) — index-v2.html이 사이드바를 다크로 전환하며
      // .form-row label{color:var(--pg-fg)}가 이 라디오 라벨에도 적용됐다. 원래 밝은 인라인
      // background:#eef 위에서는 문제없었지만(라이트 잉크·라이트 배경), 이제 그 조합이
      // 1.07(사실상 안 보임)로 붕괴한다 — Bitcoin 서명 모드(자동/JSON) 선택 라디오가 실사용
      // 파손 대상이라 여기서 고친다. var(--pg-raised) → 11.36.
      modeRow.style.cssText = 'margin-bottom:10px;padding:6px;background:var(--pg-raised);border-radius:4px;'
      ;[['auto', '⚡ 자동 (UTXO fetch → build → sign)'], ['json', 'Transaction (JSON) 직접']].forEach(function (m) {
        var lb = document.createElement('label')
        lb.style.cssText = 'margin-right:14px;font-size:12px;cursor:pointer;'
        var rb = document.createElement('input')
        rb.type = 'radio'
        rb.name = 'btx-sign-mode'
        rb.value = m[0]
        rb.checked = (btcMode === m[0])
        rb.addEventListener('change', function () {
          state.btxSignMode = m[0]
          formFields.innerHTML = ''
          renderSignTxNonEvmForm(methodDef)
          updateSendBtn()
        })
        lb.appendChild(rb)
        lb.appendChild(document.createTextNode(' ' + m[1]))
        modeRow.appendChild(lb)
      })
      formFields.appendChild(modeRow)
      if (btcMode === 'auto') {
        _renderBtcAutoSignForm(methodDef)
        return
      }
    }

    // ── Sender resolver button (전 family 일관 노출 — _appendSenderResolveRow) ──
    // App transaction 의 sender 필드가 placeholder 면 device 서명 후 family 라이브러리가
    // reject 한다. 이 버튼이 device 의 실제 wallet 주소로 치환. sender 필드가 없는
    // family(bitcoin/stellar/polkadot 등)는 no-op — 클릭 핸들러가 안내한다.
    _appendSenderResolveRow(methodDef.family)

    // chainId — 트리 선택값을 default로 두고 사용자가 자유 입력 가능.
    // 같은 family의 chain (예: Polkadot family의 Polkadot/Astar 등)을 datalist로 제공.
    var nevmChainIdEl = appendFormRow('chainId', 'Chain ID (CAIP-19)', 'input', {
      value: methodDef.chainId,
      datalist: _chainIdOptions(methodDef.family),
    })

    // keyPath — chainId 변경 시 자동으로 그 chain의 defaultKeyPath로 갱신 (Astar=m/44'/810' 등)
    var nevmKeyPathEl = appendFormRow('keyPath', 'Key Path', 'input', {
      value: methodDef.defaultKeyPath || CHAIN_KEY_PATH[methodDef.chainId] || "m/44'/60'/0'/0/0",
      placeholder: "m/44'/60'/0'/0/0",
    })
    _wireKeyPathSync(nevmChainIdEl, nevmKeyPathEl)

    // transaction (JSON textarea)
    var txInput = appendFormRow('transaction', 'Transaction (JSON)', 'textarea', {
      value: '',
      placeholder: '{"type":"Payment","Account":"r...","Destination":"r..."}',
    })
    if (txInput) txInput.rows = 10

    // preset note
    var noteEl = document.createElement('p')
    noteEl.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:6px;'
    noteEl.textContent = 'Edit addresses/amounts before send — preset is a template only'
    formFields.appendChild(noteEl)

    // preset selector: family 또는 chainId 기준 필터링
    var applicablePresets = nonEvmPresetsList.filter(function (p) {
      if (p.applicableChainIds && p.applicableChainIds.length > 0) {
        return p.applicableChainIds.indexOf(methodDef.chainId) !== -1
      }
      return p.family === methodDef.family
    })

    if (applicablePresets.length > 0) {
      var presetRow = document.createElement('div')
      presetRow.className = 'form-row'
      var presetLabel = document.createElement('label')
      presetLabel.setAttribute('for', 'field-preset')
      presetLabel.textContent = 'Preset'
      var presetSelect = document.createElement('select')
      presetSelect.id = 'field-preset'
      var defaultOpt = document.createElement('option')
      defaultOpt.value = ''
      defaultOpt.textContent = '-- select preset --'
      presetSelect.appendChild(defaultOpt)
      applicablePresets.forEach(function (p) {
        var opt = document.createElement('option')
        opt.value = p.id
        opt.textContent = p.label
        presetSelect.appendChild(opt)
      })
      presetSelect.addEventListener('change', function () {
        var presetId = presetSelect.value
        if (!presetId) return
        var preset = nonEvmPresetsMap[presetId]
        if (!preset) return
        var txEl = document.getElementById('field-transaction')
        if (!txEl) return
        // preset.transaction 이 string (Case 1 base58 serialized) 이면 그대로, object 이면 pretty JSON
        if (typeof preset.transaction === 'string') {
          txEl.value = preset.transaction
        } else {
          txEl.value = JSON.stringify(preset.transaction, null, 2)
        }
      })
      presetRow.appendChild(presetLabel)
      presetRow.appendChild(presetSelect)
      formFields.appendChild(presetRow)
      // 첫 번째 applicable preset 자동 선택 (UX 편의 + T-U-NEVM-02)
      var firstPreset = applicablePresets[0]
      if (firstPreset) {
        presetSelect.value = firstPreset.id
        var txAutoEl = document.getElementById('field-transaction')
        if (txAutoEl) {
          if (typeof firstPreset.transaction === 'string') {
            txAutoEl.value = firstPreset.transaction
          } else {
            txAutoEl.value = JSON.stringify(firstPreset.transaction, null, 2)
          }
        }
      }
    } else {
      var noPresetEl2 = document.createElement('p')
      noPresetEl2.style.cssText = 'font-size:10px;color:#888;margin-bottom:4px;'
      noPresetEl2.textContent = 'No presets available for this chain. Enter transaction JSON manually.'
      formFields.appendChild(noPresetEl2)
    }

  }

  // Sender resolver — button click handler (family-aware).
  // chainId + keyPath 로 device 에서 wallet 주소를 받아 transaction JSON 의 placeholder 를 치환.
  // 지원: solana (feePayer + signer pubkey), algorand (from / sender).
  // 미지원 family는 호출 자체가 불가능 (버튼이 렌더링 안 됨).
  // string payload (Solana Case 1 base58 / Algorand msgpack raw bytes) 는 opaque → hint 안내.
  function _resolveSenderFromDeviceClick (family, hintEl) {
    var chainIdEl = document.getElementById('field-chainId')
    var keyPathEl = document.getElementById('field-keyPath')
    var txEl = document.getElementById('field-transaction')
    if (!chainIdEl || !keyPathEl || !txEl) return
    var chainId = chainIdEl.value.trim()
    var keyPath = keyPathEl.value.trim()
    var txRaw = txEl.value.trim()

    function setHint (msg, isError) {
      if (!hintEl) return
      hintEl.textContent = msg
      hintEl.style.color = isError ? '#c33' : '#0a7'
    }

    if (!state.connected) {
      setHint('⚠ device 미연결 — connect 먼저', true)
      return
    }
    if (!chainId || !keyPath) {
      setHint('⚠ chainId / keyPath 가 비어있음', true)
      return
    }
    if (!txRaw) {
      setHint('⚠ transaction 이 비어있음', true)
      return
    }

    var txObj
    var isStringPayload = false
    // string payload 식별: 첫 글자가 [ 또는 { 가 아니면 JSON 객체/배열 아님 (Solana base58 / Algorand raw bytes)
    if (!/^[[{]/.test(txRaw)) {
      isStringPayload = true
    } else {
      try {
        txObj = JSON.parse(txRaw)
      } catch (e) {
        setHint('⚠ transaction JSON parse 실패', true)
        return
      }
    }

    if (isStringPayload) {
      var opaqueMsg = family === 'solana'
        ? '⚠ base58 serialized 는 opaque — App 측에서 wallet pubkey 로 직접 construct 해야 함'
        : '⚠ serialized raw bytes 는 opaque — App 측에서 wallet address 로 직접 construct 해야 함'
      setHint(opaqueMsg, true)
      return
    }

    var dcent = _getDcent()
    if (!dcent || typeof dcent.getAddress !== 'function') {
      setHint('⚠ dcent.getAddress unavailable', true)
      return
    }
    setHint('… fetching wallet address …', false)
    // v2 path 우선 (m11-01-02 facade 신규 시그니처)
    var p
    try {
      p = dcent.getAddress({ chainId: chainId, keyPath: keyPath })
    } catch (syncErr) {
      setHint('⚠ getAddress sync error: ' + (syncErr && syncErr.message), true)
      return
    }
    Promise.resolve(p).then(_unwrapV1Envelope).then(function (result) {
      var address = result && (result.address || result.pubkey || result)
      if (typeof address !== 'string' || !address) {
        setHint('⚠ getAddress 응답에서 address 추출 실패', true)
        return
      }
      var substituted = _substituteSenderByFamily(txObj, family, address)
      var before = JSON.stringify(txObj)
      var after = JSON.stringify(substituted)
      txEl.value = JSON.stringify(substituted, null, 2)
      var addrShort = address.slice(0, 8) + '…' + address.slice(-4)
      if (before === after) {
        // 치환 대상(sender 필드)이 없어 payload 무변화 — no-op family 안내.
        setHint('ⓘ 이 네트워크는 치환할 sender 필드가 없음 (signer = ' + addrShort + ')', false)
      } else {
        setHint('✓ substituted to ' + addrShort, false)
      }
    }).catch(function (err) {
      setHint('⚠ getAddress 실패: ' + ((err && err.message) || String(err)), true)
    })
  }

  function appendFormRow (id, labelText, type, opts) {
    var row = document.createElement('div')
    row.className = 'form-row'
    var label = document.createElement('label')
    label.setAttribute('for', 'field-' + id)
    label.textContent = labelText
    var input
    if (type === 'textarea') {
      input = document.createElement('textarea')
    } else {
      input = document.createElement('input')
      input.type = 'text'
    }
    input.id = 'field-' + id
    if (opts.value !== undefined) input.value = opts.value
    if (opts.placeholder) input.placeholder = opts.placeholder
    if (opts.readOnly) input.readOnly = true
    row.appendChild(label)
    row.appendChild(input)
    // datalist: 자동완성 옵션. 사용자는 항목 클릭 또는 직접 타이핑 모두 가능.
    // option.value = chainId (선택 시 input에 들어가는 값).
    // textContent + label 둘 다 두면 브라우저 호환성 ↑ (Chrome/Firefox는 label, 일부는 textContent 우선).
    if (opts.datalist && opts.datalist.length > 0) {
      var datalist = document.createElement('datalist')
      datalist.id = 'datalist-' + id
      opts.datalist.forEach(function (item) {
        var opt = document.createElement('option')
        opt.value = item.value
        if (item.label) {
          opt.setAttribute('label', item.label)
          opt.textContent = item.label
        }
        datalist.appendChild(opt)
      })
      input.setAttribute('list', datalist.id)
      row.appendChild(datalist)
    }
    formFields.appendChild(row)
    return input
  }

  // ── chainId datalist 옵션 빌더 ──
  // family가 지정되면 같은 family의 chain들만, 없으면 전체 allChainsMap을 옵션으로 제공.
  // 사용자가 직접 chainId를 타이핑하거나 dropdown에서 선택할 수 있다.
  // excludeFn(cid, entry) → true면 datalist에서 제외 (선택적).
  function _chainIdOptions (family, excludeFn) {
    var options = []
    if (!allChainsMap) return options
    Object.keys(allChainsMap).forEach(function (cid) {
      var entry = allChainsMap[cid]
      if (!entry) return
      if (family && entry.family !== family) return
      if (typeof excludeFn === 'function' && excludeFn(cid, entry)) return
      options.push({ value: cid, label: entry.displayName })
    })
    return options
  }

  // m09-04-22-fix: signMessage에서 polkadot relay(slip44:354)는 미지원(wm isParaChain 가드 throw).
  // datalist 자동완성에서 relay chainId를 제외한다 (paraChain=Astar 등만 노출).
  function _signMsgExcludeUnsupported (family) {
    if (family !== 'polkadot') return null
    return function (cid) { return cid.indexOf('slip44:354') !== -1 }
  }

  // chainId input의 변경(타이핑/datalist 선택)을 keyPath input의 defaultKeyPath로 동기화.
  // 단순 정책: chainId가 allChainsMap에 있으면 그 defaultKeyPath로 덮어쓴다.
  // 사용자가 keyPath를 직접 수정한 경우도 덮어씌워질 수 있으나, renderAccountForm과 동일한 단순 UX.
  function _wireKeyPathSync (chainIdInput, keyPathInput) {
    if (!chainIdInput || !keyPathInput) return
    chainIdInput.addEventListener('input', function () {
      var entry = allChainsMap[chainIdInput.value]
      if (entry && entry.defaultKeyPath) {
        keyPathInput.value = entry.defaultKeyPath
      }
    })
  }

  // ── Connect / Disconnect ──
  btnConnect.addEventListener('click', function () {
    onConnect()
  })

  btnDisconnect.addEventListener('click', function () {
    onDisconnect()
  })

  // (DC-2701) transport 드롭다운 변경 시 연결 단위 transport 갱신.
  // 첫 호출(popup open) 전에 설정돼 있어야 적용됨(handshake first-wins). popup이 이미 열린 뒤
  // 변경하면 다음 연결(Disconnect 후 재연결)부터 반영.
  var selTransport = $('select-transport')
  if (selTransport) {
    selTransport.addEventListener('change', function () {
      var d = _getDcent()
      if (d && typeof d.setTransport === 'function') {
        try {
          d.setTransport(_getTransportOption())
        } catch (e) {
          appendLog({ method: 'setTransport', request: {}, response: { error: String(e) }, latencyMs: 0 })
        }
      }
    })
  }

  // m08-01-05: state listener는 connect/disconnect 사이클과 독립적으로 1회 등록
  // facade가 listener를 cached하므로 reset 후에도 자동 복구 (singleton.ts 동작)
  var _stateListenerRegistered = false
  function _ensureStateListener () {
    if (_stateListenerRegistered) return
    var dcent = _getDcent()
    if (!dcent || typeof dcent.setConnectionListener !== 'function') return
    dcent.setConnectionListener(function (transportState) {
      if (transportState === 'disconnected' && state.connected) {
        onTransportDisconnected('Popup was closed')
      }
    })
    _stateListenerRegistered = true
  }

  function onConnect () {
    // b08-01: popup-only 진입점.
    //   - dcent.getDeviceInfo() 호출 + state.device 채우기는 제거.
    //   - device info fetch는 [getDeviceInfo] 트리 메뉴 + [Send]가 단일 책임자.
    //   - listener 등록 + state.connected = true + 버튼 토글 + appendLog만 수행.
    btnConnect.disabled = true
    connDot.className = ''
    deviceInfoEl.textContent = 'Connecting...'

    var dcent = _getDcent()
    if (!dcent || typeof dcent.setConnectionListener !== 'function') {
      updateIndicator({ connected: false, error: true, msg: 'Init failed: window.dcent not loaded' })
      btnConnect.disabled = false
      return
    }

    // m08-01-05: facade가 transport/queue를 lazy 생성 — listener는 1회만 등록.
    // popup은 첫 sign / getDeviceInfo 호출 시 lazy하게 열린다.
    _ensureStateListener()

    // (DC-2701) 연결 단위 transport — 현재 드롭다운 값을 첫 호출(popup open) 전에 등록한다.
    // sign per-call 옵션이 아닌 dcent.setTransport()로 일원화. 첫 호출이 getDeviceInfo여도 적용됨.
    if (typeof dcent.setTransport === 'function') {
      dcent.setTransport(_getTransportOption())
    }

    // state.device는 건드리지 않는다 — [getDeviceInfo] 버튼이 단일 책임자.
    state.connected = true
    updateIndicator({ connected: true })
    btnConnect.style.display = 'none'
    btnDisconnect.style.display = ''
    updateSendBtn()
    appendLog({
      method: '_connect',
      request: {},
      response: { msg: 'Ready (popup will open on first call)' },
      latencyMs: 0,
    })
  }

  function onDisconnect () {
    // m08-01-05: facade의 popupWindowClose가 transport singleton을 close
    var dcent = _getDcent()
    if (dcent && typeof dcent.popupWindowClose === 'function') {
      try { dcent.popupWindowClose() } catch (e) { /* defensive noop */ }
    }
    state.connected = false
    state.device = null
    updateIndicator({ connected: false })
    btnConnect.style.display = ''
    btnConnect.disabled = false
    btnDisconnect.style.display = 'none'
    updateSendBtn()
    appendLog({ method: '_disconnect', request: {}, response: { msg: 'Disconnected by user' }, latencyMs: 0 })
  }

  function onTransportDisconnected (reason) {
    state.connected = false
    updateIndicator({ connected: false, error: true, msg: reason || 'Disconnected' })
    btnConnect.style.display = ''
    btnConnect.disabled = false
    btnDisconnect.style.display = 'none'
    updateSendBtn()
    appendLog({
      method: '_transport_close',
      request: {},
      response: { msg: reason || 'Popup closed' },
      latencyMs: 0,
    })
  }

  function updateIndicator (opts) {
    if (opts.connected) {
      connDot.className = 'connected'
      var parts = []
      if (opts.model) parts.push(opts.model)
      if (opts.fw) parts.push('FW: ' + opts.fw)
      deviceInfoEl.textContent = parts.length ? parts.join(' | ') : 'Connected'
    } else if (opts.error) {
      connDot.className = 'error'
      deviceInfoEl.textContent = opts.msg || 'Connection error'
    } else {
      connDot.className = ''
      deviceInfoEl.textContent = 'Not connected'
    }
  }

  // ── Send ──
  btnSend.addEventListener('click', function () {
    if (!state.connected) return
    var methodId = state.selectedMethodId
    if (!methodId) return

    clearFieldErrors()

    if (methodId.startsWith('account:')) {
      // m11-01-01: account/device API dispatcher
      sendAccountCall(methodId)
    } else if (methodId.startsWith('btx:')) {
      // m11-01-03: bitcoin tx builder dispatcher
      handleBitcoinTxAction(methodId)
    } else if (methodId.startsWith('signMessage:')) {
      sendSignMessage()
    } else if (methodId.startsWith('signData:')) {
      sendSignData()
    } else if (methodId.startsWith('signAuthEntry:')) {
      sendSignAuthEntry()
    } else if (methodId.startsWith('signTx:evm:')) {
      sendSignTxEvm()
    } else if (state.selectedMethodDef && state.selectedMethodDef.family &&
               NON_EVM_FAMILIES.indexOf(state.selectedMethodDef.family) !== -1) {
      // m06-01-03: 비-EVM signTx dispatcher
      sendSignTxNonEvm()
    }
  })

  function updateSendBtn () {
    // disabled when: not connected OR no method selected
    var canSend = !!state.connected && !!state.selectedMethodId
    btnSend.disabled = !canSend
    if (!canSend) {
      btnSend.setAttribute('aria-disabled', 'true')
    } else {
      btnSend.setAttribute('aria-disabled', 'false')
    }
  }

  // ── sendAccountCall (m11-01-01) ──
  // v1 호환 account/device API 8개 dispatcher.
  //   - facade는 v1 envelope ({header, body.parameter})으로 resolve 또는 dcentException throw.
  //   - _unwrapV1Envelope: success → body.parameter unwrap, failure → throw (b08-01: DC-2097 회귀 방지).
  //   - 모든 분기는 동일 패턴: try/catch + appendLog (error-handling-consistency).
  //
  // setLabel / syncAccount는 facade가 **synchronously** throw할 수 있다 (regex / coinGroup / coinName 검증).
  // 모두 try 안에서 호출하여 Promise rejection으로 통일한다.
  function sendAccountCall (methodId) {
    var name = methodId.slice('account:'.length)
    var startMs = Date.now()
    var dcent = _getDcent()

    // m11-01-04: getAddress 호출 시작 시 v2 path 안내 배너를 한 번 숨김 (재시도 직후 깨끗한 UI).
    // unknown_method 에러가 다시 발생하면 .catch에서 다시 표시됨.
    if (name === 'getAddress') {
      var bannerResetEl = document.getElementById('getaddress-banner')
      if (bannerResetEl) bannerResetEl.style.display = 'none'
    }

    // method별 인자 수집 + facade 호출. async IIFE로 sync throw → Promise rejection 통일.
    var callPromise = (function () {
      try {
        if (name === 'info') return dcent.info()
        if (name === 'getDeviceInfo') return dcent.getDeviceInfo()
        if (name === 'getAccountInfo') return dcent.getAccountInfo()

        if (name === 'setLabel') {
          var labelEl = document.getElementById('field-label')
          var label = labelEl ? labelEl.value : ''
          return dcent.setLabel(label)
        }

        if (name === 'syncAccount') {
          var taEl = document.getElementById('field-accountInfosJson')
          var raw = taEl ? taEl.value.trim() : ''
          if (!raw) {
            return Promise.reject(new Error('accountInfos JSON is required'))
          }
          var parsed
          try {
            parsed = JSON.parse(raw)
          } catch (e) {
            return Promise.reject(new Error('Invalid JSON: ' + e.message))
          }
          var sanitized = _sanitizeSyncAccountInfos(parsed)
          return dcent.syncAccount(sanitized)
        }

        if (name === 'selectAddress') {
          var addrEl = document.getElementById('field-addressesJson')
          var addrRaw = addrEl ? addrEl.value.trim() : ''
          if (!addrRaw) {
            return Promise.reject(new Error('addresses JSON is required'))
          }
          var addrParsed
          try {
            addrParsed = JSON.parse(addrRaw)
          } catch (e2) {
            return Promise.reject(new Error('Invalid JSON: ' + e2.message))
          }
          if (!Array.isArray(addrParsed)) {
            return Promise.reject(new Error('addresses must be a JSON array'))
          }
          // dapp-input-sanitization: each element → string (silent coerce)
          var addrs = addrParsed.map(function (a) { return String(a) })
          return dcent.selectAddress(addrs)
        }

        if (name === 'getAddress') {
          // m11-01-04: path toggle 분기 — v1 (coinType) vs v2 (chainId).
          // path 선택은 radio button (`name="getaddress-path"`)로 표현되어 있다.
          // default=v2 (m11-01-02 facade 신규 시그니처를 default로 노출).
          var v2RadioEl = document.getElementById('field-getaddress-path-v2')
          var isV2 = v2RadioEl && v2RadioEl.checked

          if (isV2) {
            // v2 path: dcent.getAddress({chainId, keyPath, prefix?, addressFormat?})
            var chainIdEl = document.getElementById('field-chainId')
            var keyPathEl = document.getElementById('field-keyPath')
            var prefixElV2 = document.getElementById('field-prefix')
            var addressFormatEl = document.getElementById('field-addressFormat')
            var chainId = chainIdEl ? chainIdEl.value.trim() : ''
            var keyPath = keyPathEl ? keyPathEl.value.trim() : ''
            var prefixRawV2 = prefixElV2 ? prefixElV2.value.trim() : ''
            var addressFormatRaw = addressFormatEl ? addressFormatEl.value.trim() : ''
            var v2Input = { chainId: chainId, keyPath: keyPath }
            // prefix는 비어있지 않을 때만 전달 (facade는 undefined / null 둘 다 허용하지만
            // 명시적으로 부재를 표현하기 위해 undefined 사용)
            if (prefixRawV2 !== '') {
              v2Input.prefix = prefixRawV2
            }
            // addressFormat 선택 시만 전달 (default empty = wm resolver 결정)
            if (addressFormatRaw !== '') {
              v2Input.addressFormat = addressFormatRaw
            }
            return dcent.getAddress(v2Input)
          }

          // v1 path: dcent.getAddress(coinType, path, prefix) — 기존 동작
          var ctEl = document.getElementById('field-coinType')
          var pathEl = document.getElementById('field-path')
          var prefixEl = document.getElementById('field-prefix')
          var coinTypeKey = ctEl ? ctEl.value : ''
          // playground select는 enum 키 (예: 'ETHEREUM')를 노출 — facade의 isAvaliableCoinType은
          // key 또는 value 모두 toLowerCase 비교로 매치하므로 그대로 전달해도 동작.
          // 단, facade 시그니처는 v1 1:1 — getAddress(coinType, path, prefix).
          // 사용자가 enum 키로 보낼지 value로 보낼지 결정해야 한다. coinType.ts enum이 import되어 있으면
          // key → value 변환을 한 번 거친다.
          var coinTypeValue = coinTypeKey
          var coinTypeEnum = (window.dcent && window.dcent.coinType) || {}
          if (coinTypeEnum[coinTypeKey] !== undefined) {
            coinTypeValue = coinTypeEnum[coinTypeKey]
          }
          var path = pathEl ? pathEl.value.trim() : ''
          var prefixRaw = prefixEl ? prefixEl.value.trim() : ''
          var prefix = prefixRaw === '' ? null : prefixRaw
          return dcent.getAddress(coinTypeValue, path, prefix)
        }

        if (name === 'getPublicKey') {
          // m09-04-21: dcent.getPublicKey({chainId, keyPath}) — chain-agnostic passthrough.
          // facade가 chainId/keyPath 검증을 담당 (빈 값이면 param_error throw).
          var gpkChainIdEl = document.getElementById('field-chainId')
          var gpkKeyPathEl = document.getElementById('field-keyPath')
          var gpkChainId = gpkChainIdEl ? gpkChainIdEl.value.trim() : ''
          var gpkKeyPath = gpkKeyPathEl ? gpkKeyPathEl.value.trim() : ''
          return dcent.getPublicKey({ chainId: gpkChainId, keyPath: gpkKeyPath })
        }

        if (name === 'getXPUB') {
          var keyEl = document.getElementById('field-key')
          var bipEl = document.getElementById('field-bip32name')
          var key = keyEl ? keyEl.value.trim() : ''
          var bip32name = bipEl ? bipEl.value.trim() : ''
          // facade signature: getXPUB(key, bip32name). bip32name이 빈 값이면 undefined 전달
          // (facade 내부에서 default 'Bitcoin seed' 처리는 spec에 명시되지 않으므로 그대로 위임).
          return dcent.getXPUB(key, bip32name === '' ? undefined : bip32name)
        }

        return Promise.reject(new Error('Unknown method: ' + methodId))
      } catch (syncErr) {
        // setLabel / syncAccount의 facade sync throw (dcentException) → Promise rejection으로 통일
        return Promise.reject(syncErr)
      }
    })()

    // common envelope unwrap + log
    callPromise.then(_unwrapV1Envelope).then(function (result) {
      if (name === 'getDeviceInfo') {
        state.device = result
      }
      appendLog({
        method: name,
        request: {},
        response: result,
        latencyMs: Date.now() - startMs,
        deviceFirmware: (name === 'getDeviceInfo' && result && result.firmware) ||
          (state.device && state.device.firmware),
      })
    }).catch(function (err) {
      // m11-01-04: getAddress v2 path + sdk가 unknown_method 에러 반환 시 form 상단 안내 배너 표시.
      // sdk(m11-02 미머지) 상태에서 graceful UX 제공 — 사용자가 v1 path로 수동 fallback 가능.
      // unknown_method 판정 조건: error.body.error.code가 'unknown_method' 또는 'method_not_supported' 등을 포함
      if (name === 'getAddress') {
        var v2RadioElCatch = document.getElementById('field-getaddress-path-v2')
        var isV2Catch = v2RadioElCatch && v2RadioElCatch.checked
        if (isV2Catch) {
          var bannerEl = document.getElementById('getaddress-banner')
          if (bannerEl && _isUnknownMethodError(err)) {
            bannerEl.style.display = 'block'
          }
        }
      }
      appendLog({
        method: name,
        request: {},
        error: normalizeError(err),
        latencyMs: Date.now() - startMs,
      })
    })
  }

  // ── _isUnknownMethodError (m11-01-04) ──
  // sdk가 v2 payload(getAddress chainId)를 미인식하여 발생하는 unknown_method 에러를 감지한다.
  // m11-02가 머지되기 전 race 상태에서 getAddress form 상단에 안내 배너를 표시하는 데 사용.
  //
  // 감지 대상:
  //   - dcentException ({header.status:'error', body.error.code: 'unknown_method'})
  //   - 일반 Error의 message 또는 code 필드에 'unknown_method' / 'method_not_supported' 키워드
  function _isUnknownMethodError (err) {
    if (!err) return false
    // dcentException shape: { body: { error: { code, message } } }
    if (err.body && err.body.error && typeof err.body.error.code === 'string') {
      var code = err.body.error.code.toLowerCase()
      if (code.indexOf('unknown_method') !== -1 || code.indexOf('method_not_supported') !== -1) {
        return true
      }
    }
    // 일반 Error.code (envelope-less)
    if (typeof err.code === 'string') {
      var c2 = err.code.toLowerCase()
      if (c2.indexOf('unknown_method') !== -1 || c2.indexOf('method_not_supported') !== -1) {
        return true
      }
    }
    // 일반 Error.message
    if (typeof err.message === 'string') {
      var m = err.message.toLowerCase()
      if (m.indexOf('unknown_method') !== -1 || m.indexOf('method_not_supported') !== -1 ||
          m.indexOf('unknown method') !== -1) {
        return true
      }
    }
    return false
  }

  // ── handleBitcoinTxAction (m11-01-03) ──
  // bitcoin tx builder dispatcher.
  //   - btx:new/addInput/addOutput: facade를 동기적으로 호출 (in-process, postMessage 없음)
  //   - btx:buildAndSign: dcent.sign({method:'signTransaction', chainId, payload}) NEW schema 호출
  //
  // 모든 분기는 동일 패턴: try/catch + appendLog (error-handling-consistency).
  // facade가 dcentException을 throw할 수 있으므로 try 안에서 호출.
  function handleBitcoinTxAction (methodId) {
    var action = methodId.slice('btx:'.length)
    var startMs = Date.now()
    var dcent = _getDcent()

    try {
      if (action === 'new') {
        var chainIdEl = document.getElementById('field-chainId')
        var chainId = chainIdEl ? chainIdEl.value.trim() : ''
        // facade 호출 — v2는 무인자. 코인은 sign 시 chainId가 결정 (coinType 미사용).
        var txObj = dcent.getBitcoinTransactionObject()
        state.bitcoinTx.current = txObj
        state.bitcoinTx.chainId = chainId
        state.bitcoinTx.inputs = 0
        state.bitcoinTx.outputs = 0
        _updateBitcoinTxStateDisplay()
        appendLog({
          method: 'getBitcoinTransactionObject',
          request: { chainId: chainId },
          response: txObj,
          latencyMs: Date.now() - startMs,
        })
        return
      }

      if (action === 'addInput') {
        if (!state.bitcoinTx.current) {
          showFieldError('prevTx', "No tx — call 'getBitcoinTransactionObject' first")
          return
        }
        var prevTxEl = document.getElementById('field-prevTx')
        var utxoIdxEl = document.getElementById('field-utxoIdx')
        var inputTypeEl = document.getElementById('field-inputType')
        var inputKeyEl = document.getElementById('field-inputKey')
        var prevTx = prevTxEl ? prevTxEl.value.trim() : ''
        var utxoIdxRaw = utxoIdxEl ? utxoIdxEl.value.trim() : ''
        var utxoIdx = parseInt(utxoIdxRaw, 10)
        if (utxoIdxRaw === '' || isNaN(utxoIdx) || String(utxoIdx) !== utxoIdxRaw) {
          // boundary-validation: 비숫자 silent fallback 회귀 가드 (NaN 방지)
          showFieldError('utxoIdx', 'utxo_idx must be a non-negative integer')
          return
        }
        if (!prevTx) {
          showFieldError('prevTx', 'prev_tx is required')
          return
        }
        var inputType = inputTypeEl ? inputTypeEl.value : 'p2wpkh'
        var inputKey = inputKeyEl ? inputKeyEl.value.trim() : ''
        if (!inputKey) {
          showFieldError('inputKey', 'key (BIP44 path) is required')
          return
        }
        // facade 호출 — in-place mutation 후 같은 객체 반환 (v1 1:1)
        state.bitcoinTx.current = dcent.addBitcoinTransactionInput(
          state.bitcoinTx.current,
          prevTx,
          utxoIdx,
          inputType,
          inputKey
        )
        state.bitcoinTx.inputs += 1
        _updateBitcoinTxStateDisplay()
        appendLog({
          method: 'addBitcoinTransactionInput',
          request: { prev_tx: prevTx.slice(0, 32) + '...', utxo_idx: utxoIdx, type: inputType, key: inputKey },
          response: { inputs: state.bitcoinTx.inputs, outputs: state.bitcoinTx.outputs },
          latencyMs: Date.now() - startMs,
        })
        return
      }

      if (action === 'addOutput') {
        if (!state.bitcoinTx.current) {
          showFieldError('outputTo', "No tx — call 'getBitcoinTransactionObject' first")
          return
        }
        var outputTypeEl = document.getElementById('field-outputType')
        var outputValueEl = document.getElementById('field-outputValue')
        var outputToEl = document.getElementById('field-outputTo')
        var outputType = outputTypeEl ? outputTypeEl.value : 'p2wpkh'
        var outputValue = outputValueEl ? outputValueEl.value.trim() : ''
        var outputTo = outputToEl ? outputToEl.value.trim() : ''
        if (!outputValue) {
          showFieldError('outputValue', 'value is required')
          return
        }
        if (!outputTo) {
          showFieldError('outputTo', 'to (receiver address) is required')
          return
        }
        // facade 호출 — addBitcoinTransactionOutput(tx, type, value, to)
        state.bitcoinTx.current = dcent.addBitcoinTransactionOutput(
          state.bitcoinTx.current,
          outputType,
          outputValue,
          outputTo
        )
        state.bitcoinTx.outputs += 1
        _updateBitcoinTxStateDisplay()
        appendLog({
          method: 'addBitcoinTransactionOutput',
          request: { type: outputType, value: outputValue, to: outputTo },
          response: { inputs: state.bitcoinTx.inputs, outputs: state.bitcoinTx.outputs },
          latencyMs: Date.now() - startMs,
        })
        return
      }

      if (action === 'buildAndSign') {
        if (!state.bitcoinTx.current) {
          showFieldError('chainId', "No tx — call 'getBitcoinTransactionObject' first")
          return
        }
        if (state.bitcoinTx.inputs === 0) {
          showFieldError('chainId', 'No inputs — call addBitcoinTransactionInput first')
          return
        }
        if (state.bitcoinTx.outputs === 0) {
          showFieldError('chainId', 'No outputs — call addBitcoinTransactionOutput first')
          return
        }
        var bsChainIdEl = document.getElementById('field-chainId')
        var bsKeyPathEl = document.getElementById('field-keyPath')
        var bsChainId = bsChainIdEl ? bsChainIdEl.value.trim() : ''
        var bsKeyPath = bsKeyPathEl ? bsKeyPathEl.value.trim() : ''
        // boundary-validation: keyPath
        var keyPathError = validateKeyPath(bsKeyPath)
        if (keyPathError) {
          showFieldError('keyPath', keyPathError)
          return
        }
        if (!bsChainId) {
          showFieldError('chainId', 'chainId is required')
          return
        }
        var builtTx = state.bitcoinTx.current
        // m09-04-01/DC-2221: NEW sign schema { method, chainId, payload } — OLD { chain, payload } 금지.
        // connector-chain-addition-isolation: bsChainId는 사용자 입력 그대로 pass-through (chain enum 없음).
        // b08-01: _unwrapV1Envelope이 success → body.parameter unwrap, failure → throw로 변환.
        // m09-04-15: builder(getBitcoinTransactionObject/add*)가 v2 flat wire(BitcoinWireTransaction)를
        // 직접 생성하므로 변환 없이 그대로 송신. (unsupported txType/malformed 인자는 add* 시점에 throw됨.)
        // DC-2701: transport는 연결 단위(dcent.setTransport) — sign per-call transport 미지원.
        // prevout ownership(validateBitcoinPrevoutOwnership): 각 input의 keyPath 실주소로
        // prev_tx를 합성해 rawTransaction 교체 → outs[index].script == toOutputScript(deviceAddr).
        // static preset prev_tx는 디바이스별 실주소를 모르므로 여기서 device 주소로 덮어쓴다.
        _synthesizeBitcoinPrevouts(builtTx, bsChainId).then(function (synth) {
          var bsSignInput = { method: 'signTransaction', chainId: bsChainId, payload: { keyPath: bsKeyPath, transaction: builtTx } }
          return dcent.sign(bsSignInput).then(_unwrapV1Envelope).then(function (result) {
            appendLog({
              method: 'signTransaction',
              chainId: bsChainId,
              keyPath: bsKeyPath,
              request: { chainId: bsChainId, keyPath: bsKeyPath, transaction: builtTx },
              response: result,
              prevoutSynthesis: synth,
              latencyMs: Date.now() - startMs,
              deviceFirmware: state.device && state.device.firmware,
            })
          }).catch(function (err) {
            appendLog({
              method: 'signTransaction',
              chainId: bsChainId,
              keyPath: bsKeyPath,
              request: { chainId: bsChainId, keyPath: bsKeyPath, transaction: builtTx },
              prevoutSynthesis: synth,
              error: normalizeError(err),
              latencyMs: Date.now() - startMs,
            })
          })
        }).catch(function (err) {
          appendLog({
            method: 'signTransaction',
            chainId: bsChainId,
            keyPath: bsKeyPath,
            request: { chainId: bsChainId, keyPath: bsKeyPath, transaction: builtTx },
            error: normalizeError(err),
            latencyMs: Date.now() - startMs,
          })
        })
        return
      }
    } catch (syncErr) {
      // facade sync throw (dcentException) → log + UI 표시
      appendLog({
        method: action,
        request: {},
        error: normalizeError(syncErr),
        latencyMs: Date.now() - startMs,
      })
    }
  }

  function sendSignMessage () {
    var methodDef = state.selectedMethodDef
    if (!methodDef) return

    var chainIdEl = document.getElementById('field-chainId')
    var keyPathEl = document.getElementById('field-keyPath')
    var messageEl = document.getElementById('field-message')

    var chainId = chainIdEl ? chainIdEl.value : methodDef.chainId
    var keyPath = keyPathEl ? keyPathEl.value.trim() : ''
    var message = messageEl ? messageEl.value.trim() : ''

    // boundary-validation: keyPath
    var keyPathError = validateKeyPath(keyPath)
    if (keyPathError) {
      showFieldError('keyPath', keyPathError)
      return
    }

    // boundary-validation: message
    if (!message) {
      showFieldError('message', 'Message is required')
      return
    }

    // boundary-validation: message JSON validity for eip712
    if (methodDef.metaKind === 'eip712') {
      try {
        JSON.parse(message)
      } catch (e) {
        showFieldError('message', 'Message must be valid JSON for EIP-712')
        return
      }
    }

    var metaObj = { kind: methodDef.metaKind }
    if (methodDef.metaVersion) metaObj.version = methodDef.metaVersion

    var params = { chainId: chainId, keyPath: keyPath, message: message, meta: metaObj }
    var startMs = Date.now()

    // m09-04-01.5: NEW schema 마이그레이션 — { method, chainId, payload }.
    // method는 intent literal ('signMessage'), chainId(CAIP-19)는 top-level, payload에는 chainId 제거.
    var dcent = _getDcent()
    // b08-01: _unwrapV1Envelope이 success → body.parameter unwrap, failure → throw로 변환
    // DC-2701: transport는 연결 단위(dcent.setTransport) — sign per-call transport 미지원.
    var smSignInput = { method: 'signMessage', chainId: chainId, payload: { keyPath: keyPath, message: message, meta: metaObj } }
    dcent.sign(smSignInput).then(_unwrapV1Envelope).then(function (result) {
      appendLog({
        method: 'signMessage',
        chainId: chainId,
        keyPath: keyPath,
        request: params,
        response: result,
        latencyMs: Date.now() - startMs,
        deviceFirmware: state.device && state.device.firmware,
      })
    }).catch(function (err) {
      appendLog({
        method: 'signMessage',
        chainId: chainId,
        keyPath: keyPath,
        request: params,
        error: normalizeError(err),
        latencyMs: Date.now() - startMs,
      })
    })
  }

  // ── sendSignData (m10-01-14) — Cardano CIP-8/95 App message signing ──
  // wire: { method: 'signData', chainId, payload: { keyPath, address, payload } }
  // SDK는 address(non-empty) + payload(string, empty 허용)를 검증 후 wm로 forward → { signature, key }.
  // boundary-validation: keyPath / address 필수. payload는 빈 문자열 허용(CIP-8 opaque).
  function sendSignData () {
    var methodDef = state.selectedMethodDef
    if (!methodDef) return

    var chainIdEl = document.getElementById('field-chainId')
    var keyPathEl = document.getElementById('field-keyPath')
    var addressEl = document.getElementById('field-address')
    var payloadEl = document.getElementById('field-payload')

    var chainId = chainIdEl ? chainIdEl.value : methodDef.chainId
    var keyPath = keyPathEl ? keyPathEl.value.trim() : ''
    var addressRaw = addressEl ? addressEl.value.trim() : ''
    // payload는 opaque sign bytes — 빈 문자열도 유효(SDK signData 핸들러가 empty payload 수용).
    var signPayload = payloadEl ? payloadEl.value.trim() : ''

    var keyPathError = validateKeyPath(keyPath)
    if (keyPathError) {
      showFieldError('keyPath', keyPathError)
      return
    }
    if (!addressRaw) {
      showFieldError('address', 'Address is required (payment / stake / DRep hex)')
      return
    }
    // m09-04-22-fix: signData address는 hex(payment/stake/DRep bytes, ≥28 bytes) 요구.
    // bech32(addr1…) 입력은 hex로 정규화, hex는 그대로. 유효하지 않으면 client-side 차단
    // (wm signCardanoData의 hexToBytes+≥28B 계약을 미리 강제 — 디바이스 cryptic 실패 방지).
    var address = _cardanoBech32ToHex(addressRaw)
    if (!address || address.length < 56) {
      showFieldError('address', 'Address must be hex (or bech32 addr1…) of ≥28 bytes — use 📡 getAddress')
      return
    }

    var params = { chainId: chainId, keyPath: keyPath, address: address, payload: signPayload }
    var startMs = Date.now()

    var dcent = _getDcent()
    var sdSignInput = { method: 'signData', chainId: chainId, payload: { keyPath: keyPath, address: address, payload: signPayload } }
    dcent.sign(sdSignInput).then(_unwrapV1Envelope).then(function (result) {
      appendLog({
        method: 'signData',
        chainId: chainId,
        keyPath: keyPath,
        request: params,
        response: result,
        latencyMs: Date.now() - startMs,
        deviceFirmware: state.device && state.device.firmware,
      })
    }).catch(function (err) {
      appendLog({
        method: 'signData',
        chainId: chainId,
        keyPath: keyPath,
        request: params,
        error: normalizeError(err),
        latencyMs: Date.now() - startMs,
      })
    })
  }

  // ── sendSignAuthEntry (m10-01-11) — Stellar Soroban authorization entry signing ──
  // wire: { method: 'signAuthEntry', chainId, payload: { keyPath, authEntry } }
  // SDK는 authEntry(non-empty)를 검증 후 wm로 forward → { signedAuthEntry, signerAddress }.
  // boundary-validation: keyPath / authEntry 필수.
  function sendSignAuthEntry () {
    var methodDef = state.selectedMethodDef
    if (!methodDef) return

    var chainIdEl = document.getElementById('field-chainId')
    var keyPathEl = document.getElementById('field-keyPath')
    var authEntryEl = document.getElementById('field-authEntry')

    var chainId = chainIdEl ? chainIdEl.value : methodDef.chainId
    var keyPath = keyPathEl ? keyPathEl.value.trim() : ''
    var authEntry = authEntryEl ? authEntryEl.value.trim() : ''

    var keyPathError = validateKeyPath(keyPath)
    if (keyPathError) {
      showFieldError('keyPath', keyPathError)
      return
    }
    if (!authEntry) {
      showFieldError('authEntry', 'Auth Entry (XDR) is required')
      return
    }

    var params = { chainId: chainId, keyPath: keyPath, authEntry: authEntry }
    var startMs = Date.now()

    var dcent = _getDcent()
    var saSignInput = { method: 'signAuthEntry', chainId: chainId, payload: { keyPath: keyPath, authEntry: authEntry } }
    dcent.sign(saSignInput).then(_unwrapV1Envelope).then(function (result) {
      appendLog({
        method: 'signAuthEntry',
        chainId: chainId,
        keyPath: keyPath,
        request: params,
        response: result,
        latencyMs: Date.now() - startMs,
        deviceFirmware: state.device && state.device.firmware,
      })
    }).catch(function (err) {
      appendLog({
        method: 'signAuthEntry',
        chainId: chainId,
        keyPath: keyPath,
        request: params,
        error: normalizeError(err),
        latencyMs: Date.now() - startMs,
      })
    })
  }

  function sendSignTxEvm () {
    var methodDef = state.selectedMethodDef
    if (!methodDef) return

    var chainIdEl = document.getElementById('field-chainId')
    var keyPathEl = document.getElementById('field-keyPath')
    var txEl = document.getElementById('field-transaction')

    var chainId = chainIdEl ? chainIdEl.value : methodDef.chainId
    var keyPath = keyPathEl ? keyPathEl.value.trim() : ''
    var txRaw = txEl ? txEl.value.trim() : ''

    // boundary-validation: keyPath
    var keyPathError = validateKeyPath(keyPath)
    if (keyPathError) {
      showFieldError('keyPath', keyPathError)
      return
    }

    // boundary-validation: transaction required
    if (!txRaw) {
      showFieldError('transaction', 'Transaction JSON is required')
      return
    }

    // boundary-validation: transaction must be valid JSON
    var txObj
    try {
      txObj = JSON.parse(txRaw)
    } catch (e) {
      showFieldError('transaction', 'Transaction must be valid JSON')
      return
    }

    var params = { chainId: chainId, keyPath: keyPath, transaction: txObj }
    var startMs = Date.now()

    // m09-04-01.5: NEW schema 마이그레이션 — { method, chainId, payload }.
    // method='signTransaction' (intent literal), chainId(CAIP-19) top-level, payload에서 chainId 제거.
    // sdk resolveChainId가 wallet-models registry로 currency 결정.
    var dcent = _getDcent()
    // b08-01: _unwrapV1Envelope이 success → body.parameter unwrap, failure → throw로 변환
    // DC-2701: transport는 연결 단위(dcent.setTransport) — sign per-call transport 미지원.
    var evmSignInput = { method: 'signTransaction', chainId: chainId, payload: { keyPath: keyPath, transaction: txObj } }
    dcent.sign(evmSignInput).then(_unwrapV1Envelope).then(function (result) {
      appendLog({
        method: 'signTransaction',
        chainId: chainId,
        keyPath: keyPath,
        request: params,
        response: result,
        latencyMs: Date.now() - startMs,
        deviceFirmware: state.device && state.device.firmware,
      })
    }).catch(function (err) {
      appendLog({
        method: 'signTransaction',
        chainId: chainId,
        keyPath: keyPath,
        request: params,
        error: normalizeError(err),
        latencyMs: Date.now() - startMs,
      })
    })
  }

  // ── Bitcoin 계열 자동 서명 (m09-04-15 follow-up) ──────────────────────────
  // signTx > Bitcoin family(BTC/LTC/DOGE/DASH/ZEC/BCH/eCash 등) 노드의 '⚡ 자동' 모드.
  // 코인은 클릭한 노드의 chainId로 결정. explorer 지원 코인은 [Fetch UTXO]가 prev_tx/vout 자동 채움,
  // 미지원 코인(Bitcoin Gold/DigiByte/Ravencoin 등)은 prev_tx/vout 직접 입력 → 동일하게 build+sign.
  // ⚠ Horizen(slip44:121)은 예외 — 네이티브 ZEN 체인이 2025-07-23 Base ERC-20 마이그레이션으로 종료되어
  //   서명해도 broadcast 할 체인이 없다. 전용 preset(zen-transfer)은 제거했고, bridge 가 chainId
  //   단계에서 4200(Unsupported chain)으로 거부한다(epic/m09-05-bridge-monorepo 20baaf2).
  //   ⚠ 그 게이트는 **아직 배포 전**이라, 배포 전까지는 요청이 그대로 통과해 디바이스가
  //   'bip115 opt size too small: 0' 으로 거부한다.
  //   chains.json 항목은 문서 마커로만 남는다 — 거부의 회귀 가드는 bridge 단위 테스트가 소유한다.
  // 전 코인 동일 wm convertTransaction slot(flat wire)이라 모두 testable.
  var BTC_MEMPOOL_NETS = {
    testnet4: 'https://mempool.space/testnet4/api',
    testnet3: 'https://mempool.space/testnet/api',
    signet: 'https://mempool.space/signet/api'
  }
  // esplora(mempool 호환) explorer — /address/{a}/utxo + /tx/{txid}/hex. 무료·CORS·API key 불필요.
  var BTC_ESPLORA = {
    'bip122:000000000019d6689c085ae165831e93/slip44:0': 'https://mempool.space/api', // BTC mainnet
    'bip122:12a765e31ffd4059bada1e25190f6e98/slip44:2': 'https://litecoinspace.org/api' // Litecoin (mempool팀 운영)
  }
  // blockcypher explorer (무료, API key 불필요) — chainId → {coin, chain}
  var BTC_BLOCKCYPHER = {
    'bip122:1a91e3dace36e2be3bf030a65679fe82/slip44:3': { coin: 'doge', chain: 'main' }, // Dogecoin
    'bip122:00000ffd590b1485b3caadc19b22e637/slip44:5': { coin: 'dash', chain: 'main' } // Dash
  }
  var BTC_TESTNET_CHAINID = 'bip122:000000000933ea01ad0ee984209779ba/slip44:0'

  // chainId → explorer config. 없으면 null(수동 입력). btcNet = BTC testnet의 mempool sub-net.
  function _btcResolveExplorer (chainId, btcNet) {
    if (chainId === BTC_TESTNET_CHAINID) {
      return { kind: 'esplora', base: BTC_MEMPOOL_NETS[btcNet || 'testnet4'], label: 'mempool BTC ' + (btcNet || 'testnet4') }
    }
    if (BTC_ESPLORA[chainId]) {
      return { kind: 'esplora', base: BTC_ESPLORA[chainId], label: 'esplora ' + BTC_ESPLORA[chainId].replace('https://', '').replace('/api', '') }
    }
    var bc = BTC_BLOCKCYPHER[chainId]
    if (bc) return { kind: 'blockcypher', coin: bc.coin, chain: bc.chain, label: 'blockcypher ' + bc.coin }
    return null
  }

  // explorer로 첫 UTXO + prev_tx hex 조회 → {vout,value,hex} | null
  function _btcFetchFirstUtxo (ex, addr) {
    if (ex.kind === 'esplora') {
      return fetch(ex.base + '/address/' + addr + '/utxo').then(function (r) { return r.json() }).then(function (utxos) {
        if (!utxos || !utxos.length) return null
        var u = utxos.filter(function (x) { return x.status && x.status.confirmed })[0] || utxos[0]
        return fetch(ex.base + '/tx/' + u.txid + '/hex').then(function (r) { return r.text() }).then(function (hex) {
          return { vout: u.vout, value: u.value, hex: hex }
        })
      })
    }
    // blockcypher — txrefs(unspent) + includeHex
    var bcBase = 'https://api.blockcypher.com/v1/' + ex.coin + '/' + ex.chain
    return fetch(bcBase + '/addrs/' + addr + '?unspentOnly=true&limit=1').then(function (r) { return r.json() }).then(function (j) {
      var refs = j && j.txrefs
      if (!refs || !refs.length) return null
      var u = refs[0]
      return fetch(bcBase + '/txs/' + u.tx_hash + '?includeHex=true&limit=1').then(function (r) { return r.json() }).then(function (tj) {
        var hex = tj && tj.hex
        if (!hex) return null
        return { vout: u.tx_output_n, value: u.value, hex: hex }
      })
    })
  }

  function _appendSelectRow (id, labelText, options, value) {
    var row = document.createElement('div')
    row.className = 'form-row'
    var label = document.createElement('label')
    label.setAttribute('for', 'field-' + id)
    label.textContent = labelText
    var sel = document.createElement('select')
    sel.id = 'field-' + id
    options.forEach(function (o) {
      var op = document.createElement('option')
      op.value = o
      op.textContent = o
      sel.appendChild(op)
    })
    if (value) sel.value = value
    row.appendChild(label)
    row.appendChild(sel)
    formFields.appendChild(row)
    return sel
  }

  function _btcSetStatus (msg, isErr) {
    var el = document.getElementById('btc-fetch-status')
    if (el) {
      el.textContent = msg
      // 크로스 리뷰 발견(C2, 2026-08-12 4축 리뷰) — 이 상태 엘리먼트는 다크 사이드바(--pg-panel)
      // 위에 놓인다. 에러 잉크 #c00은 2.79로 AA 미달(전환 전 #fff 위 5.89) — 이 파일의
      // .log-json.err-json이 이미 쓰는 dark-safe danger 값(#fca5a5, 8.64)으로 교체한다.
      // 정상 상태 잉크 #888도 4.63으로 여유가 0.13뿐이라 함께 var(--pg-muted)(6.40)로 옮긴다.
      el.style.color = isErr ? '#fca5a5' : 'var(--pg-muted)'
    }
  }

  // getAddress 버튼 — 현재 chainId/keyPath/txType로 dcent.getAddress 호출 → address 필드 채움
  function _btcGetAddressClick () {
    var chainIdEl = document.getElementById('field-btcChainId')
    var chainId = chainIdEl ? chainIdEl.value.trim() : ''
    var keyPathEl = document.getElementById('field-btcKeyPath')
    var keyPath = keyPathEl ? keyPathEl.value.trim() : ''
    var txTypeEl = document.getElementById('field-btcTxType')
    var txType = txTypeEl ? txTypeEl.value : 'p2pkh'
    if (!chainId || !keyPath) {
      _btcSetStatus('chainId / keyPath 필요', true)
      return
    }
    // txType → addressFormat (wm registry 지원: legacy / segwit-native. p2sh는 미지정)
    var afMap = { p2pkh: 'legacy', p2wpkh: 'segwit-native' }
    var input = { chainId: chainId, keyPath: keyPath }
    if (afMap[txType]) input.addressFormat = afMap[txType]
    var dcent = _getDcent()
    if (!dcent || typeof dcent.getAddress !== 'function') {
      _btcSetStatus('dcent.getAddress 사용 불가', true)
      return
    }
    _btcSetStatus('getAddress 요청 중...', false)
    var startMs = Date.now()
    Promise.resolve(dcent.getAddress(input)).then(_unwrapV1Envelope).then(function (result) {
      var address = result && (result.address || result.pubkey || result)
      if (typeof address !== 'string' || !address) {
        _btcSetStatus('getAddress 응답에서 address 추출 실패', true)
        return
      }
      var addrEl = document.getElementById('field-btcAddr')
      if (addrEl) addrEl.value = address
      if (!state.btxAuto) state.btxAuto = {}
      state.btxAuto.addr = address
      appendLog({ method: 'getAddress', request: input, response: result, latencyMs: Date.now() - startMs })
      _btcSetStatus('✅ ' + address + ' → 이제 [Fetch UTXO]', false)
    }).catch(function (err) {
      appendLog({ method: 'getAddress', request: input, error: normalizeError(err), latencyMs: Date.now() - startMs })
      _btcSetStatus('getAddress 실패 — 결과 로그 확인', true)
    })
  }

  // 자동 모드 폼 렌더 — network / address / chainId / keyPath / txType / Fetch UTXO / to / amount / fee
  function _renderBtcAutoSignForm (methodDef) {
    var a = state.btxAuto || {}
    var chainId = a.chainId || methodDef.chainId || BTC_TESTNET_CHAINID
    var keyPath = a.keyPath || methodDef.defaultKeyPath || "m/44'/1'/0'/0/0"
    var ex = _btcResolveExplorer(chainId, a.net || 'testnet4')
    // BTC testnet만 mempool sub-net 선택 노출 (testnet4/testnet3/signet)
    if (chainId === BTC_TESTNET_CHAINID) {
      var netSel = _appendSelectRow('btcNet', 'mempool network (BTC testnet)', ['testnet4', 'testnet3', 'signet'], a.net || 'testnet4')
      netSel.addEventListener('change', function () {
        if (!state.btxAuto) state.btxAuto = {}
        state.btxAuto.net = netSel.value
      })
    }
    appendFormRow('btcChainId', 'Chain ID', 'input', { value: chainId })
    appendFormRow('btcKeyPath', 'Key Path', 'input', { value: keyPath, placeholder: keyPath })
    _appendSelectRow('btcTxType', 'Input txType (주소 종류: legacy=p2pkh)', ['p2pkh', 'p2wpkh', 'p2sh'], a.txType || 'p2pkh')
    appendFormRow('btcAddr', 'Address (📡 getAddress 또는 직접 입력)', 'input', { value: a.addr || '', placeholder: '내 지갑 주소' })
    var btnRow = document.createElement('div')
    btnRow.className = 'form-row'
    var gaBtn = document.createElement('button')
    gaBtn.id = 'btn-btc-getaddr'
    gaBtn.type = 'button'
    gaBtn.textContent = '📡 getAddress'
    gaBtn.style.cssText = 'font-size:12px;padding:5px 10px;margin-right:6px;'
    gaBtn.addEventListener('click', _btcGetAddressClick)
    var fetchBtn = document.createElement('button')
    fetchBtn.id = 'btn-btc-fetch'
    fetchBtn.type = 'button'
    fetchBtn.textContent = ex ? ('🔍 Fetch UTXO (' + ex.label + ')') : '🔍 Fetch UTXO — 미지원'
    fetchBtn.style.cssText = 'font-size:12px;padding:5px 10px;'
    fetchBtn.disabled = !ex
    fetchBtn.addEventListener('click', _btcFetchUtxoClick)
    var status = document.createElement('span')
    status.id = 'btc-fetch-status'
    status.style.cssText = 'font-size:11px;color:#888;margin-left:10px;'
    status.textContent = ex ? 'getAddress → Fetch UTXO' : '이 코인은 explorer 자동 fetch 미지원 — prev_tx/vout 직접 입력'
    btnRow.appendChild(gaBtn)
    btnRow.appendChild(fetchBtn)
    btnRow.appendChild(status)
    formFields.appendChild(btnRow)
    appendFormRow('btcPrevTx', 'prev_tx (raw hex — Fetch가 채움 / 수동 paste)', 'textarea', { value: a.prevTx || '', placeholder: 'UTXO를 만든 tx의 raw hex' })
    appendFormRow('btcVout', 'vout (output index)', 'input', { value: (a.vout != null ? String(a.vout) : '0') })
    appendFormRow('btcTo', 'To (받는 주소, 비우면 self-send)', 'input', { value: a.to || '' })
    appendFormRow('btcAmount', 'Amount (sat)', 'input', { value: a.amount || '', placeholder: 'Fetch 시 자동 = UTXO − fee' })
    appendFormRow('btcFee', 'Fee (sat)', 'input', { value: a.fee || '200' })
  }

  // Fetch UTXO 버튼 — chainId로 explorer 결정 → 첫 UTXO+hex 조회 → prev_tx/vout/to/amount 채움
  function _btcFetchUtxoClick () {
    var addrEl = document.getElementById('field-btcAddr')
    var addr = addrEl ? addrEl.value.trim() : ''
    var chainIdEl = document.getElementById('field-btcChainId')
    var chainId = chainIdEl ? chainIdEl.value.trim() : ''
    var netEl = document.getElementById('field-btcNet')
    var btcNet = netEl ? netEl.value : 'testnet4'
    var feeEl = document.getElementById('field-btcFee')
    var fee = parseInt((feeEl ? feeEl.value : '200') || '200', 10)
    if (!fee || fee < 0) fee = 200
    if (!addr) {
      _btcSetStatus('address를 입력하세요 (📡 getAddress)', true)
      return
    }
    var ex = _btcResolveExplorer(chainId, btcNet)
    if (!ex) {
      _btcSetStatus('이 코인은 explorer 자동 fetch 미지원 — prev_tx/vout 직접 입력 후 Send', true)
      return
    }
    _btcSetStatus('조회 중 (' + ex.label + ')...', false)
    _btcFetchFirstUtxo(ex, addr).then(function (u) {
      if (!u) {
        _btcSetStatus('UTXO 없음 — 충전 후 재시도 (또는 prev_tx 직접 입력)', true)
        return
      }
      var ptEl = document.getElementById('field-btcPrevTx')
      if (ptEl) ptEl.value = u.hex
      var voEl = document.getElementById('field-btcVout')
      if (voEl) voEl.value = String(u.vout)
      var toEl = document.getElementById('field-btcTo')
      if (toEl && !toEl.value.trim()) toEl.value = addr
      var amtEl = document.getElementById('field-btcAmount')
      if (amtEl) amtEl.value = String(Math.max(u.value - fee, 0))
      if (!state.btxAuto) state.btxAuto = {}
      state.btxAuto.addr = addr
      _btcSetStatus('✅ UTXO ' + u.value + ' sat (vout ' + u.vout + ') → prev_tx ' + u.hex.length + ' chars', false)
    }).catch(function (e) {
      _btcSetStatus('조회 실패 (' + ((e && e.message) ? e.message : String(e)) + ') — prev_tx 직접 입력 가능', true)
    })
  }

  // 자동 모드 Send — prev_tx/vout(Fetch 또는 수동) + to/amount로 build + sign (Send 버튼이 호출)
  function sendBtcAutoSign () {
    var prevTxEl = document.getElementById('field-btcPrevTx')
    var prevTx = prevTxEl ? prevTxEl.value.trim() : ''
    var voutEl = document.getElementById('field-btcVout')
    var vout = parseInt((voutEl ? voutEl.value : '') || '', 10)
    var chainIdEl = document.getElementById('field-btcChainId')
    var chainId = chainIdEl ? chainIdEl.value.trim() : ''
    var keyPathEl = document.getElementById('field-btcKeyPath')
    var keyPath = keyPathEl ? keyPathEl.value.trim() : ''
    var txTypeEl = document.getElementById('field-btcTxType')
    var txType = txTypeEl ? txTypeEl.value : 'p2pkh'
    var toEl = document.getElementById('field-btcTo')
    var to = toEl ? toEl.value.trim() : ''
    var amountEl = document.getElementById('field-btcAmount')
    var amount = amountEl ? amountEl.value.trim() : ''
    if (!prevTx) {
      _btcSetStatus('prev_tx 필요 ([Fetch UTXO] 또는 직접 입력)', true)
      return
    }
    if (isNaN(vout) || vout < 0) {
      _btcSetStatus('vout(output index) 필요 — 0 이상 정수', true)
      return
    }
    var keyPathError = validateKeyPath(keyPath)
    if (keyPathError) {
      _btcSetStatus('keyPath: ' + keyPathError, true)
      return
    }
    if (!chainId) {
      _btcSetStatus('chainId 필요', true)
      return
    }
    if (!to) {
      _btcSetStatus('To 주소 필요 (self-send이면 내 주소)', true)
      return
    }
    if (!amount) {
      _btcSetStatus('amount 필요 ([Fetch UTXO]가 자동 채움)', true)
      return
    }
    var startMs = Date.now()
    var dcent = _getDcent()
    var builtTx
    try {
      builtTx = dcent.getBitcoinTransactionObject()
      dcent.addBitcoinTransactionInput(builtTx, prevTx, vout, txType, keyPath)
      dcent.addBitcoinTransactionOutput(builtTx, txType, amount, to)
    } catch (e) {
      appendLog({ method: 'signTransaction(auto-build)', request: { txType: txType, vout: vout, amount: amount, to: to }, error: normalizeError(e), latencyMs: Date.now() - startMs })
      _btcSetStatus('build 실패 — 결과 로그 확인', true)
      return
    }
    // DC-2701: transport는 연결 단위(dcent.setTransport) — sign per-call transport 미지원.
    var signInput = { method: 'signTransaction', chainId: chainId, payload: { keyPath: keyPath, transaction: builtTx } }
    var req = { chainId: chainId, keyPath: keyPath, transaction: builtTx }
    _btcSetStatus('디바이스 서명 요청 중...', false)
    dcent.sign(signInput).then(_unwrapV1Envelope).then(function (result) {
      appendLog({ method: 'signTransaction', chainId: chainId, keyPath: keyPath, request: req, response: result, latencyMs: Date.now() - startMs, deviceFirmware: state.device && state.device.firmware })
      _btcSetStatus('✅ 서명 완료 — 결과 로그 확인', false)
    }).catch(function (err) {
      appendLog({ method: 'signTransaction', chainId: chainId, keyPath: keyPath, request: req, error: normalizeError(err), latencyMs: Date.now() - startMs })
      _btcSetStatus('서명 실패 — 결과 로그 확인', true)
    })
  }

  // ── sendSignTxNonEvm (m06-01-03) ──
  function sendSignTxNonEvm () {
    var methodDef = state.selectedMethodDef
    if (!methodDef) return

    // m09-04-15 follow-up: Bitcoin 자동 모드 → UTXO fetch 결과로 build+sign
    if (methodDef.family === 'bitcoin' && state.btxSignMode === 'auto') {
      sendBtcAutoSign()
      return
    }

    var chainIdEl = document.getElementById('field-chainId')
    var keyPathEl = document.getElementById('field-keyPath')
    var txEl = document.getElementById('field-transaction')

    var chainId = chainIdEl ? chainIdEl.value : (methodDef.chainId || '')
    var keyPath = keyPathEl ? keyPathEl.value.trim() : ''
    var txRaw = txEl ? txEl.value.trim() : ''

    // boundary-validation: keyPath
    var keyPathError = validateKeyPath(keyPath)
    if (keyPathError) {
      showFieldError('keyPath', keyPathError)
      return
    }

    // boundary-validation: transaction required
    if (!txRaw) {
      showFieldError('transaction', 'Transaction JSON is required')
      return
    }

    // boundary-validation: transaction must be valid JSON
    var txObj
    try {
      txObj = JSON.parse(txRaw)
    } catch (e) {
      showFieldError('transaction', 'Transaction must be valid JSON')
      return
    }

    var params = { chainId: chainId, keyPath: keyPath, transaction: txObj }
    var startMs = Date.now()

    // m09-04-01.5: NEW schema 마이그레이션 — { method, chainId, payload }.
    // bip122/solana/xrpl/cosmos/stellar/hedera 등 비-EVM도 동일 패턴. chains.json의 chainId가 이미 CAIP-19.
    var dcent = _getDcent()
    // b08-01: _unwrapV1Envelope이 success → body.parameter unwrap, failure → throw로 변환
    // DC-2701: transport는 연결 단위(dcent.setTransport) — sign per-call transport 미지원.
    var nonEvmSignInput = { method: 'signTransaction', chainId: chainId, payload: { keyPath: keyPath, transaction: txObj } }
    dcent.sign(nonEvmSignInput).then(_unwrapV1Envelope).then(function (result) {
      appendLog({
        method: 'signTransaction',
        chainId: chainId,
        keyPath: keyPath,
        request: params,
        response: result,
        latencyMs: Date.now() - startMs,
        deviceFirmware: state.device && state.device.firmware,
      })
    }).catch(function (err) {
      appendLog({
        method: 'signTransaction',
        chainId: chainId,
        keyPath: keyPath,
        request: params,
        error: normalizeError(err),
        latencyMs: Date.now() - startMs,
      })
    })
  }

  // ── Validation helpers ──
  // KEY_PATH_RE: BIP32 derivation path pattern (m/44'/60'/0'/0/0)
  var KEY_PATH_RE = /^m(\/\d+'?)+$/

  function validateKeyPath (keyPath) {
    if (!keyPath) return 'Key Path is required'
    if (!KEY_PATH_RE.test(keyPath)) return 'Key Path must be BIP32 format (e.g. m/44\'/60\'/0\'/0/0)'
    return null
  }

  function showFieldError (fieldId, msg) {
    var input = document.getElementById('field-' + fieldId)
    if (input) input.classList.add('error')
    var row = input && input.closest('.form-row')
    if (row) {
      var existing = row.querySelector('.field-error')
      if (!existing) {
        var errEl = document.createElement('div')
        errEl.className = 'field-error'
        errEl.textContent = msg
        row.appendChild(errEl)
      }
    }
  }

  function clearFieldErrors () {
    formFields.querySelectorAll('.error').forEach(function (el) {
      el.classList.remove('error')
    })
    formFields.querySelectorAll('.field-error').forEach(function (el) {
      el.remove()
    })
  }

  // ── Log helpers ──
  // ── _summarizeGetPublicKeyResult (m09-04-21) ──
  // getPublicKey 응답에서 Cardano payment/stake/drep role별 {keyPath, publicKey}를 추출한다.
  // undefined-safe — role 항목이 없거나 필드가 누락돼도 throw하지 않고 가능한 만큼만 반환.
  // 어떤 chain의 응답이든 동작 (chain-agnostic) — role이 없으면 빈 배열.
  function _summarizeGetPublicKeyResult (result) {
    var rows = []
    if (!result || typeof result !== 'object') return rows
    var roles = ['payment', 'stake', 'drep']
    roles.forEach(function (role) {
      var entry = result[role]
      if (entry && typeof entry === 'object') {
        rows.push({
          role: role,
          keyPath: typeof entry.keyPath === 'string' ? entry.keyPath : undefined,
          publicKey: typeof entry.publicKey === 'string' ? entry.publicKey : undefined,
        })
      }
    })
    return rows
  }

  // ── _summarizeGetAddressResult (m09-04-21) ──
  // getAddress 응답에서 address + (Cardano) rewardAddress를 추출한다.
  // undefined-safe — rewardAddress는 Cardano 신 shape에만 존재. 다른 family는 미포함.
  function _summarizeGetAddressResult (result) {
    var out = {}
    if (!result || typeof result !== 'object') return out
    if (typeof result.address === 'string') out.address = result.address
    if (typeof result.rewardAddress === 'string') out.rewardAddress = result.rewardAddress
    return out
  }

  function appendLog (entry) {
    var ts = new Date().toISOString()
    var logEntry = {
      timestamp_iso: ts,
      method: entry.method,
      chainId: entry.chainId,
      keyPath: entry.keyPath,
      request: entry.request || {},
      response: entry.response,
      error: entry.error,
      latency_ms: entry.latencyMs || 0,
      sdk_version: state.sdkVersion || 'unknown',
      device_firmware: entry.deviceFirmware,
    }

    // Remove undefined fields
    Object.keys(logEntry).forEach(function (k) {
      if (logEntry[k] === undefined) delete logEntry[k]
    })

    state.logs.push(logEntry)

    // Remove placeholder
    if (logEmpty) logEmpty.style.display = 'none'

    // Build DOM entry
    var entryEl = document.createElement('div')
    entryEl.className = 'log-entry ' + (entry.error ? 'error' : entry.method.startsWith('_') ? 'info' : 'success')

    var tsEl = document.createElement('div')
    tsEl.className = 'log-ts'
    tsEl.textContent = ts + (entry.latencyMs > 0 ? ' | ' + entry.latencyMs + 'ms' : '')

    var methodEl = document.createElement('div')
    methodEl.className = 'log-method'
    methodEl.textContent = entry.method + (entry.chainId ? ' [' + entry.chainId + ']' : '')

    entryEl.appendChild(tsEl)
    entryEl.appendChild(methodEl)

    if (entry.response !== undefined) {
      var resEl = document.createElement('pre')
      resEl.className = 'log-json'
      resEl.textContent = JSON.stringify(entry.response, null, 2)
      entryEl.appendChild(resEl)
    }

    // m09-04-21: getPublicKey 응답 — payment/stake/drep role별 keyPath/publicKey 요약 라인.
    if (entry.response !== undefined && entry.method === 'getPublicKey') {
      var pkRows = _summarizeGetPublicKeyResult(entry.response)
      if (pkRows.length > 0) {
        var pkSummary = document.createElement('div')
        pkSummary.className = 'log-summary pubkey-summary'
        pkRows.forEach(function (r) {
          var line = document.createElement('div')
          line.className = 'pubkey-role pubkey-role-' + r.role
          line.textContent = r.role + ': ' + (r.keyPath || '(no keyPath)') + ' → ' + (r.publicKey || '(no publicKey)')
          pkSummary.appendChild(line)
        })
        entryEl.appendChild(pkSummary)
      }
    }

    // m09-04-21: getAddress 응답 — Cardano 신 shape의 rewardAddress 라인 (undefined-safe).
    // 다른 family 응답은 rewardAddress 부재 → 라인 미표시.
    if (entry.response !== undefined && entry.method === 'getAddress') {
      var addrSummary = _summarizeGetAddressResult(entry.response)
      if (addrSummary.rewardAddress) {
        var rwLine = document.createElement('div')
        rwLine.className = 'log-summary reward-address-line'
        rwLine.textContent = 'rewardAddress: ' + addrSummary.rewardAddress
        entryEl.appendChild(rwLine)
      }
    }

    if (entry.error) {
      var errEl = document.createElement('pre')
      errEl.className = 'log-json err-json'
      errEl.textContent = JSON.stringify(entry.error, null, 2)
      entryEl.appendChild(errEl)
    }

    logScroll.appendChild(entryEl)

    // Auto scroll (unless paused)
    if (!state.pauseAutoScroll) {
      logScroll.scrollTop = logScroll.scrollHeight
    }
  }

  // ── Log toolbar ──
  btnPause.addEventListener('click', function () {
    state.pauseAutoScroll = !state.pauseAutoScroll
    btnPause.classList.toggle('active', state.pauseAutoScroll)
    btnPause.textContent = state.pauseAutoScroll ? 'Resume' : 'Pause'
  })

  btnClear.addEventListener('click', function () {
    state.logs = []
    logScroll.innerHTML = ''
    logEmpty.style.display = ''
    logScroll.appendChild(logEmpty)
  })

  btnCopy.addEventListener('click', function () {
    var jsonl = state.logs.map(function (e) { return JSON.stringify(e) }).join('\n')
    if (navigator.clipboard) {
      navigator.clipboard.writeText(jsonl).catch(function () {})
    }
  })

  // ── Utils ──
  // m08-01-05: _genId 제거 — facade의 _call이 내부 ID 생성 (singleton.ts/idGen.ts)

  function normalizeError (err) {
    if (!err) return { code: -1, message: 'Unknown error' }
    // m08-01-05: facade는 v1 호환 응답으로 reject하거나 ProviderError로 throw
    // v1 형식: { header: { status: 'failure' }, body: { error: { code, message } } }
    if (err && err.body && err.body.error) {
      return {
        code: err.body.error.code !== undefined ? err.body.error.code : -1,
        message: err.body.error.message || String(err),
      }
    }
    return {
      code: err.code !== undefined ? err.code : -1,
      message: err.message || String(err),
    }
  }

  // ── Init ──
  function init () {
    // Try to read sdk_version from bundle global
    if (window.packageVersion) {
      state.sdkVersion = window.packageVersion
    }
    buildTree()
    updateSendBtn()
    // Load chain + preset data asynchronously (non-blocking)
    loadChainsData()
  }

  init()

  // ── Export minimal test API for unit tests (jsdom) ──
  window._playgroundTestAPI = {
    TREE: TREE,
    PRESETS: PRESETS,
    CHAIN_KEY_PATH: CHAIN_KEY_PATH,
    KEY_PATH_RE: KEY_PATH_RE,
    validateKeyPath: validateKeyPath,
    state: state,
    appendLog: appendLog,
    // m09-04-21: getPublicKey / getAddress 응답 요약 helper (undefined-safe, pure)
    _summarizeGetPublicKeyResult: _summarizeGetPublicKeyResult,
    _summarizeGetAddressResult: _summarizeGetAddressResult,
    // m09-04-22-fix: Cardano bech32→hex (signData address hex 변환) 회귀 테스트용 노출
    _cardanoBech32ToHex: _cardanoBech32ToHex,
    // b08-01: envelope unwrap helper + popup-only onConnect 검증용 노출
    _unwrapV1Envelope: _unwrapV1Envelope,
    // placeholder substitution helpers — unit testable
    _substituteSolanaSigner: _substituteSolanaSigner,
    _substituteAlgorandSender: _substituteAlgorandSender,
    _substituteTezosSource: _substituteTezosSource,
    _substituteHederaSender: _substituteHederaSender,
    _substituteXrpAccount: _substituteXrpAccount,
    _substituteConstellationSource: _substituteConstellationSource,
    _substituteTronOwner: _substituteTronOwner,
    _substituteFromField: _substituteFromField,
    _substituteCosmosSender: _substituteCosmosSender,
    _substituteNearSender: _substituteNearSender,
    _substituteSenderByFamily: _substituteSenderByFamily,
    onConnect: onConnect,
    getLogEntries: function () { return state.logs },
    clearLogs: function () {
      state.logs = []
      logScroll.innerHTML = ''
      if (logEmpty) {
        logEmpty.style.display = ''
        logScroll.appendChild(logEmpty)
      }
    },
    getPauseAutoScroll: function () { return state.pauseAutoScroll },
    togglePause: function () { btnPause.click() },
    countMethodNodes: function () {
      var count = 0
      function walk (items) {
        items.forEach(function (item) {
          if (item.kind === 'method' && !item._placeholder) count++
          else if (item.items) walk(item.items)
        })
      }
      walk(TREE)
      return count
    },
    isSendDisabled: function () { return btnSend.disabled },
    // m08-01-05: simulateConnect는 mock dcent facade를 inject + 연결 상태로 진입
    // mockDcentOrTransport: { getDeviceInfo, sign, popupWindowClose, setConnectionListener, ... }
    //   기존 호출 호환: 첫 인자가 transport-like(`.send`/`.on` 가진 객체)이면 wrapper 생성
    simulateConnect: function (mockDcentOrTransport, mockQueueOrUnused, mockDevice) {
      var dcentMock
      if (mockDcentOrTransport && (typeof mockDcentOrTransport.getDeviceInfo === 'function' ||
                                    typeof mockDcentOrTransport.sign === 'function')) {
        // 새 패턴: facade-shaped mock
        dcentMock = mockDcentOrTransport
      } else if (mockDcentOrTransport && typeof mockDcentOrTransport.send === 'function') {
        // 구 패턴 호환: transport mock → facade-shaped wrapper로 변환
        var transport = mockDcentOrTransport
        dcentMock = {
          getDeviceInfo: function () {
            return transport.send({ id: 'mock-' + Date.now(), method: 'getDeviceInfo' })
              .then(function (resp) {
                // resp는 transport raw envelope — v1 호환 envelope으로 wrap
                if (resp && resp.body) return resp
                return { header: { status: 'success' }, body: { parameter: (resp && resp.result) || resp } }
              })
          },
          sign: function (input) {
            return transport.send({ id: 'mock-' + Date.now(), method: input.chain || 'signTransaction', params: input.payload })
              .then(function (resp) {
                if (resp && resp.body) return resp
                return { header: { status: 'success' }, body: { parameter: (resp && resp.result) || resp } }
              })
          },
          popupWindowClose: function () {
            if (typeof transport.close === 'function') transport.close().catch(function () {})
          },
          setConnectionListener: function (l) {
            if (typeof transport.on === 'function') transport.on('state', l)
          },
        }
      } else {
        dcentMock = mockDcentOrTransport
      }
      state._testDcent = dcentMock
      state.connected = true
      state.device = mockDevice || null
      _stateListenerRegistered = false
      _ensureStateListener()
      updateIndicator({ connected: true, model: mockDevice && mockDevice.model, fw: mockDevice && mockDevice.firmware })
      btnConnect.style.display = 'none'
      btnDisconnect.style.display = ''
      updateSendBtn()
    },
    simulateDisconnect: function () {
      state._testDcent = null
      state.connected = false
      state.device = null
      _stateListenerRegistered = false
      updateIndicator({ connected: false })
      btnConnect.style.display = ''
      btnConnect.disabled = false
      btnDisconnect.style.display = 'none'
      updateSendBtn()
    },
    // ── EVM SignTx test helpers ──
    getEvmChainsMap: function () { return evmChainsMap },
    getEvmChainsList: function () { return evmChainsList },
    getEvmPresetsList: function () { return evmPresetsList },
    simulateEvmLoad: function (chains, presets) {
      evmChainsMap = {}
      evmChainsList = chains || []
      evmChainsList.forEach(function (c) {
        evmChainsMap[c.chainId] = c
        allChainsMap[c.chainId] = c
      })
      evmPresetsMap = {}
      evmPresetsList = presets || []
      evmPresetsList.forEach(function (p) { evmPresetsMap[p.id] = p })
      state.evmChainsLoaded = true
      buildEvmSignTxGroup()
      buildTree()
    },
    buildEvmSignTxGroup: buildEvmSignTxGroup,
    // ── Non-EVM SignTx test helpers (m06-01-03) ──
    getNonEvmChainsByFamily: function () { return nonEvmChainsByFamily },
    getNonEvmPresetsList: function () { return nonEvmPresetsList },
    simulateNonEvmLoad: function (chains, presets) {
      nonEvmChainsByFamily = {}
      allChainsMap = {}
      // re-populate allChainsMap from existing EVM data
      evmChainsList.forEach(function (c) { allChainsMap[c.chainId] = c })
      var chainsList = chains || []
      chainsList.forEach(function (c) {
        allChainsMap[c.chainId] = c
        if (!nonEvmChainsByFamily[c.family]) nonEvmChainsByFamily[c.family] = []
        nonEvmChainsByFamily[c.family].push(c)
      })
      nonEvmPresetsMap = {}
      nonEvmPresetsList = presets || []
      nonEvmPresetsList.forEach(function (p) { nonEvmPresetsMap[p.id] = p })
      state.nonEvmChainsLoaded = true
      buildNonEvmSignTxGroups()
      buildTree()
    },
    buildNonEvmSignTxGroups: buildNonEvmSignTxGroups,
    NON_EVM_FAMILIES: NON_EVM_FAMILIES,
    FAMILY_LABELS: FAMILY_LABELS,
    // m06-01-04: 트리 노드 수 검증을 위해 buildTree 직접 노출 (R4=a)
    buildTree: buildTree,
    // m06-01-04: simulateRestLoad — Rest family chain/preset inject helper.
    // 기존 simulateNonEvmLoad와 동작 동일 (alias) — 의도 명시 + 향후 family별 분리 여지.
    simulateRestLoad: function (chains, presets) {
      return window._playgroundTestAPI.simulateNonEvmLoad(chains, presets)
    },
    // ── Account preset helpers (m11-01-01) ──
    getAccountPresetsList: function () { return accountPresetsList },
    simulateAccountPresetsLoad: function (presets) {
      accountPresetsList = presets || []
      accountPresetsMap = {}
      accountPresetsList.forEach(function (p) { accountPresetsMap[p.id] = p })
    },
    _sanitizeSyncAccountInfos: _sanitizeSyncAccountInfos,
    // ── Bitcoin tx builder helpers (m11-01-03) ──
    getBitcoinTxPresetsList: function () { return bitcoinTxPresetsList },
    simulateBitcoinTxPresetsLoad: function (presets) {
      bitcoinTxPresetsList = presets || []
      bitcoinTxPresetsMap = {}
      bitcoinTxPresetsList.forEach(function (p) { bitcoinTxPresetsMap[p.id] = p })
    },
    getBitcoinTxState: function () { return state.bitcoinTx },
    resetBitcoinTxState: function () {
      state.bitcoinTx.current = null
      state.bitcoinTx.chainId = null
      state.bitcoinTx.inputs = 0
      state.bitcoinTx.outputs = 0
    },
  }
})()
