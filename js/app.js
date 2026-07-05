// ===== CWA Dashboard Core Controller (js/app.js) =====

import { KEY, validateApiKey, setApiKey } from "./api.js";
import { gradientCSS } from "./utils.js";
import { tabObservation } from "./tab_observation.js";
import { tabForecast } from "./tab_forecast.js";
import { tabMarine } from "./tab_marine.js";
import { tabEarthquake } from "./tab_earthquake.js";
import { tabRecreation } from "./tab_recreation.js";
import { tabAstronomy } from "./tab_astronomy.js";

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
    
    // Check if current key is valid
    this.showLoader("正在驗證授權金鑰...");
    const valid = await validateApiKey(KEY);
    this.hideLoader();
    
    if (valid) {
      gate.style.display = "none";
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
        const ok = await validateApiKey(k);
        this.hideLoader();
        
        if (ok) {
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
      alert(`載入 ${tab.name} 失敗: ` + e.message);
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

// Instantiate and start app on page load
window.onload = () => {
  const app = new App();
  app.init();
};
