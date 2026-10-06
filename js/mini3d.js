// mini3d: kleiner WebGL-Renderer für Low-Poly-Szenen im Cartoon-Stil.
// Flat-Shading mit Toon-Stufen, Kantenlinien, einfache Schatten auf dem Boden, Orbit-Kamera, Tweens.
// Koordinaten: y zeigt nach oben, 1 Einheit = 1 Meter.

export const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t,
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

// ---------- Matrizen (spaltenweise, wie WebGL) ----------
const mul = (a, b) => {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
const persp = (fovy, asp, n, f) => {
  const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
  return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0];
};
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lookAt = (e, c, up) => {
  const z = norm3(sub3(e, c)), x = norm3(cross3(up, z)), y = cross3(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot3(x, e), -dot3(y, e), -dot3(z, e), 1];
};
// Drehung R = Ry * Rx * Rz, danach Skalierung, dann Verschiebung
const trs = (p, r, s) => {
  const cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
  const R00 = cy * cz + sy * sx * sz, R01 = -cy * sz + sy * sx * cz, R02 = sy * cx;
  const R10 = cx * sz, R11 = cx * cz, R12 = -sx;
  const R20 = -sy * cz + cy * sx * sz, R21 = sy * sz + cy * sx * cz, R22 = cy * cx;
  return [R00 * s[0], R10 * s[0], R20 * s[0], 0, R01 * s[1], R11 * s[1], R21 * s[1], 0, R02 * s[2], R12 * s[2], R22 * s[2], 0, p[0], p[1], p[2], 1];
};
const normalMat = (m) => {
  const A00 = m[0], A01 = m[4], A02 = m[8], A10 = m[1], A11 = m[5], A12 = m[9], A20 = m[2], A21 = m[6], A22 = m[10];
  const C00 = A11 * A22 - A12 * A21, C01 = -(A10 * A22 - A12 * A20), C02 = A10 * A21 - A11 * A20;
  const C10 = -(A01 * A22 - A02 * A21), C11 = A00 * A22 - A02 * A20, C12 = -(A00 * A21 - A01 * A20);
  const C20 = A01 * A12 - A02 * A11, C21 = -(A00 * A12 - A02 * A10), C22 = A00 * A11 - A01 * A10;
  const det = A00 * C00 + A01 * C01 + A02 * C02 || 1;
  const d = 1 / det;
  return [C00 * d, C10 * d, C20 * d, C01 * d, C11 * d, C21 * d, C02 * d, C12 * d, C22 * d];
};

// ---------- Geometrie ----------
class Builder {
  constructor() { this.tris = []; }
  tri(a, b, c) {
    let n = cross3(sub3(b, a), sub3(c, a));
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-9) return;
    this.tris.push([a, b, c, [n[0] / l, n[1] / l, n[2] / l]]);
  }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  // Für konvexe Körper: Dreiecke so drehen, dass die Normalen vom Mittelpunkt weg zeigen
  fixWinding() {
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const t of this.tris) for (let i = 0; i < 3; i++) { cx += t[i][0]; cy += t[i][1]; cz += t[i][2]; n++; }
    const c = [cx / n, cy / n, cz / n];
    this.tris = this.tris.map(([a, b, d, nn]) => {
      const mid = [(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3];
      return dot3(nn, sub3(mid, c)) < 0 ? [a, d, b, [-nn[0], -nn[1], -nn[2]]] : [a, b, d, nn];
    });
  }
  build() {
    const pos = [], nor = [];
    const key = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000) + ',' + Math.round(p[2] * 1000);
    const edges = new Map();
    let minY = Infinity, maxY = -Infinity;
    for (const [a, b, c, n] of this.tris) {
      for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); }
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const kp = key(p), kq = key(q);
        const k = kp < kq ? kp + '|' + kq : kq + '|' + kp;
        let e = edges.get(k);
        if (!e) { e = { p, q, n: [] }; edges.set(k, e); }
        e.n.push(n);
      }
    }
    const lines = [];
    for (const e of edges.values()) {
      let hard = e.n.length === 1;
      if (!hard) for (let i = 1; i < e.n.length; i++) if (dot3(e.n[0], e.n[i]) < 0.96) hard = true;
      if (hard) lines.push(e.p[0], e.p[1], e.p[2], e.q[0], e.q[1], e.q[2]);
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), lines: new Float32Array(lines), count: pos.length / 3, lineCount: lines.length / 3 };
  }
}

function earClip(poly) {
  // einfache Ohrenzerlegung für einfache Polygone, gibt Index-Tripel zurück
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1]; }
  const idx = [...Array(n).keys()];
  if (area < 0) idx.reverse();
  const out = [];
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => cr(a, b, p) >= 0 && cr(b, c, p) >= 0 && cr(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 1000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = poly[idx[(i + idx.length - 1) % idx.length]], b = poly[idx[i]], c = poly[idx[(i + 1) % idx.length]];
      if (cr(a, b, c) <= 1e-9) continue;
      let ok = true;
      for (const k of idx) { const p = poly[k]; if (p === a || p === b || p === c) continue; if (inTri(p, a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push([idx[(i + idx.length - 1) % idx.length], idx[i], idx[(i + 1) % idx.length]]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

export const G = {
  box(w, h, d) {
    const x = w / 2, y = h / 2, z = d / 2, b = new Builder();
    b.quad([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]);
    b.quad([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]);
    b.quad([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]);
    b.quad([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]);
    b.quad([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]);
    b.quad([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]);
    return b.build();
  },
  // Zylinder / Kegelstumpf entlang y, rt = Radius oben, rb = unten
  cyl(rt, rb, h, seg = 8) {
    const b = new Builder(), y = h / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const b0 = [rb * Math.cos(a0), -y, rb * Math.sin(a0)], b1 = [rb * Math.cos(a1), -y, rb * Math.sin(a1)];
      const t0 = [rt * Math.cos(a0), y, rt * Math.sin(a0)], t1 = [rt * Math.cos(a1), y, rt * Math.sin(a1)];
      b.quad(b1, b0, t0, t1);
      if (rt > 0) b.tri([0, y, 0], t1, t0);
      if (rb > 0) b.tri([0, -y, 0], b0, b1);
    }
    return b.build();
  },
  sphere(r, seg = 8, rings = 5) {
    const b = new Builder();
    const P = (a, f) => [r * Math.sin(f) * Math.cos(a), r * Math.cos(f), r * Math.sin(f) * Math.sin(a)];
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const f0 = (j / rings) * Math.PI, f1 = ((j + 1) / rings) * Math.PI;
      b.quad(P(a0, f0), P(a1, f0), P(a1, f1), P(a0, f1));
    }
    return b.build();
  },
  // Prisma aus einem Polygon: poly = [[u,v],...], Tiefe depth, map(u,v,w) -> [x,y,z]. Funktioniert auch für konkave Polygone.
  extrude(poly, depth, map) {
    const b = new Builder(), h = depth / 2;
    let area = 0;
    for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1]; }
    const P = area < 0 ? poly.slice().reverse() : poly;
    const o = map(0, 0, 0), ax = sub3(map(0, 0, 1), o);
    const face = (a, c, d, want) => { const n = cross3(sub3(c, a), sub3(d, a)); if (dot3(n, want) < 0) b.tri(a, d, c); else b.tri(a, c, d); };
    for (const [i, j, k] of earClip(P)) {
      face(map(...P[i], h), map(...P[j], h), map(...P[k], h), ax);
      face(map(...P[i], -h), map(...P[j], -h), map(...P[k], -h), [-ax[0], -ax[1], -ax[2]]);
    }
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length];
      const out = sub3(map(q[1] - p[1], -(q[0] - p[0]), 0), o);
      const a = map(...p, -h), c = map(...q, -h), d = map(...q, h), e = map(...p, h);
      face(a, c, d, out); face(a, d, e, out);
    }
    return b.build();
  },
  // Kegelstumpf-Quader: unten w0×d0, oben w1×d1 (oben um ox/oz versetzt)
  frustum(w0, d0, w1, d1, h, ox = 0, oz = 0) {
    const y = h / 2, b = new Builder();
    const B = [[-w0 / 2, -y, -d0 / 2], [w0 / 2, -y, -d0 / 2], [w0 / 2, -y, d0 / 2], [-w0 / 2, -y, d0 / 2]];
    const T = [[ox - w1 / 2, y, oz - d1 / 2], [ox + w1 / 2, y, oz - d1 / 2], [ox + w1 / 2, y, oz + d1 / 2], [ox - w1 / 2, y, oz + d1 / 2]];
    b.quad(B[3], B[2], T[2], T[3]); b.quad(B[1], B[0], T[0], T[1]); b.quad(B[2], B[1], T[1], T[2]); b.quad(B[0], B[3], T[3], T[0]);
    b.quad(T[3], T[2], T[1], T[0]); b.quad(B[0], B[1], B[2], B[3]);
    b.fixWinding();
    return b.build();
  },
  // Quader mit abgeschrägten senkrechten Kanten (weichere Karosserie)
  octa(w, h, d, ch) {
    const x = w / 2, z = d / 2, c = Math.min(ch, x * 0.9, z * 0.9);
    const poly = [[-x + c, -z], [x - c, -z], [x, -z + c], [x, z - c], [x - c, z], [-x + c, z], [-x, z - c], [-x, -z + c]];
    return G.extrude(poly, h, (u, v, w2) => [u, w2, v]);
  },
  // Dreiecksliste frei: tris = [[a,b,c],...] mit Punkten [x,y,z]
  tris(list, fix = true) {
    const b = new Builder();
    for (const [a, c, d] of list) b.tri(a, c, d);
    if (fix) b.fixWinding();
    return b.build();
  },
};

// ---------- Szenenknoten ----------
export class Node {
  constructor(geo = null, o = {}) {
    this.geo = geo;
    this.color = o.color || [1, 1, 1];
    this.alpha = o.alpha ?? 1;
    this.emissive = o.emissive ?? 0;
    this.unlit = !!o.unlit;
    this.outline = o.outline ?? false;
    this.double = !!o.double;
    this.edge = o.edge || null;
    this.shadow = !!o.shadow;
    this.name = o.name || '';
    this.pos = [0, 0, 0];
    this.rot = [0, 0, 0];
    this.scale = [1, 1, 1];
    this.opacity = 1;
    this.visible = true;
    this.children = [];
    this.parent = null;
  }
  add(...nodes) { for (const n of nodes.flat()) { if (!n) continue; n.parent = this; this.children.push(n); } return this; }
  remove(n) { const i = this.children.indexOf(n); if (i >= 0) { this.children.splice(i, 1); n.parent = null; } }
  at(x, y, z) { this.pos[0] = x; this.pos[1] = y; this.pos[2] = z; return this; }
  rotate(x, y, z) { this.rot[0] = x; this.rot[1] = y; this.rot[2] = z; return this; }
  size(x, y = x, z = x) { this.scale[0] = x; this.scale[1] = y; this.scale[2] = z; return this; }
}

// ---------- Shader ----------
const VS = `
attribute vec3 aPos; attribute vec3 aNormal;
uniform mat4 uVP; uniform mat4 uModel; uniform mat3 uNormalMat;
varying vec3 vN; varying vec3 vW;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = uNormalMat * aNormal; gl_Position = uVP * w; }`;
const FS = `
precision mediump float;
uniform vec3 uColor; uniform float uAlpha; uniform float uEmissive; uniform float uUnlit; uniform vec3 uSun;
varying vec3 vN; varying vec3 vW;
void main(){
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float key = clamp(dot(n, uSun), 0.0, 1.0);
  key = smoothstep(0.0, 0.85, key);
  vec3 shade = mix(vec3(0.70, 0.76, 0.96), vec3(1.20, 1.11, 0.98), key);
  float side = 1.0 - abs(n.y);
  float ao = mix(1.0, mix(0.70, 1.0, smoothstep(-0.3, 2.6, vW.y)), side);
  vec3 lit = uColor * shade * (0.86 + 0.14 * n.y) * ao;
  vec3 col = mix(lit, uColor, uUnlit);
  col = mix(col, vec3(1.0, 0.93, 0.7), uEmissive * 0.55) + uColor * uEmissive * 0.45;
  gl_FragColor = vec4(col, uAlpha);
}`;
const BG_VS = 'attribute vec2 aP; varying float vY; void main(){ vY = aP.y * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }';
const BG_FS = 'precision mediump float; uniform vec3 uTop; uniform vec3 uBot; varying float vY; void main(){ gl_FragColor = vec4(mix(uBot, uTop, vY), 1.0); }';

function program(gl, vs, fs) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// ---------- Engine ----------
export class Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, stencil: true, preserveDrawingBuffer: !!opts.preserve }) || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL nicht verfügbar');
    this.gl = gl;
    this.prog = program(gl, VS, FS);
    this.loc = {};
    for (const n of ['uVP', 'uModel', 'uNormalMat', 'uColor', 'uAlpha', 'uEmissive', 'uUnlit', 'uSun']) this.loc[n] = gl.getUniformLocation(this.prog, n);
    this.aPos = gl.getAttribLocation(this.prog, 'aPos');
    this.aNormal = gl.getAttribLocation(this.prog, 'aNormal');
    this.bg = program(gl, BG_VS, BG_FS);
    this.bgBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bgBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.root = new Node();
    this.sun = norm3([0.38, 0.78, 0.5]);
    this.shadowColor = [0.08, 0.18, 0.32];
    this.skyTop = hex(0x2f6fdc);
    this.skyBot = hex(0x8fd0fa);
    this.showShadows = true;
    // Kamera
    this.cam = { az: 0.55, el: 0.5, r: 38, target: [0, 2.5, 2], fov: 0.72 };
    this.camGoal = null;
    this.autoRotate = 0;
    this.timeScale = 1;
    this._tweens = [];
    this._frameCbs = new Set();
    this._last = 0;
    this.running = false;
    this.dirty = true;
    this._bindControls();
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    this._ro?.observe(canvas);
    this.resize();
  }

  resize() {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.dirty = true;
  }

  // ----- Steuerung -----
  _bindControls() {
    const c = this.canvas, ptrs = new Map();
    let lastDist = 0, lastMid = null;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); this.camGoal = null; this.autoRotate = 0; this.userMoved = true; });
    const end = (e) => { ptrs.delete(e.pointerId); lastDist = 0; lastMid = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId);
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) {
        this.cam.az -= dx * 0.0065;
        this.cam.el = clamp(this.cam.el + dy * 0.005, 0.05, 1.52);
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (lastDist) this.cam.r = clamp(this.cam.r * (lastDist / dist), 6, 110);
        if (lastMid) this._pan(mid[0] - lastMid[0], mid[1] - lastMid[1]);
        lastDist = dist; lastMid = mid;
      }
      this.dirty = true;
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.r = clamp(this.cam.r * Math.exp(e.deltaY * 0.0012), 6, 110); this.camGoal = null; this.dirty = true; }, { passive: false });
  }
  _pan(dx, dy) {
    const k = this.cam.r * 0.0016, c = this.cam;
    const rx = [Math.cos(c.az), 0, -Math.sin(c.az)];
    c.target[0] -= rx[0] * dx * k; c.target[2] -= rx[2] * dx * k;
    c.target[1] = clamp(c.target[1] + dy * k, -3, 14);
  }
  eye() {
    const c = this.cam;
    return [c.target[0] + c.r * Math.cos(c.el) * Math.sin(c.az), c.target[1] + c.r * Math.sin(c.el), c.target[2] + c.r * Math.cos(c.el) * Math.cos(c.az)];
  }
  // Kamera sanft zu einem Ziel bewegen
  flyTo(goal, ms = 1200) {
    const from = { az: this.cam.az, el: this.cam.el, r: this.cam.r, target: [...this.cam.target] };
    const to = { az: goal.az ?? from.az, el: goal.el ?? from.el, r: goal.r ?? from.r, target: goal.target ? [...goal.target] : from.target };
    // kürzesten Weg für den Azimut wählen
    let d = to.az - from.az; d = Math.atan2(Math.sin(d), Math.cos(d)); to.az = from.az + d;
    const token = {};
    this.camGoal = token;
    return this.tween(ms, (t) => {
      if (this.camGoal !== token) return;
      const e = ease.inOut(t);
      this.cam.az = lerp(from.az, to.az, e); this.cam.el = lerp(from.el, to.el, e); this.cam.r = lerp(from.r, to.r, e);
      for (let i = 0; i < 3; i++) this.cam.target[i] = lerp(from.target[i], to.target[i], e);
    });
  }

  // ----- Zeit, Tweens -----
  tween(ms, fn, easing = ease.linear) {
    return new Promise((resolve) => {
      this._tweens.push({ t: 0, ms: Math.max(1, ms), fn, easing, resolve });
      this.dirty = true;
    });
  }
  wait(ms) { return this.tween(ms, () => {}); }
  onFrame(fn) { this._frameCbs.add(fn); return () => this._frameCbs.delete(fn); }

  _step(dt) {
    dt *= this.timeScale || 1;
    if (this.autoRotate) { this.cam.az += this.autoRotate * dt / 1000; }
    if (this._tweens.length) {
      const list = this._tweens;
      this._tweens = [];
      for (const tw of list) {
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.ms);
        tw.fn(tw.easing(k), k);
        if (k >= 1) tw.resolve(); else this._tweens.push(tw);
      }
      for (const tw of this._tweens) void tw;
    }
    for (const cb of this._frameCbs) cb(dt);
  }
  get busy() { return this._tweens.length > 0; }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(60, now - this._last);
      this._last = now;
      if (!this.canvas.isConnected || this.canvas.clientWidth === 0) return; // nicht sichtbar: Zeit steht still
      this._step(dt);
      this.render();
    };
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }

  // ----- Zeichnen -----
  _upload(geo) {
    const gl = this.gl;
    const mk = (arr) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return b; };
    geo._gl = { pos: mk(geo.pos), nor: mk(geo.nor), lines: geo.lineCount ? mk(geo.lines) : null };
  }
  _collect(node, M, vis, op, sh, out) {
    if (!node.visible || !vis) return;
    const w = mul(M, trs(node.pos, node.rot, node.scale));
    const o = op * node.opacity;
    const s = sh || node.shadow;
    if (node.geo && o > 0.01) out.push({ node, w, a: node.alpha * o, s });
    for (const c of node.children) this._collect(c, w, true, o, s, out);
  }
  render() {
    const gl = this.gl, c = this.canvas;
    gl.viewport(0, 0, c.width, c.height);
    // Hintergrund
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(this.bg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bgBuf);
    const ap = gl.getAttribLocation(this.bg, 'aP');
    gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(gl.getUniformLocation(this.bg, 'uTop'), this.skyTop);
    gl.uniform3fv(gl.getUniformLocation(this.bg, 'uBot'), this.skyBot);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(ap);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    const eye = this.eye();
    const view = lookAt(eye, this.cam.target, [0, 1, 0]);
    const proj = persp(this.cam.fov, c.width / c.height, 1, 400);
    const vp = mul(proj, view);
    const items = [];
    this._collect(this.root, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], true, 1, false, items);

    gl.useProgram(this.prog);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
    gl.uniformMatrix4fv(this.loc.uVP, false, vp);
    gl.uniform3fv(this.loc.uSun, this.sun);
    gl.enableVertexAttribArray(this.aPos); gl.enableVertexAttribArray(this.aNormal);

    const opaque = items.filter((i) => i.a >= 0.995), trans = items.filter((i) => i.a < 0.995);
    for (const it of opaque) this._draw(it, false);
    // Schatten: flach auf den Boden projiziert, per Stencil nur einmal pro Pixel, weich-durchsichtig
    if (this.showShadows) {
      const s = this.sun, k = 0.04, sx = s[0] / s[1], sz = s[2] / s[1];
      const S = [1, 0, 0, 0, -sx, 0, -sz, 0, 0, 0, 1, 0, sx * k, k, sz * k, 1];
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.STENCIL_TEST); gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.stencilFunc(gl.EQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
      gl.depthMask(false);
      gl.uniform1f(this.loc.uUnlit, 1); gl.uniform1f(this.loc.uEmissive, 0); gl.uniform1f(this.loc.uAlpha, 0.30);
      gl.uniform3fv(this.loc.uColor, this.shadowColor);
      for (const it of opaque) if (it.s) this._drawFill(it.node.geo, mul(S, it.w), true);
      gl.depthMask(true); gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    trans.sort((a, b) => (b.w[12] - eye[0]) ** 2 + (b.w[13] - eye[1]) ** 2 + (b.w[14] - eye[2]) ** 2 - ((a.w[12] - eye[0]) ** 2 + (a.w[13] - eye[1]) ** 2 + (a.w[14] - eye[2]) ** 2));
    for (const it of trans) this._draw(it, true);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disableVertexAttribArray(this.aPos); gl.disableVertexAttribArray(this.aNormal);
    this.stats = { nodes: items.length };
  }
  _drawFill(geo, w, flat) {
    const gl = this.gl;
    if (!geo._gl) this._upload(geo);
    gl.uniformMatrix4fv(this.loc.uModel, false, w);
    gl.uniformMatrix3fv(this.loc.uNormalMat, false, flat ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : normalMat(w));
    gl.bindBuffer(gl.ARRAY_BUFFER, geo._gl.pos); gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo._gl.nor); gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, geo.count);
  }
  _draw(it, transparent) {
    const gl = this.gl, n = it.node, geo = n.geo;
    gl.uniform3fv(this.loc.uColor, n.color);
    gl.uniform1f(this.loc.uAlpha, it.a);
    gl.uniform1f(this.loc.uEmissive, n.emissive);
    gl.uniform1f(this.loc.uUnlit, n.unlit ? 1 : 0);
    if (n.double) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
    this._drawFill(geo, it.w, false);
    if (n.outline && geo.lineCount && it.a > 0.05) {
      const e = n.edge || [n.color[0] * 0.38, n.color[1] * 0.38, n.color[2] * 0.4];
      gl.uniform3fv(this.loc.uColor, e);
      gl.uniform1f(this.loc.uUnlit, 1);
      gl.uniform1f(this.loc.uEmissive, 0);
      gl.uniform1f(this.loc.uAlpha, transparent ? Math.min(1, it.a * 1.4) : 1);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindBuffer(gl.ARRAY_BUFFER, geo._gl.lines);
      gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(this.aNormal);
      gl.vertexAttrib3f(this.aNormal, 0, 1, 0);
      gl.drawArrays(gl.LINES, 0, geo.lineCount);
      gl.enableVertexAttribArray(this.aNormal);
      gl.enable(gl.POLYGON_OFFSET_FILL);
    }
  }
  dispose() {
    this.running = false;
    this._ro?.disconnect();
  }
}
