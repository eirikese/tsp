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
  // Build wind text from recorded wind (prefer end, else start). Shows direction and knots if available.
  function fmtWind(w){
    if(!w || !Number.isFinite(w.direction)) return null;
    const dir = Math.round(w.direction);
    const kt = Number.isFinite(w.knots) ? `${w.knots.toFixed(1)} kt` : null;
    return `${dir}°${kt?` • ${kt}`:''}`;
  }
  const windEndStr = fmtWind(rec.windAtEnd);
  const windStartStr = fmtWind(rec.windAtStart);
  const windLabel = (windEndStr || windStartStr)
    ? (windEndStr ? `Wind (end): ${windEndStr}` : `Wind (start): ${windStartStr}`)
    : '';
  // Only consider recorded wind (end/start) for gating the TWA plot
  const hasRecordedWind = (
    rec && (
      (rec.windAtEnd && Number.isFinite(rec.windAtEnd.direction)) ||
      (rec.windAtStart && Number.isFinite(rec.windAtStart.direction))
    )
  );
  let html = `<div class="small" style="margin-bottom:16px;">Recording started: ${started.toLocaleString()}<br>Samples: ${rec.rows.length}${windLabel?` — ${windLabel}`:''}</div>`;
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
    // Compute TWA (True Wind Angle) using recorded wind when available
    let twaStats = { mean: null, sd: null };
    try {
      // Prefer wind saved with recording: use end if set, else start
      const recWindDir = (rec && rec.windAtEnd && Number.isFinite(rec.windAtEnd.direction)) ? rec.windAtEnd.direction
                        : (rec && rec.windAtStart && Number.isFinite(rec.windAtStart.direction)) ? rec.windAtStart.direction
                        : null;
      const liveWindDir = (window.windManual && typeof window.windManual.getActiveWindDirection === 'function')
        ? window.windManual.getActiveWindDirection() : null;
      const wd = Number.isFinite(recWindDir) ? recWindDir : liveWindDir;
      if (Number.isFinite(wd) && headings.length) {
        const angleDiff = (window.windManual && typeof window.windManual.angleDiffDeg === 'function')
          ? window.windManual.angleDiffDeg
          : ((a,b)=>a-b);
        const twas = headings.map(h => angleDiff(wd, h)).filter(Number.isFinite);
        twaStats = meanStd(twas);
      }
    } catch(e) { /* ignore TWA errors */ }
    html += `<div class="card half unitStats" style="--ucolor:${colorMap[id]};min-width:200px;max-width:400px;">
  <div style="font-weight:700;margin-bottom:8px;"><span class="unitTag" style="background:${colorMap[id]}">${window.unitSettings[id]?.name || id}</span></div>
      <div class="grid">
  <div><div class="small">Avg Heel (°)</div><div class="num">${rollStats.mean!==null ? rollStats.mean.toFixed(2)+' ±'+rollStats.sd.toFixed(2)+'°' : '–'}</div></div>
  <div><div class="small">Avg Trim (°)</div><div class="num">${pitchStats.mean!==null ? pitchStats.mean.toFixed(2)+' ±'+pitchStats.sd.toFixed(2)+'°' : '–'}</div></div>
        <div><div class="small">Avg SOG (kt)</div><div class="num">${sogStats.mean!==null ? sogStats.mean.toFixed(2)+' ±'+sogStats.sd.toFixed(2) : '–'}</div></div>
        <div><div class="small">Max SOG (kt)</div><div class="num">${sogStats.max!==null ? sogStats.max.toFixed(2) : '–'}</div></div>
        <div><div class="small">TWA (°)</div><div class="num">${twaStats.mean!==null ? twaStats.mean.toFixed(1)+' ±'+twaStats.sd.toFixed(1)+'°' : '–'}</div></div>
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
      </div>`;
  html += `

      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
  <div style='font-weight:700;margin-bottom:4px;text-align:center;'>Heel Frequency Distribution</div>
        <div class="plot"><canvas id="report-kde-freq-roll" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>Position Traces — XY (meters)</div>
        <div class="plot"><canvas id="report-pos-xy" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      <div class="card grow" style="padding:24px 20px;display:none;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>Polar Plot: Heading (°) vs SOG (kt)</div>
        <div class="plot"><canvas id="report-polar-heading-sog" width="${Math.round(plotW*0.8)}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>SOG Histogram (kt)</div>
        <div class="plot"><canvas id="report-hist-sog" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      ${hasRecordedWind ? `
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>TWA Distribution (°)</div>
        <div class="plot"><canvas id="report-kde-twa" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      ` : ''}
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
        // Render an empty chart frame with 1:1 x/y pixel scaling
        let xmin = -10, xmax = 10, ymin = -10, ymax = 10;
        // Measure canvas size to enforce 1:1 scaling
        let plotBox = posEl.closest && posEl.closest('.plot');
        let cw = plotBox ? plotBox.clientWidth : posEl.clientWidth;
        let ch = plotBox ? plotBox.clientHeight : posEl.clientHeight;
        if (!isFinite(cw) || cw <= 0) cw = 600;
        if (!isFinite(ch) || ch <= 0) ch = 400;
        let xSpan = xmax - xmin, ySpan = ymax - ymin;
        let aspect = cw / ch;
        if (!isFinite(aspect) || aspect <= 0) aspect = 1;
        // Adjust spans to match aspect for 1:1 scaling
        if (aspect > 1) {
          // Wider: expand x
          let newXSpan = ySpan * aspect;
          let xmid = (xmin + xmax) / 2;
          xmin = xmid - newXSpan/2;
          xmax = xmid + newXSpan/2;
        } else if (aspect < 1) {
          // Taller: expand y
          let newYSpan = xSpan / aspect;
          let ymid = (ymin + ymax) / 2;
          ymin = ymid - newYSpan/2;
          ymax = ymid + newYSpan/2;
        }
        posEl._chartjs = new Chart(posEl.getContext('2d'), {
          type: 'scatter',
          data: { datasets: [] },
          options: { responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { min: xmin, max: xmax, title: { display: true, text: 'x (m)' }, grid: { color: '#e0e0e0' }, ticks: { callback: v => Math.round(Number(v)).toString(), maxRotation: 0, minRotation: 0 } },
              y: { min: ymin, max: ymax, title: { display: true, text: 'y (m)' }, grid: { color: '#e0e0e0' }, ticks: { callback: v => Math.round(Number(v)).toString(), maxRotation: 0, minRotation: 0 } }
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
        // Use raw data extents; avoid degenerate zero-span by minimal expansion only when needed
        if (!isFinite(xmin) || !isFinite(xmax) || !isFinite(ymin) || !isFinite(ymax)) { xmin=-10; xmax=10; ymin=-10; ymax=10; }
        if (xmin === xmax) { xmin -= 1; xmax += 1; }
        if (ymin === ymax) { ymin -= 1; ymax += 1; }
        // Add 10% symmetric padding on each axis
        {
          const dx = xmax - xmin; const dy = ymax - ymin;
          const padFrac = 0.10;
          const xpad = dx * padFrac / 2; const ypad = dy * padFrac / 2;
          xmin -= xpad; xmax += xpad;
          ymin -= ypad; ymax += ypad;
        }
        // Measure canvas size to enforce 1:1 x/y pixel scaling
        let plotBox = posEl.closest && posEl.closest('.plot');
        let cw = plotBox ? plotBox.clientWidth : posEl.clientWidth;
        let ch = plotBox ? plotBox.clientHeight : posEl.clientHeight;
        if (!isFinite(cw) || cw <= 0) cw = 600;
        if (!isFinite(ch) || ch <= 0) ch = 400;
        let xSpan = xmax - xmin, ySpan = ymax - ymin;
        let aspect = cw / ch;
        if (!isFinite(aspect) || aspect <= 0) aspect = 1;
        // Adjust spans to match aspect for 1:1 scaling
        if (aspect > 1) {
          // Wider: expand x
          let newXSpan = ySpan * aspect;
          let xmid = (xmin + xmax) / 2;
          xmin = xmid - newXSpan/2;
          xmax = xmid + newXSpan/2;
        } else if (aspect < 1) {
          // Taller: expand y
          let newYSpan = xSpan / aspect;
          let ymid = (ymin + ymax) / 2;
          ymin = ymid - newYSpan/2;
          ymax = ymid + newYSpan/2;
        }
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
              x: { type: 'linear', min: xmin, max: xmax, title: { display: true, text: 'x (m)' }, grid: { color: '#e0e0e0' }, ticks: { callback: v => Math.round(Number(v)).toString(), maxRotation: 0, minRotation: 0 } },
              y: { type: 'linear', min: ymin, max: ymax, title: { display: true, text: 'y (m)' }, grid: { color: '#e0e0e0' }, ticks: { callback: v => Math.round(Number(v)).toString(), maxRotation: 0, minRotation: 0 } }
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
  // Add extra headroom on y-axis for Heel Frequency Distribution so the curve doesn't touch the top
  const freqMax = Math.max(10, freqRollMax) * 1.2;
    // Draw roll and pitch distribs (as before)
  drawKDEMulti('report-kde-roll', kdeData.roll, DEG_RANGE.min, DEG_RANGE.max, DEG_RANGE.gridCnt, getKdeFactorAngles(true), 'Heel (°)', false, colorMap, false, rollPitchMax);
    // Draw freq distribs using the same style as roll/pitch (linear x axis, kde smoothing, AVG line/label logic)
  drawKDEMulti('report-kde-freq-roll', kdeData.freqRoll, FREQ_RANGE.min, FREQ_RANGE.max, FREQ_RANGE.gridCnt, getKdeFactorFreq(), 'Freq (heel)', false, colorMap, false, freqMax);
  // Patch the chart to force x-axis and grid display, and use the same tick callback as live view
  const freqChart = Chart.getChart('report-kde-freq-roll');
  if (freqChart?.options?.scales?.x) {
    freqChart.options.scales.x.display = true;
    freqChart.options.scales.x.grid.display = true;
    freqChart.options.scales.x.grid.drawTicks = true;
    freqChart.options.scales.x.grid.drawOnChartArea = true;
    freqChart.options.scales.x.ticks.display = true;
    freqChart.options.scales.x.ticks.callback = function(value) {
      const allowed = [0.1, 0.5, 1, 2, 5];
      return allowed.includes(value) ? value : '';
    };
    freqChart.update('none');
  }
    // --- TWA Distribution (°) per unit using recorded wind when available ---
    (function(){
      const el = document.getElementById('report-kde-twa');
      // If no recorded wind, skip TWA rendering entirely
      if (!hasRecordedWind) {
        if (el) { const card = el.closest && el.closest('.card'); if (card) card.style.display = 'none'; }
        return;
      }
      if (!el) return;
      if (el._chartjs) { el._chartjs.destroy(); }
      // Build headings per unit once
      const headingsByUnit = {};
      shownIds.forEach(unit => {
        const arr = byUnit[unit] || [];
        const heads = [];
        for (let i = 1; i < arr.length; ++i) {
          const r1 = arr[i-1], r2 = arr[i];
          if (Number.isFinite(r1.lat) && Number.isFinite(r1.lon) && Number.isFinite(r2.lat) && Number.isFinite(r2.lon) && Number.isFinite(r1.t) && Number.isFinite(r2.t)) {
            const vf = getVelocityFilterConfig();
            const v = vf.enabled ? velocitySafe({lat:r1.lat, lon:r1.lon}, r1.t, {lat:r2.lat, lon:r2.lon}, r2.t, vf) : velocity({lat:r1.lat, lon:r1.lon}, r1.t, {lat:r2.lat, lon:r2.lon}, r2.t);
            if (!vf.enabled || v.ok) {
              if (v.bearing_deg!=null) heads.push(v.bearing_deg);
            }
          }
        }
        headingsByUnit[unit] = heads;
      });
      // Determine wind direction to use (only recorded end, then start; no live fallback)
      const recWindDir = (rec && rec.windAtEnd && Number.isFinite(rec.windAtEnd.direction)) ? rec.windAtEnd.direction
                        : (rec && rec.windAtStart && Number.isFinite(rec.windAtStart.direction)) ? rec.windAtStart.direction
                        : null;
      const wd = Number.isFinite(recWindDir) ? recWindDir : null;
      if (!Number.isFinite(wd)) {
        const card = el.closest && el.closest('.card'); if (card) card.style.display = 'none';
        return;
      }
      const angleDiff = (window.windManual && typeof window.windManual.angleDiffDeg === 'function')
        ? window.windManual.angleDiffDeg : ((a,b)=>a-b);
      // Assemble TWA arrays by unit
      const kdeTwa = {};
      let twaMax = 0;
  const xsTWA = linspace(-180, 180, DEG_RANGE.gridCnt);
      shownIds.forEach(unit => {
        const heads = headingsByUnit[unit] || [];
        const twas = (Number.isFinite(wd) ? heads.map(h => angleDiff(wd, h)) : [] ).filter(Number.isFinite);
        kdeTwa[unit] = { data: twas };
      });
      // Let Chart.js auto-scale Y for TWA (no shared/custom yMax)
      Object.entries(kdeTwa).forEach(([unit, d]) => { /* no-op: keep per-chart autoscale */ });
      drawKDEMulti('report-kde-twa', kdeTwa, -180, 180, DEG_RANGE.gridCnt, getKdeFactorAngles(true), 'TWA (°)', false, colorMap, false, undefined);
    })();
    // --- SOG Histogram (smoothed line via KDE on positive speeds) ---
    (function(){
      const el = document.getElementById('report-hist-sog');
      if (!el) return;
      if (el._chartjs) { el._chartjs.destroy(); }
      // Build SOG arrays per unit
      const kdeData = {};
      let globalMax = 0;
      shownIds.forEach(unit => {
        const arr = byUnit[unit] || [];
        const sogs = [];
        for (let i=1; i<arr.length; i++){
          const r1 = arr[i-1], r2 = arr[i];
          if (Number.isFinite(r1.lat)&&Number.isFinite(r1.lon)&&Number.isFinite(r2.lat)&&Number.isFinite(r2.lon)&&Number.isFinite(r1.t)&&Number.isFinite(r2.t)){
            const vf = getVelocityFilterConfig();
            const v = vf.enabled ? velocitySafe({lat:r1.lat, lon:r1.lon}, r1.t, {lat:r2.lat, lon:r2.lon}, r2.t, vf)
                                 : velocity({lat:r1.lat, lon:r1.lon}, r1.t, {lat:r2.lat, lon:r2.lon}, r2.t);
            if (!vf.enabled || v.ok) {
              if (Number.isFinite(v.speed_knots) && v.speed_knots>0) {
                sogs.push(v.speed_knots);
                if (v.speed_knots > globalMax) globalMax = v.speed_knots;
              }
            }
          }
        }
        kdeData[unit] = { data: sogs };
      });
      const totalPoints = Object.values(kdeData).reduce((s, o) => s + ((o?.data?.length)||0), 0);
      let maxS = Math.max(2, globalMax);
      maxS = Math.ceil(maxS/2)*2; // round up to even
      // Compute y max for consistent scaling
      const xs = linspace(0.01, maxS, 160);
      let sogYMax = 0;
      Object.entries(kdeData).forEach(([unit, d]) => {
        if (d.data && d.data.length){
          const ys = kdeOnGridLogBack(d.data, xs, (typeof getKdeFactorFreq==='function' ? getKdeFactorFreq() : 0.3)).map(y=>y*100);
          sogYMax = Math.max(sogYMax, ...ys);
        }
      });
      sogYMax = Math.max(10, sogYMax) * 1.05;
      // Draw using existing KDE multi renderer (log-KDE, linear x-axis)
      drawKDEMulti('report-hist-sog', kdeData, 0.01, maxS, 160, (typeof getKdeFactorFreq==='function' ? getKdeFactorFreq() : 0.3), 'SOG (kt)', true, colorMap, false, sogYMax);
    })();
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