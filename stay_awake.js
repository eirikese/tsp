// --- Stay Awake Mode ---
let stayAwakeMode = false;
let stayAwakeExitSequence = [];
let stayAwakeTimeout = null;
let stayAwakeOverlay = null;
let stayAwakePaused = false;

function enterStayAwakeMode() {
  if (stayAwakeMode) return;
  stayAwakeMode = true;
  stayAwakePaused = livePlottingEnabled;
  livePlottingEnabled = false;
  if (plotTimer) clearInterval(plotTimer);
  // Create overlay
  stayAwakeOverlay = document.createElement('div');
  stayAwakeOverlay.id = 'stayAwakeOverlay';
  Object.assign(stayAwakeOverlay.style, {
    position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
    background: '#000', color: '#fff', zIndex: 9999, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  });
  const msg = document.createElement('div');
  msg.textContent = 'Stay Awake Mode';
  msg.style.marginBottom = '32px';
  msg.style.fontSize = '2em';
  msg.style.letterSpacing = '0.05em';
  msg.style.opacity = '0.7';
  stayAwakeOverlay.appendChild(msg);
  // Add exit buttons
  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '24px';
  for (let i = 1; i <= 3; i++) {
    const b = document.createElement('button');
    b.textContent = i;
    b.style.fontSize = '2em';
    b.style.width = '64px';
    b.style.height = '64px';
    b.style.borderRadius = '50%';
    b.style.border = '2px solid #fff';
    b.style.background = '#111';
    b.style.color = '#fff';
    b.style.cursor = 'pointer';
    b.onclick = () => stayAwakeButtonPress(i);
    btnRow.appendChild(b);
  }
  stayAwakeOverlay.appendChild(btnRow);
  // Add info
  const info = document.createElement('div');
  info.id = 'stayAwakeInfo';
  info.style.marginTop = '32px';
  info.style.fontSize = '1.1em';
  info.style.opacity = '0.6';
  info.textContent = 'Press 1, 2, 3 in order within 5 seconds to exit.';
  stayAwakeOverlay.appendChild(info);
  document.body.appendChild(stayAwakeOverlay);
  // Prevent screen sleep (if supported)
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').catch(()=>{});
  }
  // Pause all UI updates except logging (logging assumed to be background)
}

function stayAwakeButtonPress(n) {
  stayAwakeExitSequence.push(n);
  if (stayAwakeExitSequence.length === 1) {
    // Start/reset timer
    if (stayAwakeTimeout) clearTimeout(stayAwakeTimeout);
    stayAwakeTimeout = setTimeout(resetStayAwakeSequence, 5000);
  }
  if (stayAwakeExitSequence.length === 3) {
    if (stayAwakeExitSequence[0] === 1 && stayAwakeExitSequence[1] === 2 && stayAwakeExitSequence[2] === 3) {
      exitStayAwakeMode();
    } else {
      resetStayAwakeSequence();
      document.getElementById('stayAwakeInfo').textContent = 'Wrong sequence. Try again.';
      setTimeout(()=>{
        document.getElementById('stayAwakeInfo').textContent = 'Press 1, 2, 3 in order within 5 seconds to exit.';
      }, 1200);
    }
  }
}
function resetStayAwakeSequence() {
  stayAwakeExitSequence = [];
  if (stayAwakeTimeout) clearTimeout(stayAwakeTimeout);
  stayAwakeTimeout = null;
}
function exitStayAwakeMode() {
  stayAwakeMode = false;
  resetStayAwakeSequence();
  if (stayAwakeOverlay) {
    stayAwakeOverlay.remove();
    stayAwakeOverlay = null;
  }
  // Resume UI updates if they were enabled before
  if (stayAwakePaused) {
    livePlottingEnabled = true;
    startPlotTimer();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnStayAwake');
  if (btn) {
    btn.onclick = enterStayAwakeMode;
  }
});

// make available to other modules
window.enterStayAwakeMode = enterStayAwakeMode;
window.exitStayAwakeMode = exitStayAwakeMode;
window.isStayAwakeMode = () => stayAwakeMode;
window.resetStayAwakeSequence = resetStayAwakeSequence;
