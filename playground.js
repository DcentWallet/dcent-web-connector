/**
 * playground.js — D'CENT Connector v2 Playground
 *
 * 외부 라이브러리 0, 표준 DOM API만 사용.
 * dist/v2/dcent-web-connector.min.js 로드 후 window 전역:
 *   PopupTransport, SerialRequestQueue, ErrorCode, ProviderError
 *
 * 룰 준수:
 *   - error-handling-consistency: 모든 실패 경로는 appendLog({ error: ... }) 통일
 *   - boundary-validation: keyPath / message 필드 검증 후 dispatcher 호출
 *   - async-hygiene: await + catch 블록 정형화
 *   - sensitive-info-logging: console 호출 0
 *   - no-console-direct: playground.js는 src/ 바깥이나 방어적으로 0건 유지
 */
;(function () {
  'use strict'

  // ── chainId → default keyPath SLIP44 매핑 (signMessage 대상만, ~10 entry) ──
  // Child 2에서 chains.json lookup으로 교체 예정 (R13=a)
  var CHAIN_KEY_PATH = {
    'eip155:1': "m/44'/60'/0'/0/0", // Ethereum Mainnet
    'eip155:56': "m/44'/60'/0'/0/0", // BNB Smart Chain
    'eip155:137': "m/44'/60'/0'/0/0", // Polygon
    'eip155:42161': "m/44'/60'/0'/0/0", // Arbitrum One
    'eip155:10': "m/44'/60'/0'/0/0", // Optimism
    'eip155:8217': "m/44'/8217'/0'/0/0", // Kaia
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': "m/44'/501'/0'/0'", // Solana Mainnet
    'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiys6fWEeD': "m/44'/501'/0'/0'", // Solana Devnet
  }

  // ── 트리 선언적 정의 ──
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

  // ── Select method → populate form ──
  function selectMethod (methodDef) {
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
          if (item.kind === 'method') count++
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
  }
})()
