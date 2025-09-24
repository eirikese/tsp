
// ---------- velocity, distances & VMG ----------
const Rm=6371000;
function projLocalMeters(lat0,lon0,lat,lon){const toR=a=>a*Math.PI/180;return {x:(toR(lon)-toR(lon0))*Math.cos(toR(lat0))*Rm,y:(toR(lat)-toR(lat0))*Rm}}
function bearingFromV(vx,vy){ const toD=a=>a*180/Math.PI; let brg=toD(Math.atan2(vx,vy)); if(brg<0) brg+=360; return brg; }
const KNOTS_PER_MPS=1.94384449;
const MAX_KEEP_SEC=600, FREQ_HOLD_MS=2000, GNSS_KEEP=4000;

// compute orthogonal distance (absolute) from point P to infinite line AB in meters
function orthogonalDistanceToLine(ax,ay,bx,by,px,py){
  const vx=bx-ax, vy=by-ay;
  const wx=px-ax, wy=py-ay;
  const vlen=Math.hypot(vx,vy);
  if(vlen<=0) return Math.hypot(wx,wy);
  const cross = Math.abs(vx*wy - vy*wx);
  return cross / vlen;
}

function updateDistancesForUnit(u, pxy, lat, lon){
  // Dist -> top
  if(topMark){
    const tm = projLocalMeters(u.lat0,u.lon0, topMark.lat, topMark.lon);
    const rx = tm.x - pxy.x, ry = tm.y - pxy.y;
    const dTop = Math.hypot(rx,ry);
    if(u.nowElems.dTop) u.nowElems.dTop.textContent = Number.isFinite(dTop)? dTop.toFixed(1) : '–';
  } else {
    if(u.nowElems.dTop) u.nowElems.dTop.textContent = '–';
  }
  // Dist -> start line (orthogonal to infinite line)
  if(startLine){
    const A = projLocalMeters(u.lat0,u.lon0, startLine.a.lat, startLine.a.lon);
    const B = projLocalMeters(u.lat0,u.lon0, startLine.b.lat, startLine.b.lon);
    const dStart = orthogonalDistanceToLine(A.x,A.y,B.x,B.y,pxy.x,pxy.y);
    if(u.nowElems.dStart) u.nowElems.dStart.textContent = Number.isFinite(dStart)? dStart.toFixed(1) : '–';
  } else {
    if(u.nowElems.dStart) u.nowElems.dStart.textContent = '–';
  }
}

function updateVelocityFromWindow(u,t,lat,lon){
  if(u.lat0===null||u.lon0===null){ u.lat0=lat; u.lon0=lon; }

  const p=projLocalMeters(u.lat0,u.lon0,lat,lon);
  u.posBuf.push({t,lat,lon,x:p.x,y:p.y});
  const winMs=getSogWinSec()*1000;
  while(u.posBuf.length && u.posBuf[0].t < t - winMs){ u.posBuf.shift(); }
  if(u.posBuf.length<2) return;
  // Compute velocity using endpoints of the window via utilities.velocitySafe()
  const first=u.posBuf[0], last=u.posBuf[u.posBuf.length-1];
  const vf = getVelocityFilterConfig();
  const v = vf.enabled ? velocitySafe({x:first.x,y:first.y}, first.t, {x:last.x,y:last.y}, last.t, vf) : velocity({x:first.x,y:first.y}, first.t, {x:last.x,y:last.y}, last.t);
  if(vf.enabled && !v.ok){
    // Update distances even if speed rejected, then bail out from speed/heading update
    updateDistancesForUnit(u, p, lat, lon);
    return;
  }
  const vx=v.vx, vy=v.vy;
  u.vx=vx; u.vy=vy;

  const spd_mps=v.speed_mps, spd_kt=v.speed_knots;

  const alpha=0.2;
  u.sogEMA=(u.sogEMA==null)?spd_kt:(u.sogEMA*(1-alpha)+spd_kt*alpha);
  u.heading=(u.sogEMA>2)?bearingFromV(vx,vy):null;

  const xPlot=(t-globalT0)/1000;
  u.sogTimes.push(t); u.sogVals.push(u.sogEMA); u.sogSeries.push({x:xPlot,y:u.sogEMA});

  // VMG toward top mark (if set)
  if(topMark){
    const m = projLocalMeters(u.lat0,u.lon0, topMark.lat, topMark.lon);
    const rx = m.x - p.x, ry = m.y - p.y;
    const rmag = Math.hypot(rx,ry);
    let vmg_kt = 0;
    if(rmag>0){
      const vmg_mps = (vx*rx + vy*ry) / rmag;
      vmg_kt = vmg_mps * KNOTS_PER_MPS;
    }
    if(Number.isFinite(vmg_kt)){
      u.vmgTimes.push(t); u.vmgVals.push(vmg_kt); u.vmgSeries.push({x:xPlot,y:vmg_kt});
      if(u.nowElems.vmg) u.nowElems.vmg.textContent = vmg_kt.toFixed(2);
    }
  } else {
    if(u.nowElems.vmg) u.nowElems.vmg.textContent = '–';
  }

  // distances
  updateDistancesForUnit(u, p, lat, lon);
}

// ---------- Top Mark placement ----------
function clearVMGSeriesAll(){
  for(const id of Object.keys(units)){
    const u=units[id];
    u.vmgTimes.length=0; u.vmgVals.length=0; u.vmgSeries.length=0;
    if(u.nowElems.vmg) u.nowElems.vmg.textContent = '–';
  }
  chartSOG.update('none');
}
function setTopMark(lat,lon){
  topMark = {lat,lon};
  const accent = cssVar('--accent','#ffcc00');
  window._topMarkCoords = {lat, lon};
  if(topMarkLayer){
    topMarkLayer.setLatLng([lat,lon]);
    topMarkLayer.setStyle({color:accent, fillColor:accent});
  }else{
    topMarkLayer = L.circleMarker([lat,lon],{radius:8,color:accent,fillColor:accent,fillOpacity:1,weight:3}).addTo(map);
  }
  $('topMarkInfo').textContent = `Top mark: ${lat.toFixed(6)}, ${lon.toFixed(6)} — click "Replace Top Mark" to change.`;
  const btn=$('btnTopMark'); if(btn) btn.textContent='Replace Top Mark';
  clearVMGSeriesAll(); // VMG target changed
  log(`Top mark set at ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
}
function startPlaceTopMark(){
  if(!mapInited){ log('map not ready'); return; }
  // Do NOT switch tab
  const msg=$('sogInfo'); if(msg) msg.textContent='Click on the map to set Top Mark…';
  map.once('click', (e)=>{
    setTopMark(e.latlng.lat, e.latlng.lng);
    if(msg) msg.textContent='';
  });
}

// ---------- Start Line placement (two clicks, show first point immediately) ----------
function setStartLine(aLat,aLon,bLat,bLon){
  startLine = { a:{lat:aLat,lon:aLon}, b:{lat:bLat,lon:bLon} };
  window._startLineCoords = {a:{lat:aLat,lon:aLon}, b:{lat:bLat,lon:bLon}};
  const accent = cssVar('--accent','#ffcc00');

  if(startLineLayer){
    startLineLayer.setLatLngs([[aLat,aLon],[bLat,bLon]]);
    startLineLayer.setStyle({color:accent,weight:3,opacity:0.9});
  }else{
    startLineLayer = L.polyline([[aLat,aLon],[bLat,bLon]],{color:accent,weight:3,opacity:0.9}).addTo(map);
  }

  if(!startLineMarkers.a){
    startLineMarkers.a = L.circleMarker([aLat,aLon],{radius:6,color:accent,fillColor:accent,fillOpacity:1}).addTo(map);
  } else {
    startLineMarkers.a.setLatLng([aLat,aLon]).setStyle({color:accent,fillColor:accent});
  }
  if(!startLineMarkers.b){
    startLineMarkers.b = L.circleMarker([bLat,bLon],{radius:6,color:accent,fillColor:accent,fillOpacity:1}).addTo(map);
  } else {
    startLineMarkers.b.setLatLng([bLat,bLon]).setStyle({color:accent,fillColor:accent});
  }

  $('startLineInfo').textContent = `Start line: A ${aLat.toFixed(6)},${aLon.toFixed(6)} — B ${bLat.toFixed(6)},${bLon.toFixed(6)} (Replace Start Line to change).`;
  const btn=$('btnStartLine'); if(btn) btn.textContent='Replace Start Line';
  log('Start line set.');
}

function startPlaceStartLine(){
  if(!mapInited){ log('map not ready'); return; }
  // Do NOT switch tab
  placingStartPhase = 1;
  $('sogInfo').textContent = 'Click on the map to set start line point A…';
  let A = null;

  const accent = cssVar('--accent','#ffcc00');

  const clickA = (e)=>{
    A = e.latlng;
    // Show first point immediately
    if(!startLineMarkers.a){
      startLineMarkers.a = L.circleMarker([A.lat,A.lng],{radius:6,color:accent,fillColor:accent,fillOpacity:1}).addTo(map);
    } else {
      startLineMarkers.a.setLatLng([A.lat,A.lng]).setStyle({color:accent,fillColor:accent});
    }
    // If there was a previous B marker but no line, hide it for now
    if(startLineMarkers.b && !startLineLayer){
      startLineMarkers.b.setStyle({opacity:0, fillOpacity:0});
    }
    $('sogInfo').textContent = 'Click on the map to set start line point B…';
    placingStartPhase = 2;
    map.once('click', clickB);
  };
  const clickB = (e)=>{

    const B = e.latlng;
    // Reveal/update B marker immediately too
    if(!startLineMarkers.b){
      startLineMarkers.b = L.circleMarker([B.lat,B.lng],{radius:6,color:accent,fillColor:accent,fillOpacity:1}).addTo(map);
    } else {
      startLineMarkers.b.setLatLng([B.lat,B.lng]).setStyle({color:accent,fillColor:accent,opacity:1,fillOpacity:1});
    }
    setStartLine(A.lat,A.lng,B.lat,B.lng);
    $('sogInfo').textContent = '';
    placingStartPhase = 0;
  };

  map.once('click', clickA);
}

// windows
const sogRange = document.getElementById('sogWinRange');
const sogNum = document.getElementById('sogWin');
function getSogWinSec(){ return clamp(parseInt((sogNum?.value)||'8',10),3,30); }
if (sogRange && sogNum) {
  sogRange.addEventListener('input',e=>sogNum.value=e.target.value);
  sogNum.addEventListener('change',e=>sogRange.value=e.target.value);
}


// make available to other modules
window.setTopMark = setTopMark;
window.startPlaceTopMark = startPlaceTopMark;
window.setStartLine = setStartLine;
window.startPlaceStartLine = startPlaceStartLine;
window.clearVMGSeriesAll = clearVMGSeriesAll;
window.updateVelocityFromWindow = updateVelocityFromWindow;
window.updateDistancesForUnit = updateDistancesForUnit;
window.orthogonalDistanceToLine = orthogonalDistanceToLine;
window.bearingFromV = bearingFromV;
window.projLocalMeters = projLocalMeters;
window.getSogWinSec = getSogWinSec;
window.KNOTS_PER_MPS = KNOTS_PER_MPS;
window.Rm = Rm;
window.MAX_KEEP_SEC = MAX_KEEP_SEC;
window.FREQ_HOLD_MS = FREQ_HOLD_MS;
window.GNSS_KEEP = GNSS_KEEP;