// Small SVG chart helpers (no internet / library needed). Red and white theme.
const Charts = (function () {
  const RED = "#dc2626", PINK = "#fca5a5", DARK = "#0f172a", MUTED = "#64748b", GRID = "#e2e8f0";
  const L = 46, T = 16, W = 544, H = 190;

  function nice(m) {
    if (m <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(m))), f = m / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  function frame(labels, mx, fmt) {
    let s = "";
    for (let k = 0; k <= 4; k++) {
      const y = T + H - (H * k / 4);
      s += '<line x1="' + L + '" x2="' + (L + W) + '" y1="' + y + '" y2="' + y + '" stroke="' + GRID + '"/>' +
           '<text x="' + (L - 6) + '" y="' + (y + 3) + '" font-size="12" text-anchor="end" fill="' + MUTED + '">' + fmt(mx * k / 4) + "</text>";
    }
    const n = labels.length, step = W / n, skip = Math.ceil(n / 12);
    labels.forEach((l, i) => {
      if (i % skip) return;
      s += '<text x="' + (L + i * step + step / 2) + '" y="' + (T + H + 16) + '" font-size="12" text-anchor="middle" fill="' + MUTED + '">' + l + "</text>";
    });
    return s;
  }

  function legend(series) {
    if (series.length < 2) return "";
    return '<div class="chart-legend">' + series.map(s =>
      '<span><i style="background:' + s.color + '"></i>' + s.name + "</span>").join("") + "</div>";
  }

  // series: [{name, values, color}]   opts: {stack, fmt, hi}
  function bar(id, labels, series, opts) {
    const o = opts || {}, fmt = o.fmt || (v => Math.round(v * 10) / 10), el = document.getElementById(id);
    series.forEach((s, i) => { s.color = s.color || [RED, PINK, DARK][i]; });
    const n = labels.length, step = W / n, g = step * 0.72;
    const tot = labels.map((_, i) => o.stack ? series.reduce((a, s) => a + s.values[i], 0)
                                              : Math.max.apply(null, series.map(s => s.values[i])));
    if (Math.max.apply(null, tot) <= 0) {
      el.innerHTML = '<div class="hint">No data yet. Make some bookings (or use "Load sample data") to see this graph.</div>';
      return;
    }
    const mx = nice(Math.max.apply(null, tot)), y = v => T + H - v / mx * H;
    let svg = frame(labels, mx, fmt);
    for (let i = 0; i < n; i++) {
      let base = 0;
      series.forEach((s, si) => {
        const v = s.values[i], bw = o.stack ? g : g / series.length;
        const x = L + i * step + (step - g) / 2 + (o.stack ? 0 : si * bw);
        const top = o.stack ? base + v : v;
        const col = (o.hi === i && si === 0) ? DARK : s.color;
        if (v > 0) svg += '<rect x="' + x + '" y="' + y(top) + '" width="' + (bw - 1) + '" height="' + (v / mx * H) +
                          '" rx="2" fill="' + col + '"><title>' + labels[i] + " - " + s.name + ": " + fmt(v) + "</title></rect>";
        base += v;
      });
      if (n <= 14 && tot[i] > 0) {
        svg += '<text x="' + (L + i * step + step / 2) + '" y="' + (y(tot[i]) - 3) + '" font-size="11" text-anchor="middle" fill="' + DARK + '">' + fmt(tot[i]) + "</text>";
      }
    }
    el.innerHTML = '<svg viewBox="0 0 600 240" width="100%" style="display:block">' + svg + "</svg>" + legend(series);
  }

  // values: [numbers]   opts: {fmt, max}
  function line(id, labels, values, opts) {
    const o = opts || {}, fmt = o.fmt || (v => Math.round(v)), el = document.getElementById(id);
    const dataMax = Math.max.apply(null, values);
    if (dataMax <= 0) { el.innerHTML = '<div class="hint">No data yet.</div>'; return; }
    const mx = o.max || nice(dataMax), n = labels.length, step = W / n;
    const px = i => L + i * step + step / 2, py = v => T + H - Math.min(v, mx) / mx * H;
    const pts = values.map((v, i) => px(i) + "," + py(v)).join(" ");
    let svg = frame(labels, mx, fmt) +
      '<polygon points="' + px(0) + "," + (T + H) + " " + pts + " " + px(n - 1) + "," + (T + H) + '" fill="' + RED + '" opacity=".12"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="' + RED + '" stroke-width="2.5"/>';
    values.forEach((v, i) => {
      svg += '<circle cx="' + px(i) + '" cy="' + py(v) + '" r="3.5" fill="#fff" stroke="' + RED + '" stroke-width="2"><title>' +
             labels[i] + ": " + fmt(v) + "</title></circle>";
    });
    el.innerHTML = '<svg viewBox="0 0 600 240" width="100%" style="display:block">' + svg + "</svg>";
  }

  // parts: [{name, value, color}]  -> ring chart with a centre label
  function donut(id, parts, centre) {
    const el = document.getElementById(id), tot = parts.reduce((a, p) => a + p.value, 0), R = 62, C = 2 * Math.PI * R;
    let off = 0, ring = '<circle cx="80" cy="80" r="' + R + '" fill="none" stroke="' + GRID + '" stroke-width="22"/>';
    if (tot > 0) parts.forEach(p => {
      const len = p.value / tot * C;
      if (len > 0) ring += '<circle cx="80" cy="80" r="' + R + '" fill="none" stroke="' + p.color + '" stroke-width="22" stroke-dasharray="' +
        len + " " + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 80 80)"><title>' + p.name + ": " + p.value + "</title></circle>";
      off += len;
    });
    ring += '<text x="80" y="86" text-anchor="middle" font-size="22" font-weight="700" fill="' + RED + '">' + (centre || "") + "</text>";
    el.innerHTML = '<div class="donut-wrap"><svg viewBox="0 0 160 160" width="170" height="170">' + ring + '</svg><div class="donut-legend">' +
      parts.map(p => '<div><i style="background:' + p.color + '"></i>' + p.name + ": <b>" + p.value + "</b></div>").join("") + "</div></div>";
  }

  return { bar, line, donut };
})();
