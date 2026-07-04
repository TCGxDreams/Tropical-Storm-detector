import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import { categorize } from "../services/storms";

// Keep a local cache for custom canvas icons
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

export default function Globe({
  storms,
  selectedId,
  myLoc,
  baseLayer,
  overlays,
  brightness,
  lighting,
  autoRotate,
  onSelectStorm,
  tourActive,
  onStopTour,
  playbackStorm,
  onStopPlayback,
  viewMode,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const stormSourceRef = useRef(null);
  const locSourceRef = useRef(null);
  const activeLayersRef = useRef({});
  const rotatePausedUntilRef = useRef(0);
  const playbackRef = useRef(null);
  const tourTimerRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  const stormsRef = useRef(storms);
  const autoRotateRef = useRef(autoRotate);
  const onSelectStormRef = useRef(onSelectStorm);
  const hasFlownToLocRef = useRef(myLoc ? true : false);
  const lastFlownIdRef = useRef(null);

  // Sync refs to avoid dependency re-renders in some callbacks
  useEffect(() => {
    selectedIdRef.current = selectedId;
    stormsRef.current = storms;
    autoRotateRef.current = autoRotate;
    onSelectStormRef.current = onSelectStorm;
  }, [selectedId, storms, autoRotate, onSelectStorm]);

  // 1. Initialize Cesium Viewer
  useEffect(() => {
    Cesium.Ion.defaultAccessToken = "";

    const viewer = new Cesium.Viewer(containerRef.current, {
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

    viewerRef.current = viewer;
    const scene = viewer.scene;
    scene.globe.enableLighting = false;
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a1633");
    scene.backgroundColor = Cesium.Color.fromCssColorString("#05080f");
    scene.globe.showGroundAtmosphere = true;
    scene.skyAtmosphere.brightnessShift = 0.15;
    scene.screenSpaceCameraController.minimumZoomDistance = 120000;

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(114, 15, 22000000),
    });

    // Custom Data Sources
    const stormSource = new Cesium.CustomDataSource("storms");
    viewer.dataSources.add(stormSource);
    stormSourceRef.current = stormSource;

    const locSource = new Cesium.CustomDataSource("me");
    viewer.dataSources.add(locSource);
    locSourceRef.current = locSource;

    // Handle Left Click
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((movement) => {
      const picked = scene.pick(movement.position);
      const stormId = picked?.id?.properties?.stormId?.getValue?.();
      if (stormId && onSelectStormRef.current) {
        onSelectStormRef.current(stormId);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Auto Rotation ticker
    const onTick = () => {
      if (autoRotateRef.current && Date.now() > rotatePausedUntilRef.current && scene.mode === Cesium.SceneMode.SCENE3D) {
        viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.0006);
      }
    };
    viewer.clock.onTick.addEventListener(onTick);

    // Pause rotation on user interaction
    const pauseRotation = () => {
      rotatePausedUntilRef.current = Date.now() + 12000;
    };
    scene.canvas.addEventListener("pointerdown", pauseRotation);
    scene.canvas.addEventListener("wheel", pauseRotation, { passive: true });

    return () => {
      scene.canvas.removeEventListener("pointerdown", pauseRotation);
      scene.canvas.removeEventListener("wheel", pauseRotation);
      viewer.clock.onTick.removeEventListener(onTick);
      handler.destroy();
      viewer.destroy();
    };
  }, []);

  // 2. Base layer and overlays logic
  useEffect(() => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;

    const gibsDate = () => {
      const d = new Date(Date.now() - 24 * 3600 * 1000);
      return d.toISOString().slice(0, 10);
    };

    const gibsProvider = (layer, matrixLevel, ext, time) => {
      const timePart = time ? `${time}/` : "";
      return new Cesium.UrlTemplateImageryProvider({
        url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${timePart}GoogleMapsCompatible_Level${matrixLevel}/{z}/{y}/{x}.${ext}`,
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        maximumLevel: matrixLevel,
        credit: "NASA GIBS / EOSDIS",
      });
    };

    const BASE_LAYERS = {
      trueColor:   () => gibsProvider("VIIRS_SNPP_CorrectedReflectance_TrueColor", 9, "jpg", gibsDate()),
      blueMarble:  () => gibsProvider("BlueMarble_ShadedRelief_Bathymetry", 8, "jpeg"),
      nightLights: () => gibsProvider("VIIRS_Black_Marble", 8, "png", "2016-01-01"),
      osm:         () => new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" }),
    };

    const OVERLAY_DEFS = {
      ref:    { alpha: 1,    providers: () => [gibsProvider("Reference_Features_15m", 9, "png")] },
      labels: { alpha: 1,    providers: () => [gibsProvider("Reference_Labels_15m", 9, "png")] },
      clouds: { alpha: 0.55, providers: () => [
        gibsProvider("Himawari_AHI_Band13_Clean_Infrared", 7, "png"),
        gibsProvider("GOES-East_ABI_Band13_Clean_Infrared", 7, "png"),
        gibsProvider("GOES-West_ABI_Band13_Clean_Infrared", 7, "png"),
      ] },
      rain:   { alpha: 0.85, providers: () => [gibsProvider("IMERG_Precipitation_Rate", 6, "png")] },
      sst:    { alpha: 0.65, providers: () => [gibsProvider("GHRSST_MUR_SST", 6, "png", gibsDate())] },
    };

    // a. Update Base Layer
    if (activeLayersRef.current.base) {
      viewer.imageryLayers.remove(activeLayersRef.current.base, true);
    }
    const baseProv = BASE_LAYERS[baseLayer]();
    const newBase = viewer.imageryLayers.addImageryProvider(baseProv);
    viewer.imageryLayers.lowerToBottom(newBase);
    newBase.brightness = brightness;
    activeLayersRef.current.base = newBase;

    // b. Update Overlays
    Object.keys(OVERLAY_DEFS).forEach((key) => {
      const active = overlays[key];
      const current = activeLayersRef.current[key];

      if (active && !current) {
        const def = OVERLAY_DEFS[key];
        activeLayersRef.current[key] = def.providers().map((p) => {
          const l = viewer.imageryLayers.addImageryProvider(p);
          l.alpha = def.alpha;
          return l;
        });
        // Bring borders and labels to top
        for (const k of ["ref", "labels"]) {
          if (activeLayersRef.current[k]) {
            activeLayersRef.current[k].forEach((l) => viewer.imageryLayers.raiseToTop(l));
          }
        }
      } else if (!active && current) {
        current.forEach((l) => viewer.imageryLayers.remove(l, true));
        delete activeLayersRef.current[key];
      }
    });

    // c. Update Lighting
    viewer.scene.globe.enableLighting = lighting;
  }, [baseLayer, overlays, brightness, lighting]);

  // 3. Draw storms, tracks and my location
  useEffect(() => {
    if (!viewerRef.current || !stormSourceRef.current) return;
    const stormSource = stormSourceRef.current;
    
    // Clear previous
    stormSource.entities.removeAll();
    if (playbackRef.current) {
      cancelAnimationFrame(playbackRef.current.raf);
      clearTimeout(playbackRef.current.endTimer);
      playbackRef.current = null;
    }

    const spinProperty = (speed) => {
      return new Cesium.CallbackProperty(
        () => ((performance.now() / 1000) * speed) % (Math.PI * 2), false);
    };

    // Draw active storms
    storms.forEach((storm) => {
      const color = Cesium.Color.fromCssColorString(storm.category.color);
      const pos = Cesium.Cartesian3.fromDegrees(storm.lon, storm.lat);

      // Icon & Label
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

      // Impact Range
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

      // Tracks and Cones
      const t = storm.track;
      if (t) {
        if (overlays.ovl_tracks) {
          t.lines.forEach((line) => {
            const flat = line.flat();
            if (flat.length >= 4) {
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
          });

          t.points.forEach((p) => {
            const c = categorize(p.windKmh).color;
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
          });
        }

        if (overlays.ovl_cones) {
          t.cones.forEach((poly) => {
            const ring = poly[0];
            if (ring && ring.length >= 3) {
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
          });

          t.impacts.forEach((impact) => {
            const col = Cesium.Color.fromCssColorString(impact.color);
            impact.polys.forEach((poly) => {
              const ring = poly[0];
              if (ring && ring.length >= 3) {
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
            });
          });
        }
      }
    });
  }, [storms, overlays.ovl_tracks, overlays.ovl_cones]);

  // 4. Update my location marker
  useEffect(() => {
    if (!viewerRef.current || !locSourceRef.current) return;
    const locSource = locSourceRef.current;
    locSource.entities.removeAll();

    if (myLoc) {
      locSource.entities.add({
        position: Cesium.Cartesian3.fromDegrees(myLoc.lon, myLoc.lat),
        point: {
          pixelSize: 11,
          color: Cesium.Color.fromCssColorString("#3d8bff"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2.5,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: "Bạn",
          font: "600 12px 'Segoe UI', sans-serif",
          fillColor: Cesium.Color.WHITE,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineColor: Cesium.Color.fromCssColorString("#05080f"),
          outlineWidth: 4,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      if (!hasFlownToLocRef.current) {
        hasFlownToLocRef.current = true;
        rotatePausedUntilRef.current = Date.now() + 12000;
        viewerRef.current.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(myLoc.lon, myLoc.lat, 3000000),
          duration: 2.0,
        });
      }
    } else {
      hasFlownToLocRef.current = false;
    }
  }, [myLoc]);

  // 5. Selected Storm camera flight
  useEffect(() => {
    if (!viewerRef.current || !selectedId) {
      lastFlownIdRef.current = null;
      return;
    }
    if (lastFlownIdRef.current === selectedId) return;

    const s = storms.find((x) => x.id === selectedId);
    if (!s) return; // Wait until storm data is loaded in the storms list

    lastFlownIdRef.current = selectedId;
    rotatePausedUntilRef.current = Date.now() + 12000;
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 2200000),
      duration: 1.8,
    });
  }, [selectedId, storms]);

  // 6. Playback logic
  useEffect(() => {
    if (!viewerRef.current || !stormSourceRef.current) return;
    const stormSource = stormSourceRef.current;

    // Clean previous playback
    if (playbackRef.current) {
      cancelAnimationFrame(playbackRef.current.raf);
      clearTimeout(playbackRef.current.endTimer);
      try { stormSource.entities.remove(playbackRef.current.ent); } catch {}
      playbackRef.current = null;
    }

    if (!playbackStorm) return;

    const pts = (playbackStorm.track?.points || [])
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (pts.length < 2) {
      if (onStopPlayback) onStopPlayback();
      return;
    }

    const ent = stormSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pts[0].lon, pts[0].lat),
      billboard: {
        image: hurricaneIcon("#ffffff"),
        width: 36,
        height: 36,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: "",
        font: "600 12px 'Segoe UI', sans-serif",
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineColor: Cesium.Color.fromCssColorString("#05080f"),
        outlineWidth: 4,
        pixelOffset: new Cesium.Cartesian2(0, 30),
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#05080f").withAlpha(0.6),
      },
    });

    const DUR = Math.min(12000, Math.max(5000, pts.length * 900));
    const t0 = performance.now();

    const step = (now) => {
      const prog = Math.min(1, (now - t0) / DUR);
      const f = prog * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(f));
      const frac = f - i;
      const lat = pts[i].lat + (pts[i + 1].lat - pts[i].lat) * frac;
      const lon = pts[i].lon + (pts[i + 1].lon - pts[i].lon) * frac;
      ent.position = Cesium.Cartesian3.fromDegrees(lon, lat);

      const cur = pts[Math.round(f)];
      const d = cur.date ? new Date(cur.date) : null;
      const when = d && !isNaN(d)
        ? d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit" }) : "";
      ent.label.text = `${cur.windKmh || "?"} km/h${when ? "  ·  " + when : ""}`;
      ent.billboard.image = hurricaneIcon(categorize(cur.windKmh || 0).color);

      if (prog < 1) {
        if (playbackRef.current) {
          playbackRef.current.raf = requestAnimationFrame(step);
        }
      } else {
        if (playbackRef.current) {
          playbackRef.current.endTimer = setTimeout(() => {
            if (onStopPlayback) onStopPlayback();
          }, 1500);
        }
      }
    };

    playbackRef.current = {
      ent,
      raf: requestAnimationFrame(step),
      endTimer: 0,
    };

    return () => {
      if (playbackRef.current) {
        cancelAnimationFrame(playbackRef.current.raf);
        clearTimeout(playbackRef.current.endTimer);
        try { stormSource.entities.remove(playbackRef.current.ent); } catch {}
        playbackRef.current = null;
      }
    };
  }, [playbackStorm, onStopPlayback]);

  // 7. Tour mode logic
  useEffect(() => {
    if (!viewerRef.current || !tourActive || !storms.length) {
      clearTimeout(tourTimerRef.current);
      return;
    }

    const viewer = viewerRef.current;
    let i = 0;

    const next = () => {
      if (!tourActive) return;
      if (i >= stormsRef.current.length) {
        if (onStopTour) onStopTour();
        return;
      }
      const s = stormsRef.current[i++];
      if (onSelectStorm) {
        onSelectStorm(s.id);
      }
      rotatePausedUntilRef.current = Date.now() + 8000;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 2000000),
        duration: 2.4,
        complete: () => {
          tourTimerRef.current = setTimeout(next, 2800);
        },
        cancel: () => {
          if (onStopTour) onStopTour();
        },
      });
    };

    next();

    return () => {
      clearTimeout(tourTimerRef.current);
    };
  }, [tourActive, onSelectStorm, onStopTour]);

  // 8. View Mode (3D / 2.5D / 2D) morphing
  useEffect(() => {
    if (!viewerRef.current) return;
    const scene = viewerRef.current.scene;
    const dur = 1.6;

    if (viewMode === "2.5d") {
      scene.morphToColumbusView(dur);
    } else if (viewMode === "2d") {
      scene.morphTo2D(dur);
    } else {
      scene.morphTo3D(dur);
    }
  }, [viewMode]);

  return <div ref={containerRef} id="cesiumContainer" style={{ width: "100%", height: "100%" }} />;
}
