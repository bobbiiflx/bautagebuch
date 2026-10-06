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
  engine.flyTo({ az: Math.PI - 0.5, el: 0.36, r: 34, target: [6, 4.5, 1] }, S(1500));
  // Transporter fährt über die Wiese an die Westseite
  const van = makeVan(0xf4f1ea, 0xf2a900); van.at(12.8, STREET_Y, 17.5); faceDir(van, 0, -1); fx.add(van);
  await driveTo(van, [12.8, 0, -1.0], 3200, ease.inOut, true);
  const rx = DIM.hw + 1.9;
  const zFoot = roof.z0 - roof.zo - 2.7;
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
  const driver = mk(LOOKS.bau, 12.8 + 1.3, 0, -1.0 + 0.5);
  const mate = mk(LOOKS.bauin, 12.8 + 1.3, 0, -2.2);
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
    const standS = Math.max(0.3, sMax - 0.5), sq = parts.slopePt(-1, standS, 7.4);
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
    flash.at(2, gy + 4.5, 0); fx.add(flash);
    setPose(roofer, POSES.wave(0));
    await tw(560, (t) => { flash.size(1 + t * 18); flash.opacity = 1 - t; });
    fx.remove(flash);
    house.setLit(false);
    await wait(300);
    house.setLit(null);
    burst([2, gy + 3.5, 0], 28, 0xffe08a, 4.5, 1000, 0.1);
    await tw(1400, (t) => setPose(roofer, POSES.wave(t * 3)));
  }
  [driver, mate, roofer].forEach((w) => fx.remove(w.root));
  await driveTo(van, [12.8, STREET_Y, 17.5], 2600, ease.in, true);
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
  const roofY = parts.roof.group.pos[1];
  const hx = Math.max(0.6, Math.min(6.0, cx)), sp0 = parts.slopePt(1, 0.9, hx);
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
  const roofY = roof.group.pos[1], hasOld = (house.state.p.dach ?? 0) <= 0;
  const zRow = 15.2, cxs = 2.0;
  const dgH = (s) => lerp(DIM.hDG0, DIM.hDG1, s);
  const setS = (p) => { house.setProgress({ ...house.state.p, aufstockung: p }); if (p < 60) roof.parts.forEach((rp) => rp.caps.forEach((c) => { c.visible = false; })); };
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

  // 2) Dach anschlagen und abheben
  const C = [(roof.parts[0].cx + roof.parts[1].cx) / 2, (roof.parts[0].cz + roof.parts[1].cz) / 2];
  const ground = new Node(null); fx.add(ground);
  const ghost = grp('altesDach'); ground.add(ghost);
  if (hasOld) {
    for (const rp of roof.parts) { const g = grp('gd').at(rp.cx - C[0], 0, rp.cz - C[1]); g.rot[1] = rp.rotY; g.add(new Node(rp.old.geo, { color: hex(0xc9633b), shadow: true })); ghost.add(g); }
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
  // Rigger auf dem First
  const rg = mk(LOOKS.profi, roof.parts[0].cx + 1.2, roofY + 1.85, 3.2, fx);
  faceDir(rg.root, 0, 1); setPose(rg, POSES.wave(0));
  await go(hook0, 1600, ease.inOut);
  await tw(700, (t) => setPose(rg, POSES.wave(t * 4)));
  setPose(rg, POSES.thumbs);
  ghost.at(C[0], roofY, C[1]); ghost.visible = true;
  if (hasOld) setS(0.01);
  burst([C[0], roofY + 5.4, C[1]], 10, 0xffe9a0, 2, 500);
  await wait(500);
  fx.remove(rg.root); puff([rg.root.pos[0], rg.root.pos[1], rg.root.pos[2]], 3, 0.5);
  // anheben, über das Haus schwenken, im Garten absetzen
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

  // 3) Gerüst + Palette mit Steinen
  engine.flyTo({ az: 0.35, el: 0.3, r: 32, target: [2.5, 4, 7] }, S(1500));
  const scaf = grp('geruest'); fx.add(scaf);
  const posts = [], px = [0.4, 2.8, 5.2, 7.2].map((u) => 7.44 - u);
  for (const x of px) for (const z of [7.9, 8.9]) { const p = bx(0.12, 1, 0.12, 0x9aa1a8, { outline: false }); scaf.add(p); posts.push({ p, x, z }); }
  const plat = bx(7.8, 0.1, 1.3, 0xc8964f).at(7.44 - 3.9, 0, 8.4); const rail = bx(7.8, 0.06, 0.06, 0x9aa1a8, { outline: false }).at(7.44 - 3.9, 0, 8.95);
  scaf.add(plat, rail);
  const setScaf = (s) => {
    const hh = dgH(s), py = DIM.dgY + 0.1 + (hh - 1.0) * 0.8;
    plat.pos[1] = py; rail.pos[1] = py + 1.0;
    posts.forEach(({ p, x, z }) => { const h = py + 1.3; p.size(1, h, 1).at(x, h / 2, z); });
    return py;
  };
  let py = setScaf(0);
  const b1 = mk(LOOKS.bau, 7.44 - 5.8, py, 8.4, fx), b2 = mk(LOOKS.bauin, 7.44 - 2.2, py, 8.4, fx);
  faceDir(b1.root, 0, -1); faceDir(b2.root, 0, -1);
  const pal = makePallet(); fx.add(pal); pal.at(cxs - 1.5, terrainY(12.4), 12.4);
  await go([cxs - 1.5, 4, 12.4], 1500);
  await go([cxs - 1.5, 1.6, 12.4], 900);
  await wait(300);
  await go([7.44 - 6.8, DIM.dgY + 4.5, 8.4], 2600, ease.inOut, pal, 1.6);
  await go([7.44 - 6.8, py + 1.9, 8.4], 1200, ease.inOut, pal, 1.6);
  pal.at(7.44 - 6.8, py + 0.08, 8.4);
  await go([cxs, 7, zRow - 4], 1500);

  // 4) Das Obergeschoss wächst Reihe für Reihe
  engine.flyTo({ az: 0.55, el: 0.3, r: 24, target: [0.5, 4.2, 5] }, S(1400));
  const rows = 14;
  const layL = (async () => { for (let i = 0; i < rows * 3; i++) { setPose(b1, { ...POSES.push, lArm: 1.0 + Math.sin(i * 1.3) * 0.25 }); walkTo(b1, [7.44 - 4.6 - (i % 3) * 1.1, b1.root.pos[1], 8.4], { speed: 2 }); await wait(160); } })();
  for (let k = 1; k <= rows; k++) {
    const s = k / rows;
    setS(s * 100);
    py = setScaf(s);
    b1.root.pos[1] = py; b2.root.pos[1] = py;
    setPose(b2, { ...POSES.push, rArm: 1.0 + (k % 2) * 0.4 });
    pal.size(1, 1 - s * 0.7, 1);
    if (k % 3 === 0) burst([7.44 - 3 - (k % 4), DIM.dgY + dgH(s), 7.2], 4, 0xd9946b, 1.5, 400);
    await wait(520);
  }
  await layL;
  setS(100);
  setPose(b1, POSES.wave(0)); setPose(b2, POSES.thumbs);
  await burst([0, DIM.dgY + 3, 3], 24, 0xffd166, 4, 1000, 0.1);
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
  // Zustand: nur Sparren sichtbar, Dach-Aufbauten weg
  house.setProgress({ ...house.state.p, dach: 1 });
  parts.chimney.visible = false; parts.dormers.visible = false; parts.skylights.visible = false;
  const rafters = [];
  roof.parts.forEach((rp) => rp.raf.children.forEach((c) => { rafters.push({ c, rest: [...c.pos], rot: [...c.rot], rp }); c.visible = false; }));
  engine.flyTo({ az: 0.3, el: 0.4, r: 36, target: [0, 5, 4] }, S(1400));

  // Transporter bringt die Dachdecker
  const van = makeVan(0xf4f1ea, 0x2f7be0); van.at(-12, STREET_Y, 15.4); fx.add(van);
  await driveTo(van, [4.5, STREET_Y, 15.4], 3000, ease.out, false);
  const r1 = mk(LOOKS.bau, 6.5, STREET_Y, 14.0), r2 = mk(LOOKS.bauin, 7.4, STREET_Y, 14.4);
  faceDir(r1.root, 0, -1); faceDir(r2.root, 0, -1);
  await Promise.all([walkTo(r1, [3.5, null, 10.0], { speed: 2.6 }), walkTo(r2, [5.0, null, 10.3], { speed: 2.6 })]);
  setPose(r1, POSES.point); setPose(r2, POSES.thumbs);

  // 1) Sparren fliegen ein
  await wait(300);
  rafters.sort((a, b) => a.rest[0] - b.rest[0]);
  const fly = rafters.map((r, i) => (async () => {
    await wait(i * 55);
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
  burst([0, rY + 2, 2], 14, 0xe2b873, 3, 600);
  await wait(300);

  // 2) Dachschalung + Blenden
  house.setProgress({ ...house.state.p, dach: 26 });
  roof.parts.forEach((rp) => { rp.deck.opacity = 0; rp.trim.visible = true; });
  await tw(900, (t) => roof.parts.forEach((rp) => { rp.deck.opacity = t; }));
  roof.parts.forEach((rp) => { rp.deck.opacity = 1; });
  // Dachdecker steigen aufs Dach
  const eaveAt = (s) => { const q = parts.slopePt(1, s, 7.44 - 3.6); return [q.p[0], rY + q.p[1] - 0.05, q.p[2]]; };
  puff([3.5, 0.5, 10], 4, 0.5);
  r1.root.pos = [...eaveAt(0.3)]; r2.root.pos = [...eaveAt(0.3)]; r2.root.pos[0] += 1.6; faceDir(r1.root, 0, -1); faceDir(r2.root, 0, -1);
  engine.flyTo({ az: 0.25, el: 0.38, r: 28, target: [0, 5.5, 4] }, S(1300));

  // 3) Ziegelreihen fallen von unten nach oben
  roof.parts.forEach((rp) => { rp.rows.front.concat(rp.rows.back).forEach((r) => { r.visible = false; }); });
  const rowFall = async (r, i) => {
    const rest = [...r.pos]; r.visible = true;
    r.pos[1] = rest[1] + 5.5; r.opacity = 1;
    await tw(520, (t) => { r.pos[1] = lerp(rest[1] + 5.5, rest[1], t * t); });
    r.pos = rest;
  };
  for (let i = 0; i < 12; i++) {
    const jobs = [];
    for (const rp of roof.parts) { jobs.push(rowFall(rp.rows.front[i], i), rowFall(rp.rows.back[i], i)); }
    const s = (i + 0.5) * roof.rowLen + 0.4;
    r1.root.pos = [...eaveAt(Math.min(s, roof.slopeLen - 0.4))]; setPose(r1, i % 2 ? POSES.push : POSES.carry);
    r2.root.pos[1] = r1.root.pos[1]; r2.root.pos[2] = r1.root.pos[2]; setPose(r2, i % 2 ? POSES.carry : POSES.push);
    await Promise.all([...jobs, wait(300)]);
    if (i % 3 === 2) burst([r1.root.pos[0], r1.root.pos[1] + 0.5, r1.root.pos[2]], 6, 0x6a6672, 2, 450);
  }
  await wait(300);

  // 4) Kamin, Gauben, Dachfenster
  const pop = async (node, ms = 600) => { node.visible = true; await tw(ms, (t) => { node.size(1 + Math.sin(t * Math.PI) * 0.25 * (1 - t) + (t - 1) * 0.0 + (t < 1 ? 0 : 0)); }, ease.out); node.size(1); };
  await Promise.all([pop(parts.chimney), pop(parts.dormers, 800), pop(parts.skylights, 800)]);
  roof.parts.forEach((rp) => { rp.raf.visible = false; });
  house.setProgress({ ...house.state.p, dach: 100 });
  burst([0, rY + 4, 2], 28, 0xffd166, 4, 1100, 0.1);
  setPose(r1, POSES.wave(0)); setPose(r2, POSES.thumbs);
  await tw(1200, (t) => setPose(r1, POSES.wave(t * 3)));
  puff([r1.root.pos[0], r1.root.pos[1], r1.root.pos[2]], 3, 0.5);
  fx.remove(r1.root); fx.remove(r2.root);
  await driveTo(van, [40, STREET_Y, 15.4], 2600, ease.in, false);
  fx.remove(van);
}

export const ANIMS = { oeltank, entkernung, aufstockung, dach, fenster, solar };

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
