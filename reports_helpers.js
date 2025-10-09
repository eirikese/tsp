// Generate Reports tab subtabs and content
function generateReportsTabs() {
  const tabsEl = document.getElementById('reportSelectButtons');
  const metaEl = document.getElementById('reportSelectMeta');
  const contentEl = document.getElementById('reportsMain');
  const actionsEl = document.getElementById('reportsActions');
  if (!tabsEl || !contentEl) return;
  tabsEl.innerHTML = '';
  if (metaEl) metaEl.innerHTML = '';
  contentEl.innerHTML = '';
  if (actionsEl) actionsEl.innerHTML = '';
  // Remove any lingering athlete chooser (legacy inline) or modal
  const _oldChooser = document.getElementById('singleAthleteChooser');
  if (_oldChooser && _oldChooser.parentElement) { try { _oldChooser.remove(); } catch{} }
  closeAthleteModal();

  // Ensure single-athlete mode state container
  if (!window._singleAthleteMode) window._singleAthleteMode = { active: false, athleteId: null, selected: [] };

  // Prepare Import CSV controls
  const _importFileInput = document.createElement('input');
  _importFileInput.type = 'file';
  _importFileInput.accept = '.csv,text/csv';
  _importFileInput.style.display = 'none';
  _importFileInput.addEventListener('change', async (e) => {
    try{
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const rec = parseCsvTextToRecording(text, file.name);
      if (!rec || !rec.rows || rec.rows.length === 0) {
        contentEl.innerHTML = '<div class="small">Import failed or contained no samples.</div>';
        return;
      }
      allRecordings.push(rec);
      if (typeof saveRecordingsToStorage === 'function') saveRecordingsToStorage();
      generateReportsTabs();
      if (rec && rec.id) setTimeout(()=>{ try{ showReportFor(rec.id); }catch{} }, 0);
    }catch(err){
      console.warn('CSV import failed:', err);
      contentEl.innerHTML = '<div class="small">CSV import failed.</div>';
    } finally {
      e.target.value = '';
    }
  });
  (actionsEl || tabsEl).appendChild(_importFileInput);
  const _importBtn = document.createElement('button');
  _importBtn.textContent = 'Import CSV';
  _importBtn.className = 'small';
  _importBtn.onclick = () => _importFileInput.click();

  // Build actions row (top)
  if (actionsEl) {
    // Delete Selected
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete Selected Report';
    delBtn.className = 'small';
    delBtn.onclick = function() {
      const activeBtn = tabsEl.querySelector('.tabbtn.active');
      if (!activeBtn) return;
      const recId = activeBtn.dataset.recId;
      const idx = allRecordings.findIndex(r => r.id === recId);
      if (idx !== -1 && confirm('Delete this report?')) {
        allRecordings.splice(idx, 1);
        saveRecordingsToStorage();
        generateReportsTabs();
      }
    };
    actionsEl.appendChild(delBtn);

    // Rename Selected
    const renBtn = document.createElement('button');
    renBtn.textContent = 'Rename Selected Report';
    renBtn.className = 'small';
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
    actionsEl.appendChild(renBtn);

    // Download CSV (selected)
    const dlSelectedBtn = document.createElement('button');
    dlSelectedBtn.textContent = 'Download CSV (selected)';
    dlSelectedBtn.className = 'small';
    dlSelectedBtn.onclick = function(){
      const activeBtn = tabsEl.querySelector('.tabbtn.active');
      if(!activeBtn) return; const recId = activeBtn.dataset.recId;
      const rec = allRecordings.find(r=>r.id===recId); if(!rec) return;
      try{ const csv = buildCsvForRecording(rec); triggerCsvDownload(csv, makeCsvFilename(rec)); }catch(e){ console.warn('CSV build failed', e); }
    };
    actionsEl.appendChild(dlSelectedBtn);

    // Download CSV (all)
    const dlAllBtn = document.createElement('button');
    dlAllBtn.textContent = 'Download CSV (all)';
    dlAllBtn.className = 'small';
    dlAllBtn.title = 'Downloads each CSV separately. Your browser may ask to allow multiple downloads.';
    dlAllBtn.onclick = function(){
      if(!Array.isArray(allRecordings) || allRecordings.length===0) return;
      let i = 0;
      const next = () => {
        if (i >= allRecordings.length) return;
        try{
          const rec = allRecordings[i];
          const csv = buildCsvForRecording(rec);
          const fname = makeCsvFilename(rec);
          triggerCsvDownload(csv, fname);
        }catch(e){ console.warn('CSV download failed', e); }
        i++;
        setTimeout(next, 250);
      };
      next();
    };
    actionsEl.appendChild(dlAllBtn);

    // Import CSV
    actionsEl.appendChild(_importBtn);

    // Single athlete selection or exit
    const isSingle = !!window._singleAthleteMode.active;
    if (!isSingle) {
      const singleBtn = document.createElement('button');
      singleBtn.textContent = 'Select single athlete';
      singleBtn.className = 'small';
  singleBtn.onclick = () => openAthleteModal();
      actionsEl.appendChild(singleBtn);
    } else {
      const exitBtn = document.createElement('button');
      exitBtn.textContent = 'Exit single athlete';
      exitBtn.className = 'small';
      // Style as blue primary
      exitBtn.style.background = 'var(--accent)';
      exitBtn.style.borderColor = 'var(--accent)';
      exitBtn.style.color = '#fff';
      exitBtn.onclick = () => {
        window._singleAthleteMode = { active:false, athleteId:null, selected:[] };
        closeAthleteModal();
        generateReportsTabs();
      };
      actionsEl.appendChild(exitBtn);
      const who = document.createElement('span');
      who.className = 'small';
      who.style.marginLeft = '8px';
      who.textContent = `Athlete: ${getAthleteDisplayName(window._singleAthleteMode.athleteId)}`;
      actionsEl.appendChild(who);
    }
  }

  if (allRecordings.length === 0) {
    // Still show Tools (Import CSV, etc.). Tabs/meta remain empty.
    if (contentEl) contentEl.innerHTML = '<div class="small">No recordings yet. Use "Import CSV" to load a past session or finish a recording to see reports.</div>';
    return;
  }

  if (window._singleAthleteMode.active && window._singleAthleteMode.athleteId) {
    // Replace Select Report tile contents with single-athlete checkbox selection
    const tile = document.getElementById('reportSelectTile');
    const meta = document.getElementById('reportSelectMeta');
    const sh = document.getElementById('report-athlete-show');
    if (tabsEl) tabsEl.style.display = 'none';
    if (meta) meta.style.display = 'none';
    if (sh) sh.style.display = 'none';
    if (tile) {
      // Clear or create container
      let sat = document.getElementById('singleAthleteTile');
      if (!sat) { sat = document.createElement('div'); sat.id = 'singleAthleteTile'; tile.appendChild(sat); }
      sat.innerHTML = '';
      const athleteId = window._singleAthleteMode.athleteId;
      const athleteName = getAthleteDisplayName(athleteId);
      const title = document.createElement('div');
      title.style.fontWeight = '700';
      title.style.marginBottom = '8px';
      title.textContent = `Single Athlete: ${athleteName}`;
      sat.appendChild(title);
      // Build list of recordings containing this athlete
      const candidateRecs = allRecordings.filter(rec => (rec.rows||[]).some(r => r.unit === athleteId));
      let selectedSet = new Set(Array.isArray(window._singleAthleteMode.selected) ? window._singleAthleteMode.selected : []);
      if (selectedSet.size === 0 && candidateRecs.length) selectedSet = new Set([candidateRecs[candidateRecs.length-1].id]);
      window._singleAthleteMode.selected = Array.from(selectedSet);
      const checks = document.createElement('div');
      checks.style.display = 'flex'; checks.style.flexWrap = 'wrap'; checks.style.gap = '12px';
      candidateRecs.forEach((rec, idx) => {
        const id = rec.id;
        const label = rec.label && rec.label.trim() ? rec.label : (rec.startedAt? new Date(rec.startedAt).toLocaleTimeString() : `Recording ${idx+1}`);
        const lab = document.createElement('label'); lab.style.display = 'flex'; lab.style.alignItems = 'center'; lab.style.gap = '6px';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selectedSet.has(id);
        cb.onchange = () => { if (cb.checked) selectedSet.add(id); else selectedSet.delete(id); window._singleAthleteMode.selected = Array.from(selectedSet); renderSingleAthleteCharts(athleteId, Array.from(selectedSet)); };
        const span = document.createElement('span'); span.textContent = label;
        lab.appendChild(cb); lab.appendChild(span); checks.appendChild(lab);
      });
      sat.appendChild(checks);
    }
    // Prepare reportsMain for charts
    if (contentEl) {
      contentEl.innerHTML = '<div id="singleAthleteCharts"></div>';
      renderSingleAthleteCharts(window._singleAthleteMode.athleteId, window._singleAthleteMode.selected);
    }
    return;
  } else {
    // Ensure select tile restored (show elements and remove singleAthleteTile if present)
    const meta = document.getElementById('reportSelectMeta');
    const sh = document.getElementById('report-athlete-show');
    const sat = document.getElementById('singleAthleteTile'); if (sat && sat.parentElement) { try{ sat.remove(); }catch{} }
    if (tabsEl) tabsEl.style.display = '';
    if (meta) meta.style.display = '';
    if (sh) sh.style.display = '';
  }

  tabsEl.style.display = '';
  allRecordings.forEach((rec, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tabbtn' + (idx === allRecordings.length-1 ? ' active' : '');
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
  showReportFor(allRecordings[allRecordings.length-1].id);
}

function parseCsvTextToRecording(csvText, fileName='import.csv'){
  if (!csvText || typeof csvText !== 'string') return null;
  const lines = csvText.replace(/\r\n?/g, '\n').split('\n').filter(l=>l.trim().length>0);
  if (lines.length === 0) return null;
  // parsing continues...
  // Detect header row (first line containing core column names)
  let headerLineIndex = lines.findIndex(l => {
    const ll = l.toLowerCase();
    return ll.includes('timestamp_ms') || ll.includes('iso_time') || ll.includes('elapsed_s');
  });
  if (headerLineIndex < 0) headerLineIndex = 0;
  const header = lines[headerLineIndex].split(',').map(h => h.trim().toLowerCase());
  function idx(names){
    if (!Array.isArray(names)) names = [names];
    for (const n of names){
      const k = String(n).trim().toLowerCase();
      const i = header.indexOf(k);
      if (i !== -1) return i;
    }
    return -1;
  }
  // Column indices (support a few aliases for robustness)
  const cUnit = idx(['unit_id','unit','unitid']);
  const cAthlete = idx(['athlete','athlete_name']);
  const cTsMs = idx(['timestamp_ms','ts_ms','time_ms']);
  const cIso = idx(['iso_time','iso','time_iso']);
  const cSeq = idx(['seq','sequence']);
  const cRoll = idx(['roll_deg','roll']);
  const cPitch = idx(['pitch_deg','pitch']);
  const cLat = idx(['lat','latitude']);
  const cLon = idx(['lon','lng','longitude']);
  const cGnssMs = idx(['gnss_ms']);
  const cGnssIso = idx(['gnss_iso']);
  const cAx = idx(['ax']);
  const cAy = idx(['ay']);
  const cAz = idx(['az']);
  const cSogMps = idx(['sog_mps','sog']);
  const cHdgDeg = idx(['heading_deg','hdg_deg','heading']);

  // Metadata defaults
  let topMark = null;
  let startLine = null;
  let windAtStart = null;
  let windAtEnd = null;

  function parseNum(s){
    if (s==null) return null;
    const t = String(s).trim();
    if (t==='') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  function parseTimeMs(cells){
    const tms = (cTsMs!==-1) ? parseNum(cells[cTsMs]) : null;
    if (Number.isFinite(tms)) return tms;
    if (cIso!==-1) {
      const iso = (cells[cIso]||'').replace(/^"|"$/g,'');
      const ms = Date.parse(iso);
      if (Number.isFinite(ms)) return ms;
    }
    return null;
  }

  const rows = [];
  for (let i=headerLineIndex+1; i<lines.length; i++){
    const line = lines[i].trim();
    if (!line) continue;
    const firstCell = line.split(',')[0].trim().toLowerCase();
    // Metadata lines as produced by this app's exporter
    if (firstCell === 'top_mark'){
      const parts = line.split(',');
      const lat = parseNum(parts[1]);
      const lon = parseNum(parts[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) topMark = { lat, lon };
      continue;
    }
    if (firstCell === 'start_pt1' || firstCell === 'start_pt2'){
      const parts = line.split(',');
      const lat = parseNum(parts[1]);
      const lon = parseNum(parts[2]);
      if (!startLine) startLine = { a:null, b:null };
      if (Number.isFinite(lat) && Number.isFinite(lon)){
        if (firstCell === 'start_pt1') startLine.a = { lat, lon };
        else startLine.b = { lat, lon };
      }
      continue;
    }
    if (firstCell === 'wind_start' || firstCell === 'wind_end'){
      const parts = line.split(',');
      const direction = parseNum(parts[1]);
      const knots = parseNum(parts[2]);
      const w = Number.isFinite(direction) ? { direction, knots: Number.isFinite(knots)?knots:null } : null;
      if (firstCell === 'wind_start') windAtStart = w;
      else windAtEnd = w;
      continue;
    }

  // Data rows
    const cells = line.split(',');
    const unit = (cUnit!==-1 ? (cells[cUnit]||'').trim() : (cAthlete!==-1 ? (cells[cAthlete]||'').trim() : 'unknown')) || 'unknown';
    const t = parseTimeMs(cells);
    const seq = (cSeq!==-1 ? (cells[cSeq]||'') : '');
    const roll = parseNum(cells[cRoll]);
    const pitch = parseNum(cells[cPitch]);
    const lat = parseNum(cells[cLat]);
    const lon = parseNum(cells[cLon]);
    const gnss_ms = (cGnssMs!==-1 ? parseNum(cells[cGnssMs]) : null);
    const gnss_iso = (cGnssIso!==-1 ? (cells[cGnssIso]||'').replace(/^"|"$/g,'') : '');
  const ax = (cAx!==-1 ? parseNum(cells[cAx]) : null);
  const ay = (cAy!==-1 ? parseNum(cells[cAy]) : null);
  const az = (cAz!==-1 ? parseNum(cells[cAz]) : null);
  const sog_mps = (cSogMps!==-1 ? parseNum(cells[cSogMps]) : null);
  const heading_deg = (cHdgDeg!==-1 ? parseNum(cells[cHdgDeg]) : null);
    // Only include rows with at least time and one of roll/pitch or lat/lon
    if (!Number.isFinite(t)) continue;
    const hasAngles = Number.isFinite(roll) || Number.isFinite(pitch);
    const hasFix = Number.isFinite(lat) && Number.isFinite(lon);
    if (!hasAngles && !hasFix) continue;
  rows.push({ unit, t, seq, roll: Number.isFinite(roll)?roll:null, pitch: Number.isFinite(pitch)?pitch:null, lat: Number.isFinite(lat)?lat:null, lon: Number.isFinite(lon)?lon:null, gnss_ms, gnss_iso, ax, ay, az, sog_mps: Number.isFinite(sog_mps)?sog_mps:null, heading_deg: Number.isFinite(heading_deg)?heading_deg:null });
  }

  if (!rows.length) return null;
  // Derive startedAt as min t
  let startedAt = rows[0].t;
  for (const r of rows) if (Number.isFinite(r.t) && r.t < startedAt) startedAt = r.t;
  // Compose id and label from file name if available
  const baseLabel = (fileName||'').replace(/\.[^/.]+$/, '');
  const id = `import-${Date.now()}`;
  const rec = { id, startedAt, rows, topMark, startLine, windAtStart, windAtEnd, label: baseLabel };
  return rec;
}

function showReportFor(recId) {
  const rec = allRecordings.find(r => r.id === recId);
  if (!rec) return;
  // Highlight active subtab
  document.querySelectorAll('#reportSelectButtons .tabbtn').forEach(btn => {
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
  // Update meta tile with started/samples and wind
  const metaEl = document.getElementById('reportSelectMeta');
  if (metaEl) metaEl.innerHTML = `Recording started: ${started.toLocaleString()}<br>Samples: ${rec.rows.length}${windLabel?` — ${windLabel}`:''}`;
  let html = ``;
  // Render show/hide athlete buttons in the Select Report tile
  const shEl = document.getElementById('report-athlete-show');
  if (shEl) {
    shEl.innerHTML = '';
    unitIds.forEach(id => {
      const btn = document.createElement('button');
      btn.className = 'small';
      btn.setAttribute('data-athlete', id);
      const color = colorMap[id];
      const isShown = !!rec._athleteShow[id];
      btn.textContent = `${isShown ? 'Hide' : 'Show'} ${window.unitSettings[id]?.name || id}`;
      btn.style.background = isShown ? color : '#eee';
      btn.style.color = isShown ? '#fff' : '#333';
      btn.style.borderRadius = '6px';
      btn.style.padding = '2px 10px';
      btn.style.minWidth = '60px';
      btn.style.cursor = 'pointer';
      btn.onclick = () => {
        rec._athleteShow[id] = !rec._athleteShow[id];
        showReportFor(recId);
      };
      shEl.appendChild(btn);
    });
  }
  // Stats tiles, one per athlete, only if shown
  html += `<div id="report-athlete-stats" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">`;
  // Use device-provided SOG/Heading (recorded), not distance-derived

  unitIds.forEach(id => {
    if (!rec._athleteShow[id]) return;
    // Compute stats for this athlete
    const arr = byUnit[id] || [];
    const rolls = arr.map(r => r.roll).filter(Number.isFinite);
    const pitchs = arr.map(r => r.pitch).filter(Number.isFinite);

    // Collect SOG/Heading from recording rows when available
    const sogs = [];
    const headings = [];
    for (let i = 0; i < arr.length; ++i) {
      const r = arr[i];
      const sog_mps = (typeof r.sog_mps === 'number') ? r.sog_mps : null;
      const hdg = (typeof r.heading_deg === 'number') ? r.heading_deg : null;
      if (sog_mps != null && Number.isFinite(sog_mps)) sogs.push(sog_mps * (window.KNOTS_PER_MPS || 1.94384449));
      if (hdg != null && Number.isFinite(hdg)) headings.push(hdg);
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
        <div><div class="small">Avg Heel (°)</div><div class="num">${rollStats.mean!==null ? rollStats.mean.toFixed(1)+' ±'+rollStats.sd.toFixed(1)+'°' : '–'}</div></div>
        <div><div class="small">Avg Trim (°)</div><div class="num">${pitchStats.mean!==null ? pitchStats.mean.toFixed(1)+' ±'+pitchStats.sd.toFixed(1)+'°' : '–'}</div></div>
        <div><div class="small">Avg SOG (kt)</div><div class="num">${sogStats.mean!==null ? sogStats.mean.toFixed(1)+' ±'+sogStats.sd.toFixed(1) : '–'}</div></div>
        <div><div class="small">Max SOG (kt)</div><div class="num">${sogStats.max!==null ? sogStats.max.toFixed(1) : '–'}</div></div>
        <div><div class="small">TWA (°)</div><div class="num">${twaStats.mean!==null ? twaStats.mean.toFixed(1)+' ±'+twaStats.sd.toFixed(1)+'°' : '–'}</div></div>
        <div><div class="small">Heading (°)</div><div class="num">${headingStats.mean!==null ? headingStats.mean.toFixed(1)+' ±'+headingStats.sd.toFixed(1)+'°' : '–'}</div></div>
      </div>
    </div>`;
  });
  html += `</div>`;
  const plotW = 900, plotH = 200;
  // Prepare data presence checks
  // Check for SOG data (at least one SOG value for any shown athlete)
  let hasSogData = false;
  let hasMapData = false;
  {
    const shownIds = unitIds.filter(id => rec._athleteShow[id]);
    const byUnit = {};
    rec.rows.forEach(r => {
      if (shownIds.includes(r.unit)) {
        if (!byUnit[r.unit]) byUnit[r.unit] = [];
        byUnit[r.unit].push(r);
      }
    });
    // SOG data check (prefer device SOG field)
    for (const unit of shownIds) {
      const arr = byUnit[unit] || [];
      for (let i = 0; i < arr.length; ++i) {
        const r = arr[i];
        if (typeof r.sog_mps === 'number' && Number.isFinite(r.sog_mps) && r.sog_mps > 0) { hasSogData = true; break; }
      }
      if (hasSogData) break;
    }
    // Map data check (at least two valid lat/lon points for any shown athlete)
    for (const unit of shownIds) {
      const arr = byUnit[unit] || [];
      let validPoints = 0;
      for (const r of arr) {
        if (Number.isFinite(r.lat) && Number.isFinite(r.lon)) validPoints++;
        if (validPoints >= 2) {
          hasMapData = true;
          break;
        }
      }
      if (hasMapData) break;
    }
  }
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
      ${hasMapData ? `
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>Position Traces — XY (meters)</div>
        <div class="plot"><canvas id="report-pos-xy" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      ` : ''}
      <div class="card grow" style="padding:24px 20px;display:none;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>Polar Plot: Heading (°) vs SOG (kt)</div>
        <div class="plot"><canvas id="report-polar-heading-sog" width="${Math.round(plotW*0.8)}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      ${hasSogData ? `
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>SOG Histogram (kt)</div>
        <div class="plot"><canvas id="report-hist-sog" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      ` : ''}
      ${hasRecordedWind ? `
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>TWA Distribution (°)</div>
        <div class="plot"><canvas id="report-kde-twa" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      ` : ''}
    </div>
  `;
  document.getElementById('reportsMain').innerHTML = html;
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
      // Pull heading and SOG from rows (device-provided)
      const sogs = [];
      const headings = [];
      for (let i = 0; i < arr.length; ++i) {
        const r = arr[i];
        if (typeof r.sog_mps === 'number' && Number.isFinite(r.sog_mps)) sogs.push(r.sog_mps * (window.KNOTS_PER_MPS || 1.94384449));
        if (typeof r.heading_deg === 'number' && Number.isFinite(r.heading_deg)) headings.push(r.heading_deg);
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
    freqChart.options.scales.x.ticks.maxRotation = 0;
    freqChart.options.scales.x.ticks.minRotation = 0;
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
        const heads = arr.map(r => (typeof r.heading_deg === 'number' ? r.heading_deg : null)).filter(Number.isFinite);
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
        for (let i=0; i<arr.length; i++){
          const r = arr[i];
          if (typeof r.sog_mps === 'number' && Number.isFinite(r.sog_mps) && r.sog_mps > 0) {
            const kt = r.sog_mps * (window.KNOTS_PER_MPS || 1.94384449);
            sogs.push(kt);
            if (kt > globalMax) globalMax = kt;
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

// ---------- Single Athlete Mode ----------
function getAthleteDisplayName(unitId){
  if (!unitId) return 'Unknown';
  window.unitSettings = JSON.parse(localStorage.getItem('unitColors') || '{}');
  const u = window.unitSettings[unitId];
  return (u && (u.name || u.customName)) ? (u.name || u.customName) : unitId;
}

// ---- Modal helpers for athlete chooser ----
function openAthleteModal(){
  // If already open, do nothing
  if (document.getElementById('athleteModalOverlay')) return;
  // Build unique list of athletes across all recordings
  const set = new Set();
  allRecordings.forEach(rec => { (rec.rows||[]).forEach(r => { if (r && r.unit) set.add(r.unit); }); });
  const ids = Array.from(set);
  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'athleteModalOverlay';
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) closeAthleteModal(); });
  // Dialog
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.setAttribute('role','dialog');
  dialog.setAttribute('aria-modal','true');
  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('div'); title.textContent = 'Select athlete'; title.className = 'modal-title';
  const closeBtn = document.createElement('button'); closeBtn.className = 'modal-close'; closeBtn.innerHTML = '✕'; closeBtn.onclick = closeAthleteModal;
  header.appendChild(title); header.appendChild(closeBtn);
  // Content list
  const content = document.createElement('div'); content.className = 'modal-content';
  const withNames = ids.map(id => ({id, name: getAthleteDisplayName(id)})).sort((a,b)=>a.name.localeCompare(b.name));
  if (withNames.length === 0) {
    const empty = document.createElement('div'); empty.className = 'small'; empty.textContent = 'No athletes available in current recordings.'; content.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'modal-list';
    withNames.forEach(({id, name}) => {
      const b = document.createElement('button');
      b.className = 'modal-item'; b.textContent = name; b.title = id;
      b.onclick = () => {
        const recs = allRecordings.filter(rec => (rec.rows||[]).some(r => r.unit === id));
        const defaultSel = recs.length ? [recs[recs.length-1].id] : [];
        window._singleAthleteMode = { active: true, athleteId: id, selected: defaultSel };
        closeAthleteModal();
        generateReportsTabs();
      };
      list.appendChild(b);
    });
    content.appendChild(list);
  }
  dialog.appendChild(header); dialog.appendChild(content);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  // Focus first item if exists
  setTimeout(()=>{
    const first = overlay.querySelector('.modal-item'); if (first) first.focus();
  }, 0);
}

function closeAthleteModal(){
  const overlay = document.getElementById('athleteModalOverlay');
  if (overlay && overlay.parentElement) { try { overlay.remove(); } catch{} }
}

function renderSingleAthleteView(contentEl, athleteId, selected){
  // Build recordings list UI with checkboxes for those containing the athlete
  const candidateRecs = allRecordings.filter(rec => (rec.rows||[]).some(r => r.unit === athleteId));
  let selectedSet = new Set(Array.isArray(selected) ? selected : []);
  if (selectedSet.size === 0 && candidateRecs.length) selectedSet = new Set([candidateRecs[candidateRecs.length-1].id]);
  window._singleAthleteMode.selected = Array.from(selectedSet);
  const hdr = document.createElement('div');
  hdr.className = 'card';
  hdr.style.marginBottom = '12px';
  hdr.style.padding = '12px 16px';
  const athleteName = getAthleteDisplayName(athleteId);
  hdr.innerHTML = `<div style="font-weight:700;margin-bottom:8px;">Single Athlete: ${athleteName}</div>`;
  const checks = document.createElement('div');
  checks.style.display = 'flex'; checks.style.flexWrap = 'wrap'; checks.style.gap = '12px';
  candidateRecs.forEach((rec, idx) => {
    const id = rec.id;
    const label = rec.label && rec.label.trim() ? rec.label : (rec.startedAt? new Date(rec.startedAt).toLocaleTimeString() : `Recording ${idx+1}`);
    const lab = document.createElement('label'); lab.style.display = 'flex'; lab.style.alignItems = 'center'; lab.style.gap = '6px';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selectedSet.has(id);
    cb.onchange = () => { if (cb.checked) selectedSet.add(id); else selectedSet.delete(id); window._singleAthleteMode.selected = Array.from(selectedSet); renderSingleAthleteCharts(athleteId, Array.from(selectedSet)); };
    const span = document.createElement('span'); span.textContent = label;
    lab.appendChild(cb); lab.appendChild(span); checks.appendChild(lab);
  });
  hdr.appendChild(checks);
  contentEl.appendChild(hdr);
  // charts container
  const charts = document.createElement('div'); charts.id = 'singleAthleteCharts'; contentEl.appendChild(charts);
  renderSingleAthleteCharts(athleteId, Array.from(selectedSet));
}

function renderSingleAthleteCharts(athleteId, recIds){
  const container = document.getElementById('singleAthleteCharts'); if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(recIds) || recIds.length === 0) { container.innerHTML = '<div class="small">Select one or more recordings to compare.</div>'; return; }
  // Build filtered rows per recording
  const byRec = {};
  // Persist stable colors per recording (per athlete) across reselection
  if (!window._singleAthleteMode) window._singleAthleteMode = {};
  if (!window._singleAthleteMode.colorMap) window._singleAthleteMode.colorMap = {};
  if (!window._singleAthleteMode.colorMap[athleteId]) window._singleAthleteMode.colorMap[athleteId] = {};
  const savedColors = window._singleAthleteMode.colorMap[athleteId];
  const colorMap = {};
  const cols = (typeof COLORS_BASE !== 'undefined' ? COLORS_BASE : ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf']);
  const used = new Set(Object.values(savedColors));
  recIds.forEach((rid) => {
    const rec = allRecordings.find(r => r.id === rid); if (!rec) return;
    byRec[rid] = (rec.rows||[]).filter(r => r.unit === athleteId);
    // Assign stable color if not already assigned for this athlete+recording
    if (!savedColors[rid]) {
      // Prefer a not-yet-used palette color
      let chosen = cols.find(c => !used.has(c));
      if (!chosen) {
        // Fall back: deterministic pick based on current map size
        const idx = Object.keys(savedColors).length % cols.length;
        chosen = cols[idx];
      }
      savedColors[rid] = chosen;
      used.add(chosen);
    }
    colorMap[rid] = savedColors[rid];
  });
  const plotW = 900, plotH = 200;
  // Build HTML structure similar to normal report
  let html = `
    <div class="reports-tiles-grid">
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>Heel Distribution — ${getAthleteDisplayName(athleteId)}</div>
        <div class="plot"><canvas id="sa-kde-roll" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>Heel Frequency Distribution — ${getAthleteDisplayName(athleteId)}</div>
        <div class="plot"><canvas id="sa-kde-freq-roll" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>SOG Histogram (kt) — ${getAthleteDisplayName(athleteId)}</div>
        <div class="plot"><canvas id="sa-hist-sog" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
      <div class="card grow" style="padding:24px 20px;display:flex;flex-direction:column;gap:12px;min-height:${plotH+60}px;">
        <div style='font-weight:700;margin-bottom:4px;text-align:center;'>TWA Distribution (°) — ${getAthleteDisplayName(athleteId)}</div>
        <div class="plot"><canvas id="sa-kde-twa" width="${plotW}" height="${plotH}" style="width:100%;height:100%;max-width:100%;max-height:100%;"></canvas></div>
      </div>
    </div>`;
  container.innerHTML = html;
  // Prepare KDE data
  const xsRoll = linspace(DEG_RANGE.min, DEG_RANGE.max, DEG_RANGE.gridCnt);
  const xsFreq = linspace(FREQ_RANGE.min, FREQ_RANGE.max, FREQ_RANGE.gridCnt);
  // Helper to produce recording label like normal tabs
  function recLabel(rid){
    const rec = allRecordings.find(r => r.id === rid); if (!rec) return rid;
    if (rec.label && rec.label.trim()) return rec.label;
    if (rec.startedAt) {
      const d = new Date(rec.startedAt);
      const h = String(d.getHours()).padStart(2,'0');
      const m = String(d.getMinutes()).padStart(2,'0');
      const s = String(d.getSeconds()).padStart(2,'0');
      return `${h}:${m}:${s}`;
    }
    return rid;
  }
  // Heel KDE
  const kdeRoll = {};
  Object.entries(byRec).forEach(([rid, arr]) => {
    const rolls = arr.map(r => r.roll).filter(Number.isFinite);
    kdeRoll[rid] = { data: rolls, label: recLabel(rid) };
  });
  let rollMax = 0; Object.entries(kdeRoll).forEach(([rid,d])=>{ if(d.data&&d.data.length){ const ys = kdeOnGridLogBackShift(d.data, xsRoll, getKdeFactorAngles(true)).map(y=>y*100); rollMax=Math.max(rollMax, ...ys);} });
  const rollPitchMax = Math.max(10, rollMax) * 1.05;
  drawKDEMulti('sa-kde-roll', kdeRoll, DEG_RANGE.min, DEG_RANGE.max, DEG_RANGE.gridCnt, getKdeFactorAngles(true), 'Heel (°)', false, colorMap, false, rollPitchMax, recIds.map(rid => labelForRec(rid)));
  // Heel Frequency KDE
  const kdeFreq = {};
  Object.entries(byRec).forEach(([rid, arr]) => {
    const rolls = arr.map(r => r.roll).filter(Number.isFinite);
    const times = arr.map(r => r.t).filter(Number.isFinite);
    const peaks = detectPeaks(rolls, times, 300, 5.0);
    kdeFreq[rid] = { data: freqSamplesFromPeaks(peaks), label: recLabel(rid) };
  });
  let freqMax = 0; Object.entries(kdeFreq).forEach(([rid,d])=>{ if(d.data&&d.data.length){ const ys = kdeOnGridLogBack(d.data, xsFreq, getKdeFactorFreq()).map(y=>y*100); freqMax=Math.max(freqMax, ...ys);} });
  freqMax = Math.max(10, freqMax) * 1.2;
  drawKDEMulti('sa-kde-freq-roll', kdeFreq, FREQ_RANGE.min, FREQ_RANGE.max, FREQ_RANGE.gridCnt, getKdeFactorFreq(), 'Freq (heel)', false, colorMap, false, freqMax, recIds.map(rid => labelForRec(rid)));
  // SOG Histogram
  (function(){
    const kdeData = {}; let globalMax = 0;
    Object.entries(byRec).forEach(([rid, arr]) => {
      const sogs = [];
      for (let i=0;i<arr.length;i++){ const r = arr[i]; if (typeof r.sog_mps === 'number' && Number.isFinite(r.sog_mps) && r.sog_mps>0){ const kt = r.sog_mps*(window.KNOTS_PER_MPS||1.94384449); sogs.push(kt); if (kt>globalMax) globalMax=kt; } }
      kdeData[rid] = { data: sogs, label: recLabel(rid) };
    });
    let maxS = Math.max(2, globalMax); maxS = Math.ceil(maxS/2)*2;
    const xs = linspace(0.01, maxS, 160);
    let sogYMax = 0; Object.entries(kdeData).forEach(([rid,d])=>{ if(d.data&&d.data.length){ const ys = kdeOnGridLogBack(d.data, xs, getKdeFactorFreq()).map(y=>y*100); sogYMax=Math.max(sogYMax, ...ys);} });
    sogYMax = Math.max(10, sogYMax)*1.05;
    drawKDEMulti('sa-hist-sog', kdeData, 0.01, maxS, 160, getKdeFactorFreq(), 'SOG (kt)', true, colorMap, false, sogYMax, recIds.map(rid => labelForRec(rid)));
  })();
  // TWA KDE per recording using that rec's recorded wind
  (function(){
    const kdeTwa = {}; let hasAny = false;
    const xsTWA = linspace(-180, 180, DEG_RANGE.gridCnt);
    recIds.forEach(rid => {
      const rec = allRecordings.find(r => r.id === rid); if (!rec) return;
      const arr = byRec[rid] || [];
      const heads = arr.map(r => (typeof r.heading_deg === 'number' ? r.heading_deg : null)).filter(Number.isFinite);
      const recWindDir = (rec.windAtEnd && Number.isFinite(rec.windAtEnd.direction)) ? rec.windAtEnd.direction
                        : (rec.windAtStart && Number.isFinite(rec.windAtStart.direction)) ? rec.windAtStart.direction
                        : null;
      if (Number.isFinite(recWindDir) && heads.length){
        const angleDiff = (window.windManual && typeof window.windManual.angleDiffDeg === 'function') ? window.windManual.angleDiffDeg : ((a,b)=>a-b);
        const twas = heads.map(h => angleDiff(recWindDir, h)).filter(Number.isFinite);
        kdeTwa[rid] = { data: twas, label: recLabel(rid) };
        hasAny = hasAny || twas.length>0;
      } else {
        kdeTwa[rid] = { data: [], label: recLabel(rid) };
      }
    });
    // If none has wind/TWA, hide the card
    if (!hasAny) {
      const el = document.getElementById('sa-kde-twa'); if (el) { const card = el.closest && el.closest('.card'); if (card) card.style.display='none'; }
      return;
    }
    drawKDEMulti('sa-kde-twa', kdeTwa, -180, 180, DEG_RANGE.gridCnt, getKdeFactorAngles(true), 'TWA (°)', false, colorMap, false, undefined, recIds.map(rid => labelForRec(rid)));
  })();

  function labelForRec(rid){
    const rec = allRecordings.find(r => r.id === rid); if (!rec) return rid;
    if (rec.label && rec.label.trim()) return rec.label;
    if (rec.startedAt) { const d = new Date(rec.startedAt); const hh = String(d.getHours()).padStart(2,'0'); const mm=String(d.getMinutes()).padStart(2,'0'); const ss=String(d.getSeconds()).padStart(2,'0'); return `${hh}:${mm}:${ss}`; }
    return rid;
  }
}

// ------- CSV helpers (Reports) -------
function fmt2(n){ return String(n).padStart(2,'0'); }
function makeCsvFilename(rec=null){
  const d = rec && rec.startedAt ? new Date(rec.startedAt) : new Date();
  const ts = `${d.getFullYear()}-${fmt2(d.getMonth()+1)}-${fmt2(d.getDate())}_${fmt2(d.getHours())}-${fmt2(d.getMinutes())}-${fmt2(d.getSeconds())}`;
  return `trollsports_${ts}.csv`;
}
function triggerCsvDownload(csvText, filename){
  const blob = new Blob([csvText], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function buildCsvHeader(){
  // Include optional sog_mps and heading_deg so imports preserve device speed/heading if present
  return ['unit_id','athlete','timestamp_ms','iso_time','elapsed_s','seq','roll_deg','pitch_deg','lat','lon','gnss_ms','gnss_iso','sog_mps','heading_deg'].join(',');
}
function buildCsvForRecording(rec){
  if(!rec || !Array.isArray(rec.rows)) return '';
  const lines = [buildCsvHeader()];
  // meta lines
  try{
    if (rec.topMark && Number.isFinite(rec.topMark.lat) && Number.isFinite(rec.topMark.lon)) {
      lines.push(`top_mark,${rec.topMark.lat.toFixed(6)},${rec.topMark.lon.toFixed(6)}`);
    } else { lines.push('top_mark,,'); }
    if (rec.startLine && rec.startLine.a && rec.startLine.b) {
      lines.push(`start_pt1,${rec.startLine.a.lat.toFixed(6)},${rec.startLine.a.lon.toFixed(6)}`);
      lines.push(`start_pt2,${rec.startLine.b.lat.toFixed(6)},${rec.startLine.b.lon.toFixed(6)}`);
    } else { lines.push('start_pt1,,'); lines.push('start_pt2,,'); }
    const pushWind = (label, w)=>{
      if (w && Number.isFinite(w.direction)) lines.push(`${label},${w.direction.toFixed(0)},${Number.isFinite(w.knots)?w.knots.toFixed(1):''}`);
      else lines.push(`${label},,`);
    };
    pushWind('wind_start', rec.windAtStart);
    pushWind('wind_end', rec.windAtEnd);
  }catch{}
  // data rows
  const t0 = (typeof window.globalT0 === 'number' && Number.isFinite(window.globalT0)) ? window.globalT0 : null;
  for(const r of rec.rows){
    const iso = new Date(r.t).toISOString().replace(/"/g,'""');
    const u = window.units && window.units[r.unit];
    const athlete = u ? (u.customName || r.unit) : r.unit;
    lines.push([
      r.unit,
      athlete,
      r.t,
      `"${iso}"`,
      (t0!=null?(((r.t - t0)/1000).toFixed(3)):'') ,
      (r.seq??''),
      (Number.isFinite(r.roll)?r.roll.toFixed(6):''),
      (Number.isFinite(r.pitch)?r.pitch.toFixed(6):''),
      (Number.isFinite(r.lat)?r.lat.toFixed(6):''),
      (Number.isFinite(r.lon)?r.lon.toFixed(6):''),
      (r.gnss_ms??''),
      (r.gnss_iso?`"${r.gnss_iso.replace(/"/g,'""')}"`:'') ,
      (Number.isFinite(r.sog_mps)?r.sog_mps.toFixed(3):''),
      (Number.isFinite(r.heading_deg)?r.heading_deg.toFixed(1):'')
    ].join(','));
  }
  return lines.join('\n');
}
// removed buildCsvForAllRecordings (no longer needed)