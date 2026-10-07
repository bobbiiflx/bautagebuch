// Handschrift-Notizen: Zeichenfläche für Apple Pencil (Pointer Events mit Druck), Striche bleiben als Vektoren
// editierbar (Undo/Redo, Radierer, Auswahl verschieben, Seiten, Hintergründe inkl. Foto zum Anmerken).
import { h } from './ui.js';
import { icon } from './icons.js';
import * as Store from './store.js';

const PW = 1000, PH = 1414; // logische Seitengröße (A4-Verhältnis), unabhängig von Bildschirm und Zoom
const PAPER = '#fffdf8';
const COLORS = [['#1b1b1f', 'Schwarz'], ['#1d4ed8', 'Blau'], ['#c62828', 'Rot'], ['#2e7d32', 'Grün'], ['#ef6c00', 'Orange']];
const WIDTHS = [[2.2, 'Dünn', 5], [4.5, 'Mittel', 8], [9, 'Dick', 12]];
const pw = (pr) => 0.45 + pr * 0.9; // Druck → Strichbreite
const imgs = new Map(); // Foto-ID → Image

// ---------- Zeichnen ----------
function paintBg(ctx, page, w = PW, hgt = PH) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, hgt);
  ctx.lineWidth = 1.2;
  if (page.bg === 'lined' || page.bg === 'grid') {
    ctx.strokeStyle = '#d3dcea';
    ctx.beginPath();
    const step = page.bg === 'grid' ? 40 : 56;
    for (let y = page.bg === 'grid' ? step : 120; y < hgt; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    if (page.bg === 'grid') for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, hgt); }
    ctx.stroke();
    if (page.bg === 'lined') { ctx.strokeStyle = '#efb3b3'; ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(100, hgt); ctx.stroke(); }
  } else if (page.bg === 'photo' && page.photo) {
    const img = imgs.get(page.photo);
    if (img?.complete && img.naturalWidth) {
      const s = Math.min(w / img.naturalWidth, hgt / img.naturalHeight);
      ctx.drawImage(img, (w - img.naturalWidth * s) / 2, 0, img.naturalWidth * s, img.naturalHeight * s);
    }
  }
}

function paintStroke(ctx, s, dx = 0, dy = 0) {
  const p = s.p;
  if (!p.length) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.t === 'marker') {
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w * 3.4;
    ctx.beginPath();
    ctx.moveTo(p[0][0] + dx, p[0][1] + dy);
    if (p.length === 1) ctx.lineTo(p[0][0] + dx + 0.1, p[0][1] + dy);
    for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i][0] + dx, p[i][1] + dy, (p[i][0] + p[i + 1][0]) / 2 + dx, (p[i][1] + p[i + 1][1]) / 2 + dy);
    if (p.length > 1) ctx.lineTo(p[p.length - 1][0] + dx, p[p.length - 1][1] + dy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  if (p.length === 1) {
    ctx.beginPath();
    ctx.arc(p[0][0] + dx, p[0][1] + dy, (s.w * pw(p[0][2])) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  let mx = p[0][0], my = p[0][1];
  for (let i = 1; i < p.length; i++) {
    const nx = i === p.length - 1 ? p[i][0] : (p[i - 1][0] + p[i][0]) / 2;
    const ny = i === p.length - 1 ? p[i][1] : (p[i - 1][1] + p[i][1]) / 2;
    ctx.lineWidth = s.w * pw((p[i - 1][2] + p[i][2]) / 2);
    ctx.beginPath();
    ctx.moveTo(mx + dx, my + dy);
    ctx.quadraticCurveTo(p[i - 1][0] + dx, p[i - 1][1] + dy, nx + dx, ny + dy);
    ctx.stroke();
    mx = nx; my = ny;
  }
}

const bboxCache = new WeakMap();
function bbox(s) {
  let b = bboxCache.get(s);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of s.p) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
    const m = s.t === 'marker' ? s.w * 1.7 : s.w;
    b = [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
    bboxCache.set(s, b);
  }
  return b;
}
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return x * x + y * y;
}
function hitStroke(s, x, y, r) {
  const b = bbox(s);
  if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) return false;
  const rr = (r + (s.t === 'marker' ? s.w * 1.7 : s.w / 2)) ** 2;
  const p = s.p;
  if (p.length === 1) return (p[0][0] - x) ** 2 + (p[0][1] - y) ** 2 <= rr;
  for (let i = 1; i < p.length; i++) if (segDist2(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) <= rr) return true;
  return false;
}
function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function loadImg(id) {
  if (!id) return Promise.resolve(null);
  if (imgs.has(id)) return new Promise((r) => { const i = imgs.get(id); if (i.complete) r(i); else i.addEventListener('load', () => r(i), { once: true }); });
  return new Promise(async (resolve) => {
    try {
      const url = await Store.blobURL(String(id).startsWith('path:') ? id.slice(5) : Store.photoPaths(id).full);
      if (!url) return resolve(null);
      const img = new Image();
      imgs.set(id, img);
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    } catch { resolve(null); }
  });
}

// Vorschaubild: Seite 1, unten auf den beschriebenen Bereich gekürzt
async function renderPreview(page) {
  if (page.bg === 'photo') await loadImg(page.photo);
  let maxY = 0;
  for (const s of page.strokes) maxY = Math.max(maxY, bbox(s)[3]);
  let hh = Math.min(PH, Math.max(420, maxY + 70));
  const im = page.bg === 'photo' ? imgs.get(page.photo) : null;
  if (im?.naturalWidth) hh = Math.min(PH, Math.max(Math.ceil(im.naturalHeight * Math.min(PW / im.naturalWidth, PH / im.naturalHeight)), maxY + 30));
  else if (page.bg === 'photo') hh = PH;
  const W = String(page.photo || '').startsWith('path:') ? 1600 : 640, k = W / PW;
  const c = document.createElement('canvas');
  c.width = W; c.height = Math.round(hh * k);
  const ctx = c.getContext('2d');
  ctx.scale(k, k);
  paintBg(ctx, page, PW, hh);
  for (const s of page.strokes) paintStroke(ctx, s);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

// ---------- Editor ----------
// openInk({ ref, photoIds }) → Promise<neue ref | null>
export async function openInk({ ref = null, photoIds = [], docBg = null } = {}) {
  return new Promise((resolve) => {
    let doc = { v: 1, pages: [docBg && !ref ? { bg: 'photo', photo: 'path:' + docBg.path, strokes: [] } : { bg: 'lined', photo: null, strokes: [] }] };
    let pi = 0, tool = 'pen', color = COLORS[0][0], width = WIDTHS[1][0], finger = false, zoom = 1, k = 1;
    let live = null, lasso = null, mv = null, erasing = false, penAt = 0, penDown = false;
    let changed = false, ready = false;
    const sel = new Set();
    const hist = new WeakMap();
    const touches = new Map();
    let pinch = null, activeId = null;

    const cur = () => doc.pages[pi];
    const H = (pg = cur()) => { let x = hist.get(pg); if (!x) hist.set(pg, (x = { u: [], r: [] })); return x; };
    const snap = () => { const x = H(); x.u.push(cur().strokes.slice()); if (x.u.length > 100) x.u.shift(); x.r = []; changed = true; };

    const canvas = h('canvas', { class: 'ink-cv', 'aria-label': 'Zeichenfläche' });
    const ctx = canvas.getContext('2d');
    const stage = h('div', { class: 'ink-stage' }, canvas);
    const btn = (name, label, fn, extra = {}) => h('button', { type: 'button', class: 'ink-b', title: label, 'aria-label': label, onclick: fn, ...extra }, icon(name, { size: 22 }));

    // Werkzeuge
    const tools = {};
    const toolBtn = (id, name, label) => (tools[id] = btn(name, label, () => { tool = id; if (id !== 'select') sel.clear(); mark(); repaint(); }));
    const bPen = toolBtn('pen', 'draw', 'Stift');
    const bMark = toolBtn('marker', 'ink_highlighter', 'Textmarker');
    const bEr = toolBtn('eraser', 'ink_eraser', 'Radierer (ganzer Strich)');
    const bSel = toolBtn('select', 'arrow_selector_tool', 'Auswahl: Kreis um Striche ziehen, dann verschieben');
    const bUndo = btn('undo', 'Rückgängig', () => undo());
    const bRedo = btn('redo', 'Wiederholen', () => redo());
    const bDel = btn('delete', 'Auswahl löschen', () => { if (!sel.size) return; snap(); cur().strokes = cur().strokes.filter((s) => !sel.has(s)); sel.clear(); mark(); repaint(); });
    const colorBtns = COLORS.map(([c, n]) => h('button', { type: 'button', class: 'ink-c', title: n, 'aria-label': n, style: { '--c': c }, onclick: () => setColor(c) }));
    const widthBtns = WIDTHS.map(([w, n, d]) => h('button', { type: 'button', class: 'ink-w', title: n, 'aria-label': 'Strichstärke ' + n, onclick: () => { width = w; mark(); } }, h('i', { style: { width: d + 'px', height: d + 'px' } })));
    const bFinger = h('button', { type: 'button', class: 'ink-b', 'aria-label': 'Mit dem Finger zeichnen', title: 'Mit dem Finger zeichnen (sonst nur Stift; Finger verschiebt und zoomt)', onclick: () => { finger = !finger; mark(); } }, icon('touch_app', { size: 22 }));

    const bgSel = h('select', { class: 'ink-sel', 'aria-label': 'Hintergrund', onchange: () => {
      const v = bgSel.value;
      snap();
      if (v.startsWith('photo:')) { cur().bg = 'photo'; cur().photo = v.slice(6); loadImg(cur().photo).then(repaint); } else { cur().bg = v; }
      repaint();
    } },
      h('option', { value: 'lined' }, 'Liniert'), h('option', { value: 'grid' }, 'Kariert'), h('option', { value: 'blank' }, 'Blanko'),
      docBg && h('option', { value: 'photo:path:' + docBg.path }, (docBg.label || 'Dokument') + ' (anmerken)'),
      photoIds.map((id, i) => h('option', { value: 'photo:' + id }, `Foto ${i + 1} (anmerken)`)));
    const pageLbl = h('span', { class: 'ink-pg' });
    const bPrev = btn('chevron_left', 'Vorherige Seite', () => goPage(pi - 1));
    const bNext = btn('chevron_right', 'Nächste Seite', () => goPage(pi + 1));
    const bAdd = btn('add', 'Seite hinzufügen', () => { doc.pages.push({ bg: cur().bg === 'photo' ? 'lined' : cur().bg, photo: null, strokes: [] }); changed = true; goPage(doc.pages.length - 1); });
    const bClear = btn('restart_alt', 'Seite leeren', () => { if (!cur().strokes.length || !confirm('Alle Striche dieser Seite löschen?')) return; snap(); cur().strokes = []; sel.clear(); mark(); repaint(); });
    const bRemove = btn('close', 'Seite entfernen', () => { if (doc.pages.length < 2 || !confirm('Diese Seite entfernen?')) return; doc.pages.splice(pi, 1); changed = true; goPage(Math.max(0, pi - 1)); });
    const bDone = h('button', { type: 'button', class: 'ink-done', onclick: () => save() }, icon('check', { size: 20 }), ' Fertig');
    const bClose = btn('close', 'Schließen', () => close(null));

    const bar = h('div', { class: 'ink-bar' },
      h('div', { class: 'ink-row' },
        h('div', { class: 'ink-g' }, bClose, bUndo, bRedo),
        h('div', { class: 'ink-g' }, bgSel, bFinger),
        h('div', { class: 'ink-g' }, bPrev, pageLbl, bNext, bAdd, bClear, bRemove),
        h('div', { class: 'ink-g grow' }),
        bDone),
      h('div', { class: 'ink-row' },
        h('div', { class: 'ink-g' }, bPen, bMark, bEr, bSel, bDel),
        h('div', { class: 'ink-g' }, colorBtns),
        h('div', { class: 'ink-g' }, widthBtns)));
    const root = h('dialog', { class: 'inkx', 'aria-label': 'Handschrift-Notiz', oncancel: (e) => e.preventDefault() }, bar, stage);

    function mark() {
      for (const [id, b] of Object.entries(tools)) b.classList.toggle('on', id === tool);
      colorBtns.forEach((b, i) => b.classList.toggle('on', COLORS[i][0] === color));
      widthBtns.forEach((b, i) => b.classList.toggle('on', WIDTHS[i][0] === width));
      bFinger.classList.toggle('on', finger);
      const x = H();
      bUndo.disabled = !x.u.length; bRedo.disabled = !x.r.length; bDel.disabled = !sel.size;
      pageLbl.textContent = `${pi + 1} / ${doc.pages.length}`;
      bPrev.disabled = pi === 0; bNext.disabled = pi >= doc.pages.length - 1; bRemove.hidden = doc.pages.length < 2;
      const pg = cur();
      bgSel.value = pg.bg === 'photo' ? 'photo:' + pg.photo : pg.bg;
    }
    function setColor(c) {
      color = c;
      if (tool === 'select' && sel.size) { snap(); const m = new Map(); cur().strokes = cur().strokes.map((s) => { if (!sel.has(s)) return s; const n = { ...s, c }; m.set(s, n); return n; }); sel.clear(); m.forEach((n) => sel.add(n)); repaint(); }
      mark();
    }
    function goPage(n) {
      pi = Math.max(0, Math.min(doc.pages.length - 1, n)); sel.clear(); mark();
      if (cur().bg === 'photo') loadImg(cur().photo).then(repaint);
      repaint();
    }
    function undo() { const x = H(); if (!x.u.length) return; x.r.push(cur().strokes.slice()); cur().strokes = x.u.pop(); sel.clear(); changed = true; mark(); repaint(); }
    function redo() { const x = H(); if (!x.r.length) return; x.u.push(cur().strokes.slice()); cur().strokes = x.r.pop(); sel.clear(); changed = true; mark(); repaint(); }

    // Darstellung
    let raf = 0;
    function repaint() {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; paintAll(); });
    }
    function paintAll() {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      const pg = cur();
      paintBg(ctx, pg);
      for (const s of pg.strokes) sel.has(s) && mv ? paintStroke(ctx, s, mv.dx, mv.dy) : paintStroke(ctx, s);
      if (live) paintStroke(ctx, live);
      if (sel.size) {
        let b = [Infinity, Infinity, -Infinity, -Infinity];
        for (const s of sel) { const q = bbox(s); b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])]; }
        const ox = mv?.dx || 0, oy = mv?.dy || 0;
        ctx.save(); ctx.setLineDash([8, 6]); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(37,99,235,.07)';
        ctx.fillRect(b[0] + ox - 6, b[1] + oy - 6, b[2] - b[0] + 12, b[3] - b[1] + 12);
        ctx.strokeRect(b[0] + ox - 6, b[1] + oy - 6, b[2] - b[0] + 12, b[3] - b[1] + 12);
        ctx.restore();
      }
      if (lasso && lasso.length > 1) {
        ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.beginPath();
        lasso.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke(); ctx.restore();
      }
    }
    function layout() {
      const w = Math.max(240, Math.min(stage.clientWidth - 24, 1100)) * zoom;
      canvas.style.width = w + 'px';
      canvas.style.height = (w * PH) / PW + 'px';
      const dpr = window.devicePixelRatio || 1;
      k = Math.min((w / PW) * dpr, Math.sqrt(12e6 / (PW * PH)));
      canvas.width = Math.round(PW * k); canvas.height = Math.round(PH * k);
      repaint();
    }
    function setZoom(z, cx, cy) {
      z = Math.max(0.6, Math.min(3, z));
      const r = canvas.getBoundingClientRect();
      const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
      zoom = z; layout();
      const r2 = canvas.getBoundingClientRect();
      stage.scrollLeft += r2.left + fx * r2.width - cx;
      stage.scrollTop += r2.top + fy * r2.height - cy;
    }

    // Eingabe
    const pt = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * PW, ((e.clientY - r.top) / r.height) * PH]; };
    const penBusy = () => penDown || performance.now() - penAt < 600;
    const round = (n) => Math.round(n * 10) / 10;
    const pressure = (e) => (e.pointerType === 'touch' ? 0.5 : e.pressure > 0 ? e.pressure : 0.5);

    function eraseAt(x, y) {
      const hitL = cur().strokes.filter((s) => hitStroke(s, x, y, 14));
      if (!hitL.length) return;
      if (!erasing) { snap(); erasing = true; }
      cur().strokes = cur().strokes.filter((s) => !hitL.includes(s));
      repaint();
    }
    function addPoint(e) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of evs.length ? evs : [e]) {
        const [x, y] = pt(ev);
        const last = live.p[live.p.length - 1];
        if (last && Math.abs(last[0] - x) < 0.5 && Math.abs(last[1] - y) < 0.5) continue;
        const pr = last ? last[2] * 0.4 + pressure(ev) * 0.6 : pressure(ev);
        live.p.push([round(x), round(y), Math.round(pr * 100) / 100]);
      }
    }

    function down(e) {
      e.preventDefault();
      if (!ready) return;
      if (e.pointerType === 'pen') { penAt = performance.now(); penDown = true; }
      const draws = e.pointerType !== 'touch' || finger;
      if (!draws) {
        if (penBusy() && e.pointerType === 'touch') return; // Handballen ignorieren
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoom }; }
        try { canvas.setPointerCapture(e.pointerId); } catch { /* egal */ }
        return;
      }
      if (e.pointerType === 'touch' && penBusy()) return;
      if (activeId != null) return;
      activeId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* egal */ }
      const [x, y] = pt(e);
      if (tool === 'pen' || tool === 'marker') {
        live = { t: tool, c: color, w: width, p: [[round(x), round(y), Math.round(pressure(e) * 100) / 100]] };
        repaint();
      } else if (tool === 'eraser') { erasing = false; eraseAt(x, y); }
      else if (tool === 'select') {
        const inside = () => { if (!sel.size) return false; let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const s of sel) { const q = bbox(s); b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])]; } return x > b[0] - 14 && x < b[2] + 14 && y > b[1] - 14 && y < b[3] + 14; };
        if (inside()) mv = { sx: x, sy: y, dx: 0, dy: 0 };
        else { sel.clear(); lasso = [[x, y]]; mark(); }
        repaint();
      }
    }
    function move(e) {
      if (e.pointerType === 'pen') { penAt = performance.now(); }
      if (touches.has(e.pointerId)) {
        e.preventDefault();
        const t = touches.get(e.pointerId);
        if (touches.size === 1) { stage.scrollLeft -= e.clientX - t.x; stage.scrollTop -= e.clientY - t.y; t.x = e.clientX; t.y = e.clientY; }
        else if (pinch) {
          t.x = e.clientX; t.y = e.clientY;
          const [a, b] = [...touches.values()];
          setZoom((pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
        return;
      }
      if (e.pointerId !== activeId) return;
      e.preventDefault();
      if (live) {
        addPoint(e);
        if (live.t === 'marker') repaint();
        else {
          // nur das neue Stück zeichnen
          ctx.setTransform(k, 0, 0, k, 0, 0);
          const n = live.p.length;
          if (n > 1) { const part = { ...live, p: live.p.slice(Math.max(0, n - 3)) }; paintStroke(ctx, part); }
        }
      } else if (tool === 'eraser') { const [x, y] = pt(e); eraseAt(x, y); }
      else if (mv) { const [x, y] = pt(e); mv.dx = x - mv.sx; mv.dy = y - mv.sy; repaint(); }
      else if (lasso) { const [x, y] = pt(e); lasso.push([x, y]); repaint(); }
    }
    function up(e) {
      if (e.pointerType === 'pen') { penAt = performance.now(); penDown = false; }
      if (touches.delete(e.pointerId)) { if (touches.size < 2) pinch = null; return; }
      if (e.pointerId !== activeId) return;
      activeId = null;
      if (live) {
        snap();
        cur().strokes = [...cur().strokes, live];
        live = null;
      } else if (tool === 'eraser') { erasing = false; }
      else if (mv) {
        if (Math.abs(mv.dx) + Math.abs(mv.dy) > 1) {
          snap();
          const m = new Map();
          cur().strokes = cur().strokes.map((s) => { if (!sel.has(s)) return s; const n = { ...s, p: s.p.map(([x, y, q]) => [round(x + mv.dx), round(y + mv.dy), q]) }; m.set(s, n); return n; });
          sel.clear(); m.forEach((n) => sel.add(n));
        }
        mv = null;
      } else if (lasso) {
        const poly = lasso; lasso = null;
        if (poly.length > 3) for (const s of cur().strokes) { const inn = s.p.filter(([x, y]) => inPoly(x, y, poly)).length; if (inn >= s.p.length / 2) sel.add(s); }
      }
      mark(); repaint();
    }
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'pen' && !penDown) penAt = performance.now(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX, e.clientY); } }, { passive: false });

    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 'Escape') close(null);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) bDel.click();
    };
    const ro = new ResizeObserver(() => layout());

    let closed = false;
    function close(result) {
      if (closed) return;
      if (result === null && changed && !confirm('Änderungen verwerfen?')) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      ro.disconnect();
      root.remove();
      document.body.classList.remove('ink-open');
      resolve(result);
    }
    async function save() {
      if (!ready) return;
      const empty = doc.pages.every((p) => !p.strokes.length);
      if (empty && !ref) { close(null); return; }
      if (!changed && ref) { closed = true; document.removeEventListener('keydown', onKey); ro.disconnect(); root.remove(); document.body.classList.remove('ink-open'); resolve(ref); return; }
      bDone.disabled = true; bDone.textContent = 'Speichert …';
      try {
        const png = await renderPreview(doc.pages[0]);
        const data = { v: 1, pages: doc.pages.map((p) => ({ bg: p.bg, photo: p.photo || null, strokes: p.strokes })) };
        const r = await Store.putSketch(ref?.id, data, png);
        changed = false;
        close(r);
      } catch (err) {
        console.error(err);
        bDone.disabled = false; bDone.replaceChildren(icon('check', { size: 20 }), ' Fertig');
        alert('Speichern fehlgeschlagen.');
      }
    }

    document.body.append(root);
    root.showModal();
    document.body.classList.add('ink-open');
    document.addEventListener('keydown', onKey);
    mark();
    layout();
    ro.observe(stage);
    if (ref) {
      stage.classList.add('loading');
      Store.getSketch(ref).then(async (d) => {
        if (!d?.pages?.length) throw new Error('leer');
        doc = d;
        doc.pages.forEach((p) => { p.strokes = p.strokes || []; });
        for (const p of doc.pages) if (p.bg === 'photo') loadImg(p.photo).then(repaint);
        ready = true; stage.classList.remove('loading'); mark(); repaint();
      }).catch(() => { alert('Die Notiz konnte nicht geladen werden (offline?).'); ready = false; closed = false; close(ref); });
    } else { ready = true; if (docBg) loadImg('path:' + docBg.path).then(repaint); }
  });
}

// Vorschau einer gespeicherten Notiz
export function inkThumb(ref, { onClick, onRemove, big = false } = {}) {
  const img = h('img', { alt: 'Handschrift-Notiz', class: 'ink-prev' });
  Store.blobURL(Store.sketchPaths(ref).png).then((u) => (u ? (img.src = u) : img.classList.add('missing'))).catch(() => img.classList.add('missing'));
  return h('div', { class: 'ink-th' + (big ? ' big' : ''), onclick: onClick },
    img,
    h('span', { class: 'ink-tag' }, icon('draw', { size: 14 })),
    onRemove && h('button', { type: 'button', class: 'x', 'aria-label': 'Notiz entfernen', onclick: (e) => { e.stopPropagation(); onRemove(); } }, '×'));
}
