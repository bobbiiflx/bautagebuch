// Die Seite "Haus": 3D-Modell, Ansichtswechsel, Phasenliste mit Animationen.
import { Engine } from './mini3d.js';
import { buildHouse } from './haus.js';
import { play, hasAnim } from './anim.js';

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
};
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignorieren */ } },
};

const homeCam = () => ({ az: 0.55, el: 0.5, r: canvas && canvas.clientWidth && canvas.clientHeight && canvas.clientWidth / canvas.clientHeight < 0.9 ? 56 : 38, target: [0, 2.5, 2] });
let skipBtn, wrap, engine, house, listEl, statusEl, canvas, floorBar, viewBtns, failed = null;
let view = 'aussen', floor = 'alle';
let latest = [];
let playing = false;
const queue = [];
let seen = null;

const progressOf = (p) => (p.state === 'fertig' ? 100 : p.state === 'geplant' ? 0 : Math.max(0, Math.min(100, Number(p.progress) || 0)));
const mapOf = (phases) => Object.fromEntries(phases.map((p) => [p.id, progressOf(p)]));
const threshold = (p) => Math.max(1, Number(p.animAt) || 10);

function init() {
  canvas = el('canvas', { class: 'haus-canvas', 'aria-label': '3D-Modell des Hauses' });
  statusEl = el('div', { class: 'haus-status muted small' });
  try {
    engine = new Engine(canvas); window.__bt3d = engine;
    house = buildHouse(engine);
    engine.start();
  } catch (e) {
    failed = e.message || String(e);
  }
  viewBtns = ['aussen', 'innen'].map((k) => el('button', { class: 'hseg', type: 'button', onclick: () => setView(k) }, k === 'aussen' ? 'Außen' : 'Innen'));
  floorBar = el('div', { class: 'hsegs floors' }, [['kg', 'Keller'], ['eg', 'Erdgeschoss'], ['dg', 'Dachgeschoss'], ['alle', 'Alle']].map(([k, t]) => el('button', { class: 'hseg', type: 'button', 'data-f': k, onclick: () => setView(null, k) }, t)));
  listEl = el('div', { class: 'haus-list' });
  skipBtn = el('button', { class: 'btn small skip', type: 'button', hidden: true, onclick: () => { if (engine) engine.timeScale = 14; } }, '⏭ Überspringen');
  const reset = el('button', { class: 'btn small', type: 'button', onclick: () => { engine?.flyTo(homeCam(), 900); } }, '⟲ Ansicht zurücksetzen');
  const animToggle = el('label', { class: 'check small' }, el('input', { type: 'checkbox', checked: LS.get('bt.hausAnim', true), onchange: (e) => LS.set('bt.hausAnim', e.target.checked) }), ' Animationen automatisch abspielen');
  wrap = el('div', { class: 'view haus' },
    el('section', { class: 'card haus-card' },
      el('div', { class: 'haus-bar' }, el('div', { class: 'hsegs' }, viewBtns), reset),
      floorBar,
      el('div', { class: 'haus-stage' }, canvas, skipBtn, failed && el('div', { class: 'haus-fail' }, '3D ist auf diesem Gerät nicht verfügbar: ' + failed)),
      statusEl,
      el('div', { class: 'muted small' }, 'Ziehen: drehen · Zwei Finger: zoomen und verschieben')
    ),
    el('section', { class: 'card' }, el('h2', {}, 'Bauphasen im Modell'), el('p', { class: 'muted small' }, 'Das Modell zeigt genau den Stand der Planung, unabhängig von der Reihenfolge. ▶ spielt die Animation der Phase noch einmal ab.'), listEl, animToggle)
  );
  paintSegs();
}

function paintSegs() {
  viewBtns.forEach((b, i) => b.classList.toggle('on', (i === 0 ? 'aussen' : 'innen') === view));
  floorBar.hidden = view !== 'innen';
  floorBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.f === floor));
}
function setView(v, f) {
  if (v) view = v;
  if (f) floor = f;
  paintSegs();
  if (!house || playing) return;
  house.setView(view, floor);
  if (v === 'innen') engine.flyTo({ el: 0.95, r: canvas.clientWidth < canvas.clientHeight ? 40 : 30, target: [0, 0, 0] }, 800);
  if (v === 'aussen') engine.flyTo(homeCam(), 800);
}

function paintList() {
  listEl.replaceChildren(...latest.map((p) => {
    const v = progressOf(p);
    return el('div', { class: 'line haus-row' },
      el('span', { class: 'ic' }, p.icon || '🔧'),
      el('div', { class: 'grow' }, el('div', {}, p.name), el('div', { class: 'bar small' }, el('div', { style: `width:${v}%` }))),
      el('span', { class: 'muted small' }, v + '%'),
      el('button', { class: 'btn small', type: 'button', 'aria-label': 'Animation abspielen: ' + p.name, onclick: () => replay(p.id), disabled: !house }, '▶')
    );
  }));
}

async function run(id, label) {
  if (!house || playing) return;
  playing = true;
  statusEl.textContent = '🎬 ' + label;
  const real = mapOf(latest);
  const keepView = { view, floor };
  try {
    house.setProgress({ ...real, [id]: 0 });
    house.setView('aussen');
    engine.timeScale = 1;
    skipBtn.hidden = false;
    await play(id, { engine, house, speed: 0.85, real });
  } catch (e) {
    console.warn('Animation:', e);
  } finally {
    playing = false;
    engine.timeScale = 1; skipBtn.hidden = true;
    statusEl.textContent = '';
    house.setProgress(mapOf(latest));
    house.setLit(null);
    view = keepView.view; floor = keepView.floor;
    house.setView(view, floor);
    engine.flyTo(view === 'innen' ? { az: 0.55, el: 0.95, r: canvas.clientWidth < canvas.clientHeight ? 40 : 30, target: [0, 0, 0] } : homeCam(), 1100);
    paintSegs();
    pump();
  }
}
const replay = (id) => { const p = latest.find((x) => x.id === id); if (p) run(id, p.name); };

function pump() {
  if (playing || !wrap?.isConnected) return;
  const id = queue.shift();
  if (!id) return;
  const p = latest.find((x) => x.id === id);
  if (p) run(id, `${p.name}: neuer Baufortschritt`);
}

// Löst Animationen aus, sobald eine Phase ihre Schwelle erreicht. Beim allerersten Start wird nichts nachgespielt.
function checkTriggers() {
  const first = seen === null;
  if (first) seen = LS.get('bt.hausSeen', null);
  const fresh = seen === null;
  if (fresh) seen = {};
  for (const p of latest) {
    const v = progressOf(p);
    if (v >= threshold(p)) {
      if (!seen[p.id]) {
        seen[p.id] = true;
        if (!fresh && LS.get('bt.hausAnim', true) && house) queue.push(p.id);
      }
    } else if (seen[p.id]) delete seen[p.id];
  }
  LS.set('bt.hausSeen', seen);
}

// Wird von der App bei jeder Änderung aufgerufen. Gibt das (dauerhafte) Seitenelement zurück.
export function hausView(phases) {
  if (!wrap) init();
  latest = phases;
  checkTriggers();
  if (house && !playing) { house.setProgress(mapOf(phases)); house.setView(view, floor); }
  paintList();
  if (engine) {
    engine.resize();
    if (!engine.userMoved && !playing) Object.assign(engine.cam, { ...homeCam(), target: [...homeCam().target] });
  }
  setTimeout(pump, 400);
  return wrap;
}

// Für die Übersicht: nur Trigger prüfen und merken, ohne die Seite zu öffnen (Animation läuft beim nächsten Öffnen).
export function noteChanges(phases) {
  latest = phases;
  if (!wrap) return;
  checkTriggers();
}
export { hasAnim };
