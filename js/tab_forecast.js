// ===== CWA Tab 2: Weather Forecast & Alerts (js/tab_forecast.js) =====

import { CWA_API } from "./api.js";
import { num, colorFor, TEMP_LEVELS, TEMP_COLORS } from "./utils.js";

export const tabForecast = {
  name: "天氣預報與災害警報",
  icon: "fa-triangle-exclamation",
  
  map: null,
  panel: null,
  app: null,
  
  layerCounties: null,
  layerTyphoon: null,
  
  forecast36h: [],
  forecast7d: [],
  warnings: [],
  typhoons: [],
  healthCold: [],
  healthHeat: [],
  
  selectedCounty: "臺北市",
  chartInstance: null,
  
  COUNTY_CENTROIDS: [
    { name: "臺北市", lat: 25.03, lng: 121.56 },
    { name: "新北市", lat: 24.91, lng: 121.51 },
    { name: "基隆市", lat: 25.12, lng: 121.73 },
    { name: "宜蘭縣", lat: 24.70, lng: 121.75 },
    { name: "桃園市", lat: 24.89, lng: 121.21 },
    { name: "新竹市", lat: 24.80, lng: 120.96 },
    { name: "新竹縣", lat: 24.70, lng: 121.15 },
    { name: "苗栗縣", lat: 24.56, lng: 120.82 },
    { name: "臺中市", lat: 24.23, lng: 120.94 },
    { name: "彰化縣", lat: 23.99, lng: 120.48 },
    { name: "南投縣", lat: 23.83, lng: 120.98 },
    { name: "雲林縣", lat: 23.70, lng: 120.42 },
    { name: "嘉義市", lat: 23.47, lng: 120.44 },
    { name: "嘉義縣", lat: 23.45, lng: 120.57 },
    { name: "臺南市", lat: 23.14, lng: 120.25 },
    { name: "高雄市", lat: 22.80, lng: 120.40 },
    { name: "屏東縣", lat: 22.46, lng: 120.59 },
    { name: "花蓮縣", lat: 23.75, lng: 121.35 },
    { name: "臺東縣", lat: 22.88, lng: 120.95 },
    { name: "澎湖縣", lat: 23.57, lng: 119.61 },
    { name: "金門縣", lat: 24.44, lng: 118.37 },
    { name: "連江縣", lat: 26.15, lng: 119.93 }
  ],
  
  // Maps weather descriptions to FontAwesome icons
  getWeatherIcon(wx) {
    if (!wx) return "fa-cloud";
    if (wx.includes("雨")) return "fa-cloud-showers-heavy";
    if (wx.includes("雷")) return "fa-cloud-bolt";
    if (wx.includes("陰") || wx.includes("多雲")) {
      if (wx.includes("晴")) return "fa-cloud-sun";
      return "fa-cloud";
    }
    if (wx.includes("晴")) return "fa-sun";
    return "fa-cloud";
  },

  async activate(map, panel, app) {
    this.map = map;
    this.panel = panel;
    this.app = app;
    
    this.layerCounties = L.layerGroup().addTo(map);
    this.layerTyphoon = L.layerGroup().addTo(map);
    
    document.getElementById("map-container").style.display = "block";
    document.getElementById("full-panel-container").style.display = "none";
    
    await this.loadData();
    this.render();
  },
  
  deactivate() {
    if (this.map) {
      this.map.removeLayer(this.layerCounties);
      this.map.removeLayer(this.layerTyphoon);
    }
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
    
    // Hide marquee warnings banner
    const marquee = document.getElementById("warnings-marquee-banner");
    if (marquee) marquee.style.display = "none";
    
    this.panel.innerHTML = "";
  },
  
  async loadData() {
    this.app.showLoader("正在下載預報與警戒資料...");
    try {
      // 平行抓取全部資料集，單一失敗不影響其它
      const [rWarn, r36h, r7d, rTyphoon, rCold, rHeat] = await Promise.allSettled([
        CWA_API.getWeatherWarnings(),
        CWA_API.getCounty36hForecast(),
        CWA_API.getCounty7dForecast(),
        CWA_API.getTyphoonAdvisory(),
        CWA_API.getHealthForecast("F-A0085-002"),
        CWA_API.getHealthForecast("M-A0085-001")
      ]);
      const val = r => (r.status === "fulfilled" ? r.value : null);

      if (r36h.status === "rejected") {
        throw new Error(r36h.reason?.message || "無法取得 36 小時預報");
      }

      // W-C0033-001 實際格式：records.location[].hazardConditions.hazards[]
      this.warnings = this.parseWarnings(val(rWarn));
      this.forecast36h = val(r36h)?.records?.location || [];
      this.forecast7d = val(r7d)?.records?.location || [];
      this.typhoons = val(rTyphoon)?.records?.tropicalCyclones?.tropicalCyclone || [];
      this.healthCold = val(rCold)?.records?.locations?.location || [];
      this.healthHeat = val(rHeat)?.records?.locations?.location || [];

      this.setupWarningsMarquee();
    } catch (e) {
      console.error(e);
      this.app.showToast("載入預報資料失敗：" + e.message, "error");
    } finally {
      this.app.hideLoader();
    }
  },

  // 將 W-C0033-001 的縣市×災害展平為「現象 → 受影響縣市」清單
  parseWarnings(jWarn) {
    const locs = jWarn?.records?.location || [];
    const byPhenomena = {};
    locs.forEach(loc => {
      const hazards = loc.hazardConditions?.hazards || [];
      hazards.forEach(h => {
        const info = h.info || {};
        const phen = info.phenomena || "特報";
        const sig = info.significance || "";
        const key = `${phen}${sig}`;
        if (!byPhenomena[key]) {
          byPhenomena[key] = { type: key, counties: [], startTime: h.validTime?.startTime, endTime: h.validTime?.endTime };
        }
        if (!byPhenomena[key].counties.includes(loc.locationName)) {
          byPhenomena[key].counties.push(loc.locationName);
        }
      });
    });
    return Object.values(byPhenomena);
  },

  setupWarningsMarquee() {
    let marquee = document.getElementById("warnings-marquee-banner");
    if (!marquee) {
      marquee = document.createElement("div");
      marquee.id = "warnings-marquee-banner";
      document.getElementById("main-dashboard").insertBefore(marquee, document.getElementById("content-container"));
    }

    if (this.warnings.length === 0) {
      marquee.style.display = "none";
      return;
    }

    const textList = this.warnings.map(w => `${w.type}（${w.counties.slice(0, 6).join("、")}${w.counties.length > 6 ? " 等" : ""}）`);
    marquee.innerHTML = `<div class="marquee-content"><i class="fa-solid fa-triangle-exclamation"></i> ${textList.join(" | ")}</div>`;
    marquee.style.display = "flex";
  },
  
  render() {
    this.layerCounties.clearLayers();
    this.layerTyphoon.clearLayers();
    
    // 1) Draw County Forecast Markers
    this.COUNTY_CENTROIDS.forEach(c => {
      const f36 = this.forecast36h.find(loc => loc.locationName === c.name);
      
      let wx = "晴";
      let tempRange = "—";
      let pop = "—";
      let maxTVal = 25;
      
      if (f36) {
        // Elements: Wx, PoP, MinT, MaxT, CI
        const elements = f36.weatherElement || [];
        const wxEl = elements.find(el => el.elementName === "Wx");
        const popEl = elements.find(el => el.elementName === "PoP");
        const minTEl = elements.find(el => el.elementName === "MinT");
        const maxTEl = elements.find(el => el.elementName === "MaxT");
        
        wx = wxEl?.time[0]?.parameter?.parameterName || "晴";
        pop = popEl?.time[0]?.parameter?.parameterName || "0";
        const minT = minTEl?.time[0]?.parameter?.parameterName || "20";
        const maxT = maxTEl?.time[0]?.parameter?.parameterName || "30";
        maxTVal = parseFloat(maxT) || 25;
        tempRange = `${minT}~${maxT}°C`;
      }
      
      const iconClass = this.getWeatherIcon(wx);
      const markerColor = colorFor(maxTVal, { levels: TEMP_LEVELS, colors: TEMP_COLORS });
      
      // Custom HTML Marker using FontAwesome
      const iconHtml = `
        <div class="forecast-marker" style="
          background: rgba(11, 19, 36, 0.9);
          border: 2px solid ${markerColor};
          color: var(--txt);
          border-radius: 50%;
          width: 42px;
          height: 42px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 10px rgba(0,0,0,0.5);
          cursor: pointer;
          transition: transform 0.2s;
        " title="${c.name} 預報">
          <i class="fa-solid ${iconClass}" style="font-size:12px; color:var(--accent);"></i>
          <span style="font-size:9px; font-weight:700; margin-top:2px;">${maxTVal}°</span>
        </div>
      `;
      
      const marker = L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          className: "custom-forecast-icon",
          html: iconHtml,
          iconSize: [42, 42],
          iconAnchor: [21, 21]
        })
      });
      
      marker.on("click", () => {
        this.selectedCounty = c.name;
        this.renderSidePanel();
      });
      
      marker.addTo(this.layerCounties);
    });
    
    // 2) Draw Typhoon path if any
    if (this.typhoons.length > 0) {
      this.typhoons.forEach(ty => {
        const tcAnalysis = ty.analysis?.tropicalCycloneAdvisory || {};
        const pos = tcAnalysis.position || [];
        if (pos.length > 0) {
          const lat = parseFloat(pos[0].lat);
          const lon = parseFloat(pos[0].lon);
          
          if (isFinite(lat) && isFinite(lon)) {
            // Draw storm center
            L.circleMarker([lat, lon], {
              radius: 12,
              fillColor: var(--danger),
              color: "#fff",
              weight: 2,
              fillOpacity: 0.8
            }).addTo(this.layerTyphoon)
              .bindPopup(`<strong>🌀 ${ty.typhoonName} 颱風</strong><br>中心氣壓: ${tcAnalysis.pressure} hPa<br>最大風速: ${tcAnalysis.maxWindSpeed} m/s`);
              
            // Bounding storm radius (approx 200km storm radius)
            L.circle([lat, lon], {
              radius: 200000,
              color: var(--danger),
              fillColor: var(--danger),
              fillOpacity: 0.1,
              weight: 1
            }).addTo(this.layerTyphoon);
          }
        }
      });
    }
    
    this.renderSidePanel();
  },
  
  renderSidePanel() {
    // Lookup selected county data
    const f36 = this.forecast36h.find(loc => loc.locationName === this.selectedCounty);
    let wxCards = "";
    
    if (f36) {
      const elements = f36.weatherElement || [];
      const wxEl = elements.find(el => el.elementName === "Wx")?.time || [];
      const popEl = elements.find(el => el.elementName === "PoP")?.time || [];
      const minTEl = elements.find(el => el.elementName === "MinT")?.time || [];
      const maxTEl = elements.find(el => el.elementName === "MaxT")?.time || [];
      const ciEl = elements.find(el => el.elementName === "CI")?.time || [];
      
      for (let i = 0; i < 3; i++) {
        const wxVal = wxEl[i]?.parameter?.parameterName || "—";
        const popVal = popEl[i]?.parameter?.parameterName || "0";
        const minT = minTEl[i]?.parameter?.parameterName || "—";
        const maxT = maxTEl[i]?.parameter?.parameterName || "—";
        const ci = ciEl[i]?.parameter?.parameterName || "—";
        
        const startTime = new Date(wxEl[i]?.startTime);
        const endTime = new Date(wxEl[i]?.endTime);
        const timeLabel = startTime.getHours() === 6 ? "今日白天" : (startTime.getHours() === 18 ? "今晚明晨" : "明日白天");
        
        wxCards += `
          <div class="kpi-card" style="text-align: left; padding: 14px; margin-bottom: 10px;">
            <div style="font-size: 11px; color: var(--muted); font-weight: 700;">${timeLabel} (${startTime.getHours()}:00 ~ ${endTime.getHours()}:00)</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
              <div style="font-size: 15px; font-weight: 700;">
                <i class="fa-solid ${this.getWeatherIcon(wxVal)}" style="color:var(--accent); margin-right: 6px;"></i> ${wxVal}
              </div>
              <div style="font-size: 16px; font-weight: 700; color: var(--accent);">${minT}~${maxT}°C</div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: 8px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 6px;">
              <span>☔ 降雨機率: ${popVal}%</span>
              <span>🌡️ 舒適度: ${ci}</span>
            </div>
          </div>
        `;
      }
    }
    
    // Warnings Section（新版結構：w.type / w.counties / w.startTime / w.endTime）
    const countyWarns = this.warnings.filter(w => w.counties.includes(this.selectedCounty));

    let warningHtml = `<div style="font-size:12px; color:var(--muted);">目前無生效之天氣警特報</div>`;
    if (countyWarns.length > 0) {
      warningHtml = countyWarns.map(w => `
        <div style="background: rgba(255,82,82,0.12); border: 1px solid rgba(255,82,82,0.3); border-radius: 8px; padding: 8px 12px; margin-bottom: 8px;">
          <div style="color: #ff8a80; font-weight:700; font-size:13px;"><i class="fa-solid fa-triangle-exclamation"></i> ${w.type}</div>
          <div style="font-size: 11px; margin-top: 4px; line-height: 1.4;">生效時間：${w.startTime || "—"} ～ ${w.endTime || "—"}</div>
        </div>
      `).join("");
    }
    
    // Health indices lookup
    const coldSt = this.healthCold.find(l => l.locationName === this.selectedCounty);
    const heatSt = this.healthHeat.find(l => l.locationName === this.selectedCounty);
    
    let healthHtml = "";
    if (coldSt || heatSt) {
      const coldVal = coldSt?.weatherElement?.find(e => e.elementName === "ColdInjuryIndex")?.time?.[0]?.parameter?.parameterName || "正常";
      const heatVal = heatSt?.weatherElement?.find(e => e.elementName === "HeatInjuryIndex")?.time?.[0]?.parameter?.parameterName || "低";
      healthHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
          <div class="kpi-card" style="padding: 10px;">
            <div class="kpi-label">❄️ 冷傷害指數</div>
            <div class="kpi-num" style="font-size:15px; color:var(--accent); margin-top:4px;">${coldVal}</div>
          </div>
          <div class="kpi-card" style="padding: 10px;">
            <div class="kpi-label">🔥 熱傷害指數</div>
            <div class="kpi-num" style="font-size:15px; color:var(--warning); margin-top:4px;">${heatVal}</div>
          </div>
        </div>
      `;
    }
    
    this.panel.innerHTML = `
      <div class="panel-section">
        <h3>選擇縣市</h3>
        <select id="county-forecast-sel" style="margin-bottom: 12px;">
          ${this.COUNTY_CENTROIDS.map(c => `<option value="${c.name}" ${c.name === this.selectedCounty ? "selected" : ""}>${c.name}</option>`).join("")}
        </select>
      </div>
      
      <div class="panel-section">
        <h3>⚠️ 災害警戒資訊</h3>
        ${warningHtml}
      </div>
      
      <div class="panel-section">
        <h3>📅 36小時天氣預報</h3>
        ${wxCards}
      </div>
      
      <div class="panel-section">
        <h3>🏥 健康氣象指數</h3>
        ${healthHtml}
      </div>
      
      <div class="panel-section">
        <h3>📈 7日溫度趨勢</h3>
        <div class="chart-container" style="position: relative; height: 180px; width: 100%;">
          <canvas id="forecast-7d-chart"></canvas>
        </div>
      </div>
    `;
    
    // Bind dropdown selection
    document.getElementById("county-forecast-sel").onchange = (e) => {
      this.selectedCounty = e.target.value;
      const centroid = this.COUNTY_CENTROIDS.find(c => c.name === this.selectedCounty);
      if (centroid) this.map.panTo([centroid.lat, centroid.lng]);
      this.renderSidePanel();
    };
    
    // Render 7-day chart
    this.render7DayChart();
  },
  
  render7DayChart() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
    
    const f7d = this.forecast7d.find(loc => loc.locationName === this.selectedCounty);
    if (!f7d) return;
    
    // Parse times and temperatures
    const elements = f7d.weatherElement || [];
    const minTEl = elements.find(el => el.elementName === "MinT")?.time || [];
    const maxTEl = elements.find(el => el.elementName === "MaxT")?.time || [];
    
    const labels = [];
    const minTemps = [];
    const maxTemps = [];
    
    // Take 7 intervals (daytime/nighttime)
    for (let i = 0; i < Math.min(14, minTEl.length); i += 2) {
      const date = new Date(minTEl[i]?.startTime);
      labels.push(`${date.getMonth()+1}/${date.getDate()}`);
      minTemps.push(parseFloat(minTEl[i]?.parameter?.parameterName));
      maxTemps.push(parseFloat(maxTEl[i]?.parameter?.parameterName));
    }
    
    const ctx = document.getElementById("forecast-7d-chart").getContext("2d");
    this.chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "最高溫",
            data: maxTemps,
            borderColor: "#ff7043",
            backgroundColor: "rgba(255, 112, 67, 0.15)",
            tension: 0.3,
            fill: true
          },
          {
            label: "最低溫",
            data: minTemps,
            borderColor: "#29b6f6",
            backgroundColor: "rgba(41, 182, 246, 0.15)",
            tension: 0.3,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#9fb0c8", font: { size: 10 } }
          },
          x: {
            grid: { display: false },
            ticks: { color: "#9fb0c8", font: { size: 10 } }
          }
        }
      }
    });
  }
};
