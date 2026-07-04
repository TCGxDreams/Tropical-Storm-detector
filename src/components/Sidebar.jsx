import { distKm } from "../services/alerts";

export default function Sidebar({
  storms,
  selectedId,
  myLoc,
  searchQuery,
  onSearchChange,
  onSelectStorm,
  onOpenCompare,
  onExportCSV,
}) {
  const query = searchQuery.trim().toLowerCase();
  const filteredStorms = storms.filter(
    (s) =>
      s.name.toLowerCase().includes(query) ||
      (s.countries && s.countries.toLowerCase().includes(query)) ||
      s.category.label.toLowerCase().includes(query)
  );

  const maxWind = storms.length ? Math.max(...storms.map((s) => s.windKmh || 0)) : 0;
  const cat5Count = storms.filter((s) => s.category.id === "CAT5").length;

  return (
    <aside id="sidebar">
      <div className="sidebar-head">
        <h2>Bão đang hoạt động</h2>
        <div className="sidebar-head-right">
          <button 
            id="btn-export" 
            className="mini-btn" 
            onClick={onExportCSV}
            title="Xuất dữ liệu bão (CSV)"
          >
            <svg className="icon"><use href="#i-download"/></svg>
          </button>
          <button 
            id="btn-compare" 
            className="mini-btn" 
            onClick={onOpenCompare}
            title="Bảng so sánh các cơn bão"
          >
            <svg className="icon"><use href="#i-table"/></svg>
          </button>
          <span id="storm-count" className="count-pill">
            {filteredStorms.length}
          </span>
        </div>
      </div>

      <div className="search-bar">
        <svg className="icon"><use href="#i-search"/></svg>
        <input 
          id="storm-search" 
          type="text" 
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm bão theo tên…" 
          autoComplete="off"
        />
      </div>

      <div id="storm-stats" className="storm-stats">
        {storms.length > 0 && (
          <>
            <div className="stat-pill">Mạnh nhất: <b>{maxWind} km/h</b></div>
            {cat5Count > 0 && (
              <div className="stat-pill" style={{ borderColor: "var(--danger)" }}>
                Cấp 5: <b style={{ color: "var(--danger)" }}>{cat5Count}</b>
              </div>
            )}
          </>
        )}
      </div>

      <div id="storm-list" className="storm-list">
        {filteredStorms.length === 0 ? (
          <div className="empty-state">
            <svg className="icon"><use href="#i-wind"/></svg><br />
            {storms.length === 0 ? "Hiện không có cơn bão nào đang hoạt động." : "Không tìm thấy cơn bão nào phù hợp."}
          </div>
        ) : (
          filteredStorms.map((s) => {
            const distance = myLoc ? Math.round(distKm(s.lat, s.lon, myLoc.lat, myLoc.lon)) : null;
            return (
              <div 
                key={s.id}
                className={`storm-card ${s.id === selectedId ? "selected" : ""}`}
                onClick={() => onSelectStorm(s.id, true)}
                style={{ "--cat-color": s.category.color }}
              >
                <div className="storm-cat-badge">
                  {s.category.short}
                  <small>{s.windKmh} km/h</small>
                </div>
                <div className="storm-info">
                  <div className="storm-name">
                    <span 
                      className="alert-dot" 
                      style={{ background: s.alertLevel === "Red" ? "#ff3d3d" : s.alertLevel === "Orange" ? "#ff9a3d" : "#3dd68c" }}
                    />
                    {s.name}
                  </div>
                  <div className="storm-meta">
                    {s.category.label} · {s.countries || s.source}
                    {distance !== null && ` · cách bạn ${distance} km`}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-foot">
        <div className="legend">
          <div className="legend-title">Thang Saffir–Simpson</div>
          <div className="legend-row"><span className="sw" style={{ background: "#5ebaff" }}></span>Áp thấp NĐ</div>
          <div className="legend-row"><span className="sw" style={{ background: "#00faf4" }}></span>Bão nhiệt đới</div>
          <div className="legend-row"><span className="sw" style={{ background: "#ffffb2" }}></span>Cấp 1</div>
          <div className="legend-row"><span className="sw" style={{ background: "#ffd37f" }}></span>Cấp 2</div>
          <div className="legend-row"><span className="sw" style={{ background: "#ffa64d" }}></span>Cấp 3</div>
          <div className="legend-row"><span className="sw" style={{ background: "#ff7326" }}></span>Cấp 4</div>
          <div className="legend-row"><span className="sw" style={{ background: "#ff3d3d" }}></span>Cấp 5</div>
        </div>
        <div className="sources">Nguồn: GDACS · NOAA NHC · IBTrACS · NASA GIBS</div>
      </div>
    </aside>
  );
}
