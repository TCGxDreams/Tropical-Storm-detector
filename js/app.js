/* ============================================================
 * app.js — StormWatch Global
 * Quả địa cầu 3D kiểu NASA (CesiumJS + ảnh vệ tinh NASA GIBS)
 * + hiển thị bão thời gian thực, tự làm mới 5 phút/lần
 * ============================================================ */

(() => {
  "use strict";

  const REFRESH_MS = 5 * 60 * 1000; // 5 phút

  if (typeof Cesium === "undefined") {
    document.getElementById("cesiumContainer").innerHTML =
      `<div style="display:flex;height:100%;align-items:center;justify-content:center;
                   text-align:center;color:#8fa3c8;font-size:15px;line-height:1.8;padding:24px">
         ⚠️ Không tải được thư viện bản đồ CesiumJS (CDN).<br>
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

  const OVERLAYS = {
    ref:    () => gibsProvider("Reference_Features_15m", 9, "png"),
    labels: () => gibsProvider("Reference_Labels_15m", 9, "png"),
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

  const layerState = { base: null, ref: null, labels: null };

  function setBaseLayer(key) {
    if (layerState.base) viewer.imageryLayers.remove(layerState.base, true);
    layerState.base = viewer.imageryLayers.addImageryProvider(BASE_LAYERS[key]());
    viewer.imageryLayers.lowerToBottom(layerState.base);
    layerState.base.brightness = Number(document.getElementById("brightness").value);
  }

  function setOverlay(key, on) {
    if (on && !layerState[key]) {
      layerState[key] = viewer.imageryLayers.addImageryProvider(OVERLAYS[key]());
    } else if (!on && layerState[key]) {
      viewer.imageryLayers.remove(layerState[key], true);
      layerState[key] = null;
    }
  }

  setBaseLayer("trueColor");
  setOverlay("ref", true);

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
        pixelOffset: new Cesium.Cartesian2(0, -38),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
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
      listEl.innerHTML = `<div class="empty-state">🌤️<br>Hiện không có cơn bão nào<br>đang hoạt động trên thế giới.</div>`;
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
      <a class="detail-link" href="${s.reportUrl}" target="_blank" rel="noopener">Xem báo cáo đầy đủ ↗</a>`;
    document.getElementById("detail-panel").classList.remove("hidden");
  }

  async function loadTrackFor(s) {
    if (s.track || !s.geometryUrl) return;
    try {
      s.track = await StormData.fetchTrack(s);
      redrawAll();
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

  /* ================= 6. Tải & làm mới dữ liệu ================= */

  let nextRefreshAt = Date.now() + REFRESH_MS;
  let refreshing = false;

  function toast(msg, warn = false, ms = 5000) {
    const el = document.getElementById("status-toast");
    el.textContent = msg;
    el.className = `toast ${warn ? "warn" : ""}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add("hidden"), ms);
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    document.getElementById("btn-refresh").textContent = "…";
    try {
      const { storms: fresh, errors } = await StormData.fetchActiveStorms();
      const badge = document.getElementById("live-badge");

      if (!fresh.length && errors.length >= 2) {
        // Cả hai nguồn đều lỗi -> dữ liệu mẫu để minh hoạ giao diện
        storms = StormData.demoStorms();
        badge.classList.add("stale");
        badge.innerHTML = `<span class="live-dot"></span> DEMO`;
        toast("⚠️ Không kết nối được nguồn dữ liệu — đang hiển thị dữ liệu mẫu.", true, 8000);
      } else {
        // Giữ lại track đã tải cho các cơn bão cũ
        const oldTracks = new Map(storms.map((s) => [s.id, s.track]));
        for (const s of fresh) s.track = oldTracks.get(s.id) || null;
        storms = fresh;
        badge.classList.remove("stale");
        badge.innerHTML = `<span class="live-dot"></span> LIVE`;
        if (errors.length) toast(`⚠️ Một nguồn dữ liệu bị lỗi (${errors[0]})`, true);
      }

      renderList();
      redrawAll();
      // Tải trước đường đi của vài cơn bão mạnh nhất
      storms.slice(0, 5).forEach(loadTrackFor);

      document.getElementById("last-update").textContent =
        "Cập nhật: " + new Date().toLocaleTimeString("vi-VN", { hour12: false });
    } catch (e) {
      toast("Lỗi tải dữ liệu: " + e.message, true);
    } finally {
      refreshing = false;
      nextRefreshAt = Date.now() + REFRESH_MS;
      document.getElementById("btn-refresh").textContent = "⟳";
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

  let autoRotate = true;
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

  /* ================= 8. Điều khiển UI ================= */

  // 3D / 2.5D / 2D
  document.querySelectorAll("#view-mode button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#view-mode button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.dataset.mode;
      if (mode === "3d") scene.morphTo3D(1.2);
      else if (mode === "2.5d") scene.morphToColumbusView(1.2);
      else scene.morphTo2D(1.2);
    });
  });

  document.getElementById("btn-rotate").addEventListener("click", (e) => {
    autoRotate = !autoRotate;
    e.currentTarget.classList.toggle("active", autoRotate);
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
  document.getElementById("ovl-ref").addEventListener("change", (e) => setOverlay("ref", e.target.checked));
  document.getElementById("ovl-labels").addEventListener("change", (e) => setOverlay("labels", e.target.checked));
  document.getElementById("ovl-cones").addEventListener("change", redrawAll);
  document.getElementById("ovl-tracks").addEventListener("change", redrawAll);
  document.getElementById("brightness").addEventListener("input", (e) => {
    if (layerState.base) layerState.base.brightness = Number(e.target.value);
  });

  document.getElementById("btn-refresh").addEventListener("click", refresh);

  /* ================= Khởi động ================= */
  refresh();
})();
