// Figuren und Fahrzeuge im Low-Poly-Stil. Alle Fahrzeuge schauen nach +x, Figuren ebenfalls. Fußpunkt bei y = 0.
import { Node, G, hex, lerp, clamp } from './mini3d.js';

const cache = new Map();
const memo = (k, f) => { let v = cache.get(k); if (!v) { v = f(); cache.set(k, v); } return v; };
const f2 = (n) => Number(n).toFixed(3);
export const bx = (w, h, d, c, o = {}) => new Node(memo('b' + [w, h, d].map(f2), () => G.box(w, h, d)), { color: hex(c), ...o });
export const fr = (w0, d0, w1, d1, h, c, o = {}, ox = 0, oz = 0) => new Node(memo('f' + [w0, d0, w1, d1, h, ox, oz].map(f2), () => G.frustum(w0, d0, w1, d1, h, ox, oz)), { color: hex(c), ...o });
export const oc = (w, h, d, ch, c, o = {}) => new Node(memo('o' + [w, h, d, ch].map(f2), () => G.octa(w, h, d, ch)), { color: hex(c), ...o });
export const cy = (rt, rb, h, c, seg = 8, o = {}) => new Node(memo('c' + [rt, rb, h, seg].map(f2), () => G.cyl(rt, rb, h, seg)), { color: hex(c), ...o });
export const sp = (r, c, o = {}, seg = 7, rings = 5) => new Node(memo('s' + [r, seg, rings].map(f2), () => G.sphere(r, seg, rings)), { color: hex(c), ...o });
export const grp = (name = '') => new Node(null, { name });
const prof = (pts, w, c, o = {}) => new Node(G.extrude(pts, w, (u, v, k) => [u, v, k]), { color: hex(c), ...o });

export const faceDir = (n, dx, dz) => { n.rot[1] = Math.atan2(-dz, dx); return n; };

// ---------------------------------------------------------------- Figuren
export const LOOKS = {
  bau: { skin: 0xf0b98d, hair: 0x5a3a25, shirt: 0x3b6fb6, pants: 0x3d4350, vest: 0xff8a1f, helmet: 0xffd23f },
  bauin: { skin: 0xe6a97c, hair: 0x7a3f22, shirt: 0xd2557a, pants: 0x3d4350, vest: 0xffc21f, helmet: 0xffffff, pony: true, glasses: true },
  profi: { skin: 0xb77b57, hair: 0x20201f, shirt: 0x2f9e6a, pants: 0x2f3440, vest: 0xff8a1f, helmet: 0x2f7be0 },
  alt: { skin: 0xf3c7a0, hair: 0xd9d6cc, shirt: 0x8a6d3b, pants: 0x4b4f59, vest: 0xffd23f, helmet: 0xe0553f, glasses: true },
};

export function makeWorker(look = LOOKS.bau) {
  const o = { ...LOOKS.bau, ...look };
  const root = grp('figur');
  const hips = grp('hueften').at(0, 1.02, 0);
  const upper = grp('oberkoerper');
  root.add(hips); hips.add(upper);
  const J = {};
  const leg = (z, key) => {
    const hip = grp().at(0, 0, z);
    hip.add(fr(0.24, 0.24, 0.2, 0.2, 0.5, o.pants).at(0, -0.25, 0));
    const knee = grp().at(0, -0.5, 0);
    knee.add(fr(0.2, 0.2, 0.17, 0.17, 0.46, o.pants).at(0, -0.23, 0));
    knee.add(bx(0.38, 0.15, 0.22, 0x5a3a24).at(0.07, -0.53, 0));
    knee.add(bx(0.2, 0.06, 0.22, 0x2b2e34).at(0.15, -0.6, 0));
    hip.add(knee); hips.add(hip);
    J[key + 'Hip'] = hip; J[key + 'Knee'] = knee;
  };
  leg(-0.12, 'l'); leg(0.12, 'r');
  // Rumpf
  upper.add(fr(0.4, 0.34, 0.56, 0.4, 0.62, o.shirt).at(0, 0.34, 0));
  upper.add(fr(0.43, 0.37, 0.58, 0.42, 0.5, o.vest).at(0, 0.4, 0));
  upper.add(bx(0.07, 0.07, 0.44, 0xe7eef2, { outline: false }).at(0.0, 0.52, 0));
  upper.add(bx(0.07, 0.07, 0.4, 0xe7eef2, { outline: false }).at(0.0, 0.2, 0));
  upper.add(bx(0.42, 0.08, 0.36, 0x3a2c22).at(0, 0.03, 0));
  upper.add(bx(0.1, 0.09, 0.08, 0xc7ced4).at(0.2, 0.03, 0));
  upper.add(bx(0.2, 0.1, 0.2, 0xf4efe6).at(0, 0.74, 0));
  // Kopf
  const head = grp('kopf').at(0, 0.98, 0);
  head.add(sp(0.22, o.skin, {}, 8, 5).at(0, 0, 0).size(0.95, 1.05, 0.92));
  head.add(bx(0.06, 0.07, 0.07, 0x20201f, { outline: false }).at(0.2, 0.04, 0.08), bx(0.06, 0.07, 0.07, 0x20201f, { outline: false }).at(0.2, 0.04, -0.08));
  head.add(bx(0.07, 0.07, 0.07, o.skin === 0xb77b57 ? 0xa56a47 : 0xe29b78, { outline: false }).at(0.22, -0.03, 0));
  head.add(bx(0.04, 0.03, 0.12, 0xa8573f, { outline: false }).at(0.2, -0.11, 0));
  head.add(sp(0.215, o.hair, {}, 7, 4).at(-0.05, 0.04, 0).size(1.0, 0.92, 1.0));
  if (o.pony) head.add(sp(0.1, o.hair).at(-0.27, -0.04, 0), bx(0.08, 0.2, 0.08, o.hair).at(-0.26, -0.16, 0));
  if (o.glasses) head.add(bx(0.04, 0.07, 0.22, 0x2a2d33, { outline: false }).at(0.22, 0.05, 0), bx(0.05, 0.08, 0.08, 0xcfeaf7, { outline: false }).at(0.23, 0.05, 0.08), bx(0.05, 0.08, 0.08, 0xcfeaf7, { outline: false }).at(0.23, 0.05, -0.08));
  const helmet = grp('helm').at(0, 0.1, 0);
  helmet.add(sp(0.25, o.helmet, {}, 8, 4).size(1.02, 0.7, 1.0), bx(0.18, 0.04, 0.46, o.helmet).at(0.2, -0.06, 0));
  head.add(helmet);
  upper.add(head);
  J.head = head; J.helmet = helmet;
  // Arme
  const arm = (z, key) => {
    const sh = grp().at(0, 0.62, z);
    sh.add(sp(0.1, o.vest).at(0, 0, 0));
    sh.add(fr(0.14, 0.14, 0.12, 0.12, 0.34, o.shirt).at(0, -0.17, 0));
    const el = grp().at(0, -0.34, 0);
    el.add(fr(0.12, 0.12, 0.1, 0.1, 0.3, o.skin).at(0, -0.15, 0));
    el.add(sp(0.075, 0xe8a23a).at(0, -0.33, 0));
    sh.add(el); upper.add(sh);
    J[key + 'Sh'] = sh; J[key + 'El'] = el;
  };
  arm(-0.34, 'l'); arm(0.34, 'r');
  const hold = grp('hand').at(0.45, 0.35, 0); upper.add(hold);
  const w = { root, hips, upper, j: J, hold, look: o, phase: 0 };
  root.w = w;
  setPose(w);
  return w;
}

export function setPose(w, p = {}) {
  const J = w.j;
  J.lHip.rot[2] = p.lLeg ?? 0; J.rHip.rot[2] = p.rLeg ?? 0;
  J.lKnee.rot[2] = p.lKnee ?? 0; J.rKnee.rot[2] = p.rKnee ?? 0;
  J.lSh.rot[2] = p.lArm ?? 0; J.rSh.rot[2] = p.rArm ?? 0;
  J.lEl.rot[2] = p.lEl ?? 0.1; J.rEl.rot[2] = p.rEl ?? 0.1;
  w.upper.rot[2] = p.lean ?? 0;
  J.head.rot[2] = p.nod ?? 0; J.head.rot[1] = p.turn ?? 0;
  w.hips.pos[1] = 1.02 + (p.bob ?? 0);
  w.upper.rot[1] = p.twist ?? 0;
}
export const walkPose = (ph, amp = 1, carry = false) => {
  const s = Math.sin(ph), c = Math.cos(ph);
  const base = {
    lLeg: s * 0.6 * amp, rLeg: -s * 0.6 * amp,
    lKnee: -Math.max(0, -c) * 0.8 * amp, rKnee: -Math.max(0, c) * 0.8 * amp,
    bob: Math.abs(c) * 0.04 * amp, lean: 0.06 * amp,
  };
  if (carry) return { ...base, lArm: 1.0, rArm: 1.0, lEl: 0.9, rEl: 0.9 };
  return { ...base, lArm: -s * 0.5 * amp, rArm: s * 0.5 * amp, lEl: 0.3, rEl: 0.3 };
};
export const POSES = {
  carry: { lArm: 1.05, rArm: 1.05, lEl: 0.9, rEl: 0.9, lean: 0.04 },
  wave: (t) => ({ rArm: 2.7, rEl: 0.5 + Math.sin(t * 9) * 0.4, lArm: 0.1, nod: 0.05 }),
  thumbs: { rArm: 1.4, rEl: 1.5, lArm: 0.1 },
  torch: { rArm: 1.15, rEl: 0.25, lArm: 0.95, lEl: 0.3, lean: 0.32, lLeg: 0.15, rLeg: -0.25, nod: 0.3 },
  point: { rArm: 1.55, rEl: 0.05, lArm: 0.1 },
  push: { lArm: 1.3, rArm: 1.3, lEl: 0.2, rEl: 0.2, lean: 0.25 },
  idle: {},
};

// ---------------------------------------------------------------- Fahrzeuge
export const wheel = (r = 0.45, wd = 0.34) => {
  const g = grp('rad');
  g.add(cy(r, r, wd, 0x2b2e34, 10).rotate(Math.PI / 2, 0, 0));
  g.add(cy(r * 0.55, r * 0.55, wd + 0.04, 0xd5dce2, 8).rotate(Math.PI / 2, 0, 0));
  g.add(cy(r * 0.2, r * 0.2, wd + 0.07, 0x8c949c, 6).rotate(Math.PI / 2, 0, 0));
  return g;
};
const streaks = (g, x, y, w, h, tilt, z = 0) => {
  const gl = { outline: false, unlit: true, alpha: 0.4 };
  const p = grp('streifen').at(x, y, z); p.rot[2] = tilt;
  p.add(bx(0.02, h * 0.9, 0.09, 0xffffff, gl).at(0.005, 0, -w * 0.18).rotate(0, 0, 0.28), bx(0.02, h * 0.75, 0.05, 0xffffff, gl).at(0.005, 0, -w * 0.05).rotate(0, 0, 0.28));
  g.add(p);
};
const lamp = (g, x, y, z, s = 1, c = 0xfff0a0) => g.add(bx(0.08, 0.2 * s, 0.3 * s, c, { emissive: 0.6, outline: false }).at(x, y, z));
const plate = (g, x, y, rear = false) => g.add(bx(0.04, 0.17, 0.5, 0xf5f2e6, { outline: false }).at(x, y, 0), bx(0.05, 0.05, 0.3, 0x3a5fa0, { outline: false }).at(x + (rear ? -0.005 : 0.005), y, 0));

// Fahrerhaus (Frontlenker) für LKW; Vorderkante bei x = +0.95, Breite 2.3
function truckCab(c1 = 0xf4f1ea, c2 = 0xe0553f) {
  const g = grp('fahrerhaus');
  g.add(oc(1.9, 1.5, 2.3, 0.25, c1, { shadow: true }).at(0, 1.55, 0));          // unterer Aufbau
  g.add(oc(1.7, 1.0, 2.2, 0.3, c1, { shadow: true }).at(-0.05, 2.7, 0));        // Kabinendach
  g.add(bx(0.06, 0.95, 1.95, 0x28384f, { outline: false }).at(0.84, 2.62, 0));  // Frontscheibe
  streaks(g, 0.88, 2.62, 1.95, 0.95, 0, 0);
  for (const z of [-1.13, 1.13]) g.add(bx(0.9, 0.7, 0.05, 0x28384f, { outline: false }).at(0.15, 2.65, z), bx(0.05, 0.6, 0.5, 0x28384f, { outline: false }).at(-0.5, 2.62, z));
  g.add(bx(0.06, 0.55, 1.3, 0x31353b).at(0.97, 1.55, 0));                        // Kühlergrill
  for (let i = 0; i < 4; i++) g.add(bx(0.04, 0.04, 1.2, 0xc7ced4, { outline: false }).at(1.0, 1.4 + i * 0.12, 0));
  lamp(g, 0.97, 1.5, 0.92); lamp(g, 0.97, 1.5, -0.92);
  g.add(bx(0.4, 0.3, 2.35, 0xc7ced4).at(1.0, 0.95, 0));                          // Stoßstange
  plate(g, 1.05, 0.95);
  for (const z of [-1.4, 1.4]) { g.add(bx(0.06, 0.06, 0.28, 0x31353b).at(0.55, 2.5, z * 0.82), bx(0.14, 0.55, 0.1, 0x31353b).at(0.55, 2.5, z)); }
  g.add(bx(1.95, 0.12, 2.35, c2).at(0, 2.0, 0), bx(0.4, 0.12, 0.4, 0xffd23f, { emissive: 0.5 }).at(-0.2, 3.28, 0.5), bx(0.4, 0.12, 0.4, 0xffd23f, { emissive: 0.5 }).at(-0.2, 3.28, -0.5));
  return g;
}

// Absetzkipper mit Container (Container als eigener Knoten, damit er abgesetzt werden kann)
export function makeContainer(color = 0xd9533f) {
  const g = grp('container');
  g.add(bx(4.4, 0.18, 2.1, 0x40454b).at(0, 0.09, 0), bx(4.2, 0.04, 1.9, 0x5a4a44, { outline: false }).at(0, 0.2, 0));
  for (const z of [-1.0, 1.0]) g.add(bx(4.4, 1.35, 0.1, color).at(0, 0.85, z));
  for (const x of [-2.15, 2.15]) g.add(bx(0.1, 1.35, 2.1, color).at(x, 0.85, 0));
  for (let i = 0; i < 6; i++) for (const z of [-1.06, 1.06]) g.add(bx(0.07, 1.25, 0.06, 0xb0402f, { outline: false }).at(-1.9 + i * 0.76, 0.85, z));
  for (const z of [-1.04, 1.04]) g.add(bx(4.5, 0.1, 0.16, 0x40454b).at(0, 1.55, z));
  for (const x of [-2.2, 2.2]) g.add(bx(0.16, 0.1, 2.2, 0x40454b).at(x, 1.55, 0));
  g.add(bx(4.4, 0.04, 0.12, 0xffd23f, { outline: false }).at(0, 1.25, 1.07), bx(4.4, 0.04, 0.12, 0xffd23f, { outline: false }).at(0, 1.25, -1.07));
  return g;
}
export function makeSkipTruck() {
  const g = grp('absetzkipper');
  const cab = truckCab(0xf4f1ea, 0x2f7be0); cab.at(2.9, 0, 0); g.add(cab);
  g.add(bx(6.2, 0.3, 1.3, 0x35383e).at(-0.2, 0.95, 0));
  const wh = [];
  for (const x of [2.9, -1.4, -2.7]) for (const z of [-1.1, 1.1]) { const w = wheel(0.52, 0.36).at(x, 0.52, z); g.add(w); wh.push(w); }
  g.wheels = wh;
  const bed = grp('mulde').at(-3.3, 1.2, 0);
  bed.add(bx(5.6, 0.2, 2.0, 0x4a4f56).at(2.8, 0.1, 0));
  for (const z of [-0.8, 0.8]) bed.add(bx(5.6, 0.12, 0.1, 0xffd23f, { outline: false }).at(2.8, 0.24, z));
  bed.add(bx(0.3, 0.8, 1.6, 0x4a4f56).at(2.2, 0.5, 0), bx(0.18, 0.22, 2.1, 0xffd23f).at(0.0, 0.1, 0));
  g.add(bed);
  g.bed = bed;
  g.pivot = [-3.3, 1.2];
  return g;
}

// Lieferwagen für Fenster: Kasten, hintere Tür öffnet sich, Fenster stehen im Regal
export function makeBoxTruck() {
  const g = grp('lieferwagen');
  const cab = truckCab(0xffffff, 0x2f9e6a); cab.at(2.6, 0, 0); cab.size(0.9, 0.92, 0.95); g.add(cab);
  g.add(bx(6.0, 0.3, 1.3, 0x35383e).at(-0.4, 0.95, 0));
  g.add(oc(5.0, 2.7, 2.35, 0.2, 0xf6f6f2, { shadow: true }).at(-1.1, 2.4, 0));
  g.add(bx(5.02, 0.35, 2.38, 0x2f9e6a).at(-1.1, 1.35, 0), bx(5.02, 0.12, 2.38, 0x2f9e6a).at(-1.1, 3.72, 0));
  for (const z of [-1.19, 1.19]) g.add(bx(2.2, 0.7, 0.04, 0xfbfbf7, { outline: false }).at(-1.2, 2.5, z), bx(0.5, 0.5, 0.05, 0x2f7be0, { outline: false }).at(-0.2, 2.5, z));
  const wh = [];
  for (const x of [2.6, -0.7, -2.0]) for (const z of [-1.12, 1.12]) { const w = wheel(0.52, 0.36).at(x, 0.52, z); g.add(w); wh.push(w); }
  g.wheels = wh;
  // Regal mit Fenstern (sichtbar bei geöffneter Tür)
  const rack = grp('regal').at(-1.1, 0, 0);
  rack.add(bx(4.6, 0.1, 2.0, 0x777d84).at(0, 1.2, 0), bx(0.1, 2.2, 2.0, 0x777d84).at(-2.3, 2.3, 0));
  const frames = [];
  for (let i = 0; i < 8; i++) {
    const f = grp('f').at(-1.8 + i * 0.5, 2.4, 0);
    f.add(bx(0.07, 1.6, 1.5, 0xf8f6f0), bx(0.09, 1.4, 1.3, 0x9fe0f7, { outline: false }));
    rack.add(f); frames.push(f);
  }
  g.add(rack); g.frames = frames;
  const door = grp('tuer').at(-3.62, 0, -1.17);
  door.add(bx(0.08, 2.7, 2.35, 0xf6f6f2).at(0, 2.4, 1.17), bx(0.1, 0.35, 2.38, 0x2f9e6a).at(0, 1.35, 1.17));
  g.add(door); g.door = door;
  g.add(bx(0.2, 0.2, 2.35, 0xc7ced4).at(-3.7, 0.95, 0));
  return g;
}

// Betonmischer (Estrich etc.)
export function makeMixerTruck() {
  const g = grp('mischer');
  const cab = truckCab(0xffffff, 0xff8a1f); cab.at(2.9, 0, 0); g.add(cab);
  g.add(bx(6.6, 0.3, 1.3, 0x35383e).at(-0.4, 0.95, 0));
  const wh = [];
  for (const x of [2.9, -0.8, -2.1]) for (const z of [-1.1, 1.1]) { const w = wheel(0.52, 0.36).at(x, 0.52, z); g.add(w); wh.push(w); }
  g.wheels = wh;
  const drum = grp('trommel').at(-1.0, 2.85, 0);
  const tilt = grp().rotate(0, 0, Math.PI / 2 - 0.3);
  const body = grp('korpus');
  body.add(cy(0.35, 1.25, 1.6, 0xf5f4ef, 12).at(0, -2.2, 0));
  body.add(cy(1.25, 1.25, 2.6, 0xf5f4ef, 12).at(0, -0.4, 0));
  body.add(cy(0.8, 1.25, 1.2, 0xf5f4ef, 12).at(0, 1.5, 0));
  for (let i = 0; i < 5; i++) body.add(cy(1.28 - (i === 0 ? 0.0 : 0), 1.28, 0.22, i % 2 ? 0xffd23f : 0xff8a1f, 12).at(0, -1.6 + i * 0.8, 0));
  tilt.add(body); drum.add(tilt); g.add(drum); g.drum = body;
  g.add(bx(0.1, 2.0, 0.1, 0xc7ced4).at(-3.0, 2.8, 1.35), bx(0.5, 0.06, 0.1, 0xc7ced4).at(-3.0, 3.2, 1.35));
  return g;
}

// Pkw (Limousine) in beliebiger Farbe
export function makeCar(color = 0xe0553f, roof = null) {
  const g = grp('auto');
  const pts = [[-2.05, 0.4], [-2.05, 1.0], [-1.55, 1.08], [-0.85, 1.62], [0.45, 1.62], [1.05, 1.1], [2.0, 1.0], [2.1, 0.7], [2.1, 0.4]];
  g.add(prof(pts, 1.8, color, { shadow: true }));
  g.add(bx(1.3, 0.05, 1.7, roof ?? color).at(-0.2, 1.64, 0));
  g.add(bx(0.06, 0.52, 1.6, 0x28384f, { outline: false }).at(0.95, 1.35, 0).rotate(0, 0, 0.9));
  streaks(g, 0.97, 1.35, 1.5, 0.5, 0.9);
  g.add(bx(0.06, 0.45, 1.5, 0x28384f, { outline: false }).at(-1.18, 1.37, 0).rotate(0, 0, -0.95));
  for (const z of [-0.91, 0.91]) g.add(bx(1.6, 0.42, 0.05, 0x28384f, { outline: false }).at(-0.15, 1.38, z), bx(0.05, 0.4, 0.3, 0x28384f, { outline: false }).at(-0.15, 1.38, z * 1.0));
  lamp(g, 2.1, 0.8, 0.6, 1, 0xfff0a0); lamp(g, 2.1, 0.8, -0.6, 1, 0xfff0a0);
  g.add(bx(0.12, 0.2, 0.3, 0xe0302a, { emissive: 0.4, outline: false }).at(-2.06, 0.82, 0.65), bx(0.12, 0.2, 0.3, 0xe0302a, { emissive: 0.4, outline: false }).at(-2.06, 0.82, -0.65));
  g.add(bx(0.3, 0.22, 1.9, 0xc7ced4).at(2.1, 0.52, 0), bx(0.3, 0.22, 1.9, 0xc7ced4).at(-2.05, 0.52, 0));
  g.add(bx(0.04, 0.3, 0.9, 0x31353b).at(2.12, 0.72, 0));
  plate(g, 2.2, 0.52); plate(g, -2.2, 0.52, true);
  for (const z of [-1.0, 1.0]) g.add(bx(0.14, 0.12, 0.2, color).at(0.9, 1.15, z * 1.05));
  const wh = [];
  for (const x of [1.3, -1.3]) for (const z of [-0.9, 0.9]) { const w = wheel(0.4, 0.3).at(x, 0.4, z); g.add(w); wh.push(w); }
  g.wheels = wh;
  return g;
}

// Handwerker-Transporter
export function makeVan(color = 0xf4f1ea, stripe = 0x2f7be0) {
  const g = grp('transporter');
  const pts = [[-2.4, 0.45], [-2.4, 2.35], [0.6, 2.4], [1.3, 1.6], [2.3, 1.35], [2.4, 0.9], [2.4, 0.45]];
  g.add(prof(pts, 2.0, color, { shadow: true }));
  g.add(bx(0.06, 0.7, 1.75, 0x28384f, { outline: false }).at(1.0, 1.85, 0).rotate(0, 0, 0.62));
  streaks(g, 1.02, 1.85, 1.7, 0.7, 0.62);
  for (const z of [-1.01, 1.01]) g.add(bx(0.9, 0.62, 0.05, 0x28384f, { outline: false }).at(0.5, 1.9, z), bx(4.7, 0.3, 0.05, stripe, { outline: false }).at(-0.1, 1.0, z));
  lamp(g, 2.4, 1.05, 0.7); lamp(g, 2.4, 1.05, -0.7);
  g.add(bx(0.3, 0.25, 2.1, 0xc7ced4).at(2.4, 0.6, 0), bx(0.3, 0.25, 2.1, 0xc7ced4).at(-2.4, 0.6, 0));
  plate(g, 2.5, 0.6); plate(g, -2.55, 0.6, true);
  // Dachträger mit Leiter
  g.add(bx(0.08, 0.1, 1.9, 0x31353b).at(-1.8, 2.5, 0), bx(0.08, 0.1, 1.9, 0x31353b).at(0.0, 2.5, 0));
  for (const z of [-0.5, 0.5]) g.add(bx(3.4, 0.07, 0.07, 0xc7ced4).at(-0.9, 2.62, z));
  for (let i = 0; i < 7; i++) g.add(bx(0.05, 0.05, 1.0, 0xc7ced4).at(-2.4 + i * 0.5, 2.62, 0));
  const wh = [];
  for (const x of [1.4, -1.4]) for (const z of [-0.95, 0.95]) { const w = wheel(0.43, 0.3).at(x, 0.43, z); g.add(w); wh.push(w); }
  g.wheels = wh;
  return g;
}

// ---------------------------------------------------------------- Requisiten
export function makeWindowFrame(w = 1.5, h = 1.4, glass = 0x9fe0f7) {
  const g = grp('fensterrahmen');
  g.add(bx(w, h, 0.14, 0xf8f6f0), bx(w - 0.2, h - 0.2, 0.18, glass, { outline: false }));
  const t = grp(); streaks(t, 0.0, 0, w, h, 0, 0); t.rot[1] = -Math.PI / 2; t.pos[2] = 0.1; g.add(t);
  return g;
}
export function makePanel() {
  const g = grp('modul');
  g.add(bx(1.7, 0.07, 1.05, 0xd9dfe6), bx(1.58, 0.09, 0.93, 0x2a4a9a));
  for (let k = 1; k < 3; k++) g.add(bx(0.015, 0.1, 0.93, 0xa9bbe0, { outline: false }).at(-0.79 + k * 0.527, 0, 0));
  g.add(bx(1.58, 0.1, 0.015, 0xa9bbe0, { outline: false }));
  return g;
}
export const makeCone = () => { const g = grp('hütchen'); g.add(bx(0.4, 0.05, 0.4, 0x2b2e34), cy(0.04, 0.17, 0.55, 0xff7a1f, 8).at(0, 0.32, 0), cy(0.1, 0.12, 0.08, 0xffffff, 8).at(0, 0.3, 0)); return g; };
export const makeTorch = () => { const g = grp('brenner'); g.add(cy(0.03, 0.03, 0.55, 0x8c949c, 6).rotate(0, 0, Math.PI / 2).at(0.25, 0, 0), bx(0.12, 0.1, 0.07, 0xe0553f).at(0.0, 0, 0), sp(0.045, 0x9fd8ff, { emissive: 1, unlit: true }).at(0.55, 0, 0)); return g; };
export const makeBin = (c = 0x6f7a84) => { const g = grp('tonne'); g.add(fr(0.55, 0.65, 0.65, 0.75, 0.95, c).at(0, 0.48, 0), bx(0.7, 0.08, 0.8, c === 0x6f7a84 ? 0x4a5058 : c).at(0, 1.0, 0)); g.add(cy(0.09, 0.09, 0.06, 0x2b2e34, 8).rotate(Math.PI / 2, 0, 0).at(-0.1, 0.3, 0.38)); return g; };

// Roller / Hilfsfunktionen für Räder
export const spinWheels = (veh, dist) => { for (const w of veh.wheels || []) w.rot[2] -= dist / 0.45; };
