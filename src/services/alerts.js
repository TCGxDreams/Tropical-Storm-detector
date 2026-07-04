/* ============================================================
 * alerts.js — Dịch vụ tính toán khoảng cách và cảnh báo bão
 * ============================================================ */

export const VN_COAST = [
  [21.5, 108.0], [20.0, 106.5], [18.7, 105.8], [17.5, 106.6],
  [16.05, 108.2], [13.8, 109.3], [12.2, 109.2], [10.3, 107.1], [8.6, 104.7],
];

/** Khoảng cách Haversine (km) */
export function distKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, R = 6371;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Khoảng cách tới bờ biển Việt Nam gần nhất (km) */
export function distToVN(lat, lon) {
  return Math.round(Math.min(...VN_COAST.map(([la, lo]) => distKm(lat, lon, la, lo))));
}

/** Lấy bão gần Việt Nam nhất dưới 1200km */
export function getNearVnStorm(storms) {
  const near = storms
    .map((s) => ({ s, d: distToVN(s.lat, s.lon) }))
    .filter((x) => x.d < 1200 || /viet\s*nam/i.test(x.s.countries))
    .sort((a, b) => a.d - b.d);
  return near[0] || null;
}
