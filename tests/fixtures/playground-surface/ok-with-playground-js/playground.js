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

function setHint (msg, isErr) {
  var hintEl = document.getElementById('hint')
  if (hintEl) {
    hintEl.textContent = msg
    hintEl.style.color = isErr ? '#fca5a5' : 'var(--pg-muted)'
  }
}
