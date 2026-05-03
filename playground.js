/**
 * playground.js — D'CENT Connector v2 Playground
 *
 * 외부 라이브러리 0, 표준 DOM API만 사용.
 * dist/v2/dcent-web-connector.min.js 로드 후 window 전역:
 *   PopupTransport, SerialRequestQueue, ErrorCode, ProviderError
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
 */
;(function () {
  'use strict'

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

  // ── FAMILY_LABELS: family → 트리 표시명 ──
  // m06-01-03 추가
  var FAMILY_LABELS = {
    ethereum: 'Ethereum (EIP-155)',
    bitcoin: 'Bitcoin',
    solana: 'Solana',
    xrp: 'XRP Ledger',
    hedera: 'Hedera',
    stellar: 'Stellar',
    tron: 'Tron',
  }

  // ── NON_EVM_FAMILIES: 비-EVM family 목록 (트리 그룹 생성 순서) ──
  // m06-01-03 추가
  var NON_EVM_FAMILIES = ['bitcoin', 'solana', 'xrp', 'hedera', 'stellar', 'tron']

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
      label: 'Device',
      items: [
        { kind: 'method', id: 'getDeviceInfo', label: 'getDeviceInfo' },
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
              chainId: 'eip155:1',
              metaKind: 'personal',
            },
            {
              kind: 'method',
              id: 'signMessage:eth:eip712-v3',
              label: 'signTypedData_v3',
              chainId: 'eip155:1',
              metaKind: 'eip712',
              metaVersion: 'V3',
            },
            {
              kind: 'method',
              id: 'signMessage:eth:eip712-v4',
              label: 'signTypedData_v4',
              chainId: 'eip155:1',
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
              chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
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
  var state = {
    transport: null, // PopupTransport 인스턴스 또는 null
    queue: null, // SerialRequestQueue
    device: null, // 마지막 getDeviceInfo 응답
    selectedMethodId: null, // 현재 선택된 트리 아이템 id
    selectedMethodDef: null, // 선택된 메서드 정의 객체
    logs: [], // append-only LogEntry[]
    pauseAutoScroll: false,
    sdkVersion: null, // dist에서 추출한 packageVersion (있으면)
    evmChainsLoaded: false, // chains.json 로드 완료 여부 (EVM + 비-EVM 통합)
    nonEvmChainsLoaded: false, // 비-EVM chains/presets 로드 완료 여부 (m06-01-03)
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

  // ── SDK globals (window에 노출됨 by dist libraryTarget: 'this') ──
  var PopupTransport = window.PopupTransport
  var SerialRequestQueue = window.SerialRequestQueue
  // ProviderError는 window.ProviderError로 직접 접근 (테스트 API에서 참조)

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

    // presets.non-evm.json
    var nonEvmPresetsPromise = fetch('/playground/presets.non-evm.json')
      .then(function (r) {
        if (!r.ok) throw new Error('presets.non-evm.json fetch failed: ' + r.status)
        return r.json()
      })
      .then(function (presets) {
        nonEvmPresetsList = presets
        nonEvmPresetsMap = {}
        presets.forEach(function (p) { nonEvmPresetsMap[p.id] = p })
      })
      .catch(function () {
        nonEvmPresetsList = []
        nonEvmPresetsMap = {}
      })

    // 셋 다 완료 후 트리 재빌드
    Promise.all([chainsPromise, evmPresetsPromise, nonEvmPresetsPromise]).then(function () {
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

    if (methodDef.id === 'getDeviceInfo') {
      renderGetDeviceInfoForm()
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

  function renderGetDeviceInfoForm () {
    var note = document.createElement('p')
    note.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;'
    note.textContent = 'Fetches device firmware, model, and address info.'
    formFields.appendChild(note)
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

  function onConnect () {
    btnConnect.disabled = true
    connDot.className = ''
    deviceInfoEl.textContent = 'Connecting...'

    try {
      state.transport = new PopupTransport({ popUpUrl: 'https://bridge.dcentwallet.com/v2' })
      state.queue = new SerialRequestQueue(state.transport)
    } catch (e) {
      updateIndicator({ connected: false, error: true, msg: 'Init failed: ' + e.message })
      btnConnect.disabled = false
      return
    }

    // Listen for transport state changes (popup close, etc.)
    state.transport.on('state', function (transportState) {
      if (transportState === 'disconnected') {
        onTransportDisconnected('Popup was closed')
      }
    })

    var startMs = Date.now()
    state.queue.enqueue(function () {
      return state.transport.send({ id: _genId(), method: 'getDeviceInfo' })
    }).then(function (resp) {
      var device = resp && resp.result ? resp.result : {}
      state.device = device
      var latencyMs = Date.now() - startMs
      updateIndicator({ connected: true, model: device.model, fw: device.firmware })
      btnConnect.style.display = 'none'
      btnDisconnect.style.display = ''
      updateSendBtn()
      appendLog({
        method: 'getDeviceInfo',
        request: {},
        response: device,
        latencyMs: latencyMs,
        deviceFirmware: device.firmware,
      })
    }).catch(function (err) {
      var errInfo = normalizeError(err)
      updateIndicator({ connected: false, error: true, msg: errInfo.message })
      btnConnect.disabled = false
      appendLog({
        method: 'getDeviceInfo',
        request: {},
        error: errInfo,
        latencyMs: Date.now() - startMs,
      })
    })
  }

  function onDisconnect () {
    if (state.transport) {
      state.transport.close().catch(function () {})
    }
    state.transport = null
    state.queue = null
    state.device = null
    updateIndicator({ connected: false })
    btnConnect.style.display = ''
    btnConnect.disabled = false
    btnDisconnect.style.display = 'none'
    updateSendBtn()
    appendLog({ method: '_disconnect', request: {}, response: { msg: 'Disconnected by user' }, latencyMs: 0 })
  }

  function onTransportDisconnected (reason) {
    state.transport = null
    state.queue = null
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
    if (!state.transport) return
    var methodId = state.selectedMethodId
    if (!methodId) return

    clearFieldErrors()

    if (methodId === 'getDeviceInfo') {
      sendGetDeviceInfo()
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
    var canSend = !!state.transport && !!state.selectedMethodId
    btnSend.disabled = !canSend
    if (!canSend) {
      btnSend.setAttribute('aria-disabled', 'true')
    } else {
      btnSend.setAttribute('aria-disabled', 'false')
    }
  }

  function sendGetDeviceInfo () {
    var startMs = Date.now()
    state.queue.enqueue(function () {
      return state.transport.send({ id: _genId(), method: 'getDeviceInfo' })
    }).then(function (resp) {
      var result = resp && resp.result ? resp.result : resp
      state.device = result
      appendLog({
        method: 'getDeviceInfo',
        request: {},
        response: result,
        latencyMs: Date.now() - startMs,
        deviceFirmware: result && result.firmware,
      })
    }).catch(function (err) {
      appendLog({
        method: 'getDeviceInfo',
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

    state.queue.enqueue(function () {
      return state.transport.send({ id: _genId(), method: 'signMessage', params: params })
    }).then(function (resp) {
      var result = resp && resp.result ? resp.result : resp
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

    state.queue.enqueue(function () {
      return state.transport.send({ id: _genId(), method: 'signTransaction', params: params })
    }).then(function (resp) {
      var result = resp && resp.result ? resp.result : resp
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

    state.queue.enqueue(function () {
      return state.transport.send({ id: _genId(), method: 'signTransaction', params: params })
    }).then(function (resp) {
      var result = resp && resp.result ? resp.result : resp
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
  var _idCounter = 0
  function _genId () {
    _idCounter += 1
    return 'pg-' + Date.now() + '-' + _idCounter
  }

  function normalizeError (err) {
    if (!err) return { code: -1, message: 'Unknown error' }
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
    simulateConnect: function (mockTransport, mockQueue, mockDevice) {
      state.transport = mockTransport
      state.queue = mockQueue
      state.device = mockDevice || null
      updateIndicator({ connected: true, model: mockDevice && mockDevice.model, fw: mockDevice && mockDevice.firmware })
      btnConnect.style.display = 'none'
      btnDisconnect.style.display = ''
      updateSendBtn()
      // transport state listener 등록 (onConnect와 동일하게)
      if (mockTransport && typeof mockTransport.on === 'function') {
        mockTransport.on('state', function (transportState) {
          if (transportState === 'disconnected') {
            onTransportDisconnected('Popup was closed')
          }
        })
      }
    },
    simulateDisconnect: function () {
      state.transport = null
      state.queue = null
      state.device = null
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
  }
})()
