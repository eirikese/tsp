// Generate Reports tab subtabs and content
function generateReportsTabs() {
  const tabsEl = document.getElementById('reportsTabs');
  const contentEl = document.getElementById('reportsContent');
  if (!tabsEl || !contentEl) return;
  tabsEl.innerHTML = '';
  contentEl.innerHTML = '';
  if (allRecordings.length === 0) {
    contentEl.innerHTML = '<div class="small">No recordings yet. Finish a recording to see reports.</div>';
    return;
  }
  allRecordings.forEach((rec, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tabbtn' + (idx === allRecordings.length-1 ? ' active' : '');
    // Use custom label if set, else format start time as HH:MM:SS
    let label = rec.label && rec.label.trim() ? rec.label : `Recording ${idx+1}`;
    if (!rec.label && rec.startedAt) {
      const d = new Date(rec.startedAt);
      if (!isNaN(d.getTime())) {
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        label = `${h}:${m}:${s}`;
      }
    }
    btn.textContent = label;
    btn.dataset.recId = rec.id;
    btn.onclick = () => showReportFor(rec.id);
    tabsEl.appendChild(btn);
  });
  // Add delete button
  const delBtn = document.createElement('button');
  delBtn.textContent = 'Delete Selected Report';
  delBtn.className = 'small';
  delBtn.style.marginLeft = '16px';
  delBtn.onclick = function() {
    const activeBtn = tabsEl.querySelector('.tabbtn.active');
    if (!activeBtn) return;
    const recId = activeBtn.dataset.recId;
    const idx = allRecordings.findIndex(r => r.id === recId);
    if (idx !== -1) {
      if (confirm('Delete this report?')) {
        allRecordings.splice(idx, 1);
        saveRecordingsToStorage();
        generateReportsTabs();
      }
    }
  };
  tabsEl.appendChild(delBtn);

  // Add rename button
  const renBtn = document.createElement('button');
  renBtn.textContent = 'Rename Selected Report';
  renBtn.className = 'small';
  renBtn.style.marginLeft = '8px';
  renBtn.onclick = function() {
    const activeBtn = tabsEl.querySelector('.tabbtn.active');
    if (!activeBtn) return;
    const recId = activeBtn.dataset.recId;
    const rec = allRecordings.find(r => r.id === recId);
    if (rec) {
      const newName = prompt('Enter new name for this report:', rec.label || '');
      if (newName && newName.trim()) {
        rec.label = newName.trim();
        saveRecordingsToStorage();
        generateReportsTabs();
      }
    }
  };
  tabsEl.appendChild(renBtn);
  // Show latest by default
  showReportFor(allRecordings[allRecordings.length-1].id);
}

function showReportFor(recId) {
  const rec = allRecordings.find(r => r.id === recId);
  if (!rec) return;
  // Highlight active subtab
  document.querySelectorAll('#reportsTabs .tabbtn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.recId === recId);
  });
  // Show stats and a box with roll/pitch distribs
  const stats = computeRecordingStats(rec.rows);
  const started = new Date(rec.startedAt);
  // Athlete show/hide controls
  // Group by unit
  const byUnit = {};
  rec.rows.forEach(r => {
    if (!byUnit[r.unit]) byUnit[r.unit] = [];
    byUnit[r.unit].push(r);
  });
  const unitIds = Object.keys(byUnit);
  // Get unit colors from localStorage
  window.unitSettings = JSON.parse(localStorage.getItem('unitColors') || '{}');
  const colorMap = {};
  unitIds.forEach(id => { 
    const storedUnit = window.unitSettings[id] || {};
    colorMap[id] = storedUnit.color || COLORS_BASE[0];
  });
  // Show/hide state (persisted per report in-memory)
  if (!rec._athleteShow) rec._athleteShow = {};
  unitIds.forEach(id => { if (rec._athleteShow[id] === undefined) rec._athleteShow[id] = true; });
  let html = `<div class="small" style="margin-bottom:16px;">Recording started: ${started.toLocaleString()}<br>Samples: ${rec.rows.length}</div>`;
  // Athlete show/hide buttons above stats
  html += `<div class="card" style="margin-bottom:16px;padding:12px 16px 8px 16px;max-width:600px;">
    <div style="font-weight:700;margin-bottom:8px;">Show/hide athletes:</div>
    <div id="report-athlete-show" style="display:flex;gap:12px;flex-wrap:wrap;">`;
  unitIds.forEach(id => {
    const color = colorMap[id];
    html += `<button class="small" data-athlete="${id}" style="background:${rec._athleteShow[id] ? color : '#eee'};color:${rec._athleteShow[id] ? '#fff':'#333'};border-radius:6px;padding:2px 10px 2px 10px;min-width:60px;cursor:pointer;">${rec._athleteShow[id] ? 'Hide' : 'Show'} ${window.unitSettings[id]?.name || id}</button>`;
  });
  html += `</div></div>`;
  // Stats tiles, one per athlete, only if shown
  html += `<div id="report-athlete-stats" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">`;
  // Use utilities.velocity() for distance-derived speed and bearing

  unitIds.forEach(id => {
    if (!rec._athleteShow[id]) return;
    // Compute stats for this athlete
    const arr = byUnit[id] || [];
    const rolls = arr.map(r => r.roll).filter(Number.isFinite);
    const pitchs = arr.map(r => r.pitch).filter(Number.isFinite);

    // Calculate SOG and heading from lat/lon and t using velocitySafe() with global config
    const sogs = [];
    const headings = [];
    for (let i = 1; i < arr.length; ++i) {
      const r1 = arr[i-1], r2 = arr[i];
      if (Number.isFinite(r1.lat) && Number.isFinite(r1.lon) && Number.isFinite(r2.lat) && Number.isFinite(r2.lon) && Number.isFinite(r1.t) && Number.isFinite(r2.t)) {
        const vf = getVelocityFilterConfig();
        const v = vf.enabled ? velocitySafe({lat:r1.lat, lon:r1.lon}, r1.t, {lat:r2.lat, lon:r2.lon}, r2.t, vf) : velocity({lat:r1.lat, lon:r1.lon}, r1.t, {lat:r2.lat, lon:r2.lon}, r2.t);
        if (!vf.enabled || v.ok) {
          sogs.push(v.speed_knots);
          if (v.bearing_deg!=null) headings.push(v.bearing_deg);
        }
      }
    }

    // Mean and SD helpers
    function meanStd(a) {
      if (!a.length) return {mean: null, sd: null, max: null};
      const mean = a.reduce((s,v)=>s+v,0)/a.length;
      const sd = Math.sqrt(a.reduce((s,v)=>s+(v-mean)*(v-mean),0)/a.length);
      const max = Math.max(...a);
      return {mean, sd, max};
    }
    const rollStats = meanStd(rolls);
    const pitchStats = meanStd(pitchs);
    const sogStats = meanStd(sogs);
    const headingStats = meanStd(headings);
    html += `<div class="card half unitStats" style="--ucolor:${colorMap[id]};min-width:200px;">
  <div style="font-weight:700;margin-bottom:8px;"><span class="unitTag" style="background:${colorMap[id]}">${window.unitSettings[id]?.name || id}</span></div>
      <div class="grid">
  <div><div class="small">Avg Heel (°)</div><div class="num">${rollStats.mean!==null ? rollStats.mean.toFixed(2)+' ±'+rollStats.sd.toFixed(2)+'°' : '–'}</div></div>
  <div><div class="small">Avg Trim (°)</div><div class="num">${pitchStats.mean!==null ? pitchStats.mean.toFixed(2)+' ±'+pitchStats.sd.toFixed(2)+'°' : '–'}</div></div>
        <div><div class="small">Avg SOG (kt)</div><div class="num">${sogStats.mean!==null ? sogStats.mean.toFixed(2)+' ±'+sogStats.sd.toFixed(2) : '–'}</div></div>
        <div><div class="small">Max SOG (kt)</div><div class="num">${sogStats.max!==null ? sogStats.max.toFixed(2) : '–'}</div></div>
        <div><div class="small">Heading (°)</div><div class="num">${headingStats.mean!==null ? headingStats.mean.toFixed(1)+' ±'+headingStats.sd.toFixed(1)+'°' : '–'}</div></div>
      </div>
    </div>`;
  });
  html += `</div>`;
  const plotW = 900, plotH = 280;
  html += `
  <div class="reports-tiles-grid">
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
  <div style='font-weight:700;margin-bottom:4px;text-align:center;'>Heel Distribution</div>
        <div class="plot"><canvas id="report-kde-roll" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
  <div style='font-weight:700;margin-bottom:4px;text-align:center;'>Heel Frequency Distribution</div>
        <div class="plot"><canvas id="report-kde-freq-roll" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>Position Traces — XY (meters)</div>
        <div class="plot"><canvas id="report-pos-xy" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>Polar Plot: Heading (°) vs SOG (kt)</div>
        <div class="plot"><canvas id="report-polar-heading-sog" width="${Math.round(plotW*0.8)}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
    </div>
  `;
  document.getElementById('reportsContent').innerHTML = html;
  // Draw the distribs and handle show/hide
  setTimeout(() => {
  // Only include shown athletes
  const shownIds = unitIds.filter(id => rec._athleteShow[id]);
  // Group by unit, filtered
  const byUnit = {};
  rec.rows.forEach(r => {
    if (shownIds.includes(r.unit)) {
      if (!byUnit[r.unit]) byUnit[r.unit] = [];
      byUnit[r.unit].push(r);
    }
  });
    // --- Radar chart: Heading bins vs mean SOG ---
    // Bin headings into 12 sectors (30° each)
  const headingBins = Array.from({length: 12}, (_, i) => i * 30);
  // Only label 0, 90, 180, 270 degrees
  const headingLabels = headingBins.map(d => ([0,90,180,270].includes(d) ? `${d}°` : ''));
    const radarDatasets = shownIds.map(unit => {
      const arr = byUnit[unit] || [];
      // Calculate heading and SOG for each segment using velocitySafe() with global config
      const sogs = [];
      const headings = [];
      for (let i = 1; i < arr.length; ++i) {
        const r1 = arr[i-1], r2 = arr[i];
        if (Number.isFinite(r1.lat) && Number.isFinite(r1.lon) && Number.isFinite(r2.lat) && Number.isFinite(r2.lon) && Number.isFinite(r1.t) && Number.isFinite(r2.t)) {
          const vf = getVelocityFilterConfig();
          const v = vf.enabled ? velocitySafe({lat:r1.lat, lon:r1.lon}, r1.t, {lat:r2.lat, lon:r2.lon}, r2.t, vf) : velocity({lat:r1.lat, lon:r1.lon}, r1.t, {lat:r2.lat, lon:r2.lon}, r2.t);
          if (!vf.enabled || v.ok) {
            sogs.push(v.speed_knots);
            if (v.bearing_deg!=null) headings.push(v.bearing_deg);
          }
        }
      }
      // Bin SOG by heading
      const binSums = Array(12).fill(0);
      const binCounts = Array(12).fill(0);
      headings.forEach((h, i) => {
        const bin = Math.floor(h / 30) % 12;
        binSums[bin] += sogs[i];
        binCounts[bin]++;
      });
      const binMeans = binSums.map((sum, i) => binCounts[i] ? sum / binCounts[i] : 0);
      const storedUnit = window.unitSettings?.[unit] || {};
      return {
        label: storedUnit.customName || unit,
        data: binMeans,
        borderColor: colorMap[unit] || COLORS_BASE[0],
        backgroundColor: (colorMap[unit] || COLORS_BASE[0]) + '33',
        pointRadius: 3,
        fill: true,
        tension: 0.2
      };
    });
    // Compute adaptive SOG max for radar chart
    let maxSog = 2;
    radarDatasets.forEach(ds => {
      const dsMax = Math.max(...ds.data);
      if (dsMax > maxSog) maxSog = dsMax;
    });
    // Round up to next even number for nice ticks
    maxSog = Math.ceil(maxSog / 2) * 2;
    // Compute SOG tick values for max 5 labels
    let sogTicks = [0, maxSog];
    if (maxSog > 0) {
      const nTicks = Math.min(5, Math.floor(maxSog / 2) + 1);
      sogTicks = Array.from({length: nTicks}, (_, i) => Math.round(i * maxSog / (nTicks - 1)));
    }
    // Draw radar chart
    const polarEl = document.getElementById('report-polar-heading-sog');
    if (polarEl) {
      if (polarEl._chartjs) { polarEl._chartjs.destroy(); }
      let datasetsToShow = radarDatasets;
      // If no data, show a single empty dataset (transparent)
      if (!radarDatasets.some(ds => ds.data.some(v => v > 0))) {
        datasetsToShow = [{
          label: '',
          data: Array(12).fill(0),
          borderColor: 'rgba(0,0,0,0.08)',
          backgroundColor: 'rgba(0,0,0,0.03)',
          pointRadius: 0,
          fill: true,
          tension: 0.2
        }];
      }
      polarEl._chartjs = new Chart(polarEl.getContext('2d'), {
        type: 'radar',
        data: { labels: headingLabels, datasets: datasetsToShow },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: radarDatasets.some(ds => ds.data.some(v => v > 0)), position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'line', color: '#000' } },
            tooltip: { enabled: radarDatasets.some(ds => ds.data.some(v => v > 0)), callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.formattedValue} kt @ ${ctx.label}` } }
          },
          scales: {
            r: {
              min: 0,
              max: maxSog,
              angleLines: { color: '#e0e0e0' },
              grid: { color: '#e0e0e0' },
              pointLabels: { color: '#000', font: { size: 12 } },
              ticks: {
                color: '#000',
                callback: v => sogTicks.includes(v) ? v : '',
                maxTicksLimit: 5,
                stepSize: undefined
              }
            }
          },
          aspectRatio: 1
        }
      });
    }
    // --- Position traces (XY meters) for all shown athletes ---
    const posEl = document.getElementById('report-pos-xy');
    if (posEl) {
      if (posEl._chartjs) { posEl._chartjs.destroy(); }
      // Collect all valid lat/lon across shown athletes
      const allPts = [];
      shownIds.forEach(unit => {
        const arr = byUnit[unit] || [];
        for (const r of arr) {
          if (Number.isFinite(r.lat) && Number.isFinite(r.lon)) { allPts.push({lat: r.lat, lon: r.lon}); }
        }
      });
      if (allPts.length === 0) {
        // Render an empty chart frame
        // Default empty ranges and nice ticks
        const emptyMin = 0, emptyMax = 10, emptyStep = 5;
        posEl._chartjs = new Chart(posEl.getContext('2d'), {
          type: 'scatter',
          data: { datasets: [] },
          options: { responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { min: emptyMin, max: emptyMax, title: { display: true, text: 'x (m)' }, grid: { color: '#e0e0e0' }, ticks: { stepSize: emptyStep, callback: v => Math.round(Number(v)).toString(), maxRotation: 0, minRotation: 0, autoSkip: false } },
              y: { min: emptyMin, max: emptyMax, title: { display: true, text: 'y (m)' }, grid: { color: '#e0e0e0' }, ticks: { stepSize: emptyStep, callback: v => Math.round(Number(v)).toString(), maxRotation: 0, minRotation: 0, autoSkip: false } }
            }
          }
        });
      } else {
        // Reference origin: first valid point of the latest recording among shown units
        const ref = allPts[0];
        const toXY = (lat, lon) => projLocalMeters(ref.lat, ref.lon, lat, lon);
        // Build datasets per athlete
        const posDatasets = [];
        let xmin=Infinity, xmax=-Infinity, ymin=Infinity, ymax=-Infinity;
        shownIds.forEach(unit => {
          const arr = byUnit[unit] || [];
          const pts = [];
          for (const r of arr) {
            if (Number.isFinite(r.lat) && Number.isFinite(r.lon)) {
              const p = toXY(r.lat, r.lon);
              const x = p.x, y = p.y;
              if (Number.isFinite(x) && Number.isFinite(y)) { pts.push({x, y}); xmin=Math.min(xmin,x); xmax=Math.max(xmax,x); ymin=Math.min(ymin,y); ymax=Math.max(ymax,y); }
            }
          }
          const storedUnit = window.unitSettings?.[unit] || {};
          posDatasets.push({
            type: 'line', label: storedUnit.customName || unit, data: pts,
            parsing: false, borderColor: colorMap[unit] || COLORS_BASE[0], backgroundColor: 'transparent',
            pointRadius: 0, borderWidth: 2, tension: 0.02, showLine: true, spanGaps: true
          });
        });
        // Padding and safe ranges
        if (!isFinite(xmin) || !isFinite(xmax) || !isFinite(ymin) || !isFinite(ymax)) { xmin=-10; xmax=10; ymin=-10; ymax=10; }
        const pad = 5;
        if (xmin===xmax) { xmin-=pad; xmax+=pad; }
        if (ymin===ymax) { ymin-=pad; ymax+=pad; }
        // Center paths in plot with equal axis spans
        const dxRaw = xmax - xmin, dyRaw = ymax - ymin;
        let span = Math.max(dxRaw, dyRaw);
        if (!isFinite(span) || span <= 0) span = 10;
        const xmid = (xmin + xmax) / 2, ymid = (ymin + ymax) / 2;
        xmin = xmid - span/2; xmax = xmid + span/2;
        ymin = ymid - span/2; ymax = ymid + span/2;
        // Compute nice round-number ticks with <= 4 ticks for both axes
        function niceStepForSpan(span, maxTicks){
          const target = span / Math.max(1, (maxTicks - 1));
          const pow = Math.floor(Math.log10(target));
          const base = Math.pow(10, pow);
          const candidates = [1,2,5].map(m=>m*base);
          let step = candidates[0];
          for(const c of candidates){ if(c>=target){ step=c; break; } step=c; }
          step = Math.max(1, step); // at least 1 meter increments
          // if still too many ticks, bump up
          let ticks = Math.floor(span/step)+1;
          while(ticks>4){ step*= (step===1||step===2||step===5)? (step===1?2:(step===2?2.5:2)) : 2; ticks=Math.floor(span/step)+1; }
          return step;
        }
        const maxTicks = 4;
        const step = niceStepForSpan(span, maxTicks);
        // Align min/max to step grid, centered
        const xmid2 = (xmin + xmax) / 2, ymid2 = (ymin + ymax) / 2; // same as xmid/ymid
        const half = (Math.ceil((span/2)/step))*step;
        const xMinTick = Math.round((xmid2 - half)/step)*step;
        const xMaxTick = xMinTick + 2*half;
        const yMinTick = Math.round((ymid2 - half)/step)*step;
        const yMaxTick = yMinTick + 2*half;
        // Create chart
        posEl._chartjs = new Chart(posEl.getContext('2d'), {
          type: 'line',
          data: { datasets: posDatasets },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: {
              legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'line' } },
              tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: x ${ctx.parsed.x.toFixed(1)} m, y ${ctx.parsed.y.toFixed(1)} m` } }
            },
            scales: {
              x: { type: 'linear', min: xMinTick, max: xMaxTick, title: { display: true, text: 'x (m)' }, grid: { color: '#e0e0e0' }, ticks: { stepSize: step, callback: v => Math.round(Number(v)).toString(), maxRotation: 0, minRotation: 0, autoSkip: false } },
              y: { type: 'linear', min: yMinTick, max: yMaxTick, title: { display: true, text: 'y (m)' }, grid: { color: '#e0e0e0' }, ticks: { stepSize: step, callback: v => Math.round(Number(v)).toString(), maxRotation: 0, minRotation: 0, autoSkip: false } }
            }
          }
        });
      }
    }
    // Only include shown athletes
    // Group by unit, filtered
  // (byUnit already declared and populated above)
    // Prepare KDE data for all shown units
  const kdeData = { roll: {}, freqRoll: {} };
    shownIds.forEach(unit => {
      const arr = byUnit[unit] || [];
      const rolls = arr.map(r => r.roll).filter(Number.isFinite);
      const pitchs = arr.map(r => r.pitch).filter(Number.isFinite);
      const times = arr.map(r => r.t).filter(Number.isFinite);
      kdeData.roll[unit] = { data: rolls };
      // Use detectPeaks and freqSamplesFromPeaks as in live
      const minDist = 300, minProm = 5.0;
      const rPeaks = detectPeaks(rolls, times, minDist, minProm);
      kdeData.freqRoll[unit] = { data: freqSamplesFromPeaks(rPeaks) };
    });
    // Compute y max for roll/pitch and freq using KDE smoothing and scaling by 100
    const xsRoll = linspace(DEG_RANGE.min, DEG_RANGE.max, DEG_RANGE.gridCnt);
    const xsFreq = linspace(FREQ_RANGE.min, FREQ_RANGE.max, FREQ_RANGE.gridCnt);
    let rollMax = 0, freqRollMax = 0;
    Object.entries(kdeData.roll).forEach(([unit, d]) => {
      if (d.data && d.data.length) {
        const ys = kdeOnGridLogBackShift(d.data, xsRoll, getKdeFactorAngles(true)).map(y=>y*100);
        rollMax = Math.max(rollMax, ...ys);
      }
    });
    Object.entries(kdeData.freqRoll).forEach(([unit, d]) => {
      if (d.data && d.data.length) {
        const ys = kdeOnGridLogBack(d.data, xsFreq, getKdeFactorFreq()).map(y=>y*100);
        freqRollMax = Math.max(freqRollMax, ...ys);
      }
    });
    const rollPitchMax = Math.max(10, rollMax) * 1.05;
    const freqMax = Math.max(10, freqRollMax) * 1.05;
    // Draw roll and pitch distribs (as before)
  drawKDEMulti('report-kde-roll', kdeData.roll, DEG_RANGE.min, DEG_RANGE.max, DEG_RANGE.gridCnt, getKdeFactorAngles(true), 'Heel (°)', false, colorMap, false, rollPitchMax);
    // Draw freq distribs using the same style as roll/pitch (linear x axis, kde smoothing, AVG line/label logic)
  drawKDEMulti('report-kde-freq-roll', kdeData.freqRoll, FREQ_RANGE.min, FREQ_RANGE.max, FREQ_RANGE.gridCnt, getKdeFactorFreq(), 'Freq (heel)', false, colorMap, false, freqMax);
    // Add event listeners for show/hide buttons
    document.querySelectorAll('#report-athlete-show button[data-athlete]').forEach(btn => {
      btn.onclick = function() {
        const id = btn.getAttribute('data-athlete');
        rec._athleteShow[id] = !rec._athleteShow[id];
        showReportFor(recId);
      };
    });
  }, 50);
}

// make available to other modules
window.generateReportsTabs = generateReportsTabs;
window.showReportFor = showReportFor;