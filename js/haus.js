// Euer Haus als Low-Poly-Diorama (Grundriss nach Entwurf: "J"/L-Form, Garage östlich, Außentreppe am Westgiebel).
// Jede Bauphase hat einen Zustand, der nur von ihrem eigenen Fortschritt abhängt.
// Koordinaten: x = 7,44 − u (u: West→Ost), z = 7,2 − v (v: Straße→Garten). Straße/Eingang liegt bei +z.
import { Node, G, hex, clamp, lerp } from './mini3d.js';
import { makeBin } from './actors.js';

export const DIM = {
  hw: 7.44, hd: 7.2, t: 0.38,
  kgY: -2.6, egY: 0.6, dgY: 3.3,
  hEG: 2.7, hDG0: 1.0, hDG1: 2.6,
  rise: 1.85, ov: 0.55,
  garW: 5.03, garD: 5.3, garH: 2.9,
};
const X = (u) => 7.44 - u;
const Z = (v) => 7.2 - v;
const PT = (u, v) => [X(u), Z(v)];

const C = {
  grass: 0x7ccb4f, grass2: 0x8fd95f, soil1: 0xa86f46, soil2: 0xdcA24a, rock: 0x6e5b57, sockel: 0xbfc4ca, oldWall: 0xe6d8bc, rawBrick: 0xd9946b,
  insul: 0xf2c94c, plaster: 0xf0dfba, roofOld: 0xc9633b, roofNew: 0x58545e, roofNew2: 0x4c4852, deck: 0xcf9f5e, wood: 0xd3a362, woodD: 0x8a5a36,
  concrete: 0xc3c6c9, asphalt: 0x6c7279, glass: 0x9fe0f7, glassOld: 0xd8ebf0, frameNew: 0xf8f6f0, frameOld: 0x8a5a36, dark: 0x3a3438,
  panel: 0x2a4a9a, panelFrame: 0xd9dfe6, screed: 0xbdbfc2, partOld: 0xdca17a, partNew: 0xf4f1ea, tank: 0xe0553f, pipeB: 0x3f93ea, pipeR: 0xea4d3f,
  fbh: 0xf59a2b, copper: 0xeaaa3c, gable: 0xeadcc0,
};
const PASTELS = [0xbfe9d3, 0xf9d9a6, 0xcfdcf6, 0xf6c6d0, 0xe5f2b0, 0xdccbf2, 0xb9e4ec, 0xf8ea9f];

const geoCache = new Map();
const boxGeo = (w, h, d) => {
  const k = `${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`;
  let g = geoCache.get(k);
  if (!g) { g = G.box(w, h, d); geoCache.set(k, g); }
  return g;
};
const box = (w, h, d, c, o = {}) => new Node(boxGeo(w, h, d), { color: hex(c), ...o });
const grp = (name) => new Node(null, { name });
const cylN = (rt, rb, h, c, seg = 8, o = {}) => new Node(G.cyl(rt, rb, h, seg), { color: hex(c), ...o });
const setCol = (n, c) => { n.color = Array.isArray(c) ? c : hex(c); };
const mixC = (a, b, t) => { const A = hex(a), B = hex(b); return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]; };

// Polygon aus (u,v)-Punkten -> Kanten in Weltkoordinaten
function edgesOf(uv) {
  const pts = uv.map(([u, v]) => PT(u, v));
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
  const sg = area > 0 ? 1 : -1;
  return { pts, edges: pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
    const d = [dx / len, dz / len];
    return { p, q, len, d, out: [sg * d[1], -sg * d[0]] };
  }) };
}
const FOOT = {
  kg: [[0, 0], [14.88, 0], [14.88, 14.38], [8.26, 14.38], [8.26, 10.4], [4.4, 10.4], [4.4, 8.0], [0, 8.0]],
  eg: [[0, 0], [14.88, 0], [14.88, 14.38], [8.26, 14.38], [8.26, 6.4], [4.4, 6.4], [4.4, 8.0], [0, 8.0]],
  dg: [[0, 0], [14.88, 0], [14.88, 14.4], [8.26, 14.4], [8.26, 8.0], [0, 8.0]],
};
const slabGeo = (uv, th) => G.extrude(uv.map(([u, v]) => PT(u, v)), th, (px, pz, w) => [px, w, pz]);

export function buildHouse(engine) {
  const { t } = DIM;
  const root = engine.root;
  const parts = {};
  const dgH = (s) => lerp(DIM.hDG0, DIM.hDG1, s);

  // ---------- Diorama-Insel: Schichten wie im Querschnitt ----------
  const terrain = grp('terrain');
  const prof = (z) => (z <= 11.5 ? 0 : z >= 13 ? -1 : -(z - 11.5) / 1.5);
  const layer = (x0, x1, z0, z1, topOff, botOff, botAbs, color) => {
    const zs = [z0, 11.5, 13, z1].filter((z, i, a) => z >= z0 && z <= z1 && a.indexOf(z) === i).sort((a, b) => a - b);
    const top = zs.map((z) => [z, prof(z) + topOff]);
    const bot = zs.slice().reverse().map((z) => [z, botAbs !== null ? botAbs : prof(z) + botOff]);
    const poly = [...top, ...bot];
    const n = new Node(G.extrude(poly, x1 - x0, (zz, y, w) => [w, y, zz]), { color: hex(color), outline: false });
    n.at((x0 + x1) / 2, 0, 0);
    return n;
  };
  const island = (x0, x1, z0, z1) => {
    terrain.add(
      layer(x0, x1, z0, z1, 0, -0.45, null, C.grass),
      layer(x0, x1, z0, z1, -0.45, 0, -2.5, C.soil1),
      layer(x0, x1, z0, z1, -2.5, 0, -4.6, null === 1 ? 0 : C.soil2),
      layer(x0, x1, z0, z1, -4.6, 0, -6.4, C.rock)
    );
  };
  const IX = 25, Z0 = -22, Z1 = 28;
  const TX0 = X(12.2), TX1 = X(0.5), TCX = (TX0 + TX1) / 2, TW = TX1 - TX0;
  island(-IX, TX0, Z0, Z1);
  island(TX1, IX, Z0, Z1);
  island(TX0, TX1, Z0, DIM.hd);
  island(TX0, TX1, DIM.hd + 2.0, Z1);
  // Lichtgraben vor dem Keller (Betonfutter)
  const gz0 = DIM.hd, gz1 = DIM.hd + 2.0;
  terrain.add(box(TW, 0.2, 2.0, C.concrete).at(TCX, DIM.kgY - 0.1, (gz0 + gz1) / 2));
  terrain.add(box(0.25, 2.6, 2.0, C.concrete).at(TX0 + 0.12, DIM.kgY + 1.3, (gz0 + gz1) / 2));
  terrain.add(box(0.25, 2.6, 2.0, C.concrete).at(TX1 - 0.12, DIM.kgY + 1.3, (gz0 + gz1) / 2));
  terrain.add(box(TW, 2.6, 0.25, C.concrete).at(TCX, DIM.kgY + 1.3, gz1 + 0.12));
  terrain.add(box(TW, 0.1, 0.2, 0x59606a).at(TCX, 0.05, gz1 + 0.05));
  const grid = grp('gitter');
  for (let i = 0; i < 11; i++) grid.add(box(0.07, 0.07, 2.0, 0x59606a).at(TX0 + 0.5 + i * (TW - 1) / 10, 0.02, (gz0 + gz1) / 2));
  terrain.add(grid);
  // Straße und Wendehammer (tiefer als das Grundstück, abschüssig)
  const street = grp('strasse');
  street.add(box(50, 0.16, 6.6, C.asphalt).at(0, -1.0 - 0.02, 16.6));
  street.add(box(50, 0.3, 0.3, 0xcfd2d4).at(0, -0.9, 13.35));
  const turn = cylN(7.2, 7.2, 0.16, C.asphalt, 18).at(5, -1.1, 23.2).rotate(0.06, 0, 0.035);
  street.add(turn);
  street.add(cylN(7.5, 7.5, 0.12, 0xcfd2d4, 18).at(5, -1.18, 23.2).rotate(0.06, 0, 0.035));
  for (let i = 0; i < 6; i++) street.add(box(1.4, 0.02, 0.2, 0xf4f1e8).at(-20 + i * 3.4, -0.9, 16.6));
  terrain.add(street);
  // Pflanzen und Kleinkram
  const pine = (x, z, s = 1) => {
    const g = grp('tanne');
    g.add(cylN(0.28, 0.34, 1.2, 0x7a4f33, 6).at(0, 0.6, 0));
    [[2.0, 1.3, 1.5], [1.6, 1.05, 2.6], [1.2, 0.8, 3.6]].forEach(([r, h, y], i) => g.add(cylN(0.0, r, h * 1.6, [0x2f9e8a, 0x35ad92, 0x42bd98][i], 7, { shadow: true }).at(0, y, 0)));
    g.at(x, 0, z).size(s);
    return g;
  };
  const bush = (x, z, s = 1, c = 0x4fb85a) => new Node(G.sphere(0.8, 6, 4), { color: hex(c), shadow: true }).at(x, 0.35 * s, z).size(s, 0.8 * s, s);
  const rock = (x, z, s = 1) => new Node(G.sphere(0.6, 5, 3), { color: hex(0x6f6a9c) }).at(x, 0.15, z).size(1.3 * s, 0.7 * s, 1 * s);
  terrain.add(pine(-15, -13, 1.5), pine(14, -15, 1.3), pine(19, 2, 1.0), pine(-19, 1, 1.2), pine(13, 9.5, 0.8), pine(-14, 9, 0.9));
  terrain.add(bush(-9.3, 9.8, 1.0), bush(-8.0, 10.6, 0.7), bush(9.5, 10.0, 1.1), bush(10.7, 9.2, 0.7, 0x62c869), bush(0, -10.6, 1.2), bush(-10, -9, 0.9, 0x62c869));
  terrain.add(rock(11, 6, 1), rock(-12, -12, 1.4), rock(5, 13.2, 0.0001));
  const lamp = grp('laterne');
  lamp.add(cylN(0.07, 0.09, 3.4, 0x7a4f33, 6).at(0, 1.7, 0), box(0.9, 0.08, 0.08, 0x7a4f33).at(0.4, 3.35, 0), box(0.3, 0.38, 0.3, 0xffd36a, { emissive: 0.5 }).at(0.85, 3.1, 0));
  lamp.at(-3.5, 0, 12.2);
  terrain.add(lamp);
  const mail = grp('briefkasten'); mail.add(box(0.12, 1.1, 0.12, 0x7a4f33).at(0, 0.55, 0), box(0.5, 0.32, 0.34, 0xe0553f).at(0, 1.2, 0)); mail.at(-1.6, 0, 11.4);
  terrain.add(mail);
  // Gehweg zur Haustür, Hecke, Zaun, Mülltonnen
  for (let i = 0; i < 5; i++) terrain.add(box(1.1, 0.08, 0.7, 0xd8d3c8).at(X(12.9) + (i % 2 ? 0.12 : -0.12), 0.03, gz1 + 0.7 + i * 0.62 + 0.0));
  const hedge = (x0, x1, z) => { for (let x = x0; x < x1; x += 0.95) terrain.add(box(1.0, 0.8 + ((x * 7) % 3) * 0.06, 0.8, 0x4cb458, { shadow: true }).at(x, 0.4, z)); };
  hedge(-3.3, 8.0, 11.0); hedge(-12.5, -6.6, 11.0);
  for (let x = -18; x <= 20; x += 2.6) if (x < -6.4 || x > -3.6) { terrain.add(box(0.12, 0.7, 0.12, 0xc9a46a).at(x, 0.35, 11.5)); }
  const bins = [makeBin(0x6f7a84), makeBin(0xf2c94c), makeBin(0x3f93ea)];
  bins.forEach((b, i) => { b.at(-8.0 - i * 0.9, 0, 6.6); terrain.add(b); });
  root.add(terrain);
  parts.terrain = terrain;
  const innenBase = box(46, 0.3, 44, 0x8fb0cf).at(0, DIM.kgY - 0.45, 0); innenBase.visible = false;
  root.add(innenBase);

  // ---------- Geschosse ----------
  const floors = { kg: grp('kg'), eg: grp('eg'), dg: grp('dg') };
  const geo = {};
  for (const k of Object.keys(floors)) {
    floors[k].shell = grp(k + 'Shell');
    floors[k].inner = grp(k + 'Inner');
    floors[k].add(floors[k].shell, floors[k].inner);
    geo[k] = edgesOf(FOOT[k]);
    root.add(floors[k]);
  }
  // EG-Außenwand mit Eingangsnische (1 m zurückversetzt, vom Obergeschoss/Dach überdeckt)
  const NICHE = { u0: 11.7, u1: 14.1, d: 1.0 };
  const egWallPoly = [[0, 0], [NICHE.u0, 0], [NICHE.u0, NICHE.d], [NICHE.u1, NICHE.d], [NICHE.u1, 0], ...FOOT.eg.slice(1)];
  geo.egW = edgesOf(egWallPoly);
  parts.floors = floors;
  const shadowOn = { kg: false, eg: true, dg: true };

  const wallBox = (e, H, color, lvl) => {
    const L = e.len + t;
    const n = box(L, H, t, color, { shadow: shadowOn[lvl] });
    n.rot[1] = Math.atan2(-e.d[1], e.d[0]);
    n.pos[0] = (e.p[0] + e.q[0]) / 2 - e.out[0] * t / 2;
    n.pos[2] = (e.p[1] + e.q[1]) / 2 - e.out[1] * t / 2;
    return n;
  };
  const kgH = DIM.egY - DIM.kgY;
  for (const e of geo.kg.edges) { const n = wallBox(e, kgH, C.sockel, 'kg'); n.pos[1] = DIM.kgY + kgH / 2; floors.kg.shell.add(n); }
  const egWalls = [], dgWalls = [];
  for (const e of geo.egW.edges) { const n = wallBox(e, DIM.hEG, C.oldWall, 'eg'); n.pos[1] = DIM.egY + DIM.hEG / 2; floors.eg.shell.add(n); egWalls.push(n); }
  for (const e of geo.dg.edges) { const n = wallBox(e, DIM.hDG1, C.oldWall, 'dg'); n.pos[1] = DIM.dgY + 0.5; floors.dg.shell.add(n); dgWalls.push({ node: n, e }); }
  parts.dgWalls = dgWalls;
  // Sockelband (hellgrau) rund ums EG, damit das Sockelgeschoss klar erkennbar bleibt
  const slab = (lvl, y, c) => {
    const n = new Node(slabGeo(FOOT[lvl], 0.3), { color: hex(c) });
    n.at(0, y - 0.15, 0);
    floors[lvl].inner.add(n);
    return n;
  };
  slab('kg', DIM.kgY, C.concrete); slab('eg', DIM.egY, C.concrete); slab('dg', DIM.dgY, C.concrete);

  // Überzüge Dämmung / Putz: wachsen von unten nach oben
  const overlays = [];
  const mkOverlay = (lvl, y0, Hf, color, off, th, key) => {
    for (const e of (lvl === 'eg' ? geo.egW : geo[lvl]).edges) {
      const n = box(e.len + 0.3, 1, th, color, { shadow: shadowOn[lvl] });
      n.rot[1] = Math.atan2(-e.d[1], e.d[0]);
      n.pos[0] = (e.p[0] + e.q[0]) / 2 + e.out[0] * (off + th / 2);
      n.pos[2] = (e.p[1] + e.q[1]) / 2 + e.out[1] * (off + th / 2);
      floors[lvl].shell.add(n);
      overlays.push({ node: n, y0, Hf, key, lvl });
    }
  };
  mkOverlay('eg', DIM.egY, () => DIM.hEG, C.insul, 0.0, 0.1, 'daemmung');
  mkOverlay('eg', DIM.egY, () => DIM.hEG, C.plaster, 0.1, 0.06, 'fassade');
  mkOverlay('dg', DIM.dgY, () => dgH(state.s), C.insul, 0.0, 0.1, 'daemmung');
  mkOverlay('dg', DIM.dgY, () => dgH(state.s), C.plaster, 0.1, 0.06, 'fassade');

  // ---------- Fenster ----------
  const windows = [];
  const mkWindow = (lvl, edge, a, w, h, y0, kind = 'win', label = '') => {
    const e = typeof edge === 'object' ? edge : geo[lvl].edges[edge];
    const g = grp('fenster');
    const off = lvl === 'kg' ? 0.07 : 0.2;
    g.at(e.p[0] + e.d[0] * a + e.out[0] * off, y0 + h / 2, e.p[1] + e.d[1] * a + e.out[1] * off).rotate(0, Math.atan2(e.out[0], e.out[1]), 0);
    const hole = box(w, h, 0.1, C.dark, { outline: false });
    const oldF = grp('alt'); oldF.add(box(w, h, 0.12, C.frameOld), box(w - 0.22, h - 0.22, 0.16, C.glassOld));
    const newF = grp('neu'); newF.add(box(w, h, 0.14, C.frameNew), box(w - 0.2, h - 0.2, 0.18, C.glass));
    if (kind === 'win') newF.add(box(0.05, h - 0.2, 0.2, C.frameNew).at(0, 0, 0));
    if (kind === 'door') newF.add(box(0.08, 0.1, 0.22, 0x555a60).at(w / 2 - 0.2, 0, 0));
    g.add(hole, oldF, newF);
    if (kind === 'win') g.add(box(w + 0.36, 0.09, 0.36, 0xe9e2d3).at(0, -h / 2 - 0.05, 0.1), box(w + 0.2, 0.1, 0.14, 0xb08a5a).at(0, h / 2 + 0.07, 0.03));
    floors[lvl].shell.add(g);
    const rec = { w, h, top: y0 + h - (lvl === 'dg' ? DIM.dgY : 0), g, hole, oldF, newF, lvl, hasOld: lvl !== 'dg', glass: newF.children[1], wall: (edge === 0 || typeof edge === 'object') ? 'front' : 'other', label };
    windows.push(rec);
    return rec;
  };
  const ky = DIM.kgY + 1.0;
  for (const u of [1.9, 5.3, 8.6, 11.3]) mkWindow('kg', 0, u, 1.3, 0.9, ky);
  mkWindow('kg', 7, 3.5, 0.9, 0.7, ky + 0.3);
  mkWindow('kg', 2, 1.5, 1.2, 0.9, ky);
  const ey = DIM.egY + 0.9;
  mkWindow('eg', 0, 2.2, 2.2, 1.4, ey);     // Wohnen
  mkWindow('eg', 0, 6.0, 1.6, 1.4, ey);     // Küche
  mkWindow('eg', 0, 9.0, 1.2, 1.4, ey);
  mkWindow('eg', geo.egW.edges[2], 1.2, 1.2, 2.2, DIM.egY, 'door');  // Haustür
  mkWindow('eg', 7, 4.5, 1.2, 1.4, ey);
  mkWindow('eg', 6, 2.3, 2.4, 2.0, DIM.egY, 'door');   // Terrassentür Wohnen
  mkWindow('eg', 4, 2.0, 1.6, 1.4, ey);
  mkWindow('eg', 3, 3.2, 1.4, 1.4, ey);
  mkWindow('eg', 3, 7.0, 1.4, 1.4, ey);
  mkWindow('eg', 2, 3.3, 1.2, 1.2, ey + 0.2);
  mkWindow('eg', 1, 3.0, 1.2, 1.4, ey);
  mkWindow('eg', 1, 12.4, 1.2, 1.4, ey);
  const dy = DIM.dgY + 0.5;
  mkWindow('dg', 0, 2.0, 1.6, 2.0, DIM.dgY, 'door');
  mkWindow('dg', 0, 6.2, 1.4, 1.4, dy);
  mkWindow('dg', 0, 11.0, 1.5, 1.4, dy);
  mkWindow('dg', 5, 2.4, 1.2, 2.1, DIM.dgY, 'door');   // Tür zum Außentreppen-Podest
  mkWindow('dg', 4, 3.0, 1.5, 1.6, DIM.dgY + 0.4);
  mkWindow('dg', 4, 6.4, 1.6, 2.0, DIM.dgY, 'door');   // Balkon
  mkWindow('dg', 1, 3.0, 1.2, 1.4, dy);
  mkWindow('dg', 1, 9.5, 1.2, 1.4, dy);
  mkWindow('dg', 2, 1.6, 1.3, 1.4, dy);
  mkWindow('dg', 2, 4.9, 1.3, 1.4, dy);
  windows.forEach((w, i) => { w.idx = i; });
  parts.windows = windows;

  // Eingang: Stufen in der Nische, das Hausdach überdeckt ihn (kein extra Vordach)
  const entryX = X(12.9), entry = grp('eingang');
  for (let i = 0; i < 3; i++) entry.add(box(2.2, 0.2, 0.55, 0xd4d7da).at(entryX, DIM.egY - 0.1 - i * 0.2, Z(NICHE.d) + 0.4 + i * 0.5));
  floors.eg.shell.add(entry);
  // Terrasse (Holz) hinter dem Wohnbereich
  const deck = box(4.2, 0.22, 3.2, C.wood, { shadow: true }).at(X(2.2), DIM.egY - 0.28, Z(9.6));
  floors.eg.shell.add(deck);
  const dtx = X(2.2), dtz = Z(9.6);
  const furniture = grp('terrassenmoebel');
  furniture.add(cylN(0.7, 0.7, 0.07, 0xf2eee4, 10).at(dtx, DIM.egY + 0.75, dtz), cylN(0.07, 0.07, 0.7, 0x8a929a, 6).at(dtx, DIM.egY + 0.38, dtz));
  for (const [cx, cz] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) furniture.add(box(0.5, 0.08, 0.5, 0xe0553f).at(dtx + cx, DIM.egY + 0.45, dtz + cz), box(0.5, 0.5, 0.08, 0xe0553f).at(dtx + cx * 1.3, DIM.egY + 0.7, dtz + cz * 1.3));
  furniture.add(cylN(0.04, 0.04, 2.3, 0x8a929a, 6).at(dtx, DIM.egY + 1.2, dtz), cylN(0.0, 1.5, 0.45, 0xf4f1ea, 8, { shadow: true }).at(dtx, DIM.egY + 2.4, dtz));
  floors.eg.shell.add(furniture);
  // Balkon DG Südseite des Westflügels
  const balc = grp('balkon');
  balc.add(box(2.6, 0.2, 1.3, C.concrete, { shadow: true }).at(X(6.4), DIM.dgY - 0.1, Z(8.0) - 0.65));
  const rail = (x, z, w, d) => new Node(G.box(w, 0.9, d), { color: hex(0xb9895b), alpha: 0.85 }).at(x, DIM.dgY + 0.5, z);
  balc.add(rail(X(6.4), Z(8.0) - 1.28, 2.6, 0.06), rail(X(6.4) - 1.3, Z(8.0) - 0.65, 0.06, 1.3), rail(X(6.4) + 1.3, Z(8.0) - 0.65, 0.06, 1.3));
  floors.dg.shell.add(balc);

  // ---------- Garage (östlich, flaches Dach) ----------
  const garage = grp('garage');
  const gx = X(14.88) - DIM.garW / 2, gzc = Z(5.8) - DIM.garD / 2;
  garage.add(box(DIM.garW, DIM.garH, DIM.garD, 0xe9ddc2, { shadow: true }).at(gx, DIM.garH / 2, gzc));
  garage.add(box(DIM.garW + 0.5, 0.22, DIM.garD + 0.5, 0x58545e, { shadow: true }).at(gx, DIM.garH + 0.11, gzc));
  garage.add(box(3.7, 2.3, 0.1, 0xf4f1ea).at(gx, 1.15, gzc + DIM.garD / 2 + 0.05));
  for (let i = 0; i < 4; i++) garage.add(box(3.5, 0.03, 0.04, 0xb8bdc2).at(gx, 0.5 + i * 0.5, gzc + DIM.garD / 2 + 0.11));
  root.add(garage);
  parts.garage = garage;

  // ---------- Dach: zwei Satteldächer (West-Flügel E-W, Stem N-S) ----------
  const roof = grp('dach');
  const rs = DIM.rise, ov = DIM.ov;
  const roofParts = [];
  // Hilfsfunktion: Prisma mit Firstrichtung entlang local-x, Länge len, Halbbreite hw
  const mkRoof = (name, hwid, len, cx, cz, rotY, hipM = true, hipP = true) => {
    const ang = Math.atan2(rs, hwid), zo = hwid + ov, yE = -ov * Math.tan(ang);
    const g = grp(name); g.at(cx, 0, cz).rotate(0, rotY, 0);
    const poly = [[-zo, yE], [0, rs], [zo, yE]];
    const mkPr = (c, o = {}) => new Node(G.extrude(poly, len, (u, v, w) => [w, v, u]), { color: hex(c), shadow: true, ...o });
    const deck = mkPr(C.deck);
    // Altes Dach: Walmdach (Walm an freien Enden, kein Walm dort, wo der andere Flügel anschließt)
    const hip = (hm, hp) => {
      const L2 = len / 2, rm = hm ? -L2 + zo : -L2, rp = hp ? L2 - zo : L2;
      const E = (x, z) => [x, yE, z], R = (x) => [x, rs, 0];
      const A = E(-L2, zo), B = E(L2, zo), Cc = E(L2, -zo), D = E(-L2, -zo), Rm = R(rm), Rp = R(rp);
      return G.tris([[A, B, Rp], [A, Rp, Rm], [D, Cc, Rp], [D, Rp, Rm], [B, Cc, Rp], [A, D, Rm], [A, B, Cc], [A, Cc, D]]);
    };
    const old = new Node(hip(hipM, hipP), { color: hex(C.roofOld), shadow: true });
    const raf = grp('sparren');
    const nR = Math.round(len / 1.3);
    const slopeLen = Math.hypot(zo, rs - yE), rowLen = slopeLen / 12;
    for (let i = 0; i <= nR; i++) {
      const x = -len / 2 + 0.1 + i * (len - 0.2) / nR;
      for (const sg of [-1, 1]) raf.add(box(0.14, 0.2, slopeLen, 0xe2b873).at(x, (yE + rs) / 2 + 0.1, sg * zo / 2).rotate(sg * ang, 0, 0));
    }
    raf.add(box(len, 0.22, 0.22, 0xe2b873).at(0, rs + 0.05, 0));
    const rows = { front: [], back: [] };
    for (const [side, sg] of [['front', 1], ['back', -1]]) {
      for (let i = 0; i < 12; i++) {
        const s = (i + 0.5) * rowLen;
        const z = sg * (zo - s * Math.cos(ang)), y = yE + s * Math.sin(ang) + 0.07;
        const r = box(len + 0.05, 0.12, rowLen * 0.99, i % 2 ? C.roofNew : C.roofNew2).at(0, y, z).rotate(sg * ang, 0, 0);
        g.add(r); rows[side].push(r);
      }
    }
    // Giebelflächen
    const capPoly = [[-hwid, 0], [0, rs], [hwid, 0]];
    const caps = [];
    for (const sx of [-1, 1]) {
      const c = new Node(G.extrude(capPoly, 0.06, (u, v, w) => [sx * (len / 2 + 0.03) + w * 0, v + 0.0, u]), { color: hex(C.gable) });
      c.pos[0] = 0; caps.push(c); g.add(c);
    }
    const trim = grp('blende');
    for (const sg of [-1, 1]) {
      trim.add(box(len + 0.1, 0.2, 0.14, 0xa5703f).at(0, yE - 0.02, sg * zo).rotate(sg * ang, 0, 0));
      for (const sx of [-1, 1]) trim.add(box(0.14, 0.18, slopeLen + 0.1, 0xa5703f).at(sx * (len / 2 + 0.02), (yE + rs) / 2, sg * zo / 2).rotate(sg * ang, 0, 0));
    }
    g.add(old, deck, raf, trim);
    roof.add(g);
    const info = { g, old, deck, raf, trim, rows, ang, zo, yE, hwid, len, slopeLen, rowLen, caps, cx, cz, rotY };
    roofParts.push(info);
    return info;
  };
  // Westflügel: von x=-4.13 (First des Stems) bis Westgiebel inkl. Überstand
  const wLen = (7.44 + ov) - (-4.13);
  const r1 = mkRoof('dachW', 4.0, wLen, (7.44 + ov + -4.13) / 2, 3.2, 0, false, true);
  // Stem: Nord-Süd
  const r2 = mkRoof('dachS', 3.31, 14.38 + 2 * ov, -4.13, 0.01, Math.PI / 2);
  // Kappen: Westflügel Ostseite liegt im Stem-Dach, dort nicht zeigen
  r1.caps[0].visible = false;
  parts.roof = { group: roof, parts: roofParts, old: null, deck: null, rafters: null, rows: null, ang: r1.ang, zo: r1.zo, yEave: r1.yE, ridge: rs, slopeLen: r1.slopeLen, rowLen: r1.rowLen, z0: 3.2 };
  // Zugriff für Animationen: Dachfläche Süd des Westflügels (Südost-Seite mit Dachfenstern)
  const slopePt = (sg, s, x) => ({ p: [x, r1.yE + s * Math.sin(r1.ang) + 0.16, 3.2 + sg * (r1.zo - s * Math.cos(r1.ang))], rot: sg * r1.ang });
  parts.slopePt = slopePt;
  // Gauben (Nordseite, Pultdach) und Dachfenster
  const dormers = grp('gauben');
  for (const u of [3.0, 6.9]) {
    const g = grp('gaube'), sp = slopePt(1, 2.7, X(u));
    g.add(box(2.4, 1.7, 2.0, C.gable, { shadow: true }).at(0, 0.85, 0));
    g.add(box(2.9, 0.16, 2.6, 0x58545e, { shadow: true }).at(0, 1.82, 0.1).rotate(0.1, 0, 0));
    g.add(box(1.5, 1.15, 0.1, C.glass).at(0, 0.82, 1.03), box(1.62, 1.27, 0.08, C.frameNew).at(0, 0.82, 1.0));
    g.at(sp.p[0], sp.p[1] - 0.1, sp.p[2] - 0.2);
    dormers.add(g);
  }
  const skylights = grp('dachfenster');
  const mkSky = (sg, s, x) => {
    const sp = slopePt(sg, s, x), g = grp('dfw');
    g.add(box(1.1, 0.1, 1.4, C.frameNew), box(0.9, 0.12, 1.2, C.glass));
    g.at(sp.p[0], sp.p[1] + 0.06, sp.p[2]).rotate(sp.rot, 0, 0);
    skylights.add(g);
  };
  mkSky(-1, 3.3, X(8.8)); mkSky(-1, 3.3, X(10.6)); // sitzen im Westflügel-Dach hinten
  roof.add(dormers, skylights);
  const chimney = grp('kamin');
  chimney.add(box(0.8, 2.4, 0.8, 0xc98f6b, { shadow: true }).at(0, 1.2, 0), box(1.0, 0.18, 1.0, 0x58545e).at(0, 2.45, 0), box(0.5, 0.1, 0.5, 0x2f2a2c).at(0, 2.55, 0));
  chimney.at(X(2.6), r1.ridge ?? rs - 0.2, 3.2); chimney.pos[1] = rs - 0.35;
  roof.add(chimney);
  parts.chimney = chimney;
  root.add(roof);
  parts.dormers = dormers; parts.skylights = skylights;
  // Solarpaneele auf der Südost-Fläche
  const solar = grp('solar'), panels = [];
  const addPanel = (s, x) => {
    const sp = slopePt(-1, s, x), g = grp('panel');
    g.add(box(1.7, 0.07, 1.05, C.panelFrame), box(1.58, 0.09, 0.93, C.panel));
    for (let k = 1; k < 3; k++) g.add(box(0.015, 0.1, 0.93, 0xa9bbe0).at(-0.79 + k * 0.527, 0, 0));
    g.add(box(1.58, 0.1, 0.015, 0xa9bbe0));
    g.at(sp.p[0], sp.p[1] + 0.04, sp.p[2]).rotate(sp.rot, 0, 0);
    g.rest = { p: [...sp.p], rot: sp.rot };
    solar.add(g); panels.push(g);
  };
  for (const u of [2.0, 3.8, 5.6, 7.4]) addPanel(0.9, X(u));
  for (const u of [2.0, 3.8, 5.6, 7.4]) addPanel(2.1, X(u));
  for (const u of [2.0, 3.8]) addPanel(3.3, X(u));
  roof.add(solar);
  parts.solar = { group: solar, panels };

  // ---------- Außentreppe (geschwungen, Westgiebel, zum DG-Podest) ----------
  const stair = grp('aussentreppe'), steps = [];
  const nSt = 17;
  const topY = DIM.dgY;
  const path = (f) => PT(-0.6 - 2.3 * Math.sin(Math.PI * f * 0.92), lerp(11.4, 5.8, f));
  for (let i = 0; i < nSt; i++) {
    const f = i / (nSt - 1), f2 = Math.min(1, f + 0.02);
    const [px, pz] = path(f), [qx, qz] = path(f2);
    const y = lerp(0.25, topY, f);
    const st = box(1.25, 0.18, 0.62, 0xd8dbde, { shadow: true }).at(px, y - 0.09, pz);
    st.rot[1] = Math.atan2(-(qz - pz), qx - px) + Math.PI / 2;
    stair.add(st); steps.push(st);
  }
  const landing = box(1.6, 0.2, 2.3, 0xd8dbde, { shadow: true }).at(DIM.hw + 0.9, topY - 0.1, Z(6.3));
  const railS = grp('gelaender');
  for (let i = 0; i < nSt; i += 2) {
    const s0 = steps[i];
    railS.add(box(0.05, 0.9, 0.05, 0x8a929a).at(s0.pos[0] + 0.0, s0.pos[1] + 0.55, s0.pos[2] + (i % 4 === 0 ? 0.0 : 0)));
  }
  railS.add(box(0.06, 0.06, 2.3, 0x8a929a).at(DIM.hw + 1.65, topY + 0.85, Z(6.3)));
  stair.add(landing, railS);
  stair.parts = { steps, landing, rail: railS };
  root.add(stair);
  parts.stair = stair;

  // ---------- Innenleben ----------
  const interior = { old: [], furniture: [], newParts: [], sockets: [], cables: [], pipes: [], fbh: [], screed: [], planks: [], kitchen: [], tank: null, tankFloor: null };
  const lvlY = { kg: DIM.kgY, eg: DIM.egY, dg: DIM.dgY };
  const partH = { kg: 3.0, eg: 2.6, dg: 2.4 };
  // Trennwände: ['u'|'v', fester Wert, von, bis] (u: Wand bei u=const, v: bei v=const)
  const layout = {
    kg: [['u', 3.7, 0, 4.5], ['u', 7.0, 0, 4.5], ['u', 10.2, 0, 4.5], ['u', 13.3, 0, 4.5], ['v', 4.5, 0, 14.4], ['v', 6.6, 4.2, 14.4],
      ['u', 4.2, 6.6, 10.3], ['v', 10.3, 4.2, 14.4], ['u', 8.3, 6.6, 10.3], ['u', 11.6, 10.3, 14.2]],
    eg: [['u', 10.2, 0, 4.6], ['u', 11.9, 0, 4.6], ['v', 4.6, 10.2, 14.4], ['v', 1.9, 10.2, 11.9], ['v', 10.9, 8.5, 14.4], ['u', 12.6, 6.4, 10.9], ['u', 8.4, 6.4, 14.0]],
    dg: [['u', 8.3, 0, 8.0], ['v', 5.4, 8.3, 14.4], ['v', 7.6, 8.3, 14.4], ['u', 11.6, 7.6, 14.2], ['v', 2.8, 4.6, 8.3], ['u', 7.6, 2.8, 4.6]],
  };
  for (const lvl of ['kg', 'eg', 'dg']) {
    layout[lvl].forEach(([ax, c, a, b]) => {
      const mk = (col) => {
        if (ax === 'u') { const n = box(0.2, 1, b - a, col); n.at(X(c), 0, Z((a + b) / 2)); return n; }
        const n = box(b - a, 1, 0.2, col); n.at(X((a + b) / 2), 0, Z(c)); return n;
      };
      const o = mk(C.partOld); o.base = lvlY[lvl]; o.H = partH[lvl]; o.lvl = lvl; o.ax = ax; o.idx = interior.old.length;
      const n = mk(C.partNew); n.base = lvlY[lvl]; n.H = partH[lvl]; n.lvl = lvl; n.idx = interior.newParts.length;
      floors[lvl].inner.add(o, n);
      interior.old.push(o); interior.newParts.push(n);
    });
  }
  const furn = (lvl, u, v, w, d, h, c) => {
    const n = box(w, h, d, c).at(X(u), lvlY[lvl] + h / 2, Z(v)); n.idx = interior.furniture.length; n.lvl = lvl; n.h = h; n.baseY = lvlY[lvl];
    floors[lvl].inner.add(n); interior.furniture.push(n); return n;
  };
  furn('eg', 1.2, 5.0, 2.0, 0.9, 0.8, 0x6d8fb8); furn('eg', 2.4, 2.4, 2.2, 1.0, 0.75, 0xb98c5a); furn('eg', 6.0, 4.4, 2.0, 0.7, 1.0, 0xc59a63);
  furn('eg', 10.0, 8.2, 2.2, 1.6, 0.6, 0xd37b8a); furn('eg', 13.5, 8.0, 0.7, 2.4, 1.9, 0x8a5e3b);
  furn('dg', 3.0, 5.0, 2.0, 0.9, 0.8, 0x6d8fb8); furn('dg', 11.0, 2.6, 2.0, 1.7, 0.6, 0xd37b8a); furn('dg', 9.5, 11.0, 2.0, 1.0, 0.6, 0x7ea36a); furn('dg', 13.0, 11.2, 1.8, 0.8, 1.8, 0x8a5e3b);
  furn('kg', 1.6, 2.2, 2.2, 0.9, 1.0, 0xa1744a); furn('kg', 5.4, 2.2, 1.6, 1.6, 0.5, 0x7ea36a); furn('kg', 11.8, 2.0, 2.4, 0.8, 1.0, 0xb98c5a); furn('kg', 11.4, 8.4, 3.0, 1.2, 0.9, 0x8a5e3b);
  // Öltankraum (u 4.2–8.3, v 6.6–10.3): Doppeltank
  const tank = grp('oeltank');
  for (const dz of [-0.75, 0.75]) tank.add(cylN(0.68, 0.68, 2.4, C.tank, 10).rotate(0, 0, Math.PI / 2).at(0, 0, dz));
  tank.add(box(2.9, 0.12, 2.9, 0x6b7077).at(0, -0.74, 0));
  tank.pos0 = [X(6.25), DIM.kgY + 0.95, Z(8.45)];
  tank.at(...tank.pos0);
  floors.kg.inner.add(tank);
  interior.tank = tank;
  const tankFloor = box(3.6, 0.05, 3.5, 0x80858a).at(X(6.25), DIM.kgY + 0.03, Z(8.45));
  floors.kg.inner.add(tankFloor);
  interior.tankFloor = tankFloor;
  // Elektro
  const sockPos = {
    eg: [[0.3, 4.0], [0.3, 1.5], [4.2, 0.4], [8.0, 0.4], [14.6, 3.0], [14.6, 12.0], [9.0, 14.2], [11.0, 6.7]],
    dg: [[0.3, 3.0], [0.3, 6.5], [6.0, 0.4], [10.0, 0.4], [14.6, 4.0], [14.6, 11.5], [12.0, 14.2]],
    kg: [[0.3, 2.0], [3.0, 0.4], [9.0, 0.4], [14.6, 2.0], [14.6, 9.0], [10.0, 14.2]],
  };
  for (const lvl of ['kg', 'eg', 'dg']) {
    sockPos[lvl].forEach(([u, v]) => { const s = box(0.14, 0.14, 0.14, C.copper).at(X(u), lvlY[lvl] + 0.4, Z(v)); s.lvl = lvl; floors[lvl].inner.add(s); interior.sockets.push(s); });
    const yy = lvlY[lvl] + 2.4;
    const cab = [box(14.2, 0.05, 0.05, 0x33383d).at(X(7.4), yy, Z(0.5)), box(0.05, 0.05, 7.6, 0x33383d).at(X(0.5), yy, Z(4.0)), box(0.05, 0.05, 13.4, 0x33383d).at(X(14.4), yy, Z(7.0))];
    cab.forEach((c) => { c.lvl = lvl; floors[lvl].inner.add(c); interior.cables.push(c); });
  }
  // Sanitär: Steigleitung bei u≈10.8, v≈4.3
  const stackX = X(10.8), stackZ = Z(4.3), pipeTop = DIM.dgY + 2.4, total = pipeTop - DIM.kgY;
  const pipeStack = grp('steigleitung');
  for (const [dx, c] of [[0, C.pipeB], [0.28, C.pipeR]]) {
    const p = cylN(0.09, 0.09, total, c, 6).at(stackX + dx, DIM.kgY + total / 2, stackZ);
    p.baseY = DIM.kgY; p.total = total; pipeStack.add(p); interior.pipes.push(p);
  }
  floors.eg.inner.add(pipeStack);
  for (const lvl of ['kg', 'eg', 'dg']) {
    const nSeg = 10;
    for (let i = 0; i < nSeg; i++) {
      const seg = box(10.0, 0.04, 0.06, C.fbh).at(X(7.4), lvlY[lvl] + 0.07, Z(1.0 + i * 1.2));
      seg.lvl = lvl; seg.idx = i; seg.n = nSeg; floors[lvl].inner.add(seg); interior.fbh.push(seg);
    }
    const hp = box(10.0, 0.07, 0.07, C.pipeB).at(X(7.4), lvlY[lvl] + 0.07, Z(0.5)); hp.lvl = lvl; hp.flat = true;
    floors[lvl].inner.add(hp); interior.pipes.push(hp);
  }
  // Estrich + Dielen: je Geschoss als Footprint-Platte
  for (const lvl of ['kg', 'eg', 'dg']) {
    const inset = FOOT[lvl].map(([u, v], i, arr) => [u, v]);
    const sc = new Node(slabGeo(inset, 0.14), { color: hex(C.screed) });
    sc.at(0, lvlY[lvl] + 0.07, 0); sc.lvl = lvl; sc.baseY = lvlY[lvl];
    floors[lvl].inner.add(sc); interior.screed.push(sc);
    const nPl = 12;
    for (let i = 0; i < nPl; i++) {
      const pw = 14.4 / nPl;
      const bits = (lvl === 'dg' ? [[0, 14.4, 0, 8.0], [8.26, 14.88, 8.0, 14.4]] : lvl === 'eg' ? [[0, 14.88, 0, 6.4]] : [[0, 14.88, 0, 8.0]]);
      void bits;
      const v0 = i * pw, v1 = (i + 1) * pw;
      const maxV = lvl === 'dg' ? 8.0 : lvl === 'eg' ? 6.4 : 8.0;
      const uMax = 14.4;
      // Streifen quer (entlang u) im Hauptriegel, bis zur Tiefe v<maxV
      if (v0 < maxV) {
        const vv1 = Math.min(v1, maxV);
        const pl = box(uMax - 0.5, 0.05, (vv1 - v0) * 0.94, i % 2 ? 0xd6aa6e : 0xe2bb82);
        pl.at(X(7.44), lvlY[lvl] + 0.165, Z((v0 + vv1) / 2)); pl.lvl = lvl; pl.idx = i; pl.n = nPl; pl.restY = pl.pos[1];
        floors[lvl].inner.add(pl); interior.planks.push(pl);
      }
    }
  }
  // Küchen
  const mkKitchen = (lvl, u, v, long) => {
    const g = grp('kueche');
    g.add(box(long, 0.9, 0.6, 0xf6f3ee).at(0, 0.45, 0), box(long, 0.06, 0.64, 0x4a4f55).at(0, 0.93, 0), box(long, 0.6, 0.35, 0xf0d9a2).at(0, 1.9, -0.12), box(0.6, 0.08, 0.4, 0xc4c8cc).at(-long / 4, 0.98, 0), box(0.7, 2.0, 0.65, 0xcfd4d8).at(long / 2 + 0.4, 1.0, 0));
    g.at(X(u), lvlY[lvl] + 0.18, Z(v)).rotate(0, Math.PI, 0); g.lvl = lvl;
    floors[lvl].inner.add(g); interior.kitchen.push(g);
  };
  mkKitchen('eg', 6.6, 0.7, 3.0); mkKitchen('dg', 5.0, 4.3, 2.4);
  parts.interior = interior;
  parts.slopeInfo = { ang: r1.ang, zo: r1.zo, yEave: r1.yE, ridge: rs };

  // ---------- Zustand ----------
  const state = { litForce: null, p: {}, s: 0, view: 'aussen', floor: 'alle', lit: false };
  const P = (id) => clamp((state.p[id] ?? 0) / 100, 0, 1);
  const order = ['kg', 'eg', 'dg'];
  const hdg = () => dgH(state.s);
  const lvlRef = (n) => (n.lvl === 'dg' ? hdg() : 99);
  const inFloor = (n) => {
    if (state.view === 'innen' && state.floor !== 'alle') return order.indexOf(n.lvl) <= order.indexOf(state.floor);
    return true;
  };

  function apply() {
    const s = clamp(P('aufstockung'), 0, 1);
    state.s = s;
    const hh = dgH(s);
    for (const { node } of dgWalls) { node.scale[1] = hh / DIM.hDG1; node.pos[1] = DIM.dgY + hh / 2; setCol(node, s > 0 ? C.rawBrick : C.oldWall); }
    balc.visible = hh >= 2.05;   // Balkon (mit Tür) erst, wenn das Obergeschoss steht
    const d = P('dach');
    roof.pos[1] = DIM.dgY + hh;
    const showOld = s <= 0 && d <= 0;
    const tileP = clamp((d - 0.25) / 0.75, 0, 1);
    const nVis = Math.round(tileP * 12 + 1e-6);
    for (const rp of roofParts) {
      rp.old.visible = showOld;
      rp.raf.visible = d > 0 && d < 1;
      rp.deck.visible = d > 0.25;
      rp.trim.visible = d > 0.25;
      for (const side of ['front', 'back']) rp.rows[side].forEach((r, i) => { r.visible = i < nVis; });
      setCol(rp.old, C.roofOld);
      const capC = P('fassade') > 0.5 ? C.plaster : P('daemmung') > 0.5 ? C.insul : s > 0 ? C.rawBrick : C.oldWall;
      rp.caps.forEach((c) => setCol(c, capC));
      rp.caps.forEach((c, i) => { if (!(rp === r1 && i === 0)) c.visible = !showOld; });
    }
    parts.chimney.visible = d >= 0.7;
    parts.dormers.visible = d >= 0.7; parts.skylights.visible = d >= 0.7;
    const sp = P('solar');
    solar.visible = d >= 1;
    const nP = Math.round(sp * panels.length + 1e-6);
    panels.forEach((pn, i) => { pn.visible = i < nP; });
    state.lit = state.litForce ?? (sp >= 1);
    for (const o of overlays) {
      const f = P(o.key), H = o.Hf(), h = H * f;
      o.node.visible = h > 0.02;
      o.node.scale[1] = Math.max(h, 0.001);
      o.node.pos[1] = o.y0 + h / 2;
    }
    const fp = P('fenster');
    const nW = Math.round(fp * windows.length + 1e-6);
    for (const w of windows) {
      const installed = w.idx < nW;
      w.newF.visible = installed;
      w.oldF.visible = !installed && w.hasOld;
      w.hole.visible = !installed && !w.hasOld;
      w.g.visible = w.lvl !== 'dg' || w.top <= hh + 0.01;
      w.glass.emissive = state.lit ? 1 : 0;
      setCol(w.glass, state.lit ? 0xffe08a : C.glass);
    }
    const ek = P('entkernung'), ot = P('oeltank') >= 0.1 ? 1 : 0;
    const nWallGone = Math.round(ek * interior.old.length + 1e-6), nFurnGone = Math.round(Math.min(1, ek * 2) * interior.furniture.length + 1e-6);
    interior.old.forEach((o) => { o.visible = o.idx >= nWallGone; o.scale[1] = Math.min(o.H, lvlRef(o)); o.pos[1] = o.base + o.scale[1] / 2; });
    interior.furniture.forEach((f) => { f.visible = f.idx >= nFurnGone; });
    const tb = P('trockenbau'), ma = P('maler');
    const nPaint = Math.round(ma * interior.newParts.length + 1e-6);
    interior.newParts.forEach((n) => {
      const hp = Math.min(n.H, lvlRef(n));
      n.visible = tb > 0.01;
      n.scale[1] = Math.max(hp * tb, 0.001);
      n.pos[1] = n.base + n.scale[1] / 2;
      setCol(n, n.idx < nPaint ? PASTELS[n.idx % PASTELS.length] : C.partNew);
    });
    interior.tank.visible = ot < 1 && !state.tankHidden;
    interior.tankFloor.emissive = ot >= 1 ? 0.5 : 0;
    setCol(interior.tankFloor, ot >= 1 ? 0xe4eaee : 0x80858a);
    const el = P('elektro');
    const nS = Math.round(el * interior.sockets.length + 1e-6);
    interior.sockets.forEach((x, i) => { x.visible = i < nS && inFloor(x); });
    interior.cables.forEach((c) => { c.visible = el > 0.1 && inFloor(c); });
    const sa = P('sanitaer');
    interior.pipes.forEach((p) => {
      if (p.flat) { p.visible = sa > 0.2 && inFloor(p); return; }
      const h = p.total * clamp(sa * 1.4, 0, 1);
      p.visible = h > 0.02; p.scale[1] = Math.max(h / p.total, 0.001); p.pos[1] = p.baseY + h / 2;
    });
    const nF = Math.round(clamp((sa - 0.3) / 0.7, 0, 1) * 10 + 1e-6);
    interior.fbh.forEach((f) => { f.visible = f.idx < nF && inFloor(f); });
    const es = P('estrich');
    interior.screed.forEach((x) => { x.visible = es > 0.02 && inFloor(x); x.scale[1] = Math.max(es, 0.01); x.pos[1] = x.baseY + 0.07 * es; });
    const bo = P('boeden');
    const nB = Math.round(bo * 12 + 1e-6);
    interior.planks.forEach((x) => { x.visible = x.idx < nB && inFloor(x); x.pos[1] = x.restY; x.rot[0] = 0; });
    const ku = P('kueche');
    interior.kitchen.forEach((k) => { k.visible = ku > 0.05 && inFloor(k); k.size(Math.max(ku, 0.01)); });
    const at = P('aussentreppe');
    const nSt2 = Math.round(at * steps.length + 1e-6);
    steps.forEach((st, i) => { st.visible = i < nSt2; });
    stair.parts.landing.visible = at > 0.3; stair.parts.rail.visible = at >= 1; stair.visible = at > 0.01;
    applyView();
  }

  function applyView() {
    const inside = state.view === 'innen';
    const cut = inside && state.floor !== 'alle';
    parts.terrain.visible = !inside;
    innenBase.visible = inside;
    parts.garage.opacity = inside ? 0.25 : 1;
    for (const lvl of order) {
      const f = floors[lvl];
      f.visible = !cut || order.indexOf(lvl) <= order.indexOf(state.floor);
      f.shell.opacity = inside ? 0.16 : 1;
      f.inner.visible = inside;
    }
    roof.opacity = inside ? 0 : 1;
    roof.visible = !inside;
    parts.stair.opacity = inside ? 0.35 : 1;
  }

  return {
    parts, floors, state, DIM, apply, P,
    setProgress(map) { state.p = { ...map }; apply(); },
    setView(view, floor) { if (view) state.view = view; if (floor) state.floor = floor; apply(); },
    setLit(v) { state.litForce = v === null ? null : !!v; apply(); },
  };
}
