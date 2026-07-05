// ===== CWA Dashboard API Manager (js/api.js) =====
//
// 設計重點（GitHub Pages 純前端環境）：
// 1. 預設 API 金鑰直接可用，localStorage 可覆寫。
// 2. 三層防過度抓取：記憶體快取 + localStorage 持久快取 + in-flight 去重。
// 3. REST datastore API 支援 CORS；fileapi 會 302 轉址到 S3（瀏覽器可能因
//    CORS 失敗），所有 fileapi 呼叫都必須由呼叫端 catch 並優雅降級。
// 4. 大量資料集（海象 48h、日出日沒）改用伺服器端參數過濾，只抓需要的部分。

export let KEY = "CWA-A2436D95-6750-4FD1-BB03-E4B9148C5FC6"; // 預設授權碼
const STORE_KEY = "cwa_api_key";

try {
  const stored = localStorage.getItem(STORE_KEY);
  if (stored) KEY = stored.trim();
} catch { /* localStorage 不可用時使用預設金鑰 */ }

export function setApiKey(k) {
  KEY = k.trim();
  try { localStorage.setItem(STORE_KEY, KEY); } catch { /* ignore */ }
}

export function getApiKey() {
  return KEY;
}

// ---- 基礎 fetch（含逾時） ----
async function fetchJSON(url, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function isSuccess(j) {
  const s = j?.success ?? j?.Success;
  return s === "true" || s === true;
}

// ---- 金鑰驗證：回傳 "ok" | "invalid" | "network" ----
// network（斷線 / CORS / 逾時）不應阻擋進入儀表板，僅 invalid 需要重新輸入。
export async function validateApiKey(testKey) {
  const url = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001?Authorization=${encodeURIComponent(testKey)}&limit=1&format=JSON`;
  try {
    const r = await fetchJSON(url, 10000);
    return isSuccess(r) ? "ok" : "invalid";
  } catch (e) {
    // HTTP 401/403 視為金鑰無效，其它（網路 / CORS / 逾時）視為網路問題
    if (/HTTP 4(01|03)/.test(e.message)) return "invalid";
    return "network";
  }
}

// ---- 快取系統（防止重複抓取過多資料） ----
const memCache = {};      // cacheKey -> { data, timestamp }
const inflight = {};      // cacheKey -> Promise（同一資源同時只發一個請求）
const LS_PREFIX = "cwa_cache:";
const LS_MAX_BYTES = 300 * 1024; // 僅持久化 300KB 以下的回應，避免塞爆 quota

function lsGet(cacheKey, ttl) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + cacheKey);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.timestamp < ttl) return obj;
    localStorage.removeItem(LS_PREFIX + cacheKey);
  } catch { /* ignore */ }
  return null;
}

function lsSet(cacheKey, entry) {
  try {
    const raw = JSON.stringify(entry);
    if (raw.length <= LS_MAX_BYTES) localStorage.setItem(LS_PREFIX + cacheKey, raw);
  } catch { /* quota 滿了就算了，記憶體快取仍有效 */ }
}

async function fetchCached(url, cacheKey, ttl = 5 * 60 * 1000, persist = false) {
  const now = Date.now();

  const m = memCache[cacheKey];
  if (m && now - m.timestamp < ttl) return m.data;

  if (persist) {
    const p = lsGet(cacheKey, ttl);
    if (p) {
      memCache[cacheKey] = p;
      return p.data;
    }
  }

  if (inflight[cacheKey]) return inflight[cacheKey];

  inflight[cacheKey] = (async () => {
    try {
      const data = await fetchJSON(url);
      if ((data?.success ?? data?.Success) === "false") {
        throw new Error(data.message || "氣象署 API 授權失敗");
      }
      const entry = { data, timestamp: Date.now() };
      memCache[cacheKey] = entry;
      if (persist) lsSet(cacheKey, entry);
      return data;
    } finally {
      delete inflight[cacheKey];
    }
  })();

  return inflight[cacheKey];
}

// ---- 時間工具：CWA timeFrom/timeTo 使用台灣當地時間 ----
function isoLocal(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}
export function todayStr(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const CWA_API = {
  // REST datastore API（支援 CORS，可安全用於 GitHub Pages）
  getDatastoreUrl(dataId, params = {}) {
    const qs = new URLSearchParams({ Authorization: KEY, format: "JSON", ...params });
    return `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${dataId}?${qs}`;
  },

  // File API（302 轉址至 S3；瀏覽器端可能因 CORS 失敗，呼叫端務必 catch）
  getFileApiUrl(dataId) {
    return `https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/${dataId}?Authorization=${encodeURIComponent(KEY)}&downloadType=WEB&format=JSON`;
  },

  // ===== Tab 1: 即時觀測 =====
  async get10MinObservations() {
    return fetchCached(this.getDatastoreUrl("O-A0003-001"), "10min_meteo", 5 * 60 * 1000);
  },
  async getRainfallObservations() {
    return fetchCached(this.getDatastoreUrl("O-A0002-001"), "rain_meteo", 5 * 60 * 1000);
  },
  async getSolarRadiation() { // fileapi — 僅在使用者選「日射量」時才載入
    return fetchCached(this.getFileApiUrl("O-A0091-001"), "solar_meteo", 60 * 60 * 1000);
  },
  async getUVIndex() {
    return fetchCached(this.getDatastoreUrl("O-A0005-001"), "uv_meteo", 30 * 60 * 1000);
  },
  async getRadarEchoGrid() { // fileapi，數 MB — 僅在使用者開啟圖層時載入
    return fetchCached(this.getFileApiUrl("O-A0059-001"), "radar_echo", 5 * 60 * 1000);
  },
  async getQPESUMSRainfallGrid() { // fileapi — 僅在使用者開啟圖層時載入
    return fetchCached(this.getFileApiUrl("O-B0045-001"), "qpesums_rain", 5 * 60 * 1000);
  },

  // ===== Tab 2: 預報與警特報 =====
  async getWeatherWarnings() {
    return fetchCached(this.getDatastoreUrl("W-C0033-001"), "warnings", 5 * 60 * 1000);
  },
  async getTyphoonAdvisory() {
    return fetchCached(this.getDatastoreUrl("W-C0034-005"), "typhoon_advisory", 10 * 60 * 1000);
  },
  async getCounty36hForecast() {
    return fetchCached(this.getDatastoreUrl("F-C0032-001"), "county_36h_forecast", 30 * 60 * 1000, true);
  },
  async getCounty7dForecast() {
    return fetchCached(this.getDatastoreUrl("F-C0032-005"), "county_7d_forecast", 60 * 60 * 1000, true);
  },
  async getHealthForecast(typeCode) {
    return fetchCached(this.getDatastoreUrl(typeCode), `health_${typeCode}`, 60 * 60 * 1000);
  },

  // ===== Tab 3: 海象 =====
  // 最新觀測快照：只抓過去 3 小時（~80KB），而非全部 48h 序列（數 MB）
  async getMarineLatestObs() {
    const from = isoLocal(new Date(Date.now() - 3 * 60 * 60 * 1000));
    return fetchCached(
      this.getDatastoreUrl("O-B0075-001", { timeFrom: from }),
      "marine_latest", 10 * 60 * 1000
    );
  },
  // 單站 48h 歷史序列：點選測站時才載入
  async getMarineStation48h(stationId) {
    const from = isoLocal(new Date(Date.now() - 48 * 60 * 60 * 1000));
    return fetchCached(
      this.getDatastoreUrl("O-B0075-001", { StationID: stationId, timeFrom: from }),
      `marine_48h_${stationId}`, 30 * 60 * 1000
    );
  },
  async getMarineMetadata() { // fileapi — 測站座標，失敗時海象分頁降級為列表模式
    return fetchCached(this.getFileApiUrl("O-B0076-001"), "marine_meta", 7 * 24 * 60 * 60 * 1000, true);
  },

  // ===== Tab 4: 地震 =====
  async getSignificantEarthquake() {
    return fetchCached(this.getDatastoreUrl("E-A0015-001", { limit: 15 }), "sig_earthquake", 10 * 60 * 1000);
  },
  async getIsoseismalImageMap() {
    return fetchCached(this.getDatastoreUrl("E-A0015-003", { limit: 15 }), "isoseismal_image", 10 * 60 * 1000);
  },
  async getMinorEarthquakes() {
    return fetchCached(this.getDatastoreUrl("E-A0016-001", { limit: 30 }), "minor_earthquakes", 10 * 60 * 1000);
  },

  // ===== Tab 5: 休閒景點（點選景點時才載入該資料集） =====
  async getRecreationForecast(spotCode) {
    return fetchCached(this.getDatastoreUrl(spotCode), `recreation_${spotCode}`, 30 * 60 * 1000);
  },

  // ===== Tab 6: 天文與氣候 =====
  async getAstronomyCalendar() { // fileapi — 失敗時前端以演算法月相替代
    return fetchCached(this.getFileApiUrl("A-A0087-001"), "astro_calendar", 24 * 60 * 60 * 1000, true);
  },
  // 只抓「選定縣市 + 今天」的日出日沒（<1KB），而非全台整年（數 MB）
  async getCountySunriseSunset(countyName, dateStr = todayStr()) {
    return fetchCached(
      this.getDatastoreUrl("A-B0062-001", { CountyName: countyName, Date: dateStr }),
      `sunrise_${countyName}_${dateStr}`, 24 * 60 * 60 * 1000, true
    );
  },
  async getClimatologyMonthlyNormals() {
    return fetchCached(this.getDatastoreUrl("C-B0027-001"), "climatology_normals", 30 * 24 * 60 * 60 * 1000, true);
  }
};
