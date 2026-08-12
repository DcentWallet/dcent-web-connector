/* eslint-disable no-unused-vars */
// 이 파일은 ok-with-playground-js 와 동일한 베이스에 밝은 섬 하나만 추가한 것이다 — 앵커
// 해석(_btcSetStatus + m15-02-04 의 (a)~(d))은 그대로 성립하게 두어, exit 1의 원인이
// "앵커 실패"가 아니라 "새로 추가된 밝은 섬"임을 명확히 격리한다(2026-08-12 리뷰 W3 —
// 이전 버전은 _btcSetStatus가 아예 없어 앵커 해석 실패로 exit 1이 났고, 섬을 지워도 여전히
// exit 1이라 판별력이 없었다).
function modeRowMake () {
  var modeRow = document.createElement('div')
  modeRow.style.cssText = 'background:var(--pg-raised);'
  return modeRow
}

function _btcSetStatus (msg, isErr) {
  var el = document.getElementById('btc-fetch-status')
  if (el) {
    el.textContent = msg
    el.style.color = isErr ? '#fca5a5' : 'var(--pg-muted)'
  }
}

function _signDataGetAddressClick (chainIdEl, keyPathEl, hintEl) {
  function setHint (msg, isErr) {
    hintEl.style.color = isErr ? '#fca5a5' : 'var(--pg-muted)'
  }
  return setHint
}

function _resolveSenderFromDeviceClick (family, hintEl) {
  function setHint (msg, isError) {
    hintEl.style.color = isError ? '#fca5a5' : 'var(--pg-muted)'
  }
  return setHint
}

function islandHintsMake () {
  var sdResolveHint = document.createElement('span')
  sdResolveHint.style.cssText = 'font-size:10px;color:var(--pg-muted);margin-left:8px;'
  var resolveHint = document.createElement('span')
  resolveHint.style.cssText = 'font-size:10px;color:var(--pg-muted);margin-left:8px;'
  return [sdResolveHint, resolveHint]
}

// 🆕 밝은 섬 — 이 한 줄만 ok-with-playground-js 와 다르다.
function newBrightIslandMake () {
  var row = document.createElement('div')
  row.style.cssText = 'background:#eef;'
  return row
}

// m15-02-04 회귀 앵커 (e)/(f) 재현 — 다크로 이관된 경고 배너의 잉크·테두리.
function bannerMake () {
  var banner = document.createElement('div')
  banner.style.cssText = 'display:none;background:var(--pg-raised);color:var(--pg-fg);padding:8px 10px;border-radius:4px;border:1px solid var(--pg-border);'
  return banner
}
