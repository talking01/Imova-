// Imova — charts.js : graphiques en SVG (aucune bibliothèque externe). Les couleurs viennent du thème clair/sombre.
const W = 320;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Arrondit le maximum à une valeur « propre » (1, 2, 5, 10, 20, 50...)
function niceMax(v) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function frame(H, max, labels, plotX) {
  const pl = 30, pr = 8, pt = 10, pb = 22;
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = max * t;
    return `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis" x="${pl - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`;
  }).join('');
  const every = Math.ceil(labels.length / 6);
  const xl = labels.map((l, i) => (i % every === 0 ? `<text class="axis" x="${plotX(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>` : '')).join('');
  return { pl, pr, pt, pb, y, grid, xl };
}

export function lineChart({ labels, values, name, height = 170 }) {
  const n = labels.length;
  const max = niceMax(Math.max(0, ...values));
  const plotX = (i) => 30 + (n <= 1 ? 0 : (i * (W - 30 - 8)) / (n - 1));
  const f = frame(height, max, labels, plotX);
  const pts = values.map((v, i) => [plotX(i), f.y(v)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = pts.length ? `${d} L${pts[pts.length - 1][0].toFixed(1)} ${f.y(0).toFixed(1)} L${pts[0][0].toFixed(1)} ${f.y(0).toFixed(1)} Z` : '';
  const total = values.reduce((a, b) => a + b, 0);
  return `<div class="chart"><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(name)} : ${total} au total sur la période, de ${esc(labels[0] || '')} à ${esc(labels[n - 1] || '')}">
    ${f.grid}${f.xl}<path class="area" d="${area}"/><path class="line" d="${d}"/>
    ${pts.map((p, i) => `<circle class="dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3"><title>${esc(labels[i])} : ${values[i]}</title></circle>`).join('')}
  </svg></div>`;
}

export function barChart({ labels, values, name, height = 170, alt = false }) {
  const n = labels.length;
  const max = niceMax(Math.max(0, ...values));
  const slot = (W - 30 - 8) / Math.max(1, n);
  const plotX = (i) => 30 + slot * i + slot / 2;
  const f = frame(height, max, labels, plotX);
  const bw = Math.min(26, slot * 0.62);
  const total = values.reduce((a, b) => a + b, 0);
  return `<div class="chart"><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(name)} : ${total} au total sur la période">
    ${f.grid}${f.xl}
    ${values.map((v, i) => `<rect class="bar ${alt ? 'alt' : ''}" x="${(plotX(i) - bw / 2).toFixed(1)}" y="${f.y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, f.y(0) - f.y(v)).toFixed(1)}" rx="3"><title>${esc(labels[i])} : ${v}</title></rect>`).join('')}
  </svg></div>`;
}
