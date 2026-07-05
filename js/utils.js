// ===== CWA Dashboard Common Utilities (js/utils.js) =====

export const NA = v => v === null || v === undefined || v === "" || v === "X" || v === "-" || v === "None" || v === "-99" || v === "-990" || v === "-99.0" || v === "-990.0" || (typeof v === "number" && v <= -90);

export const num = v => NA(v) ? null : (isNaN(parseFloat(v)) ? null : parseFloat(v));

export const txt = v => NA(v) ? null : String(v);

export const wgs84 = s => {
  let cs = s.GeoInfo?.Coordinates || s.coordinates || [];
  if (!Array.isArray(cs)) cs = [cs];
  const c = cs.find(x => x?.CoordinateName === "WGS84") || cs[0];
  if (!c) return null;
  const la = parseFloat(c.StationLatitude || c.latitude || c.StationLat);
  const lo = parseFloat(c.StationLongitude || c.longitude || c.StationLon);
  return (isFinite(la) && isFinite(lo)) ? [la, lo] : null;
};

// ===== Color Palettes & Color Interpolation =====

const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;

export const hex2rgb = h => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
];

// CWA standard 17-color scale for Rainfall
export const RAIN_COLORS = [
  [193,193,193], [155,255,255], [0,207,255], [1,152,255], [1,101,255],
  [48,153,1], [50,255,0], [248,255,0], [255,203,0], [255,154,0], [250,3,0], [204,0,3],
  [160,0,0], [152,0,154], [195,4,204], [248,5,243], [254,203,255]
];
export const RAIN_LEVELS = [1, 2, 6, 10, 15, 20, 30, 40, 50, 70, 90, 110, 130, 150, 200, 300];

// CWA 2℃ interval temperature scale
export const TEMP_COLORS = [
  [0,150,160], [0,188,196], [0,206,168], [86,216,128], [0,176,80],
  [90,205,75], [150,218,95], [200,233,135], [228,243,170], [245,248,195],
  [252,247,180], [254,240,140], [255,225,100], [255,205,65], [255,170,40],
  [255,135,20], [245,70,28], [220,18,18], [165,0,0], [165,0,165]
];
export const TEMP_LEVELS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37];

export const RAMP = {
  humid: [[20, '#fff7bc'], [50, '#7fcdbb'], [75, '#41b6c4'], [90, '#225ea8'], [100, '#081d58']],
  pres: [[980, '#5e4fa2'], [1000, '#3288bd'], [1010, '#abdda4'], [1015, '#fee08b'], [1025, '#f46d43'], [1040, '#9e0142']],
  wind: [[0, '#edf8fb'], [3, '#b2e2e2'], [6, '#66c2a4'], [10, '#2ca25f'], [15, '#006d2c'], [25, '#e31a1c']],
  dir: [[0, '#4575b4'], [90, '#91bfdb'], [180, '#fee090'], [270, '#fc8d59'], [360, '#4575b4']],
  sun: [[0, '#08306b'], [2, '#4292c6'], [5, '#fdae6b'], [8, '#f16913'], [12, '#7f2704']],
  solar: [[0, '#10184a'], [5, '#3288bd'], [10, '#7fcdbb'], [15, '#fee08b'], [20, '#fdae61'], [25, '#f46d43'], [30, '#9e0142']],
  uv: [[0, '#4eb400'], [3, '#f7e400'], [6, '#f85900'], [8, '#d8001d'], [11, '#6b49c8']],
  wave: [[0, '#e0f7fa'], [0.5, '#4fc3f7'], [1, '#1976d2'], [1.5, '#fdd835'], [2.5, '#fb8c00'], [4, '#e53935'], [6, '#8e24aa']],
  tide: [[-2, '#4a148c'], [-1, '#1565c0'], [0, '#4dd0e1'], [1, '#ffd54f'], [2, '#e65100']],
  seaTemp: [[15, '#283593'], [20, '#42a5f5'], [24, '#b2dfdb'], [27, '#ffee58'], [30, '#fb8c00'], [33, '#c62828']]
};

export function colorAt(ramp, v) {
  if (v === null || v === undefined) return "#7a8aa3";
  if (v <= ramp[0][0]) return ramp[0][1];
  if (v >= ramp[ramp.length - 1][0]) return ramp[ramp.length - 1][1];
  for (let i = 0; i < ramp.length - 1; i++) {
    const [a, ca] = ramp[i];
    const [b, cb] = ramp[i + 1];
    if (v >= a && v <= b) {
      const t = (v - a) / (b - a);
      const A = hex2rgb(ca), B = hex2rgb(cb);
      return `rgb(${A.map((x, j) => Math.round(x + (B[j] - x) * t)).join(",")})`;
    }
  }
  return ramp[ramp.length - 1][1];
}

export function colorFor(v, def) {
  if (v === null || v === undefined) return "#7a8aa3";
  if (def.levels) {
    const L = def.levels, C = def.colors;
    if (v < L[0]) return rgb(C[0]);
    for (let i = 0; i < L.length; i++) {
      if (v < L[i]) return rgb(C[i]);
    }
    return rgb(C[L.length]);
  }
  return colorAt(def.ramp, v);
}

export function gradientCSS(ramp) {
  const lo = ramp[0][0], hi = ramp[ramp.length - 1][0];
  return "linear-gradient(90deg," + ramp.map(s => `${s[1]} ${((s[0] - lo) / (hi - lo) * 100).toFixed(1)}%`).join(",") + ")";
}

// ===== Wind & Oceanic Vector Arrow Generators =====

export function getDirName(deg) {
  if (deg == null || isNaN(deg)) return "無風向";
  const dirs = ["北", "北北東", "東北", "東北東", "東", "東南東", "東南", "南南東", "南", "南南西", "西南", "西南西", "西", "西北西", "西北", "北北西"];
  const index = Math.round((deg % 360) / 22.5) % 16;
  return dirs[index];
}

export function getArrowChar(deg) {
  if (deg == null || isNaN(deg)) return "";
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  const index = Math.round((deg % 360) / 45) % 8;
  return arrows[index];
}

export function makeWindSVG(spd, dir, sc = 1.0, colorOverride = null) {
  if (spd === null || spd === undefined) return "";
  const size = Math.max(16, Math.min(48, 16 + spd * 2.4)) * sc;
  const col = colorOverride || colorAt(RAMP.wind, spd);
  const rot = (dir !== null && dir !== undefined) ? (dir + 180) % 360 : 0; // pointing to where it goes
  
  return `<div style="transform:rotate(${rot}deg);width:${size}px;height:${size}px;line-height:0">
    <svg viewBox="0 0 24 24" width="${size}" height="${size}">
      <path d="M12 1 L19 16 L12 12.5 L5 16 Z" fill="${col}" stroke="#0b1220" stroke-width="1"/>
    </svg></div>`;
}

// ===== Astronomy and Lunar Calculations =====

// Simple Moon phase estimation based on date
export function getMoonPhaseDetails(date = new Date()) {
  const baseNewMoon = new Date("2000-01-06T18:14:00").getTime();
  const lunarCycle = 29.530588853 * 24 * 60 * 60 * 1000;
  const elapsed = date.getTime() - baseNewMoon;
  const moonAge = (elapsed % lunarCycle) / (24 * 60 * 60 * 1000);
  const phasePercent = moonAge / 29.530588853;
  
  let phaseName = "";
  let emoji = "🌑";
  let description = "新月";
  
  if (phasePercent < 0.03 || phasePercent > 0.97) {
    phaseName = "new"; emoji = "🌑"; description = "新月 (New Moon)";
  } else if (phasePercent < 0.22) {
    phaseName = "waxing-crescent"; emoji = "🌒"; description = "眉月 (Waxing Crescent)";
  } else if (phasePercent < 0.28) {
    phaseName = "first-quarter"; emoji = "🌓"; description = "上弦月 (First Quarter)";
  } else if (phasePercent < 0.47) {
    phaseName = "waxing-gibbous"; emoji = "🌔"; description = "盈凸月 (Waxing Gibbous)";
  } else if (phasePercent < 0.53) {
    phaseName = "full"; emoji = "🌕"; description = "滿月 (Full Moon)";
  } else if (phasePercent < 0.72) {
    phaseName = "waning-gibbous"; emoji = "🌖"; description = "虧凸月 (Waning Gibbous)";
  } else if (phasePercent < 0.78) {
    phaseName = "last-quarter"; emoji = "🌗"; description = "下弦月 (Last Quarter)";
  } else {
    phaseName = "waning-crescent"; emoji = "🌘"; description = "殘月 (Waning Crescent)";
  }
  
  return {
    age: moonAge,
    percent: phasePercent * 100,
    name: phaseName,
    emoji: emoji,
    description: description
  };
}

// Calculate Sun/Moon arc positions for drawing a beautiful trajectory
export function getSkyOrbitCoordinates(sunriseStr, sunsetStr, currentStr) {
  if (!sunriseStr || !sunsetStr) return null;
  const parse = s => {
    const [h, m] = s.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  
  const rise = parse(sunriseStr);
  let set = parse(sunsetStr);
  if (set < rise) set += 24 * 60 * 60 * 1000;
  
  const current = currentStr ? parse(currentStr) : Date.now();
  
  if (current < rise || current > set) {
    return { isDaylight: false, progress: 0, x: 0, y: 100 };
  }
  
  const progress = (current - rise) / (set - rise);
  const angle = Math.PI * (1 - progress);
  const r = 80;
  const x = 50 + r * Math.cos(angle);
  const y = 90 - r * Math.sin(angle);
  
  return {
    isDaylight: true,
    progress: progress * 100,
    x: x,
    y: y
  };
}
