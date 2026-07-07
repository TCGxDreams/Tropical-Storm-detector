import { useEffect, useRef } from "react";
import { distKm, distToVN, predictStormForecast } from "../services/alerts";
import { drawWindChart, drawPressureChart } from "../utils/chart";

export default function DetailPanel({
  storm,
  myLoc,
  isOpen,
  onClose,
  onShare,
  isPlaying,
  onPlayPlayback,
  onStopPlayback,
}) {
  const windCanvasRef = useRef(null);
  const pressureCanvasRef = useRef(null);

  const aiForecast = storm ? predictStormForecast(storm) : null;

  const formatDateTime = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    return isNaN(dt) ? String(d) : dt.toLocaleString("vi-VN", { hour12: false });
  };

  const chartPoints = storm?.track?.points?.filter((p) => p.windKmh > 0) || [];
  const hasTrackData = chartPoints.length >= 2;

  // Redraw charts when storm track changes or when panel opens
  useEffect(() => {
    if (!isOpen || !storm || !hasTrackData) return;

    // Wait a brief tick for DOM to render the canvas elements
    const timer = requestAnimationFrame(() => {
      if (windCanvasRef.current) {
        drawWindChart(windCanvasRef.current, chartPoints);
      }
      if (pressureCanvasRef.current) {
        drawPressureChart(pressureCanvasRef.current, chartPoints);
      }
    });

    return () => cancelAnimationFrame(timer);
  }, [isOpen, storm, chartPoints, hasTrackData]);

  if (!isOpen || !storm) return null;

  const distance = myLoc ? Math.round(distKm(storm.lat, storm.lon, myLoc.lat, myLoc.lon)) : null;
  const vn = distToVN(storm.lat, storm.lon);

  return (
    <div id="detail-panel" className="panel">
      <div className="panel-head">
        <h3 id="detail-title">{storm.name}</h3>
        <div className="panel-head-btns">
          <button 
            className="panel-close" 
            id="btn-share" 
            onClick={onShare}
            title="Chia sẻ cơn bão này"
          >
            <svg className="icon"><use href="#i-share"/></svg>
          </button>
          <button 
            className="panel-close" 
            onClick={onClose}
            title="Đóng"
          >
            <svg className="icon"><use href="#i-x"/></svg>
          </button>
        </div>
      </div>
      
      <div className="panel-body" id="detail-body">
        <div className="detail-hero">
          <div 
            className="storm-cat-badge" 
            style={{ 
              "--cat-color": storm.category.color, 
              background: storm.category.color,
              width: "54px",
              height: "54px",
            }}
          >
            {storm.category.short}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "16px" }}>{storm.category.label}</div>
            <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>
              Mức cảnh báo:{" "}
              <b style={{ color: storm.alertLevel === "Red" ? "#ff3d3d" : storm.alertLevel === "Orange" ? "#ff9a3d" : "#3dd68c" }}>
                {storm.alertLevel}
              </b>
            </div>
          </div>
        </div>

        <div className="detail-stats">
          <div className="stat-box">
            <div className="k">Gió mạnh nhất</div>
            <div className="v">{storm.windKmh || "—"} <small>km/h</small></div>
          </div>
          <div className="stat-box">
            <div className="k">Tương đương</div>
            <div className="v">{storm.windKt ?? "—"} <small>hải lý/giờ</small></div>
          </div>
          <div className="stat-box">
            <div className="k">Áp suất</div>
            <div className="v">{storm.pressure ?? "—"} <small>mb</small></div>
          </div>
          <div className="stat-box">
            <div className="k">Di chuyển</div>
            <div className="v" style={{ fontSize: "13px" }}>{storm.movement ?? "—"}</div>
          </div>
        </div>

        <div className="detail-rows">
          <div><b>Vị trí:</b> {storm.lat.toFixed(1)}°, {storm.lon.toFixed(1)}°</div>
          <div><b>Khu vực ảnh hưởng:</b> {storm.countries || "—"}</div>
          {storm.population && <div><b>Mức độ:</b> {storm.population}</div>}
          <div><b>Cập nhật:</b> {formatDateTime(storm.updated)}</div>
          <div><b>Nguồn:</b> {storm.source}</div>
          <div><b>Cách đất liền VN:</b> {vn.km} km (gần {vn.place})</div>
          {distance !== null && <div><b>Cách vị trí của bạn:</b> {distance} km</div>}
        </div>

        {aiForecast && (
          <div className="ai-analysis-box">
            <div className="ai-title">
              <svg className="icon ai-icon" viewBox="0 0 24 24" style={{ width: "16px", height: "16px", fill: "none", stroke: "var(--accent2)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", marginRight: "8px", verticalAlign: "middle" }}>
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" />
                <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
              </svg>
              <span>Phân tích & Dự báo AI</span>
              <span className="ai-beta-badge">BETA</span>
            </div>
            
            <div className="ai-grid">
              <div className="ai-item">
                <span className="lbl">Hướng đi</span>
                <span className="val">{aiForecast.bearingText} ({aiForecast.bearing}°)</span>
              </div>
              <div className="ai-item">
                <span className="lbl">Tốc độ đi</span>
                <span className="val">{aiForecast.speedKmh} km/h</span>
              </div>
              <div className="ai-item">
                <span className="lbl">Nhiệt độ biển SST</span>
                <span className="val" style={{ color: aiForecast.currentSST >= 28.5 ? "#ff9a3d" : "var(--text)" }}>
                  {aiForecast.currentSST}°C
                </span>
              </div>
            </div>

            {aiForecast.landfall ? (
              <div className="ai-landfall-alert danger">
                <div className="alert-badge text-glow-red">CẢNH BÁO ĐỔ BỘ</div>
                <div className="alert-content">
                  Dự kiến đổ bộ đất liền <b>{aiForecast.landfall.region}</b> sau <b>{aiForecast.landfall.etaHours}h tới</b>. Sức gió đổ bộ đạt <b>{aiForecast.landfall.estimatedWindKmh} km/h</b>.
                </div>
              </div>
            ) : (
              <div className="ai-landfall-alert safe">
                <div className="alert-badge safe">DỰ BÁO XU HƯỚNG</div>
                <div className="alert-content">
                  Không có khả năng đổ bộ trực tiếp vào đất liền Việt Nam trong 72 giờ tới.
                </div>
              </div>
            )}

            <div className="ai-table-title">DỰ BÁO CƯỜNG ĐỘ 72H TIẾP THEO</div>
            <div className="ai-forecast-table">
              <div className="ai-table-row header">
                <div>Thời gian</div>
                <div>Tọa độ</div>
                <div>Sức gió</div>
                <div>Môi trường</div>
              </div>
              {aiForecast.forecasts.map((f, idx) => (
                <div className="ai-table-row" key={idx}>
                  <div style={{ color: "var(--accent2)", fontWeight: 700 }}>+{f.hour}h</div>
                  <div>{f.lat.toFixed(1)}°, {f.lon.toFixed(1)}°</div>
                  <div style={{ color: "#ff5e5e", fontWeight: 700 }}>{f.windKmh} km/h</div>
                  <div style={{ fontSize: "11px" }}>
                    {f.isOverLand ? `${f.landRegion}` : `${f.estimatedSST.toFixed(1)}°C`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasTrackData && (
          <button 
            id="btn-playtrack" 
            className={`icon-btn playtrack ${isPlaying ? "active" : ""}`}
            onClick={isPlaying ? onStopPlayback : onPlayPlayback}
          >
            <svg className="icon"><use href="#i-play"/></svg>
            <span>{isPlaying ? "Dừng phát lại" : "Phát lại quỹ đạo"}</span>
          </button>
        )}

        {hasTrackData && (
          <>
            <div className="wind-chart-sec">
              <div className="k">Diễn biến sức gió (km/h)</div>
              <div className="wind-chart-wrap">
                <canvas ref={windCanvasRef} id="wind-chart"></canvas>
              </div>
            </div>
            
            <div className="wind-chart-sec">
              <div className="k">Diễn biến áp suất (mb)</div>
              <div className="wind-chart-wrap">
                <canvas ref={pressureCanvasRef} id="pressure-chart"></canvas>
              </div>
            </div>
          </>
        )}

        <a 
          className="detail-link" 
          href={storm.reportUrl} 
          target="_blank" 
          rel="noopener noreferrer"
        >
          Xem báo cáo đầy đủ <svg className="icon"><use href="#i-external"/></svg>
        </a>
      </div>
    </div>
  );
}
