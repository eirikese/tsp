// ---------- receiver clock-based plotting ----------
let plotTimer = null;
let livePlottingEnabled = true;
let lastPlotT = 0;
function startPlotTimer() {
  if (plotTimer) clearInterval(plotTimer);
  if (!livePlottingEnabled || (window.isStayAwakeMode && window.isStayAwakeMode())) return;
  plotTimer = setInterval(() => {
    if (window.isStayAwakeMode && window.isStayAwakeMode()) return; // Don't update plots in stay awake mode
    const now = Date.now();
    if (globalT0 === null) {
      // Set globalT0 to the earliest data point across all units
      let t0 = null;
      for (const id of Object.keys(units)) {
        if (units[id].times.length) {
          const t = units[id].times[0];
          if (t0 === null || t < t0) t0 = t;
        }
      }
      if (t0 !== null) globalT0 = t0;
      else return;
    }
    const tPlot = now;
    const x = (tPlot - globalT0) / 1000;
    for (const id of Object.keys(units)) {
      const u = units[id];
      // Find the latest sample for this unit
      let yR = null;
      if (u.times.length) {
        // Only use data if it arrived since last plot tick
        const lastT = u.times[u.times.length - 1];
        if (!u._lastPlottedT || lastT > u._lastPlottedT) {
          yR = u.roll[u.roll.length - 1];
          u._lastPlottedT = lastT;
        }
      }
      // If new data, append; if not, append a gap (null)
      if (yR !== null) {
        u.seriesRoll.push({ x, y: yR });
      } else {
        u.seriesRoll.push({ x, y: null });
      }
      // Pitch plotting removed
    }
    pruneOld(tPlot);
    recomputePeaks();
    updateAxisRange();
    chartTS.update('none');
    chartSOG.update('none');
    lastPlotT = tPlot;
  }, 100); // 10Hz
}

// make available to other modules
window.startPlotTimer = startPlotTimer;
window.setLivePlottingEnabled = (enabled) => {
  livePlottingEnabled = enabled;
    if (livePlottingEnabled) startPlotTimer();
    else if (plotTimer) {
        clearInterval(plotTimer);
        plotTimer = null;
    }
};
window.isLivePlottingEnabled = () => livePlottingEnabled;
