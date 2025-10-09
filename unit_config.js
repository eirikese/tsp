// Athlete colors and configurations
const COLORS_PALETTE = [
  { name: 'Orange', value: '#ff9f1c' },
  { name: 'Blue', value: '#4cc9f0' },
  { name: 'Purple', value: '#9b5de5' },
  { name: 'Gold', value: '#ffd166' },
  { name: 'Red', value: '#ef476f' },
  { name: 'Emerald', value: '#06d6a0' },
  { name: 'Teal', value: '#00b4d8' },
  { name: 'Pink', value: '#ff70a6' }
];

let COLORS_BASE = COLORS_PALETTE.slice(0, 4).map(c => c.value); // Default first 4 colors
const UNIT_CONFIG_KEY = 'unitColors';

// Load saved unit configurations
function loadUnitConfig() {
  try {
    const saved = localStorage.getItem(UNIT_CONFIG_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch(e) {
    console.warn('Failed to load unit config:', e);
    return {};
  }
}

// Save unit configurations
function saveUnitConfig() {
  const config = {};
  const configRows = document.querySelectorAll('.unit-config-row');
  configRows.forEach(row => {
    const unitId = row.dataset.unit;
    const customName = row.querySelector('.unit-custom-name').value;
    const color = row.querySelector('.unit-color').value;
    if (unitId) {
      config[unitId] = { customName, name: customName, color };
    }
  });
  
  try {
    localStorage.setItem(UNIT_CONFIG_KEY, JSON.stringify(config));
    // Update any visible reports with new colors
    const activeReportBtn = document.querySelector('#reportsTabs .tabbtn.active');
    if (activeReportBtn) {
      showReportFor(activeReportBtn.dataset.recId);
    }
    const status = document.getElementById('configStatus');
    status.textContent = 'Configuration saved successfully';
    status.style.color = '#16c26e';
    setTimeout(() => status.textContent = '', 3000);
    return true;
  } catch(e) {
    console.warn('Failed to save unit config:', e);
    const status = document.getElementById('configStatus');
    status.textContent = 'Failed to save configuration';
    status.style.color = '#ff6b6b';
    return false;
  }
}

// Update unit config row or create new one
function updateUnitConfigRow(unitId) {
  const container = document.getElementById('unitsConfig');
  if (!container) return;

  let row = container.querySelector(`.unit-config-row[data-unit="${unitId}"]`);
  const config = loadUnitConfig();
  const savedConfig = config[unitId] || {};
  
  if (!row) {
    row = document.createElement('div');
    row.className = 'unit-config-row';
    row.dataset.unit = unitId;
    row.style.display = 'grid';
    row.style.gridTemplateColumns = 'minmax(80px, 1fr) minmax(120px, 1.5fr) minmax(100px, 1fr)';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    
    // Original name label
    const origLabel = document.createElement('div');
    origLabel.className = 'small';
    origLabel.textContent = unitId;
    row.appendChild(origLabel);

    // Custom name input
    const nameInput = document.createElement('input');
    nameInput.className = 'unit-custom-name';
    nameInput.type = 'text';
    nameInput.placeholder = 'Custom name';
    nameInput.value = savedConfig.customName || '';
    row.appendChild(nameInput);

    // Color select
    const colorSelect = document.createElement('select');
    colorSelect.className = 'unit-color';
    COLORS_PALETTE.forEach(color => {
      const opt = document.createElement('option');
      opt.value = color.value;
      opt.textContent = color.name;
      if (color.value === (savedConfig.color || COLORS_BASE[discoveredOrder.indexOf(unitId) % COLORS_BASE.length])) {
        opt.selected = true;
      }
      colorSelect.appendChild(opt);
    });
    row.appendChild(colorSelect);

    container.appendChild(row);
  }
}

// Apply configuration to a unit
function applyUnitConfig(unitId) {
  const config = loadUnitConfig();
  const savedConfig = config[unitId];
  if (savedConfig) {
    const unit = units[unitId];
    if (unit) {
      const displayName = savedConfig.customName || unitId;
      unit.baseColor = savedConfig.color;
      unit.customName = displayName;
      // Update any displayed elements
      const tagNow = document.getElementById(`tag-${unitId}`);
      const tagSet = document.getElementById(`tag-${unitId}-settings`);
      if (tagNow) tagNow.textContent = displayName;
      if (tagSet) tagSet.textContent = unit.customName;

      // Update chart labels
      if (chartTS) {
        if (unit.idxRoll != null) chartTS.data.datasets[unit.idxRoll].label = `${unit.customName} heel`;
        if (unit.idxPitch != null) chartTS.data.datasets[unit.idxPitch].label = `${unit.customName} trim`;
        if (unit.idxRollPk != null) chartTS.data.datasets[unit.idxRollPk].label = `${unit.customName} heel peaks`;
        if (unit.idxPitchPk != null) chartTS.data.datasets[unit.idxPitchPk].label = `${unit.customName} trim peaks`;
        chartTS.update('none');
      }
      
      // Update SOG chart labels
      if (chartSOG) {
        if (unit.idxSOG != null) chartSOG.data.datasets[unit.idxSOG].label = `${unit.customName} SOG`;
        if (unit.idxVMG != null) chartSOG.data.datasets[unit.idxVMG].label = `${unit.customName} VMG`;
        chartSOG.update('none');
      }

      // Update distribution chart labels
      if (distCharts.roll) {
        const rI = distIdx.roll[unitId];
        if (rI != null) {
          distCharts.roll.data.datasets[rI].label = unit.customName;
          distCharts.roll.update('none');
        }
      }
      if (distCharts.pitch) {
        const pI = distIdx.pitch[unitId];
        if (pI != null) {
          distCharts.pitch.data.datasets[pI].label = unit.customName;
          distCharts.pitch.update('none');
        }
      }
      if (distCharts.freq) {
        const fI = distIdx.freq[unitId];
        if (fI != null) {
          distCharts.freq.data.datasets[fI].label = unit.customName;
          distCharts.freq.update('none');
        }
      }

      // Update sync selector option label if present
      const syncSelect = document.getElementById('syncRef');
      if (syncSelect) {
        // Find the option for this unitId
        const syncOpt = Array.from(syncSelect.options).find(opt => opt.value === unitId);
        if (syncOpt) syncOpt.textContent = unit.customName;
      }

      refreshUnitStylesForTheme();
    }
  }
}

// make available to other modules
window.updateUnitConfigRow = updateUnitConfigRow;
window.applyUnitConfig = applyUnitConfig;
window.saveUnitConfig = saveUnitConfig;
window.loadUnitConfig = loadUnitConfig;
window.COLORS_BASE = COLORS_BASE;
window.COLORS_PALETTE = COLORS_PALETTE;
window.UNIT_CONFIG_KEY = UNIT_CONFIG_KEY;

// Return unit IDs in the Settings (Athlete Configuration) order.
// Fallbacks: saved config key order, then discovered live order.
function getConfigOrder() {
  try {
    // If Settings UI is present, prefer DOM row order
    const container = document.getElementById('unitsConfig');
    if (container) {
      const rows = container.querySelectorAll('.unit-config-row');
      if (rows && rows.length) {
        return Array.from(rows).map(r => r.dataset.unit).filter(Boolean);
      }
    }
    // Else, use saved config insertion order
    const cfg = loadUnitConfig();
    const ids = Object.keys(cfg);
    if (ids && ids.length) return ids;
  } catch {}
  // Last resort: discovered live order or known units
  if (Array.isArray(window.discoveredOrder) && window.discoveredOrder.length) return window.discoveredOrder.slice();
  if (window.units) return Object.keys(window.units);
  return [];
}
window.getConfigOrder = getConfigOrder;
