

// KDE smoothing controls (wait for DOM ready)
let kdeAngRange, kdeAngNum, kdeFreqRange, kdeFreqNum;
function getKdeFactorAngles(isRoll=false){
  if (!kdeAngNum) kdeAngNum = document.getElementById('kdeFactorAng');
  const val = clamp(parseFloat((kdeAngNum?.value)||'0.3'),0.1,1);
  return isRoll ? val * 1 : val;
}
function getKdeFactorFreq(){
  if (!kdeFreqNum) kdeFreqNum = document.getElementById('kdeFactorFreq');
  return clamp(parseFloat((kdeFreqNum?.value)||'0.3'),0.1,1);
}

document.addEventListener('DOMContentLoaded', () => {
  kdeAngRange = document.getElementById('kdeFactorAngRange');
  kdeAngNum = document.getElementById('kdeFactorAng');
  kdeFreqRange = document.getElementById('kdeFactorFreqRange');
  kdeFreqNum = document.getElementById('kdeFactorFreq');
  if (kdeAngRange && kdeAngNum) {
    kdeAngRange.addEventListener('input',e=>{ kdeAngNum.value=e.target.value; updateUnifiedDistributions(); });
    kdeAngNum.addEventListener('change',e=>{ kdeAngRange.value=e.target.value; updateUnifiedDistributions(); });
  }
  if (kdeFreqRange && kdeFreqNum) {
    kdeFreqRange.addEventListener('input',e=>{ kdeFreqNum.value=e.target.value; updateUnifiedDistributions(); });
    kdeFreqNum.addEventListener('change',e=>{ kdeFreqRange.value=e.target.value; updateUnifiedDistributions(); });
  }
});

// ---------- KDE helpers ----------
function linspace(min,max,n){ const a=new Array(n); const step=(max-min)/(n-1); for(let i=0;i<n;i++) a[i]=min+i*step; return a; }
function stddev(arr){ if(!arr.length) return 0; const m=arr.reduce((s,v)=>s+v,0)/arr.length; return Math.sqrt(arr.reduce((s,v)=>s+(v-m)*(v-m),0)/arr.length); }
function kdeBandwidth(arr){ if(arr.length<2) return 1; const s=stddev(arr); return 1.06*s*Math.pow(arr.length,-1/5); }
function gaussian(u){ return Math.exp(-0.5*u*u)/Math.sqrt(2*Math.PI); }

/* Log-KDE for positive variables (frequency) */
function kdeOnGridLogBack(values, xs, factor=1){
  const v = (values || []).filter(Number.isFinite).filter(x => x > 0);
  if (!v.length) return xs.map(_ => 0);
  const y = v.map(Math.log);
  let h = kdeBandwidth(y) * factor;
  if (!Number.isFinite(h) || h <= 1e-6) {
    const ymin = Math.min(...y), ymax = Math.max(...y);
    const span = (ymax - ymin) || 1;
    h = Math.max(span * 0.05, 1e-3) * factor;
  }
  const n = y.length;
  const invnh = 1 / (n * h);
  const out = new Array(xs.length);
  for (let j = 0; j < xs.length; j++) {
    const x = Math.max(xs[j], 1e-9);
    const yl = Math.log(x);
    let s = 0;
    for (let i = 0; i < n; i++) s += gaussian((yl - y[i]) / h);
    out[j] = (s * invnh) / x;
  }
  return out;
}

/* Shift→log→back for angles (allows negatives, returns full range) */
function kdeOnGridLogBackShift(values, xs, factor=1){
  const v0 = (values || []).filter(Number.isFinite);
  if (!v0.length) return xs.map(_ => 0);
  const minV = Math.min(...v0);
  const minX = Math.min(...xs);
  const eps = 1e-6;
  const C = Math.max( -(minV) + eps, -(minX) + eps );
  const v = v0.map(x => x + C);
  const xsShift = xs.map(x => x + C);
  const y = v.map(Math.log);
  let h = kdeBandwidth(y) * factor;
  if (!Number.isFinite(h) || h <= 1e-6) {
    const ymin = Math.min(...y), ymax = Math.max(...y);
    const span = (ymax - ymin) || 1;
    h = Math.max(span * 0.05, 1e-3) * factor;
  }
  const n = y.length;
  const invnh = 1 / (n * h);
  const out = new Array(xsShift.length);
  for (let j = 0; j < xsShift.length; j++) {
    const z = Math.max(xsShift[j], eps);
    const yl = Math.log(z);
    let s = 0;
    for (let i = 0; i < n; i++) s += gaussian((yl - y[i]) / h);
    out[j] = (s * invnh) / z;
  }
  return out;
}

// Draw multi-unit KDE
function drawKDEMulti(canvasId, kdeData, min, max, n, factor, label, logKDE, colorMap, logXAxis, yMaxShared) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const xs = linspace(min, max, n);
  const isSOG = typeof canvasId === 'string' && canvasId.indexOf('hist-sog') !== -1;
  const datasets = Object.keys(kdeData).map((unit, i) => {
    const data = kdeData[unit].data;
    if (!data.length) return null;
    let ys = logKDE ? kdeOnGridLogBack(data, xs, factor) : kdeOnGridLogBackShift(data, xs, factor);
    ys = ys.map(y=>y*100); // direct KDE percentage
    const storedUnit = window.unitSettings?.[unit] || {};
    const customLabel = kdeData[unit] && typeof kdeData[unit].label === 'string' && kdeData[unit].label.trim() ? kdeData[unit].label.trim() : null;
    return {
      label: customLabel || storedUnit.customName || unit,
      data: ys,
      borderColor: colorMap[unit] || COLORS_BASE[0],
      backgroundColor: (colorMap[unit] || COLORS_BASE[0]) + '33',
      pointRadius: 0,
      fill: true, // Enable area shading below line
      borderWidth: 2
    };
  }).filter(Boolean);

  // Ensure annotation plugin is registered for every new chart
  if (window['chartjs-plugin-annotation'] && Chart.registry && !Chart.registry.plugins.get('annotation')) {
    Chart.register(window['chartjs-plugin-annotation']);
  }
  // Determine if this is a freq distrib (by canvasId)
  const isFreq = canvasId.includes('freq');
  const freqTicks = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
  // Build annotation config: default zero-line for non-log x; customize for TWA
  const isTWA = typeof canvasId === 'string' && canvasId.indexOf('twa') !== -1;
  let annCfg = !logXAxis ? red_zero_line() : undefined;
  if (isTWA && annCfg && annCfg.annotations && annCfg.annotations.zeroline) {
    // Make the zero line dotted, thicker, and label it as WIND
    annCfg.annotations.zeroline.borderDash = [6, 6];
    annCfg.annotations.zeroline.borderWidth = 2;
    annCfg.annotations.zeroline.label = {
      display: true,
      content: 'WIND',
      color: '#ff0000',
      backgroundColor: 'rgba(0,0,0,0)',
      position: 'top',
      yAdjust: -6,
      font: { size: 12 }
    };
  }
  const chart = new Chart(el.getContext('2d'), {
    type: 'line',
    data: {
      labels: xs.map(x => x.toFixed(2)),
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { left: 10, right: 10, bottom: 8, top: 4 } },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'line', color: '#000000' } },
        tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%` } },
        annotation: annCfg
      },
      elements: { line: { tension: 0.25, borderWidth: 2 }, point: { radius: 0 } },
      scales: {
        x: isFreq ? {
          type: 'logarithmic',
          display: true,
          title: { display: true, text: label || 'X' },
          min: min,
          max: max,
          grid: { display: false, drawTicks: false, drawOnChartArea: false },
          ticks: { display: true }
        }
        : logXAxis ? {
          type: 'logarithmic',
          title: { display: true, text: label || 'X' },
          min: min,
          max: max,
          grid: { color: '#e0e0e0', tickLength: 4, lineWidth: 1 },
          ticks: {
            color: '#000000',
            padding: 6,
            maxRotation: 0,
            minRotation: 0,
            maxTicksLimit: 100,
            callback: function(value) {
              if ([0.01,0.02,0.05,0.1,0.2,0.5,1,2,5].includes(value)) return value;
              return '';
            }
          }
        } : {
          type: 'linear',
          title: { display: true, text: label || 'X' },
          min: min,
          max: max,
          grid: { color: '#e0e0e0', tickLength: 4, lineWidth: 1 },
          ticks: {
            color: '#000000',
            padding: 6,
            maxRotation: 0,
            minRotation: 0,
            stepSize: isSOG ? 5 : 10,
            includeBounds: true,
            callback: (v) => isSOG ? String(Math.round(Number(v))) : String(v)
          }
        },
        y: {
          title: { display: false },
          min: 0,
          max: yMaxShared || undefined,
          grid: { color: '#e0e0e0', tickLength: 4, lineWidth: 1 },
          ticks: { display: false }
        }
      }
    },
    plugins: [window['chartjs-plugin-annotation']].filter(Boolean)
  });

  // Draw AVG lines for non-frequency distributions only
  if (!isFreq) {
    let showAvgLabel = false;
    const labelBox = document.getElementById('showAvgLabel');
    if (labelBox) showAvgLabel = !!labelBox.checked;

    let avgDebugStr = '';
    let fallbackWarn = false;
    Object.keys(kdeData).forEach(unit => {
      const data = kdeData[unit].data;
      if (!data.length) {
        // Fallback: show gray line at center of x axis
        if (logKDE) {
          const center = (min + max) / 2;
          addAvgLineToDistribChart(chart, center, '#888', 'NO DATA', true, true);
          fallbackWarn = true;
          avgDebugStr += ` | ${unit}: NO DATA`;
        }
        return;
      }
      let ys = logKDE ? kdeOnGridLogBack(data, xs, factor) : kdeOnGridLogBackShift(data, xs, factor);
      ys = ys.map(y=>y*100);
      // For all distribs, use the mean of the raw data for AVG line
      const avg = meanStd(data).mean;
      const color = colorMap[unit] || COLORS_BASE[0];
      if (Number.isFinite(avg)) {
        addAvgLineToDistribChart(chart, avg, color, undefined, true, showAvgLabel);
        avgDebugStr += ` | ${unit}: ${avg.toFixed(2)}`;
      } else if (logKDE) {
        // Fallback: show gray line at center
        const center = (min + max) / 2;
        addAvgLineToDistribChart(chart, center, '#888', 'NO AVG', true, true);
        fallbackWarn = true;
        avgDebugStr += ` | ${unit}: NO AVG`;
      }
    });
    // Set plot title to base only (no stats/debug info)
    const titleEl = el.closest('.card')?.querySelector('div[style*="font-weight:700"]');
    if (titleEl) {
      let baseTitle = titleEl.textContent.split(' | ')[0];
      titleEl.textContent = baseTitle;
      if (fallbackWarn) titleEl.style.color = '#b00';
      else titleEl.style.color = '';
    }
  }
}

// make available to other modules
window.drawKDEMulti = drawKDEMulti;
window.getKdeFactorAngles = getKdeFactorAngles;
window.getKdeFactorFreq = getKdeFactorFreq;
window.kdeOnGridLogBack = kdeOnGridLogBack; // for testing
window.kdeOnGridLogBackShift = kdeOnGridLogBackShift; // for testing
window.linspace = linspace; // for testing
window.stddev = stddev; // for testing
window.kdeBandwidth = kdeBandwidth; // for testing