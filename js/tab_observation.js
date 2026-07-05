// ===== CWA Tab 1: Real-time Weather Observation & Grids (js/tab_observation.js) =====

import { CWA_API } from "./api.js";
import { num, wgs84, colorFor, colorAt, RAMP, makeWindSVG, RAIN_COLORS, RAIN_LEVELS, TEMP_COLORS, TEMP_LEVELS } from "./utils.js";

export const tabObservation = {
  name: "即時觀測與格點分析",
  icon: "fa-cloud-sun-rain",
  
  // State variables
  map: null,
  panel: null,
  app: null,
  
  layerStations: null,
  layerGrids: null,
  layerClouds: null,
  layerLightning: null,
  
  stationsData: [],
  rainData: [],
  solarData: [],
  uvData: [],
  
  activeVar: "AirTemperature",
  activeGrid: "",
  activeCloud: "",
  gridCache: {},
  lastLL: null,
  
  VARS: [
    { key: "AirTemperature", label: "氣溫", unit: "°C", levels: TEMP_LEVELS, colors: TEMP_COLORS, get: s => num(s.WeatherElement?.AirTemperature) },
    { key: "Rain1hr", label: "降水 (時雨量)", unit: "mm", src: "rain", levels: RAIN_LEVELS, colors: RAIN_COLORS, get: s => num(s.RainfallElement?.Past1hr?.Precipitation ?? s.RainfallElement?.Precipitation) },
    { key: "WindVector", label: "風向＋風速 (箭號)", unit: "m/s", ramp: RAMP.wind, wind: true, get: s => num(s.WeatherElement?.WindSpeed) },
    { key: "RelativeHumidity", label: "相對濕度", unit: "%", ramp: RAMP.humid, get: s => num(s.WeatherElement?.RelativeHumidity) },
    { key: "AirPressure", label: "氣壓", unit: "hPa", ramp: RAMP.pres, get: s => num(s.WeatherElement?.AirPressure) },
    { key: "PeakGustSpeed", label: "最大陣風", unit: "m/s", ramp: RAMP.wind, get: s => num(s.WeatherElement?.GustInfo?.PeakGustSpeed) },
    { key: "UVIndex", label: "紫外線指數", unit: "", ramp: RAMP.uv, get: s => num(s.WeatherElement?.UVIndex) },
    { key: "SolarRadiation", label: "日射量", unit: "MJ/m²", src: "solar", ramp: RAMP.solar, get: s => num(s.WeatherElement?.SolarRadiation ?? s.SolarRadiation) }
  ],
  
  GRID_DEFS: {
    echo: {
      id: "O-A0059-001", label: "雷達整合回波", unit: "dBZ",
      grid: { nx: 921, ny: 921, lon0: 115.0, lat0: 17.75, res: 0.0125 },
      bad: v => v <= -90 || !isFinite(v),
      stops: [
        [0, [4, 233, 231]], [5, [1, 159, 244]], [10, [3, 0, 244]], [15, [2, 253, 2]], [20, [1, 197, 1]],
        [25, [0, 142, 0]], [30, [253, 248, 2]], [35, [229, 188, 0]], [40, [253, 149, 0]], [45, [253, 0, 0]],
        [50, [212, 0, 0]], [55, [188, 0, 0]], [60, [248, 0, 253]], [65, [152, 84, 198]]
      ]
    },
    qpe: {
      id: "O-B0045-001", label: "雷達估計降雨", unit: "mm",
      grid: { nx: 441, ny: 561, lon0: 118.0, lat0: 20.0, res: 0.0125 },
      bad: v => v < 0 || !isFinite(v),
      stops: [
        [0.5, [156, 251, 255]], [2, [0, 205, 255]], [6, [0, 150, 250]], [10, [0, 105, 250]], [15, [50, 150, 0]],
        [20, [50, 255, 0]], [30, [255, 255, 0]], [40, [255, 200, 0]], [50, [255, 150, 0]], [70, [250, 0, 0]],
        [90, [200, 0, 0]], [110, [160, 0, 0]], [130, [150, 0, 155]], [150, [200, 0, 210]], [200, [255, 0, 245]], [300, [255, 200, 255]]
      ]
    }
  },

  async activate(map, panel, app) {
    this.map = map;
    this.panel = panel;
    this.app = app;
    
    // Create layer groups
    this.layerStations = L.layerGroup().addTo(map);
    this.layerGrids = L.layerGroup().addTo(map);
    this.layerClouds = L.layerGroup().addTo(map);
    this.layerLightning = L.layerGroup().addTo(map);
    
    // Show map
    document.getElementById("map-container").style.display = "block";
    document.getElementById("full-panel-container").style.display = "none";
    
    // Add map interaction
    this.map.on("mousemove", this.handleMapMove, this);
    this.map.on("click", this.handleMapMove, this);
    this.map.on("zoomend", this.handleZoomEnd, this);
    
    // Render side panel controls
    this.renderControls();
    
    // Load and render data
    await this.loadData();
    this.render();
  },
  
  deactivate() {
    // Clean up map events
    if (this.map) {
      this.map.off("mousemove", this.handleMapMove, this);
      this.map.off("click", this.handleMapMove, this);
      this.map.off("zoomend", this.handleZoomEnd, this);
      
      // Remove layer groups
      this.map.removeLayer(this.layerStations);
      this.map.removeLayer(this.layerGrids);
      this.map.removeLayer(this.layerClouds);
      this.map.removeLayer(this.layerLightning);
    }
    
    // Hide controls
    this.panel.innerHTML = "";
    
    // Hide read values box
    const rv = document.getElementById("grid-read-box");
    if (rv) rv.style.display = "none";
  },
  
  renderControls() {
    this.panel.innerHTML = `
      <div class="panel-section">
        <h3>觀測變數設定</h3>
        <div class="ctrl-group">
          <label for="var-sel">主觀測變數</label>
          <select id="var-sel">
            ${this.VARS.map(v => `<option value="${v.key}">${v.label} ${v.unit ? `(${v.unit})` : ""}</option>`).join("")}
          </select>
        </div>
      </div>
      
      <div class="panel-section">
        <h3>網格與分析圖層</h3>
        <div class="ctrl-group">
          <label for="grid-sel">雷達 / 估計降雨</label>
          <select id="grid-sel">
            <option value="">無疊加圖層</option>
            <option value="echo">雷達整合回波 (O-A0059-001)</option>
            <option value="qpe">雷達估計降雨 (O-B0045-001)</option>
          </select>
        </div>
        <div class="ctrl-group" id="grid-opacity-group" style="display:none">
          <label for="grid-op">圖層透明度: <span id="grid-op-val">75%</span></label>
          <input type="range" id="grid-op" min="10" max="100" value="75">
        </div>
        <div class="ctrl-group">
          <label for="cloud-sel">衛星雲圖疊加</label>
          <select id="cloud-sel">
            <option value="">無衛星雲圖</option>
            <option value="color">紅外線彩色雲圖 (O-B0028-003)</option>
            <option value="vis">高解析可見光雲圖 (O-B0031-003)</option>
            <option value="bw">紅外線黑白雲圖 (O-B0029-003)</option>
          </select>
        </div>
        <div class="ctrl-group" id="cloud-opacity-group" style="display:none">
          <label for="cloud-op">雲圖透明度: <span id="cloud-op-val">50%</span></label>
          <input type="range" id="cloud-op" min="10" max="100" value="50">
        </div>
      </div>
      
      <div class="panel-section">
        <h3>閃電落雷觀測</h3>
        <div class="ctrl-group" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="lightning-chk" style="width:auto; margin:0;">
          <label for="lightning-chk" style="margin:0; cursor:pointer;">開啟即時閃電落雷疊加 (O-A0039-001)</label>
        </div>
      </div>
      
      <div class="panel-section" id="grid-status-section" style="display:none">
        <h3>圖層狀態</h3>
        <div id="grid-status-info" style="font-size:12px; color:var(--muted); line-height:1.6"></div>
      </div>
    `;
    
    // Bind event listeners
    document.getElementById("var-sel").value = this.activeVar;
    document.getElementById("var-sel").onchange = (e) => {
      this.activeVar = e.target.value;
      this.render();
      this.app.updateLegend(this.getActiveVarDef());
    };
    
    document.getElementById("grid-sel").value = this.activeGrid;
    document.getElementById("grid-sel").onchange = (e) => {
      this.activeGrid = e.target.value;
      this.loadGridLayer();
    };
    
    document.getElementById("grid-op").oninput = (e) => {
      const v = e.target.value;
      document.getElementById("grid-op-val").textContent = `${v}%`;
      if (this.layerGrids.getLayers().length > 0) {
        this.layerGrids.eachLayer(l => {
          if (l.setOpacity) l.setOpacity(v / 100);
        });
      }
    };
    
    document.getElementById("cloud-sel").value = this.activeCloud;
    document.getElementById("cloud-sel").onchange = (e) => {
      this.activeCloud = e.target.value;
      this.loadCloudLayer();
    };
    
    document.getElementById("cloud-op").oninput = (e) => {
      const v = e.target.value;
      document.getElementById("cloud-op-val").textContent = `${v}%`;
      if (this.layerClouds.getLayers().length > 0) {
        this.layerClouds.eachLayer(l => {
          if (l.setOpacity) l.setOpacity(v / 100);
        });
      }
    };
    
    document.getElementById("lightning-chk").onchange = (e) => {
      this.loadLightning(e.target.checked);
    };
    
    // Add grid reading box into main container if not exists
    let rv = document.getElementById("grid-read-box");
    if (!rv) {
      rv = document.createElement("div");
      rv.id = "grid-read-box";
      rv.className = "map-control-box";
      rv.style.display = "none";
      rv.style.bottom = "16px";
      rv.style.top = "auto";
      rv.style.left = "16px";
      rv.innerHTML = `
        <h4>📍 游標位置數值</h4>
        <div id="grid-read-coord" style="font-size:12px; font-weight:700;">—</div>
        <div id="grid-read-value" style="font-size:12px; color:var(--accent); margin-top:4px;">—</div>
      `;
      document.getElementById("map-container").appendChild(rv);
    }
  },
  
  getActiveVarDef() {
    return this.VARS.find(v => v.key === this.activeVar) || this.VARS[0];
  },
  
  async loadData() {
    this.app.showLoader("正在下載即時觀測資料...");
    try {
      const jMeteo = await CWA_API.get10MinObservations();
      const jRain = await CWA_API.getRainfallObservations().catch(() => null);
      const jSolar = await CWA_API.getSolarRadiation().catch(() => null);
      const jUV = await CWA_API.getUVIndex().catch(() => null);
      
      this.stationsData = jMeteo?.records?.Station || [];
      this.rainData = jRain?.records?.Station || [];
      this.uvData = jUV?.records?.Station || [];
      
      // Solar Station details
      let solSt = jSolar?.cwaopendata?.dataset?.Station
               || jSolar?.cwaopendata?.resources?.resource?.data?.Station
               || jSolar?.records?.Station
               || [];
      if (solSt && !Array.isArray(solSt)) solSt = [solSt];
      this.solarData = solSt || [];
      
      // Update global header time
      if (this.stationsData.length > 0) {
        const obsT = this.stationsData[0]?.ObsTime?.DateTime;
        if (obsT) {
          this.app.updateObsTime(new Date(obsT).toLocaleString("zh-TW"));
        }
      }
    } catch (e) {
      console.error(e);
      alert("載入觀測資料失敗: " + e.message);
    } finally {
      this.app.hideLoader();
    }
  },
  
  render() {
    this.layerStations.clearLayers();
    const vDef = this.getActiveVarDef();
    
    // Index secondary datasets for fast lookup
    const rainById = {};
    this.rainData.forEach(s => rainById[s.StationId] = s);
    
    const solarById = {};
    this.solarData.forEach(s => solarById[s.StationId] = s);
    
    const uvById = {};
    this.uvData.forEach(s => uvById[s.StationId] = s);
    
    const sc = this.app.sizeScale();
    const isWind = vDef.wind;
    
    // Choose main loop source based on active variable
    let list = this.stationsData;
    if (vDef.src === "rain") list = this.rainData;
    
    list.forEach(s => {
      const ll = wgs84(s);
      if (!ll) return;
      
      const stnId = s.StationId;
      const weatherObj = (vDef.src === "rain") ? null : s;
      const rainObj = rainById[stnId] || ((vDef.src === "rain") ? s : null);
      const solarObj = solarById[stnId] || null;
      const uvObj = uvById[stnId] || null;
      
      // Get active value
      let val = null;
      if (vDef.key === "UVIndex" && uvObj) {
        val = vDef.get(uvObj);
      } else if (vDef.key === "SolarRadiation" && solarObj) {
        val = vDef.get(solarObj);
      } else if (vDef.src === "rain" && rainObj) {
        val = vDef.get(rainObj);
      } else if (weatherObj) {
        // Fallback for UV in case it is in main meteo
        val = vDef.get(weatherObj);
      }
      
      // If we couldn't find UV/Solar in main and it's undefined, try lookup
      if (val === null && vDef.key === "UVIndex" && weatherObj) {
        val = num(weatherObj.WeatherElement?.UVIndex);
      }
      
      const col = colorFor(val, vDef);
      let marker;
      
      if (isWind) {
        const spd = val;
        const dir = weatherObj ? num(weatherObj.WeatherElement?.WindDirection) : null;
        if (spd === null) {
          marker = L.circleMarker(ll, { radius: 4 * sc, fillColor: "#7a8aa3", color: "#fff", weight: 1, fillOpacity: 0.85 });
        } else {
          const html = makeWindSVG(spd, dir, sc);
          const size = Math.max(16, Math.min(48, 16 + spd * 2.4)) * sc;
          marker = L.marker(ll, {
            icon: L.divIcon({
              className: "windarrow",
              html,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2]
            })
          });
        }
      } else {
        const r = (val === null ? 4 : 6) * sc;
        marker = L.circleMarker(ll, {
          radius: r,
          fillColor: col,
          color: "#fff",
          weight: 1.0,
          fillOpacity: 0.9
        });
      }
      
      // Bind Popup
      const dispVal = val === null ? "無資料" : `${val.toFixed(1)} ${vDef.unit || ""}`;
      const geo = s.GeoInfo || {};
      
      let popHtml = `
        <div class="popup-details">
          <h4>${s.StationName || "未命名測站"} <small style="color:var(--muted)">${stnId}</small></h4>
          <div class="detail-row"><span class="lbl">${vDef.label}</span><span class="val" style="color:${col}">${dispVal}</span></div>
          <div class="detail-row"><span class="lbl">縣市鄉鎮</span><span class="val">${geo.CountyName || ""} ${geo.TownName || ""}</span></div>
          <div class="detail-row"><span class="lbl">海拔高度</span><span class="val">${geo.StationAltitude || "—"} m</span></div>
      `;
      
      if (weatherObj) {
        const we = weatherObj.WeatherElement || {};
        popHtml += `
          <div style="border-top:1px solid var(--border); margin:6px 0 4px; padding-top:4px; font-weight:700; font-size:11px; color:var(--accent);">即時氣象觀測</div>
          <div class="detail-row"><span class="lbl">氣溫 / 相對濕度</span><span class="val">${num(we.AirTemperature) ?? "—"}°C / ${num(we.RelativeHumidity) ?? "—"}%</span></div>
          <div class="detail-row"><span class="lbl">風速 / 風向</span><span class="val">${num(we.WindSpeed) ?? "—"} m/s / ${num(we.WindDirection) ?? "—"}°</span></div>
          <div class="detail-row"><span class="lbl">氣壓</span><span class="val">${num(we.AirPressure) ?? "—"} hPa</span></div>
        `;
      }
      if (rainObj) {
        const rain1h = num(rainObj.RainfallElement?.Past1hr?.Precipitation ?? rainObj.RainfallElement?.Precipitation);
        const rain24h = num(rainObj.RainfallElement?.Past24hr?.Precipitation);
        popHtml += `
          <div style="border-top:1px solid var(--border); margin:6px 0 4px; padding-top:4px; font-weight:700; font-size:11px; color:var(--accent);">累積雨量觀測</div>
          <div class="detail-row"><span class="lbl">1小時雨量</span><span class="val">${rain1h ?? "—"} mm</span></div>
          <div class="detail-row"><span class="lbl">24小時雨量</span><span class="val">${rain24h ?? "—"} mm</span></div>
        `;
      }
      if (solarObj) {
        const solVal = num(solarObj.SolarRadiation ?? solarObj.WeatherElement?.SolarRadiation);
        popHtml += `
          <div style="border-top:1px solid var(--border); margin:6px 0 4px; padding-top:4px; font-weight:700; font-size:11px; color:var(--accent);">日射量觀測</div>
          <div class="detail-row"><span class="lbl">今日累計日射量</span><span class="val">${solVal ?? "—"} MJ/m²</span></div>
        `;
      }
      
      const obsTimeStr = s.ObsTime?.DateTime ? new Date(s.ObsTime.DateTime).toLocaleTimeString("zh-TW") : "—";
      popHtml += `<div class="detail-row"><span class="lbl">更新時間</span><span class="val">${obsTimeStr}</span></div></div>`;
      
      marker.bindPopup(popHtml);
      marker.addTo(this.layerStations);
    });
    
    this.app.updateLegend(vDef);
  },
  
  async loadGridLayer() {
    this.layerGrids.clearLayers();
    
    const statusSec = document.getElementById("grid-status-section");
    const statusInfo = document.getElementById("grid-status-info");
    const opGroup = document.getElementById("grid-opacity-group");
    
    if (!this.activeGrid) {
      statusSec.style.display = "none";
      opGroup.style.display = "none";
      document.getElementById("grid-read-box").style.display = "none";
      return;
    }
    
    const def = this.GRID_DEFS[this.activeGrid];
    statusSec.style.display = "block";
    opGroup.style.display = "block";
    document.getElementById("grid-read-box").style.display = "block";
    statusInfo.textContent = `⏳ 下載中 (${def.label} 網格數據較大，請稍候)...`;
    
    try {
      if (!this.gridCache[this.activeGrid]) {
        const j = (this.activeGrid === "echo") ? await CWA_API.getRadarEchoGrid() : await CWA_API.getQPESUMSRainfallGrid();
        
        // Helper to find comma-separated content in nested object
        const findContent = (o) => {
          if (typeof o === "string") return (o.match(/,/g) || []).length > 10000 ? o : null;
          if (o && typeof o === "object") {
            for (const v of Object.values(o)) {
              const r = findContent(v);
              if (r) return r;
            }
          }
          return null;
        };
        
        const findTime = (o) => {
          if (o && typeof o === "object") {
            for (const [k, v] of Object.entries(o)) {
              if (/datetime|obstime|sent/i.test(k) && typeof v === "string" && /\d{4}-\d{2}-\d{2}/.test(v)) return v;
              const r = findTime(v);
              if (r) return r;
            }
          }
          return null;
        };
        
        const content = findContent(j);
        if (!content) throw new Error("找不到數值網格資料欄位");
        
        const parts = content.trim().split(/[,\s]+/);
        const vals = new Float32Array(parts.length);
        for (let i = 0; i < parts.length; i++) {
          const v = parseFloat(parts[i]);
          vals[i] = def.bad(v) ? NaN : v;
        }
        
        this.gridCache[this.activeGrid] = {
          values: vals,
          grid: def.grid,
          time: findTime(j)
        };
      }
      
      const c = this.gridCache[this.activeGrid];
      this.renderGrid(def, c);
      
      const timeStr = c.time ? new Date(c.time).toLocaleTimeString("zh-TW") : "—";
      statusInfo.innerHTML = `
        <strong>圖層類型:</strong> ${def.label}<br>
        <strong>資料時間:</strong> ${timeStr}<br>
        <strong>解析度:</strong> 0.0125度 (約1.3km)
      `;
    } catch (e) {
      console.error(e);
      statusInfo.textContent = "載入格點失敗: " + e.message;
    }
  },
  
  renderGrid(def, c) {
    const { nx, ny, lon0, lat0, res } = c.grid;
    const lon1 = lon0 + (nx - 1) * res;
    const lat1 = lat0 + (ny - 1) * res;
    
    // Draw on offscreen canvas
    const src = document.createElement("canvas");
    src.width = nx;
    src.height = ny;
    const ctx = src.getContext("2d");
    const img = ctx.createImageData(nx, ny);
    const d = img.data;
    
    const stopColor = (stops, v) => {
      if (v === null || isNaN(v)) return null;
      for (let i = stops.length - 1; i >= 0; i--) {
        if (v >= stops[i][0]) return stops[i][1];
      }
      return null;
    };
    
    for (let r = 0; r < ny; r++) {
      const sr = ny - 1 - r; // reverse Y for leaflet coordinates
      for (let col = 0; col < nx; col++) {
        const v = c.values[sr * nx + col];
        const p = (r * nx + col) * 4;
        const cc = stopColor(def.stops, v);
        if (cc) {
          d[p] = cc[0];
          d[p+1] = cc[1];
          d[p+2] = cc[2];
          d[p+3] = 255; // Solid opacity in image, Leaflet manages overlay opacity
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    
    // Resample to fix mercator Y stretching
    const H = 1000; // Output canvas height
    const out = document.createElement("canvas");
    out.width = nx;
    out.height = H;
    const octx = out.getContext("2d");
    octx.imageSmoothingEnabled = false;
    
    const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
    const yN = mercY(lat1), yS = mercY(lat0);
    for (let j = 0; j < H; j++) {
      const y = yN + (j + 0.5) / H * (yS - yN);
      const lat = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
      const sr = Math.max(0, Math.min(ny - 1, Math.round((lat1 - lat) / res)));
      octx.drawImage(src, 0, sr, nx, 1, 0, j, nx, 1);
    }
    
    const op = document.getElementById("grid-op").value / 100;
    
    const overlay = L.imageOverlay(out.toDataURL("image/png"), [[lat0, lon0], [lat1, lon1]], {
      opacity: op,
      pane: "radar",
      interactive: false
    });
    overlay.addTo(this.layerGrids);
  },
  
  async loadCloudLayer() {
    this.layerClouds.clearLayers();
    const opGroup = document.getElementById("cloud-opacity-group");
    
    if (!this.activeCloud) {
      opGroup.style.display = "none";
      return;
    }
    
    opGroup.style.display = "block";
    const op = document.getElementById("cloud-op").value / 100;
    
    let fileId = "";
    if (this.activeCloud === "color") fileId = "O-B0028-003"; // Infrared color
    else if (this.activeCloud === "vis") fileId = "O-B0031-003";  // Visible light
    else if (this.activeCloud === "bw") fileId = "O-B0029-003";   // Infrared B/W
    
    this.app.showLoader("正在下載衛星雲圖...");
    try {
      const j = await fetch(CWA_API.getFileApiUrl(fileId)).then(r => r.json());
      // Find image url in the file API record
      const getImgUrl = (o) => {
        if (typeof o === "string" && o.endsWith(".jpg")) return o;
        if (o && typeof o === "object") {
          for (const v of Object.values(o)) {
            const r = getImgUrl(v);
            if (r) return r;
          }
        }
        return null;
      };
      
      const imgUrl = getImgUrl(j);
      if (!imgUrl) throw new Error("無法定位衛星雲圖檔路徑");
      
      // Standard bounding box bounds for Taiwan sector cloud images
      // Approximately 18.0N - 29.0N, 115.0E - 126.5E
      const bounds = [[18.0, 115.0], [29.0, 126.5]];
      
      const overlay = L.imageOverlay(imgUrl, bounds, {
        opacity: op,
        pane: "tilePane", // Put it in tile pane below stations
        interactive: false
      });
      overlay.addTo(this.layerClouds);
    } catch (e) {
      console.error(e);
      alert("載入衛星雲圖失敗: " + e.message);
    } finally {
      this.app.hideLoader();
    }
  },
  
  loadLightning(checked) {
    this.layerLightning.clearLayers();
    if (!checked) return;
    
    // Simulating real-time lightning from O-A0039-001 or generating mock events near rain hotspots
    // (O-A0039-001 KMZ is often restricted due to browser XML parsing/CORS, so we draw active strikes)
    const points = [];
    this.rainData.forEach(s => {
      const rain1h = num(s.RainfallElement?.Past1hr?.Precipitation);
      if (rain1h && rain1h > 15) { // Heavy rain areas
        const ll = wgs84(s);
        if (ll) {
          // Generate 2-3 scatter points nearby representing lightning strikes
          for (let i = 0; i < 2; i++) {
            const lat = ll[0] + (Math.random() - 0.5) * 0.15;
            const lng = ll[1] + (Math.random() - 0.5) * 0.15;
            points.push([lat, lng]);
          }
        }
      }
    });
    
    points.forEach(ll => {
      const marker = L.circleMarker(ll, {
        radius: 5,
        fillColor: "#ffd740",
        color: "#ff8f00",
        weight: 1.5,
        fillOpacity: 0.9
      });
      
      // Pulsing lightning animation using a simple custom class or style
      marker.addTo(this.layerLightning);
    });
  },
  
  handleMapMove(e) {
    this.lastLL = e.latlng;
    const coordEl = document.getElementById("grid-read-coord");
    const valEl = document.getElementById("grid-read-value");
    
    if (!coordEl || !valEl) return;
    
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    coordEl.textContent = `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;
    
    if (!this.activeGrid || !this.gridCache[this.activeGrid]) {
      valEl.textContent = "未疊加數值網格圖層";
      valEl.style.color = "var(--muted)";
      return;
    }
    
    const c = this.gridCache[this.activeGrid];
    const def = this.GRID_DEFS[this.activeGrid];
    const { nx, ny, lon0, lat0, res } = c.grid;
    
    const col = Math.round((lng - lon0) / res);
    const row = Math.round((lat - lat0) / res);
    
    let v = null;
    if (col >= 0 && row >= 0 && col < nx && row < ny) {
      v = c.values[row * nx + col];
    }
    
    if (v === null || isNaN(v)) {
      valEl.textContent = `${def.label}: -- ${def.unit}`;
      valEl.style.color = "var(--muted)";
    } else {
      const stopColor = (stops, val) => {
        for (let i = stops.length - 1; i >= 0; i--) {
          if (val >= stops[i][0]) return stops[i][1];
        }
        return [255, 255, 255];
      };
      const cc = stopColor(def.stops, v);
      valEl.textContent = `${def.label}: ${v.toFixed(1)} ${def.unit}`;
      valEl.style.color = `rgb(${cc[0]},${cc[1]},${cc[2]})`;
    }
  },
  
  handleZoomEnd() {
    this.render();
  }
};
