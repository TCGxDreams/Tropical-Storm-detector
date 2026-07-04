/* ============================================================
 * storms.js — Dịch vụ tải và xử lý dữ liệu bão
 * ============================================================ */

const GDACS_LIST_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtypes=TC";
const NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";
const IBTRACS_ACTIVE_CSV_URL =
  "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.ACTIVE.list.v04r01.csv";

// Proxy CORS dự phòng khi nguồn gốc không cho phép cross-origin
const CORS_PROXIES = [
  (u) => `/api/proxy?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];

/* ---------- Phòng chống XSS ---------- */
export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchJSON(url, timeoutMs = 15000) {
  const attempts = [url, ...CORS_PROXIES.map((p) => p(url))];
  let lastErr;
  for (const target of attempts) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(target, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("fetch failed");
}

async function fetchText(url, timeoutMs = 15000) {
  const attempts = [url, ...CORS_PROXIES.map((p) => p(url))];
  let lastErr;
  for (const target of attempts) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(target, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("fetch failed");
}

/* ---------- Phân loại theo thang Saffir–Simpson ---------- */
export const CATEGORIES = [
  { id: "TD",   min: 0,   label: "Áp thấp NĐ",     short: "ATNĐ", color: "#5ebaff" },
  { id: "TS",   min: 63,  label: "Bão nhiệt đới",  short: "BNĐ",  color: "#00faf4" },
  { id: "CAT1", min: 119, label: "Bão cấp 1",      short: "C1",   color: "#ffffb2" },
  { id: "CAT2", min: 154, label: "Bão cấp 2",      short: "C2",   color: "#ffd37f" },
  { id: "CAT3", min: 178, label: "Bão cấp 3",      short: "C3",   color: "#ffa64d" },
  { id: "CAT4", min: 209, label: "Bão cấp 4",      short: "C4",   color: "#ff7326" },
  { id: "CAT5", min: 252, label: "Bão cấp 5",      short: "C5",   color: "#ff3d3d" },
];

export function categorize(windKmh) {
  let cat = CATEGORIES[0];
  for (const c of CATEGORIES) if (windKmh >= c.min) cat = c;
  return cat;
}

export const ALERT_COLORS = { Red: "#ff3d3d", Orange: "#ff9a3d", Green: "#3dd68c" };

/* ---------- Chuẩn hoá 1 cơn bão (GDACS) ---------- */
function normalizeGdacs(feature) {
  const p = feature.properties || {};
  const [lon, lat] = feature.geometry?.coordinates || [0, 0];
  const windKmh = Math.round(Number(p.severitydata?.severity)) || 0;
  const cat = categorize(windKmh);
  return {
    id: `gdacs-${p.eventid}`,
    source: "GDACS",
    eventid: p.eventid,
    episodeid: p.episodeid,
    name: escapeHtml((p.eventname || p.name || "KHÔNG TÊN").toString().toUpperCase()),
    lat, lon,
    windKmh,
    windKt: windKmh ? Math.round(windKmh / 1.852) : null,
    pressure: null,
    movement: null,
    alertLevel: p.alertlevel || "Green",
    countries: escapeHtml(p.country || ""),
    fromDate: p.fromdate,
    toDate: p.todate,
    updated: p.todate || p.datemodified,
    population: escapeHtml(p.severitydata?.severitytext || ""),
    reportUrl: p.url?.report || `https://www.gdacs.org/report.aspx?eventid=${p.eventid}&eventtype=TC`,
    geometryUrl: p.url?.geometry ||
      `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=${p.eventid}&episodeid=${p.episodeid}`,
    category: cat,
    track: null,
  };
}

/* ---------- Chuẩn hoá 1 cơn bão (NOAA NHC) ---------- */
function normalizeNhc(s) {
  const windKt = Number(s.intensity) || 0;
  const windKmh = Math.round(windKt * 1.852);
  return {
    id: `nhc-${s.id}`,
    source: "NOAA/NHC",
    name: escapeHtml((s.name || "").toUpperCase()),
    lat: Number(s.latitudeNumeric),
    lon: Number(s.longitudeNumeric),
    windKmh,
    windKt,
    pressure: Number(s.pressure) || null,
    movement: s.movementDir != null
      ? escapeHtml(`${s.movementDir}° / ${s.movementSpeed} kt`)
      : null,
    alertLevel: windKmh >= 178 ? "Red" : windKmh >= 119 ? "Orange" : "Green",
    countries: escapeHtml(s.binNumber || ""),
    updated: s.lastUpdate,
    reportUrl: `https://www.nhc.noaa.gov/graphics_${(s.binNumber || "").toLowerCase()}.shtml`,
    geometryUrl: null,
    category: categorize(windKmh),
    track: null,
  };
}

/* ---------- Chuẩn hoá 1 cơn bão (IBTrACS / JTWC) ---------- */
function normalizeIbtracs(entry) {
  const lastIdx = (entry.usa_wind?.length || 1) - 1;
  const windKt = Number(entry.usa_wind?.[lastIdx]) || Number(entry.wmo_wind?.[lastIdx]) || 0;
  const windKmh = Math.round(windKt * 1.852);
  const lat = Number(entry.lat?.[lastIdx]) || 0;
  const lon = Number(entry.lon?.[lastIdx]) || 0;
  const name = (entry.name || "UNNAMED").toUpperCase();
  const sid = entry.sid || `ibtracs-${name}`;
  const basin = entry.basin?.[lastIdx] || "";

  return {
    id: `ibtracs-${sid}`,
    source: "IBTrACS/JTWC",
    name: escapeHtml(name),
    lat, lon,
    windKmh,
    windKt: windKt || null,
    pressure: Number(entry.usa_pres?.[lastIdx]) || Number(entry.wmo_pres?.[lastIdx]) || null,
    movement: null,
    alertLevel: windKmh >= 178 ? "Red" : windKmh >= 119 ? "Orange" : "Green",
    countries: escapeHtml(basin),
    updated: entry.iso_time?.[lastIdx] || null,
    reportUrl: `https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/provisional/`,
    geometryUrl: null,
    category: categorize(windKmh),
    track: parseIbtracksTrack(entry),
  };
}

function parseIbtracksTrack(entry) {
  const n = entry.lat?.length || 0;
  if (n < 2) return null;
  const points = [];
  for (let i = 0; i < n; i++) {
    const la = Number(entry.lat[i]);
    const lo = Number(entry.lon[i]);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
    const w = Number(entry.usa_wind?.[i]) || Number(entry.wmo_wind?.[i]) || 0;
    points.push({
      lat: la, lon: lo,
      date: entry.iso_time?.[i] || null,
      windKmh: Math.round(w * 1.852),
      isForecast: false,
    });
  }
  return { points, lines: [coords], cones: [], impacts: [] };
}

/* ---------- Parse NOAA IBTrACS ACTIVE CSV ---------- */
function parseActiveCsv(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 3) return [];

  const headers = lines[0].split(",");
  const getIdx = (col) => headers.indexOf(col);

  const sidIdx = getIdx("SID");
  const nameIdx = getIdx("NAME");
  const timeIdx = getIdx("ISO_TIME");
  const latIdx = getIdx("LAT");
  const lonIdx = getIdx("LON");
  const windIdx = getIdx("USA_WIND");
  const presIdx = getIdx("USA_PRES");
  const basinIdx = getIdx("BASIN");

  if (sidIdx === -1 || nameIdx === -1 || timeIdx === -1 || latIdx === -1 || lonIdx === -1) {
    throw new Error("Missing required columns in IBTrACS CSV");
  }

  const stormsMap = new Map();

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(",");
    const maxIdx = Math.max(sidIdx, nameIdx, timeIdx, latIdx, lonIdx, windIdx, presIdx, basinIdx);
    if (parts.length <= maxIdx) continue;

    const sid = parts[sidIdx].trim();
    let name = parts[nameIdx].trim().toUpperCase();
    const timeStr = parts[timeIdx].trim();
    const latStr = parts[latIdx].trim();
    const lonStr = parts[lonIdx].trim();
    const windStr = parts[windIdx].trim();
    const presStr = parts[presIdx].trim();
    const basin = parts[basinIdx].trim();

    if (!sid) continue;
    if (name === "NOTNAMED" || name === "UNNAMED" || !name) {
      name = `TC-${sid}`;
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const windKt = parseFloat(windStr) || 0;
    const pressure = parseFloat(presStr) || null;
    const windKmh = Math.round(windKt * 1.852);

    const point = {
      lat,
      lon,
      date: timeStr,
      windKmh,
      isForecast: false,
    };

    if (!stormsMap.has(sid)) {
      stormsMap.set(sid, {
        id: `ibtracs-${sid}`,
        source: "IBTrACS/JTWC",
        name,
        basin,
        points: [],
      });
    }
    stormsMap.get(sid).points.push(point);
  }

  const results = [];
  for (const [sid, info] of stormsMap.entries()) {
    info.points.sort((a, b) => new Date(a.date) - new Date(b.date));
    const latest = info.points[info.points.length - 1];

    const coords = info.points.map((p) => [p.lon, p.lat]);
    const track = {
      points: info.points,
      lines: [coords],
      cones: [],
      impacts: [],
    };

    results.push({
      id: info.id,
      source: info.source,
      name: info.name,
      lat: latest.lat,
      lon: latest.lon,
      windKmh: latest.windKmh,
      windKt: latest.windKmh ? Math.round(latest.windKmh / 1.852) : null,
      pressure: latest.pressure || null,
      movement: null,
      alertLevel: latest.windKmh >= 178 ? "Red" : latest.windKmh >= 119 ? "Orange" : "Green",
      countries: escapeHtml(info.basin),
      updated: latest.date,
      reportUrl: "https://www.ncei.noaa.gov/products/international-best-track-archive",
      geometryUrl: null,
      category: categorize(latest.windKmh),
      track,
    });
  }

  return results;
}

/* ---------- Tải danh sách bão đang hoạt động ---------- */
export async function fetchActiveStorms() {
  const result = { storms: [], errors: [] };

  let gdacsStorms = [];
  try {
    const gj = await fetchJSON(GDACS_LIST_URL);
    gdacsStorms = (gj.features || [])
      .filter((f) => f.geometry && f.geometry.type === "Point")
      .map(normalizeGdacs);
  } catch (e) {
    result.errors.push("GDACS: " + e.message);
  }

  let nhcStorms = [];
  try {
    const nhc = await fetchJSON(NHC_URL);
    nhcStorms = (nhc.activeStorms || []).map(normalizeNhc);
  } catch (e) {
    result.errors.push("NHC: " + e.message);
  }

  let ibtStorms = [];
  try {
    const csvText = await fetchText(IBTRACS_ACTIVE_CSV_URL, 15000);
    ibtStorms = parseActiveCsv(csvText);
  } catch (e) {
    console.warn("IBTrACS ACTIVE CSV:", e.message);
  }

  const byEvent = new Map();
  for (const s of gdacsStorms) {
    const key = s.eventid ?? s.name;
    const prev = byEvent.get(key);
    if (!prev || (s.episodeid || 0) > (prev.episodeid || 0)) byEvent.set(key, s);
  }
  gdacsStorms = [...byEvent.values()];

  const baseName = (n) => {
    const str = String(n).toUpperCase();
    if (str.startsWith("TC-")) return str;
    return str.replace(/&[^;]+;/g, "").replace(/[^A-Z]/gi, "");
  };
  const byName = new Map(gdacsStorms.map((s) => [baseName(s.name), s]));
  for (const n of nhcStorms) {
    const g = byName.get(baseName(n.name));
    if (g) {
      g.pressure = g.pressure ?? n.pressure;
      g.movement = g.movement ?? n.movement;
      if (n.windKmh > g.windKmh) {
        g.windKmh = n.windKmh;
        g.windKt = n.windKt;
        g.category = n.category;
      }
    } else if (Number.isFinite(n.lat) && Number.isFinite(n.lon)) {
      gdacsStorms.push(n);
      byName.set(baseName(n.name), n);
    }
  }

  for (const s of ibtStorms) {
    const bn = baseName(s.name);
    if (bn === "UNNAMED" || bn === "NOTNAMED") continue;
    const existing = byName.get(bn);
    if (existing) {
      existing.pressure = existing.pressure ?? s.pressure;
      if (!existing.track && s.track) existing.track = s.track;
    } else if (Number.isFinite(s.lat) && Number.isFinite(s.lon) && s.windKmh > 0) {
      gdacsStorms.push(s);
      byName.set(bn, s);
    }
  }

  result.storms = gdacsStorms.sort((a, b) => b.windKmh - a.windKmh);
  return result;
}

/* ---------- Tải đường đi + vùng ảnh hưởng của 1 cơn bão (GDACS) ---------- */
export async function fetchTrack(storm) {
  if (!storm.geometryUrl) return null;
  const gj = await fetchJSON(storm.geometryUrl);
  const track = { points: [], lines: [], cones: [], impacts: [] };

  for (const f of gj.features || []) {
    const cls = (f.properties?.Class || f.properties?.class || "").toString();
    const geom = f.geometry;
    if (!geom) continue;

    if (geom.type === "Point" && /point/i.test(cls)) {
      const [lon, lat] = geom.coordinates;
      track.points.push({
        lat, lon,
        date: f.properties?.trackdate || f.properties?.eventdate || null,
        windKmh: Number(f.properties?.windspeed) || 0,
        isForecast: /_f|forecast/i.test(cls) || !!f.properties?.forecast,
      });
    } else if (geom.type === "LineString") {
      track.lines.push(geom.coordinates);
    } else if (geom.type === "MultiLineString") {
      track.lines.push(...geom.coordinates);
    } else if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
      const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
      if (/cone/i.test(cls)) {
        track.cones.push(...polys);
      } else {
        const m = cls.match(/green|orange|red/i);
        track.impacts.push({
          color: m ? ALERT_COLORS[m[0][0].toUpperCase() + m[0].slice(1).toLowerCase()] : "#3dd68c",
          polys,
        });
      }
    }
  }

  track.points.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  return track;
}

/* ---------- Dữ liệu mẫu (khi mất mạng / nguồn lỗi) ---------- */
export function demoStorms() {
  const mk = (name, lat, lon, windKmh, countries) => ({
    id: `demo-${name}`,
    source: "DEMO",
    name: escapeHtml(name),
    lat, lon,
    windKmh,
    windKt: Math.round(windKmh / 1.852),
    pressure: 950,
    movement: "TB 15 km/h",
    alertLevel: windKmh >= 178 ? "Red" : "Orange",
    countries: escapeHtml(countries),
    updated: new Date().toISOString(),
    reportUrl: "#",
    geometryUrl: null,
    category: categorize(windKmh),
    track: null,
  });
  return [
    mk("HAIYAN (MẪU)", 11.2, 128.5, 230, "Philippines, Việt Nam"),
    mk("KATRINA (MẪU)", 26.1, -88.6, 205, "Hoa Kỳ"),
    mk("BAVI (MẪU)", 18.9, 115.2, 140, "Trung Quốc, Việt Nam"),
  ];
}
