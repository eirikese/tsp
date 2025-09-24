// ---------- utilities ----------
function log(s){const el=$('log');el.textContent+=s+"\\n";el.scrollTop=el.scrollHeight}
function setStatus(t,ok=false){$('status').textContent=t;$('status').className=ok?'ok':'bad'}
function meanStd(a){if(!a.length)return{mean:NaN,std:NaN};const m=a.reduce((x,y)=>x+y,0)/a.length;const v=a.reduce((x,y)=>x+(y-m)*(y-m),0)/a.length;return{mean:m,std:Math.sqrt(v)}}
function fmt2(n){return n.toString().padStart(2,'0')}
const b64d=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
async function deriveKey(pw,salt){const enc=new TextEncoder();const mat=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:120000,hash:'SHA-256'},mat,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function decryptCreds(pass,blob){const j=JSON.parse(atob(blob));const key=await deriveKey(pass,b64d(j.salt));const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64d(j.iv)},key,b64d(j.ct));return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)))}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Compute velocity between two positions and timestamps.
// Supports positions as:
// - {x, y} in meters (local Cartesian)
// - {lat, lon} in degrees
// - [lat, lon] array in degrees
// Timestamps t1, t2 are in milliseconds. Returns an object:
// { vx, vy, speed_mps, speed_knots, bearing_deg, dt_s }
// vx, vy are in m/s in a local "east (x), north (y)" frame.
function velocity(p1, t1, p2, t2){
	const Rm = 6371000; // Earth radius (m)
	const KNOTS_PER_MPS = 1.94384449;
	const toR=a=>a*Math.PI/180;
	const bearingFromV=(vx,vy)=>{ let b=Math.atan2(vx,vy)*180/Math.PI; if(b<0) b+=360; return b; };

	const dt_s = (Number(t2)-Number(t1))/1000;
	if(!(dt_s>0)){
		return {vx:NaN, vy:NaN, speed_mps:NaN, speed_knots:NaN, bearing_deg:null, dt_s};
	}

	const hasXY = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
	const isLatLonObj = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
	const isLatLonArr = p => Array.isArray(p) && p.length>=2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

	let dx=NaN, dy=NaN;
	if(hasXY(p1) && hasXY(p2)){
		dx = p2.x - p1.x; dy = p2.y - p1.y;
	} else if(isLatLonObj(p1) && isLatLonObj(p2)){
		const lat1=toR(p1.lat), lon1=toR(p1.lon);
		const lat2=toR(p2.lat), lon2=toR(p2.lon);
		const mlat = (lat1+lat2)/2;
		dx = (lon2-lon1)*Math.cos(mlat)*Rm; // east
		dy = (lat2-lat1)*Rm;                // north
	} else if(isLatLonArr(p1) && isLatLonArr(p2)){
		const lat1=toR(p1[0]), lon1=toR(p1[1]);
		const lat2=toR(p2[0]), lon2=toR(p2[1]);
		const mlat = (lat1+lat2)/2;
		dx = (lon2-lon1)*Math.cos(mlat)*Rm;
		dy = (lat2-lat1)*Rm;
	}

	const vx = dx/dt_s, vy = dy/dt_s;
	const speed_mps = Math.hypot(vx,vy);
	const speed_knots = speed_mps*KNOTS_PER_MPS;
	const bearing_deg = Number.isFinite(speed_mps) && speed_mps>0 ? bearingFromV(vx,vy) : null;
	return {vx, vy, speed_mps, speed_knots, bearing_deg, dt_s};
}

	// Wrapper around velocity() that rejects or caps implausible values.
	// Options:
	// - minDtS (default 0.05s): reject if dt is too small
	// - maxDtS (default 60s): reject if dt is too large
	// - maxSpeedKnots (default 80 kt) or maxSpeedMps: max plausible speed
	// - mode: 'reject' | 'cap' (default 'reject')
	// Returns the same fields as velocity(), plus:
	// - ok: boolean (true if within limits or successfully capped)
	// - reason: string if ok===false
	// - capped: boolean if mode==='cap' and speed exceeded
	function velocitySafe(p1, t1, p2, t2, opts={}){
		const KNOTS_PER_MPS = 1.94384449;
		const cfg = {
			minDtS: 0.05,
			maxDtS: 3,
			maxSpeedKnots: 25,
			mode: 'reject', // or 'cap'
			...opts
		};
		const v = velocity(p1, t1, p2, t2);
		const dt = v.dt_s;
		if(!(dt>0) || !Number.isFinite(dt)){
			return { ...v, ok:false, reason:'invalid_dt' };
		}
		if(dt < cfg.minDtS){
			return { ...v, ok:false, reason:'dt_below_min' };
		}
		if(dt > cfg.maxDtS){
			return { ...v, ok:false, reason:'dt_above_max' };
		}
		if(!Number.isFinite(v.speed_mps)){
			return { ...v, ok:false, reason:'non_finite_speed' };
		}
		const maxMps = Number.isFinite(cfg.maxSpeedMps) ? cfg.maxSpeedMps : (cfg.maxSpeedKnots / KNOTS_PER_MPS);
		if(v.speed_mps > maxMps){
			if(cfg.mode === 'cap'){
				// Scale velocity vector down to the max speed while preserving direction
				const scale = maxMps / v.speed_mps;
				const vx = v.vx * scale, vy = v.vy * scale;
				const speed_mps = maxMps;
				const speed_knots = speed_mps * KNOTS_PER_MPS;
				const bearing_deg = (speed_mps>0) ? (Math.atan2(vx,vy)*180/Math.PI + 360) % 360 : null;
				return { vx, vy, speed_mps, speed_knots, bearing_deg, dt_s: dt, ok:true, capped:true };
			}
			return { ...v, ok:false, reason:'speed_exceeds_max' };
		}
		return { ...v, ok:true };
	}

// ---- Velocity filter global config helpers ----
const DEFAULT_VEL_FILTER = { enabled: true, maxSpeedKnots: 30, minDtS: 0.05, maxDtS: 40, mode: 'reject' };
function normalizeVelFilter(cfg){
	const c = { ...DEFAULT_VEL_FILTER, ...(cfg||{}) };
	// Basic sanitization
	c.enabled = !!c.enabled;
	c.maxSpeedKnots = Number.isFinite(c.maxSpeedKnots) ? clamp(c.maxSpeedKnots, 1, 300) : DEFAULT_VEL_FILTER.maxSpeedKnots;
	c.minDtS = Number.isFinite(c.minDtS) ? clamp(c.minDtS, 0.01, 5) : DEFAULT_VEL_FILTER.minDtS;
	c.maxDtS = Number.isFinite(c.maxDtS) ? clamp(c.maxDtS, 1, 600) : DEFAULT_VEL_FILTER.maxDtS;
	c.mode = (c.mode==='cap'?'cap':'reject');
	return c;
}
function loadVelocityFilterConfig(){
	try{
		const raw = localStorage.getItem('velocityFilterConfig');
		const cfg = normalizeVelFilter(raw?JSON.parse(raw):DEFAULT_VEL_FILTER);
		window.velocityFilterConfig = cfg; // cache
		return cfg;
	}catch(e){
		const cfg = { ...DEFAULT_VEL_FILTER };
		window.velocityFilterConfig = cfg;
		return cfg;
	}
}
function saveVelocityFilterConfig(cfg){
	const norm = normalizeVelFilter(cfg);
	localStorage.setItem('velocityFilterConfig', JSON.stringify(norm));
	window.velocityFilterConfig = norm;
	return norm;
}
function getVelocityFilterConfig(){
	return window.velocityFilterConfig ? window.velocityFilterConfig : loadVelocityFilterConfig();
}

// make available to other modules
window.log = log;
window.setStatus = setStatus;
window.meanStd = meanStd;
window.fmt2 = fmt2;
window.b64d = b64d;
window.deriveKey = deriveKey;
window.decryptCreds = decryptCreds;
window.clamp = clamp;
window.velocity = velocity;
window.velocitySafe = velocitySafe;
window.loadVelocityFilterConfig = loadVelocityFilterConfig;
window.saveVelocityFilterConfig = saveVelocityFilterConfig;
window.getVelocityFilterConfig = getVelocityFilterConfig;
