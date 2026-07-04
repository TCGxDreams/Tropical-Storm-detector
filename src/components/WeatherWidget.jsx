import { weatherDesc, windDirection } from "../services/weather";

export default function WeatherWidget({ data, isOpen, onClose }) {
  if (!isOpen || !data?.current) return null;

  const c = data.current;
  const w = weatherDesc(c.weather_code);
  const windDir = windDirection(c.wind_direction_10m);

  return (
    <div id="weather-widget" className="weather-widget">
      <div className="wx-header">
        <span className="wx-icon">{w.icon}</span>
        <div className="wx-temp">{Math.round(c.temperature_2m)}°C</div>
        <button id="wx-close" className="wx-close" onClick={onClose} title="Ẩn thời tiết">✕</button>
      </div>
      <div className="wx-desc">{w.text}</div>
      <div className="wx-grid">
        <div className="wx-item">
          <span className="wx-label">Cảm giác</span>
          <span className="wx-val">{Math.round(c.apparent_temperature)}°C</span>
        </div>
        <div className="wx-item">
          <span className="wx-label">Độ ẩm</span>
          <span className="wx-val">{c.relative_humidity_2m}%</span>
        </div>
        <div className="wx-item">
          <span className="wx-label">Gió</span>
          <span className="wx-val">{windDir} {Math.round(c.wind_speed_10m)} km/h</span>
        </div>
        <div className="wx-item">
          <span className="wx-label">Áp suất</span>
          <span className="wx-val">{Math.round(c.pressure_msl)} mb</span>
        </div>
        <div className="wx-item">
          <span className="wx-label">Mây</span>
          <span className="wx-val">{c.cloud_cover}%</span>
        </div>
        <div className="wx-item">
          <span className="wx-label">UV</span>
          <span className="wx-val">{c.uv_index ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}
