/* eslint-disable no-unused-vars */
// 🔴 이 fixture 는 ok-with-playground-js 와 **섬 배경 두 줄만** 다르다 — 잉크는 건드리지 않고
// 배경만 var(--pg-raised) → var(--pg-fg)(거의 흰 표면) 로 옮겼다.
//
// 잠그는 회귀 (2026-08-13 크로스 리뷰 CRITICAL-1): m15-02-04 초판은 앵커의 bg 를 토큰맵의
// pg-raised 로 **하드코딩**했다. 그래서 이 뮤테이션이 게이트를 **통과**했다 — 실제 화면에서는
// 밝은 섬이 되살아나고 그 위 --pg-muted 잉크가 2.08 로 무너지는데, 게이트는 계속 raised 를
// 기준으로 5.46 을 "측정" 해 exit 0 를 냈다.
//
// 이건 이 게이트가 닫으려던 실패 클래스("배경을 옮기면 잉크가 깨진다")의 **거울상**이다 —
// 잉크를 지키고 배경을 방치하는 방향. 앵커가 배경을 파일에서 실측하면 exit 1 이 된다.
// 이 fixture 를 지우거나 배경을 raised 로 되돌리면 하드코딩 회귀가 무방비가 된다.
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
  sdResolveRow.style.cssText = 'margin-bottom:8px;padding:6px;background:var(--pg-fg);border-radius:4px;'
  var resolveRow = document.createElement('div')
  resolveRow.style.cssText = 'margin-bottom:8px;padding:6px;background:var(--pg-fg);border-radius:4px;'
  return [sdResolveRow, resolveRow]
}

// m15-02-04 회귀 앵커 (e)/(f) 재현 — 다크로 이관된 경고 배너의 잉크·테두리.
function bannerMake () {
  var banner = document.createElement('div')
  banner.style.cssText = 'display:none;background:var(--pg-raised);color:var(--pg-fg);padding:8px 10px;border-radius:4px;border:1px solid var(--pg-border);'
  return banner
}
