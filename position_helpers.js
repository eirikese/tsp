
// ---------- distances & helpers ----------
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
    if(u.nowElems.dTop) u.nowElems.dTop.textContent = Number.isFinite(dTop)? dTop.toFixed(0) : '–';
  } else {
    if(u.nowElems.dTop) u.nowElems.dTop.textContent = '–';
  }
  // Dist -> start line (orthogonal to infinite line)
  if(startLine){
    const A = projLocalMeters(u.lat0,u.lon0, startLine.a.lat, startLine.a.lon);
    const B = projLocalMeters(u.lat0,u.lon0, startLine.b.lat, startLine.b.lon);
    const dStart = orthogonalDistanceToLine(A.x,A.y,B.x,B.y,pxy.x,pxy.y);
    if(u.nowElems.dStart) u.nowElems.dStart.textContent = Number.isFinite(dStart)? dStart.toFixed(0) : '–';
  } else {
    if(u.nowElems.dStart) u.nowElems.dStart.textContent = '–';
  }
}

// Removed client-side velocity and heading calculations. Device-provided SOG/HDG are used instead.

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

// Removed SOG smoothing window controls; no client-side velocity computation.

// ---------- Coach (phone) live position on map ----------
let coachWatchId = null;
let coachMarker = null;
let coachPrev = null;

function coachComputeBearing(lat1, lon1, lat2, lon2){
  const toR=d=>d*Math.PI/180, toD=r=>r*180/Math.PI;
  const φ1=toR(lat1), φ2=toR(lat2), Δλ=toR(lon2-lon1);
  const y=Math.sin(Δλ)*Math.cos(φ2);
  const x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  let θ=toD(Math.atan2(y,x));
  return ((θ%360)+360)%360;
}

function ensureCoachMarker(){
  if(!mapInited){ log('map not ready'); return; }
  if(!coachMarker){
    const icon = L.divIcon({
      className: 'coach-icon',
      html: '<div class="coach-rot" style="width:34px;height:34px;transform-origin:50% 55%;display:flex;align-items:center;justify-content:center;">\
        <svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">\
          <polygon points="17,2 32,32 2,32" fill="#1e90ff" stroke="#0a64c9" stroke-width="2" />\
        </svg>\
      </div>',
      iconSize: [34,34],
      iconAnchor: [17,17]
    });
    coachMarker = L.marker([0,0], { icon, interactive:false, keyboard:false });
    coachMarker.addTo(map);
  }
}

function setCoachHeading(deg){
  try{
    const el = coachMarker?.getElement()?.querySelector('.coach-rot');
    if(el) el.style.transform = `rotate(${deg}deg)`;
  }catch{}
}

function onCoachPos(pos){
  if(!mapInited) return;
  const lat = pos?.coords?.latitude;
  const lon = pos?.coords?.longitude;
  if(!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  ensureCoachMarker();
  coachMarker.setLatLng([lat, lon]);
  let hdg = pos?.coords && Number.isFinite(pos.coords.heading) ? pos.coords.heading : null;
  if(hdg==null && coachPrev){
    const b = coachComputeBearing(coachPrev.lat, coachPrev.lon, lat, lon);
    if(Number.isFinite(b)) hdg = b;
  }
  if(Number.isFinite(hdg)) setCoachHeading(hdg);
  coachPrev = {lat, lon};
  if(!firstMapFixDone) fitMapIfFirst(lat, lon);
}

function onCoachErr(err){
  const code = (typeof err?.code === 'number') ? err.code : null;
  const msg = err?.message || String(err);
  log('Geolocation error ('+code+'): '+msg);
  stopCoachWatch();
  // Help users on iOS/Safari when permission is denied or insecure context
  if(code === 1 /* PERMISSION_DENIED */){
    const help = [
      'Location permission was denied. On iPad/Safari:',
      '• Serve this page over HTTPS (or use http://localhost in development).',
      '• Settings > Privacy & Security > Location Services must be ON.',
      '• For Safari: Settings > Safari > Location > Allow While Using.',
      '• If using “Add to Home Screen” (web app): open Settings > [Web App name] > Location > While Using.',
      'Then reload the page and tap “Show Coach” again.'
    ].join('\n');
    try{ alert(help); }catch{}
  } else if(!window.isSecureContext){
    try{ alert('This page is not in a secure context. Please open it via HTTPS or localhost, then try again.'); }catch{}
  } else {
    try{ alert('Location error: '+msg); }catch{}
  }
}

function startCoachWatch(){
  if(!('geolocation' in navigator)){
    try{ alert('Geolocation is not supported on this device/browser.'); }catch{}
    return;
  }
  // Require secure context for geolocation in modern Safari/Chrome
  if(!window.isSecureContext){
    try{ alert('This page is not secure. Please use HTTPS (or http://localhost) to enable location on iPad/Safari.'); }catch{}
    return;
  }
  // Preflight: if Permissions API is available and already denied, guide the user
  if(navigator.permissions && navigator.permissions.query){
    try{
      navigator.permissions.query({ name: 'geolocation' }).then(res => {
        if(res && res.state === 'denied'){
          try{ alert('Location is blocked for this site. On iPad: Settings > Safari > Location > Allow While Using, then reload.'); }catch{}
          return;
        }
        // If 'granted' or 'prompt', proceed to watch
      });
    }catch{}
  }
  if(coachWatchId!=null) return; // already running
  coachPrev = null;
  coachWatchId = navigator.geolocation.watchPosition(onCoachPos, onCoachErr, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000
  });
  const b=document.getElementById('btnCoach'); if(b) b.textContent='Hide Coach';
  // ensure user sees the map
  if(typeof selectTab==='function') selectTab('map');
}

function stopCoachWatch(){
  if(coachWatchId!=null){
    try{ navigator.geolocation.clearWatch(coachWatchId); }catch{}
    coachWatchId = null;
  }
  if(coachMarker){
    try{ map.removeLayer(coachMarker); }catch{}
    coachMarker = null;
  }
  coachPrev = null;
  const b=document.getElementById('btnCoach'); if(b) b.textContent='Show Coach';
}

// Wire up button after DOM is ready (scripts load in <head>)
function bindCoachButton(){
  const b=document.getElementById('btnCoach');
  if(!b || b._coachBound) return;
  b._coachBound = true;
  b.addEventListener('click', function(){
    if(coachWatchId==null) startCoachWatch(); else stopCoachWatch();
  });
}
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', bindCoachButton);
} else {
  bindCoachButton();
}


// make available to other modules
window.setTopMark = setTopMark;
window.startPlaceTopMark = startPlaceTopMark;
window.setStartLine = setStartLine;
window.startPlaceStartLine = startPlaceStartLine;
window.clearVMGSeriesAll = clearVMGSeriesAll;
window.updateDistancesForUnit = updateDistancesForUnit;
window.orthogonalDistanceToLine = orthogonalDistanceToLine;
window.bearingFromV = bearingFromV;
window.projLocalMeters = projLocalMeters;
window.KNOTS_PER_MPS = KNOTS_PER_MPS;
window.Rm = Rm;
window.MAX_KEEP_SEC = MAX_KEEP_SEC;
window.FREQ_HOLD_MS = FREQ_HOLD_MS;
window.GNSS_KEEP = GNSS_KEEP;
window.startCoachWatch = startCoachWatch;
window.stopCoachWatch = stopCoachWatch;