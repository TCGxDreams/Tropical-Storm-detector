/* ============================================================
 * alerts.js — Dịch vụ tính toán khoảng cách và cảnh báo bão
 *
 * Khoảng cách tới đất liền Việt Nam được tính tới TỪNG ĐOẠN của
 * đường bờ biển liên tục (29 đỉnh từ Móng Cái vòng qua mũi Cà Mau
 * tới Hà Tiên) bằng công thức cross-track trên mặt cầu — chính xác
 * dọc toàn tuyến thay vì chỉ so với vài điểm mốc rời rạc.
 * ============================================================ */

/** Đường bờ biển đất liền VN: [vĩ độ, kinh độ, địa danh ven biển] */
export const VN_COAST = [
  [21.53, 108.05, "Móng Cái"],
  [21.00, 107.35, "Hạ Long"],
  [20.75, 106.80, "Hải Phòng"],
  [20.05, 106.35, "Nam Định"],
  [19.73, 105.90, "Sầm Sơn"],
  [18.80, 105.75, "Cửa Lò"],
  [18.05, 106.40, "Kỳ Anh"],
  [17.47, 106.63, "Đồng Hới"],
  [16.90, 107.18, "Cửa Việt"],
  [16.55, 107.65, "Huế"],
  [16.10, 108.25, "Đà Nẵng"],
  [15.87, 108.38, "Hội An"],
  [15.40, 108.80, "Quảng Ngãi"],
  [14.60, 109.08, "Đức Phổ"],
  [13.77, 109.25, "Quy Nhơn"],
  [13.08, 109.32, "Tuy Hòa"],
  [12.25, 109.20, "Nha Trang"],
  [11.90, 109.15, "Cam Ranh"],
  [11.55, 109.03, "Phan Rang"],
  [10.92, 108.10, "Phan Thiết"],
  [10.33, 107.08, "Vũng Tàu"],
  [10.03, 106.60, "Bến Tre"],
  [9.65, 106.55, "Trà Vinh"],
  [9.45, 106.20, "Sóc Trăng"],
  [9.20, 105.70, "Bạc Liêu"],
  [8.60, 104.72, "Mũi Cà Mau"],
  [9.05, 104.80, "Sông Đốc"],
  [10.00, 105.08, "Rạch Giá"],
  [10.38, 104.48, "Hà Tiên"],
];

const RAD = Math.PI / 180;
const R_EARTH = 6371;

/** Khoảng cách Haversine (km) */
export function distKm(lat1, lon1, lat2, lon2) {
  const a = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}

/** Góc ở tâm (radian) giữa 2 điểm (đầu vào radian) */
function angDist(f1, l1, f2, l2) {
  const a = Math.sin((f2 - f1) / 2) ** 2 +
    Math.cos(f1) * Math.cos(f2) * Math.sin((l2 - l1) / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a));
}

/** Phương vị từ điểm 1 tới điểm 2 (đầu vào radian) */
function bearing(f1, l1, f2, l2) {
  return Math.atan2(
    Math.sin(l2 - l1) * Math.cos(f2),
    Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(l2 - l1));
}

/**
 * Khoảng cách (km) từ điểm P tới đoạn bờ biển A-B trên mặt cầu
 * (cross-track distance, có chặn hai đầu đoạn)
 */
export function segDistKm(lat, lon, A, B) {
  const f1 = A[0] * RAD, l1 = A[1] * RAD;
  const f2 = B[0] * RAD, l2 = B[1] * RAD;
  const f3 = lat * RAD, l3 = lon * RAD;
  const d13 = angDist(f1, l1, f3, l3);
  const d12 = angDist(f1, l1, f2, l2);
  if (d12 < 1e-9) return d13 * R_EARTH;
  const t13 = bearing(f1, l1, f3, l3);
  const t12 = bearing(f1, l1, f2, l2);
  if (Math.cos(t13 - t12) < 0) return d13 * R_EARTH;            // trước điểm A
  const dxt = Math.asin(Math.sin(d13) * Math.sin(t13 - t12));    // cross-track
  const dat = Math.acos(Math.max(-1, Math.min(1,
    Math.cos(d13) / Math.max(1e-12, Math.cos(dxt)))));           // along-track
  if (dat > d12) return angDist(f2, l2, f3, l3) * R_EARTH;       // sau điểm B
  return Math.abs(dxt) * R_EARTH;
}

/**
 * Khoảng cách ngắn nhất tới đất liền VN + địa danh ven biển gần nhất.
 * @returns {{km: number, place: string}}
 */
export function distToVN(lat, lon) {
  let km = Infinity;
  for (let i = 0; i < VN_COAST.length - 1; i++) {
    km = Math.min(km, segDistKm(lat, lon, VN_COAST[i], VN_COAST[i + 1]));
  }
  let place = VN_COAST[0][2];
  let best = Infinity;
  for (const [la, lo, name] of VN_COAST) {
    const d = distKm(lat, lon, la, lo);
    if (d < best) { best = d; place = name; }
  }
  return { km: Math.round(km), place };
}

/** Lấy bão gần Việt Nam nhất dưới 1200km (kèm địa danh bờ biển gần nhất) */
export function getNearVnStorm(storms) {
  const near = storms
    .map((s) => {
      const { km, place } = distToVN(s.lat, s.lon);
      return { s, d: km, place };
    })
    .filter((x) => x.d < 1200 || /viet\s*nam/i.test(x.s.countries))
    .sort((a, b) => a.d - b.d);
  return near[0] || null;
}

/**
 * Tính tọa độ mới (vĩ độ, kinh độ) dựa vào điểm xuất phát, hướng di chuyển (độ) và khoảng cách (km).
 */
export function destinationPoint(lat, lon, bearingDeg, distanceKm) {
  const ad = distanceKm / R_EARTH;
  const la1 = lat * RAD;
  const lo1 = lon * RAD;
  const tc = bearingDeg * RAD;

  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(ad) +
    Math.cos(la1) * Math.sin(ad) * Math.cos(tc)
  );
  const lo2 = lo1 + Math.atan2(
    Math.sin(tc) * Math.sin(ad) * Math.cos(la1),
    Math.cos(ad) - Math.sin(la1) * Math.sin(la2)
  );

  let lon2 = lo2 / RAD;
  // Chuẩn hóa kinh độ trong khoảng [-180, 180]
  lon2 = ((lon2 + 540) % 360) - 180;

  return { lat: la2 / RAD, lon: lon2 };
}

/**
 * Kiểm tra xem tọa độ có nằm trong đất liền của các quốc gia/khu vực bão hay không.
 */
export function isCoordinateOverLand(lat, lon) {
  // Việt Nam: Vùng giới hạn gần bờ biển và kinh độ nhỏ hơn bờ biển
  if (lon > 102.0 && lon < 110.0 && lat > 8.4 && lat < 22.0) {
    // Tìm điểm vĩ độ ven biển gần nhất
    let nearestPt = VN_COAST[0];
    let minDiff = Infinity;
    for (const pt of VN_COAST) {
      const diff = Math.abs(pt[0] - lat);
      if (diff < minDiff) {
        minDiff = diff;
        nearestPt = pt;
      }
    }
    // Nếu nằm về phía Tây của bờ biển tại vĩ độ đó thì coi như ở trên đất liền
    if (lon < nearestPt[1]) {
      return { over: true, name: "Việt Nam" };
    }
  }

  // Philippines
  if (lat >= 5.0 && lat <= 19.5 && lon >= 120.0 && lon <= 126.5) {
    return { over: true, name: "Philippines" };
  }

  // Đảo Hải Nam (TQ)
  if (lat >= 18.0 && lat <= 20.2 && lon >= 108.4 && lon <= 111.2) {
    return { over: true, name: "Đảo Hải Nam (TQ)" };
  }

  // Đài Loan
  if (lat >= 21.8 && lat <= 25.5 && lon >= 120.0 && lon <= 122.3) {
    return { over: true, name: "Đài Loan" };
  }

  // Trung Quốc lục địa
  if (lat >= 20.0 && lat <= 25.8 && lon >= 108.0 && lon <= 118.5) {
    return { over: true, name: "Trung Quốc" };
  }

  // Hoa Kỳ (Mỹ) - cho bão vùng Đại Tây Dương
  if (lat >= 24.5 && lat <= 40.0 && lon >= -100.0 && lon <= -75.0) {
    return { over: true, name: "Hoa Kỳ" };
  }

  return { over: false, name: "" };
}

/**
 * Thuật toán mô phỏng dự báo bão AI (Extrapolated Forecast) trong 72 giờ tới.
 * Trích xuất vận tốc góc di chuyển của bão, mô phỏng lực Coriolis và tương tác nhiệt độ nước biển.
 */
export function predictStormForecast(storm) {
  if (!storm) return null;

  // 1. Xác định hướng (bearing) và tốc độ (km/h) hiện tại của bão
  let currentBearing = 280; // Tây Tây Bắc là hướng mặc định phổ biến của bão
  let currentSpeed = 16;    // 16 km/h
  let hasHistory = false;

  const pts = storm.track?.points || [];
  if (pts.length >= 2) {
    const pt1 = pts[pts.length - 2];
    const pt2 = pts[pts.length - 1]; // vị trí hiện tại
    const d = distKm(pt1.lat, pt1.lon, pt2.lat, pt2.lon);
    
    let dt = 6; // mặc định 6 tiếng
    if (pt1.date && pt2.date) {
      const ms = new Date(pt2.date) - new Date(pt1.date);
      if (ms > 1000 * 3600 * 0.5) dt = ms / 3600000;
    }
    
    if (d > 2.0) {
      currentSpeed = Math.min(60, Math.max(5, d / dt)); // giới hạn tốc độ di chuyển 5-60 km/h
      currentBearing = bearing(pt1.lat * RAD, pt1.lon * RAD, pt2.lat * RAD, pt2.lon * RAD) / RAD;
      currentBearing = (currentBearing + 360) % 360;
      hasHistory = true;
    }
  } else if (storm.movement) {
    // Phân tích chuỗi movement ví dụ: "285° / 12 kt" hoặc "WNW 15 km/h"
    const mDir = storm.movement.match(/(\d+)°/);
    const mSpd = storm.movement.match(/(\d+)\s*(kt|km\/h)/i);
    if (mDir) currentBearing = parseFloat(mDir[1]);
    if (mSpd) {
      const val = parseFloat(mSpd[1]);
      currentSpeed = mSpd[2].toLowerCase() === "kt" ? val * 1.852 : val;
    }
  }

  // 2. Chạy mô phỏng từng mốc thời gian 24h, 48h, 72h
  const forecastPoints = [];
  let currentLat = storm.lat;
  let currentLon = storm.lon;
  let currentWind = storm.windKmh || 65;
  let isOverLandNow = false;
  let landfallWarning = null;

  // Tính nhiệt độ biển ước tính dựa trên vĩ độ hiện tại
  // Gần xích đạo biển ấm ~29.8°C, vĩ độ cao thì lạnh dần
  const getEstimatedSST = (lt, ln) => {
    // Biển Đông (Biển Đông Việt Nam) ấm áp hơn
    const isSouthChinaSea = lt > 5 && lt < 22 && ln > 108 && ln < 120;
    const base = isSouthChinaSea ? 30.2 : 29.5;
    const sst = base - Math.abs(lt - 10) * 0.22;
    return Math.min(31.5, Math.max(18.0, sst));
  };

  const currentSST = getEstimatedSST(storm.lat, storm.lon);

  // Giả lập từng giờ một để tăng độ chính xác của đường cong quỹ đạo
  for (let hour = 1; hour <= 72; hour++) {
    // Áp dụng lực lệch Coriolis (Beta drift)
    // Ở bán cầu Bắc bão lệch phải (tăng bearing), bán cầu Nam bão lệch trái (giảm bearing)
    const deviation = (currentLat > 0 ? 0.08 : -0.08) * (1 + Math.abs(currentLat) / 25);
    currentBearing = (currentBearing + deviation + 360) % 360;

    // Tính vị trí tiếp theo sau 1 giờ di chuyển
    const nextLoc = destinationPoint(currentLat, currentLon, currentBearing, currentSpeed);
    currentLat = nextLoc.lat;
    currentLon = nextLoc.lon;

    // Kiểm tra ma sát đất liền
    const landStatus = isCoordinateOverLand(currentLat, currentLon);
    if (landStatus.over) {
      isOverLandNow = true;
      currentWind = currentWind * 0.982; // ma sát đất liền làm giảm gió 1.8% mỗi giờ
      currentSpeed = Math.max(5, currentSpeed * 0.99); // bão đi chậm lại trên đất liền
    } else {
      isOverLandNow = false;
      const sst = getEstimatedSST(currentLat, currentLon);
      if (sst > 28.2) {
        // Biển ấm tiếp thêm năng lượng
        const factor = (sst - 28.2) * 0.0012;
        currentWind = Math.min(300, currentWind * (1 + factor)); // Tăng cường độ
      } else {
        // Biển lạnh làm suy yếu bão
        const factor = (28.2 - sst) * 0.0035;
        currentWind = Math.max(30, currentWind * (1 - factor));
      }
    }

    // Kiểm tra va chạm đất liền Việt Nam
    if (!landfallWarning) {
      const vnCheck = distToVN(currentLat, currentLon);
      if (vnCheck.km < 40) {
        // Bão đổ bộ sát đất liền VN
        landfallWarning = {
          etaHours: hour,
          region: vnCheck.place,
          distanceKm: vnCheck.km,
          estimatedWindKmh: Math.round(currentWind),
        };
      }
    }

    // Ghi nhận mốc 24h, 48h, 72h
    if (hour === 24 || hour === 48 || hour === 72) {
      forecastPoints.push({
        hour,
        lat: currentLat,
        lon: currentLon,
        windKmh: Math.round(currentWind),
        isOverLand: isOverLandNow,
        landRegion: landStatus.name,
        estimatedSST: getEstimatedSST(currentLat, currentLon),
      });
    }
  }

  // Tính hướng chính
  const getCompassDir = (deg) => {
    const dirs = ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"];
    const idx = Math.round(deg / 45) % 8;
    return dirs[idx];
  };

  return {
    bearing: Math.round(currentBearing),
    bearingText: getCompassDir(currentBearing),
    speedKmh: Math.round(currentSpeed),
    currentSST: Number(currentSST.toFixed(1)),
    forecasts: forecastPoints,
    landfall: landfallWarning,
    hasHistory,
  };
}
