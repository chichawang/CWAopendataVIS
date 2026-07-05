// ===== CWA Tab 5: Recreational Weather Spots (js/tab_recreation.js) =====

import { CWA_API } from "./api.js";
import { num, colorAt } from "./utils.js";

export const tabRecreation = {
  name: "休閒育樂與景點預報",
  icon: "fa-bicycle",
  
  map: null,
  panel: null,
  app: null,
  
  layerSpots: null,
  selectedSpotId: "wuling", // Default stargazing spot
  activeTheme: "all", // all, biking, parks, beaches, stargazing, reservoirs
  
  SPOTS: [
    // Biking
    { id: "sunmoonlake-bike", name: "日月潭自行車道", lat: 23.85, lng: 120.91, theme: "biking", apiId: "F-B0053-011", icon: "fa-bicycle", desc: "日月潭環潭路段自行車道" },
    // Parks
    { id: "yangmingshan", name: "陽明山國家公園", lat: 25.15, lng: 121.54, theme: "parks", apiId: "F-B0053-041", icon: "fa-tree", desc: "大台北都會後花園" },
    { id: "alishan", name: "阿里山國家森林遊樂區", lat: 23.51, lng: 120.80, theme: "parks", apiId: "F-B0053-059", icon: "fa-mountain", desc: "神木、日出與林業小火車" },
    // Beaches
    { id: "fulong", name: "福隆海水浴場", lat: 25.02, lng: 121.94, theme: "beaches", apiId: "F-B0053-005", icon: "fa-umbrella-beach", desc: "黃金沙灘、沙雕季景點" },
    { id: "kenting", name: "墾丁海水浴場", lat: 21.94, lng: 120.79, theme: "beaches", apiId: "F-B0053-005", icon: "fa-water", desc: "南台灣水上活動天堂" },
    // Stargazing
    { id: "wuling", name: "合歡山武嶺", lat: 24.13, lng: 121.27, theme: "stargazing", apiId: "F-B0053-071", icon: "fa-moon", desc: "全台公路最高點、國際暗空公園" },
    // Reservoirs
    { id: "shimen", name: "石門水庫", lat: 24.81, lng: 121.24, theme: "reservoirs", apiId: "F-B0053-065", icon: "fa-droplet", desc: "北台灣重要水資源與楓紅景點" }
  ],
  
  spotForecastCache: {},

  async activate(map, panel, app) {
    this.map = map;
    this.panel = panel;
    this.app = app;
    
    this.layerSpots = L.layerGroup().addTo(map);
    
    document.getElementById("map-container").style.display = "block";
    document.getElementById("full-panel-container").style.display = "none";
    
    this.renderSidePanel();
    await this.loadForecastData();
    this.render();
  },
  
  deactivate() {
    if (this.map) {
      this.map.removeLayer(this.layerSpots);
    }
    this.panel.innerHTML = "";
  },
  
  async loadForecastData() {
    // Pre-cache forecast for the currently selected spot to prevent blank screen
    const spot = this.SPOTS.find(s => s.id === this.selectedSpotId);
    if (spot && !this.spotForecastCache[spot.id]) {
      this.app.showLoader(`正在載入 ${spot.name} 專屬指數預報...`);
      try {
        const j = await CWA_API.getRecreationForecast(spot.apiId);
        // Clean records extraction (handles nested structures for spot lists)
        const locations = j?.records?.locations?.[0]?.location || [];
        // Match by name or take the first one
        this.spotForecastCache[spot.id] = locations.find(l => l.locationName.includes(spot.name.slice(0, 3))) || locations[0];
      } catch (e) {
        console.error("載入景點預報失敗", e);
      } finally {
        this.app.hideLoader();
      }
    }
  },
  
  render() {
    this.layerSpots.clearLayers();
    const sc = this.app.sizeScale();
    
    this.SPOTS.forEach(s => {
      // Filter by active theme
      if (this.activeTheme !== "all" && this.activeTheme !== s.theme) return;
      
      const isSelected = this.selectedSpotId === s.id;
      const size = (isSelected ? 36 : 28) * sc;
      const activeColor = isSelected ? "var(--accent)" : "var(--muted)";
      const borderCol = isSelected ? "#ffd740" : "var(--border)";
      
      // Marker HTML
      const html = `
        <div style="
          background: var(--card-bg);
          border: 2px solid ${borderCol};
          border-radius: 50%;
          width: ${size}px;
          height: ${size}px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${activeColor};
          box-shadow: var(--shadow);
          cursor: pointer;
          transition: all 0.25s;
        ">
          <i class="fa-solid ${s.icon}" style="font-size: ${size * 0.45}px;"></i>
        </div>
      `;
      
      const marker = L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          className: "recreation-spot-marker",
          html: html,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        })
      });
      
      marker.on("click", async () => {
        this.selectedSpotId = s.id;
        await this.loadForecastData();
        this.renderSidePanel();
        this.render(); // Redraw map to update selections
      });
      
      marker.bindTooltip(`<strong>${s.name}</strong><br>(${s.desc})`);
      marker.addTo(this.layerSpots);
    });
    
    this.renderSidePanel();
  },
  
  renderSidePanel() {
    // Theme filters
    const filterHtml = `
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">
        ${[
          { key: "all", label: "✨ 全部" },
          { key: "biking", label: "🚴 單車" },
          { key: "parks", label: "🏕️ 景區" },
          { key: "beaches", label: "🏄 海灘" },
          { key: "stargazing", label: "🌌 觀星" },
          { key: "reservoirs", label: "💧 水庫" }
        ].map(t => `
          <button style="
            background: ${this.activeTheme === t.key ? "rgba(0,229,255,0.15)" : "var(--card-bg)"};
            border: 1px solid ${this.activeTheme === t.key ? "var(--accent)" : "var(--border)"};
            color: ${this.activeTheme === t.key ? "var(--accent)" : "var(--txt)"};
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
          " onclick="window.appTabRecreationFilter('${t.key}')">${t.label}</button>
        `).join("")}
      </div>
    `;
    
    // Get active spot detail
    const spot = this.SPOTS.find(s => s.id === this.selectedSpotId);
    let indexHtml = "";
    
    if (spot) {
      const forecast = this.spotForecastCache[spot.id];
      let weatherInfo = `<div style="font-size:11px; color:var(--muted);">正在載入預報指標...</div>`;
      
      if (forecast) {
        // Parse elements from recreation API
        const elements = forecast.weatherElement || [];
        const wx = elements.find(e => e.elementName === "Wx")?.time?.[0]?.parameter?.parameterName || "—";
        const pop = elements.find(e => e.elementName === "PoP" || e.elementName === "ProbabilityOfPrecipitation")?.time?.[0]?.parameter?.parameterName || "0";
        const temp = elements.find(e => e.elementName === "T")?.time?.[0]?.parameter?.parameterName || "25";
        const rh = elements.find(e => e.elementName === "RH")?.time?.[0]?.parameter?.parameterName || "70";
        
        weatherInfo = `
          <div class="kpi-card" style="text-align:left; padding: 14px; margin-bottom: 12px;">
            <div style="font-size:11px; color:var(--muted);">當前景點天氣預報 (三天逐3小時首段)</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
              <span style="font-size:15px; font-weight:700;"><i class="fa-solid fa-cloud-sun"></i> ${wx}</span>
              <span style="font-size:18px; font-weight:700; color:var(--accent);">${temp}°C</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-top:8px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:6px;">
              <span>☔ 降雨機率: ${pop}%</span>
              <span>💦 相對濕度: ${rh}%</span>
            </div>
          </div>
        `;
        
        // Calculate Suitability Score based on theme
        let score = 85;
        let reasons = [];
        let indexName = "適合度";
        
        const rhVal = parseFloat(rh) || 70;
        const popVal = parseFloat(pop) || 0;
        
        if (spot.theme === "stargazing") {
          indexName = "🌌 觀星適合度";
          // Stargazing dislikes clouds/humidity/rain
          if (wx.includes("雨")) { score -= 60; reasons.push("降雨將阻擋星空"); }
          else if (wx.includes("陰")) { score -= 40; reasons.push("雲量過多視野不佳"); }
          else if (wx.includes("多雲")) { score -= 20; reasons.push("天空部分多雲遮蔽"); }
          
          if (rhVal > 85) { score -= 15; reasons.push("濕度過高可能起霧"); }
          if (popVal > 30) { score -= 10; reasons.push("有降雨機率"); }
        } else if (spot.theme === "biking") {
          indexName = "🚴 單車騎乘指數";
          if (popVal > 50) { score -= 50; reasons.push("降雨機率高不宜騎行"); }
          else if (popVal > 20) { score -= 15; reasons.push("路面可能濕滑"); }
          
          const tempVal = parseFloat(temp) || 25;
          if (tempVal > 32) { score -= 20; reasons.push("氣溫過高，高溫中暑風險"); }
          else if (tempVal < 14) { score -= 10; reasons.push("體感溫度偏低注意保暖"); }
        } else if (spot.theme === "beaches") {
          indexName = "🏄 水上活動適合度";
          if (popVal > 30) { score -= 20; reasons.push("天候不穩不建議下水"); }
          if (wx.includes("雨") || wx.includes("雷")) { score -= 55; reasons.push("豪雨或落雷警訊注意"); }
        }
        
        score = Math.max(10, score);
        let scoreColor = "var(--success)";
        if (score < 40) scoreColor = "var(--danger)";
        else if (score < 75) scoreColor = "var(--warning)";
        
        indexHtml = `
          <div class="kpi-card" style="margin-bottom:14px; text-align:left; border-left: 4px solid ${scoreColor};">
            <div style="font-size:12px; color:var(--muted); font-weight:700;">${indexName}</div>
            <div style="display:flex; align-items:baseline; gap:8px; margin-top:6px;">
              <span style="font-size:28px; font-weight:900; color:${scoreColor}">${score}</span>
              <span style="font-size:12px; color:var(--muted)">/ 100 分</span>
            </div>
            ${reasons.length > 0 ? `
              <div style="margin-top:8px; font-size:11px; line-height:1.4; color:var(--muted); border-top:1px dashed rgba(255,255,255,0.05); padding-top:6px;">
                <strong>評語與提醒:</strong>
                <ul style="margin:4px 0 0; padding-left:14px; color:#ff8a80;">
                  ${reasons.map(r => `<li>${r}</li>`).join("")}
                </ul>
              </div>
            ` : `<div style="margin-top:4px; font-size:11px; color:var(--success);">✨ 天候極佳，非常適合前往！</div>`}
          </div>
        `;
      }
      
      indexHtml = `
        <div class="panel-section">
          <h3>⛳ 景點分析: ${spot.name}</h3>
          <div style="font-size: 11.5px; color: var(--muted); margin-bottom:12px;">${spot.desc}</div>
          ${indexHtml}
          ${weatherInfo}
        </div>
      `;
    }
    
    // Spots list under active filter
    const filteredSpots = this.SPOTS.filter(s => this.activeTheme === "all" || this.activeTheme === s.theme);
    const spotsListHtml = filteredSpots.map(s => {
      const isSelected = this.selectedSpotId === s.id;
      return `
        <div class="kpi-card" style="
          text-align: left;
          padding: 10px 14px;
          margin-bottom: 6px;
          border-left: 3px solid ${isSelected ? "var(--accent)" : "transparent"};
          background: ${isSelected ? "rgba(var(--accent-rgb), 0.08)" : "var(--card-bg)"};
          cursor: pointer;
        " onclick="window.appTabRecreationSelect('${s.id}')">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:700;">
            <span><i class="fa-solid ${s.icon}" style="margin-right:6px; color:var(--accent);"></i> ${s.name}</span>
            <span style="font-size:10px; font-weight:normal; color:var(--muted);">${s.theme.toUpperCase()}</span>
          </div>
        </div>
      `;
    }).join("");
    
    this.panel.innerHTML = `
      <div class="panel-section">
        <h3>🔍 休閒主題分類</h3>
        ${filterHtml}
      </div>
      
      <div id="recreation-detail-content">
        ${indexHtml}
      </div>
      
      <div class="panel-section">
        <h3>📍 景點清單 (${filteredSpots.length})</h3>
        ${spotsListHtml}
      </div>
    `;
    
    // Bind global functions for panel clicks
    window.appTabRecreationFilter = (theme) => {
      this.activeTheme = theme;
      this.render();
    };
    
    window.appTabRecreationSelect = async (id) => {
      this.selectedSpotId = id;
      await this.loadForecastData();
      this.renderSidePanel();
      this.render();
    };
  }
};
