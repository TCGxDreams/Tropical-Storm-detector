import { useState, useEffect, useCallback, useRef } from "react";
import Globe from "./components/Globe";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import DetailPanel from "./components/DetailPanel";
import WeatherWidget from "./components/WeatherWidget";
import { GuideModal, CompareModal } from "./components/Modals";
import { fetchActiveStorms, fetchTrack, demoStorms } from "./services/storms";
import { fetchWeather } from "./services/weather";
import { getNearVnStorm } from "./services/alerts";
import { getSetting, saveSettings } from "./utils/settings";

const REFRESH_MS = 5 * 60 * 1000; // 5 phút

export default function App() {
  /* ================= State ================= */
  const [storms, setStorms] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [myLoc, setMyLoc] = useState(() => getSetting("myLoc", null));
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshTime, setRefreshTime] = useState("");
  const [countdownText, setCountdownText] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [toastMsg, setToastMsg] = useState({ text: "", warn: false, visible: false });

  // Imagery & Overlay Settings
  const [baseLayer, setBaseLayer] = useState(() => getSetting("base", "trueColor"));
  const [viewMode, setViewMode] = useState(() => getSetting("mode", "3d"));
  const [brightness, setBrightness] = useState(() => getSetting("brightness", 1));
  const [lighting, setLighting] = useState(() => getSetting("lighting", false));
  const [autoRotate, setAutoRotate] = useState(() => getSetting("autoRotate", true));
  const [overlays, setOverlays] = useState(() => ({
    ref: getSetting("ovl_ref", true),
    labels: getSetting("ovl_labels", false),
    clouds: getSetting("ovl_clouds", false),
    rain: getSetting("ovl_rain", false),
    sst: getSetting("ovl_sst", false),
    ovl_cones: getSetting("ovl_cones", true),
    ovl_tracks: getSetting("ovl_tracks", true),
  }));

  // Playback & Tour State
  const [tourActive, setTourActive] = useState(false);
  const [playbackStorm, setPlaybackStorm] = useState(null);

  // Modals visibility
  const [layersOpen, setLayersOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [weatherData, setWeatherData] = useState(null);

  const [vnAlertDismissed, setVnAlertDismissed] = useState("");
  const refreshTimerRef = useRef(null);
  const toastTimerRef = useRef(null);

  const activeStorm = storms.find((s) => s.id === selectedId);

  /* ================= Toast Notification ================= */
  const showToast = useCallback((msg, warn = false, ms = 5000) => {
    setToastMsg({ text: msg, warn, visible: true });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMsg((prev) => ({ ...prev, visible: false }));
    }, ms);
  }, []);

  /* ================= Load and refresh storm data ================= */
  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    showToast("Đang tải dữ liệu bão mới nhất…");

    try {
      const { storms: fresh, errors } = await fetchActiveStorms();
      const badge = document.getElementById("live-badge");

      if (!fresh.length && errors.length >= 2) {
        const demo = demoStorms();
        setStorms(demo);
        if (badge) {
          badge.classList.add("stale");
          badge.innerHTML = `<span class="live-dot"></span> DEMO`;
        }
        showToast("Không kết nối được nguồn dữ liệu — đang hiển thị dữ liệu mẫu.", true, 8000);
      } else {
        // Keep old tracks to avoid downloading again
        setStorms((prev) => {
          const oldTracks = new Map(prev.map((s) => [s.id, s.track]));
          return fresh.map((s) => ({
            ...s,
            track: oldTracks.get(s.id) || null,
          }));
        });
        if (badge) {
          badge.classList.remove("stale");
          badge.innerHTML = `<span class="live-dot"></span> LIVE`;
        }
        if (errors.length) {
          showToast(`Một nguồn dữ liệu bị lỗi (${errors[0]})`, true);
        }
      }

      setRefreshTime(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
    } catch (e) {
      showToast("Lỗi tải dữ liệu: " + e.message, true);
    } finally {
      setRefreshing(false);
      // Reset countdown timer
      clearInterval(refreshTimerRef.current);
      const nextTime = Date.now() + REFRESH_MS;
      refreshTimerRef.current = setInterval(() => {
        const remain = Math.max(0, nextTime - Date.now());
        const m = Math.floor(remain / 60000), s = Math.floor((remain % 60000) / 1000);
        setCountdownText(`Làm mới sau ${m}:${String(s).padStart(2, "0")}`);
        if (remain <= 0) {
          handleRefresh();
        }
      }, 1000);
    }
  }, [refreshing, showToast]);

  // Load track info lazy-load
  const loadTrackFor = useCallback(async (s) => {
    if (s.track || !s.geometryUrl) return;
    try {
      const track = await fetchTrack(s);
      setStorms((prev) =>
        prev.map((item) => (item.id === s.id ? { ...item, track } : item))
      );
    } catch (e) {
      console.warn("Không tải được đường đi của", s.name, e);
    }
  }, []);

  // Sync selected storm changes
  useEffect(() => {
    if (activeStorm) {
      loadTrackFor(activeStorm);
    }
  }, [selectedId, activeStorm, loadTrackFor]);

  // Trigger initial fetch
  useEffect(() => {
    handleRefresh();
    return () => {
      clearInterval(refreshTimerRef.current);
      clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Preload track for top 5 strongest storms
  useEffect(() => {
    if (storms.length > 0) {
      storms.slice(0, 5).forEach((s) => loadTrackFor(s));
    }
  }, [storms, loadTrackFor]);

  /* ================= Deep Link ================= */
  useEffect(() => {
    if (storms.length > 0) {
      const id = new URLSearchParams(window.location.search).get("storm");
      if (id && storms.some((s) => s.id === id)) {
        setSelectedId(id);
      }
    }
  }, [storms]);

  /* ================= Geolocation & Weather ================= */
  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      showToast("Trình duyệt không hỗ trợ định vị — dùng vị trí mặc định (Hà Nội).", true);
      const defaultLoc = { lat: 21.0285, lon: 105.8542 };
      setMyLoc(defaultLoc);
      saveSettings({ myLoc: defaultLoc });
      return;
    }
    showToast("Đang xác định vị trí của bạn…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setMyLoc(loc);
        saveSettings({ myLoc: loc });
        showToast("Đã ghim vị trí của bạn.");
      },
      () => {
        showToast("Không lấy được vị trí — sử dụng vị trí mặc định (Hà Nội).", true);
        const defaultLoc = { lat: 21.0285, lon: 105.8542 };
        setMyLoc(defaultLoc);
        saveSettings({ myLoc: defaultLoc });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }, [showToast]);

  const loadWeather = useCallback(async (lat, lon) => {
    try {
      const data = await fetchWeather(lat, lon);
      setWeatherData(data);
      setWeatherOpen(true);
    } catch (e) {
      showToast("Không tải được thời tiết địa phương.", true);
    }
  }, [showToast]);

  // Load weather when myLoc changes
  useEffect(() => {
    if (myLoc) {
      loadWeather(myLoc.lat, myLoc.lon);
    }
  }, [myLoc, loadWeather]);

  /* ================= Export CSV ================= */
  const handleExportCSV = useCallback(() => {
    if (!storms.length) {
      showToast("Không có dữ liệu bão để xuất.", true);
      return;
    }
    const headers = ["ID", "Tên", "Nguồn", "Vĩ độ", "Kinh độ", "Sức gió (km/h)", "Sức gió (hải lý)", "Áp suất (mb)", "Mức cảnh báo", "Khu vực ảnh hưởng", "Cập nhật"];
    const rows = storms.map((s) => [
      s.id,
      s.name,
      s.source,
      s.lat,
      s.lon,
      s.windKmh || "",
      s.windKt || "",
      s.pressure || "",
      s.alertLevel,
      `"${(s.countries || "").replace(/"/g, '""')}"`,
      s.updated || "",
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `stormwatch_export_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Đã xuất danh sách bão ra file CSV!");
  }, [storms, showToast]);

  /* ================= Keyboard Shortcuts ================= */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement && document.activeElement.id === "storm-search") {
        if (e.key === "Escape") {
          document.activeElement.blur();
        }
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "r") {
        setAutoRotate((prev) => {
          saveSettings({ autoRotate: !prev });
          return !prev;
        });
      } else if (key === "t") {
        setTourActive((prev) => !prev);
      } else if (key === "l") {
        setLayersOpen((prev) => !prev);
      } else if (key === "f") {
        handleRefresh();
      } else if (key === "/") {
        e.preventDefault();
        const searchInput = document.getElementById("storm-search");
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      } else if (key === "1") {
        setViewMode("3d");
        saveSettings({ mode: "3d" });
      } else if (key === "2") {
        setViewMode("2d");
        saveSettings({ mode: "2d" });
      } else if (key === "?" || e.key === "?") {
        setHelpOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setLayersOpen(false);
        setSelectedId(null);
        setCompareOpen(false);
        setHelpOpen(false);
        setWeatherOpen(false);
        setTourActive(false);
        setPlaybackStorm(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRefresh]);

  /* ================= VN alert calculations ================= */
  const vnAlertStorm = getNearVnStorm(storms);
  const showVnAlert = vnAlertStorm && vnAlertDismissed !== vnAlertStorm.s.id;

  return (
    <>
      {/* Màn hình khởi động */}
      {storms.length === 0 && (
        <div id="splash">
          <svg className="splash-icon" aria-hidden="true"><use href="#i-storm"/></svg>
          <div className="splash-title">StormWatch <span className="brand-sub">Global</span></div>
          <div className="splash-text">Đang tải quả địa cầu &amp; dữ liệu bão…</div>
        </div>
      )}

      <Header
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          saveSettings({ mode });
        }}
        autoRotate={autoRotate}
        onToggleRotate={() => setAutoRotate((prev) => { saveSettings({ autoRotate: !prev }); return !prev; })}
        onToggleLayers={() => setLayersOpen((prev) => !prev)}
        onToggleTour={() => setTourActive((prev) => !prev)}
        tourActive={tourActive}
        onToggleHelp={() => setHelpOpen((prev) => !prev)}
        refreshTime={refreshTime}
        countdownText={countdownText}
        onRefresh={handleRefresh}
      />

      <div id="main">
        <Sidebar
          storms={storms}
          selectedId={selectedId}
          myLoc={myLoc}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectStorm={(id) => {
            setSelectedId(id);
            setTourActive(false);
            setPlaybackStorm(null);
          }}
          onOpenCompare={() => setCompareOpen(true)}
          onExportCSV={handleExportCSV}
        />

        <div id="globe-wrap">
          <Globe
            storms={storms}
            selectedId={selectedId}
            myLoc={myLoc}
            baseLayer={baseLayer}
            overlays={overlays}
            brightness={brightness}
            lighting={lighting}
            autoRotate={autoRotate}
            onSelectStorm={(id) => setSelectedId(id)}
            tourActive={tourActive}
            onStopTour={() => setTourActive(false)}
            playbackStorm={playbackStorm}
            onStopPlayback={() => setPlaybackStorm(null)}
            viewMode={viewMode}
          />

          {/* Lớp bản đồ panel */}
          <div id="layers-panel" className={`panel ${layersOpen ? "" : "hidden"}`}>
            <div className="panel-head">
              <h3>Lớp bản đồ</h3>
              <button className="panel-close" onClick={() => setLayersOpen(false)} title="Đóng">
                <svg className="icon"><use href="#i-x"/></svg>
              </button>
            </div>
            <div className="panel-body">
              <div className="opt-group">
                <div className="opt-title">Ảnh nền (NASA GIBS)</div>
                <label>
                  <input
                    type="radio"
                    name="baselayer"
                    value="trueColor"
                    checked={baseLayer === "trueColor"}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBaseLayer(val);
                      saveSettings({ base: val });
                    }}
                  />{" "}
                  Ảnh vệ tinh màu thật (hôm nay)
                </label>
                <label>
                  <input
                    type="radio"
                    name="baselayer"
                    value="blueMarble"
                    checked={baseLayer === "blueMarble"}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBaseLayer(val);
                      saveSettings({ base: val });
                    }}
                  />{" "}
                  Blue Marble (NASA)
                </label>
                <label>
                  <input
                    type="radio"
                    name="baselayer"
                    value="nightLights"
                    checked={baseLayer === "nightLights"}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBaseLayer(val);
                      saveSettings({ base: val });
                    }}
                  />{" "}
                  Đèn đêm (Black Marble)
                </label>
                <label>
                  <input
                    type="radio"
                    name="baselayer"
                    value="osm"
                    checked={baseLayer === "osm"}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBaseLayer(val);
                      saveSettings({ base: val });
                    }}
                  />{" "}
                  Bản đồ đường (OSM)
                </label>
              </div>
              <div className="opt-group">
                <div className="opt-title">Lớp phủ</div>
                <label>
                  <input
                    type="checkbox"
                    checked={overlays.ref}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setOverlays((prev) => ({ ...prev, ref: val }));
                      saveSettings({ ovl_ref: val });
                    }}
                  />{" "}
                  Bờ biển & biên giới
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={overlays.labels}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setOverlays((prev) => ({ ...prev, labels: val }));
                      saveSettings({ ovl_labels: val });
                    }}
                  />{" "}
                  Tên địa danh
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={overlays.clouds}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setOverlays((prev) => ({ ...prev, clouds: val }));
                      saveSettings({ ovl_clouds: val });
                    }}
                  />{" "}
                  Mây vệ tinh (hồng ngoại)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={overlays.rain}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setOverlays((prev) => ({ ...prev, rain: val }));
                      saveSettings({ ovl_rain: val });
                    }}
                  />{" "}
                  Mưa (GPM IMERG)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={overlays.sst}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setOverlays((prev) => ({ ...prev, sst: val }));
                      saveSettings({ ovl_sst: val });
                    }}
                  />{" "}
                  🌡️ Nhiệt độ mặt biển (SST)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={overlays.ovl_cones}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setOverlays((prev) => ({ ...prev, ovl_cones: val }));
                      saveSettings({ ovl_cones: val });
                    }}
                  />{" "}
                  Nón dự báo / vùng ảnh hưởng
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={overlays.ovl_tracks}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setOverlays((prev) => ({ ...prev, ovl_tracks: val }));
                      saveSettings({ ovl_tracks: val });
                    }}
                  />{" "}
                  Đường đi của bão
                </label>
              </div>
              <div className="opt-group">
                <div className="opt-title">Hiệu ứng</div>
                <label>
                  <input
                    type="checkbox"
                    checked={lighting}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setLighting(val);
                      saveSettings({ lighting: val });
                    }}
                  />{" "}
                  Ánh sáng ngày / đêm thực
                </label>
              </div>
              <div className="opt-group">
                <div className="opt-title">Độ sáng ảnh nền</div>
                <input
                  type="range"
                  min="0.3"
                  max="1.6"
                  step="0.05"
                  value={brightness}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setBrightness(val);
                    saveSettings({ brightness: val });
                  }}
                />
              </div>
            </div>
          </div>

          {/* Chi tiết bão panel */}
          <DetailPanel
            storm={activeStorm}
            myLoc={myLoc}
            isOpen={!!activeStorm}
            onClose={() => setSelectedId(null)}
            onShare={async () => {
              if (!activeStorm) return;
              const url = `${window.location.origin}${window.location.pathname}?storm=${encodeURIComponent(activeStorm.id)}`;
              const text = `${activeStorm.category.label} ${activeStorm.name} — gió ${activeStorm.windKmh} km/h. Theo dõi trực tiếp:`;
              if (navigator.share) {
                try { await navigator.share({ title: "StormWatch Global", text, url }); } catch { /* user cancel */ }
              } else {
                try {
                  await navigator.clipboard.writeText(`${text} ${url}`);
                  showToast("Đã sao chép liên kết chia sẻ vào clipboard.");
                } catch {
                  showToast(url);
                }
              }
            }}
            isPlaying={playbackStorm?.id === selectedId}
            onPlayPlayback={() => setPlaybackStorm(activeStorm)}
            onStopPlayback={() => setPlaybackStorm(null)}
          />

          {/* Weather Widget */}
          <WeatherWidget
            data={weatherData}
            isOpen={weatherOpen}
            onClose={() => setWeatherOpen(false)}
          />

          {/* Nút nổi Fabs */}
          <div id="map-fabs">
            <button
              id="btn-weather"
              className={`fab ${weatherOpen ? "active" : ""}`}
              onClick={() => {
                if (myLoc) {
                  setWeatherOpen((prev) => !prev);
                } else {
                  handleLocate();
                }
              }}
              title="Thời tiết tại vị trí của bạn"
            >
              <svg className="icon"><use href="#i-thermometer"/></svg>
            </button>
            <button
              id="btn-notify"
              className="fab"
              onClick={async () => {
                if (!("Notification" in window)) {
                  showToast("Trình duyệt không hỗ trợ thông báo.", true);
                  return;
                }
                if (Notification.permission === "denied") {
                  showToast("Thông báo đang bị chặn — hãy cấp quyền trong cài đặt.", true);
                  return;
                }
                const perm = await Notification.requestPermission();
                if (perm === "granted") {
                  showToast("Thông báo đã được bật!");
                } else {
                  showToast("Chưa được cấp quyền thông báo.", true);
                }
              }}
              title="Thông báo khi có bão mới"
            >
              <svg className="icon"><use href="#i-bell"/></svg>
            </button>
            <button
              id="btn-locate"
              className={`fab ${myLoc ? "active" : ""}`}
              onClick={handleLocate}
              title="Vị trí của tôi"
            >
              <svg className="icon"><use href="#i-crosshair"/></svg>
            </button>
          </div>

          {/* Bảng so sánh */}
          <CompareModal
            isOpen={compareOpen}
            onClose={() => setCompareOpen(false)}
            storms={storms}
            myLoc={myLoc}
            onSelectStorm={(id) => setSelectedId(id)}
          />

          {/* Hướng dẫn sử dụng */}
          <GuideModal
            isOpen={helpOpen}
            onClose={() => setHelpOpen(false)}
          />

          {/* Cảnh báo bão gần Việt Nam */}
          {showVnAlert && (
            <div id="vn-alert" className="vn-alert">
              <svg className="icon"><use href="#i-alert"/></svg>
              <span>
                {vnAlertStorm.s.category.label} {vnAlertStorm.s.name} cách bờ biển {vnAlertStorm.place} ~{vnAlertStorm.d} km
              </span>
              <button 
                id="vn-alert-goto" 
                onClick={() => setSelectedId(vnAlertStorm.s.id)}
                title="Bay tới cơn bão"
              >
                <svg className="icon"><use href="#i-nav"/></svg>
              </button>
              <button 
                id="vn-alert-close" 
                onClick={() => setVnAlertDismissed(vnAlertStorm.s.id)}
                title="Ẩn cảnh báo"
              >
                <svg className="icon"><use href="#i-x"/></svg>
              </button>
            </div>
          )}

          {/* Toast thông báo */}
          <div id="status-toast" className={`toast ${toastMsg.warn ? "warn" : ""} ${toastMsg.visible ? "" : "hidden"}`}>
            {toastMsg.warn && <svg className="icon"><use href="#i-alert"/></svg>}
            <span>{toastMsg.text}</span>
          </div>

          <div id="attribution">
            Ảnh: NASA GIBS / EOSDIS · Dữ liệu bão: GDACS, NOAA/NHC, IBTrACS
          </div>
        </div>
      </div>
    </>
  );
}
