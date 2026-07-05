import { weatherDesc, windDirection } from "../services/weather";

export default function WeatherWidget({ data, isOpen, onClose, title }) {
  if (!isOpen || !data?.current) return null;

  const c = data.current;
  const w = weatherDesc(c.weather_code);
  const windDir = windDirection(c.wind_direction_10m);

  const hourly = data.hourly || { time: [] };
  const next24h = (hourly.time || []).slice(0, 24).map((tStr, idx) => {
    const d = new Date(tStr);
    const hourStr = d.getHours() + ":00";
    const isToday = d.getDate() === new Date().getDate();
    const code = hourly.weather_code[idx];
    const wD = weatherDesc(code);
    const temp = Math.round(hourly.temperature_2m[idx]);
    const windSpeed = Math.round(hourly.wind_speed_10m[idx]);
    const windDeg = hourly.wind_direction_10m[idx];
    const rain = hourly.precipitation[idx] || 0;
    return {
      hourStr,
      isToday,
      dateStr: `${d.getDate()}/${d.getMonth() + 1}`,
      icon: wD.icon,
      desc: wD.text,
      temp,
      windSpeed,
      windDeg,
      rain,
    };
  });

  return (
    <div id="weather-widget" className="weather-widget">
      <div className="wx-header">
        <span className="wx-title-text">{title || "Thời tiết địa phương"}</span>
        <button id="wx-close" className="wx-close" onClick={onClose} title="Ẩn thời tiết">✕</button>
      </div>

      <div className="wx-main-row">
        <div className="wx-current-hero">
          <span className="wx-icon">{w.icon}</span>
          <div className="wx-temp-wrap">
            <span className="wx-temp">{Math.round(c.temperature_2m)}°C</span>
            <span className="wx-desc">{w.text}</span>
          </div>
        </div>

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

      <div className="wx-timeline-sec">
        <div className="wx-section-title">DỰ BÁO 24 GIỜ TỚI (WINDY STYLE)</div>
        <div className="wx-hourly">
          {next24h.map((h, idx) => (
            <div className="wx-h-card" key={idx}>
              <div className="wx-h-time">
                {h.hourStr}
                {!h.isToday && <span className="wx-h-date">{h.dateStr}</span>}
              </div>
              <span className="wx-h-icon" title={h.desc}>{h.icon}</span>
              <div className="wx-h-temp">{h.temp}°C</div>
              <div className="wx-h-wind" title={`Hướng gió: ${h.windDeg}°`}>
                <span className="wx-h-arrow" style={{ transform: `rotate(${h.windDeg}deg)` }}>↑</span>
                <span>{h.windSpeed} <small>km/h</small></span>
              </div>
              {h.rain > 0 && <div className="wx-h-rain">{h.rain.toFixed(1)} <small>mm</small></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
