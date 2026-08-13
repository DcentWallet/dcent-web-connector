/* eslint-disable no-unused-vars */
// 이 파일은 check-playground-surface.mjs 의 P1/P3/P4 정규식 스캐너가 매칭하는 패턴을 재현하는
// fixture 다 — 실제로 실행되지 않으므로 함수를 "사용"할 필요가 없다.
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

// m15-02-04 회귀 앵커 (a)~(d) 재현 — 다크로 이관된 섬(--pg-raised) 위 잉크. 이 넷은
// index-v2.html 밖에 살아서 buildLiteralAnchors 를 통해서만 측정된다. fixture 가 이 패턴을
// 들고 있지 않으면 앵커가 "값 해석 실패"로 떨어져, 정상 fixture 인데 exit 1 이 난다.
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

// 🔴 섬의 **배경** 선언 — 앵커 (a)~(d) 의 bg 는 토큰맵에서 가정하지 않고 여기서 실측된다
// (2026-08-13 크로스 리뷰 CRITICAL-1). 이 두 줄이 없으면 bgOf 가 null 을 반환해 앵커가
// "값 해석 실패"로 떨어진다 — 즉 fixture 가 배경 패턴까지 들고 있어야 정상이다.
function islandRowsMake () {
  var sdResolveRow = document.createElement('div')
  // 이관 전: sdResolveRow.style.cssText = 'margin-bottom:8px;padding:6px;background:var(--pg-raised);border-radius:4px;'
  sdResolveRow.classList.add('island')
  var resolveRow = document.createElement('div')
  resolveRow.style.cssText = 'margin-bottom:8px;padding:6px;background:var(--pg-raised);border-radius:4px;'
  return [sdResolveRow, resolveRow]
}

// m15-02-04 회귀 앵커 (e)/(f) 재현 — 다크로 이관된 경고 배너의 잉크·테두리.
function bannerMake () {
  var banner = document.createElement('div')
  banner.style.cssText = 'display:none;background:var(--pg-raised);color:var(--pg-fg);padding:8px 10px;border-radius:4px;border:1px solid var(--pg-border);'
  return banner
}
