// ===== CWA Dashboard API Manager (js/api.js) =====

export let KEY = "CWA-A2436D95-6750-4FD1-BB03-E4B9148C5FC6"; // User preset key
const STORE_KEY = "cwa_api_key";

// Load key from localStorage if exists
const stored = localStorage.getItem(STORE_KEY);
if (stored) {
  KEY = stored.trim();
}

export function setApiKey(k) {
  KEY = k.trim();
  localStorage.setItem(STORE_KEY, KEY);
}

export function getApiKey() {
  return KEY;
}

// Check key validity helper (by fetching a basic endpoint)
export async function validateApiKey(testKey) {
  const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001?Authorization=${encodeURIComponent(testKey)}&limit=1&format=JSON`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j && j.success === "true") return true;
    return false;
  } catch {
    return false;
  }
}

// Caching system to prevent over-fetching
const cache = {};
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes cache for real-time observations

async function fetchCached(url, cacheKey, ttl = CACHE_TTL) {
  const now = Date.now();
  if (cache[cacheKey] && (now - cache[cacheKey].timestamp < ttl)) {
    return cache[cacheKey].data;
  }
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  if (data && data.success === "false") {
    throw new Error(data.message || "氣象署 API 授權失敗");
  }
  
  cache[cacheKey] = {
    data: data,
    timestamp: now
  };
  return data;
}

export const CWA_API = {
  // Datastore REST API
  getDatastoreUrl(dataId, params = "") {
    return `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${dataId}?Authorization=${encodeURIComponent(KEY)}&format=JSON${params}`;
  },
  
  // File API
  getFileApiUrl(dataId) {
    return `https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/${dataId}?Authorization=${encodeURIComponent(KEY)}&downloadType=WEB&format=JSON&_t=${Date.now()}`;
  },
  
  // Tab 1: Real-time observations
  async get10MinObservations() {
    return fetchCached(this.getDatastoreUrl("O-A0003-001"), "10min_meteo");
  },
  async getRainfallObservations() {
    return fetchCached(this.getDatastoreUrl("O-A0002-001"), "rain_meteo");
  },
  async getSolarRadiation() {
    return fetchCached(this.getFileApiUrl("O-A0091-001"), "solar_meteo");
  },
  async getUVIndex() {
    return fetchCached(this.getDatastoreUrl("O-A0005-001"), "uv_meteo");
  },
  async getRadarEchoGrid() {
    return fetchCached(this.getFileApiUrl("O-A0059-001"), "radar_echo", 2 * 60 * 1000); // 2 minutes for radar
  },
  async getQPESUMSRainfallGrid() {
    return fetchCached(this.getFileApiUrl("O-B0045-001"), "qpesums_rain", 2 * 60 * 1000);
  },
  
  // Tab 2: Forecast & Warnings
  async getHourlyObservations() {
    return fetchCached(this.getDatastoreUrl("O-A0001-001"), "hourly_obs");
  },
  async getTemperatureGrid() {
    return fetchCached(this.getFileApiUrl("O-A0038-003"), "temp_grid");
  },
  async getRainfallGrid() {
    return fetchCached(this.getFileApiUrl("O-A0040-004"), "rain_grid");
  },
  async getWeatherWarnings() {
    return fetchCached(this.getDatastoreUrl("W-C0033-001"), "warnings", 30 * 1000); // 30 seconds for alerts
  },
  async getWarningDetails() {
    return fetchCached(this.getDatastoreUrl("W-C0033-002"), "warning_details", 30 * 1000);
  },
  async getTyphoonAdvisory() {
    return fetchCached(this.getDatastoreUrl("W-C0034-005"), "typhoon_advisory", 30 * 1000);
  },
  async getCounty36hForecast() {
    return fetchCached(this.getDatastoreUrl("F-C0032-001"), "county_36h_forecast");
  },
  async getCounty7dForecast() {
    return fetchCached(this.getDatastoreUrl("F-C0032-005"), "county_7d_forecast");
  },
  async getTownshipForecast(countyId) {
    // countyId is code like F-D0047-001
    return fetchCached(this.getDatastoreUrl(countyId), `township_${countyId}`, 10 * 60 * 1000); // 10 minutes cache
  },
  async getHealthForecast(typeCode) {
    // typeCode like F-A0085-002 (cold), F-A0085-004 (diff), M-A0085-001 (heat)
    const isM = typeCode.startsWith("M");
    const url = isM ? this.getDatastoreUrl(typeCode) : this.getDatastoreUrl(typeCode);
    return fetchCached(url, `health_${typeCode}`, 10 * 60 * 1000);
  },
  
  // Tab 3: Marine observations & forecasts
  async getMarineObservations() {
    return fetchCached(this.getDatastoreUrl("O-B0075-001"), "marine_obs");
  },
  async getMarineMetadata() {
    return fetchCached(this.getFileApiUrl("O-B0076-001"), "marine_meta", 24 * 60 * 60 * 1000); // 1 day cache for metadata
  },
  async getTidalFloodAlerts() {
    return fetchCached(this.getFileApiUrl("O-B0069-001"), "tidal_flood_alerts");
  },
  async getSwellAlerts() {
    return fetchCached(this.getFileApiUrl("O-B0070-001"), "swell_alerts");
  },
  async getMarineAreaForecast() {
    return fetchCached(this.getFileApiUrl("F-A0012-001"), "marine_area_forecast");
  },
  async getTidalForecast() {
    return fetchCached(this.getDatastoreUrl("F-A0021-001"), "tidal_forecast", 1 * 60 * 60 * 1000);
  },
  async getBlueHighwayForecast(routeCode) {
    // routeCode like F-A0037-001
    return fetchCached(this.getDatastoreUrl(routeCode), `blue_highway_${routeCode}`, 30 * 60 * 1000);
  },
  async getComfortForecast() {
    return fetchCached(this.getDatastoreUrl("F-B0080-001"), "comfort_forecast", 30 * 60 * 1000);
  },
  async getNauticalRiskForecast() {
    return fetchCached(this.getDatastoreUrl("F-B0082-001"), "nautical_risk", 30 * 60 * 1000);
  },
  
  // Tab 4: Earthquake & Geophysics
  async getSignificantEarthquake() {
    return fetchCached(this.getDatastoreUrl("E-A0015-001"), "sig_earthquake", 30 * 1000);
  },
  async getIsoseismalImageMap() {
    return fetchCached(this.getDatastoreUrl("E-A0015-003"), "isoseismal_image", 30 * 1000);
  },
  async getMinorEarthquakes() {
    return fetchCached(this.getDatastoreUrl("E-A0016-001"), "minor_earthquakes", 30 * 1000);
  },
  async getEarthquakeCatalog() {
    return fetchCached(this.getDatastoreUrl("E-A0073-001"), "eq_catalog", 30 * 1000);
  },
  
  // Tab 5: Recreational weather spots
  async getRecreationForecast(spotCode) {
    // spotCode like F-B0053-001 (Beaches), F-B0053-031 (Climbing), etc.
    return fetchCached(this.getDatastoreUrl(spotCode), `recreation_${spotCode}`, 15 * 60 * 1000);
  },
  
  // Tab 6: Climatology & Astronomy
  async getAstronomyCalendar() {
    return fetchCached(this.getFileApiUrl("A-A0087-001"), "astro_calendar", 24 * 60 * 60 * 1000); // 1 day
  },
  async getCountySunriseSunset() {
    return fetchCached(this.getDatastoreUrl("A-B0062-001"), "sunrise_sunset", 24 * 60 * 60 * 1000);
  },
  async getClimatologyMonthlyNormals() {
    return fetchCached(this.getDatastoreUrl("C-B0027-001"), "climatology_normals", 30 * 24 * 60 * 60 * 1000); // Permanent cache basically
  }
};
