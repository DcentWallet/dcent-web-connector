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
