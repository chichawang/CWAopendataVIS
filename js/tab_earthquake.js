// ===== CWA Tab 4: Earthquake & Geophysics (js/tab_earthquake.js) =====

import { CWA_API } from "./api.js";
import { num, wgs84 } from "./utils.js";

export const tabEarthquake = {
  name: "地震海嘯與地球物理",
  icon: "fa-earthquake",
  
  map: null,
  panel: null,
  app: null,
  
  layerEpicenters: null,
  layerGeophysics: null,
  isoseismalOverlay: null,
  
  significantEqs: [],
  minorEqs: [],
  selectedEqId: null,
  
  // GNSS movement vectors representing O-B0057-002 (Geodetic rate velocity vectors in Taiwan)
  // Eastern Taiwan plates collide NW, Western Taiwan slides slightly
  GNSS_STATIONS: [
    { name: "Hualien (HULA)", lat: 23.97, lng: 121.61, dx: -22, dy: 18 },  // moving NW
    { name: "Taitung (TTUN)", lat: 22.75, lng: 121.15, dx: -35, dy: 30 },  // fast NW
    { name: "Lan-yu (LANY)", lat: 22.05, lng: 121.55, dx: -45, dy: 40 },  // very fast NW
    { name: "Kent-ing (KTIN)", lat: 21.94, lng: 120.79, dx: -20, dy: 15 },
    { name: "Taichung (TCMS)", lat: 24.15, lng: 120.67, dx: -5, dy: 4 },   // slow NW
    { name: "Taipei (TAPO)", lat: 25.03, lng: 121.56, dx: -2, dy: 1 },    // almost static
    { name: "Tainan (TNSM)", lat: 23.00, lng: 120.20, dx: -10, dy: 5 }
  ],

  async activate(map, panel, app) {
    this.map = map;
    this.panel = panel;
    this.app = app;
    
    this.layerEpicenters = L.layerGroup().addTo(map);
    this.layerGeophysics = L.layerGroup().addTo(map);
    
    document.getElementById("map-container").style.display = "block";
    document.getElementById("full-panel-container").style.display = "none";
    
    this.renderMapControls();
    
    await this.loadData();
    this.render();
  },
  
  deactivate() {
    if (this.map) {
      this.map.removeLayer(this.layerEpicenters);
      this.map.removeLayer(this.layerGeophysics);
      if (this.isoseismalOverlay) {
        this.map.removeLayer(this.isoseismalOverlay);
        this.isoseismalOverlay = null;
      }
    }
    
    const mc = document.getElementById("eq-map-controls");
    if (mc) mc.remove();
    
    this.panel.innerHTML = "";
  },
  
  renderMapControls() {
    let mc = document.getElementById("eq-map-controls");
    if (!mc) {
      mc = document.createElement("div");
      mc.id = "eq-map-controls";
      mc.className = "map-control-box";
      mc.style.top = "16px";
      mc.style.left = "16px";
      mc.innerHTML = `
        <h4>🌋 地球物理與地震觀測</h4>
        <div class="ctrl-group" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <input type="checkbox" id="gnss-chk" checked style="width:auto; margin:0;">
          <label for="gnss-chk" style="margin:0; cursor:pointer;">疊加 GNSS 地表地殼位移向量</label>
        </div>
        <div class="ctrl-group" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="minor-eq-chk" style="width:auto; margin:0;">
          <label for="minor-eq-chk" style="margin:0; cursor:pointer;">顯示小區域有感地震 (E-A0016-001)</label>
        </div>
      `;
      document.getElementById("map-container").appendChild(mc);
    }
    
    document.getElementById("gnss-chk").onchange = (e) => {
      this.renderGNSS(e.target.checked);
    };
    
    document.getElementById("minor-eq-chk").onchange = (e) => {
      this.renderEpicenters(e.target.checked);
    };
  },
  
  async loadData() {
    this.app.showLoader("正在下載地震報告與強震觀測資料...");
    try {
      const jSig = await CWA_API.getSignificantEarthquake();
      const jMinor = await CWA_API.getMinorEarthquakes().catch(() => null);
      
      this.significantEqs = jSig?.records?.Earthquake || jSig?.records?.earthquake || [];
      this.minorEqs = jMinor?.records?.Earthquake || jMinor?.records?.earthquake || [];
      
      // Auto select latest significant earthquake
      if (this.significantEqs.length > 0) {
        this.selectedEqId = this.significantEqs[0].EarthquakeNo || this.significantEqs[0].earthquakeNo;
      }
    } catch (e) {
      console.error(e);
      alert("載入地震報告失敗: " + e.message);
    } finally {
      this.app.hideLoader();
    }
  },
  
  render() {
    this.renderEpicenters(document.getElementById("minor-eq-chk")?.checked);
    this.renderGNSS(document.getElementById("gnss-chk")?.checked);
    this.renderSidePanel();
  },
  
  renderEpicenters(showMinor = false) {
    this.layerEpicenters.clearLayers();
    if (this.isoseismalOverlay) {
      this.map.removeLayer(this.isoseismalOverlay);
      this.isoseismalOverlay = null;
    }
    
    const sc = this.app.sizeScale();
    
    const drawEqMarker = (eq, isMinor) => {
      const info = eq.EarthquakeInfo || eq.earthquakeInfo || {};
      const epi = info.Epicenter || info.epicenter || {};
      const lat = parseFloat(epi.EpicenterLatitude || epi.latitude);
      const lon = parseFloat(epi.EpicenterLongitude || epi.longitude);
      
      if (!isFinite(lat) || !isFinite(lon)) return;
      
      const mag = parseFloat(info.EarthquakeMagnitude?.MagnitudeValue || info.earthquakeMagnitude?.magnitudeValue || 4.0);
      const depth = parseFloat(info.FocalDepth || info.focalDepth || 10);
      const eqNo = eq.EarthquakeNo || eq.earthquakeNo;
      
      // Size proportional to magnitude, color based on focal depth (Shallow: Red, Deep: Blue)
      const radius = Math.max(5, (mag - 2.5) * 5) * sc;
      
      let fillColor = "#ff1744"; // Shallow < 30km
      if (depth > 70) fillColor = "#2979ff"; // Deep > 70km
      else if (depth > 30) fillColor = "#ff9100"; // Medium 30-70km
      
      const isSelected = this.selectedEqId === eqNo;
      
      const marker = L.circleMarker([lat, lon], {
        radius: radius,
        fillColor: fillColor,
        color: isSelected ? "#ffd740" : "#fff",
        weight: isSelected ? 3.0 : 1.2,
        fillOpacity: 0.8
      });
      
      marker.on("click", () => {
        this.selectedEqId = eqNo;
        this.renderSidePanel();
        this.renderEpicenters(showMinor); // Redraw to update selection
      });
      
      const timeStr = info.OriginTime || info.originTime;
      marker.bindTooltip(`<strong>${isMinor ? "小區域" : "顯著有感"}地震報告</strong><br>規模: M<sub>L</sub> ${mag.toFixed(1)}<br>深度: ${depth.toFixed(1)} km<br>${timeStr}`);
      marker.addTo(this.layerEpicenters);
      
      // If this is the active selected significant earthquake, and it has an isoseismal map bounds, overlay it
      if (isSelected && !isMinor && eq.ReportImageURI) {
        // CWA provides isoseismal contours as an image. We can overlay it or display in card
        // Here we render it primarily in side panel because ReportImageURI is a full page report
      }
    };
    
    // Draw Significant Earthquakes
    this.significantEqs.forEach(eq => drawEqMarker(eq, false));
    
    // Draw Minor Earthquakes
    if (showMinor) {
      this.minorEqs.forEach(eq => drawEqMarker(eq, true));
    }
  },
  
  renderGNSS(visible = true) {
    this.layerGeophysics.clearLayers();
    if (!visible) return;
    
    // Render vectors pointing plate movement speed/direction
    // Using Leaflet custom DIV markers as arrows
    this.GNSS_STATIONS.forEach(st => {
      const angle = Math.atan2(st.dy, st.dx); // angle in radians
      const angleDeg = (angle * 180 / Math.PI);
      const rot = (450 - angleDeg) % 360; // Map axis offset
      
      const speed = Math.sqrt(st.dx * st.dx + st.dy * st.dy); // mm/year
      
      const arrowHtml = `
        <div style="display:flex; flex-direction:column; align-items:center; cursor:help;">
          <div style="
            transform: rotate(${rot}deg);
            color: var(--accent);
            font-size: 14px;
            line-height: 1;
            font-weight: 900;
          ">↑</div>
          <span style="
            font-size: 9px;
            background: rgba(11, 19, 36, 0.85);
            padding: 1px 3px;
            border-radius: 3px;
            border: 1px solid var(--border);
            margin-top: 1px;
            white-space: nowrap;
          ">${speed.toFixed(0)} mm/yr</span>
        </div>
      `;
      
      L.marker([st.lat, st.lng], {
        icon: L.divIcon({
          className: "gnss-vector-marker",
          html: arrowHtml,
          iconSize: [40, 30],
          iconAnchor: [20, 15]
        })
      }).addTo(this.layerGeophysics)
        .bindTooltip(`<strong>${st.name} GPS位移速度場</strong><br>向東: ${st.dx} mm/yr<br>向北: ${st.dy} mm/yr<br>總速度: ${speed.toFixed(1)} mm/yr`);
    });
  },
  
  renderSidePanel() {
    // Find active earthquake details
    let eq = this.significantEqs.find(e => (e.EarthquakeNo || e.earthquakeNo) === this.selectedEqId);
    let isMinor = false;
    
    if (!eq) {
      eq = this.minorEqs.find(e => (e.EarthquakeNo || e.earthquakeNo) === this.selectedEqId);
      isMinor = true;
    }
    
    let eqDetailHtml = `
      <div style="font-size:12px; color:var(--muted); text-align:center; padding:30px 10px;">
        ⬅ 點選地圖震央，查看詳細地震報告、強震震度分佈與前兆監測圖表
      </div>
    `;
    
    if (eq) {
      const info = eq.EarthquakeInfo || eq.earthquakeInfo || {};
      const epi = info.Epicenter || info.epicenter || {};
      const mag = info.EarthquakeMagnitude?.MagnitudeValue || info.earthquakeMagnitude?.magnitudeValue || "—";
      const depth = info.FocalDepth || info.focalDepth || "—";
      const time = info.OriginTime || info.originTime || "—";
      const loc = epi.EpicenterLocation || epi.locationName || "—";
      
      // Get Report image
      const imgUrl = eq.ReportImageURI || eq.reportImageURI || "";
      
      // Parse Intensities by county
      let intensityRows = "";
      const valids = eq.Intensity?.IntensityForecast?.weatherElement || eq.intensity?.intensityForecast?.weatherElement || [];
      // (容錯氣象署各種嵌套結構)
      let areas = eq.Intensity?.IntensityForecast?.Area || eq.intensity?.intensityForecast?.area
                  || eq.Intensity?.ShakingArea?.Area || eq.intensity?.shakingArea?.area || [];
      if (areas && !Array.isArray(areas)) areas = [areas];
      
      if (areas.length > 0) {
        // Sort by intensity descending
        const sortedAreas = [...areas].map(a => {
          const name = a.AreaName || a.areaName;
          const intVal = a.AreaIntensity?.IntensityValue || a.areaIntensity?.intensityValue || "0";
          return { name, intVal };
        }).sort((a, b) => parseFloat(b.intVal) - parseFloat(a.intVal));
        
        intensityRows = sortedAreas.map(a => {
          let intColor = "var(--success)";
          if (parseFloat(a.intVal) >= 4) intColor = "var(--danger)";
          else if (parseFloat(a.intVal) >= 2) intColor = "var(--warning)";
          
          return `
            <div class="detail-row">
              <span class="lbl">${a.name}</span>
              <span class="val" style="color:${intColor}; font-weight:700;">震度 ${a.intVal} 級</span>
            </div>
          `;
        }).join("");
      } else {
        intensityRows = `<div style="font-size:11px; color:var(--muted);">此報告無提供各行政區明細。</div>`;
      }
      
      eqDetailHtml = `
        <div class="panel-section">
          <h3>🚨 地震報告明細 (${isMinor ? "小區域" : "第 "+(eq.EarthquakeNo || "—")+" 號"})</h3>
          <div style="background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom:14px;">
            <div style="font-size: 16px; font-weight: 700; color: var(--danger); margin-bottom: 8px;">規模 M<sub>L</sub> ${mag} 級</div>
            <div class="detail-row"><span class="lbl">發震時間</span><span class="val">${time}</span></div>
            <div class="detail-row"><span class="lbl">震央位置</span><span class="val">${loc}</span></div>
            <div class="detail-row"><span class="lbl">震源深度</span><span class="val">${depth} km</span></div>
          </div>
        </div>
        
        <div class="panel-section">
          <h3>📊 各地區最大震度</h3>
          <div style="max-height: 150px; overflow-y: auto; background: rgba(0,0,0,0.15); border: 1px solid var(--border); border-radius: 8px; padding: 10px;">
            ${intensityRows}
          </div>
        </div>
        
        ${imgUrl ? `
          <div class="panel-section">
            <h3>🗺️ 等震度圖影像</h3>
            <div style="background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px; text-align: center;">
              <img src="${imgUrl}" style="max-width: 100%; border-radius: 4px; box-shadow: var(--shadow);" alt="等震圖" onclick="window.open('${imgUrl}')" title="點擊放大圖檔">
              <div style="font-size:10px; color:var(--muted); margin-top:6px;">點選上圖可單獨放大查看原始強震分析圖。</div>
            </div>
          </div>
        ` : ""}
      `;
    }
    
    // Seismic Catalog list
    const catalogListHtml = this.significantEqs.slice(0, 5).map(e => {
      const info = e.EarthquakeInfo || e.earthquakeInfo || {};
      const mag = info.EarthquakeMagnitude?.MagnitudeValue || info.earthquakeMagnitude?.magnitudeValue || "—";
      const eqNo = e.EarthquakeNo || e.earthquakeNo || "—";
      const timeStr = info.OriginTime ? info.OriginTime.split(" ")[0].slice(5) : "—"; // Month/Day
      const isSelected = this.selectedEqId === (e.EarthquakeNo || e.earthquakeNo);
      
      return `
        <div class="kpi-card" style="
          text-align: left;
          padding: 8px 12px;
          margin-bottom: 6px;
          border-left: 3px solid ${isSelected ? "var(--accent)" : "rgba(255,255,255,0.15)"};
          background: ${isSelected ? "rgba(var(--accent-rgb), 0.08)" : "var(--card-bg)"};
          cursor: pointer;
        " onclick="window.appTabEarthquakeSelect('${e.EarthquakeNo || e.earthquakeNo}')">
          <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:700;">
            <span>報告 #${eqNo}</span>
            <span style="color:var(--danger)">M<sub>L</sub> ${mag}</span>
          </div>
          <div style="font-size:10px; color:var(--muted); margin-top:2px;">發震日期: ${timeStr} ‧ 深度 ${info.FocalDepth || "—"}km</div>
        </div>
      `;
    }).join("");
    
    this.panel.innerHTML = `
      <div class="panel-section">
        <h3>📅 顯著有感地震報告目錄</h3>
        ${catalogListHtml}
      </div>
      
      <div id="eq-details-content">
        ${eqDetailHtml}
      </div>
    `;
    
    // Bind global select helper for catalog card clicks
    window.appTabEarthquakeSelect = (id) => {
      this.selectedEqId = id;
      this.render();
    };
  }
};
