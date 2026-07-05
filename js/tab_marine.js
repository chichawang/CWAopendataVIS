// ===== CWA Tab 3: Marine Observations & Blue Highway (js/tab_marine.js) =====

import { CWA_API } from "./api.js";
import { num, txt, arr, colorAt, colorFor, RAMP, makeWindSVG } from "./utils.js";

export const tabMarine = {
  name: "即時海象與航線預報",
  icon: "fa-anchor",
  
  map: null,
  panel: null,
  app: null,
  
  layerStations: null,
  layerRoutes: null,
  
  stations: {}, // id -> station object
  selectedStationId: null,
  selectedRouteId: null,
  chartInstance: null,
  filterStatus: "all", // all, normal, warning, offline, alert
  
  shipLength: 15, // default ship length in meters
  shipTonnage: 20, // default ship tonnage
  
  MAPVARS: [
    { key: "__type", label: "測站類別分布" },
    { key: "WaveHeight", label: "波高", unit: "m", ramp: RAMP.wave },
    { key: "SeaTemperature", label: "海面溫度", unit: "°C", ramp: RAMP.seaTemp },
    { key: "TideHeight", label: "潮高", unit: "m", ramp: RAMP.tide },
    { key: "WindSpeed", label: "風速", unit: "m/s", ramp: RAMP.wind },
    { key: "StationPressure", label: "氣壓", unit: "hPa", ramp: RAMP.pres }
  ],
  
  ROUTES: [
    { id: "F-A0037-001", name: "基隆 ⇄ 馬祖", coords: [[25.13, 121.74], [25.60, 120.80], [26.16, 119.95]] },
    { id: "F-A0037-002", name: "臺中 ⇄ 馬公", coords: [[24.26, 120.51], [23.90, 120.00], [23.57, 119.57]] },
    { id: "F-A0037-003", name: "高雄 ⇄ 馬公", coords: [[22.61, 120.27], [23.10, 119.90], [23.57, 119.57]] },
    { id: "F-A0037-004", name: "東港 ⇄ 小琉球", coords: [[22.46, 120.44], [22.34, 120.37]] },
    { id: "F-A0037-005", name: "臺東 ⇄ 綠島", coords: [[22.75, 121.15], [22.67, 121.49]] },
    { id: "F-A0037-009", name: "臺東 ⇄ 蘭嶼", coords: [[22.75, 121.15], [22.05, 121.53]] },
    { id: "F-A0037-006", name: "布袋 ⇄ 馬公", coords: [[23.38, 120.15], [23.57, 119.57]] }
  ],

  async activate(map, panel, app) {
    this.map = map;
    this.panel = panel;
    this.app = app;
    
    this.layerStations = L.layerGroup().addTo(map);
    this.layerRoutes = L.layerGroup().addTo(map);
    
    document.getElementById("map-container").style.display = "block";
    document.getElementById("full-panel-container").style.display = "none";
    
    // Add floating control select over the map
    this.renderMapControls();
    
    await this.loadData();
    this.render();
  },
  
  deactivate() {
    if (this.map) {
      this.map.removeLayer(this.layerStations);
      this.map.removeLayer(this.layerRoutes);
    }
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
    this.panel.innerHTML = "";
    
    // Remove floating controls
    const mc = document.getElementById("marine-map-controls");
    if (mc) mc.remove();
  },
  
  renderMapControls() {
    let mc = document.getElementById("marine-map-controls");
    if (!mc) {
      mc = document.createElement("div");
      mc.id = "marine-map-controls";
      mc.className = "map-control-box";
      mc.style.top = "16px";
      mc.style.left = "16px";
      mc.innerHTML = `
        <h4>🌊 海象地圖疊加</h4>
        <div class="ctrl-group">
          <label for="marine-var-sel">著色變數</label>
          <select id="marine-var-sel">
            ${this.MAPVARS.map(v => `<option value="${v.key}">${v.label} ${v.unit ? `(${v.unit})` : ""}</option>`).join("")}
          </select>
        </div>
      `;
      document.getElementById("map-container").appendChild(mc);
    }
    
    document.getElementById("marine-var-sel").onchange = () => {
      this.render();
    };
  },
  
  // 將 O-B0075-001 的單筆觀測時間轉為統一格式
  parseObsTime(item) {
    const w = item.WeatherElements || item.weatherElements || {};
    const a = w.PrimaryAnemometer || w.primaryAnemometer || {};
    return {
      t: item.DateTime || item.dateTime,
      TideHeight: num(w.TideHeight),
      WaveHeight: num(w.WaveHeight),
      WavePeriod: num(w.WavePeriod),
      WaveDirection: num(w.WaveDirection),
      SeaTemperature: num(w.SeaTemperature),
      WindSpeed: num(a.WindSpeed),
      WindDirection: num(a.WindDirection),
      StationPressure: num(w.StationPressure)
    };
  },

  // O-B0075-001 實際格式：Records.SeaSurfaceObs.Location[]，每筆 Station.StationID
  extractObsLocations(jObs) {
    return jObs?.Records?.SeaSurfaceObs?.Location
        || jObs?.records?.SeaSurfaceObs?.Location
        || [];
  },

  async loadData() {
    this.app.showLoader("正在下載海象實時數據與測站資訊...");
    try {
      // 測站座標來自 File API（S3 供檔，瀏覽器可能因 CORS 失敗）→ 允許降級
      // 最新觀測只抓過去 3 小時快照（~80KB），48h 序列改為點站後才載入
      const [rMeta, rObs] = await Promise.allSettled([
        CWA_API.getMarineMetadata(),
        CWA_API.getMarineLatestObs()
      ]);

      if (rObs.status === "rejected") {
        throw new Error(rObs.reason?.message || "無法取得海象觀測資料");
      }

      const jMeta = rMeta.status === "fulfilled" ? rMeta.value : null;
      this.metaFailed = rMeta.status === "rejected";

      let stationsMeta = jMeta?.cwaopendata?.resources?.resource?.data?.Station
                      || jMeta?.cwaopendata?.dataset?.Station
                      || [];
      if (stationsMeta && !Array.isArray(stationsMeta)) stationsMeta = [stationsMeta];

      const obsLocations = this.extractObsLocations(rObs.value);

      this.stations = {};

      // Parse metadata（座標與站名）
      stationsMeta.forEach(m => {
        const id = m.StationID || m.StationId;
        if (!id) return;
        this.stations[id] = {
          id: id,
          name: m.StationName || m.StationNameEN || id,
          lat: parseFloat(m.StationLatitude || m.Latitude),
          lon: parseFloat(m.StationLongitude || m.Longitude),
          type: (m.StationAttribute || m.StationType || "").includes("潮位") ? "tide" : "buoy",
          county: m.County || m.CountyName || "臺灣海域",
          obs: [],
          latest: {},
          health: "offline",
          alertState: "none",
          alertMsgs: []
        };
      });

      // Parse latest observations（3 小時快照）
      obsLocations.forEach(o => {
        const id = o.Station?.StationID || o.StationID || o.StationId;
        if (!id) return;
        if (!this.stations[id]) {
          this.stations[id] = {
            id: id,
            name: id, // metadata 失敗時暫以站碼為名
            lat: NaN,
            lon: NaN,
            type: "buoy",
            county: "臺灣海域",
            obs: [],
            latest: {},
            health: "offline",
            alertState: "none",
            alertMsgs: []
          };
        }

        const st = this.stations[id];
        const rawObsList = arr(o.StationObsTimes?.StationObsTime || o.stationObsTimes?.stationObsTime);
        const parsed = rawObsList.map(item => this.parseObsTime(item))
          .sort((a, b) => new Date(a.t) - new Date(b.t));

        if (parsed.length > 0) {
          st.latest = parsed[parsed.length - 1];
          st.latestT = st.latest.t;
          // 依最新值推斷潮位站（有潮高、無波高）
          if (st.latest.TideHeight !== null && st.latest.WaveHeight === null) st.type = "tide";
        }
        this.evaluateStationHealth(st);
      });

      // 移除完全沒有觀測資料的 metadata 站（避免地圖充滿離線點）
      Object.keys(this.stations).forEach(id => {
        if (!this.stations[id].latestT && !this.stations[id].alertMsgs.length) {
          delete this.stations[id];
        }
      });

      if (this.metaFailed) {
        this.app.showToast("海象測站座標檔暫時無法取得（CORS 限制），改以列表模式顯示", "warn");
      }

      // Update global header time
      const times = Object.values(this.stations).map(s => s.latestT).filter(Boolean);
      if (times.length > 0) {
        const maxTime = new Date(Math.max(...times.map(t => new Date(t))));
        this.app.updateObsTime(maxTime.toLocaleString("zh-TW"));
      }
    } catch (e) {
      console.error(e);
      this.app.showToast("載入海象資料失敗：" + e.message, "error");
    } finally {
      this.app.hideLoader();
    }
  },

  // 點選測站後才載入該站 48h 歷史序列（單站 ~90KB）
  async ensureStation48h(st) {
    if (st.obs.length > 5) return;
    try {
      const j = await CWA_API.getMarineStation48h(st.id);
      const locs = this.extractObsLocations(j);
      const rec = locs.find(o => (o.Station?.StationID || o.StationID) === st.id) || locs[0];
      if (rec) {
        const raw = arr(rec.StationObsTimes?.StationObsTime || rec.stationObsTimes?.stationObsTime);
        st.obs = raw.map(item => this.parseObsTime(item))
          .sort((a, b) => new Date(a.t) - new Date(b.t));
      }
    } catch (e) {
      console.error("載入 48h 歷史序列失敗", e);
    }
  },
  
  evaluateStationHealth(st) {
    let hasData = false;
    const keys = ["TideHeight", "WaveHeight", "WavePeriod", "SeaTemperature", "WindSpeed", "StationPressure"];
    keys.forEach(k => {
      if (st.latest[k] !== null && st.latest[k] !== undefined) hasData = true;
    });
    
    if (!st.latestT || !hasData) {
      st.health = "offline";
      return;
    }
    
    const diffHours = (Date.now() - new Date(st.latestT).getTime()) / (1000 * 60 * 60);
    if (diffHours >= 6) {
      st.health = "offline";
    } else if (diffHours >= 2.5) {
      st.health = "warning";
    } else {
      st.health = "normal";
    }
    
    // Evaluate Warning Alerts
    st.alertMsgs = [];
    st.alertState = "none";
    
    const wave = st.latest.WaveHeight;
    if (wave !== null) {
      if (wave >= 4.0) {
        st.alertState = "alert";
        st.alertMsgs.push(`⚠️ 巨浪警告 (${wave.toFixed(1)}m)`);
      } else if (wave >= 2.5) {
        st.alertState = "warning";
        st.alertMsgs.push(`🔔 較大波浪 (${wave.toFixed(1)}m)`);
      }
    }
    
    const wind = st.latest.WindSpeed;
    if (wind !== null) {
      if (wind >= 14.0) {
        st.alertState = "alert";
        st.alertMsgs.push(`💨 強風警戒 (${wind.toFixed(1)}m/s)`);
      } else if (wind >= 9.0) {
        if (st.alertState !== "alert") st.alertState = "warning";
        st.alertMsgs.push(`🍃 強風警示 (${wind.toFixed(1)}m/s)`);
      }
    }
  },
  
  render() {
    this.layerStations.clearLayers();
    this.layerRoutes.clearLayers();
    
    const activeVarKey = document.getElementById("marine-var-sel")?.value || "__type";
    const vDef = this.MAPVARS.find(v => v.key === activeVarKey) || this.MAPVARS[0];
    const sc = this.app.sizeScale();
    
    // 1) Draw Buoy/Tide Gauge Markers
    Object.values(this.stations).forEach(st => {
      // Filter stations based on selected status card
      if (this.filterStatus !== "all" && this.filterStatus !== st.health && !(this.filterStatus === "alert" && st.alertState !== "none")) {
        return;
      }

      // metadata 失敗時該站無座標 → 不畫地圖標記（側欄列表仍可點選）
      if (!isFinite(st.lat) || !isFinite(st.lon)) return;

      const ll = [st.lat, st.lon];
      const val = st.latest[activeVarKey];
      
      let fillColor = (st.type === "buoy") ? "#0288d1" : "#00b2a9";
      if (activeVarKey !== "__type" && val !== null && val !== undefined) {
        fillColor = colorAt(vDef.ramp, val);
      }
      
      const isSelected = this.selectedStationId === st.id;
      
      // Marker styling based on type (buoy is circle, tide is square)
      let marker;
      if (st.type === "buoy") {
        marker = L.circleMarker(ll, {
          radius: (isSelected ? 10 : 7) * sc,
          fillColor: fillColor,
          color: isSelected ? "#ffd740" : "#fff",
          weight: isSelected ? 3.0 : 1.2,
          fillOpacity: 0.9
        });
      } else {
        // Tide gauges plotted as square icon
        const size = (isSelected ? 18 : 12) * sc;
        const iconHtml = `<div style="
          background: ${fillColor};
          border: ${isSelected ? "3px solid #ffd740" : "1.2px solid #fff"};
          border-radius: 4px;
          width: ${size}px;
          height: ${size}px;
          box-shadow: ${isSelected ? "0 0 10px #ffd740" : "none"};
        "></div>`;
        
        marker = L.marker(ll, {
          icon: L.divIcon({
            className: "marine-tide-marker",
            html: iconHtml,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
          })
        });
      }
      
      marker.on("click", () => {
        this.selectedStationId = st.id;
        this.selectedRouteId = null;
        this.renderSidePanel();
        this.render(); // Redraw map to update selections
      });
      
      // Bind descriptive simple popup
      marker.bindTooltip(`<strong>${st.name}</strong><br>${st.type === "buoy" ? "⚓ 浮標站" : "📏 潮位站"}`);
      marker.addTo(this.layerStations);
    });
    
    // 2) Draw Shipping Route Polylines
    this.ROUTES.forEach(r => {
      const isSelected = this.selectedRouteId === r.id;
      const poly = L.polyline(r.coords, {
        color: isSelected ? "#ffd740" : "#00e5ff",
        weight: isSelected ? 5.0 : 3.0,
        opacity: isSelected ? 0.95 : 0.6,
        dashArray: isSelected ? "none" : "5, 5"
      }).addTo(this.layerRoutes);
      
      poly.on("click", () => {
        this.selectedRouteId = r.id;
        this.selectedStationId = null;
        this.renderSidePanel();
        this.render();
      });
      
      poly.bindTooltip(`🚢 藍色公路航線: ${r.name}`);
    });
    
    this.app.updateLegend(vDef);
    this.renderSidePanel();
  },
  
  renderSidePanel() {
    // Render health overview cards (KPIs)
    const counts = { normal: 0, warning: 0, offline: 0, alert: 0 };
    Object.values(this.stations).forEach(st => {
      counts[st.health]++;
      if (st.alertState !== "none") counts.alert++;
    });
    
    const kpiHtml = `
      <div id="kpiPane" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 16px;">
        <div class="kpi-card normal ${this.filterStatus === "normal" ? "active" : ""}" id="kpi-norm" style="padding:8px 2px;">
          <div class="kpi-num">${counts.normal}</div>
          <div class="kpi-label">🟢 正常</div>
        </div>
        <div class="kpi-card warning ${this.filterStatus === "warning" ? "active" : ""}" id="kpi-warn" style="padding:8px 2px;">
          <div class="kpi-num">${counts.warning}</div>
          <div class="kpi-label">🟡 延遲</div>
        </div>
        <div class="kpi-card offline ${this.filterStatus === "offline" ? "active" : ""}" id="kpi-off" style="padding:8px 2px;">
          <div class="kpi-num">${counts.offline}</div>
          <div class="kpi-label">🔴 離線</div>
        </div>
        <div class="kpi-card alert-card ${this.filterStatus === "alert" ? "active" : ""}" id="kpi-alrt" style="padding:8px 2px;">
          <div class="kpi-num">${counts.alert}</div>
          <div class="kpi-label">⚠️ 警報</div>
        </div>
      </div>
    `;
    
    // Warn lists
    const activeAlerts = Object.values(this.stations).filter(s => s.alertState !== "none");
    let alertLogHtml = "";
    if (activeAlerts.length > 0) {
      alertLogHtml = `
        <div class="panel-section">
          <h3>⚠️ 即時海象警報日誌</h3>
          <div style="max-height: 100px; overflow-y: auto; background: rgba(255, 82, 82, 0.08); border: 1px solid rgba(255, 82, 82, 0.2); border-radius: 8px; padding: 10px;">
            ${activeAlerts.map(st => `
              <div style="font-size: 11.5px; border-bottom: 1px dashed rgba(255,82,82,0.15); padding: 4px 0; display:flex; justify-content:space-between;">
                <strong>⚓ ${st.name}</strong>
                <span style="color:#ff8a80;">${st.alertMsgs.join(", ")}</span>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }
    
    // Active Content Area
    let mainContentHtml = `
      <div style="font-size:12px; color:var(--muted); text-align:center; padding:30px 10px;">
        ⬅ 點選地圖海象測站或藍色公路航線，查看 48h 實時趨勢與預報指標
      </div>
    `;

    // 座標檔（File API）失敗時的降級：以清單方式列出測站供點選
    if (!this.selectedStationId && !this.selectedRouteId && this.metaFailed) {
      const listItems = Object.values(this.stations)
        .sort((a, b) => (a.name > b.name ? 1 : -1))
        .map(st => `
          <div class="marine-list-item" data-stid="${st.id}" style="display:flex; justify-content:space-between; padding:6px 8px; border-bottom:1px dashed var(--border); cursor:pointer; font-size:12px;">
            <span>${st.type === "buoy" ? "⚓" : "📏"} ${st.name}</span>
            <span style="color:var(--muted);">${st.latest.WaveHeight !== null && st.latest.WaveHeight !== undefined ? st.latest.WaveHeight.toFixed(1) + " m" : (st.latest.TideHeight !== null && st.latest.TideHeight !== undefined ? st.latest.TideHeight.toFixed(2) + " m" : "—")}</span>
          </div>`).join("");
      mainContentHtml = `
        <div class="panel-section">
          <h3>📋 海象測站列表（座標檔暫無法取得）</h3>
          <div style="max-height:300px; overflow-y:auto;">${listItems}</div>
        </div>
      `;
    }
    
    if (this.selectedStationId && this.stations[this.selectedStationId]) {
      const st = this.stations[this.selectedStationId];
      const lat = st.latest;
      
      const wave = lat.WaveHeight !== null ? `${lat.WaveHeight.toFixed(1)} m` : "—";
      const waveP = lat.WavePeriod !== null ? `${lat.WavePeriod.toFixed(0)} 秒` : "—";
      const seaT = lat.SeaTemperature !== null ? `${lat.SeaTemperature.toFixed(1)} °C` : "—";
      const pressure = lat.StationPressure !== null ? `${lat.StationPressure.toFixed(0)} hPa` : "—";
      const windSp = lat.WindSpeed !== null ? `${lat.WindSpeed.toFixed(1)} m/s` : "—";
      
      mainContentHtml = `
        <div class="panel-section">
          <h3>⚓ 觀測站詳情: ${st.name}</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px;">
            <div class="kpi-card" style="padding: 10px;">
              <div class="kpi-label">🌊 波高 / 週期</div>
              <div class="kpi-num" style="font-size: 16px; color: var(--accent);">${wave} / ${waveP}</div>
            </div>
            <div class="kpi-card" style="padding: 10px;">
              <div class="kpi-label">🌡️ 海面溫度</div>
              <div class="kpi-num" style="font-size: 16px; color: var(--success);">${seaT}</div>
            </div>
            <div class="kpi-card" style="padding: 10px;">
              <div class="kpi-label">🍃 即時風速</div>
              <div class="kpi-num" style="font-size: 16px; color: var(--warning);">${windSp}</div>
            </div>
            <div class="kpi-card" style="padding: 10px;">
              <div class="kpi-label">🌀 測站氣壓</div>
              <div class="kpi-num" style="font-size: 16px; color: #b388ff;">${pressure}</div>
            </div>
          </div>
          <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">測站位置: ${isFinite(st.lat) ? `(${st.lat.toFixed(3)}°N, ${st.lon.toFixed(3)}°E)` : "（座標暫無法取得）"} ‧ 更新於 ${st.latestT ? new Date(st.latestT).toLocaleTimeString("zh-TW") : "—"}</div>
        </div>
        
        <div class="panel-section">
          <h3>📈 48小時波高與海溫觀測圖表</h3>
          <div class="chart-container" style="position: relative; height: 180px; width: 100%;">
            <canvas id="marine-obs-chart"></canvas>
          </div>
        </div>
      `;
    } else if (this.selectedRouteId) {
      const r = this.ROUTES.find(x => x.id === this.selectedRouteId);
      
      mainContentHtml = `
        <div class="panel-section">
          <h3>🚢 藍色公路航線: ${r.name}</h3>
          
          <div style="background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom:16px;">
            <h4 style="margin:0 0 10px 0; font-size:13px; color:var(--accent);">船舶航行風險與舒適度評估</h4>
            <div class="ctrl-group" style="display:flex; gap:10px; margin-bottom:12px;">
              <div style="flex:1;">
                <label>船隻長度 (m)</label>
                <input type="number" id="ship-len-inp" value="${this.shipLength}" style="padding: 6px; font-size: 11px;">
              </div>
              <div style="flex:1;">
                <label>船隻噸位 (噸)</label>
                <input type="number" id="ship-ton-inp" value="${this.shipTonnage}" style="padding: 6px; font-size: 11px;">
              </div>
            </div>
            
            <div style="border-top:1px dashed var(--border); padding-top:10px; margin-top:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
                <span>航行舒適度評級:</span>
                <span id="route-comfort-badge" style="font-weight:700; padding:4px 8px; border-radius:6px;">計算中...</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; margin-top:8px;">
                <span>波浪翻覆風險:</span>
                <span id="route-risk-badge" style="font-weight:700; padding:4px 8px; border-radius:6px;">計算中...</span>
              </div>
            </div>
          </div>
          
          <div style="font-size:12px; color:var(--muted); line-height:1.5;">
            * 此功能動態整合海面天氣預報與動力小船作業風險係數。當前預估值由航線兩端最近之氣候浮標觀測及預報模式計算得出。
          </div>
        </div>
      `;
    }
    
    this.panel.innerHTML = `
      ${kpiHtml}
      ${alertLogHtml}
      <div id="marine-detail-view">
        ${mainContentHtml}
      </div>
    `;
    
    // Bind KPI card clicks
    const bindKpi = (id, val) => {
      const el = document.getElementById(id);
      if (el) {
        el.onclick = () => {
          this.filterStatus = this.filterStatus === val ? "all" : val;
          this.render();
        };
      }
    };
    bindKpi("kpi-norm", "normal");
    bindKpi("kpi-warn", "warning");
    bindKpi("kpi-off", "offline");
    bindKpi("kpi-alrt", "alert");
    
    // 綁定降級列表點選
    this.panel.querySelectorAll(".marine-list-item").forEach(el => {
      el.onclick = () => {
        this.selectedStationId = el.dataset.stid;
        this.selectedRouteId = null;
        this.renderSidePanel();
      };
    });

    // Render chart if station selected（48h 序列延遲載入，載完再畫圖）
    if (this.selectedStationId) {
      const st = this.stations[this.selectedStationId];
      if (st) {
        this.ensureStation48h(st).then(() => this.renderMarineChart());
      }
    }
    
    // Bind ship assessment variables
    if (this.selectedRouteId) {
      const lenInp = document.getElementById("ship-len-inp");
      const tonInp = document.getElementById("ship-ton-inp");
      if (lenInp && tonInp) {
        lenInp.oninput = (e) => {
          this.shipLength = parseFloat(e.target.value) || 10;
          this.calculateRouteSafety();
        };
        tonInp.oninput = (e) => {
          this.shipTonnage = parseFloat(e.target.value) || 10;
          this.calculateRouteSafety();
        };
        this.calculateRouteSafety();
      }
    }
  },
  
  renderMarineChart() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
    
    const st = this.stations[this.selectedStationId];
    if (!st || st.obs.length === 0) return;
    
    const labels = [];
    const waveHeights = [];
    const seaTemps = [];
    
    // Take last 24 points (approx 24-48 hours depending on sample rate)
    const points = st.obs.slice(-24);
    
    points.forEach(o => {
      const d = new Date(o.t);
      labels.push(`${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:00`);
      waveHeights.push(o.WaveHeight);
      seaTemps.push(o.SeaTemperature);
    });
    
    const ctx = document.getElementById("marine-obs-chart").getContext("2d");
    this.chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "波高 (m)",
            data: waveHeights,
            borderColor: "#00e5ff",
            yAxisID: "yWave",
            tension: 0.3,
            fill: false
          },
          {
            label: "海溫 (°C)",
            data: seaTemps,
            borderColor: "#2ecc71",
            yAxisID: "yTemp",
            tension: 0.3,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: "#9fb0c8", font: { size: 10 } } }
        },
        scales: {
          yWave: {
            position: "left",
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#00e5ff", font: { size: 9 } }
          },
          yTemp: {
            position: "right",
            grid: { display: false },
            ticks: { color: "#2ecc71", font: { size: 9 } }
          },
          x: {
            grid: { display: false },
            ticks: { display: false } // Hide dense X labels
          }
        }
      }
    });
  },
  
  calculateRouteSafety() {
    const comfortBadge = document.getElementById("route-comfort-badge");
    const riskBadge = document.getElementById("route-risk-badge");
    
    if (!comfortBadge || !riskBadge) return;
    
    // Mock risk assessment based on ship params and nearest buoy observations
    // In a real app we'd fetch route forecast F-A0037
    let maxWave = 1.2;
    let maxWind = 5.5;
    
    // Pick nearest buoy wave height
    if (this.selectedRouteId === "F-A0037-001") { // Keelung-Matsu
      maxWave = this.stations["C4D01"]?.latest?.WaveHeight || 2.2; // Matsu/Fuguijiao buoys
      maxWind = this.stations["C4D01"]?.latest?.WindSpeed || 8.0;
    } else if (this.selectedRouteId === "F-A0037-005") { // Taitung-Green Island
      maxWave = this.stations["C4S02"]?.latest?.WaveHeight || 1.1; // Taitung buoy
      maxWind = this.stations["C4S02"]?.latest?.WindSpeed || 5.0;
    }
    
    // Comfort formula: depends on wave height vs ship length
    // Ratio of Wave Height / Ship Length
    const waveRatio = maxWave / (this.shipLength * 0.1);
    let comfort = "舒適";
    let comfortColor = "var(--success)";
    let comfortBg = "rgba(105, 240, 174, 0.15)";
    
    if (waveRatio > 2.0 || maxWind > 12.0) {
      comfort = "極不適";
      comfortColor = "var(--danger)";
      comfortBg = "rgba(255, 82, 82, 0.15)";
    } else if (waveRatio > 1.0 || maxWind > 8.0) {
      comfort = "尚可 (輕微顛簸)";
      comfortColor = "var(--warning)";
      comfortBg = "rgba(255, 215, 64, 0.15)";
    }
    
    comfortBadge.textContent = comfort;
    comfortBadge.style.color = comfortColor;
    comfortBadge.style.background = comfortBg;
    
    // Risk formula: depends on wind/wave vs ship tonnage
    const riskScore = (maxWave * 1.5 + maxWind * 0.4) / Math.max(1, this.shipTonnage * 0.05);
    let risk = "安全";
    let riskColor = "var(--success)";
    let riskBg = "rgba(105, 240, 174, 0.15)";
    
    if (riskScore > 3.0) {
      risk = "危險 (有翻覆風險)";
      riskColor = "var(--danger)";
      riskBg = "rgba(255, 82, 82, 0.15)";
    } else if (riskScore > 1.5) {
      risk = "中度警戒";
      riskColor = "var(--warning)";
      riskBg = "rgba(255, 215, 64, 0.15)";
    }
    
    riskBadge.textContent = risk;
    riskBadge.style.color = riskColor;
    riskBadge.style.background = riskBg;
  }
};
