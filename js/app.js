// ===== CWA Dashboard Core Controller (js/app.js) =====

// 注意：api.js / utils.js 的 import 全專案都「不加版本參數」，
// 確保所有模組共用同一個實例（模組身分以完整 URL 判定）。
// tab 模組加 ?v= 以繞過 GitHub Pages CDN 的 10 分鐘快取。
import { KEY, validateApiKey, setApiKey } from "./api.js";
import { gradientCSS } from "./utils.js";
import { tabObservation } from "./tab_observation.js?v=2";
import { tabForecast } from "./tab_forecast.js?v=2";
import { tabMarine } from "./tab_marine.js?v=2";
import { tabEarthquake } from "./tab_earthquake.js?v=2";
import { tabRecreation } from "./tab_recreation.js?v=2";
import { tabAstronomy } from "./tab_astronomy.js?v=2";

class App {
  constructor() {
    this.map = null;
    this.activeTab = null;
    this.refZoom = null;
    this.TAIWAN_BOUNDS = L.latLngBounds([21.85, 119.95], [25.35, 122.05]);
    
    this.tabs = [
      tabObservation,
      tabForecast,
      tabMarine,
      tabEarthquake,
      tabRecreation,
      tabAstronomy
    ];
    
    this.BASES = {
      dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 20, attribution: "© CARTO" }),
      osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OSM" }),
      sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri World Imagery" }),
      topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "OpenTopoMap" }),
      light: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 20, attribution: "© CARTO" })
    };
    this.currentBase = this.BASES.dark;
  }
  
  init() {
    this.initMap();
    this.initEventListeners();
    this.checkApiKeyGate();
  }
  
  initMap() {
    this.map = L.map("map", {
      zoomControl: true,
      minZoom: 6,
      maxZoom: 18
    }).fitBounds(this.TAIWAN_BOUNDS);
    
    this.currentBase.addTo(this.map);
    
    // Create special radar grid overlay pane below markers
    this.map.createPane("radar");
    this.map.getPane("radar").style.zIndex = 350;
    this.map.getPane("radar").style.pointerEvents = "none";
    
    this.refZoom = this.map.getBoundsZoom(this.TAIWAN_BOUNDS);
  }
  
  initEventListeners() {
    // Menu mobile toggle
    const toggle = document.getElementById("menu-toggle");
    const sidebar = document.getElementById("sidebar");
    toggle.onclick = () => {
      sidebar.classList.toggle("open");
    };
    
    // Sidebar Tab Clicks
    const items = document.querySelectorAll(".nav-item");
    items.forEach((item, index) => {
      item.onclick = () => {
        items.forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        sidebar.classList.remove("open"); // close mobile drawer
        this.switchTab(this.tabs[index]);
      };
    });
    
    // Change Key Config Button
    document.getElementById("change-key-btn").onclick = () => {
      this.openGate();
    };
    
    // Reset view button on map
    let fitBtn = document.getElementById("reset-view-btn");
    if (!fitBtn) {
      fitBtn = document.createElement("button");
      fitBtn.id = "reset-view-btn";
      fitBtn.className = "config-btn";
      fitBtn.style.position = "absolute";
      fitBtn.style.bottom = "24px";
      fitBtn.style.left = "16px";
      fitBtn.style.zIndex = "900";
      fitBtn.innerHTML = `<i class="fa-solid fa-expand"></i> 重置視角`;
      fitBtn.onclick = () => {
        this.map.fitBounds(this.TAIWAN_BOUNDS);
      };
      document.getElementById("map-container").appendChild(fitBtn);
    }
  }
  
  async checkApiKeyGate() {
    const gate = document.getElementById("api-gate");
    const inp = document.getElementById("gate-key-input");
    const submit = document.getElementById("gate-enter-btn");
    const err = document.getElementById("gate-key-err");

    // 驗證結果三態："ok" 直接進入；"network"（斷線/CORS/逾時）也放行，
    // 由各分頁自行顯示錯誤 — 避免 GitHub Pages 上因單一驗證請求失敗而整頁卡死；
    // 只有 "invalid"（金鑰確定無效）才顯示輸入閘。
    this.showLoader("正在驗證授權金鑰...");
    const state = await validateApiKey(KEY);
    this.hideLoader();

    if (state !== "invalid") {
      gate.style.display = "none";
      if (state === "network") {
        this.showToast("暫時無法連線氣象署伺服器，資料載入可能失敗", "warn");
      }
      this.startApp();
    } else {
      gate.style.display = "flex";
      inp.value = KEY || "";

      submit.onclick = async () => {
        const k = inp.value.trim();
        if (!k) {
          err.textContent = "請輸入 CWA API 授權碼";
          err.style.display = "block";
          return;
        }

        this.showLoader("正在驗證金鑰...");
        const s = await validateApiKey(k);
        this.hideLoader();

        if (s !== "invalid") {
          setApiKey(k);
          gate.style.display = "none";
          this.startApp();
        } else {
          err.textContent = "無效的金鑰，請確認輸入無誤。";
          err.style.display = "block";
        }
      };
    }
  }
  
  openGate() {
    const gate = document.getElementById("api-gate");
    gate.style.display = "flex";
    document.getElementById("gate-key-input").value = KEY;
    document.getElementById("gate-key-err").style.display = "none";
    this.checkApiKeyGate();
  }
  
  startApp() {
    // Select first tab by default (Observation)
    const items = document.querySelectorAll(".nav-item");
    if (items.length > 0) {
      items[0].classList.add("active");
      this.switchTab(this.tabs[0]);
    }
  }
  
  async switchTab(tab) {
    if (this.activeTab) {
      this.activeTab.deactivate();
    }
    
    this.activeTab = tab;
    
    // Update Header Tab Title
    const titleEl = document.getElementById("tab-title");
    titleEl.innerHTML = `<i class="fa-solid ${tab.icon}"></i> ${tab.name}`;
    
    // Reset Legend Container
    document.getElementById("legend-container").style.display = "none";
    
    // Activate Tab
    this.showLoader(`載入 ${tab.name} 中...`);
    try {
      await tab.activate(this.map, document.getElementById("side-panel"), this);
      this.map.invalidateSize();
    } catch (e) {
      console.error(e);
      this.showToast(`載入 ${tab.name} 失敗：${e.message}`, "error");
    } finally {
      this.hideLoader();
    }
  }
  
  // Size markers relative to zoom level
  sizeScale() {
    const zoom = this.map.getZoom();
    return Math.max(0.65, Math.min(2.5, Math.pow(2, (zoom - this.refZoom) * 0.45)));
  }
  
  showLoader(msg = "載入中...") {
    const loader = document.getElementById("loader-overlay");
    document.getElementById("loader-text").textContent = msg;
    loader.style.display = "flex";
  }
  
  hideLoader() {
    document.getElementById("loader-overlay").style.display = "none";
  }

  // 非阻塞式提示（取代 alert，避免中斷操作）
  showToast(msg, type = "info", ms = 6000) {
    let box = document.getElementById("toast-box");
    if (!box) {
      box = document.createElement("div");
      box.id = "toast-box";
      box.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:8px; max-width:340px;";
      document.body.appendChild(box);
    }
    const colors = { info: "#00b0ff", warn: "#ffb300", error: "#ff5252" };
    const el = document.createElement("div");
    el.style.cssText = `background:rgba(11,19,36,0.95); color:#e2ebf6; border:1px solid ${colors[type] || colors.info}; border-left:4px solid ${colors[type] || colors.info}; border-radius:8px; padding:10px 14px; font-size:12.5px; line-height:1.5; box-shadow:0 4px 16px rgba(0,0,0,0.4);`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }
  
  updateObsTime(timeStr) {
    document.getElementById("obs-time-text").textContent = `🕒 資料時間：${timeStr}`;
  }
  
  updateLegend(vDef) {
    const leg = document.getElementById("legend-container");
    if (!vDef || vDef.key === "__type" || !vDef.label) {
      leg.style.display = "none";
      return;
    }
    
    leg.style.display = "block";
    document.getElementById("leg-title").textContent = `${vDef.label} ${vDef.unit ? `(${vDef.unit})` : ""}`;
    
    const bar = document.getElementById("leg-bar");
    const ticks = document.getElementById("leg-ticks");
    
    if (vDef.levels) {
      // Discrete Color segments
      ticks.style.display = "none";
      const C = vDef.colors;
      const L = vDef.levels;
      const N = C.length;
      const h = 10;
      
      let html = `<div style="display:flex; flex-direction:column; border:1px solid var(--border); width:24px;">`;
      for (let t = 0; t < N; t++) {
        const di = N - 1 - t; // Hot to cold
        const lab = (di - 1 >= 0) ? L[di - 1] : "";
        const rgbStr = `rgb(${C[di][0]},${C[di][1]},${C[di][2]})`;
        html += `<div style="position:relative; height:${h}px; background:${rgbStr};">
          ${lab !== "" ? `<span style="position:absolute; right:-26px; bottom:-6px; font-size:9px; color:var(--muted); font-weight:700;">${lab}</span>` : ""}
        </div>`;
      }
      html += `</div>`;
      
      bar.style.background = "none";
      bar.style.height = "auto";
      bar.innerHTML = html;
    } else if (vDef.ramp) {
      // Continuous ramp
      ticks.style.display = "flex";
      bar.style.display = "block";
      bar.style.height = "12px";
      bar.innerHTML = "";
      bar.style.background = gradientCSS(vDef.ramp);
      
      ticks.innerHTML = vDef.ramp.map(s => `<span>${s[0]}</span>`).join("");
    }
  }
}

// ===== 啟動流程 =====
// 直接啟動：ES module 具 defer 特性，執行時 DOM 已解析完成。
// 不可使用 window.onload — 只要任一 CDN 資源（字型/圖磚）載入緩慢或被阻擋，
// load 事件就會被延遲甚至不觸發，導致 GitHub Pages 上整頁空白。

function showFatal(msg) {
  console.error(msg);
  document.body.insertAdjacentHTML("beforeend",
    `<div style="position:fixed;left:16px;right:16px;bottom:16px;background:#3a0d0d;color:#ffbaba;padding:12px 16px;border-radius:8px;z-index:99999;font-size:13px;line-height:1.6;">${msg}</div>`);
}

// 任何未捕捉的錯誤都顯示在頁面上，不再無聲空白
window.addEventListener("error", e => {
  if (e.message) showFatal("執行錯誤：" + e.message);
});
window.addEventListener("unhandledrejection", e => {
  console.error("未處理的 Promise 錯誤", e.reason);
});

function loadScript(src) {
  return new Promise(resolve => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

// Leaflet 載入保險：index.html 主來源為 cdnjs，失敗時依序嘗試備援 CDN
async function ensureLeaflet() {
  if (typeof L !== "undefined") return true;
  const fallbacks = [
    "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js"
  ];
  const cssFallback = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  for (const src of fallbacks) {
    await loadScript(src);
    if (typeof L !== "undefined") {
      // 同步補上 CSS（主 CSS 可能也失敗）
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssFallback;
      document.head.appendChild(link);
      return true;
    }
  }
  return false;
}

(async () => {
  if (!(await ensureLeaflet())) {
    showFatal("⚠️ 地圖引擎 Leaflet 無法從任何 CDN 載入（cdnjs / unpkg / jsdelivr 均失敗）。請檢查網路連線或防火牆設定後重新整理。");
    return;
  }
  try {
    const app = new App();
    window.cwaApp = app; // 方便除錯
    app.init();
  } catch (e) {
    console.error("初始化失敗", e);
    showFatal("儀表板初始化失敗：" + e.message);
  }
})();
