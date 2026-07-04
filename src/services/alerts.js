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
