// Schlanke SVG-Diagramme ohne Bibliothek (laufen offline). Farben aus der validierten Standardpalette
// (feste Reihenfolge, nie zyklisch), Beschriftung in Textfarben, Werte per Tipp/Hover als Tooltip, immer mit Legende.
const NS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) n.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
};
const H = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v != null && v !== false) { if (k === 'class') n.className = v; else n.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};
const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const money = (n) => eur0.format(Math.round(Number(n) || 0));
export const short = (n) => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mio. €' : a >= 1000 ? (n / 1000).toLocaleString('de-DE', { maximumFractionDigits: a >= 10000 ? 0 : 1 }) + ' T€' : Math.round(n) + ' €'; };
const pct = (x) => (x * 100).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' %';
export const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }).replace('.', ''); };

// Tooltip für alle Elemente mit data-tip innerhalb eines Containers
function withTip(box) {
  const tip = H('div', { class: 'viz-tip', role: 'status', hidden: true });
  box.append(tip);
  const show = (t, e) => {
    tip.textContent = t.dataset.tip; tip.hidden = false;
    const b = box.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - b.left, 60), b.width - 60);
    tip.style.left = x + 'px'; tip.style.top = Math.max(e.clientY - b.top - 38, 0) + 'px';
  };
  const hit = (e) => e.target.closest?.('[data-tip]');
  box.addEventListener('pointerover', (e) => { const t = hit(e); if (t) show(t, e); });
  box.addEventListener('pointermove', (e) => { const t = hit(e); if (t) show(t, e); else tip.hidden = true; });
  box.addEventListener('pointerdown', (e) => { const t = hit(e); if (t) show(t, e); else tip.hidden = true; });
  box.addEventListener('pointerleave', () => { tip.hidden = true; });
  return box;
}
export const legend = (items) => H('ul', { class: 'viz-legend' }, items.map((i) => H('li', {}, H('span', { class: 'sw', style: `background:${i.color}` }), H('span', { class: 'lt' }, i.label), H('span', { class: 'lv' }, i.text ?? ''))));

// Ring: Anteile (max. 5 Farben + „Weitere“ in Grau)
export function donut(items, centerTop, centerSub) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const R = 62, C = 2 * Math.PI * R, GAP = 2.5;
  const svg = S('svg', { viewBox: '0 0 180 180', class: 'viz-svg donut', role: 'img', 'aria-label': 'Anteile ' + items.map((i) => `${i.label} ${pct(i.value / total)}`).join(', ') });
  let acc = 0;
  svg.append(S('circle', { cx: 90, cy: 90, r: R, fill: 'none', stroke: 'var(--viz-track)', 'stroke-width': 26 }));
  items.forEach((i) => {
    const len = (i.value / total) * C;
    svg.append(S('circle', { cx: 90, cy: 90, r: R, fill: 'none', stroke: i.color, 'stroke-width': 26, 'stroke-dasharray': `${Math.max(0, len - GAP)} ${C}`, 'stroke-dashoffset': -acc, transform: 'rotate(-90 90 90)', 'data-tip': `${i.label}: ${money(i.value)} (${pct(i.value / total)})` }));
    acc += len;
  });
  svg.append(S('text', { x: 90, y: 88, 'text-anchor': 'middle', class: 'viz-big' }, centerTop), S('text', { x: 90, y: 106, 'text-anchor': 'middle', class: 'viz-sub' }, centerSub));
  return withTip(H('div', { class: 'viz-box donut-box' }, svg));
}

// Gestapelter Balken (Anteile an einer Gesamtgröße), 2px Lücke zwischen den Segmenten
export function stackBar(segs, total) {
  const T = total || segs.reduce((s, x) => s + x.value, 0) || 1;
  const svg = S('svg', { viewBox: '0 0 340 26', class: 'viz-svg stack', role: 'img', 'aria-label': segs.map((s) => `${s.label} ${money(s.value)}`).join(', ') });
  svg.append(S('rect', { x: 0, y: 3, width: 340, height: 20, rx: 6, fill: 'var(--viz-track)' }));
  let x = 0;
  segs.forEach((s) => {
    const w = Math.max(0, (s.value / T) * 340);
    if (w <= 0) return;
    svg.append(S('rect', { x, y: 3, width: Math.max(w - 2, 1), height: 20, rx: 4, fill: s.color, 'data-tip': `${s.label}: ${money(s.value)}` }));
    x += w;
  });
  return withTip(H('div', { class: 'viz-box' }, svg));
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

// Säulen je Monat (eine Serie, Spitzenwert beschriftet)
export function monthBars(data, color = 'var(--viz-1)') {
  const W = 340, Ht = 190, L = 40, B = 26, T = 12, n = data.length;
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const bw = (W - L) / n, w = Math.min(34, bw * 0.62);
  const y = (v) => T + (Ht - T - B) * (1 - v / max);
  const svg = S('svg', { viewBox: `0 0 ${W} ${Ht}`, class: 'viz-svg', role: 'img', 'aria-label': 'Ausgaben pro Monat' });
  [0, 0.5, 1].forEach((f) => {
    svg.append(S('line', { x1: L, x2: W, y1: y(max * f), y2: y(max * f), class: 'viz-grid' }), S('text', { x: L - 6, y: y(max * f) + 4, 'text-anchor': 'end', class: 'viz-axis' }, short(max * f)));
  });
  const peak = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  data.forEach((d, i) => {
    const x = L + bw * i + (bw - w) / 2, top = y(d.value), h = Math.max(0, Ht - B - top), r = Math.min(4, h, w / 2);
    if (h > 0) svg.append(S('path', { d: `M${x},${Ht - B} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${Ht - B} Z`, fill: color, 'data-tip': `${d.label}: ${money(d.value)}` }));
    svg.append(S('rect', { x: L + bw * i, y: T, width: bw, height: Ht - T - B, fill: 'transparent', 'data-tip': `${d.label}: ${money(d.value)}` }));
    if (n <= 8 || i % 2 === (n - 1) % 2) svg.append(S('text', { x: L + bw * i + bw / 2, y: Ht - 8, 'text-anchor': 'middle', class: 'viz-axis' }, d.label));
    if (i === peak && d.value > 0) svg.append(S('text', { x: x + w / 2, y: top - 5, 'text-anchor': 'middle', class: 'viz-val' }, short(d.value)));
  });
  return withTip(H('div', { class: 'viz-box' }, svg));
}

// Verlauf (kumuliert) mit gestricheltem Budget als Referenz
export function cumLine(data, budget, color = 'var(--viz-1)') {
  const W = 340, Ht = 190, L = 40, B = 26, T = 14, R = 10, n = data.length;
  const max = niceMax(Math.max(budget || 0, ...data.map((d) => d.value), 1) * 1.05);
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : ((W - L - R) * i) / (n - 1));
  const y = (v) => T + (Ht - T - B) * (1 - v / max);
  const svg = S('svg', { viewBox: `0 0 ${W} ${Ht}`, class: 'viz-svg', role: 'img', 'aria-label': 'Kumulierte Ausgaben im Verlauf' });
  [0, 0.5, 1].forEach((f) => svg.append(S('line', { x1: L, x2: W - R, y1: y(max * f), y2: y(max * f), class: 'viz-grid' }), S('text', { x: L - 6, y: y(max * f) + 4, 'text-anchor': 'end', class: 'viz-axis' }, short(max * f))));
  if (budget) svg.append(S('line', { x1: L, x2: W - R, y1: y(budget), y2: y(budget), class: 'viz-ref' }), S('text', { x: W - R, y: y(budget) - 5, 'text-anchor': 'end', class: 'viz-axis strong' }, 'Budget ' + short(budget)));
  const pts = data.map((d, i) => [x(i), y(d.value)]);
  if (n > 1) svg.append(S('path', { d: `M${pts[0][0]},${Ht - B} ` + pts.map((p) => `L${p[0]},${p[1]}`).join(' ') + ` L${pts[n - 1][0]},${Ht - B} Z`, fill: color, opacity: 0.12 }), S('path', { d: pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  data.forEach((d, i) => {
    svg.append(S('circle', { cx: pts[i][0], cy: pts[i][1], r: 4, fill: color, stroke: 'var(--viz-surface)', 'stroke-width': 2 }), S('circle', { cx: pts[i][0], cy: pts[i][1], r: 16, fill: 'transparent', 'data-tip': `${d.label}: ${money(d.value)} insgesamt` }));
    if (n <= 8 || i % 2 === (n - 1) % 2) svg.append(S('text', { x: pts[i][0], y: Ht - 8, 'text-anchor': 'middle', class: 'viz-axis' }, d.label));
  });
  return withTip(H('div', { class: 'viz-box' }, svg));
}
