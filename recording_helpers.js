// Helper: snapshot current wind (direction deg FROM, knots) from manual or forecast
function _getWindSnapshot(){
  try{
    // Prefer manual if available
    if (window.windManual && typeof window.windManual.getCurrent === 'function'){
      const w = window.windManual.getCurrent();
      if (w && Number.isFinite(w.direction)){
        const knots = Number.isFinite(w.strengthKnots) ? w.strengthKnots : null;
        return { direction: w.direction, knots, source: 'manual' };
      }
    }
    // Fallback to forecast
    if (window.windForecast && typeof window.windForecast.getCurrentData === 'function'){
      const f = window.windForecast.getCurrentData();
      if (f && Number.isFinite(f.direction)){
        const knots = Number.isFinite(f.speedKnots) ? f.speedKnots : (Number.isFinite(f.speed) ? (f.speed*1.943844) : null);
        return { direction: f.direction, knots, source: 'forecast' };
      }
    }
  }catch{}
  return null;
}

function startRec(){
  recActive=true; recRows=[]; recStartedAt=Date.now();
  btnRecord.textContent="  Stop"; btnRecord.classList.add('recording','blink');
  if(window._rt) clearInterval(window._rt);
  // window._rt=setInterval(()=>{recInfo.textContent=`Recording… ${((Date.now()-recStartedAt)/1000).toFixed(1)} s`;},200);
  log("recording started");
  // Capture wind at recording start (direction in degrees FROM + knots if available)
  try{ window._recWindAtStart = _getWindSnapshot(); }catch{ window._recWindAtStart = null; }
}

function stopRec(){
  recActive=false; btnRecord.textContent="Record"; btnRecord.classList.remove('recording','blink');
  if(window._rt){clearInterval(window._rt);window._rt=null;}
  // if(!recRows.length){recInfo.textContent="No samples recorded.";log("no samples to save");return;}

  // Save recording data for reports
  // Capture wind at recording end
  let windAtStart=null, windAtEnd=null;
  try{
    const s = (window._recWindAtStart && Number.isFinite(window._recWindAtStart.direction)) ? window._recWindAtStart : null;
    const e = _getWindSnapshot();
    if (s) windAtStart = { direction: s.direction, knots: (Number.isFinite(s.knots)? s.knots : null), source: s.source };
    if (e && Number.isFinite(e.direction)) windAtEnd = { direction: e.direction, knots: (Number.isFinite(e.knots)? e.knots : null), source: e.source };
  }catch{}
  const recording = {
    id: 'rec-' + (allRecordings.length+1),
    startedAt: recStartedAt,
    rows: recRows.slice(),
    topMark: window._topMarkCoords ? {...window._topMarkCoords} : null,
    startLine: window._startLineCoords ? {...window._startLineCoords} : null,
    windAtStart,
    windAtEnd
  };
  allRecordings.push(recording);
  saveRecordingsToStorage();
  generateReportsTabs();

  // CSV download with athlete names (optional)
  let shouldDownload = true;
  try {
    const v = localStorage.getItem('autoDownloadCsv');
    shouldDownload = (v === null) ? true : (v === 'true');
  } catch {}
  if (shouldDownload) {
  // Include sog_mps and heading_deg (and gps_utc alias) in header to match reports export
  const header=['unit_id','athlete','timestamp_ms','iso_time','elapsed_s','seq','roll_deg','pitch_deg','lat','lon','gnss_ms','gnss_iso','gps_utc','sog_mps','heading_deg'];
  const lines=[header.join(',')];
  let topMarkLine = 'top_mark', startPt1Line = 'start_pt1', startPt2Line = 'start_pt2';
  let windStartLine = 'wind_start', windEndLine = 'wind_end';
  if(window._topMarkCoords && typeof window._topMarkCoords.lat === 'number' && typeof window._topMarkCoords.lon === 'number') {
    topMarkLine += `,${window._topMarkCoords.lat.toFixed(6)},${window._topMarkCoords.lon.toFixed(6)}`;
  } else {
    topMarkLine += ',,';
  }
  if(window._startLineCoords && window._startLineCoords.a && window._startLineCoords.b) {
    startPt1Line += `,${window._startLineCoords.a.lat.toFixed(6)},${window._startLineCoords.a.lon.toFixed(6)}`;
    startPt2Line += `,${window._startLineCoords.b.lat.toFixed(6)},${window._startLineCoords.b.lon.toFixed(6)}`;
  } else {
    startPt1Line += ',,';
    startPt2Line += ',,';
  }
  // Add wind lines: label, direction (deg), knots
  try{
    if (recording.windAtStart && Number.isFinite(recording.windAtStart.direction)){
      const d = recording.windAtStart.direction;
      const k = Number.isFinite(recording.windAtStart.knots) ? recording.windAtStart.knots : null;
      windStartLine += `,${d.toFixed(0)},${k!=null ? k.toFixed(1) : ''}`;
    } else {
      windStartLine += ',,';
    }
    if (recording.windAtEnd && Number.isFinite(recording.windAtEnd.direction)){
      const d = recording.windAtEnd.direction;
      const k = Number.isFinite(recording.windAtEnd.knots) ? recording.windAtEnd.knots : null;
      windEndLine += `,${d.toFixed(0)},${k!=null ? k.toFixed(1) : ''}`;
    } else {
      windEndLine += ',,';
    }
  }catch{
    windStartLine += ',,'; windEndLine += ',,';
  }
  lines.push(topMarkLine);
  lines.push(startPt1Line);
  lines.push(startPt2Line);
  lines.push(windStartLine);
  lines.push(windEndLine);
  for(const r of recRows){
    const iso = new Date(r.t).toISOString();
    const u = units[r.unit];
    const athlete = u ? (u.customName || r.unit) : r.unit;
    const gnssIsoEsc = (typeof r.gnss_iso === 'string' && r.gnss_iso.length)
      ? `"${r.gnss_iso.replace(/"/g,'""')}"` : '';
    lines.push([
      r.unit,
      athlete,
      r.t,
      `"${iso.replace(/"/g,'""')}"`,
      (globalT0!==null?((r.t-globalT0)/1000).toFixed(3):''),
      (r.seq??''),
      (Number.isFinite(r.roll)?Number(r.roll).toFixed(6):''),
      (Number.isFinite(r.pitch)?Number(r.pitch).toFixed(6):''),
      (Number.isFinite(r.lat)?Number(r.lat).toFixed(6):''),
      (Number.isFinite(r.lon)?Number(r.lon).toFixed(6):''),
      (r.gnss_ms??''),
      gnssIsoEsc,
      // gps_utc duplicates gnss_iso for compatibility with analysers
      gnssIsoEsc,
      (typeof r.sog_mps === 'number' && Number.isFinite(r.sog_mps) ? r.sog_mps.toFixed(3) : ''),
      (typeof r.heading_deg === 'number' && Number.isFinite(r.heading_deg) ? r.heading_deg.toFixed(1) : '')
    ].join(','));
  }
  const csv=lines.join('\n'), blob=new Blob([csv],{type:'text/csv'}), d=new Date(recStartedAt||Date.now());
  const fname=`trollsports_multi_${d.getFullYear()}-${fmt2(d.getMonth()+1)}-${fmt2(d.getDate())}_${fmt2(d.getHours())}-${fmt2(d.getMinutes())}-${fmt2(d.getSeconds())}.csv`;
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fname; document.body.appendChild(a); a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  }
  // recInfo.textContent=`Saved ${recRows.length} samples to ${fname}`; log(`saved CSV (${recRows.length} rows)`);
}

// make available to other modules
window.startRec = startRec;
window.stopRec = stopRec;