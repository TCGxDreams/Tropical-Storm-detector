/* ============================================================
 * storms.js — Lớp dữ liệu bão thời gian thực
 * Nguồn chính : GDACS (toàn cầu)  https://www.gdacs.org
 * Nguồn phụ   : NOAA NHC (Đại Tây Dương / Đông TBD)
 * ============================================================ */

const StormData = (() => {

  const GDACS_LIST_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtypes=TC";
  const NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";

  // Proxy CORS dự phòng khi nguồn gốc không cho phép cross-origin
  const CORS_PROXIES = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  ];

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

  /* ---------- Phân loại theo thang Saffir–Simpson ---------- */
  // windKmh -> {id, label, color}
  const CATEGORIES = [
    { id: "TD",   min: 0,   label: "Áp thấp NĐ",     short: "ATNĐ", color: "#5ebaff" },
    { id: "TS",   min: 63,  label: "Bão nhiệt đới",  short: "BNĐ",  color: "#00faf4" },
    { id: "CAT1", min: 119, label: "Bão cấp 1",      short: "C1",   color: "#ffffb2" },
    { id: "CAT2", min: 154, label: "Bão cấp 2",      short: "C2",   color: "#ffd37f" },
    { id: "CAT3", min: 178, label: "Bão cấp 3",      short: "C3",   color: "#ffa64d" },
    { id: "CAT4", min: 209, label: "Bão cấp 4",      short: "C4",   color: "#ff7326" },
    { id: "CAT5", min: 252, label: "Bão cấp 5",      short: "C5",   color: "#ff3d3d" },
  ];

  function categorize(windKmh) {
    let cat = CATEGORIES[0];
    for (const c of CATEGORIES) if (windKmh >= c.min) cat = c;
    return cat;
  }

  const ALERT_COLORS = { Red: "#ff3d3d", Orange: "#ff9a3d", Green: "#3dd68c" };

  /* ---------- Chuẩn hoá 1 cơn bão ---------- */
  function normalizeGdacs(feature) {
    const p = feature.properties || {};
    const [lon, lat] = feature.geometry?.coordinates || [0, 0];
    const windKmh = Number(p.severitydata?.severity) || 0;
    const cat = categorize(windKmh);
    return {
      id: `gdacs-${p.eventid}`,
      source: "GDACS",
      eventid: p.eventid,
      episodeid: p.episodeid,
      name: (p.eventname || p.name || "KHÔNG TÊN").toString().toUpperCase(),
      lat, lon,
      windKmh,
      windKt: windKmh ? Math.round(windKmh / 1.852) : null,
      pressure: null,
      movement: null,
      alertLevel: p.alertlevel || "Green",
      countries: p.country || "",
      fromDate: p.fromdate,
      toDate: p.todate,
      updated: p.todate || p.datemodified,
      population: p.severitydata?.severitytext || "",
      reportUrl: p.url?.report || `https://www.gdacs.org/report.aspx?eventid=${p.eventid}&eventtype=TC`,
      geometryUrl: p.url?.geometry ||
        `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=${p.eventid}&episodeid=${p.episodeid}`,
      category: cat,
      track: null, // nạp sau (lazy)
    };
  }

  function normalizeNhc(s) {
    const windKt = Number(s.intensity) || 0;
    const windKmh = Math.round(windKt * 1.852);
    return {
      id: `nhc-${s.id}`,
      source: "NOAA/NHC",
      name: (s.name || "").toUpperCase(),
      lat: Number(s.latitudeNumeric),
      lon: Number(s.longitudeNumeric),
      windKmh,
      windKt,
      pressure: Number(s.pressure) || null,
      movement: s.movementDir != null ? `${s.movementDir}° / ${s.movementSpeed} kt` : null,
      alertLevel: windKmh >= 178 ? "Red" : windKmh >= 119 ? "Orange" : "Green",
      countries: s.binNumber || "",
      updated: s.lastUpdate,
      reportUrl: `https://www.nhc.noaa.gov/graphics_${(s.binNumber || "").toLowerCase()}.shtml`,
      geometryUrl: null,
      category: categorize(windKmh),
      track: null,
    };
  }

  /* ---------- Tải danh sách bão đang hoạt động ---------- */
  async function fetchActiveStorms() {
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

    // Gộp: lấy GDACS làm gốc, bổ sung áp suất/hướng di chuyển từ NHC (khớp theo tên)
    const byName = new Map(gdacsStorms.map((s) => [s.name, s]));
    for (const n of nhcStorms) {
      const g = byName.get(n.name);
      if (g) {
        g.pressure = g.pressure ?? n.pressure;
        g.movement = g.movement ?? n.movement;
        if (n.windKmh > g.windKmh) {
          g.windKmh = n.windKmh;
          g.windKt = n.windKt;
          g.category = n.category;
        }
      } else if (Number.isFinite(n.lat) && Number.isFinite(n.lon)) {
        gdacsStorms.push(n); // bão NHC chưa có trong GDACS
      }
    }

    // Mạnh nhất xếp trước
    result.storms = gdacsStorms.sort((a, b) => b.windKmh - a.windKmh);
    return result;
  }

  /* ---------- Tải đường đi + vùng ảnh hưởng của 1 cơn bão (GDACS) ---------- */
  async function fetchTrack(storm) {
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

    // Sắp xếp điểm theo thời gian
    track.points.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    return track;
  }

  /* ---------- Dữ liệu mẫu (khi mất mạng / nguồn lỗi) ---------- */
  function demoStorms() {
    const mk = (name, lat, lon, windKmh, countries) => ({
      id: `demo-${name}`,
      source: "DEMO",
      name,
      lat, lon,
      windKmh,
      windKt: Math.round(windKmh / 1.852),
      pressure: 950,
      movement: "TB 15 km/h",
      alertLevel: windKmh >= 178 ? "Red" : "Orange",
      countries,
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

  return { fetchActiveStorms, fetchTrack, categorize, demoStorms, CATEGORIES, ALERT_COLORS };
})();
