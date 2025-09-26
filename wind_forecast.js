// Wind forecast functionality for TrollSports Live
// Uses OpenWeatherMap API for wind data

// API configuration - replace with your OpenWeatherMap API key
const OPENWEATHER_API_KEY = 'YOUR_API_KEY_HERE'; // You need to get this from openweathermap.org
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

// Wind data cache
let currentWindData = null;
let windUpdateTimeout = null;

// Convert wind speed from m/s to knots
function msToKnots(ms) {
  return ms * 1.943844;
}


// Get the position of the first unit
function getFirstUnitPosition() {
  const unitIds = Object.keys(units);
  if (unitIds.length === 0) {
    return null;
  }
  
  const firstUnit = units[unitIds[0]];
  if (!firstUnit || firstUnit.gnssLatLngs.length === 0) {
    return null;
  }
  
  // Get the latest position
  const latestPos = firstUnit.gnssLatLngs[firstUnit.gnssLatLngs.length - 1];
  return {
    lat: latestPos[0],
    lon: latestPos[1]
  };
}

// Fetch wind data from OpenWeatherMap API
async function fetchWindData(lat, lon) {
  if (!OPENWEATHER_API_KEY || OPENWEATHER_API_KEY === 'YOUR_API_KEY_HERE') {
    throw new Error('OpenWeatherMap API key not configured. Please set OPENWEATHER_API_KEY in wind.js');
  }
  
  try {
    const url = `${OPENWEATHER_BASE_URL}?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.wind) {
      throw new Error('No wind data in API response');
    }
    
    return {
      speed: data.wind.speed, // m/s
      direction: data.wind.deg, // degrees
      speedKnots: msToKnots(data.wind.speed),
      location: data.name,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error fetching wind data:', error);
    throw error;
  }
}

// Alternative: Fetch wind data from WindAPI (free alternative)
async function fetchWindDataFromWindAPI(lat, lon) {
  try {
    // Using a free weather API as fallback
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=auto`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Wind API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.current) {
      throw new Error('No current wind data in API response');
    }
    
    const speed = data.current.wind_speed_10m;
    const direction = data.current.wind_direction_10m;
    
    return {
      speed: speed, // m/s
      direction: direction, // degrees
      speedKnots: msToKnots(speed),
      location: `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error fetching wind data from Open-Meteo:', error);
    throw error;
  }
}

// Update wind forecast for the first unit
async function updateWindForecast() {
  try {
    const position = getFirstUnitPosition();
    if (!position) {
      throw new Error('No position data available from any units');
    }
    
    // Try Open-Meteo first (free), fallback to OpenWeatherMap if configured
    let windData;
    try {
      windData = await fetchWindDataFromWindAPI(position.lat, position.lon);
    } catch (error) {
      console.log('Open-Meteo failed, trying OpenWeatherMap:', error.message);
      windData = await fetchWindData(position.lat, position.lon);
    }
    
    currentWindData = windData;
    displayWindBesideButtons(windData);
    
    // Schedule next update in 10 minutes
    if (windUpdateTimeout) {
      clearTimeout(windUpdateTimeout);
    }
    windUpdateTimeout = setTimeout(updateWindForecast, 10 * 60 * 1000);
    
    return windData;
  } catch (error) {
    console.error('Failed to update wind forecast:', error);
    showWindError(error.message);
    throw error;
  }
}

// Display wind arrow and data beside the buttons
function displayWindBesideButtons(windData) {
  // No tile; broadcast update
  try{ window.dispatchEvent(new CustomEvent('forecastWindChanged',{detail: windData})); }catch{}
}

// Create SVG wind arrow pointing in wind direction
function createWindArrowSVG(direction, size = 70) {
  // Wind direction is where wind is coming FROM, arrow should point TO where wind is going
  const arrowDirection = (direction + 180) % 360;
  
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(${arrowDirection}deg);">
      <defs>
        <linearGradient id="arrowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
        </linearGradient>
        <filter id="arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge> 
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="arrow-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="2" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.4)"/>
        </filter>
      </defs>
      <g transform="translate(${size/2}, ${size/2})">
        <!-- Outer glow circle -->
        <circle cx="0" cy="0" r="${size/3}" fill="rgba(59, 130, 246, 0.1)" stroke="rgba(59, 130, 246, 0.3)" stroke-width="1"/>
        
        <!-- Arrow shaft with gradient -->
        <line x1="0" y1="-${size/2.2}" x2="0" y2="${size/3}" 
              stroke="url(#arrowGradient)" stroke-width="5" stroke-linecap="round" 
              filter="url(#arrow-shadow)"/>
        
        <!-- Arrow head with gradient and glow -->
        <polygon points="0,-${size/2.2} -10,-${size/2.2-12} 10,-${size/2.2-12}" 
                 fill="url(#arrowGradient)" filter="url(#arrow-glow)"/>
        
        <!-- Arrow tail feathers with rounded ends -->
        <line x1="-7" y1="${size/3-8}" x2="0" y2="${size/3}" 
              stroke="url(#arrowGradient)" stroke-width="4" stroke-linecap="round"/>
        <line x1="7" y1="${size/3-8}" x2="0" y2="${size/3}" 
              stroke="url(#arrowGradient)" stroke-width="4" stroke-linecap="round"/>
        
        <!-- Center dot -->
        <circle cx="0" cy="0" r="3" fill="#ffffff" stroke="url(#arrowGradient)" stroke-width="2"/>
      </g>
    </svg>
  `;
}

// Show wind error message
function showWindError(message) {
  // Broadcast error as event if needed; avoid DOM tiles
  try{ window.dispatchEvent(new CustomEvent('forecastWindError',{detail: {message}})); }catch{}
}

// Toggle wind forecast display
function toggleWindForecast() {
  if (currentWindData && windDisplayElement) {
    // No-op for tiles; broadcast hide
    try{ window.dispatchEvent(new CustomEvent('forecastWindToggled',{detail:{visible:false}})); }catch{}
    return false; // Wind hidden
  } else {
    // Show/update wind forecast
    updateWindForecast().catch(error => {
      console.error('Failed to show wind forecast:', error);
    });
    try{ window.dispatchEvent(new CustomEvent('forecastWindToggled',{detail:{visible:true}})); }catch{}
    return true; // Wind shown/updated
  }
}

// Initialize wind forecast functionality
function initWindForecast() {
  console.log('Wind forecast functionality initialized');
}

// Cleanup wind forecast
function cleanupWindForecast() {
  if (windUpdateTimeout) {
    clearTimeout(windUpdateTimeout);
    windUpdateTimeout = null;
  }

  currentWindData = null;
}

// Export functions for use in main application
window.windForecast = {
  update: updateWindForecast,
  toggle: toggleWindForecast,
  init: initWindForecast,
  cleanup: cleanupWindForecast,
  getCurrentData: () => currentWindData
};
