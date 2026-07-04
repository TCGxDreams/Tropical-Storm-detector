/* ============================================================
 * chart.js — Biểu đồ diễn biến sức gió (canvas thuần, không lib)
 * Một chuỗi dữ liệu, màu #149ab9 (đã kiểm tra tương phản nền tối)
 * ============================================================ */

const StormChart = (() => {
  const LINE = "#149ab9";
  const SURFACE = "#0a1020";
  const INK = "#e8eefc";
  const INK_MUTED = "#8fa3c8";
  const GRID = "rgba(143, 163, 200, 0.14)";

  function fmtTime(d) {
    if (!(d instanceof Date) || isNaN(d)) return "";
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}h`;
  }

  /**
   * Vẽ biểu đồ đường sức gió vào canvas.
   * @param canvas  phần tử <canvas> (cha của nó dùng làm khung tooltip)
   * @param points  [{date, windKmh}] đã sắp theo thời gian
   */
  function draw(canvas, points) {
    const data = points
      .map((p) => ({ t: new Date(p.date), v: Math.round(p.windKmh) }))
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

    const pad = { l: 34, r: 12, t: 16, b: 18 };
    const W = cssW - pad.l - pad.r;
    const H = cssH - pad.t - pad.b;

    const vMax = Math.max(...data.map((p) => p.v));
    const yMax = Math.max(20, Math.ceil((vMax * 1.15) / 20) * 20);
    const hasTime = data.every((p) => !isNaN(p.t));
    const t0 = hasTime ? data[0].t.getTime() : 0;
    const t1 = hasTime ? data[data.length - 1].t.getTime() : data.length - 1;
    const span = Math.max(1, t1 - t0);

    const X = (p, i) => pad.l + ((hasTime ? p.t.getTime() - t0 : i) / span) * W;
    const Y = (v) => pad.t + H - (v / yMax) * H;

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = "10px 'Segoe UI', sans-serif";

    // Lưới ngang recessive + nhãn trục Y (mực chữ mờ, không dùng màu series)
    ctx.strokeStyle = GRID;
    ctx.fillStyle = INK_MUTED;
    ctx.lineWidth = 1;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const v of [0, yMax / 2, yMax]) {
      const y = Y(v);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + W, y);
      ctx.stroke();
      ctx.fillText(String(v), pad.l - 6, y);
    }

    // Nhãn trục X: điểm đầu & cuối
    if (hasTime) {
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText(fmtTime(data[0].t), pad.l, pad.t + H + 5);
      ctx.textAlign = "right";
      ctx.fillText(fmtTime(data[data.length - 1].t), pad.l + W, pad.t + H + 5);
    }

    // Vùng nền mờ dưới đường
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + H);
    grad.addColorStop(0, "rgba(20, 154, 185, 0.20)");
    grad.addColorStop(1, "rgba(20, 154, 185, 0)");
    ctx.beginPath();
    data.forEach((p, i) => (i ? ctx.lineTo(X(p, i), Y(p.v)) : ctx.moveTo(X(p, i), Y(p.v))));
    ctx.lineTo(X(data[data.length - 1], data.length - 1), Y(0));
    ctx.lineTo(X(data[0], 0), Y(0));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Đường chính 2px
    ctx.beginPath();
    data.forEach((p, i) => (i ? ctx.lineTo(X(p, i), Y(p.v)) : ctx.moveTo(X(p, i), Y(p.v))));
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // Điểm đỉnh: marker + nhãn trực tiếp (mực chữ chính)
    const peakIdx = data.findIndex((p) => p.v === vMax);
    const px = X(data[peakIdx], peakIdx), py = Y(vMax);
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = LINE;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = SURFACE;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = "600 11px 'Segoe UI', sans-serif";
    ctx.textBaseline = "bottom";
    ctx.textAlign = px > pad.l + W - 44 ? "right" : "center";
    ctx.fillText(`${vMax} km/h`, px, py - 7);

    attachHover(canvas, wrap, data, X, Y, pad, cssH);
  }

  /* Tooltip + con trỏ dọc khi rê/chạm */
  function attachHover(canvas, wrap, data, X, Y, pad, cssH) {
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
      tip.innerHTML = `<b>${p.v} km/h</b>${isNaN(p.t) ? "" : "<br>" + fmtTime(p.t)}`;
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

  return { draw };
})();
