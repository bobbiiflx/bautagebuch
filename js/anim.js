// Bauphasen-Animationen mit Figuren und Fahrzeugen. Vor dem Start steht das Haus im Zustand "vorher" (Phase = 0 %);
// am Ende setzt der Aufrufer den echten Zustand. ctx = { engine, house, fx, speed, real }.
import { Node, G, hex, ease, lerp } from './mini3d.js';
import { DIM } from './haus.js';
import * as A from './actors.js';
const { makeWorker, setPose, walkPose, POSES, faceDir, makeSkipTruck, makeContainer, makeBoxTruck, makeVan, makeWindowFrame, makePanel, makeTorch, spinWheels, LOOKS, bx, cy, sp, grp } = A;

const STREET_Y = -0.94;
const terrainY = (z) => (z <= 11.5 ? 0 : z >= 13 ? STREET_Y : -(z - 11.5) / 1.5 * 0.94);
const arc = (a, b, h, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t) + Math.sin(Math.PI * t) * h, lerp(a[2], b[2], t)];

function tools({ engine, fx, speed }) {
  const S = (ms) => ms / speed;
  const tw = (ms, fn, e) => engine.tween(S(ms), fn, e);
  const wait = (ms) => engine.wait(S(ms));
  const mk = (look, x, y, z, parent = fx) => { const w = makeWorker(look); w.root.at(x, y, z); parent.add(w.root); return w; };
  // Figur läuft geradlinig zu einem Punkt (Boden folgt dem Gelände, wenn y = null)
  const walkTo = (w, to, o = {}) => {
    const from = [...w.root.pos];
    const dx = to[0] - from[0], dz = to[2] - from[2], dist = Math.hypot(dx, dz);
    if (dist < 0.02) return Promise.resolve();
    faceDir(w.root, dx, dz);
    const ms = (dist / (o.speed ?? 3.0)) * 1000;
    return tw(ms, (t) => {
      w.root.pos[0] = lerp(from[0], to[0], t); w.root.pos[2] = lerp(from[2], to[2], t);
      w.root.pos[1] = to[1] == null ? terrainY(w.root.pos[2]) : lerp(from[1], to[1], t);
      setPose(w, walkPose(t * dist * 2.2, 1, !!o.carry));
    }).then(() => setPose(w, o.carry ? POSES.carry : POSES.idle));
  };
  const driveTo = (veh, to, ms, easing = ease.inOut, followTerrain = false) => {
    const from = [...veh.pos]; let last = from[0] + from[2];
    return tw(ms, (t) => {
      veh.pos[0] = lerp(from[0], to[0], t); veh.pos[2] = lerp(from[2], to[2], t);
      veh.pos[1] = followTerrain ? terrainY(veh.pos[2]) : lerp(from[1], to[1], t);
      const cur = veh.pos[0] + veh.pos[2];
      spinWheels(veh, Math.abs(cur - last)); last = cur;
    }, easing);
  };
  const burst = (at, n = 14, color = 0xffc83d, power = 3.5, life = 700, grav = 0.16) => {
    const bits = [];
    for (let i = 0; i < n; i++) {
      const b = bx(0.1, 0.1, 0.1, color, { outline: false, emissive: 1, unlit: true });
      b.at(...at);
      b.v = [(Math.random() - 0.5) * power, Math.random() * power * 0.9 + 1, (Math.random() - 0.5) * power];
      fx.add(b); bits.push(b);
    }
    return tw(life, (t) => {
      for (const b of bits) { b.pos[0] += b.v[0] * 0.016; b.pos[1] += b.v[1] * 0.016; b.pos[2] += b.v[2] * 0.016; b.v[1] -= grav; b.size(1 - t); }
    }).then(() => bits.forEach((b) => fx.remove(b)));
  };
  const puff = (at, n = 6, size = 0.5) => {
    const bits = [];
    for (let i = 0; i < n; i++) {
      const b = sp(size * (0.6 + Math.random() * 0.5), 0xe9e6df, { outline: false, alpha: 0.8 });
      b.at(at[0] + (Math.random() - 0.5) * 1.2, at[1], at[2] + (Math.random() - 0.5) * 1.2);
      fx.add(b); bits.push(b);
    }
    return tw(900, (t) => { bits.forEach((b, i) => { b.pos[1] += 0.01 + i * 0.001; b.size(1 + t * 1.6); b.opacity = 1 - t; }); }).then(() => bits.forEach((b) => fx.remove(b)));
  };
  const toss = (node, from, to, h, ms, easing = ease.inOut) => tw(ms, (t) => { const q = arc(from, to, h, t); node.pos[0] = q[0]; node.pos[1] = q[1]; node.pos[2] = q[2]; }, easing);
  return { S, tw, wait, mk, walkTo, driveTo, burst, puff, toss };
}
const worldOfBed = (truck, th, cx, cy0) => [
  truck.pos[0] + truck.pivot[0] + Math.cos(th) * cx - Math.sin(th) * cy0,
  truck.pos[1] + truck.pivot[1] + Math.sin(th) * cx + Math.cos(th) * cy0,
];

// Container absetzen (load = false) bzw. aufnehmen (load = true). Der LKW steht bei xStop auf der Straße.
async function skipDrop(T, { engine, fx }, truck, cont, xStop, zRow, load) {
  const th = 0.5;
  if (!load) {
    truck.bed.add(cont); cont.at(2.9, 0.22, 0);
    await T.driveTo(truck, [xStop, STREET_Y, zRow], 3000, ease.out);
    await T.tw(1100, (t) => { truck.bed.rot[2] = lerp(0, th, t); }, ease.inOut);
    await T.tw(1500, (t) => { cont.pos[0] = lerp(2.9, -0.15, t); }, ease.inOut);
    const [wx, wy] = worldOfBed(truck, th, cont.pos[0], cont.pos[1]);
    truck.bed.remove(cont); fx.add(cont); cont.at(wx, wy, zRow); cont.rot[2] = th;
    const endX = wx - 0.9;
    await T.tw(900, (t) => { truck.bed.rot[2] = lerp(th, 0, t); cont.rot[2] = lerp(th, 0, ease.in(t)); cont.pos[1] = lerp(wy, STREET_Y, ease.in(t)); cont.pos[0] = lerp(wx, endX, t); }, ease.in);
    T.puff([cont.pos[0] - 2.0, STREET_Y + 0.3, zRow]);
    await T.driveTo(truck, [xStop + 36, STREET_Y, zRow], 2300, ease.in);
    fx.remove(truck);
    return [cont.pos[0], STREET_Y, zRow];
  }
  // aufnehmen: LKW kommt von links, kippt die Mulde, Winde zieht den Container hinauf
  truck.pos[0] = -34;
  await T.driveTo(truck, [xStop, STREET_Y, zRow], 3000, ease.out);
  await T.tw(1000, (t) => { truck.bed.rot[2] = lerp(0, th, t); }, ease.inOut);
  const start = [cont.pos[0], cont.pos[1]];
  const hookX = start[0], endLocal = -0.15;
  await T.tw(1000, (t) => { cont.pos[0] = lerp(start[0], hookX + 0.9, t); cont.rot[2] = lerp(0, th, ease.out(t)); cont.pos[1] = lerp(STREET_Y, STREET_Y + 0.35, t); }, ease.inOut);
  // Container wird Kind der Mulde
  const wx = cont.pos[0], wy = cont.pos[1];
  const lx = (wx - truck.pos[0] - truck.pivot[0]), ly = (wy - truck.pos[1] - truck.pivot[1]);
  const cx = Math.cos(th) * lx + Math.sin(th) * ly, cy0 = -Math.sin(th) * lx + Math.cos(th) * ly;
  fx.remove(cont); truck.bed.add(cont); cont.at(cx, cy0, 0); cont.rot[2] = 0;
  void endLocal;
  await T.tw(1500, (t) => { cont.pos[0] = lerp(cx, 2.9, t); cont.pos[1] = lerp(cy0, 0.22, t); }, ease.inOut);
  await T.tw(900, (t) => { truck.bed.rot[2] = lerp(th, 0, t); }, ease.inOut);
  await T.driveTo(truck, [xStop + 38, STREET_Y, zRow], 2600, ease.in);
  fx.remove(truck);
  return null;
}

// ---------- Öltank entfernen (Variante B) ----------
async function oeltank(ctx) {
  const { engine, house, fx } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, burst, toss } = T;
  const itn = house.parts.interior;
  const tank = itn.tank;
  const [tx, ty, tz] = tank.pos0;
  const zRow = 15.2;
  house.setView('aussen');
  const outside = new Node(null); fx.add(outside);

  // 1) Absetzkipper bringt den Container
  engine.flyTo({ az: 0.2, el: 0.3, r: 36, target: [2, 1.5, 12.5] }, S(1400));
  const cont = makeContainer(0xd9533f);
  const truck = makeSkipTruck(); truck.at(-34, STREET_Y, zRow); outside.add(truck);
  const contPos = await skipDrop(T, { engine, fx: outside }, truck, cont, 8.4, zRow, false);

  // 2) Zwei Handwerker gehen zur Haustür, der dritte bleibt am Lichtgraben
  const c1 = mk(LOOKS.bau, 12, STREET_Y, 14.0, outside), c2 = mk(LOOKS.bauin, 13.2, STREET_Y, 14.4, outside);
  const w3 = mk(LOOKS.profi, contPos[0] + 2.8, STREET_Y, 14.0, outside);
  const CP = [-4.2, 1.5, 10.1];
  const doorX = X12();
  const wk = Promise.all([walkTo(c1, [doorX, null, 10.0]), walkTo(c2, [doorX + 0.9, null, 10.6]), walkTo(w3, [CP[0], null, 10.5])]);
  await wk;
  await Promise.all([walkTo(c1, [doorX, 0.4, 7.2], { speed: 2.5 }), walkTo(c2, [doorX + 0.5, 0.4, 7.0], { speed: 2.5 })]);
  faceDir(w3.root, 0, -1); setPose(w3, POSES.point);
  await wait(300);

  // 3) Keller: Brenner schneidet den Tank in vier Teile
  c1.root.visible = false; c2.root.visible = false; outside.visible = false;
  house.setView('innen', 'kg');
  itn.old.filter((o) => o.lvl === 'kg').forEach((o) => { o.visible = false; });
  itn.furniture.filter((o) => o.lvl === 'kg').forEach((o) => { o.visible = false; });
  engine.flyTo({ az: 0.35, el: 1.0, r: 11.5, target: [tx, -1.8, tz + 0.5] }, S(1500));
  const a1 = mk(LOOKS.bau, tx - 2.2, DIM.kgY, tz + 1.6), a2 = mk(LOOKS.bauin, tx + 2.2, DIM.kgY, tz + 1.2);
  const torch = makeTorch(); a1.hold.add(torch);
  house.state.tankHidden = true; tank.visible = false;
  const pieces = [];
  for (const dz of [-0.75, 0.75]) for (const dx of [-0.62, 0.62]) {
    const p = grp('tankteil');
    p.add(cy(0.68, 0.68, 1.15, 0xe0553f, 10).rotate(0, 0, Math.PI / 2), bx(0.05, 1.2, 1.2, 0xb43e2e).at(dx > 0 ? -0.55 : 0.55, 0, 0).size(1, 0.55, 0.55));
    p.at(tx + dx, ty, tz + dz); fx.add(p); pieces.push(p);
  }
  const base = bx(2.9, 0.12, 2.9, 0x6b7077).at(tx, ty - 0.74, tz); fx.add(base);
  await wait(600);
  faceDir(a1.root, 1, 0); faceDir(a2.root, -1, 0);
  setPose(a1, POSES.torch); setPose(a2, POSES.push);
  const glow = sp(0.2, 0xbfe6ff, { emissive: 1, unlit: true, outline: false, alpha: 0.9 }); fx.add(glow);
  // Längsschnitt in der Mitte, dann je Zylinder
  for (const dz of [0.75, -0.75]) {
    await tw(500, (t) => { a1.root.pos[2] = lerp(a1.root.pos[2], tz + dz + 0.5, ease.out(t)); a1.root.pos[0] = lerp(a1.root.pos[0], tx - 1.0, ease.out(t)); });
    await Promise.all([
      tw(1300, (t) => {
        const x = lerp(tx - 0.9, tx + 0.9, t);
        glow.at(x, ty + 0.5, tz + dz); glow.size(0.8 + Math.random() * 0.5);
        a1.root.pos[0] = x - 0.8; setPose(a1, { ...POSES.torch, rArm: 1.15 + Math.sin(t * 40) * 0.04 });
        if (Math.random() < 0.5) burst([x, ty + 0.55, tz + dz], 4, 0xffd04a, 3, 400);
      }),
    ]);
  }
  glow.visible = false;
  await Promise.all(pieces.map((p, i) => tw(500, (t) => { p.pos[0] += (i % 2 ? 1 : -1) * 0.004; })));
  // Schnitt quer: kurzer Funkenschauer, Teile fallen leicht auseinander
  burst([tx, ty + 0.5, tz], 24, 0xffd04a, 5, 800);
  await tw(700, (t) => { pieces.forEach((p, i) => { p.pos[0] = tx + (i % 2 ? 1 : -1) * (0.62 + t * 0.35); }); });
  setPose(a1, POSES.thumbs); setPose(a2, POSES.idle);
  a1.hold.remove(torch);
  await wait(500);

  // 4) Träger holen je ein Teil und gehen zum Lichtgraben
  const winX = [2.14, -1.16];
  const carry = async (w, piece, wx) => {
    const from = [...piece.pos];
    await toss(piece, from, [w.root.pos[0], ty + 0.6, w.root.pos[2]], 0.3, 600);
    fx.remove(piece); w.hold.add(piece); piece.at(0.1, 0.1, 0); piece.rot[1] = Math.PI / 2;
    await walkTo(w, [wx, DIM.kgY, 6.1], { carry: true });
  };
  await Promise.all([carry(a1, pieces[0], winX[0]), carry(a2, pieces[2], winX[1])]);
  await wait(200);

  // 5) Außenansicht: die Teile fliegen durch den Lichtgraben nach oben zum Kollegen, dann in den Container
  a1.root.visible = false; a2.root.visible = false; base.visible = false;
  house.setView('aussen');
  outside.visible = true;
  engine.flyTo({ az: 0.45, el: 0.42, r: 26, target: [2.5, 1.0, 10.5] }, S(1400));
  const fly = async (piece, fromX, i) => {
    const fromPos = [fromX, -1.2, 7.1];
    if (piece.parent) piece.parent.remove(piece);
    piece.at(...fromPos); piece.rot[1] = 0; fx.add(piece);
    await toss(piece, fromPos, CP, 2.6, 900, ease.out);
    faceDir(w3.root, 0, -1); setPose(w3, POSES.carry);
    fx.remove(piece); w3.hold.add(piece); piece.at(0.1, 0.1, 0);
    await wait(250);
    faceDir(w3.root, 0.6, 1); await wait(200);
    w3.hold.remove(piece); fx.add(piece);
    piece.at(CP[0] + 0.3, 1.6, 10.7);
    const drop = [contPos[0] - 1.4 + (i % 2) * 1.6, STREET_Y + 0.45 + Math.floor(i / 2) * 0.35, zRow + (i % 2 ? 0.3 : -0.3)];
    await toss(piece, [CP[0] + 0.3, 1.6, 10.7], drop, 2.6, 1000);
    piece.rot[2] = 0; piece.rot[1] = 0.2 * i;
    burst([drop[0], drop[1] + 0.4, drop[2]], 8, 0xd9d9d9, 2, 500);
    setPose(w3, POSES.idle);
  };
  await fly(pieces[0], winX[0], 0);
  await fly(pieces[2], winX[1], 1);
  // zweite Runde (die Träger holen die letzten Teile, kurz unsichtbar)
  await wait(900);
  await fly(pieces[1], winX[0], 2);
  await fly(pieces[3], winX[1], 3);
  setPose(w3, POSES.wave(0)); const wv = tw(1100, (t) => setPose(w3, POSES.wave(t * 3)));
  await wv; setPose(w3, POSES.idle);

  // 6) Raum glänzt, Container wird abgeholt
  house.setProgress({ ...house.state.p, oeltank: 100 });
  outside.visible = true;
  const truck2 = makeSkipTruck(); truck2.at(-34, STREET_Y, zRow); outside.add(truck2);
  outside.remove(cont); // wird im Aufnahme-Ablauf neu eingehängt
  fx.remove(cont);
  cont.at(contPos[0], STREET_Y, zRow); outside.add(cont);
  pieces.forEach((p) => { fx.remove(p); });
  const loaded = new Node(null);
  loaded.add(...pieces.map((p, i) => { const q = p; q.at(-1.4 + (i % 2) * 1.6, 0.55 + Math.floor(i / 2) * 0.35, i % 2 ? 0.3 : -0.3); return q; }));
  cont.add(loaded);
  const wk2 = walkTo(w3, [contPos[0] + 4.5, null, 12.5], { speed: 2.4 });
  await skipDrop(T, { engine, fx: outside }, truck2, cont, 8.4, zRow, true);
  await wk2;
  fx.remove(outside);
  // Finale im Keller
  outside.visible = false;
  house.setView('innen', 'kg');
  itn.old.filter((o) => o.lvl === 'kg').forEach((o) => { o.visible = false; });
  itn.furniture.filter((o) => o.lvl === 'kg').forEach((o) => { o.visible = false; });
  await engine.flyTo({ az: 0.35, el: 1.0, r: 11.5, target: [tx, -1.8, tz + 0.5] }, S(1200));
  await burst([tx, ty + 0.3, tz], 26, 0xffffff, 2.5, 1000, 0.05);
  house.state.tankHidden = false;
}
const X12 = () => 7.44 - 12.9;

// ---------- Fenster einbauen (Variante A): Lieferwagen, Handwerker tragen Rahmen, Rest fliegt ein ----------
async function fenster(ctx) {
  const { engine, house, fx, real } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, driveTo, toss, burst } = T;
  const { windows } = house.parts;
  const nReal = Math.round(((real?.fenster ?? 100) / 100) * windows.length);
  const targets = windows.filter((w) => w.g.visible && w.idx < nReal)
    .sort((p, q) => (p.wall === 'front' ? 0 : 1) - (q.wall === 'front' ? 0 : 1) || p.idx - q.idx);
  house.setView('aussen');
  const zRow = 15.4;
  engine.flyTo({ az: 0.3, el: 0.3, r: 34, target: [-1, 2, 11] }, S(1300));
  const van = makeBoxTruck(); van.at(-34, STREET_Y, zRow); fx.add(van);
  await driveTo(van, [-0.5, STREET_Y, zRow], 3200, ease.out);
  await tw(900, (t) => { van.door.rot[1] = lerp(0, 1.9, ease.out(t)); });
  // Besatzung steigt aus
  const crew = [mk(LOOKS.bau, -5.2, STREET_Y, zRow + 1.9), mk(LOOKS.bauin, -5.9, STREET_Y, zRow + 2.2), mk(LOOKS.profi, -6.6, STREET_Y, zRow + 1.8)];
  const rackPos = [-6.3, STREET_Y + 1.8, zRow];
  const front = targets.filter((w) => w.wall === 'front');
  const hand = front.filter((w) => w.lvl === 'eg').slice(0, 4);
  const rest = targets.filter((w) => !hand.includes(w));
  const frameNodes = van.frames;
  let fi = 0;
  const swapIn = async (w) => {
    w.hole.visible = false; w.newF.visible = true;
    const gl = w.glass; gl.emissive = 1;
    await tw(450, (t) => { gl.emissive = 1 - t; gl.color = hex(0xffffff); });
    gl.color = hex(0x9fe0f7);
  };
  const handle = async (worker, w) => {
    const f = frameNodes[fi++ % frameNodes.length]; if (f) f.visible = false;
    const fr = makeWindowFrame(w.w, w.h);
    worker.hold.add(fr); fr.at(0.15, 0.1, 0); fr.rot[1] = Math.PI / 2;
    await walkTo(worker, [worker.root.pos[0] + 0.2, null, zRow + 0.9], { speed: 2.4 });
    const wp = w.g.pos;
    await walkTo(worker, [-5.0, null, 12.4], { carry: true });
    await walkTo(worker, [wp[0], null, 9.6], { carry: true });
    faceDir(worker.root, 0, -1);
    worker.hold.remove(fr); fx.add(fr);
    const from = [wp[0], 1.4, 9.2];
    fr.at(...from); fr.rot[1] = 0;
    await toss(fr, from, [wp[0], wp[1], wp[2] + 0.3], 0.3, 700);
    fx.remove(fr);
    w.oldF.visible = false;
    await swapIn(w);
    setPose(worker, POSES.thumbs);
    await wait(250);
    await walkTo(worker, [-5.0, null, 10.6], { speed: 3 });
    await walkTo(worker, [-5.0, null, 12.4], { speed: 3 });
    await walkTo(worker, [-5.5 - Math.random() * 1.5, null, zRow + 1.6], { speed: 3 });
    setPose(worker, POSES.idle);
  };
  // Handwerker tragen die ersten Fenster
  const queue = hand.slice();
  const pool = crew.map(async (worker) => { while (queue.length) { const w = queue.shift(); await handle(worker, w); } });
  await Promise.all(pool);
  // Fenster in der Höhe und hinten: Kollegen zeigen, der Wagen schickt sie los
  setPose(crew[0], POSES.point); setPose(crew[1], POSES.point);
  engine.flyTo({ az: 0.6, el: 0.4, r: 40, target: [0, 3, 6] }, S(1300));
  let backDone = false;
  const flights = [];
  for (const w of rest) {
    if (!backDone && w.wall !== 'front') {
      backDone = true; await Promise.all(flights.splice(0));
      engine.flyTo({ az: Math.PI - 0.4, el: 0.42, r: 40, target: [0, 3, -2] }, S(1500));
    }
    const proxy = makeWindowFrame(w.w, w.h);
    proxy.rot[1] = w.g.rot[1];
    const f = frameNodes[fi++ % frameNodes.length]; if (f) f.visible = false;
    const from = [...rackPos], to = [w.g.pos[0], w.g.pos[1], w.g.pos[2]];
    proxy.at(...from); fx.add(proxy);
    const dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const fl = tw(700 + dist * 28, (t) => {
      const q = arc(from, to, 4.5 + dist * 0.07, t);
      proxy.pos[0] = q[0]; proxy.pos[1] = q[1]; proxy.pos[2] = q[2]; proxy.rot[2] = Math.sin(t * Math.PI) * 0.4;
    }, ease.inOut).then(async () => { fx.remove(proxy); w.oldF.visible = false; await swapIn(w); });
    flights.push(fl);
    await wait(380);
  }
  await Promise.all(flights);
  crew.forEach((c) => setPose(c, POSES.thumbs));
  await wait(900);
  engine.flyTo({ az: 0.3, el: 0.3, r: 34, target: [-1, 2, 11] }, S(1000));
  await Promise.all([tw(800, (t) => { van.door.rot[1] = lerp(1.9, 0, t); }), ...crew.map((c, i) => walkTo(c, [-1.5 + i * 0.8, STREET_Y, zRow + 2.2], { speed: 3 }))]);
  crew.forEach((c) => fx.remove(c.root));
  await driveTo(van, [36, STREET_Y, zRow], 2600, ease.in);
  fx.remove(van);
}

// ---------- Solar (Variante B): Schrägaufzug, Dachdecker, Blitz, Licht an ----------
async function solar(ctx) {
  const { engine, house, fx, real } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, driveTo, toss, burst } = T;
  const { parts } = house;
  const roof = parts.roof, panels = parts.solar.panels;
  const gy = roof.group.pos[1];
  house.setView('aussen');
  panels.forEach((p) => { p.visible = false; });
  engine.flyTo({ az: Math.PI - 0.45, el: 0.36, r: 36, target: [-1, 4.5, -3] }, S(1500));
  // Transporter fährt über die Wiese an die Westseite
  const van = makeVan(0xf4f1ea, 0xf2a900); van.at(12.8, STREET_Y, 17.5); faceDir(van, 0, -1); fx.add(van);
  await driveTo(van, [12.8, 0, -9.6], 3600, ease.inOut, true);
  faceDir(van, -1, 0);
  const rx = -4.25;
  await driveTo(van, [rx + 5.5, 0, -9.6], 2200, ease.inOut, true);
  const zFoot = -roof.zo - 2.7;
  // Lift: steile Leiter vom Boden zur Traufe, dann entlang der Dachfläche
  const eave = parts.slopePt(-1, 0, rx).p;
  const eaveW = [rx, eave[1] + gy + 0.15, eave[2]];
  const foot = [rx, 0.35, zFoot];
  const sA = Math.atan2(eaveW[1] - foot[1], eaveW[2] - foot[2]);
  const steepLen = Math.hypot(eaveW[1] - foot[1], eaveW[2] - foot[2]);
  const lift = new Node(null);
  const steep = bx(0.2, 0.22, steepLen, 0x8a9199).at(rx, (eaveW[1] + foot[1]) / 2, (eaveW[2] + foot[2]) / 2).rotate(-sA, 0, 0);
  const rail2 = bx(0.2, 0.22, roof.slopeLen + 0.8, 0x8a9199);
  const mid = parts.slopePt(-1, roof.slopeLen / 2 - 0.4, rx);
  rail2.at(rx, mid.p[1] + gy + 0.12, mid.p[2]).rotate(-roof.ang, 0, 0);
  lift.add(steep, rail2, bx(0.5, 0.4, 0.5, 0x4a4f56).at(rx, 0.2, zFoot - 0.6));
  fx.add(lift);
  const car = new Node(null);
  car.add(bx(1.6, 0.12, 1.3, 0xf2a900), bx(0.08, 0.5, 1.3, 0xf2a900).at(-0.74, 0.3, 0));
  fx.add(car);
  const stackNode = new Node(null); car.add(stackNode);
  const carAt = (u) => { // u: 0 = Boden, 1 = Traufe, 1+ = Dachfläche (Meter entlang der Fläche = (u-1)*10)
    if (u <= 1) {
      car.at(rx - 0.0, lerp(foot[1], eaveW[1], u) + 0.18, lerp(foot[2], eaveW[2], u)); car.rot[0] = -sA;
    } else {
      const s = (u - 1) * 10; const q = parts.slopePt(-1, s, rx);
      car.at(rx, q.p[1] + gy + 0.3, q.p[2]); car.rot[0] = -roof.ang;
    }
  };
  carAt(0);
  // Palette mit Modulen
  const pal = new Node(null);
  pal.add(bx(1.9, 0.18, 1.2, 0xb9925e).at(0, 0.09, 0));
  const pile = [];
  for (let i = 0; i < 8; i++) { const q = bx(1.7, 0.07, 1.05, 0x2a4a9a).at(0, 0.24 + i * 0.09, 0); pal.add(q); pile.push(q); }
  pal.at(rx + 1.2, 0, zFoot - 1.0); fx.add(pal);
  // Besatzung
  const driver = mk(LOOKS.bau, rx + 6.6, 0, -9.0);
  const mate = mk(LOOKS.bauin, rx + 6.6, 0, -10.3);
  const roofer = mk(LOOKS.profi, rx, 0, zFoot + 1.0);
  await Promise.all([walkTo(driver, [rx + 1.2, 0, zFoot - 2.0]), walkTo(mate, [rx + 0.4, 0, zFoot - 1.9])]);
  faceDir(driver.root, 0, 1); faceDir(mate.root, 0, 1);
  // Dachdecker klettert auf eine Plattform an der Traufe
  const rooferTarget = [rx - 0.9, eaveW[1] - 0.15, eaveW[2] + 0.8];
  await tw(1600, (t) => { roofer.root.pos[0] = lerp(rx, rooferTarget[0], t); roofer.root.pos[1] = lerp(0, rooferTarget[1], ease.in(t)); roofer.root.pos[2] = lerp(zFoot + 1.0, rooferTarget[2], t); setPose(roofer, walkPose(t * 12, 0.8)); });
  faceDir(roofer.root, 0, 1); setPose(roofer, POSES.idle);
  const nShow = Math.max(1, Math.round(((real?.solar ?? 100) / 100) * panels.length));
  let pileLeft = pile.length;
  for (let i = 0; i < nShow; i += 2) {
    // aufladen
    setPose(driver, POSES.push); setPose(mate, POSES.push);
    const batch = [i, i + 1].filter((k) => k < nShow);
    batch.forEach((k, j) => { const m = makePanel(); m.at(0, 0.15 + j * 0.1, 0); stackNode.add(m); const q = pile[--pileLeft] || null; if (q) q.visible = false; });
    await wait(500);
    setPose(driver, POSES.idle); setPose(mate, POSES.idle);
    await tw(1100, (t) => carAt(ease.inOut(t)));
    // entlang der Dachfläche zur Zielposition
    const targets = batch.map((k) => panels[k]);
    const sMax = Math.max(...targets.map((pn) => (pn.rest.p[2] - roof.z0 + roof.zo) / Math.cos(roof.ang)));
    await tw(900, (t) => carAt(1 + lerp(0, sMax / 10, ease.inOut(t))));
    const standS = Math.max(0.3, sMax - 0.5), sq = parts.slopePt(-1, standS, rx);
    const rFrom = [...roofer.root.pos];
    await tw(600, (t) => { roofer.root.pos[0] = lerp(rFrom[0], sq.p[0], t); roofer.root.pos[1] = lerp(rFrom[1], sq.p[1] + gy - 0.12, t); roofer.root.pos[2] = lerp(rFrom[2], sq.p[2], t); setPose(roofer, walkPose(t * 6, 0.8)); });
    faceDir(roofer.root, 1, 0);
    // Dachdecker nimmt Module und setzt sie
    for (let j = 0; j < batch.length; j++) {
      const pn = targets[j];
      const m = stackNode.children[stackNode.children.length - 1];
      stackNode.remove(m);
      pn.visible = true;
      const to = [pn.pos[0], pn.pos[1], pn.pos[2]];
      const from = [rx, parts.slopePt(-1, sMax, rx).p[1] + 0.4, parts.slopePt(-1, sMax, rx).p[2]];
      pn.pos[0] = from[0]; pn.pos[1] = from[1]; pn.pos[2] = from[2];
      const standAt = [to[0] + 0.1, to[1] + gy, to[2] + 0.9];
      void standAt;
      setPose(roofer, POSES.carry); faceDir(roofer.root, -1, 0.3);
      await tw(650, (t) => { const q = arc(from, to, 0.7, t); pn.pos[0] = q[0]; pn.pos[1] = q[1]; pn.pos[2] = q[2]; });
      setPose(roofer, POSES.thumbs);
      burst([to[0], to[1] + gy + 0.3, to[2]], 5, 0xffe9a0, 1.6, 380);
      await wait(180);
    }
    setPose(roofer, POSES.idle);
    await tw(1500, (t) => carAt(lerp(1 + sMax / 10, 0, ease.inOut(t))));
    stackNode.children.slice().forEach((c) => stackNode.remove(c));
  }
  // Abbau, Blitz, Licht an
  await Promise.all([tw(600, () => {}), walkTo(driver, [rx + 3, 0, zFoot - 3]), walkTo(mate, [rx + 2.4, 0, zFoot - 3.6])]);
  fx.remove(lift); fx.remove(car); fx.remove(pal);
  house.setProgress({ ...house.state.p, solar: real?.solar ?? 100 });
  if ((real?.solar ?? 100) >= 100) {
    const flash = new Node(G.sphere(1, 8, 5), { color: hex(0xffffff), unlit: true, emissive: 1, outline: false, alpha: 0.9 });
    flash.at(-3.5, gy + 6, -2); fx.add(flash);
    setPose(roofer, POSES.wave(0));
    await tw(560, (t) => { flash.size(1 + t * 18); flash.opacity = 1 - t; });
    fx.remove(flash);
    house.setLit(false);
    await wait(300);
    house.setLit(null);
    burst([-3.5, gy + 5, -2], 28, 0xffe08a, 4.5, 1000, 0.1);
    await tw(1400, (t) => setPose(roofer, POSES.wave(t * 3)));
  }
  [driver, mate, roofer].forEach((w) => fx.remove(w.root));
  faceDir(van, 1, 0);
  await driveTo(van, [12.8, 0, -9.6], 2200, ease.in, true);
  faceDir(van, 0, 1);
  await driveTo(van, [12.8, STREET_Y, 17.5], 3000, ease.in, true);
  fx.remove(van);
}

// ---------- Entkernung (A+B): Möbel fliegen in den Container, Presslufthammer reißt Wände ein, Schuttrutsche ----------
const makeJackhammer = () => {
  const g = grp('presslufthammer');
  g.add(bx(0.2, 0.5, 0.2, 0xf2a900).at(0, 0.3, 0), bx(0.55, 0.09, 0.09, 0x35383e).at(0, 0.6, 0), bx(0.14, 0.12, 0.14, 0x35383e).at(0, 0.02, 0), cy(0.035, 0.028, 0.5, 0x9aa1a8, 6).at(0, -0.26, 0));
  return g;
};
// Rutsche: Folge von Rohrstücken entlang A -> B (mit leichtem Durchhang)
const makeChute = (A, B) => {
  const g = grp('schuttrutsche'), n = 9, pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([lerp(A[0], B[0], t), lerp(A[1], B[1], t) - Math.sin(Math.PI * t) * 0.35, lerp(A[2], B[2], t)]); }
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    const seg = grp('rohr'); seg.at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    seg.rot[1] = Math.atan2(-dz, dx); seg.rot[2] = Math.atan2(dy, Math.hypot(dx, dz));
    const c = i % 2 ? 0xf2a900 : 0xe58f00;
    seg.add(bx(L * 1.02, 0.1, 1.0, c).at(0, -0.4, 0), bx(L * 1.02, 0.55, 0.1, c).at(0, -0.15, 0.5), bx(L * 1.02, 0.55, 0.1, c).at(0, -0.15, -0.5));
    g.add(seg);
  }
  g.pts = pts;
  return g;
};
const chutePos = (pts, t) => {
  const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i;
  return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k) + 0.25, lerp(pts[i][2], pts[i + 1][2], k)];
};

async function entkernung(ctx) {
  const { engine, house, fx, real } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, burst, puff, toss } = T;
  const itn = house.parts.interior, parts = house.parts;
  const zRow = 15.2, xStop = 3.6;
  house.setView('aussen');
  const outside = new Node(null); fx.add(outside);

  // 1) Absetzkipper bringt den Container
  engine.flyTo({ az: 0.2, el: 0.3, r: 36, target: [2, 1.5, 12.5] }, S(1400));
  const cont = makeContainer(0x3f7fd9);
  const truck = makeSkipTruck(); truck.at(-34, STREET_Y, zRow); outside.add(truck);
  const contPos = await skipDrop(T, { engine, fx: outside }, truck, cont, xStop, zRow, false);
  const contents = new Node(null); cont.add(contents);
  const cx = cont.pos[0];

  // Dachluke + Rutsche (vom Dach in den Container)
  const oldR = parts.roof.oldGroup.visible;
  const roofY = oldR ? parts.roof.oldGroup.pos[1] : parts.roof.group.pos[1];
  const hx = oldR ? Math.max(0.6, Math.min(6.0, cx)) : Math.max(2.7, Math.min(3.3, cx)), sp0 = (oldR ? parts.slopePtOld : parts.slopePt)(1, 0.9, hx);
  const hatchW = [sp0.p[0], roofY + sp0.p[1] + 0.12, sp0.p[2]];
  const hatch = grp('dachluke');
  hatch.add(bx(1.5, 0.12, 1.6, 0x58545e), bx(1.1, 0.14, 1.2, 0x2b2528));
  hatch.at(...hatchW).rotate(sp0.rot, 0, 0); fx.add(hatch); hatch.visible = false;
  const chute = makeChute([hatchW[0], hatchW[1] + 0.1, hatchW[2] + 0.6], [cx - 0.2, STREET_Y + 2.2, zRow - 0.1]);
  chute.visible = false; fx.add(chute);

  // 2) Handwerker kommen an: zwei gehen ins Haus, der dritte bleibt am Container
  const c1 = mk(LOOKS.bau, 12, STREET_Y, 14.0, outside), c2 = mk(LOOKS.bauin, 13.2, STREET_Y, 14.4, outside);
  const w3 = mk(LOOKS.profi, cx + 2.8, STREET_Y, 14.0, outside);
  const doorX = X12();
  await Promise.all([walkTo(c1, [doorX, null, 10.0]), walkTo(c2, [doorX + 0.9, null, 10.6]), walkTo(w3, [cx + 3.2, null, 13.0], { speed: 2.4 })]);
  faceDir(w3.root, -1, 0.3); setPose(w3, POSES.point);
  await Promise.all([walkTo(c1, [doorX, 0.4, 6.9], { speed: 2.5 }), walkTo(c2, [doorX + 0.5, 0.4, 6.7], { speed: 2.5 })]);
  c1.root.visible = false; c2.root.visible = false;
  await wait(250);

  // 3) Möbel fliegen aus Fenstern, Tür und Dachluke in den Container
  engine.flyTo({ az: 0.35, el: 0.38, r: 30, target: [1.5, 1.8, 10.5] }, S(1400));
  hatch.visible = true;
  const winXs = { eg: [2.2, 6.0, 9.0].map((u) => 7.44 - u), kg: [1.9, 5.3, 8.6, 11.3].map((u) => 7.44 - u) };
  const furn = itn.furniture.slice().sort((a, b) => ({ eg: 0, kg: 1, dg: 2 }[a.lvl] - { eg: 0, kg: 1, dg: 2 }[b.lvl]));
  const stuff = [];
  const flying = furn.map((f, i) => (async () => {
    await wait(i * 400);
    const ghost = new Node(f.geo, { color: f.color, shadow: true });
    ghost.pos = [...f.pos]; ghost.scale = [...f.scale]; fx.add(ghost);
    f.visible = false;
    let from;
    if (f.lvl === 'dg') from = [hatchW[0], hatchW[1] + 0.3, hatchW[2]];
    else {
      const xs = winXs[f.lvl], wx = xs.reduce((m, x) => (Math.abs(x - f.pos[0]) < Math.abs(m - f.pos[0]) ? x : m), xs[0]);
      from = [wx, f.lvl === 'eg' ? DIM.egY + 1.2 : DIM.kgY + 0.9, 7.15];
      await tw(260, (t) => { ghost.pos[0] = lerp(f.pos[0], wx, t); ghost.pos[1] = lerp(f.pos[1], from[1], t); ghost.pos[2] = lerp(f.pos[2], 6.4, t); });
      if (f.lvl === 'eg') puff([wx, DIM.egY + 1.2, 7.4], 3, 0.4);
    }
    const k = stuff.length; stuff.push(ghost);
    const dropW = [cx - 1.4 + (k % 4) * 0.95, STREET_Y + 0.5 + Math.floor(k / 4) * 0.42, zRow + ((k * 7) % 3 - 1) * 0.35];
    await toss(ghost, from, dropW, 3.0 + (k % 3) * 0.5, 1250, ease.out);
    ghost.rot[1] = 0.5 * k; ghost.rot[0] = 0;
    burst([dropW[0], dropW[1] + 0.3, dropW[2]], 6, 0xd9d9d9, 2, 450);
    fx.remove(ghost); contents.add(ghost); ghost.at(dropW[0] - cx, dropW[1] - STREET_Y + 0.0, dropW[2] - zRow);
  })());
  const guy = (async () => { for (let i = 0; i < 9; i++) { setPose(w3, POSES.wave(i * 0.5)); await wait(500); } setPose(w3, POSES.thumbs); })();
  await Promise.all([...flying, guy]);
  await wait(300);

  // 4) Innen: Presslufthammer und einstürzende Wände
  outside.visible = false; chute.visible = false; hatch.visible = false;
  house.setView('innen', 'eg');
  engine.flyTo({ az: 0.55, el: 1.0, r: 23, target: [-1.0, 0.4, 2.0] }, S(1500));
  const mkHammerMan = (look, x, y, z) => { const w = mk(look, x, y, z); const h = makeJackhammer(); h.at(0.28, -0.1, 0.0); w.hold.add(h); w.hammer = h; return w; };
  const h1 = mkHammerMan(LOOKS.bau, doorX, DIM.egY, 6.0), h2 = mkHammerMan(LOOKS.bauin, doorX + 0.8, DIM.egY, 5.6);
  const rubble = [], gone = new Set();
  const fixView = () => { itn.furniture.forEach((f) => { f.visible = false; }); gone.forEach((o) => { o.visible = false; }); };
  fixView();
  const collapse = async (o, withDust = true) => {
    const cxw = o.pos[0], czw = o.pos[2], h0 = o.scale[1], base = o.base;
    const bits = [];
    for (let i = 0; i < 7; i++) {
      const b = bx(0.22 + Math.random() * 0.25, 0.2 + Math.random() * 0.2, 0.22 + Math.random() * 0.25, [0xdca17a, 0xc98a63, 0xb7b0a6, 0xe6d8bc][i % 4], { outline: false });
      b.at(cxw + (Math.random() - 0.5) * 1.6, base + h0 * (0.3 + Math.random() * 0.7), czw + (Math.random() - 0.5) * 1.6); b.vy = 0; b.y0 = base + 0.12;
      fx.add(b); bits.push(b); rubble.push(b);
    }
    if (withDust) puff([cxw, base + 0.8, czw], 4, 0.7);
    await tw(650, (t) => {
      o.scale[1] = Math.max(0.001, h0 * (1 - ease.in(t))); o.pos[1] = base + o.scale[1] / 2;
      for (const b of bits) { b.vy -= 0.02; b.pos[1] = Math.max(b.y0, b.pos[1] + b.vy); }
    });
    o.visible = false; gone.add(o);
  };
  const hammerAt = async (w, o, ms = 1100) => {
    const off = o.ax === 'u' ? [1.0, 0] : [0, 1.0];
    const to = [o.pos[0] + off[0], w.root.pos[1], o.pos[2] + off[1]];
    await walkTo(w, to, { speed: 2.6 });
    faceDir(w.root, -off[0], -off[1]); setPose(w, POSES.push);
    const y0 = w.root.pos[1], ox = o.pos[0], oz = o.pos[2];
    await tw(ms, (t) => {
      w.root.pos[1] = y0 + Math.abs(Math.sin(t * 90)) * 0.03; w.hammer.pos[1] = -0.1 + Math.sin(t * 160) * 0.07;
      o.pos[0] = ox + Math.sin(t * 140) * 0.02; o.pos[2] = oz + Math.cos(t * 150) * 0.02;
      if (Math.random() < 0.4) burst([ox, o.base + 1.1, oz], 3, 0xffe9a0, 2.2, 350);
    });
    w.root.pos[1] = y0; o.pos[0] = ox; o.pos[2] = oz;
    await collapse(o);
  };
  const egW = itn.old.filter((o) => o.lvl === 'eg' && o.visible), dgW = itn.old.filter((o) => o.lvl === 'dg' && o.visible), kgW = itn.old.filter((o) => o.lvl === 'kg' && o.visible);
  const team = async (w, list) => { for (const o of list) await hammerAt(w, o); };
  await Promise.all([team(h1, egW.filter((_, i) => i % 2 === 0)), team(h2, egW.filter((_, i) => i % 2 === 1))]);
  // Dachgeschoss: die Arbeiter gehen hinauf
  house.setView('innen', 'dg'); fixView();
  engine.flyTo({ az: 0.55, el: 1.0, r: 23, target: [-1.0, 3.2, 2.0] }, S(1200));
  await Promise.all([walkTo(h1, [dgW[0].pos[0] + 1.0, DIM.dgY, dgW[0].pos[2]], { speed: 1.6 }), walkTo(h2, [dgW[1].pos[0], DIM.dgY, dgW[1].pos[2] + 1.0], { speed: 1.6 })]);
  await Promise.all([team(h1, dgW.filter((_, i) => i % 2 === 0)), team(h2, dgW.filter((_, i) => i % 2 === 1))]);
  setPose(h1, POSES.idle); setPose(h2, POSES.idle);
  // Rest bricht in einer Welle zusammen
  house.setView('innen', 'kg'); fixView();
  engine.flyTo({ az: 0.5, el: 1.0, r: 24, target: [-1, -1.8, 2.5] }, S(1200));
  await wait(500);
  setPose(h1, POSES.wave(0)); setPose(h2, POSES.thumbs);
  h1.root.visible = false; h2.root.visible = false;
  const rest = kgW.slice().sort((a, b) => a.pos[0] - b.pos[0]);
  await Promise.all(rest.map((o, i) => wait(i * 170).then(() => collapse(o))));
  await wait(400);

  // 5) Außen: Schutt rutscht über die Rutsche in den Container
  outside.visible = true; hatch.visible = true; chute.visible = true;
  house.setView('aussen');
  engine.flyTo({ az: 0.3, el: 0.3, r: 30, target: [1.5, 1.2, 10.5] }, S(1400));
  faceDir(w3.root, -1, 0.3);
  const mound = bx(3.4, 0.4, 1.5, 0xb7b0a6, { outline: false }); mound.at(0, 0.38, 0); contents.add(mound);
  const chunks = [];
  const N = 18;
  for (let i = 0; i < N; i++) {
    chunks.push((async () => {
      await wait(i * 150);
      const b = bx(0.3 + Math.random() * 0.3, 0.3, 0.3 + Math.random() * 0.2, [0xdca17a, 0xc98a63, 0xb7b0a6, 0xe6d8bc][i % 4], { outline: false });
      fx.add(b);
      await tw(1100, (t) => { const p = chutePos(chute.pts, ease.in(t * 0.85 + 0.15 * t)); b.pos[0] = p[0]; b.pos[1] = p[1]; b.pos[2] = p[2]; b.rot[0] += 0.2; b.rot[2] += 0.15; });
      const dest = [cx - 1.3 + (i % 5) * 0.65, STREET_Y + 0.5 + 0.5 * (i / N), zRow + ((i * 5) % 3 - 1) * 0.4];
      await toss(b, [b.pos[0], b.pos[1], b.pos[2]], dest, 0.4, 330, ease.in);
      fx.remove(b);
      mound.size(1, 1 + i / N * 1.4, 1); mound.pos[1] = 0.2 + 0.2 * (1 + i / N * 1.4);
      if (i % 3 === 0) puff([cx - 0.6 + (i % 5) * 0.3, STREET_Y + 1.2, zRow], 2, 0.6);
    })());
  }
  const cheer = (async () => { for (let i = 0; i < 15; i++) { setPose(w3, POSES.wave(i * 0.6)); await wait(250); } setPose(w3, POSES.idle); })();
  await Promise.all([...chunks, cheer]);
  rubble.forEach((b) => fx.remove(b));
  await wait(300);

  // 6) Container wird abgeholt
  fx.remove(chute); fx.remove(hatch);
  const truck2 = makeSkipTruck(); truck2.at(-34, STREET_Y, zRow); outside.add(truck2);
  const wk2 = walkTo(w3, [cx + 4.5, null, 12.5], { speed: 2.4 });
  await skipDrop(T, { engine, fx: outside }, truck2, cont, xStop, zRow, true);
  await wk2;
  // Finale: leeres Haus, Staub verzieht sich
  outside.visible = false;
  house.setProgress({ ...house.state.p, entkernung: real?.entkernung ?? 100 });
  house.setView('innen', 'eg');
  itn.old.forEach((o) => { o.visible = false; }); itn.furniture.forEach((f) => { f.visible = false; });
  await engine.flyTo({ az: 0.5, el: 1.0, r: 26, target: [0, -0.8, 2.5] }, S(1200));
  await burst([0, 1.0, 3], 30, 0xffffff, 3, 1100, 0.05);
}

// ---------- Aufstockung (A): Autokran hebt das alte Dach ab, das Obergeschoss wächst Steinreihe für Steinreihe ----------
const makeCrane = () => {
  const g = grp('autokran');
  const Y = 0xf2b400;
  g.add(bx(9.2, 0.55, 2.5, 0x3a3f46).at(0, 0.95, 0), bx(1.9, 1.6, 2.4, Y).at(4.0, 1.9, 0), bx(0.06, 0.8, 2.0, 0x9fe0f7, { outline: false }).at(4.98, 2.2, 0), bx(6.9, 0.3, 2.5, Y).at(-1.3, 1.3, 0));
  g.add(bx(0.4, 0.3, 0.6, 0xff4b3a, { outline: false }).at(-4.7, 1.0, 0.9), bx(0.4, 0.3, 0.6, 0xff4b3a, { outline: false }).at(-4.7, 1.0, -0.9));
  g.wheels = [];
  for (const x of [3.6, 1.4, -1.4, -3.6]) for (const z of [-1.2, 1.2]) { const w = A.wheel(0.5, 0.36).at(x, 0.5, z); g.add(w); g.wheels.push(w); }
  // Stützen
  const legs = [];
  for (const x of [2.6, -3.2]) for (const sg of [-1, 1]) {
    const beam = bx(0.32, 0.3, 1, 0x4a4f56).at(x, 1.0, sg * 1.5), jack = bx(0.2, 1, 0.2, 0xe0553f), pad = bx(0.9, 0.16, 0.9, 0x35383e);
    g.add(beam, jack, pad); legs.push({ x, sg, beam, jack, pad });
  }
  g.deploy = (k) => {
    for (const l of legs) {
      const ext = 1.5 * k, padY = lerp(0.95, 0.08, Math.max(0, (k - 0.5) * 2));
      l.beam.size(1, 1, Math.max(ext, 0.01)).at(l.x, 1.0, l.sg * (1.2 + ext / 2));
      l.pad.at(l.x, padY, l.sg * (1.2 + ext)).visible = k > 0.05;
      const h = Math.max(1.0 - padY, 0.01); l.jack.size(1, h, 1).at(l.x, 1.0 - h / 2, l.sg * (1.2 + ext)); l.jack.visible = k > 0.5;
    }
  };
  g.deploy(0);
  const turret = grp('drehkranz').at(-1.3, 1.45, 0);
  turret.add(bx(2.4, 1.1, 2.3, Y).at(0, 0.3, 0), bx(1.0, 0.8, 1.0, 0x9fe0f7, { outline: false }).at(0.9, 0.7, 0.4), bx(1.0, 0.4, 2.0, 0x4a4f56).at(-1.3, 0.2, 0));
  const boom = grp('ausleger').at(0, 0.9, 0);
  boom.add(bx(1, 0.8, 0.8, Y).at(0.5, 0, 0), bx(1, 0.5, 0.9, 0xe9e6df, { outline: false }).at(0.5, 0, 0));
  turret.add(boom); g.add(turret);
  g.turret = turret; g.boom = boom;
  // Seil + Haken liegen in der Welt (nicht am Kranwagen)
  g.rig = grp('seil'); const cable = bx(0.06, 1, 0.06, 0x2b2e34, { outline: false }), hook = bx(0.35, 0.4, 0.35, 0xe0553f);
  g.rig.add(cable, hook);
  g.aim = (H, cableLen = 3.5) => {
    const P = [g.pos[0] - 1.3, g.pos[1] + 2.35, g.pos[2]];
    const tip = [H[0], H[1] + cableLen, H[2]];
    const dx = tip[0] - P[0], dz = tip[2] - P[2], hz = Math.hypot(dx, dz), dy = tip[1] - P[1];
    turret.rot[1] = Math.atan2(-dz, dx); boom.rot[2] = Math.atan2(dy, hz); boom.size(Math.max(Math.hypot(hz, dy), 3), 1, 1);
    cable.size(1, cableLen, 1).at(H[0], H[1] + cableLen / 2, H[2]); hook.at(H[0], H[1], H[2]);
  };
  return g;
};
const makePallet = () => {
  const g = grp('palette');
  g.add(bx(1.7, 0.16, 1.2, 0xc8964f).at(0, 0.08, 0));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.add(bx(0.52, 0.34, 0.5, 0xd9946b).at(-0.56 + i * 0.56, 0.33, -0.28 + j * 0.56), bx(0.52, 0.34, 0.5, 0xc7835c).at(-0.56 + i * 0.56, 0.69, -0.28 + j * 0.56));
  return g;
};

async function aufstockung(ctx) {
  const { engine, house, fx } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, driveTo, burst, puff } = T;
  const parts = house.parts, roof = parts.roof;
  const roofY = roof.oldGroup.pos[1], hasOld = (house.state.p.dach ?? 0) <= 0;
  const zRow = 15.2, cxs = 2.0;
  const TOPMAX = DIM.knee + 7.2 * Math.tan(DIM.pitch);
  const Lof = (s) => lerp(DIM.hDG0, TOPMAX + 0.02, s);
  const setS = (p) => house.setProgress({ ...house.state.p, aufstockung: p });
  house.setView('aussen');

  // 1) Autokran fährt vor und stützt sich ab
  engine.flyTo({ az: 0.25, el: 0.32, r: 40, target: [0, 3, 8] }, S(1400));
  const crane = makeCrane(); crane.at(-34, STREET_Y, zRow); fx.add(crane, crane.rig);
  const Hrest = [cxs, 6.5, zRow - 3.5];
  crane.aim(Hrest);
  await driveTo(crane, [cxs, STREET_Y, zRow], 3200, ease.out);
  crane.aim(Hrest);
  await tw(1300, (t) => { crane.deploy(t); crane.aim(Hrest); });
  const w1 = mk(LOOKS.bau, cxs + 5.5, STREET_Y, 14.2), w2 = mk(LOOKS.profi, cxs + 6.5, STREET_Y, 14.6);
  faceDir(w1.root, -1, -0.3); setPose(w1, POSES.point); faceDir(w2.root, -1, -0.3);

  // 2) Altes Walmdach anschlagen und abheben
  const op = roof.oldParts;
  const C = [(op[0].cx + op[1].cx) / 2, (op[0].cz + op[1].cz) / 2];
  const ground = new Node(null); fx.add(ground);
  const ghost = grp('altesDach'); ground.add(ghost);
  if (hasOld) {
    for (const rp of op) { const g = grp('gd').at(rp.cx - C[0], 0, rp.cz - C[1]); g.rot[1] = rp.rotY; g.add(new Node(rp.node.geo, { color: hex(0xc9633b), shadow: true })); ghost.add(g); }
    const beam = bx(7.6, 0.2, 0.2, 0x4a4f56).at(0, 3.6, 0);
    const s1 = bx(4.05, 0.07, 0.07, 0x2b2e34, { outline: false }).at(1.8, 4.5, 0); s1.rot[2] = -0.4636;
    const s2 = bx(4.05, 0.07, 0.07, 0x2b2e34, { outline: false }).at(-1.8, 4.5, 0); s2.rot[2] = 0.4636;
    ghost.add(beam, s1, s2);
  }
  let H = [...Hrest];
  const go = async (to, ms, e = ease.inOut, payload = null, off = 0) => {
    const from = [...H];
    await tw(ms, (t) => {
      H = [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)];
      crane.aim(H);
      if (payload) payload.at(H[0], H[1] - off, H[2]);
    }, e);
  };
  engine.flyTo({ az: 0.3, el: 0.35, r: 34, target: [-0.5, 5, 6] }, S(1400));
  const hook0 = [C[0], roofY + 5.4, C[1]];
  await go([C[0], hook0[1] + 3, C[1] + 2], 2200);
  const rg = mk(LOOKS.profi, op[0].cx + 1.2, roofY + 1.85, 3.2, fx);
  faceDir(rg.root, 0, 1); setPose(rg, POSES.wave(0));
  await go(hook0, 1600, ease.inOut);
  await tw(700, (t) => setPose(rg, POSES.wave(t * 4)));
  setPose(rg, POSES.thumbs);
  ghost.at(C[0], roofY, C[1]); ghost.visible = true;
  if (hasOld) setS(0.01);
  burst([C[0], roofY + 5.4, C[1]], 10, 0xffe9a0, 2, 500);
  await wait(500);
  fx.remove(rg.root); puff([rg.root.pos[0], rg.root.pos[1], rg.root.pos[2]], 3, 0.5);
  const lift = [C[0], hook0[1] + 6.5, C[1]];
  await go(lift, 2400, ease.inOut, ghost, 5.4);
  engine.flyTo({ az: 0.9, el: 0.45, r: 40, target: [-0.5, 4, 0] }, S(2600));
  const away = [C[0], lift[1], -9.5];
  await go(away, 3600, ease.inOut, ghost, 5.4);
  await go([C[0], 5.5, -9.5], 2200, ease.inOut, ghost, 5.4);
  puff([C[0] - 3, 0.5, -9.5], 6, 1.0); puff([C[0] + 3, 0.5, -9.5], 6, 1.0);
  await wait(500);
  await tw(900, (t) => { ghost.size(1 - t * 0.9); ghost.opacity = 1 - t; });
  puff([C[0], 0.8, -9.5], 8, 1.2);
  ground.remove(ghost);
  if (!hasOld) setS(0.01);

  // 3) Gerüst am Westgiebel + Palette mit Steinen
  engine.flyTo({ az: 0.8, el: 0.3, r: 30, target: [2.5, 4, 3] }, S(1500));
  const scaf = grp('geruest'); fx.add(scaf);
  const gx = 7.44 + 1.3, zs = [-0.3, 2.3, 4.9, 6.9];
  const posts = [];
  for (const z of zs) for (const x of [gx - 0.55, gx + 0.65]) { const p = bx(0.12, 1, 0.12, 0x9aa1a8, { outline: false }); scaf.add(p); posts.push({ p, x, z }); }
  const plat = bx(1.3, 0.1, 7.8, 0xc8964f).at(gx, 0, 3.3), rail = bx(0.06, 0.06, 7.8, 0x9aa1a8, { outline: false }).at(gx + 0.65, 0, 3.3);
  scaf.add(plat, rail);
  const setScaf = (L) => {
    const py = Math.max(DIM.dgY + 0.1, DIM.dgY + L - 1.25);
    plat.pos[1] = py; rail.pos[1] = py + 1.0;
    posts.forEach(({ p, x, z }) => { const h = py + 1.4; p.size(1, h, 1).at(x, h / 2, z); });
    return py;
  };
  let py = setScaf(Lof(0));
  const b1 = mk(LOOKS.bau, gx, py, 1.0, fx), b2 = mk(LOOKS.bauin, gx, py, 5.6, fx);
  faceDir(b1.root, -1, 0); faceDir(b2.root, -1, 0);
  const pal = makePallet(); fx.add(pal); pal.at(cxs - 1.5, terrainY(12.4), 12.4);
  await go([cxs - 1.5, 4, 12.4], 1500);
  await go([cxs - 1.5, 1.6, 12.4], 900);
  await wait(300);
  await go([gx, DIM.dgY + 5.5, 3.3], 2600, ease.inOut, pal, 1.6);
  await go([gx, py + 1.9, 3.3], 1200, ease.inOut, pal, 1.6);
  pal.at(gx, py + 0.08, 3.3);
  await go([cxs, 7, zRow - 4], 1500);

  // 4) Giebel, Wand zum ausgeschnittenen Teil und Rückwand wachsen Reihe für Reihe bis unter das Dach
  engine.flyTo({ az: 0.85, el: 0.32, r: 26, target: [1.5, 5, 2.5] }, S(1400));
  const rows = 16;
  const layL = (async () => { for (let i = 0; i < rows * 3; i++) { setPose(b1, { ...POSES.push, lArm: 1.0 + Math.sin(i * 1.3) * 0.25 }); walkTo(b1, [gx, b1.root.pos[1], 0.8 + (i % 3) * 1.0], { speed: 2 }); await wait(190); } })();
  for (let k = 1; k <= rows; k++) {
    const sk = k / rows;
    setS(sk * 100);
    py = setScaf(Lof(sk));
    b1.root.pos[1] = py; b2.root.pos[1] = py;
    setPose(b2, { ...POSES.push, rArm: 1.0 + (k % 2) * 0.4 });
    pal.size(1, 1 - sk * 0.7, 1); pal.pos[1] = py + 0.08;
    if (k % 2 === 0) burst([gx - 1, DIM.dgY + Lof(sk), 1 + (k % 4)], 4, 0xd9946b, 1.5, 400);
    if (k === 6) engine.flyTo({ az: 0.9, el: 0.3, r: 28, target: [1.5, 6, 2.5] }, S(1500));
    await wait(560);
  }
  await layL;
  setS(100);
  setPose(b1, POSES.wave(0)); setPose(b2, POSES.thumbs);
  await burst([0, DIM.dgY + 5, 0], 24, 0xffd166, 4, 1000, 0.1);
  await wait(500);

  // 5) Abbau, Kran fährt ab
  scaf.visible = false; fx.remove(pal);
  fx.remove(b1.root); fx.remove(b2.root); fx.remove(w1.root); fx.remove(w2.root);
  fx.remove(crane.rig);
  await tw(1000, (t) => crane.deploy(1 - t));
  await driveTo(crane, [cxs + 40, STREET_Y, zRow], 2800, ease.in);
  fx.remove(crane);
}

// ---------- Dach (A): Sparren schweben ein, Ziegelreihen fallen von unten nach oben ----------
async function dach(ctx) {
  const { engine, house, fx } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, driveTo, burst, puff } = T;
  const parts = house.parts, roof = parts.roof, rY = roof.group.pos[1];
  house.setView('aussen');
  house.setProgress({ ...house.state.p, dach: 1 });
  parts.chimney.visible = false; parts.dormers.visible = false; parts.skylights.visible = false;
  const rafters = roof.raf.children.map((c) => { const r = { c, rest: [...c.pos], rot: [...c.rot] }; c.visible = false; return r; });
  engine.flyTo({ az: 0.3, el: 0.4, r: 38, target: [0, 6, 2] }, S(1400));

  // Transporter bringt die Dachdecker
  const van = makeVan(0xf4f1ea, 0x2f7be0); van.at(-12, STREET_Y, 15.4); fx.add(van);
  await driveTo(van, [4.5, STREET_Y, 15.4], 3000, ease.out, false);
  const r1 = mk(LOOKS.bau, 6.5, STREET_Y, 14.0), r2 = mk(LOOKS.bauin, 7.4, STREET_Y, 14.4);
  faceDir(r1.root, 0, -1); faceDir(r2.root, 0, -1);
  await Promise.all([walkTo(r1, [3.2, null, 10.0], { speed: 2.6 }), walkTo(r2, [4.4, null, 10.3], { speed: 2.6 })]);
  setPose(r1, POSES.point); setPose(r2, POSES.thumbs);

  // 1) Sparren fliegen ein
  await wait(300);
  rafters.sort((a, b) => a.rest[0] - b.rest[0]);
  const fly = rafters.map((r, i) => (async () => {
    await wait(i * 38);
    const { c, rest, rot } = r;
    c.visible = true;
    const from = [rest[0] + (Math.random() - 0.5) * 5, rest[1] + 9 + Math.random() * 3, rest[2] + (Math.random() - 0.5) * 5];
    c.pos = [...from]; c.rot[1] = rot[1] + (Math.random() - 0.5) * 1.6; c.rot[0] = rot[0] + (Math.random() - 0.5) * 0.8;
    await tw(900, (t) => {
      c.pos[0] = lerp(from[0], rest[0], t); c.pos[1] = lerp(from[1], rest[1], t); c.pos[2] = lerp(from[2], rest[2], t);
      c.rot[1] = lerp(c.rot[1], rot[1], t); c.rot[0] = lerp(c.rot[0], rot[0], t);
    }, ease.out);
    c.pos = [...rest]; c.rot = [...rot];
  })());
  await Promise.all(fly);
  burst([0, rY + 4, 0], 14, 0xe2b873, 3, 600);
  await wait(300);

  // 2) Dachschalung + Blenden
  house.setProgress({ ...house.state.p, dach: 26 });
  roof.deck.forEach((dk) => { dk.opacity = 0; });
  await tw(900, (t) => roof.deck.forEach((dk) => { dk.opacity = t; }));
  roof.deck.forEach((dk) => { dk.opacity = 1; });
  const RX = 3.0;
  const eaveAt = (s) => { const q = parts.slopePt(1, s, RX); return [q.p[0], rY + q.p[1] - 0.3, q.p[2]]; };
  puff([3.2, 0.5, 10], 4, 0.5);
  r1.root.pos = [...eaveAt(0.3)]; r2.root.pos = [...eaveAt(0.3)]; r2.root.pos[0] += 1.0; faceDir(r1.root, 0, -1); faceDir(r2.root, 0, -1);
  engine.flyTo({ az: 0.25, el: 0.4, r: 32, target: [0, 6, 3] }, S(1300));

  // 3) Ziegelreihen fallen von unten nach oben (beide Dachseiten, vorne mit Loggia-Aussparung)
  [...roof.rows.front, ...roof.rows.back].forEach((r) => { r.visible = false; });
  const rowFall = async (r) => {
    const rest = [...r.pos]; r.visible = true;
    r.pos[1] = rest[1] + 5.5;
    await tw(480, (t) => { r.pos[1] = lerp(rest[1] + 5.5, rest[1], t * t); });
    r.pos = rest;
  };
  for (let i = 0; i < roof.nRows; i++) {
    const jobs = [rowFall(roof.rows.front[i]), rowFall(roof.rows.back[i])];
    const s = (i + 0.5) * roof.rowLen + 0.4;
    r1.root.pos = [...eaveAt(Math.min(s, roof.slopeLen - 0.4))]; setPose(r1, i % 2 ? POSES.push : POSES.carry);
    r2.root.pos[1] = r1.root.pos[1]; r2.root.pos[2] = r1.root.pos[2]; setPose(r2, i % 2 ? POSES.carry : POSES.push);
    await Promise.all([...jobs, wait(280)]);
    if (i % 3 === 2) burst([r1.root.pos[0], r1.root.pos[1] + 0.5, r1.root.pos[2]], 6, 0x6a6672, 2, 450);
  }
  await wait(300);

  // 4) Kamin, Gauben, Dachfenster
  const pop = async (node, ms = 600) => { node.visible = true; await tw(ms, (t) => { node.size(1 + Math.sin(t * Math.PI) * 0.25 * (1 - t)); }, ease.out); node.size(1); };
  await Promise.all([pop(parts.chimney), pop(parts.dormers, 800), pop(parts.skylights, 800)]);
  roof.raf.visible = false;
  house.setProgress({ ...house.state.p, dach: 100 });
  burst([0, rY + 5, 0], 28, 0xffd166, 4, 1100, 0.1);
  setPose(r1, POSES.wave(0)); setPose(r2, POSES.thumbs);
  await tw(1200, (t) => setPose(r1, POSES.wave(t * 3)));
  puff([r1.root.pos[0], r1.root.pos[1], r1.root.pos[2]], 3, 0.5);
  fx.remove(r1.root); fx.remove(r2.root);
  await driveTo(van, [40, STREET_Y, 15.4], 2600, ease.in, false);
  fx.remove(van);
}

// ---------- Gemeinsame Helfer für Innen-Gewerke ----------
const makeDrum = () => {
  const g = grp('kabeltrommel'), spin = grp('trommel');
  for (const z of [0.3, -0.3]) spin.add(cy(0.5, 0.5, 0.06, 0xe58f00, 10).rotate(Math.PI / 2, 0, 0).at(0, 0, z));
  spin.add(cy(0.28, 0.28, 0.56, 0x2b2e34, 8).rotate(Math.PI / 2, 0, 0));
  g.add(spin); g.spin = spin;
  return g;
};
const makeToolbox = (c = 0xe0553f) => { const g = grp('werkzeugkiste'); g.add(bx(0.5, 0.28, 0.3, c).at(0, 0, 0), bx(0.3, 0.06, 0.06, 0x35383e).at(0, 0.18, 0)); return g; };
// Handwerker steigen aus dem Transporter und gehen zur Haustür; Rückgabe der Figuren (unsichtbar nach dem Betreten)
async function crewArrive(ctx, T, outside, { van: vc = [0xf4f1ea, 0xf2a900], looks = [LOOKS.bau, LOOKS.bauin], carry = null } = {}) {
  const { engine } = ctx;
  const { S, mk, walkTo, driveTo, wait, tw } = T;
  engine.flyTo({ az: 0.2, el: 0.3, r: 36, target: [0, 1.5, 11] }, S(1400));
  const van = makeVan(vc[0], vc[1]); van.at(-12, STREET_Y, 15.4); outside.add(van);
  await driveTo(van, [4.5, STREET_Y, 15.4], 3000, ease.out, false);
  const c1 = mk(looks[0], 6.3, STREET_Y, 14.0, outside), c2 = mk(looks[1], 7.2, STREET_Y, 14.4, outside);
  const doorX = X12();
  let item = null;
  if (carry) { item = carry(); c2.hold.add(item); item.at(0.1, 0.1, 0); }
  return { van, c1, c2, doorX, enter: async (extra) => {
    const jobs = [walkTo(c1, [doorX, null, 9.5], { speed: 2.8 }), walkTo(c2, [doorX + 0.9, null, 9.9], { speed: 2.8, carry: !!item })];
    if (extra) jobs.push(extra());
    await Promise.all(jobs);
    await Promise.all([walkTo(c1, [doorX, 0.4, 6.9], { speed: 2.5 }), walkTo(c2, [doorX + 0.5, 0.4, 6.7], { speed: 2.5 })]);
    c1.root.visible = false; c2.root.visible = false;
  } };
}

// ---------- Elektro (B): Transporter, Kabeltrommel, Kabel wachsen, Steckdosen poppen mit Funken ----------
async function elektro(ctx) {
  const { engine, house, fx } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, driveTo, burst } = T;
  const itn = house.parts.interior;
  house.setView('aussen');
  const outside = new Node(null); fx.add(outside);
  const crew = await crewArrive(ctx, T, outside, { carry: () => makeToolbox() });
  const drum = makeDrum(); outside.add(drum);
  const dFrom = [crew.van.pos[0] - 1.2, terrainY(13.6) + 0.5, 13.6], dTo = [crew.doorX, 0.5, 8.0];
  drum.at(...dFrom);
  const roll = async () => {
    const dx = dTo[0] - dFrom[0], dz = dTo[2] - dFrom[2], dist = Math.hypot(dx, dz);
    drum.rot[1] = Math.atan2(-dz, dx) + Math.PI / 2;
    await tw(dist / 2.4 * 1000, (t) => { drum.pos[0] = lerp(dFrom[0], dTo[0], t); drum.pos[2] = lerp(dFrom[2], dTo[2], t); drum.pos[1] = terrainY(drum.pos[2]) + 0.5; drum.spin.rot[2] -= dist / 0.5 / 60; });
  };
  await crew.enter(roll);
  outside.visible = false;

  const shown = new Set();
  const fixView = () => { itn.sockets.forEach((n) => { n.visible = shown.has(n); }); itn.cables.forEach((n) => { n.visible = shown.has(n); }); };
  const E1 = mk(LOOKS.bau, 0, 0, 0), E2 = mk(LOOKS.bauin, 0, 0, 0);
  E1.root.visible = false; E2.root.visible = false;
  const Ls = [14.2, 7.6, 13.4], axes = [0, 2, 2];
  const levels = [['kg', DIM.kgY, 'kg', -1.8], ['eg', DIM.egY, 'eg', 0.6], ['dg', DIM.dgY, 'dg', 3.2]];
  for (const [lvl, y0, floor, ty] of levels) {
    house.setView('innen', floor); fixView();
    engine.flyTo({ az: 0.55, el: 1.0, r: 22, target: [-0.5, ty, 2.5] }, S(1300));
    const cabs = itn.cables.filter((c) => c.lvl === lvl), socks = itn.sockets.filter((c) => c.lvl === lvl);
    // Position der Figuren: E1 bei der Trommel (Kabelanfang), E2 geht zu den Steckdosen
    E1.root.visible = true; E2.root.visible = true;
    E1.root.pos = [-5.5, y0, 6.0]; E2.root.pos = [-4.5, y0, 5.6];
    setPose(E1, POSES.carry);
    const dr = makeDrum(); fx.add(dr);
    const laying = (async () => {
      for (let i = 0; i < cabs.length; i++) {
        const c = cabs[i], L = Ls[i], ax = axes[i];
        const anchor = c.pos[ax] + L / 2, base = [...c.pos], dirv = ax === 0 ? [-1, 0] : [0, -1];
        const startPt = [c.pos[0], c.pos[2]]; startPt[ax === 0 ? 0 : 1] = anchor;
        dr.at(startPt[0], y0 + 0.5, startPt[1]); dr.rot[1] = ax === 0 ? 0 : Math.PI / 2;
        // Figur geht zum Kabelanfang
        await walkTo(E1, [startPt[0] - dirv[0] * 0.2 + (ax === 0 ? 0 : 0.9), y0, startPt[1] + (ax === 0 ? 0.9 : 0)], { speed: 3.2 });
        c.visible = true; shown.add(c);
        faceDir(E1.root, dirv[0], dirv[1]);
        await tw(L / 8.5 * 1000, (t) => {
          c.scale[ax] = Math.max(t, 0.001); c.pos[ax] = anchor - t * L / 2;
          const head = anchor - t * L;
          E1.root.pos[ax === 0 ? 0 : 2] = head + (ax === 0 ? 0 : 0);
          E1.root.pos[ax === 0 ? 2 : 0] = startPt[ax === 0 ? 1 : 0] + 0.9;
          dr.spin.rot[2] += 0.25; setPose(E1, walkPose(t * L * 2.2, 1));
        });
        c.scale[ax] = 1; c.pos = base;
      }
      setPose(E1, POSES.thumbs);
    })();
    const popping = (async () => {
      for (const n of socks) {
        const x = n.pos[0], z = n.pos[2], cdx = -0.5 - x, cdz = 1.5 - z, d = Math.hypot(cdx, cdz) || 1;
        await walkTo(E2, [x + cdx / d * 1.0, y0, z + cdz / d * 1.0], { speed: 3.4 });
        faceDir(E2.root, -cdx, -cdz); setPose(E2, POSES.point);
        await wait(150);
        n.visible = true; shown.add(n);
        burst([x, n.pos[1] + 0.1, z], 8, 0x9fd8ff, 3, 450);
        burst([x, n.pos[1] + 0.1, z], 5, 0xffe36e, 3.5, 350);
        await tw(380, (t) => { n.size(1 + Math.sin(t * Math.PI) * 0.9); }); n.size(1);
      }
      setPose(E2, POSES.thumbs);
    })();
    await Promise.all([laying, popping]);
    fx.remove(dr);
    await wait(400);
  }
  E1.root.visible = false; E2.root.visible = false;

  // Finale: Strom an, alle Fenster leuchten
  house.setView('aussen');
  outside.visible = true; crew.van.visible = true; crew.c1.root.visible = true; crew.c2.root.visible = true; drum.visible = false;
  crew.c1.root.pos = [crew.doorX, 0.4, 6.9]; crew.c2.root.pos = [crew.doorX + 0.5, 0.4, 6.7];
  engine.flyTo({ az: 0.35, el: 0.3, r: 34, target: [0, 2.5, 8] }, S(1400));
  await Promise.all([walkTo(crew.c1, [crew.doorX, 0.4, 9.8], { speed: 2.4 }), walkTo(crew.c2, [crew.doorX + 1.0, 0.4, 10.0], { speed: 2.4 })]);
  faceDir(crew.c1.root, 0, 1); faceDir(crew.c2.root, 0, 1);
  house.setLit(false); await wait(500);
  house.setLit(true); burst([crew.doorX, 3.5, 7], 18, 0xffe08a, 4, 900, 0.1);
  await Promise.all([wait(800), tw(1300, (t) => { setPose(crew.c1, POSES.wave(t * 3)); setPose(crew.c2, POSES.thumbs); })]);
  house.setLit(null);
  outside.remove(crew.c1.root); outside.remove(crew.c2.root);
  await Promise.all([walkTo(crew.c1, [4.5, null, 14.4], { speed: 2.6 }).catch(() => {})]);
  await driveTo(crew.van, [40, STREET_Y, 15.4], 2600, ease.in, false);
}

// ---------- Sanitär (A) inkl. Fußbodenheizung ----------
async function sanitaer(ctx) {
  const { engine, house, fx } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, driveTo, burst, puff } = T;
  const itn = house.parts.interior;
  house.setView('aussen');
  const outside = new Node(null); fx.add(outside);
  const crew = await crewArrive(ctx, T, outside, { van: [0xf4f1ea, 0x2f7be0], looks: [LOOKS.profi, LOOKS.bau], carry: () => { const g = grp('rohre'); g.add(bx(0.9, 0.08, 0.08, 0x3f93ea).at(0, 0, 0.1), bx(0.9, 0.08, 0.08, 0xea4d3f).at(0, 0.1, -0.1)); return g; } });
  await crew.enter();
  outside.visible = false;

  const shown = new Set();
  const stackPipes = itn.pipes.filter((p) => !p.flat), flatPipes = itn.pipes.filter((p) => p.flat);
  const fixView = () => {
    itn.pipes.forEach((p) => { p.visible = shown.has(p); });
    itn.fbh.forEach((f) => { f.visible = shown.has(f); });
    itn.fixtures.forEach((f) => { f.visible = shown.has(f); });
  };
  const P1 = mk(LOOKS.profi, 0, 0, 0), P2 = mk(LOOKS.bau, 0, 0, 0);
  const stackX = stackPipes[0].pos[0], stackZ = stackPipes[0].pos[2];
  const drops = async (n = 14, color = 0x6fb8ff) => {
    const bits = [];
    for (let i = 0; i < n; i++) { const b = sp(0.1, color, { outline: false, emissive: 1, unlit: true }); b.at(stackX + (i % 2) * 0.28, DIM.dgY + 2.3, stackZ); fx.add(b); bits.push(b); }
    await tw(1500, (t) => bits.forEach((b, i) => { const k = Math.max(0, Math.min(1, t * 1.6 - i * 0.05)); b.pos[1] = lerp(DIM.dgY + 2.3, DIM.kgY + 0.1, k); b.visible = k > 0 && k < 1; }));
    bits.forEach((b) => fx.remove(b));
  };

  // 1) Steigleitung wächst durch alle Geschosse
  house.setView('innen', 'dg'); fixView();
  engine.flyTo({ az: 0.6, el: 0.75, r: 17, target: [stackX, 1.0, stackZ] }, S(1400));
  P1.root.visible = true; P2.root.visible = true;
  P1.root.pos = [stackX + 1.0, DIM.kgY, stackZ + 0.8]; P2.root.pos = [stackX + 1.0, DIM.egY, stackZ + 0.8];
  faceDir(P1.root, -1, -0.5); faceDir(P2.root, -1, -0.5);
  stackPipes.forEach((p) => { p.visible = true; shown.add(p); });
  const flows = [];
  await tw(4200, (t) => {
    for (const p of stackPipes) { const h = Math.max(p.total * t, 0.001); p.scale[1] = h / p.total; p.pos[1] = p.baseY + h / 2; }
    P1.root.pos[1] = DIM.kgY + Math.min(0.9 * t, 0.9) * 0; setPose(P1, POSES.push); setPose(P2, POSES.push);
    if (Math.random() < 0.3) burst([stackX, DIM.kgY + stackPipes[0].total * t, stackZ], 2, 0xffe9a0, 1.5, 300);
  });
  await Promise.all([drops(14, 0x6fb8ff), wait(300)]);
  burst([stackX, DIM.egY + 1.2, stackZ], 14, 0x6fb8ff, 3, 700);

  // 2) Fußbodenheizung + Hauptleitung je Geschoss (Schlangenlinie)
  const lvls = [['kg', DIM.kgY, -1.8, 1.6], ['eg', DIM.egY, 0.6, 1.0], ['dg', DIM.dgY, 3.2, 0.5]];
  for (const [lvl, y0, ty, rate] of lvls) {
    house.setView('innen', lvl); fixView();
    engine.flyTo({ az: 0.55, el: 1.0, r: 21, target: [-0.5, ty, 2.5] }, S(1200));
    P1.root.pos = [-5, y0, 0.2]; P2.root.pos = [stackX + 1, y0, stackZ + 1];
    const hp = flatPipes.find((p) => p.lvl === lvl);
    hp.visible = true; shown.add(hp);
    const segs = itn.fbh.filter((f) => f.lvl === lvl).sort((a, b) => a.idx - b.idx);
    const hpBase = hp.scale[0];
    hp.scale[0] = 0.001; hp.pos[0] = stackX + 0;
    const hpC = hp.pos[0];
    await tw(500, () => {});
    for (let i = 0; i < segs.length; i++) {
      const f = segs[i];
      const anchorLeft = i % 2 === 0, halfL = 5.0, base = [...f.pos];
      f.visible = true; shown.add(f);
      const ms = 10 / (9 * rate) * 1000;
      faceDir(P1.root, anchorLeft ? -1 : 1, 0);
      await tw(ms, (t) => {
        f.scale[0] = Math.max(t, 0.001); f.pos[0] = base[0] + (anchorLeft ? halfL : -halfL) * (1 - t) * -1 + (anchorLeft ? 0 : 0);
        // wächst von einem Ende: Mitte verschiebt sich
        f.pos[0] = (anchorLeft ? base[0] + halfL - t * halfL : base[0] - halfL + t * halfL);
        const head = anchorLeft ? base[0] + halfL - t * 10 : base[0] - halfL + t * 10;
        P1.root.pos[0] = head; P1.root.pos[2] = f.pos[2] + 0.5; P1.root.pos[1] = y0;
        setPose(P1, { ...POSES.push, lean: 0.35 });
      });
      f.scale[0] = 1; f.pos = base;
    }
    hp.scale[0] = hpBase; hp.pos[0] = hpC;
    setPose(P1, POSES.thumbs);
    burst([stackX, y0 + 0.4, stackZ], 10, 0xffb347, 2.5, 500);
    await drops(8, lvl === 'kg' ? 0xea4d3f : 0x6fb8ff);
  }
  // 3) Sanitärobjekte blinken auf
  for (const [lvl, y0, ty] of [['eg', DIM.egY, 0.6], ['dg', DIM.dgY, 3.2]]) {
    house.setView('innen', lvl); fixView();
    engine.flyTo({ az: 0.45, el: 0.8, r: 15, target: [stackX - 0.5, ty + 0.5, stackZ - 0.6] }, S(1200));
    P1.root.pos = [stackX + 2.2, y0, stackZ + 1.8]; P2.root.pos = [stackX - 1.2, y0, stackZ + 1.8];
    faceDir(P1.root, -0.5, -1); faceDir(P2.root, 0.5, -1);
    const f = itn.fixtures.find((x) => x.lvl === lvl);
    f.visible = true; shown.add(f);
    for (let k = 0; k < 4; k++) { f.visible = k % 2 === 1; await wait(170); }
    f.visible = true;
    burst([stackX - 1.2, y0 + 0.8, stackZ - 0.6], 12, 0xbfe6ff, 2.5, 700);
    await tw(900, (t) => { setPose(P1, POSES.wave(t * 3)); setPose(P2, POSES.thumbs); });
  }
  P1.root.visible = false; P2.root.visible = false;
  await wait(300);

  // 4) Außen: Transporter fährt ab
  house.setView('aussen');
  outside.visible = true; crew.c1.root.visible = false; crew.c2.root.visible = false;
  engine.flyTo({ az: 0.3, el: 0.32, r: 34, target: [0, 2, 9] }, S(1300));
  puff([crew.doorX, 1.2, 7.6], 4, 0.6);
  await wait(600);
  await driveTo(crew.van, [40, STREET_Y, 15.4], 2600, ease.in, false);
}

// ---------- Außenarbeiten: Dämmung (A) und Fassade (A) – gemeinsames Gerüst-Gerüst ----------
const makeSkirtScaffold = (fx) => {
  const g = grp('geruest-aussen'); fx.add(g);
  const X0 = -7.9, X1 = 8.74, ZF = 8.45, ZB = -0.3;
  const posts = [];
  const post = (x, z) => { const p = bx(0.1, 1, 0.1, 0x9aa1a8, { outline: false }); g.add(p); posts.push({ p, x, z }); };
  for (let x = X0; x <= X1 + 0.01; x += 2.6) { post(x, ZF); post(x, ZF + 0.9); }
  for (let z = ZF - 2.6; z >= ZB - 0.01; z -= 2.6) { post(X1, z); post(X1 + 0.9, z); }
  post(X1 + 0.9, ZF + 0.9);
  const decks = [];
  const mkDeck = () => {
    const d = grp('belag');
    d.add(bx(X1 - X0, 0.08, 0.9, 0xc8964f).at((X0 + X1) / 2, 0, ZF + 0.45), bx(0.9, 0.08, ZF - ZB, 0xc8964f).at(X1 + 0.45, 0, (ZF + ZB) / 2));
    d.add(bx(X1 - X0, 0.05, 0.05, 0x9aa1a8, { outline: false }).at((X0 + X1) / 2, 1.0, ZF + 0.9), bx(0.05, 0.05, ZF - ZB, 0x9aa1a8, { outline: false }).at(X1 + 0.9, 1.0, (ZF + ZB) / 2));
    g.add(d); decks.push(d); return d;
  };
  const d1 = mkDeck(), d2 = mkDeck();
  // f in 0..1: Plattformen und Stützen wachsen mit dem Fortschritt mit
  const set = (f) => {
    const y1 = 0.6 + 0.25 + 1.5 * f, y2 = 3.3 + 0.2 + 1.0 * f;
    d1.pos[1] = y1; d2.pos[1] = y2;
    const top = y2 + 1.5;
    posts.forEach(({ p, x, z }) => { p.size(1, top, 1).at(x, top / 2 - 0.1, z); });
    return [y1, y2];
  };
  set(0);
  return { g, set, X0, X1, ZF, ZB };
};
const makeInsulPallet = (c = 0xf2c94c) => {
  const g = grp('daemmpalette');
  g.add(bx(1.7, 0.16, 1.1, 0xc8964f).at(0, 0.08, 0));
  for (let i = 0; i < 5; i++) g.add(bx(1.5, 0.18, 0.9, i % 2 ? c : 0xe2b83a).at(0, 0.25 + i * 0.19, 0));
  g.add(bx(1.52, 0.03, 0.92, 0x2f7be0).at(0, 0.5, 0));
  return g;
};
const makePlasterMachine = () => {
  const g = grp('putzmaschine');
  g.add(bx(1.2, 0.7, 0.8, 0x4a4f58).at(0, 0.55, 0), bx(0.9, 0.5, 0.6, 0xf2a900).at(0, 1.15, 0));
  const hop = cy(0.45, 0.28, 0.45, 0xb9bec6, 8).at(0.15, 1.65, 0); g.add(hop);
  for (const x of [-0.45, 0.45]) g.add(cy(0.22, 0.22, 0.1, 0x2b2e34, 10).rotate(Math.PI / 2, 0, 0).at(x, 0.22, 0.45), cy(0.22, 0.22, 0.1, 0x2b2e34, 10).rotate(Math.PI / 2, 0, 0).at(x, 0.22, -0.45));
  g.add(bx(0.1, 0.1, 0.9, 0x2b2e34).at(-0.55, 0.5, 0));
  return g;
};
async function aussenArbeit(ctx, kind) {
  const { engine, house, fx } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, driveTo, burst, puff, toss } = T;
  const dae = kind === 'daemmung';
  const outside = new Node(null); fx.add(outside);
  house.setView('aussen');
  if (!dae) house.setProgress({ ...house.state.p, daemmung: 100 });
  const setF = (f) => house.setProgress({ ...house.state.p, [kind]: Math.max(0.01, f * 100) });
  setF(0);
  // 1) Transporter bringt Material
  const van = makeVan(dae ? 0xf4f1ea : 0xf0dfba, dae ? 0xf2c94c : 0x7a5a36); van.at(-14, STREET_Y, 15.4); outside.add(van);
  engine.flyTo({ az: 0.25, el: 0.3, r: 34, target: [0, 2, 9] }, S(1400));
  await driveTo(van, [-1.0, STREET_Y, 15.4], 3000, ease.out, false);
  const c1 = mk(LOOKS.bau, 0.6, STREET_Y, 14.0, outside), c2 = mk(LOOKS.bauin, 1.6, STREET_Y, 14.4, outside);
  const matX = dae ? 3.8 : -3.6;
  const mat = dae ? makeInsulPallet() : makePlasterMachine();
  outside.add(mat); mat.at(matX, terrainY(11.0), 11.0); mat.size(0.001, 0.001, 0.001);
  await tw(700, (t) => { const k = ease.out(t); mat.size(k, k, k); mat.pos[1] = terrainY(11.0) + (1 - k) * 2; });
  puff([matX, 0.4, 11.0], 5, 0.7);

  // 2) Gerüst wächst
  const sc = makeSkirtScaffold(outside);
  const [x0, x1] = [sc.X0, sc.X1];
  const worker = (look, x, z) => { const w = mk(look, x, STREET_Y, z, outside); return w; };
  const wA = c1, wB = c2;
  walkTo(wA, [matX + (dae ? -1.4 : 1.4), null, 10.0], { speed: 2.6 });
  await tw(1800, (t) => { sc.set(0); sc.g.size(1, ease.out(t), 1); });
  sc.g.size(1, 1, 1);
  engine.flyTo({ az: 0.3, el: 0.22, r: 24, target: [-1, 3, 8] }, S(1300));
  const [yA0, yB0] = sc.set(0);
  wA.root.pos = [matX - 2, 0.6, 8.9]; wB.root.pos = [x0 + 3.0, yB0 - 0.04, 8.9];
  // Handwerkzeug
  let tool1 = null, tool2 = null;
  if (!dae) {
    tool1 = grp('rolle'); tool1.add(bx(0.05, 1.0, 0.05, 0x8a5a36).at(0, 0.3, 0), cy(0.1, 0.1, 0.5, 0xf6efe0, 8).rotate(0, 0, Math.PI / 2).at(0, 0.82, 0));
    wA.hold.add(tool1);
    tool2 = grp('kelle'); tool2.add(bx(0.3, 0.04, 0.2, 0xb9bec6).at(0.05, 0.1, 0), bx(0.04, 0.2, 0.04, 0x8a5a36).at(-0.1, 0.0, 0));
    wB.hold.add(tool2);
  }
  // Schlauch der Putzmaschine: senkrecht am Gerüst, wächst mit
  let hose = null;
  if (!dae) { hose = bx(0.07, 1, 0.07, 0x2b2e34, { outline: false }); outside.add(hose); }
  faceDir(wA.root, 0, -1); faceDir(wB.root, 0, -1);

  // 3) Arbeiten Reihe für Reihe (Platten klappen an bzw. Putz wird gerollt), von unten nach oben
  const N = 30;
  const fly = (from, to, cb) => {
    const p = dae ? bx(1.1, 0.55, 0.1, C_INS) : bx(0.8, 0.5, 0.05, 0xf0dfba, { outline: false });
    outside.add(p); p.at(...from);
    if (dae) p.rot[0] = -0.5;
    return tw(dae ? 520 : 380, (t) => {
      const q = arc(from, to, dae ? 1.1 : 0.5, t);
      p.pos[0] = q[0]; p.pos[1] = q[1]; p.pos[2] = q[2];
      if (dae) { p.rot[0] = lerp(-0.5, 0, ease.out(t)); p.rot[2] = Math.sin(t * 6) * 0.25 * (1 - t); }
      else p.size(1 - t * 0.6, 1, 1);
    }).then(() => { outside.remove(p); cb && cb(); });
  };
  const C_INS = 0xf2c94c;
  let side = 'front';
  for (let k = 1; k <= N; k++) {
    const f = k / N;
    if (side === 'front' && f > 0.52) {
      side = 'gable';
      engine.flyTo({ az: 1.0, el: 0.22, r: 24, target: [5, 3.5, 4] }, S(1600));
      const [yA, yB] = sc.set(f);
      walkTo(wA, [x1 + 0.45, yA, 7.4], { speed: 2.6 }); walkTo(wB, [x1 + 0.45, yB, 3.2], { speed: 2.6 });
      await wait(900);
    }
    const [yA, yB] = sc.set(f);
    if (side === 'front') {
      const xa = lerp(-3.6, 5.5, (k % 5) / 4), xb = lerp(-6.2, 4.5, ((k * 3) % 7) / 6);
      wA.root.pos[1] = yA; wB.root.pos[1] = yB;
      walkTo(wA, [xa, yA, 8.9], { speed: 2.2 }); walkTo(wB, [xb, yB, 8.9], { speed: 2.2 });
      faceDir(wA.root, 0, -1); faceDir(wB.root, 0, -1);
      const tgtA = [xa, yA + 1.1, 7.4], tgtB = [xb, yB + 1.0, 7.4];
      if (dae) {
        fly([matX, 1.0, 11.0], tgtA); fly([matX + 0.4, 1.1, 11.0], tgtB, () => burst(tgtB, 3, 0xffffff, 1.2, 300));
      } else {
        fly([matX, 1.9, 11.0], tgtA); fly([matX, 1.9, 11.0], tgtB);
        if (hose) { hose.size(1, yB + 1.2, 1); hose.pos[0] = matX + 0.2; hose.pos[1] = (yB + 1.2) / 2; hose.pos[2] = 9.9; }
      }
      setPose(wA, { ...POSES.push, rArm: 1.3 + Math.sin(k) * 0.5, lean: 0.3 });
      setPose(wB, { ...POSES.push, lArm: 1.2 + Math.cos(k * 1.3) * 0.5, lean: 0.25 });
    } else {
      wA.root.pos[1] = yA; wB.root.pos[1] = yB;
      const za = lerp(7.4, 0.4, (k % 5) / 4), zb = lerp(5, -0.1, ((k * 3) % 7) / 6);
      walkTo(wA, [x1 + 0.45, yA, za], { speed: 2.2 }); walkTo(wB, [x1 + 0.45, yB, zb], { speed: 2.2 });
      faceDir(wA.root, -1, 0); faceDir(wB.root, -1, 0);
      fly([matX + 2, 1.2, 11.0], [x1 - 0.6, yA + 1.0, za]); fly([matX + 2, 1.2, 11.0], [x1 - 0.6, yB + 1.0, zb]);
      if (hose) { hose.pos[0] = x1 + 1.0; hose.pos[2] = 9.3; hose.size(1, yB + 1.2, 1); hose.pos[1] = (yB + 1.2) / 2; }
      setPose(wA, { ...POSES.push, rArm: 1.3 + Math.sin(k) * 0.5, lean: 0.3 }); setPose(wB, { ...POSES.push, lArm: 1.2 + Math.cos(k * 1.3) * 0.5, lean: 0.25 });
    }
    await wait(250);
    setF(f);
    burst([side === 'front' ? lerp(-5, 6, (k % 7) / 6) : x1 - 0.7, yA + 1.0, side === 'front' ? 7.6 : lerp(6, 0, (k % 5) / 4)], 3, dae ? 0xffe9a0 : 0xf5e8c8, 1.4, 350);
    if (k === 20) engine.flyTo({ az: 0.55, el: 0.25, r: 26, target: [2, 4, 4] }, S(1600));
    await wait(110);
  }
  setF(1);
  // 4) Finale: Gerüst fällt zusammen, Jubel
  if (hose) outside.remove(hose);
  if (tool1) wA.hold.remove(tool1);
  if (tool2) wB.hold.remove(tool2);
  const [yA, yB] = sc.set(1);
  setPose(wA, POSES.wave(0)); setPose(wB, POSES.thumbs);
  burst([4, yB + 1.5, 6], 26, dae ? 0xf2c94c : 0xf0dfba, 4.5, 1000, 0.1);
  await wait(600);
  await Promise.all([
    tw(1000, (t) => { sc.g.size(1, 1 - ease.in(t), 1); wA.root.pos[1] = lerp(yA, 0.6, t); wB.root.pos[1] = lerp(yB, 0.6, t); }),
    walkTo(wA, [x1 + 0.5, 0.6, 9.6], { speed: 2.6 }).catch(() => {}),
  ]);
  outside.remove(sc.g);
  setPose(wB, POSES.idle);
  await Promise.all([walkTo(wA, [1.0, null, 14.4], { speed: 2.8 }), walkTo(wB, [1.9, null, 14.2], { speed: 2.8 })]);
  outside.remove(wA.root); outside.remove(wB.root);
  await tw(700, (t) => { mat.size(1 - t, 1 - t, 1 - t); });
  outside.remove(mat);
  await driveTo(van, [40, STREET_Y, 15.4], 2600, ease.in, false);
}
const daemmung = (ctx) => aussenArbeit(ctx, 'daemmung');
const fassade = (ctx) => aussenArbeit(ctx, 'fassade');

// ---------- Innenausbau: Estrich (A), Trockenbau (A), Maler (A) ----------
const makeHose = (parent, n = 16, color = 0x2b2e34, r = 0.07) => {
  const beads = [];
  for (let i = 0; i < n; i++) { const b = sp(r, color, { outline: false }); parent.add(b); beads.push(b); }
  // Schlauch als Kurve von a nach b mit Durchhang
  const set = (a, b, droop = 0.5, lift = 0) => beads.forEach((s, i) => {
    const t = i / (n - 1);
    s.pos[0] = lerp(a[0], b[0], t); s.pos[2] = lerp(a[2], b[2], t);
    s.pos[1] = lerp(a[1], b[1], t) - Math.sin(Math.PI * t) * droop + lift * Math.sin(Math.PI * t);
  });
  return { beads, set, node: parent };
};
const makeMixerTruck = () => {
  const t = A.makeSkipTruck();
  const g = grp('mischer');
  g.add(cy(0.7, 1.0, 1.6, 0xf2a900, 10).rotate(0, 0, 1.2).at(0.3, 1.6, 0), cy(1.0, 0.5, 1.5, 0xe38f00, 10).rotate(0, 0, 1.2).at(-1.2, 1.9, 0));
  g.add(bx(0.2, 0.1, 1.8, 0x35383e).at(-2.2, 1.0, 0));
  t.bed.add(g);
  t.mixer = g;
  return t;
};
const PASTELS_A = [0xbfe9d3, 0xf9d9a6, 0xcfdcf6, 0xf6c6d0, 0xe5f2b0, 0xdccbf2, 0xb9e4ec, 0xf8ea9f];
const LV = [['kg', DIM.kgY, -1.8], ['eg', DIM.egY, 0.6], ['dg', DIM.dgY, 3.2]];

async function estrich(ctx) {
  const { engine, house, fx } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, driveTo, burst, puff } = T;
  const itn = house.parts.interior;
  house.setView('aussen');
  const outside = new Node(null); fx.add(outside);
  // 1) Fahrmischer kommt, Schlauch zum Fenster
  engine.flyTo({ az: 0.2, el: 0.3, r: 36, target: [0, 1.5, 11] }, S(1400));
  const truck = makeMixerTruck(); truck.at(-16, STREET_Y, 15.4); outside.add(truck);
  const stopX = 5.6;
  await driveTo(truck, [stopX, STREET_Y, 15.4], 3200, ease.out, false);
  const hose = makeHose(outside, 18, 0x2b2e34, 0.09);
  const outlet = [stopX - 3.4, STREET_Y + 1.0, 15.4], win = [2.0, 1.9, 7.5];
  const w1 = mk(LOOKS.bau, stopX - 3.6, STREET_Y, 13.8, outside), w2 = mk(LOOKS.bauin, 2.6, 0, 9.4, outside);
  faceDir(w2.root, 0, -1);
  await tw(1400, (t) => { const m = [lerp(outlet[0], win[0], t), lerp(outlet[1], win[1], t), lerp(outlet[2], win[2], t)]; hose.set(outlet, m, 0.4 * (1 - t)); hose.beads.forEach((b, i) => { b.visible = i / 17 <= t; }); });
  hose.set(outlet, win, 0.8);
  // Beton pulsiert durch den Schlauch (graue Kugeln wandern)
  const slugs = []; for (let i = 0; i < 5; i++) { const s = sp(0.13, 0xb9bcc0, { outline: false }); outside.add(s); slugs.push(s); }
  let flow = true;
  (async () => { let t0 = 0; while (flow) { await wait(40); t0 += 0.03; slugs.forEach((s, i) => { const t = (t0 + i / 5) % 1; s.pos[0] = lerp(outlet[0], win[0], t); s.pos[2] = lerp(outlet[2], win[2], t); s.pos[1] = lerp(outlet[1], win[1], t) - Math.sin(Math.PI * t) * 0.8; }); truck.mixer.rot[0] = Math.sin(t0 * 6) * 0.02; } })();
  await wait(600);
  outside.visible = false;
  // 2) Je Geschoss: Estrich fließt vom Schlauchende nach außen
  const lvlP = { kg: 0, eg: 0, dg: 0 };
  const fixView = () => itn.screed.forEach((x) => {
    const p = lvlP[x.lvl]; x.visible = p > 0.02 && (x.lvl === curLvl || order.indexOf(x.lvl) < order.indexOf(curLvl)); const k = Math.max(p, 0.001);
    x.scale[0] = k; x.scale[2] = k; x.scale[1] = 1; x.pos[1] = x.baseY + 0.07;
  });
  const order = ['kg', 'eg', 'dg']; let curLvl = 'kg';
  house.setProgress({ ...house.state.p, estrich: 0.01 });
  const origC = new Map(itn.screed.map((x) => [x, [...x.color]])), wetC = hex(0x7d858e);
  itn.screed.forEach((x) => { x.color = wetC; });
  const dry = (x, t) => { x.color = origC.get(x).map((v, i) => lerp(wetC[i], v, t)); };
  const h1 = mk(LOOKS.bau, 0, 0, 0), h2 = mk(LOOKS.bauin, 0, 0, 0);
  const ihose = makeHose(fx, 14, 0x2b2e34, 0.09);
  for (const [lvl, y0, ty] of LV) {
    curLvl = lvl; house.setView('innen', lvl); fixView();
    engine.flyTo({ az: 0.5, el: 1.0, r: 21, target: [0, ty, 2.5] }, S(1200));
    const sx = 1.5, sz = 2.0; // Schlauchende / Mitte
    h1.root.pos = [win[0] - 0.6, y0, 6.0]; h2.root.pos = [-1.5, y0, 1.5];
    faceDir(h1.root, 0, -1);
    const hnd = [sx, y0 + 1.0, sz];
    const winI = [win[0], y0 + 1.3, 6.9];
    await tw(5200, (t) => {
      const k = ease.out(t); lvlP[lvl] = k; fixView();
      const R = 1 + 5.5 * k;
      h1.root.pos[0] = sx + 0.9; h1.root.pos[2] = sz + 0.9; h1.root.pos[1] = y0 + 0.14 * k;
      faceDir(h1.root, -0.3, -1); setPose(h1, { ...POSES.push, lean: 0.2 });
      ihose.set(winI, [h1.root.pos[0] - 0.2, y0 + 1.0, h1.root.pos[2] - 0.1], 0.4);
      // Zweiter Mann zieht mit der Latte am Rand hin und her
      const a = t * 18;
      h2.root.pos[0] = 0.2 + Math.sin(a) * R * 0.85; h2.root.pos[2] = 0.3 + Math.cos(a * 0.7) * 0.7 * R * 0.5 + 0.8; h2.root.pos[1] = y0 + 0.14 * k;
      faceDir(h2.root, Math.cos(a), 0.3);
      setPose(h2, { ...POSES.push, rArm: 1.2 + Math.sin(a * 3) * 0.3, lean: 0.3 });
      if (Math.random() < 0.25) burst([h2.root.pos[0], y0 + 0.25, h2.root.pos[2]], 2, 0xcfd2d6, 1.2, 300);
    });
    lvlP[lvl] = 1; fixView();
    setPose(h1, POSES.thumbs); setPose(h2, POSES.wave(0));
    burst([0.2, y0 + 1.0, 1.0], 14, 0xcfd2d6, 3, 600);
    const sl = itn.screed.find((x) => x.lvl === lvl);
    await tw(1100, (t) => dry(sl, ease.out(t)));
  }
  flow = false; outside.remove(hose.node); // Schlauch raus
  itn.screed.forEach((x) => { x.color = origC.get(x); });
  h1.root.visible = false; h2.root.visible = false; ihose.beads.forEach((b) => { b.visible = false; });
  // 3) Zurück nach außen, Fahrmischer fährt ab
  house.setView('aussen');
  outside.visible = true; slugs.forEach((s) => { s.visible = false; }); hose.beads.forEach((b) => { b.visible = false; });
  engine.flyTo({ az: 0.3, el: 0.32, r: 34, target: [0, 2, 9] }, S(1300));
  await walkTo(w2, [stopX - 3.0, null, 14.0], { speed: 2.6 });
  puff([stopX - 3.4, STREET_Y + 0.4, 15.4], 4, 0.6);
  outside.remove(w1.root); outside.remove(w2.root);
  await driveTo(truck, [40, STREET_Y, 15.4], 2800, ease.in, false);
}

async function trockenbau(ctx) {
  const { engine, house, fx } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, driveTo, burst, puff, toss } = T;
  const itn = house.parts.interior;
  house.setView('aussen');
  const outside = new Node(null); fx.add(outside);
  const crew = await crewArrive(ctx, T, outside, { van: [0xf4f1ea, 0x8a8f98], looks: [LOOKS.bau, LOOKS.profi], carry: () => bx(1.2, 0.04, 0.8, 0xf4f1ea) });
  await crew.enter();
  outside.visible = false;
  const prog = {}; // idx -> 0..1 Wandhöhe
  const order = ['kg', 'eg', 'dg']; let curLvl = 'kg';
  const ghosts = new Map();
  const fixView = () => itn.newParts.forEach((n) => {
    const p = prog[n.idx] ?? 0, hp = Math.min(n.H, 99);
    n.visible = p > 0.01;
    n.scale[1] = Math.max(n.H * p, 0.001); n.pos[1] = n.base + n.scale[1] / 2;
    const g = ghosts.get(n.idx); if (g) g.visible = (n.lvl === curLvl);
  });
  house.setProgress({ ...house.state.p, trockenbau: 0.01 });
  const T1 = mk(LOOKS.bau, 0, 0, 0), T2 = mk(LOOKS.profi, 0, 0, 0);
  const pallet = bx(1.3, 0.5, 0.9, 0xf4f1ea); fx.add(pallet);
  for (const [lvl, y0, ty] of LV) {
    curLvl = lvl; house.setView('innen', lvl);
    // Ghost-Rahmen (Metallständer) für alle Wände des Geschosses
    const parts = itn.newParts.filter((n) => n.lvl === lvl);
    parts.forEach((n) => {
      if (!ghosts.has(n.idx)) { const g = new Node(n.geo, { color: hex(0x9aa1a8), alpha: 0.35, outline: false }); g.pos = [...n.pos]; g.rot = [...n.rot]; g.scale = [1.02, 1, 1.02]; g.pos[1] = n.base + n.H / 2; g.scale[1] = n.H; n.parent?.add(g); ghosts.set(n.idx, g); g.visible = false; }
      else ghosts.get(n.idx).visible = true;
    });
    fixView();
    engine.flyTo({ az: 0.55, el: 1.0, r: 21, target: [-0.5, ty, 2.5] }, S(1200));
    pallet.pos = [stackX0(), y0 + 0.25, 6.4]; pallet.visible = true;
    T1.root.pos = [stackX0() - 1.2, y0, 6.2]; T2.root.pos = [stackX0() + 1.2, y0, 6.2];
    for (let i = 0; i < parts.length; i++) {
      const n = parts[i];
      const tgt = [n.pos[0], y0 + 1.2, n.pos[2]];
      const b = bx(1.2, 0.8, 0.05, 0xf4f1ea, { outline: false }); fx.add(b); b.at(pallet.pos[0], y0 + 0.9, pallet.pos[2]);
      walkTo(T1, [lerp(T1.root.pos[0], tgt[0], 0.5), y0, lerp(T1.root.pos[2], tgt[2], 0.5)], { speed: 3 });
      await toss(b, [pallet.pos[0], y0 + 0.9, pallet.pos[2]], tgt, 1.2, 420);
      fx.remove(b);
      setPose(T2, { ...POSES.push, rArm: 1.0 + (i % 2) * 0.4 });
      await tw(380, (t) => { prog[n.idx] = ease.out(t); fixView(); });
      prog[n.idx] = 1; fixView();
      burst([tgt[0], y0 + 1.5, tgt[2]], 3, 0xf4f1ea, 1.6, 300);
    }
    parts.forEach((n) => { const g = ghosts.get(n.idx); if (g) g.visible = false; });
    pallet.visible = false;
    setPose(T1, POSES.thumbs); setPose(T2, POSES.wave(0));
    await wait(300);
  }
  ghosts.forEach((g) => { g.visible = false; });
  T1.root.visible = false; T2.root.visible = false;
  house.setView('aussen'); outside.visible = true; crew.van.visible = true;
  engine.flyTo({ az: 0.3, el: 0.32, r: 34, target: [0, 2, 9] }, S(1300));
  await wait(400);
  await driveTo(crew.van, [40, STREET_Y, 15.4], 2600, ease.in, false);
}
const stackX0 = () => 1.4;

async function maler(ctx) {
  const { engine, house, fx } = ctx;
  const T = tools(ctx);
  const { S, tw, wait, mk, walkTo, driveTo, burst, puff } = T;
  const itn = house.parts.interior;
  house.setView('aussen');
  const outside = new Node(null); fx.add(outside);
  const crew = await crewArrive(ctx, T, outside, { van: [0xf4f1ea, 0xe0553f], looks: [LOOKS.profi, LOOKS.bauin], carry: () => { const g = grp('eimer'); g.add(cy(0.17, 0.14, 0.3, 0xf6f6f2, 8).at(0, 0, 0), bx(0.3, 0.04, 0.04, 0x9aa1a8).at(0, 0.2, 0)); return g; } });
  await crew.enter();
  outside.visible = false;
  house.setProgress({ ...house.state.p, trockenbau: 100, maler: 0 });
  const M1 = mk(LOOKS.profi, 0, 0, 0), M2 = mk(LOOKS.bauin, 0, 0, 0);
  const roller = grp('rolle'); roller.add(bx(0.05, 0.8, 0.05, 0x8a5a36).at(0, 0.25, 0), cy(0.1, 0.1, 0.45, 0xffffff, 8).rotate(0, 0, Math.PI / 2).at(0, 0.7, 0));
  M1.hold.add(roller);
  const bucket = grp('eimer'); bucket.add(cy(0.18, 0.15, 0.32, 0xf6f6f2, 8).at(0, 0.16, 0)); fx.add(bucket);
  const total = itn.newParts.length;
  let done = 0;
  for (const [lvl, y0, ty] of LV) {
    house.setView('innen', lvl);
    engine.flyTo({ az: 0.55, el: 1.0, r: 21, target: [-0.5, ty, 2.5] }, S(1200));
    const parts = itn.newParts.filter((n) => n.lvl === lvl).sort((a, b) => a.idx - b.idx);
    M1.root.pos = [stackX0() + 1.0, y0, 6.2]; M2.root.pos = [stackX0() - 1.2, y0, 6.2];
    for (let i = 0; i < parts.length; i++) {
      const n = parts[i], col = PASTELS_A[n.idx % PASTELS_A.length];
      const px = n.pos[0], pz = n.pos[2];
      bucket.at(px + 0.9, y0, pz + 0.9);
      roller.children[1].color = hex(col);
      await walkTo(M1, [px + 0.8, y0, pz + 0.9], { speed: 4 });
      faceDir(M1.root, -1, -0.4);
      walkTo(M2, [px - 0.8, y0, pz - 1.0], { speed: 4 });
      await tw(380, (t) => { setPose(M1, { ...POSES.push, rArm: 1.0 + Math.sin(t * 14) * 0.6, lean: 0.3 }); });
      done++;
      house.setProgress({ ...house.state.p, trockenbau: 100, maler: done / total * 100 });
      burst([px, y0 + 1.4, pz], 4, col, 1.8, 400);
    }
    setPose(M1, POSES.thumbs);
    await wait(250);
  }
  M1.root.visible = false; M2.root.visible = false; bucket.visible = false;
  house.setView('aussen'); outside.visible = true; crew.van.visible = true;
  engine.flyTo({ az: 0.3, el: 0.32, r: 34, target: [0, 2, 9] }, S(1300));
  await wait(400);
  await driveTo(crew.van, [40, STREET_Y, 15.4], 2600, ease.in, false);
}

export const ANIMS = { oeltank, entkernung, aufstockung, dach, elektro, sanitaer, fenster, solar, daemmung, fassade, estrich, trockenbau, maler };

// Fallback für Phasen ohne eigene Animation: zwei Bauarbeiter jubeln vor dem Haus, Konfetti.
async function generic(ctx) {
  const { engine, house, fx } = ctx;
  const T = tools(ctx);
  house.setView('aussen');
  engine.flyTo({ az: 0.45, el: 0.35, r: 32, target: [0, 2.5, 6] }, T.S(1200));
  const a = T.mk(LOOKS.bau, -2.5, 0, 12.5), b = T.mk(LOOKS.bauin, -0.8, 0, 12.7);
  faceDir(a.root, 0, -1); faceDir(b.root, 0, -1);
  await Promise.all([T.burst([0, 5, 7], 30, 0xf2a900, 6, 1400), T.tw(1800, (t) => { setPose(a, POSES.wave(t * 3)); setPose(b, POSES.wave(t * 3 + 1)); })]);
  fx.remove(a.root); fx.remove(b.root);
}
export const hasAnim = (id) => id in ANIMS;
export async function play(id, ctx) {
  const fx = new Node(null);
  ctx.engine.root.add(fx);
  try { await (ANIMS[id] || generic)({ ...ctx, fx }); } finally { ctx.engine.root.remove(fx); }
}
