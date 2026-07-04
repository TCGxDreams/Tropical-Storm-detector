import { useEffect, useRef } from "react";
import { distKm } from "../services/alerts";
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
          {distance !== null && <div><b>Cách vị trí của bạn:</b> {distance} km</div>}
        </div>

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
