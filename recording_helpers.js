
function startRec(){
  recActive=true; recRows=[]; recStartedAt=Date.now();
  btnRecord.textContent="Stop & Save"; btnRecord.classList.add('recording','blink');
  if(window._rt) clearInterval(window._rt);
  window._rt=setInterval(()=>{recInfo.textContent=`Recording… ${((Date.now()-recStartedAt)/1000).toFixed(1)} s`;},200);
  log("recording started");
}

function stopRec(){
  recActive=false; btnRecord.textContent="Start Recording"; btnRecord.classList.remove('recording','blink');
  if(window._rt){clearInterval(window._rt);window._rt=null;}
  if(!recRows.length){recInfo.textContent="No samples recorded.";log("no samples to save");return;}

  // Save recording data for reports
  const recording = {
    id: 'rec-' + (allRecordings.length+1),
    startedAt: recStartedAt,
    rows: recRows.slice(),
    topMark: window._topMarkCoords ? {...window._topMarkCoords} : null,
    startLine: window._startLineCoords ? {...window._startLineCoords} : null
  };
  allRecordings.push(recording);
  saveRecordingsToStorage();
  generateReportsTabs();

  // CSV download with athlete names
  const header=['unit_id','athlete','timestamp_ms','iso_time','elapsed_s','seq','roll_deg','pitch_deg','lat','lon','gnss_ms','gnss_iso'];
  const lines=[header.join(',')];
  let topMarkLine = 'top_mark', startPt1Line = 'start_pt1', startPt2Line = 'start_pt2';
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
  lines.push(topMarkLine);
  lines.push(startPt1Line);
  lines.push(startPt2Line);
  for(const r of recRows){
    const iso=new Date(r.t).toISOString();
    const u = units[r.unit];
    const athlete = u ? u.customName || r.unit : r.unit;
    lines.push([r.unit,athlete,r.t,`"${iso.replace(/"/g,'""')}"`,
                (globalT0!==null?((r.t-globalT0)/1000).toFixed(3):''),
                (r.seq??''),r.roll.toFixed(6),r.pitch.toFixed(6),
                (Number.isFinite(r.lat)?r.lat.toFixed(6):''),(Number.isFinite(r.lon)?r.lon.toFixed(6):''),
                (r.gnss_ms??''), r.gnss_iso?`"${r.gnss_iso}"`:''].join(','));
  }
  const csv=lines.join('\n'), blob=new Blob([csv],{type:'text/csv'}), d=new Date(recStartedAt||Date.now());
  const fname=`trollsports_multi_${d.getFullYear()}-${fmt2(d.getMonth()+1)}-${fmt2(d.getDate())}_${fmt2(d.getHours())}-${fmt2(d.getMinutes())}-${fmt2(d.getSeconds())}.csv`;
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fname; document.body.appendChild(a); a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  recInfo.textContent=`Saved ${recRows.length} samples to ${fname}`; log(`saved CSV (${recRows.length} rows)`);
}

// make available to other modules
window.startRec = startRec;
window.stopRec = stopRec;