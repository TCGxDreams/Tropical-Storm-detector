/* ============================================================
 * chart.js — Biểu đồ diễn biến sức gió & áp suất (canvas thuần)
 * ============================================================ */

const WIND_COLOR = "#149ab9";
const PRESSURE_COLOR = "#e06040";
const SURFACE = "#0a1020";
const INK = "#e8eefc";
const INK_MUTED = "#8fa3c8";
const GRID = "rgba(143, 163, 200, 0.14)";

function fmtTime(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}h`;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function attachHover(canvas, wrap, data, X, Y, pad, cssH, unit) {
  let tip = wrap.querySelector(".chart-tip");
  let cursor = wrap.querySelector(".chart-cursor");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "chart-tip";
    wrap.appendChild(tip);
    cursor = document.createElement("div");
    cursor.className = "chart-cursor";
    wrap.appendChild(cursor);
  }
  const xs = data.map((p, i) => X(p, i));

  function show(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < xs.length; i++)
      if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    const p = data[best];
    cursor.style.left = xs[best] + "px";
    cursor.style.top = pad.t + "px";
    cursor.style.height = cssH - pad.t - pad.b + "px";
    cursor.style.display = "block";
    tip.innerHTML = `<b>${p.v} ${unit}</b>${isNaN(p.t) ? "" : "<br>" + fmtTime(p.t)}`;
    tip.style.display = "block";
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(xs[best] - tw / 2, 2), canvas.clientWidth - tw - 2) + "px";
    tip.style.top = Math.max(0, Y(p.v) - tip.offsetHeight - 12) + "px";
  }
  function hide() { tip.style.display = "none"; cursor.style.display = "none"; }

  canvas.onmousemove = (e) => show(e.clientX);
  canvas.onmouseleave = hide;
  canvas.ontouchstart = canvas.ontouchmove = (e) => { show(e.touches[0].clientX); e.preventDefault(); };
  canvas.ontouchend = hide;
}

export function drawChart(canvas, points, options = {}) {
  const {
    color = WIND_COLOR,
    gradientTop = 0.20,
    unit = "km/h",
    invertY = false,
    peakMode = "max",
  } = options;

  const data = points
    .map((p) => ({ t: new Date(p.date), v: Math.round(p.value) }))
    .filter((p) => p.v > 0);
  if (data.length < 2) return;

  const wrap = canvas.parentElement;
  wrap.style.position = "relative";
  const cssW = Math.max(220, wrap.clientWidth || 280);
  const cssH = 118;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const pad = { l: 40, r: 12, t: 16, b: 18 };
  const W = cssW - pad.l - pad.r;
  const H = cssH - pad.t - pad.b;

  const vMin = Math.min(...data.map((p) => p.v));
  const vMax = Math.max(...data.map((p) => p.v));

  let yMin, yMax;
  if (invertY) {
    yMin = Math.max(0, Math.floor((vMin - 15) / 10) * 10);
    yMax = Math.ceil((vMax + 15) / 10) * 10;
  } else {
    yMin = 0;
    yMax = Math.max(20, Math.ceil((vMax * 1.15) / 20) * 20);
  }

  const hasTime = data.every((p) => !isNaN(p.t));
  const t0 = hasTime ? data[0].t.getTime() : 0;
  const t1 = hasTime ? data[data.length - 1].t.getTime() : data.length - 1;
  const span = Math.max(1, t1 - t0);

  const X = (p, i) => pad.l + ((hasTime ? p.t.getTime() - t0 : i) / span) * W;
  const Y = (v) => {
    if (invertY) {
      return pad.t + ((v - yMin) / (yMax - yMin)) * H;
    }
    return pad.t + H - ((v - yMin) / (yMax - yMin)) * H;
  };

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.font = "10px 'Segoe UI', sans-serif";

  const rgb = hexToRgb(color);

  ctx.strokeStyle = GRID;
  ctx.fillStyle = INK_MUTED;
  ctx.lineWidth = 1;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const ySteps = invertY
    ? [yMin, Math.round((yMin + yMax) / 2), yMax]
    : [yMin, Math.round((yMax - yMin) / 2), yMax];
  for (const v of ySteps) {
    const y = Y(v);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + W, y);
    ctx.stroke();
    ctx.fillText(String(v), pad.l - 6, y);
  }

  if (hasTime) {
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(fmtTime(data[0].t), pad.l, pad.t + H + 5);
    ctx.textAlign = "right";
    ctx.fillText(fmtTime(data[data.length - 1].t), pad.l + W, pad.t + H + 5);
  }

  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + H);
  grad.addColorStop(0, `rgba(${rgb}, ${gradientTop})`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.beginPath();
  data.forEach((p, i) => (i ? ctx.lineTo(X(p, i), Y(p.v)) : ctx.moveTo(X(p, i), Y(p.v))));
  const baseline = invertY ? Y(yMax) : Y(yMin);
  ctx.lineTo(X(data[data.length - 1], data.length - 1), baseline);
  ctx.lineTo(X(data[0], 0), baseline);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  data.forEach((p, i) => (i ? ctx.lineTo(X(p, i), Y(p.v)) : ctx.moveTo(X(p, i), Y(p.v))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  const peakVal = peakMode === "min" ? vMin : vMax;
  const peakIdx = data.findIndex((p) => p.v === peakVal);
  if (peakIdx >= 0) {
    const px = X(data[peakIdx], peakIdx), py = Y(peakVal);
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = SURFACE;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = "600 11px 'Segoe UI', sans-serif";
    ctx.textBaseline = "bottom";
    ctx.textAlign = px > pad.l + W - 44 ? "right" : "center";
    ctx.fillText(`${peakVal} ${unit}`, px, py - 7);
  }

  attachHover(canvas, wrap, data, X, Y, pad, cssH, unit);
}

export function drawWindChart(canvas, points) {
  const mapped = points.map((p) => ({ date: p.date, value: p.windKmh }));
  drawChart(canvas, mapped, {
    color: WIND_COLOR,
    unit: "km/h",
    invertY: false,
    peakMode: "max",
  });
}

export function drawPressureChart(canvas, points) {
  const mapped = points
    .filter((p) => p.pressure && p.pressure > 0)
    .map((p) => ({ date: p.date, value: p.pressure }));
  drawChart(canvas, mapped, {
    color: PRESSURE_COLOR,
    unit: "mb",
    invertY: true,
    peakMode: "min",
  });
}
