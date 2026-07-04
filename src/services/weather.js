/* ============================================================
 * weather.js — Dịch vụ thời tiết Open-Meteo
 * ============================================================ */

const API = "https://api.open-meteo.com/v1/forecast";

export const WMO_CODES = {
  0: { icon: "☀️", text: "Trời quang" },
  1: { icon: "🌤️", text: "Gần như quang" },
  2: { icon: "⛅", text: "Có mây" },
  3: { icon: "☁️", text: "U ám" },
  45: { icon: "🌫️", text: "Sương mù" },
  48: { icon: "🌫️", text: "Sương mù đông" },
  51: { icon: "🌦️", text: "Mưa phùn nhẹ" },
  53: { icon: "🌦️", text: "Mưa phùn" },
  55: { icon: "🌧️", text: "Mưa phùn dày" },
  61: { icon: "🌧️", text: "Mưa nhỏ" },
  63: { icon: "🌧️", text: "Mưa vừa" },
  65: { icon: "🌧️", text: "Mưa to" },
  71: { icon: "🌨️", text: "Tuyết nhẹ" },
  73: { icon: "🌨️", text: "Tuyết vừa" },
  75: { icon: "❄️", text: "Tuyết dày" },
  80: { icon: "🌧️", text: "Mưa rào nhẹ" },
  81: { icon: "🌧️", text: "Mưa rào" },
  82: { icon: "⛈️", text: "Mưa rào lớn" },
  95: { icon: "⛈️", text: "Dông" },
  96: { icon: "⛈️", text: "Dông kèm mưa đá nhỏ" },
  99: { icon: "⛈️", text: "Dông kèm mưa đá lớn" },
};

export function weatherDesc(code) {
  return WMO_CODES[code] || { icon: "🌡️", text: `Mã ${code}` };
}

export function windDirection(deg) {
  const dirs = ["B", "ĐB", "Đ", "ĐN", "N", "TN", "T", "TB"];
  return dirs[Math.round(deg / 45) % 8];
}

export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: [
      "temperature_2m", "relative_humidity_2m", "apparent_temperature",
      "weather_code", "wind_speed_10m", "wind_direction_10m",
      "pressure_msl", "precipitation", "cloud_cover", "uv_index",
    ].join(","),
    timezone: "auto",
    forecast_days: 1,
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
