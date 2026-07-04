import { distKm, distToVN } from "../services/alerts";

export function GuideModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div id="guide-modal" className="modal" onClick={(e) => e.target.id === "guide-modal" && onClose()}>
      <div className="modal-card guide-card">
        <div className="panel-head">
          <h3>📖 Hướng dẫn sử dụng StormWatch</h3>
          <button className="panel-close" onClick={onClose} title="Đóng">
            <svg className="icon"><use href="#i-x"/></svg>
          </button>
        </div>
        <div className="modal-body guide-body">
          <div className="guide-section">
            <h4>🌍 Điều khiển bản đồ</h4>
            <div className="guide-grid">
              <div className="guide-item"><span class="guide-key">Kéo chuột</span><span>Xoay quả địa cầu</span></div>
              <div className="guide-item"><span class="guide-key">Cuộn chuột</span><span>Phóng to / thu nhỏ</span></div>
              <div className="guide-item"><span class="guide-key">Chuột phải + kéo</span><span>Nghiêng góc nhìn</span></div>
              <div className="guide-item"><span class="guide-key">Click cơn bão</span><span>Xem chi tiết</span></div>
            </div>
          </div>
          <div className="guide-section">
            <h4>⌨️ Phím tắt</h4>
            <div className="guide-grid">
              <div className="guide-item"><span class="guide-key">R</span><span>Bật/tắt tự xoay</span></div>
              <div className="guide-item"><span class="guide-key">T</span><span>Tour bay qua các bão</span></div>
              <div className="guide-item"><span class="guide-key">L</span><span>Mở/đóng lớp bản đồ</span></div>
              <div className="guide-item"><span class="guide-key">F</span><span>Làm mới dữ liệu</span></div>
              <div className="guide-item"><span class="guide-key">/</span><span>Tìm kiếm bão</span></div>
              <div className="guide-item"><span class="guide-key">1 · 2 · 3</span><span>Chế độ 3D · 2.5D · 2D</span></div>
              <div className="guide-item"><span class="guide-key">Esc</span><span>Đóng panel</span></div>
              <div className="guide-item"><span class="guide-key">?</span><span>Mở hướng dẫn này</span></div>
            </div>
          </div>
          <div className="guide-section">
            <h4>🛰️ Lớp bản đồ</h4>
            <ul className="guide-list">
              <li><b>Ảnh vệ tinh màu thật</b> — ảnh từ vệ tinh VIIRS/Suomi NPP, cập nhật hàng ngày</li>
              <li><b>Blue Marble</b> — ảnh tổng hợp NASA nổi tiếng</li>
              <li><b>Đèn đêm</b> — ảnh đèn đêm toàn cầu (Black Marble)</li>
              <li><b>Mây hồng ngoại</b> — mây từ 3 vệ tinh: Himawari, GOES-East, GOES-West</li>
              <li><b>Mưa</b> — dữ liệu mưa GPM IMERG</li>
              <li><b>Nhiệt độ mặt biển (SST)</b> — yếu tố quan trọng trong hình thành bão</li>
            </ul>
          </div>
          <div className="guide-section">
            <h4>🌀 Tính năng bão</h4>
            <ul className="guide-list">
              <li><b>Đường đi</b> — quỹ đạo quá khứ + dự báo với nón bất định</li>
              <li><b>Phát lại</b> — hoạt hình tâm bão chạy dọc quỹ đạo</li>
              <li><b>So sánh</b> — bảng so sánh sức gió, áp suất, khoảng cách</li>
              <li><b>Biểu đồ</b> — diễn biến sức gió và áp suất theo thời gian</li>
              <li><b>Xuất CSV</b> — tải danh sách bão dưới dạng bảng tính</li>
              <li><b>Cảnh báo VN</b> — tự cảnh báo khi có bão gần Việt Nam (&lt;1200 km)</li>
            </ul>
          </div>
          <div className="guide-section">
            <h4>🌡️ Thời tiết</h4>
            <p>Nhấn nút <b>🌡️</b> trên bản đồ để xem thời tiết thực tại vị trí bạn (cần bật định vị trước).</p>
          </div>
          <div className="guide-footer">
            <span>StormWatch Global v2.0 · Dữ liệu chỉ mang tính tham khảo</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompareModal({ isOpen, onClose, storms, myLoc, onSelectStorm }) {
  if (!isOpen) return null;

  const columns = [
    { key: "name", label: "Tên" },
    { key: "windKmh", label: "Gió (km/h)" },
    { key: "pressure", label: "Áp suất" },
    { key: "vnDist", label: "Cách VN" },
    ...(myLoc ? [{ key: "userDist", label: "Cách bạn" }] : []),
  ];

  const rows = storms.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.category.color,
    short: s.category.short,
    windKmh: s.windKmh,
    pressure: s.pressure,
    vnDist: distToVN(s.lat, s.lon),
    userDist: myLoc ? Math.round(distKm(s.lat, s.lon, myLoc.lat, myLoc.lon)) : null,
  }));

  const handleRowClick = (id) => {
    onClose();
    onSelectStorm(id, true);
  };

  return (
    <div id="compare-modal" className="modal" onClick={(e) => e.target.id === "compare-modal" && onClose()}>
      <div className="modal-card">
        <div className="panel-head">
          <h3>So sánh các cơn bão</h3>
          <button className="panel-close" onClick={onClose} title="Đóng">
            <svg className="icon"><use href="#i-x"/></svg>
          </button>
        </div>
        <div className="modal-body">
          <table id="compare-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => handleRowClick(r.id)}>
                  <td>
                    <span className="dot" style={{ background: r.color }} />
                    {r.name} <small>{r.short}</small>
                  </td>
                  <td>{r.windKmh || "—"}</td>
                  <td>{r.pressure ?? "—"}</td>
                  <td>{r.vnDist} km</td>
                  {myLoc && <td>{r.userDist} km</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="modal-hint">Chạm vào hàng để bay tới cơn bão</div>
        </div>
      </div>
    </div>
  );
}
