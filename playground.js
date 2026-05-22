/**
 * playground.js — D'CENT Connector v2 Playground
 *
 * 외부 라이브러리 0, 표준 DOM API만 사용.
 * dist/v2/dcent-web-connector.min.js 로드 후 index-v2.html에서 alias:
 *   <script>window.dcent = (window.dcent && window.dcent.default) || window.dcent;</script>
 * 결과: window.dcent === facade default export object (v0.16.0 dApp이 require()로 받는 것과 동일 shape)
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
  }

  // ── NON_EVM_FAMILIES: 비-EVM family 목록 (트리 그룹 생성 순서) ──
  // m06-01-03 추가, m06-01-04 신규 8 family 추가 (ethereum 제외 13개 family)
  var NON_EVM_FAMILIES = [
    'bitcoin', 'solana', 'xrp', 'hedera', 'stellar', 'tron',
    'algorand', 'conflux', 'cosmos', 'fil', 'polkadot', 'stacks', 'tezos', 'vechain',
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
      label: 'Account / Device',
      items: [
        // m11-01-01: v1 read-only / configure / address API를 playground에 노출 (8 method)
        // 기존 Device 그룹의 getDeviceInfo는 이 그룹으로 흡수. method id는 trie 분기를 위해
        // 'account:' prefix 사용 (selectMethod / Send dispatcher가 prefix로 분기).
        { kind: 'method', id: 'account:info', label: 'info' },
        { kind: 'method', id: 'account:getDeviceInfo', label: 'getDeviceInfo' },
        { kind: 'method', id: 'account:getAccountInfo', label: 'getAccountInfo' },
        { kind: 'method', id: 'account:setLabel', label: 'setLabel' },
        { kind: 'method', id: 'account:syncAccount', label: 'syncAccount' },
        { kind: 'method', id: 'account:selectAddress', label: 'selectAddress' },
        { kind: 'method', id: 'account:getAddress', label: 'getAddress' },
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
        message: 'Hello, D\'CENT!',
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

    // 모두 완료 후 트리 재빌드
    Promise.all([chainsPromise, evmPresetsPromise, nonEvmPresetsPromise, accountPresetsPromise]).then(function () {
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
    } else if (methodDef.id.startsWith('signMessage:')) {
      renderSignMessageForm(methodDef)
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
        note.textContent = 'Fetches D\'CENT Bridge daemon status.'
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
        placeholder: '[{"coin_group":"EVM","coin_name":"ETHEREUM","label":"ETH-1"}]',
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
      // default 'ETHEREUM' if available
      if (coinTypeKeys.indexOf('ETHEREUM') !== -1) ctSelect.value = 'ETHEREUM'
      ctRow.appendChild(ctLabel)
      ctRow.appendChild(ctSelect)
      formFields.appendChild(ctRow)

      appendFormRow('path', 'Key Path', 'input', {
        value: "m/44'/60'/0'/0/0",
        placeholder: "m/44'/60'/0'/0/0",
      })
      appendFormRow('prefix', 'prefix (optional, parachain)', 'input', {
        value: '',
        placeholder: '(leave empty unless parachain)',
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

  // ── sanitize helper for syncAccount (m11-01-01) ──
  // dapp-input-sanitization 룰: known fields whitelist만 추출, __proto__ / unknown key silent drop.
  // playground 로컬 helper (connector src/sign/sanitize.ts는 string scalar 전용으로 다른 용도).
  function _sanitizeSyncAccountInfos (parsed) {
    if (!Array.isArray(parsed)) {
      throw new Error('accountInfos must be an array')
    }
    return parsed.map(function (a) {
      if (!a || typeof a !== 'object') {
        throw new Error('each account entry must be an object')
      }
      return {
        coin_group: String(a.coin_group == null ? '' : a.coin_group),
        coin_name: String(a.coin_name == null ? '' : a.coin_name),
        label: String(a.label == null ? '' : a.label),
      }
    })
  }

  function renderSignMessageForm (methodDef) {
    // chainId (read-only)
    appendFormRow('chainId', 'Chain ID', 'input', {
      value: methodDef.chainId,
      readOnly: true,
    })

    // keyPath
    appendFormRow('keyPath', 'Key Path', 'input', {
      value: CHAIN_KEY_PATH[methodDef.chainId] || "m/44'/60'/0'/0/0",
      placeholder: "m/44'/60'/0'/0/0",
    })

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
    var presets = PRESETS[methodDef.id]
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
        if (!isNaN(idx) && presets[idx]) {
          var p = presets[idx]
          var msgEl = document.getElementById('field-message')
          if (msgEl && p.message !== undefined) msgEl.value = p.message
        }
      })
      presetRow.appendChild(presetLabel)
      presetRow.appendChild(presetSelect)
      formFields.appendChild(presetRow)
    }
  }

  // ── renderSignTxEvmForm ──
  function renderSignTxEvmForm (methodDef) {
    // chainId (read-only, 트리 선택값)
    appendFormRow('chainId', 'Chain ID', 'input', {
      value: methodDef.chainId,
      readOnly: true,
    })

    // keyPath (chains.evm.json defaultKeyPath 초기값)
    appendFormRow('keyPath', 'Key Path', 'input', {
      value: methodDef.defaultKeyPath || "m/44'/60'/0'/0/0",
      placeholder: "m/44'/60'/0'/0/0",
    })

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
    // chainId (read-only)
    appendFormRow('chainId', 'Chain ID', 'input', {
      value: methodDef.chainId,
      readOnly: true,
    })

    // keyPath (chains.json defaultKeyPath 초기값)
    appendFormRow('keyPath', 'Key Path', 'input', {
      value: methodDef.defaultKeyPath || CHAIN_KEY_PATH[methodDef.chainId] || "m/44'/60'/0'/0/0",
      placeholder: "m/44'/60'/0'/0/0",
    })

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
        if (txEl) txEl.value = JSON.stringify(preset.transaction, null, 2)
      })
      presetRow.appendChild(presetLabel)
      presetRow.appendChild(presetSelect)
      formFields.appendChild(presetRow)
      // 첫 번째 applicable preset 자동 선택 (UX 편의 + T-U-NEVM-02)
      var firstPreset = applicablePresets[0]
      if (firstPreset) {
        presetSelect.value = firstPreset.id
        var txAutoEl = document.getElementById('field-transaction')
        if (txAutoEl) txAutoEl.value = JSON.stringify(firstPreset.transaction, null, 2)
      }
    } else {
      var noPresetEl2 = document.createElement('p')
      noPresetEl2.style.cssText = 'font-size:10px;color:#888;margin-bottom:4px;'
      noPresetEl2.textContent = 'No presets available for this chain. Enter transaction JSON manually.'
      formFields.appendChild(noPresetEl2)
    }
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
    formFields.appendChild(row)
    return input
  }

  // ── Connect / Disconnect ──
  btnConnect.addEventListener('click', function () {
    onConnect()
  })

  btnDisconnect.addEventListener('click', function () {
    onDisconnect()
  })

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
    } else if (methodId.startsWith('signMessage:')) {
      sendSignMessage()
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
      appendLog({
        method: name,
        request: {},
        error: normalizeError(err),
        latencyMs: Date.now() - startMs,
      })
    })
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
    dcent.sign({ method: 'signMessage', chainId: chainId, payload: { keyPath: keyPath, message: message, meta: metaObj } }).then(_unwrapV1Envelope).then(function (result) {
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
    dcent.sign({ method: 'signTransaction', chainId: chainId, payload: { keyPath: keyPath, transaction: txObj } }).then(_unwrapV1Envelope).then(function (result) {
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

  // ── sendSignTxNonEvm (m06-01-03) ──
  function sendSignTxNonEvm () {
    var methodDef = state.selectedMethodDef
    if (!methodDef) return

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
    dcent.sign({ method: 'signTransaction', chainId: chainId, payload: { keyPath: keyPath, transaction: txObj } }).then(_unwrapV1Envelope).then(function (result) {
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
    CHAIN_KEY_PATH: CHAIN_KEY_PATH,
    KEY_PATH_RE: KEY_PATH_RE,
    validateKeyPath: validateKeyPath,
    state: state,
    appendLog: appendLog,
    // b08-01: envelope unwrap helper + popup-only onConnect 검증용 노출
    _unwrapV1Envelope: _unwrapV1Envelope,
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
  }
})()
