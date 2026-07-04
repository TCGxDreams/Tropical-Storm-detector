/* ============================================================
 * app.js — StormWatch Global
 * Quả địa cầu 3D kiểu NASA (CesiumJS + ảnh vệ tinh NASA GIBS)
 * + hiển thị bão thời gian thực, tự làm mới 5 phút/lần
 * ============================================================ */

(() => {
  "use strict";

  const REFRESH_MS = 5 * 60 * 1000; // 5 phút

  /* ---- Màn hình khởi động ---- */
  let splashHidden = false;
  function hideSplash() {
    if (splashHidden) return;
    splashHidden = true;
    const el = document.getElementById("splash");
    el.classList.add("fade-out");
    setTimeout(() => el.remove(), 600);
  }
  setTimeout(hideSplash, 12000); // failsafe

  /* ---- Cài đặt lưu trong máy ---- */
  const SETTINGS_KEY = "stormwatch-settings";
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
    catch { return {}; }
  }
  function saveSettings(patch) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...loadSettings(), ...patch }));
    } catch { /* chế độ riêng tư */ }
  }
  const settings = loadSettings();

  if (typeof Cesium === "undefined") {
    hideSplash();
    document.getElementById("cesiumContainer").innerHTML =
      `<div style="display:flex;height:100%;align-items:center;justify-content:center;
                   text-align:center;color:#8fa3c8;font-size:15px;line-height:1.8;padding:24px">
         Không tải được thư viện bản đồ CesiumJS (CDN).<br>
         Vui lòng kiểm tra kết nối mạng rồi tải lại trang.
       </div>`;
    return;
  }

  // Không dùng dịch vụ Cesium Ion (không cần token)
  Cesium.Ion.defaultAccessToken = "";

  /* ================= 1. Lớp ảnh nền (NASA GIBS) ================= */

  function gibsDate() {
    // Ảnh "hôm nay" của GIBS thường trễ vài giờ -> lùi 1 ngày cho chắc chắn
    const d = new Date(Date.now() - 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }

  function gibsProvider(layer, matrixLevel, ext, time) {
    const timePart = time ? `${time}/` : "";
    return new Cesium.UrlTemplateImageryProvider({
      url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${timePart}GoogleMapsCompatible_Level${matrixLevel}/{z}/{y}/{x}.${ext}`,
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      maximumLevel: matrixLevel,
      credit: "NASA GIBS / EOSDIS",
    });
  }

  const BASE_LAYERS = {
    trueColor:   () => gibsProvider("VIIRS_SNPP_CorrectedReflectance_TrueColor", 9, "jpg", gibsDate()),
    blueMarble:  () => gibsProvider("BlueMarble_ShadedRelief_Bathymetry", 8, "jpeg"),
    nightLights: () => gibsProvider("VIIRS_Black_Marble", 8, "png", "2016-01-01"),
    osm:         () => new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" }),
  };

  // Mỗi lớp phủ có thể gồm nhiều nguồn ảnh (vd: 3 vệ tinh địa tĩnh phủ toàn cầu)
  const OVERLAYS = {
    ref:    { alpha: 1,    providers: () => [gibsProvider("Reference_Features_15m", 9, "png")] },
    labels: { alpha: 1,    providers: () => [gibsProvider("Reference_Labels_15m", 9, "png")] },
    clouds: { alpha: 0.55, providers: () => [
      gibsProvider("Himawari_AHI_Band13_Clean_Infrared", 7, "png"),
      gibsProvider("GOES-East_ABI_Band13_Clean_Infrared", 7, "png"),
      gibsProvider("GOES-West_ABI_Band13_Clean_Infrared", 7, "png"),
    ] },
    rain:   { alpha: 0.85, providers: () => [gibsProvider("IMERG_Precipitation_Rate", 6, "png")] },
  };

  /* ================= 2. Khởi tạo Cesium ================= */

  const viewer = new Cesium.Viewer("cesiumContainer", {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    requestRenderMode: false,
  });

  const scene = viewer.scene;
  scene.globe.enableLighting = false;
  scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a1633");
  scene.backgroundColor = Cesium.Color.fromCssColorString("#05080f");
  scene.globe.showGroundAtmosphere = true;
  scene.skyAtmosphere.brightnessShift = 0.15;
  scene.screenSpaceCameraController.minimumZoomDistance = 120000;

  // Vị trí ban đầu: nhìn toàn cầu, hướng về Tây Thái Bình Dương / Biển Đông
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(114, 15, 22000000),
  });

  const layerState = { base: null, ref: null, labels: null, clouds: null, rain: null };

  function setBaseLayer(key) {
    if (layerState.base) viewer.imageryLayers.remove(layerState.base, true);
    layerState.base = viewer.imageryLayers.addImageryProvider(BASE_LAYERS[key]());
    viewer.imageryLayers.lowerToBottom(layerState.base);
    layerState.base.brightness = Number(document.getElementById("brightness").value);
    saveSettings({ base: key });
  }

  function setOverlay(key, on) {
    if (on && !layerState[key]) {
      const def = OVERLAYS[key];
      layerState[key] = def.providers().map((p) => {
        const layer = viewer.imageryLayers.addImageryProvider(p);
        layer.alpha = def.alpha;
        return layer;
      });
      // Đường biên giới & địa danh luôn nằm trên cùng
      for (const k of ["ref", "labels"])
        (layerState[k] || []).forEach((l) => viewer.imageryLayers.raiseToTop(l));
    } else if (!on && layerState[key]) {
      layerState[key].forEach((l) => viewer.imageryLayers.remove(l, true));
      layerState[key] = null;
    }
    saveSettings({ [`ovl_${key}`]: on });
  }

  function setLighting(on) {
    scene.globe.enableLighting = on;
    saveSettings({ lighting: on });
  }

  // Khôi phục cài đặt đã lưu từ lần dùng trước
  const initBase = BASE_LAYERS[settings.base] ? settings.base : "trueColor";
  const baseRadio = document.querySelector(`input[name="baselayer"][value="${initBase}"]`);
  if (baseRadio) baseRadio.checked = true;
  if (settings.brightness) document.getElementById("brightness").value = settings.brightness;
  setBaseLayer(initBase);
  for (const key of Object.keys(OVERLAYS)) {
    const on = settings[`ovl_${key}`] ?? (key === "ref");
    document.getElementById(`ovl-${key}`).checked = on;
    setOverlay(key, on);
  }
  if (settings.lighting) {
    document.getElementById("chk-lighting").checked = true;
    setLighting(true);
  }
  if (settings.ovl_cones === false) document.getElementById("ovl-cones").checked = false;
  if (settings.ovl_tracks === false) document.getElementById("ovl-tracks").checked = false;

  /* ================= 3. Biểu tượng bão (vẽ canvas) ================= */

  const iconCache = new Map();

  function hurricaneIcon(color, size = 64) {
    const key = `${color}-${size}`;
    if (iconCache.has(key)) return iconCache.get(key);

    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const cx = size / 2, r = size * 0.42;

    ctx.translate(cx, cx);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.12;
    ctx.lineWidth = size * 0.1;
    ctx.lineCap = "round";

    // 2 cánh xoắn của biểu tượng bão nhiệt đới
    for (const flip of [0, Math.PI]) {
      ctx.beginPath();
      for (let t = 0; t <= 1; t += 0.05) {
        const ang = flip + t * 1.9;
        const rad = r * (0.42 + t * 0.58);
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Mắt bão
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    const url = c.toDataURL();
    iconCache.set(key, url);
    return url;
  }

  /* ================= 4. Vẽ bão lên bản đồ ================= */

  const stormSource = new Cesium.CustomDataSource("storms");
  viewer.dataSources.add(stormSource);

  let storms = [];
  const showCones  = () => document.getElementById("ovl-cones").checked;
  const showTracks = () => document.getElementById("ovl-tracks").checked;

  function spinProperty(speed) {
    return new Cesium.CallbackProperty(
      () => ((performance.now() / 1000) * speed) % (Math.PI * 2), false);
  }

  function drawStorm(storm) {
    const color = Cesium.Color.fromCssColorString(storm.category.color);
    const pos = Cesium.Cartesian3.fromDegrees(storm.lon, storm.lat);

    stormSource.entities.add({
      id: `icon-${storm.id}`,
      position: pos,
      properties: { stormId: storm.id },
      billboard: {
        image: hurricaneIcon(storm.category.color),
        width: 46,
        height: 46,
        rotation: spinProperty(storm.windKmh >= 119 ? 1.6 : 0.9),
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.4, 2.5e7, 0.55),
      },
      label: {
        text: `${storm.name}\n${storm.windKmh} km/h`,
        font: "600 13px 'Segoe UI', sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString("#05080f"),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        // Nhãn bám sát icon ở mọi mức zoom: offset và cỡ chữ co theo khoảng cách
        pixelOffset: new Cesium.Cartesian2(0, -28),
        pixelOffsetScaleByDistance: new Cesium.NearFarScalar(2e5, 1.2, 2.5e7, 0.55),
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.0, 2.5e7, 0.75),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#05080f").withAlpha(0.55),
        backgroundPadding: new Cesium.Cartesian2(7, 4),
      },
    });

    // Vòng ảnh hưởng mờ quanh tâm bão
    stormSource.entities.add({
      id: `ring-${storm.id}`,
      position: pos,
      properties: { stormId: storm.id },
      ellipse: {
        semiMajorAxis: 140000 + storm.windKmh * 900,
        semiMinorAxis: 140000 + storm.windKmh * 900,
        material: color.withAlpha(0.13),
        outline: true,
        outlineColor: color.withAlpha(0.6),
        height: 0,
      },
    });
  }

  function drawTrack(storm) {
    const t = storm.track;
    if (!t) return;

    if (showTracks()) {
      for (const line of t.lines) {
        const flat = line.flat();
        if (flat.length < 4) continue;
        stormSource.entities.add({
          properties: { stormId: storm.id },
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(flat),
            width: 2.5,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.WHITE.withAlpha(0.85),
              dashLength: 12,
            }),
            clampToGround: true,
          },
        });
      }
      for (const p of t.points) {
        const c = StormData.categorize(p.windKmh).color;
        stormSource.entities.add({
          position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
          properties: { stormId: storm.id },
          point: {
            pixelSize: 7,
            color: Cesium.Color.fromCssColorString(c),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
            outlineWidth: 1.5,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(2e5, 1.2, 2.5e7, 0.4),
          },
        });
      }
    }

    if (showCones()) {
      for (const poly of t.cones) {
        const ring = poly[0];
        if (!ring || ring.length < 3) continue;
        stormSource.entities.add({
          properties: { stormId: storm.id },
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(ring.flat()),
            material: Cesium.Color.WHITE.withAlpha(0.09),
            outline: false,
            height: 0,
          },
        });
      }
      for (const impact of t.impacts) {
        const col = Cesium.Color.fromCssColorString(impact.color);
        for (const poly of impact.polys) {
          const ring = poly[0];
          if (!ring || ring.length < 3) continue;
          stormSource.entities.add({
            properties: { stormId: storm.id },
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(ring.flat()),
              material: col.withAlpha(0.10),
              outline: true,
              outlineColor: col.withAlpha(0.45),
              height: 0,
            },
          });
        }
      }
    }
  }

  function redrawAll() {
    stormSource.entities.removeAll();
    for (const s of storms) {
      drawStorm(s);
      drawTrack(s);
    }
  }

  /* ================= 5. Sidebar & panel chi tiết ================= */

  const listEl = document.getElementById("storm-list");
  let selectedId = null;

  function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    return isNaN(dt) ? String(d) : dt.toLocaleString("vi-VN", { hour12: false });
  }

  function renderList() {
    document.getElementById("storm-count").textContent = storms.length;
    if (!storms.length) {
      listEl.innerHTML = `<div class="empty-state">
        <svg class="icon"><use href="#i-wind"/></svg><br>
        Hiện không có cơn bão nào<br>đang hoạt động trên thế giới.</div>`;
      return;
    }
    listEl.innerHTML = storms.map((s) => `
      <div class="storm-card ${s.id === selectedId ? "selected" : ""}"
           data-id="${s.id}" style="--cat-color:${s.category.color}">
        <div class="storm-cat-badge">${s.category.short}<small>${s.windKmh} km/h</small></div>
        <div class="storm-info">
          <div class="storm-name">
            <span class="alert-dot" style="background:${StormData.ALERT_COLORS[s.alertLevel] || "#3dd68c"}"></span>
            ${s.name}
          </div>
          <div class="storm-meta">${s.category.label} · ${s.countries || s.source}</div>
        </div>
      </div>`).join("");

    listEl.querySelectorAll(".storm-card").forEach((el) => {
      el.addEventListener("click", () => selectStorm(el.dataset.id, true));
    });
  }

  function selectStorm(id, fly) {
    selectedId = id;
    const s = storms.find((x) => x.id === id);
    renderList();
    if (!s) return;

    if (fly) {
      pauseAutoRotate();
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 2200000),
        duration: 1.8,
      });
    }
    showDetail(s);
    loadTrackFor(s);
  }

  function showDetail(s) {
    document.getElementById("detail-title").textContent = s.name;
    document.getElementById("detail-body").innerHTML = `
      <div class="detail-hero">
        <div class="storm-cat-badge" style="--cat-color:${s.category.color}; background:${s.category.color}; width:54px;height:54px;">
          ${s.category.short}
        </div>
        <div>
          <div style="font-weight:700;font-size:16px">${s.category.label}</div>
          <div style="font-size:12px;color:var(--text-dim)">Mức cảnh báo:
            <b style="color:${StormData.ALERT_COLORS[s.alertLevel] || "#3dd68c"}">${s.alertLevel}</b>
          </div>
        </div>
      </div>
      <div class="detail-stats">
        <div class="stat-box"><div class="k">Gió mạnh nhất</div>
          <div class="v">${s.windKmh || "—"} <small>km/h</small></div></div>
        <div class="stat-box"><div class="k">Tương đương</div>
          <div class="v">${s.windKt ?? "—"} <small>hải lý/giờ</small></div></div>
        <div class="stat-box"><div class="k">Áp suất</div>
          <div class="v">${s.pressure ?? "—"} <small>mb</small></div></div>
        <div class="stat-box"><div class="k">Di chuyển</div>
          <div class="v" style="font-size:13px">${s.movement ?? "—"}</div></div>
      </div>
      <div class="detail-rows">
        <div><b>Vị trí:</b> ${s.lat.toFixed(1)}°, ${s.lon.toFixed(1)}°</div>
        <div><b>Khu vực ảnh hưởng:</b> ${s.countries || "—"}</div>
        ${s.population ? `<div><b>Mức độ:</b> ${s.population}</div>` : ""}
        <div><b>Cập nhật:</b> ${fmtDate(s.updated)}</div>
        <div><b>Nguồn:</b> ${s.source}</div>
      </div>
      ${windChartHtml(s)}
      <a class="detail-link" href="${s.reportUrl}" target="_blank" rel="noopener">
        Xem báo cáo đầy đủ <svg class="icon"><use href="#i-external"/></svg></a>`;
    document.getElementById("detail-panel").classList.remove("hidden");
    renderWindChart(s);
  }

  function chartPoints(s) {
    return (s.track?.points || []).filter((p) => p.windKmh > 0);
  }

  function windChartHtml(s) {
    if (chartPoints(s).length < 2) return "";
    return `<div class="wind-chart-sec">
      <div class="k">Diễn biến sức gió (km/h)</div>
      <div class="wind-chart-wrap"><canvas id="wind-chart"></canvas></div>
    </div>`;
  }

  function renderWindChart(s) {
    const canvas = document.getElementById("wind-chart");
    if (!canvas) return;
    requestAnimationFrame(() => StormChart.draw(canvas, chartPoints(s)));
  }

  async function loadTrackFor(s) {
    if (s.track || !s.geometryUrl) return;
    try {
      s.track = await StormData.fetchTrack(s);
      redrawAll();
      // Nếu đang mở panel của cơn bão này -> vẽ thêm biểu đồ sức gió
      if (s.id === selectedId &&
          !document.getElementById("detail-panel").classList.contains("hidden")) {
        showDetail(s);
      }
    } catch (e) {
      console.warn("Không tải được đường đi của", s.name, e);
    }
  }

  // Click vào biểu tượng bão trên bản đồ
  const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction((movement) => {
    const picked = scene.pick(movement.position);
    const stormId = picked?.id?.properties?.stormId?.getValue?.();
    if (stormId) selectStorm(stormId, false);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  /* ================= 5b. Cảnh báo bão gần Việt Nam ================= */

  // Các điểm mốc dọc bờ biển Việt Nam (lat, lon)
  const VN_COAST = [
    [21.5, 108.0], [20.0, 106.5], [18.7, 105.8], [17.5, 106.6],
    [16.05, 108.2], [13.8, 109.3], [12.2, 109.2], [10.3, 107.1], [8.6, 104.7],
  ];

  function distKm(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180, R = 6371;
    const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  let vnAlertDismissed = "";
  let vnAlertStormId = null;

  function updateVnAlert() {
    const el = document.getElementById("vn-alert");
    const near = storms
      .map((s) => ({ s, d: Math.round(Math.min(...VN_COAST.map(([la, lo]) => distKm(s.lat, s.lon, la, lo)))) }))
      .filter((x) => x.d < 1200 || /viet\s*nam/i.test(x.s.countries))
      .sort((a, b) => a.d - b.d);

    const key = near.map((x) => x.s.id).join(",");
    if (!near.length || key === vnAlertDismissed) {
      el.classList.add("hidden");
      return;
    }
    const { s, d } = near[0];
    vnAlertStormId = s.id;
    el.dataset.key = key;
    document.getElementById("vn-alert-text").textContent =
      `${s.category.label} ${s.name} cách bờ biển Việt Nam ~${d} km`;
    el.classList.remove("hidden");
  }

  document.getElementById("vn-alert-goto").addEventListener("click", () => {
    if (vnAlertStormId) selectStorm(vnAlertStormId, true);
  });
  document.getElementById("vn-alert-close").addEventListener("click", () => {
    const el = document.getElementById("vn-alert");
    vnAlertDismissed = el.dataset.key || "";
    el.classList.add("hidden");
  });

  /* ================= 6. Tải & làm mới dữ liệu ================= */

  let nextRefreshAt = Date.now() + REFRESH_MS;
  let refreshing = false;

  function toast(msg, warn = false, ms = 5000) {
    const el = document.getElementById("status-toast");
    el.innerHTML = (warn ? '<svg class="icon"><use href="#i-alert"/></svg>' : "") +
      `<span></span>`;
    el.lastElementChild.textContent = msg;
    el.className = `toast ${warn ? "warn" : ""}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add("hidden"), ms);
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    document.getElementById("btn-refresh").classList.add("spinning");
    try {
      const { storms: fresh, errors } = await StormData.fetchActiveStorms();
      const badge = document.getElementById("live-badge");

      if (!fresh.length && errors.length >= 2) {
        // Cả hai nguồn đều lỗi -> dữ liệu mẫu để minh hoạ giao diện
        storms = StormData.demoStorms();
        badge.classList.add("stale");
        badge.innerHTML = `<span class="live-dot"></span> DEMO`;
        toast("Không kết nối được nguồn dữ liệu — đang hiển thị dữ liệu mẫu.", true, 8000);
      } else {
        // Giữ lại track đã tải cho các cơn bão cũ
        const oldTracks = new Map(storms.map((s) => [s.id, s.track]));
        for (const s of fresh) s.track = oldTracks.get(s.id) || null;
        storms = fresh;
        badge.classList.remove("stale");
        badge.innerHTML = `<span class="live-dot"></span> LIVE`;
        if (errors.length) toast(`Một nguồn dữ liệu bị lỗi (${errors[0]})`, true);
      }

      renderList();
      redrawAll();
      updateVnAlert();
      // Tải trước đường đi của vài cơn bão mạnh nhất
      storms.slice(0, 5).forEach(loadTrackFor);

      document.getElementById("last-update").innerHTML =
        '<span class="upd-prefix">Cập nhật: </span>' +
        new Date().toLocaleTimeString("vi-VN", { hour12: false });
    } catch (e) {
      toast("Lỗi tải dữ liệu: " + e.message, true);
    } finally {
      refreshing = false;
      nextRefreshAt = Date.now() + REFRESH_MS;
      document.getElementById("btn-refresh").classList.remove("spinning");
      hideSplash();
    }
  }

  setInterval(() => {
    if (Date.now() >= nextRefreshAt) refresh();
    const remain = Math.max(0, nextRefreshAt - Date.now());
    const m = Math.floor(remain / 60000), s = Math.floor((remain % 60000) / 1000);
    document.getElementById("countdown").textContent =
      `Làm mới sau ${m}:${String(s).padStart(2, "0")}`;
  }, 1000);

  /* ================= 7. Tự động xoay địa cầu ================= */

  let autoRotate = settings.autoRotate ?? true;
  document.getElementById("btn-rotate").classList.toggle("active", autoRotate);
  let rotatePausedUntil = 0;

  function pauseAutoRotate(ms = 12000) { rotatePausedUntil = Date.now() + ms; }
  scene.canvas.addEventListener("pointerdown", () => pauseAutoRotate());
  scene.canvas.addEventListener("wheel", () => pauseAutoRotate(), { passive: true });

  viewer.clock.onTick.addEventListener(() => {
    if (autoRotate && Date.now() > rotatePausedUntil &&
        scene.mode === Cesium.SceneMode.SCENE3D) {
      viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0006);
    }
  });

  /* ================= 7b. Tour bay qua các cơn bão ================= */

  let tourActive = false;
  let tourTimer = null;

  function stopTour() {
    tourActive = false;
    clearTimeout(tourTimer);
    document.getElementById("btn-tour").classList.remove("active");
  }

  function startTour() {
    if (!storms.length) {
      toast("Chưa có dữ liệu bão để tham quan.");
      return;
    }
    tourActive = true;
    document.getElementById("btn-tour").classList.add("active");
    let i = 0;
    const next = () => {
      if (!tourActive) return;
      if (i >= storms.length) { stopTour(); return; }
      const s = storms[i++];
      selectedId = s.id;
      renderList();
      pauseAutoRotate(8000);
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 2000000),
        duration: 2.4,
        complete: () => { tourTimer = setTimeout(next, 2800); },
        cancel: stopTour, // người dùng chạm vào bản đồ -> dừng tour
      });
    };
    next();
  }

  document.getElementById("btn-tour").addEventListener("click", () => {
    tourActive ? stopTour() : startTour();
  });

  /* ================= 8. Điều khiển UI ================= */

  // 3D / 2.5D / 2D
  function setViewMode(mode, animate = true) {
    document.querySelectorAll("#view-mode button").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === mode));
    const dur = animate ? 1.2 : 0;
    if (mode === "3d") scene.morphTo3D(dur);
    else if (mode === "2.5d") scene.morphToColumbusView(dur);
    else scene.morphTo2D(dur);
    saveSettings({ mode });
  }
  document.querySelectorAll("#view-mode button").forEach((btn) => {
    btn.addEventListener("click", () => setViewMode(btn.dataset.mode));
  });
  if (settings.mode && settings.mode !== "3d") setViewMode(settings.mode, false);

  document.getElementById("btn-rotate").addEventListener("click", (e) => {
    autoRotate = !autoRotate;
    e.currentTarget.classList.toggle("active", autoRotate);
    saveSettings({ autoRotate });
  });

  document.getElementById("btn-layers").addEventListener("click", () => {
    document.getElementById("layers-panel").classList.toggle("hidden");
  });

  document.querySelectorAll(".panel-close").forEach((b) => {
    b.addEventListener("click", () => document.getElementById(b.dataset.close).classList.add("hidden"));
  });

  document.querySelectorAll('input[name="baselayer"]').forEach((r) => {
    r.addEventListener("change", () => setBaseLayer(r.value));
  });
  for (const key of Object.keys(OVERLAYS)) {
    document.getElementById(`ovl-${key}`).addEventListener("change", (e) => setOverlay(key, e.target.checked));
  }
  document.getElementById("ovl-cones").addEventListener("change", (e) => {
    saveSettings({ ovl_cones: e.target.checked });
    redrawAll();
  });
  document.getElementById("ovl-tracks").addEventListener("change", (e) => {
    saveSettings({ ovl_tracks: e.target.checked });
    redrawAll();
  });
  document.getElementById("chk-lighting").addEventListener("change", (e) => setLighting(e.target.checked));
  document.getElementById("brightness").addEventListener("input", (e) => {
    if (layerState.base) layerState.base.brightness = Number(e.target.value);
    saveSettings({ brightness: Number(e.target.value) });
  });

  document.getElementById("btn-refresh").addEventListener("click", refresh);

  /* ================= Khởi động ================= */
  refresh();
})();
