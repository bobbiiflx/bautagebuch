// Lokaler Speicher (IndexedDB) mit Synchronisierung nach OneDrive.
// Prinzip: Jede Änderung wird zuerst lokal gespeichert (App funktioniert offline und ohne Anmeldung)
// und danach im Hintergrund nach OneDrive hochgeladen. Jeder Eintrag ist eine eigene Datei, daher
// überschreiben sich zwei Personen nur, wenn sie genau denselben Eintrag gleichzeitig bearbeiten
// (dann gewinnt die zuletzt gespeicherte Änderung).
import { CONFIG } from './config.js';
import { DEFAULT_PHASES } from './phases.js';
import { Remote } from './onedrive.js';
import { AuthError } from './auth.js';

export const TYPES = ['phases', 'diary', 'costs', 'defects', 'todos', 'documents', 'settings'];

const DB_NAME = 'bautagebuch';
let db;
const records = new Map(); // "typ/id" -> {key,type,id,data,etag,dirty,deleted,rev}
const blobMeta = new Map(); // pfad -> {path,dirty,deleted}
const urlCache = new Map(); // pfad -> objectURL (oder Promise)
const listeners = new Set();
let remote = null;
let userName = () => localStorage.getItem('bt.name') || 'Unbekannt';
let pushTimer = null;
let syncing = null;
let state = { mode: 'local', text: 'Nur lokal', pending: 0, last: null, error: null };

// ---------- IndexedDB ----------
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('records', { keyPath: 'key' });
      d.createObjectStore('blobs');
      d.createObjectStore('blobmeta', { keyPath: 'path' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = (store, mode, fn) =>
  new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out && out.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
const idbPut = (store, val, key) => tx(store, 'readwrite', (s) => s.put(val, key));
const idbDel = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
const idbGet = (store, key) => tx(store, 'readonly', (s) => s.get(key));
const idbAll = (store) => tx(store, 'readonly', (s) => s.getAll());
const idbClear = (store) => tx(store, 'readwrite', (s) => s.clear());

// ---------- Hilfen ----------
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
export const onChange = (f) => { listeners.add(f); return () => listeners.delete(f); };

function setState(patch) {
  state = { ...state, ...patch };
  state.pending = pendingCount();
  emit();
}
export const getState = () => state;
export function pendingCount() {
  let n = 0;
  for (const r of records.values()) if (r.dirty) n++;
  for (const b of blobMeta.values()) if (b.dirty) n++;
  return n;
}

export const setUserName = (n) => localStorage.setItem('bt.name', n);
export const getUserName = () => userName();

// ---------- Initialisierung ----------
export async function init() {
  db = await openDB();
  for (const r of await idbAll('records')) records.set(r.key, r);
  for (const b of await idbAll('blobmeta')) blobMeta.set(b.path, b);
  seedPhases();
  state.pending = pendingCount();
}

// Standardphasen lokal anlegen, ohne sie hochzuladen (erst wenn jemand sie ändert). So kann eine zweite
// Person nicht versehentlich Fortschritte der ersten mit leeren Standardwerten überschreiben.
function seedPhases() {
  for (const p of DEFAULT_PHASES) {
    const key = `phases/${p.id}`;
    if (!records.has(key)) {
      const rec = { key, type: 'phases', id: p.id, data: { ...p, updatedAt: 0 }, etag: null, dirty: false, deleted: false, rev: 0, seeded: true };
      records.set(key, rec);
      idbPut('records', rec);
    }
  }
}

// ---------- Lesen ----------
export function all(type) {
  const out = [];
  for (const r of records.values()) if (r.type === type && !r.deleted) out.push(r.data);
  return out;
}
export const get = (type, id) => {
  const r = records.get(`${type}/${id}`);
  return r && !r.deleted ? r.data : null;
};

// ---------- Schreiben ----------
export async function save(type, data) {
  const id = data.id || uid();
  const key = `${type}/${id}`;
  const prev = records.get(key);
  const rec = {
    key, type, id,
    data: { ...data, id, updatedAt: Date.now(), updatedBy: userName() },
    etag: prev?.etag || null,
    dirty: true,
    deleted: false,
    rev: (prev?.rev || 0) + 1,
  };
  records.set(key, rec);
  await idbPut('records', rec);
  setState({});
  schedulePush();
  return rec.data;
}

export async function remove(type, id) {
  const key = `${type}/${id}`;
  const prev = records.get(key);
  if (!prev) return;
  const rec = { ...prev, deleted: true, dirty: true, rev: prev.rev + 1 };
  records.set(key, rec);
  await idbPut('records', rec);
  // zugehörige Dateien (Fotos, Dokument) mitlöschen
  for (const p of prev.data.photos || []) await deleteBlobPair(photoPaths(p).full, photoPaths(p).thumb);
  for (const r of prev.data.sketches || []) await deleteBlobPair(sketchPaths(r).json, sketchPaths(r).png);
  if (type === 'documents' && prev.data.path) {
    // verlinkte Dokumente teilen sich eine Datei: erst löschen, wenn niemand sie mehr braucht
    const shared = [...records.entries()].some(([k, r]) => k !== key && k.startsWith('documents/') && !r.deleted && r.data?.path === prev.data.path);
    if (!shared) { await deleteBlob(prev.data.path); if (prev.data.preview) await deleteBlob(prev.data.preview); }
  }
  setState({});
  schedulePush();
}

// ---------- Dateien (Fotos, Dokumente) ----------
export const photoPaths = (id) => ({ full: `fotos/${id}.jpg`, thumb: `fotos/thumbs/${id}.jpg` });

// ---------- Handschrift-Notizen: Striche als JSON + Vorschaubild; jede Speicherung bekommt eine neue Version (v),
// damit das zweite Gerät nie eine veraltete Datei aus seinem Zwischenspeicher zeigt.
export const sketchPaths = (r) => ({ json: `skizzen/${r.id}_${r.v}.json`, png: `skizzen/${r.id}_${r.v}.png` });
export async function putSketch(id, data, png) {
  const r = { id: id || uid(), v: Date.now().toString(36) };
  const p = sketchPaths(r);
  await putBlobLocal(p.json, new Blob([JSON.stringify(data)], { type: 'application/json' }));
  await putBlobLocal(p.png, png);
  setState({});
  schedulePush();
  return r;
}
export async function getSketch(r) {
  const url = await blobURL(sketchPaths(r).json);
  if (!url) return null;
  return (await fetch(url)).json();
}
export async function dropSketches(refs) {
  for (const r of refs) await deleteBlobPair(sketchPaths(r).json, sketchPaths(r).png);
  setState({});
}

async function putBlobLocal(path, blob) {
  await idbPut('blobs', blob, path);
  const meta = { path, dirty: true, deleted: false };
  blobMeta.set(path, meta);
  await idbPut('blobmeta', meta);
  const old = urlCache.get(path);
  if (typeof old === 'string') URL.revokeObjectURL(old);
  urlCache.delete(path);
}
async function deleteBlob(path) {
  const meta = { path, dirty: true, deleted: true };
  blobMeta.set(path, meta);
  await idbPut('blobmeta', meta);
  await idbDel('blobs', path);
  const old = urlCache.get(path);
  if (typeof old === 'string') URL.revokeObjectURL(old);
  urlCache.delete(path);
  schedulePush();
}
const deleteBlobPair = async (a, b) => { await deleteBlob(a); await deleteBlob(b); };

export async function resizeImage(file, maxPx, quality) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Foto verkleinern (max. 1800 px) und mit Vorschaubild speichern. Gibt die Foto-ID zurück.
export async function addPhoto(file) {
  const id = uid();
  const { full, thumb } = photoPaths(id);
  const [big, small] = await Promise.all([resizeImage(file, 1800, 0.82), resizeImage(file, 360, 0.7)]);
  await putBlobLocal(full, big);
  await putBlobLocal(thumb, small);
  setState({});
  schedulePush();
  return id;
}
export async function discardPhotos(ids) {
  for (const id of ids) { const p = photoPaths(id); await deleteBlobPair(p.full, p.thumb); }
  setState({});
}

export async function addDocumentFile(file, category, id) {
  let blob = file;
  if (file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) {
    try { blob = await resizeImage(file, 2400, 0.85); } catch { blob = file; }
  }
  const safe = file.name.replace(/[\\/:*?"<>|#%]/g, '_').slice(0, 80) || 'datei';
  const name = blob === file ? safe : safe.replace(/\.[^.]+$/, '') + '.jpg';
  const path = `dokumente/${category.replace(/[\\/:*?"<>|#%&]/g, '_')}/${id}_${name}`;
  await putBlobLocal(path, blob);
  schedulePush();
  return { path, size: blob.size, mime: blob.type || file.type || 'application/octet-stream', fileName: name };
}
export const replaceDocumentFilePath = deleteBlob;
// PNG-Vorschau (erste Seite) eines PDF-Dokuments ablegen; gibt den Pfad zurück
export async function putDocPreview(d, png) {
  const path = d.path + '.seite1.png';
  await putBlobLocal(path, png);
  schedulePush();
  return path;
}

// Prüfsumme einer Datei, um doppelte Uploads zu erkennen
export async function fileHash(blob) {
  const buf = await blob.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Gibt ein vorhandenes Dokument mit identischem Inhalt zurück (ältere Einträge ohne Prüfsumme werden bei gleicher Größe nachgeprüft)
export async function findDuplicate(hash, file) {
  for (const [k, r] of records) {
    if (!k.startsWith('documents/') || r.deleted || !r.data?.path) continue;
    const d = r.data;
    if (d.hash) { if (d.hash === hash) return d; continue; }
    if (d.size === file.size) {
      try { const b = await getBlobData(d.path); if (b && (await fileHash(b)) === hash) return d; } catch { /* ignorieren */ }
    }
  }
  return null;
}

// Liefert eine anzeigbare URL: erst lokal, sonst aus OneDrive laden und zwischenspeichern.
export function blobURL(path) {
  const hit = urlCache.get(path);
  if (hit) return Promise.resolve(hit);
  const p = (async () => {
    let blob = await idbGet('blobs', path);
    if (!blob && remote) {
      blob = await remote.getBlob(path);
      if (blob) await idbPut('blobs', blob, path);
    }
    if (!blob) { urlCache.delete(path); return null; }
    const url = URL.createObjectURL(blob);
    urlCache.set(path, url);
    return url;
  })().catch((e) => { urlCache.delete(path); throw e; });
  urlCache.set(path, p);
  return p;
}

// ---------- Synchronisierung ----------
export function connect(target, user) {
  remote = new Remote(target);
  if (user) userName = () => localStorage.getItem('bt.name') || user;
  setState({ mode: 'online', text: 'Verbunden', error: null });
}
export function disconnect() {
  remote = null;
  setState({ mode: 'local', text: 'Nur lokal', error: null });
}
export const isConnected = () => !!remote;

function schedulePush() {
  clearTimeout(pushTimer);
  if (!remote) return;
  pushTimer = setTimeout(() => sync().catch(() => {}), 1500);
}

async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => {
    while (q.length) await fn(q.shift());
  }));
}

async function pull() {
  let changed = false;
  for (const type of TYPES) {
    const items = (await remote.list(`daten/${type}`)).filter((i) => !i.folder && i.name.endsWith('.json'));
    const seen = new Set();
    const todo = [];
    for (const it of items) {
      const id = it.name.slice(0, -5);
      const key = `${type}/${id}`;
      seen.add(key);
      const local = records.get(key);
      if (local && (local.dirty || local.etag === it.eTag)) continue;
      todo.push({ it, id, key, local });
    }
    await pool(todo, 5, async ({ it, id, key, local }) => {
      const data = await remote.getJSON(it);
      const same = local && JSON.stringify(local.data) === JSON.stringify(data);
      const rec = { key, type, id, data, etag: it.eTag, dirty: false, deleted: false, rev: local?.rev || 0 };
      records.set(key, rec);
      await idbPut('records', rec);
      if (!same) changed = true;
    });
    // lokal vorhandene, bereits hochgeladene Einträge, die in OneDrive fehlen = dort gelöscht
    for (const [key, rec] of [...records]) {
      if (rec.type === type && !seen.has(key) && !rec.dirty && rec.etag) {
        records.delete(key);
        await idbDel('records', key);
        changed = true;
      }
    }
  }
  return changed;
}

async function push() {
  for (const m of [...blobMeta.values()].filter((b) => b.dirty)) {
    if (m.deleted) {
      await remote.delete(m.path);
      blobMeta.delete(m.path);
      await idbDel('blobmeta', m.path);
      continue;
    }
    const blob = await idbGet('blobs', m.path);
    if (!blob) { blobMeta.delete(m.path); await idbDel('blobmeta', m.path); continue; }
    await remote.putBlob(m.path, blob);
    m.dirty = false;
    await idbPut('blobmeta', m);
    setState({});
  }
  for (const rec of [...records.values()].filter((r) => r.dirty)) {
    const path = `daten/${rec.type}/${rec.id}.json`;
    if (rec.deleted) {
      await remote.delete(path);
      if (records.get(rec.key)?.rev === rec.rev) { records.delete(rec.key); await idbDel('records', rec.key); }
    } else {
      const { eTag } = await remote.putJSON(path, rec.data);
      const cur = records.get(rec.key);
      if (cur && cur.rev === rec.rev) {
        const next = { ...cur, dirty: false, etag: eTag, seeded: false };
        records.set(rec.key, next);
        await idbPut('records', next);
      }
    }
    setState({});
  }
}

// Gleicht mit OneDrive ab: erst Änderungen der anderen holen, dann eigene hochladen.
export function sync() {
  if (!remote) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    setState({ mode: 'syncing', text: 'Synchronisiere …', error: null });
    try {
      if (remote.target.kind === 'own' && !localStorage.getItem('bt.rootOk')) {
        await remote.ensureRoot();
        localStorage.setItem('bt.rootOk', '1');
      }
      await push();
      await pull();
      await push();
      localStorage.setItem('bt.lastSync', String(Date.now()));
      setState({ mode: 'online', text: 'Synchronisiert', last: Date.now(), error: null });
    } catch (e) {
      if (e instanceof AuthError) setState({ mode: 'auth', text: 'Anmeldung nötig', error: e.message });
      else if (e instanceof TypeError || !navigator.onLine) setState({ mode: 'offline', text: 'Offline', error: null });
      else setState({ mode: 'error', text: 'Sync-Fehler', error: e.message || String(e) });
      throw e;
    } finally {
      syncing = null;
    }
  })();
  syncing.catch(() => {});
  return syncing;
}

let pollTimer = null;
const tick = () => { if (remote && document.visibilityState === 'visible') sync().catch(() => {}); };
export function startPolling() {
  stopPolling();
  pollTimer = setInterval(tick, CONFIG.pollSeconds * 1000);
  document.addEventListener('visibilitychange', tick);
  addEventListener('online', tick);
}
export function stopPolling() {
  clearInterval(pollTimer);
  document.removeEventListener('visibilitychange', tick);
  removeEventListener('online', tick);
}

// ---------- Sonstiges ----------
// Alle lokalen Daten verwerfen (z. B. beim Wechsel auf einen anderen Ordner).
export async function resetLocal() {
  records.clear(); blobMeta.clear();
  for (const v of urlCache.values()) if (typeof v === 'string') URL.revokeObjectURL(v);
  urlCache.clear();
  await Promise.all([idbClear('records'), idbClear('blobs'), idbClear('blobmeta')]);
  localStorage.removeItem('bt.rootOk');
  seedPhases();
  setState({});
}

export function exportAll() {
  const out = {};
  for (const t of TYPES) out[t] = all(t);
  return { app: 'bautagebuch', exported: new Date().toISOString(), data: out };
}

// Beispieldaten zum Ausprobieren (mit demo:true markiert, damit sie sich sauber entfernen lassen).
export async function loadDemo() {
  const today = new Date();
  const d = (n) => new Date(today.getTime() - n * 864e5).toISOString().slice(0, 10);
  const demo = { demo: true };
  await save('diary', { ...demo, date: d(2), title: 'Container gestellt', text: 'Der 10-m³-Container steht vor dem Haus. Entkernung im Keller beginnt morgen.', phaseId: 'entkernung', photos: [] });
  await save('diary', { ...demo, date: d(5), title: 'Öltank leergepumpt', text: 'Tank wurde fachgerecht entleert, Entsorgungsnachweis liegt bei.', phaseId: 'oeltank', photos: [] });
  await save('costs', { ...demo, date: d(5), title: 'Tankentsorgung', amount: 1480, vendor: 'Beispiel Entsorgung GmbH', phaseId: 'oeltank', status: 'bezahlt', note: '', photos: [] });
  await save('costs', { ...demo, date: d(1), title: 'Container 10 m³', amount: 620, vendor: 'Beispiel Container', phaseId: 'entkernung', status: 'offen', note: '', photos: [] });
  await save('defects', { ...demo, date: d(1), title: 'Riss im Kellerboden', description: 'Haarriss neben der Heizungsnische, bitte vor dem Estrich prüfen.', room: 'KG – Heizung/Technik', phaseId: 'estrich', status: 'offen', due: '', photos: [] });
  await save('todos', { ...demo, title: 'Angebote für Fenster einholen', due: d(-7), done: false, assignee: '', phaseId: 'fenster' });
  const oel = get('phases', 'oeltank');
  await save('phases', { ...oel, state: 'fertig', progress: 100 });
  const ent = get('phases', 'entkernung');
  await save('phases', { ...ent, state: 'laeuft', progress: 30 });
}
export async function removeDemo() {
  for (const t of TYPES) {
    if (t === 'phases') continue;
    for (const x of all(t)) if (x.demo) await remove(t, x.id);
  }
  for (const id of ['oeltank', 'entkernung']) {
    const p = get('phases', id);
    if (p && p.updatedAt) {
      const def = DEFAULT_PHASES.find((q) => q.id === id);
      await save('phases', { ...p, state: def.state, progress: def.progress });
    }
  }
}


// ---------- Vollsicherung / Wiederherstellung ----------
// Alle Dateien, die von Einträgen verwendet werden (Fotos, Dokumente, Handschrift)
export function referencedBlobs() {
  const out = new Set();
  for (const t of ['diary', 'costs', 'defects', 'documents']) {
    for (const x of all(t)) {
      for (const id of x.photos || []) { out.add(photoPaths(id).full); out.add(photoPaths(id).thumb); }
      for (const r of x.sketches || []) { out.add(sketchPaths(r).json); out.add(sketchPaths(r).png); }
    }
  }
  for (const d of all('documents')) { if (d.path) out.add(d.path); if (d.preview) out.add(d.preview); }
  return [...out];
}
export async function getBlobData(path) {
  let b = await idbGet('blobs', path);
  if (!b && remote) { try { b = await remote.getBlob(path); } catch { b = null; } }
  return b || null;
}
// Daten ({typ: [Einträge]}) und Dateien (Map Pfad → Blob) aus einer Sicherung übernehmen. Gleiche IDs werden überschrieben.
export async function importAll(data, blobs = new Map()) {
  let n = 0;
  for (const t of TYPES) for (const rec of data?.[t] || []) { if (rec && rec.id) { await save(t, rec); n++; } }
  for (const [path, blob] of blobs) await putBlobLocal(path, blob);
  setState({});
  schedulePush();
  return { records: n, files: blobs.size };
}

// Wo liegt die Datei? 'ok' = in OneDrive, 'pending' = wartet auf Upload, 'local' = OneDrive nicht verbunden
export function blobStatus(path) {
  if (!remote) return 'local';
  return blobMeta.get(path)?.dirty ? 'pending' : 'ok';
}
