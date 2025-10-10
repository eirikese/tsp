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
      try{ rec._hash = await computeSHA256Hex(text); }catch{}
      if (shouldSkipDuplicate(rec)) {
  contentEl.innerHTML = '<div class="small">Skipped duplicate recording (Settings → Import & Transfer → Skip duplicates is ON).</div>';
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
  // Expose import file input for CSV menu
  window._importCsvFileInput = _importFileInput;
  const _importBtn = document.createElement('button');
  _importBtn.textContent = 'Import CSV';
  _importBtn.className = 'small';
  _importBtn.onclick = () => _importFileInput.click();

  // Build actions row (top)
  if (actionsEl) {
    const isSingle = !!window._singleAthleteMode.active;
    if (isSingle) {
      // In single athlete mode: hide all other tools, show only Exit and athlete label
      const exitBtn = document.createElement('button');
      exitBtn.textContent = 'Exit single athlete';
      exitBtn.className = 'small';
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
    } else {
      // Normal mode: show full set of tools + single-athlete entry point
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

      // CSV menu
      const csvBtn = document.createElement('button');
      csvBtn.textContent = 'CSV';
      csvBtn.className = 'small';
      csvBtn.onclick = () => openCsvActionsMenu();
      actionsEl.appendChild(csvBtn);

      // Utility: get import duplicate-skip setting
      const isSkipDup = () => {
        try{ const v = localStorage.getItem('skipDupImport'); return v===null ? true : (v==='true'); }catch{ return true; }
      };
      const isVerify = () => {
        try{ const v = localStorage.getItem('verifyTransfer'); return v===null ? true : (v==='true'); }catch{ return true; }
      };
      // Utility: naive duplicate check without hash
      function approxDuplicate(rec){
        try{
          const label = (rec.label||'');
          const n = (rec.rows||[]).length;
          const t0 = n? rec.rows[0].t : rec.startedAt;
          const t1 = n? rec.rows[n-1].t : rec.startedAt;
          return allRecordings.some(r=>{
            const rn = (r.rows||[]).length;
            const rl = (r.label||'');
            const rt0 = rn? r.rows[0].t : r.startedAt;
            const rt1 = rn? r.rows[rn-1].t : r.startedAt;
            return rl===label && rn===n && rt0===t0 && rt1===t1;
          });
        }catch{ return false; }
      }
      // Public helper used by import paths
      window.shouldSkipDuplicate = function(rec){
        if (!isSkipDup()) return false;
        try{
          if (rec && rec._hash) {
            // If any existing has same _hash, skip
            const exists = allRecordings.some(r=> r && r._hash && r._hash===rec._hash);
            if (exists) return true;
          }
        }catch{}
        return approxDuplicate(rec);
      }
      // Hash helper
      window.computeSHA256Hex = async function(str){
        const enc = new TextEncoder();
        const data = enc.encode(str);
        const digest = await crypto.subtle.digest('SHA-256', data);
        const bytes = Array.from(new Uint8Array(digest));
        return bytes.map(b=> b.toString(16).padStart(2,'0')).join('');
      }

      // Backend integration: single Server button with menu
  const serverBtn = document.createElement('button');
  serverBtn.textContent = 'Backup';
      serverBtn.className = 'small';
      serverBtn.onclick = () => openServerActionsMenu();
      actionsEl.appendChild(serverBtn);

      // Removed individual server buttons in favor of the Server menu

      const singleBtn = document.createElement('button');
      singleBtn.textContent = 'Select single athlete';
      singleBtn.className = 'small';
      singleBtn.title = 'Open athlete picker and focus reports on one athlete';
      singleBtn.onclick = () => openAthleteModal();
      // Move this control to the Select Report tile (tabs row)
      if (tabsEl) tabsEl.appendChild(singleBtn);
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
  // Support gps_utc alias for gnss_iso
  const cGnssIso = (function(){
    const i1 = idx(['gnss_iso']);
    if (i1 !== -1) return i1;
    const i2 = idx(['gps_utc']);
    return i2;
  })();
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
  let unitIds = Object.keys(byUnit);
  try{
    const order = (typeof window.getConfigOrder==='function') ? window.getConfigOrder() : [];
    if (order && order.length){
      const pos = new Map(order.map((id,i)=>[id,i]));
      unitIds.sort((a,b)=>{
        const pa = pos.has(a)?pos.get(a):1e9;
        const pb = pos.has(b)?pos.get(b):1e9;
        if (pa!==pb) return pa-pb;
        return a.localeCompare(b);
      });
    }
  }catch{}
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

// -------- Server Load Modal --------
function formatDateKey(iso){ try{ const d=new Date(iso); if(!isNaN(d)) return d.toISOString().slice(0,10); }catch{} return 'Unknown'; }
function formatTimeHM(iso){ try{ const d=new Date(iso); if(!isNaN(d)) { const h=String(d.getHours()).padStart(2,'0'); const m=String(d.getMinutes()).padStart(2,'0'); return `${h}:${m}`; } }catch{} return ''; }
function humanSize(n){ if(!(n>0)) return ''; const kb = n/1024; if(kb<1024) return `${Math.round(kb)} KB`; const mb=kb/1024; return `${mb.toFixed(1)} MB`; }
function closeServerLoadModal(){ const ov=document.getElementById('serverLoadModalOverlay'); if(ov&&ov.parentElement){ try{ ov.remove(); }catch{} } }
async function openServerLoadModal(){
  const base = (localStorage.getItem('backend_base_url') || 'http://localhost:8000').replace(/\/$/,'');
  // Fetch list
  let items=[]; try{ const resp=await fetch(base+'/api/recordings'); if(resp.ok){ const j=await resp.json(); items=(j.items||[]); } }catch(e){ alert('Failed to reach server.'); return; }
  if(!items.length){ alert('No recordings on server.'); return; }
  // Group by date
  const byDate = {}; const byId = {};
  items.forEach(it=>{ const k=formatDateKey(it.updated_at||it.created_at||new Date().toISOString()); if(!byDate[k]) byDate[k]=[]; byDate[k].push(it); byId[it.id]=it; });
  const dates = Object.keys(byDate).sort().reverse();
  // Build modal
  if (document.getElementById('serverLoadModalOverlay')) { try{ document.getElementById('serverLoadModalOverlay').remove(); }catch{} }
  const overlay = document.createElement('div'); overlay.id='serverLoadModalOverlay'; overlay.className='modal-overlay'; overlay.addEventListener('click', e=>{ if(e.target===overlay) closeServerLoadModal(); });
  const dialog = document.createElement('div'); dialog.className='modal-dialog'; dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.style.maxWidth='820px'; dialog.style.width='90%';
  const header = document.createElement('div'); header.className='modal-header';
  const title = document.createElement('div'); title.className='modal-title'; title.textContent='Load from server';
  const closeBtn = document.createElement('button'); closeBtn.className='modal-close'; closeBtn.innerHTML='✕'; closeBtn.onclick=closeServerLoadModal;
  header.appendChild(title); header.appendChild(closeBtn);
  const body = document.createElement('div'); body.className='modal-content';
  // Layout: left date buttons, right list for selected date
  const wrap = document.createElement('div'); wrap.style.display='grid'; wrap.style.gridTemplateColumns='200px 1fr'; wrap.style.gap='12px';
  const left = document.createElement('div'); left.style.display='flex'; left.style.flexDirection='column'; left.style.gap='8px';
  const right = document.createElement('div'); right.style.display='flex'; right.style.flexDirection='column'; right.style.gap='8px'; right.style.maxHeight='50vh'; right.style.overflow='auto';
  wrap.appendChild(left); wrap.appendChild(right); body.appendChild(wrap);
  // Footer
  const footer = document.createElement('div'); footer.className='modal-footer'; footer.style.display='flex'; footer.style.justifyContent='flex-end'; footer.style.gap='8px';
  const cancelBtn = document.createElement('button'); cancelBtn.textContent='Cancel'; cancelBtn.onclick=closeServerLoadModal;
  const loadBtn = document.createElement('button'); loadBtn.textContent='Load'; loadBtn.style.background='var(--accent)'; loadBtn.style.color='#fff';
  footer.appendChild(cancelBtn); footer.appendChild(loadBtn);

  dialog.appendChild(header); dialog.appendChild(body); dialog.appendChild(footer); overlay.appendChild(dialog); document.body.appendChild(overlay);

  // State
  let currentDate = dates[0];
  const selected = new Set();
  // Render dates
  function renderDates(){
    left.innerHTML='';
    dates.forEach(dk=>{
      const b=document.createElement('button'); b.className='modal-item'; b.textContent=dk; b.style.textAlign='left'; b.style.justifyContent='flex-start';
      if(dk===currentDate){ b.style.background='var(--accent)'; b.style.color='#fff'; }
      b.onclick=()=>{ currentDate=dk; renderDates(); renderDayList(); };
      left.appendChild(b);
    });
  }
  // Render recordings for currentDate
  function renderDayList(){
    right.innerHTML='';
    const list = byDate[currentDate]||[];
    // Day header with Select All
    const head = document.createElement('div'); head.style.display='flex'; head.style.alignItems='center'; head.style.justifyContent='space-between';
    const hleft = document.createElement('div'); hleft.innerHTML = `<b>${currentDate}</b> — ${list.length} file(s)`;
    const hright = document.createElement('label'); hright.style.display='flex'; hright.style.alignItems='center'; hright.style.gap='6px';
    const selAll = document.createElement('input'); selAll.type='checkbox';
    // Initialize select-all checkbox based on whether all items of day are selected
    selAll.checked = list.every(it=> selected.has(it.id));
    selAll.onchange = ()=>{
      if(selAll.checked){ list.forEach(it=> selected.add(it.id)); } else { list.forEach(it=> selected.delete(it.id)); }
      renderDayList();
    };
    const sal = document.createElement('span'); sal.textContent='Load all';
    hright.appendChild(selAll); hright.appendChild(sal); head.appendChild(hleft); head.appendChild(hright); right.appendChild(head);
    // Items
    const ul=document.createElement('div'); ul.style.display='flex'; ul.style.flexDirection='column'; ul.style.gap='6px'; ul.style.marginTop='8px';
    list.forEach(it=>{
      const row=document.createElement('label'); row.style.display='grid'; row.style.gridTemplateColumns='24px 1fr auto'; row.style.alignItems='center'; row.style.gap='8px'; row.style.padding='6px 4px'; row.style.border='1px solid #eee'; row.style.borderRadius='6px';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=selected.has(it.id); cb.onchange=()=>{ if(cb.checked) selected.add(it.id); else selected.delete(it.id); };
      const name=document.createElement('div'); name.className='small';
      const label = it.label && it.label.trim() ? it.label : (it.filename || it.id);
      name.textContent = `${formatTimeHM(it.updated_at || it.created_at)}  •  ${label}`;
      const meta=document.createElement('div'); meta.className='tiny'; meta.textContent=humanSize(it.size_bytes||0);
      row.appendChild(cb); row.appendChild(name); row.appendChild(meta);
      ul.appendChild(row);
    });
    right.appendChild(ul);
  }
  renderDates(); renderDayList();

  // Load selected on click
  loadBtn.onclick = async ()=>{
    if (selected.size===0){ alert('No recordings selected.'); return; }
    loadBtn.disabled=true; cancelBtn.disabled=true; loadBtn.textContent='Loading…';
    const ids=Array.from(selected);
    let imported=0, skipped=0, failed=0; let lastRecId=null;
    const verifyOn = (function(){ try{ const v=localStorage.getItem('verifyTransfer'); return v===null? true : (v==='true'); }catch{ return true; } })();
    for (const id of ids){
      try{
        const it = byId[id];
        const respCsv = await fetch(base + '/api/recordings/'+encodeURIComponent(id)+'/csv');
        if(!respCsv.ok) throw new Error('download failed');
        const text = await respCsv.text();
        if (verifyOn){
          const hdrSha = respCsv.headers.get('X-Content-SHA256') || respCsv.headers.get('ETag') || (it?.sha256 || '');
          if (hdrSha){ try{ const calc=await computeSHA256Hex(text); if(calc && hdrSha && calc.toLowerCase()!==hdrSha.toLowerCase()){ failed++; continue; } }catch{}
          }
        }
        const rec = parseCsvTextToRecording(text, it.filename||('server-'+it.id+'.csv'));
        try{ rec._hash = await computeSHA256Hex(text); }catch{}
        if (window.shouldSkipDuplicate && window.shouldSkipDuplicate(rec)){ skipped++; continue; }
        if(!rec){ failed++; continue; }
        rec.label = it.label || rec.label || it.filename || it.id;
        allRecordings.push(rec); imported++; lastRecId = rec.id;
      }catch{ failed++; }
    }
    try{ saveRecordingsToStorage(); }catch{}
    try{ generateReportsTabs(); if(lastRecId) setTimeout(()=>{ try{ showReportFor(lastRecId); }catch{} }, 0); }catch{}
    closeServerLoadModal();
  if (failed>0 || skipped>0){ alert(`Loaded: ${imported}\nskipped: ${skipped}\nfailed: ${failed}`); }
  };
}

// -------- CSV Actions Menu --------
function openCsvActionsMenu(){
  if (document.getElementById('csvActionsOverlay')) { try{ document.getElementById('csvActionsOverlay').remove(); }catch{} }
  const overlay = document.createElement('div'); overlay.id='csvActionsOverlay'; overlay.className='modal-overlay'; overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
  const dialog = document.createElement('div'); dialog.className='modal-dialog'; dialog.style.maxWidth='420px'; dialog.style.width='90%';
  const header = document.createElement('div'); header.className='modal-header';
  const title = document.createElement('div'); title.className='modal-title'; title.textContent='CSV';
  const closeBtn = document.createElement('button'); closeBtn.className='modal-close'; closeBtn.innerHTML='✕'; closeBtn.onclick=close;
  header.appendChild(title); header.appendChild(closeBtn);
  const content = document.createElement('div'); content.className='modal-content';
  const list = document.createElement('div'); list.className='modal-list';
  const b1 = document.createElement('button'); b1.className='modal-item'; b1.textContent='Import CSV'; b1.onclick=()=>{ close(); const fi=window._importCsvFileInput; if(fi) fi.click(); else alert('Import not available'); };
  const b2 = document.createElement('button'); b2.className='modal-item'; b2.textContent='Download CSV (selected)'; b2.onclick=()=>{ close(); downloadSelectedCsv(); };
  const b3 = document.createElement('button'); b3.className='modal-item'; b3.textContent='Download CSV (all)'; b3.onclick=()=>{ close(); downloadAllCsvs(); };
  list.appendChild(b1); list.appendChild(b2); list.appendChild(b3); content.appendChild(list);
  dialog.appendChild(header); dialog.appendChild(content); overlay.appendChild(dialog); document.body.appendChild(overlay);
  function close(){ const ov=document.getElementById('csvActionsOverlay'); if(ov&&ov.parentElement){ try{ ov.remove(); }catch{} } }
}

function downloadSelectedCsv(){
  try{
    const tabsEl = document.getElementById('reportSelectButtons');
    const activeBtn = tabsEl && tabsEl.querySelector('.tabbtn.active');
    if(!activeBtn){ alert('No report selected.'); return; }
    const recId = activeBtn.dataset.recId;
    const rec = allRecordings.find(r=>r.id===recId); if(!rec){ alert('Selected report not found.'); return; }
    const csv = buildCsvForRecording(rec);
    triggerCsvDownload(csv, makeCsvFilename(rec));
  }catch(e){ console.warn('CSV build failed', e); alert('Download failed.'); }
}

function downloadAllCsvs(){
  if(!Array.isArray(allRecordings) || allRecordings.length===0){ alert('No recordings available.'); return; }
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
}

// -------- Backup All helper --------
async function backupAllToServer(){
  try{
    const base = (localStorage.getItem('backend_base_url') || 'http://localhost:8000').replace(/\/$/,'');
    const verifyOn = (function(){ try{ const v=localStorage.getItem('verifyTransfer'); return v===null? true : (v==='true'); }catch{ return true; } })();
    // Server index by filename
    let serverIdx = {};
    try{
      const respIdx = await fetch(base + '/api/recordings');
      if (respIdx.ok){ const j = await respIdx.json(); (j.items||[]).forEach(it=>{ serverIdx[it.filename||''] = { size: it.size_bytes||0, sha256: it.sha256||'' }; }); }
    }catch{}
    let uploaded=0, skipped=0, failed=0;
    for (const rec of allRecordings){
      try{
        const csv = buildCsvForRecording(rec);
        const fname = makeCsvFilename(rec);
        const size = new Blob([csv]).size;
        if (verifyOn && serverIdx[fname] && serverIdx[fname].sha256){
          try{ const calc=await computeSHA256Hex(csv); if(calc && calc.toLowerCase()===serverIdx[fname].sha256.toLowerCase()){ skipped++; continue; } }catch{}
        } else if (serverIdx[fname] && serverIdx[fname].size === size){ skipped++; continue; }
        const fd = new FormData();
        fd.append('file', new File([csv], fname, {type:'text/csv'}));
        if (rec.label && rec.label.trim()) fd.append('label', rec.label.trim());
        const resp = await fetch(base + '/api/recordings', { method:'POST', body: fd });
        if (!resp.ok) { failed++; continue; }
        if (verifyOn){
          try{ const calc=await computeSHA256Hex(csv); const j=await resp.json(); const srvHash=(j&&j.meta&&j.meta.sha256)?j.meta.sha256:''; if(srvHash && calc && srvHash.toLowerCase()!==calc.toLowerCase()){ alert('Upload verification failed for '+fname+': server hash differs from local.'); } }catch{}
        }
        uploaded++;
      }catch{ failed++; }
    }
    alert(`Backup complete.\nUploaded: ${uploaded}\nskipped: ${skipped}\nfailed: ${failed}`);
  }catch(e){ alert('Backup-all failed: '+(e?.message||e)); }
}

// -------- Server Actions Menu --------
function openServerActionsMenu(){
  if (document.getElementById('serverActionsOverlay')) { try{ document.getElementById('serverActionsOverlay').remove(); }catch{} }
  const overlay = document.createElement('div'); overlay.id='serverActionsOverlay'; overlay.className='modal-overlay'; overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
  const dialog = document.createElement('div'); dialog.className='modal-dialog'; dialog.style.maxWidth='420px'; dialog.style.width='90%';
  const header = document.createElement('div'); header.className='modal-header';
  const title = document.createElement('div'); title.className='modal-title'; title.textContent='Backup';
  const closeBtn = document.createElement('button'); closeBtn.className='modal-close'; closeBtn.innerHTML='✕'; closeBtn.onclick=close;
  header.appendChild(title); header.appendChild(closeBtn);
  const content = document.createElement('div'); content.className='modal-content';
  const list = document.createElement('div'); list.className='modal-list';
  const b1 = document.createElement('button'); b1.className='modal-item'; b1.textContent='Back up local files to server'; b1.onclick=async()=>{ close(); await backupAllToServer(); };
  const b2 = document.createElement('button'); b2.className='modal-item'; b2.textContent='Load from server'; b2.onclick=()=>{ close(); openServerLoadModal(); };
  const b3 = document.createElement('button'); b3.className='modal-item'; b3.textContent='Manage server files'; b3.onclick=()=>{ close(); openServerManageModal(); };
  list.appendChild(b1); list.appendChild(b2); list.appendChild(b3); content.appendChild(list);
  dialog.appendChild(header); dialog.appendChild(content); overlay.appendChild(dialog); document.body.appendChild(overlay);
  function close(){ const ov=document.getElementById('serverActionsOverlay'); if(ov&&ov.parentElement){ try{ ov.remove(); }catch{} } }
}

// -------- Server Manage Modal --------
async function openServerManageModal(){
  const base = (localStorage.getItem('backend_base_url') || 'http://localhost:8000').replace(/\/$/,'');
  let items=[]; try{ const resp=await fetch(base+'/api/recordings'); if(resp.ok){ const j=await resp.json(); items=(j.items||[]); } }catch(e){ alert('Failed to reach server.'); return; }
  if(!items.length){ alert('No recordings on server.'); return; }
  const overlay = document.createElement('div'); overlay.id='serverManageOverlay'; overlay.className='modal-overlay'; overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
  const dialog = document.createElement('div'); dialog.className='modal-dialog'; dialog.style.maxWidth='820px'; dialog.style.width='90%';
  const header = document.createElement('div'); header.className='modal-header';
  const title = document.createElement('div'); title.className='modal-title'; title.textContent='Manage server files';
  const closeBtn = document.createElement('button'); closeBtn.className='modal-close'; closeBtn.innerHTML='✕'; closeBtn.onclick=close;
  header.appendChild(title); header.appendChild(closeBtn);
  const body = document.createElement('div'); body.className='modal-content';
  const table = document.createElement('div'); table.style.display='grid'; table.style.gridTemplateColumns='1fr auto auto'; table.style.gap='8px';
  // Header row
  table.appendChild(makeCell('File', true)); table.appendChild(makeCell('Rename', true)); table.appendChild(makeCell('Delete', true));
  // Rows
  items.forEach(it=>{
    const label = it.label && it.label.trim()? it.label : (it.filename || it.id);
    table.appendChild(makeCell(label));
    const rn = document.createElement('button'); rn.className='small'; rn.textContent='Rename'; rn.onclick=async()=>{ await renameItem(it.id, label); await refresh(); };
    const del = document.createElement('button'); del.className='small'; del.textContent='Delete'; del.onclick=async()=>{ if(confirm('Delete this file from server?')){ await deleteItem(it.id); await refresh(); } };
    table.appendChild(rn); table.appendChild(del);
  });
  body.appendChild(table);
  dialog.appendChild(header); dialog.appendChild(body); overlay.appendChild(dialog); document.body.appendChild(overlay);

  async function refresh(){ try{ overlay.remove(); }catch{} openServerManageModal(); }
  function close(){ const ov=document.getElementById('serverManageOverlay'); if(ov&&ov.parentElement){ try{ ov.remove(); }catch{} } }
  function makeCell(text, header=false){ const d=document.createElement('div'); d.textContent=text; d.className= header? 'small' : ''; return d; }
  async function deleteItem(id){ try{ await fetch(base+'/api/recordings/'+encodeURIComponent(id), { method:'DELETE' }); }catch{} }
  async function renameItem(id, current){
    const name = prompt('Enter new label for this file:', current || ''); if(!name || !name.trim()) return;
    try{
      const resp = await fetch(base+'/api/recordings/'+encodeURIComponent(id), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ label: name.trim() }) });
      if(!resp.ok){ alert('Rename failed'); }
    }catch{ alert('Rename failed'); }
  }
}

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
  // Build per-recording stats tiles (titles = selected tests)
  function recLabelLocal(rid){
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
  function meanSdMax(arr){
    const a = arr.filter(Number.isFinite);
    if (!a.length) return {mean:null, sd:null, max:null};
    const mean = a.reduce((s,v)=>s+v,0)/a.length;
    const sd = Math.sqrt(a.reduce((s,v)=>s+(v-mean)*(v-mean),0)/a.length);
    const max = Math.max(...a);
    return {mean, sd, max};
  }
  let statsHtml = `<div id="sa-stats" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">`;
  recIds.forEach(rid => {
    const arr = byRec[rid] || [];
    const rolls = arr.map(r=>r.roll).filter(Number.isFinite);
    const pitchs = arr.map(r=>r.pitch).filter(Number.isFinite);
    const sogsKt = arr.map(r=> (typeof r.sog_mps==='number' && Number.isFinite(r.sog_mps)) ? r.sog_mps*(window.KNOTS_PER_MPS||1.94384449) : null).filter(Number.isFinite);
    const heads = arr.map(r=> (typeof r.heading_deg==='number' ? r.heading_deg : null)).filter(Number.isFinite);
    const rollStats = meanSdMax(rolls);
    const pitchStats = meanSdMax(pitchs);
    const sogStats = meanSdMax(sogsKt);
    const headStats = meanSdMax(heads);
    // TWA stats using this recording's saved wind (prefer end)
    let twaStats = {mean:null, sd:null};
    try{
      const rec = allRecordings.find(r=>r.id===rid);
      const recWindDir = (rec && rec.windAtEnd && Number.isFinite(rec.windAtEnd.direction)) ? rec.windAtEnd.direction
                        : (rec && rec.windAtStart && Number.isFinite(rec.windAtStart.direction)) ? rec.windAtStart.direction
                        : null;
      if (Number.isFinite(recWindDir) && heads.length){
        const angleDiff = (window.windManual && typeof window.windManual.angleDiffDeg==='function') ? window.windManual.angleDiffDeg : ((a,b)=>a-b);
        const twas = heads.map(h=> angleDiff(recWindDir, h)).filter(Number.isFinite);
        const s = meanSdMax(twas);
        twaStats = { mean: s.mean, sd: s.sd };
      }
    }catch{}
    const title = recLabelLocal(rid);
    const c = colorMap[rid] || COLORS_BASE[0];
    statsHtml += `
    <div class="card half unitStats" style="--ucolor:${c};min-width:200px;max-width:400px;">
      <div style="font-weight:700;margin-bottom:8px;"><span class="unitTag" style="background:${c}">${title}</span></div>
      <div class="grid">
        <div><div class="small">Avg Heel (°)</div><div class="num">${rollStats.mean!==null ? rollStats.mean.toFixed(1)+' ±'+rollStats.sd.toFixed(1)+'°' : '–'}</div></div>
        <div><div class="small">Avg Trim (°)</div><div class="num">${pitchStats.mean!==null ? pitchStats.mean.toFixed(1)+' ±'+pitchStats.sd.toFixed(1)+'°' : '–'}</div></div>
        <div><div class="small">Avg SOG (kt)</div><div class="num">${sogStats.mean!==null ? sogStats.mean.toFixed(1)+' ±'+sogStats.sd.toFixed(1) : '–'}</div></div>
        <div><div class="small">Max SOG (kt)</div><div class="num">${sogStats.max!==null ? sogStats.max.toFixed(1) : '–'}</div></div>
        <div><div class="small">TWA (°)</div><div class="num">${twaStats.mean!==null ? twaStats.mean.toFixed(1)+' ±'+(twaStats.sd??0).toFixed(1)+'°' : '–'}</div></div>
        <div><div class="small">Heading (°)</div><div class="num">${headStats.mean!==null ? headStats.mean.toFixed(1)+' ±'+headStats.sd.toFixed(1)+'°' : '–'}</div></div>
      </div>
    </div>`;
  });
  statsHtml += `</div>`;
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
  container.innerHTML = statsHtml + html;
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
  // Include sog_mps, heading_deg and preserve GNSS timestamp fields. gps_utc duplicates gnss_iso for compatibility.
  return ['unit_id','athlete','timestamp_ms','iso_time','elapsed_s','seq','roll_deg','pitch_deg','lat','lon','gnss_ms','gnss_iso','gps_utc','sog_mps','heading_deg'].join(',');
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
      (r.gnss_iso?`"${r.gnss_iso.replace(/"/g,'""')}"`:'') ,
      (Number.isFinite(r.sog_mps)?r.sog_mps.toFixed(3):''),
      (Number.isFinite(r.heading_deg)?r.heading_deg.toFixed(1):'')
    ].join(','));
  }
  return lines.join('\n');
}
// removed buildCsvForAllRecordings (no longer needed)