// Manual wind input for TrollSports Live
// Provides a simple prompt to set wind direction (deg FROM) and strength (kt)

(function(){
		let manualWind = null; // {direction, strengthKnots, timestamp}

	function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
	function msToKnots(ms){ return ms * 1.943844; }

		// Shared helpers
		function normalizeDeg(d){ return ((d%360)+360)%360; }
		function angleDiffDeg(a,b){ // signed a-b in [-180,180]
			let d = normalizeDeg(a) - normalizeDeg(b);
			if(d>180) d-=360; if(d<-180) d+=360; return d;
		}
		function getActiveWindDirection(){
			if (window.windManual && typeof window.windManual.getCurrent === 'function'){
				const w = window.windManual.getCurrent();
				if (w && Number.isFinite(w.direction)) return w.direction;
			}
			if (window.windForecast && typeof window.windForecast.getCurrentData === 'function'){
				const f = window.windForecast.getCurrentData();
				if (f && Number.isFinite(f.direction)) return f.direction;
			}
			return null;
		}
		function createSmallWindArrowSVG(direction, size=24){
			const arrowDirection = (direction + 180) % 360;
			const stroke = '#fff';
			const fill = '#fff';
			return `
			<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;transform: rotate(${arrowDirection}deg);">
				<g transform="translate(${size/2}, ${size/2})">
					<line x1="0" y1="-${size/2.4}" x2="0" y2="${size/3}" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>
					<polygon points="0,-${size/2.4} -6,-${size/2.4-8} 6,-${size/2.4-8}" fill="${fill}"/>
				</g>
			</svg>`;
		}

			// --- Leaflet overlay (small wind box on map) ---
			let windControl=null, windControlDiv=null;
				function ensureOverlay(){
				try{
					if(typeof L==='undefined') return; // Leaflet not loaded yet
						if(typeof map==='undefined' || !map) return; // map not ready (global 'map' from index)
					if(windControl) return;
					windControl = L.control({position:'topright'});
					windControl.onAdd = function(){
						const div = L.DomUtil.create('div','wind-ctl');
						div.style.cssText = 'padding:6px 8px;background:rgba(0,0,0,0.55);color:#fff;border-radius:6px;font:12px/1.2 monospace;box-shadow:0 2px 6px rgba(0,0,0,0.2)';
					div.innerHTML = '<div style="display:flex;align-items:center;gap:8px;"><div id="wind-arrow" style="width:24px;height:24px;"></div><div><div>Wind <span id="wind-str">–</span> kt</div><div><span id="wind-dir">–</span>°</div></div></div>';
						windControlDiv = div; return div;
					};
						windControl.addTo(map);
				}catch{}
			}
			function updateOverlay(data){
				ensureOverlay();
				if(!windControlDiv) return;
				const strEl = windControlDiv.querySelector('#wind-str');
				const dirEl = windControlDiv.querySelector('#wind-dir');
				// compass text removed by request
				const arrowEl = windControlDiv.querySelector('#wind-arrow');
					if(!data){
					if(strEl) strEl.textContent = '–';
					if(dirEl) dirEl.textContent = '–';
					if(arrowEl) arrowEl.innerHTML = '';
					return;
				}
				if(strEl) strEl.textContent = Number.isFinite(data.strengthKnots)? data.strengthKnots.toFixed(1): '–';
				if(dirEl) dirEl.textContent = Number.isFinite(data.direction)? data.direction.toFixed(0): '–';
				if(arrowEl){
					if(Number.isFinite(data.direction)){
						arrowEl.innerHTML = createSmallWindArrowSVG(data.direction, 24);
						arrowEl.title = `Wind from ${data.direction.toFixed(0)}°`;
					}else{
						arrowEl.innerHTML = '';
						arrowEl.removeAttribute('title');
					}
				}
			}

	function createArrowSVG(direction, size=70){
		const arrowDirection = (direction + 180) % 360; // point TO
		return `
		<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(${arrowDirection}deg);">
			<defs>
				<linearGradient id="arrowGradientManual" x1="0%" y1="0%" x2="100%" y2="100%">
					<stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
					<stop offset="100%" style="stop-color:#059669;stop-opacity:1" />
				</linearGradient>
				<filter id="arrow-manual-glow" x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="2" result="coloredBlur"/>
					<feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
				<filter id="arrow-manual-shadow" x="-50%" y="-50%" width="200%" height="200%">
					<feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
				</filter>
			</defs>
			<g transform="translate(${size/2}, ${size/2})">
				<circle cx="0" cy="0" r="${size/3}" fill="rgba(16,185,129,0.10)" stroke="rgba(16,185,129,0.35)" stroke-width="1"/>
				<line x1="0" y1="-${size/2.2}" x2="0" y2="${size/3}" stroke="url(#arrowGradientManual)" stroke-width="5" stroke-linecap="round" filter="url(#arrow-manual-shadow)"/>
				<polygon points="0,-${size/2.2} -10,-${size/2.2-12} 10,-${size/2.2-12}" fill="url(#arrowGradientManual)" filter="url(#arrow-manual-glow)"/>
				<line x1="-7" y1="${size/3-8}" x2="0" y2="${size/3}" stroke="url(#arrowGradientManual)" stroke-width="4" stroke-linecap="round"/>
				<line x1="7" y1="${size/3-8}" x2="0" y2="${size/3}" stroke="url(#arrowGradientManual)" stroke-width="4" stroke-linecap="round"/>
				<circle cx="0" cy="0" r="3" fill="#ffffff" stroke="url(#arrowGradientManual)" stroke-width="2"/>
			</g>
		</svg>`;
	}

		// No tile rendering; overlay is managed centrally by index.html

	function set(directionDeg, strengthKt){
		let dir = Number(directionDeg);
		let spd = Number(strengthKt);
		if(!Number.isFinite(dir) || !Number.isFinite(spd)) return false;
		dir = ((dir % 360) + 360) % 360;
		spd = clamp(spd, 0, 200);
			manualWind = { direction: dir, strengthKnots: spd, timestamp: Date.now() };
			try{ window.dispatchEvent(new CustomEvent('manualWindChanged',{detail:manualWind})); }catch{}
		return true;
	}

	function promptSet(){
		const dStr = prompt('Wind direction (deg FROM, 0-359):', manualWind ? manualWind.direction.toFixed(0) : '0');
		if(dStr===null) return; // cancel
		const sStr = prompt('Wind strength (kt):', manualWind ? manualWind.strengthKnots.toFixed(1) : '10');
		if(sStr===null) return;
		const d = parseFloat(dStr);
		const s = parseFloat(sStr);
		if(!Number.isFinite(d) || !Number.isFinite(s)){
			alert('Please enter numeric values.');
			return;
		}
		if(d < 0 || d >= 360){
			alert('Direction must be between 0 and 359.');
			return;
		}
		if(s < 0){
			alert('Strength must be >= 0.');
			return;
		}
		set(d, s);
	}

		function hide(){ manualWind=null; try{ window.dispatchEvent(new CustomEvent('manualWindChanged',{detail:null})); }catch{} }

	function toggle(){
			if(manualWind){ hide(); return false; }
			promptSet(); return !!manualWind;
	}

				function init(){
					// Ensure overlay once map is ready (retry a few times in case map initializes slightly later)
					let attempts = 0;
					const timer = setInterval(()=>{
						ensureOverlay();
						attempts++;
						if(windControl || attempts>20) clearInterval(timer);
					}, 150);
				// Keep overlay synced with wind sources
				window.addEventListener('manualWindChanged', (e)=>{ updateOverlay(e?.detail||null); });
				window.addEventListener('forecastWindChanged', (e)=>{
					const manual = (window.windManual && window.windManual.getCurrent && window.windManual.getCurrent());
					if(!manual) updateOverlay(e?.detail||null);
				});
					// Initialize with current state if available
					try{
						const manual = (window.windManual && window.windManual.getCurrent && window.windManual.getCurrent());
						if(manual){ updateOverlay(manual); }
						else if(window.windForecast && typeof window.windForecast.getCurrentData==='function'){
							const data = window.windForecast.getCurrentData();
							if(data) updateOverlay(data);
						}
					}catch{}
			}
		function cleanup(){ hide(); manualWind=null; }

		window.windManual = { promptSet, set, toggle, hide, init, cleanup, getCurrent: ()=>manualWind,
			// helpers
			normalizeDeg, angleDiffDeg, getActiveWindDirection, createSmallWindArrowSVG };
})();

