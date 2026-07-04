export default function Header({
  viewMode,
  onViewModeChange,
  autoRotate,
  onToggleRotate,
  onToggleLayers,
  onToggleTour,
  tourActive,
  onToggleHelp,
  refreshTime,
  countdownText,
  onRefresh,
}) {
  return (
    <header id="topbar">
      <div className="brand">
        <svg className="brand-icon" aria-hidden="true"><use href="#i-storm"/></svg>
        <div className="brand-text">
          <h1>StormWatch <span className="brand-sub">Global</span></h1>
          <p>Theo dõi bão nhiệt đới toàn cầu · thời gian thực</p>
        </div>
      </div>

      <div className="topbar-center">
        <div id="view-mode" className="segmented">
          <button 
            data-mode="3d" 
            className={viewMode === "3d" ? "active" : ""} 
            onClick={() => onViewModeChange("3d")}
            title="Quả địa cầu 3D"
          >
            3D
          </button>
          <button 
            data-mode="2.5d" 
            className={viewMode === "2.5d" ? "active" : ""} 
            onClick={() => onViewModeChange("2.5d")}
            title="Chế độ Columbus (2.5D)"
          >
            2.5D
          </button>
          <button 
            data-mode="2d" 
            className={viewMode === "2d" ? "active" : ""} 
            onClick={() => onViewModeChange("2d")}
            title="Bản đồ phẳng"
          >
            2D
          </button>
        </div>
        
        <button 
          id="btn-rotate" 
          className={`icon-btn ${autoRotate ? "active" : ""}`} 
          onClick={onToggleRotate}
          title="Tự động xoay địa cầu"
        >
          <svg className="icon"><use href="#i-globe"/></svg>
          <span className="btn-text">Xoay</span>
        </button>
        
        <button 
          id="btn-layers" 
          className="icon-btn" 
          onClick={onToggleLayers}
          title="Lớp bản đồ"
        >
          <svg className="icon"><use href="#i-layers"/></svg>
          <span className="btn-text">Lớp nền</span>
        </button>
        
        <button 
          id="btn-tour" 
          className={`icon-btn ${tourActive ? "active" : ""}`} 
          onClick={onToggleTour}
          title="Bay qua tất cả các cơn bão"
        >
          <svg className="icon"><use href="#i-play"/></svg>
          <span className="btn-text">Tour</span>
        </button>

        <button 
          id="btn-help" 
          className="icon-btn" 
          onClick={onToggleHelp}
          title="Hướng dẫn sử dụng (?)"
        >
          <svg className="icon"><use href="#i-help"/></svg>
          <span className="btn-text">Hướng dẫn</span>
        </button>
      </div>

      <div className="topbar-right">
        <div id="live-badge" className="live-badge">
          <span className="live-dot"></span> LIVE
        </div>
        <div className="refresh-info">
          <div id="last-update">
            {refreshTime ? `Cập nhật: ${refreshTime}` : "Đang tải dữ liệu…"}
          </div>
          <div id="countdown" className="countdown">{countdownText}</div>
        </div>
        <button 
          id="btn-refresh" 
          className="icon-btn" 
          onClick={onRefresh}
          title="Làm mới ngay"
        >
          <svg className="icon"><use href="#i-refresh"/></svg>
        </button>
      </div>
    </header>
  );
}
