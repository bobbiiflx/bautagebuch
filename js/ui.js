// Oberfläche: Hilfsfunktionen, Dialoge und alle Ansichten.
import * as Store from './store.js';
import * as Auth from './auth.js';
import * as Session from './session.js';
import { Remote } from './onedrive.js';
import { CONFIG } from './config.js';
import { hausView } from './haus-view.js';
import { icon, phaseIcon } from './icons.js';
import { getTheme, setTheme } from './theme.js';
import { splashOn, setSplash } from './splash.js';
import { makeBackup, readBackup } from './backup.js';
import { DEFAULT_DOC_RULES, suggest } from './docrules.js';
import * as Wx from './weather.js';
import { openInk, inkThumb } from './ink.js';
import { pdfToPng } from './pdfimg.js';
import { TOP_MARKETS, OTHER_MARKETS, marketByName, logoEl } from './shops.js';
import { imagesToPdf } from './pdf.js';
import { gauge, donut, stackBar, stackBars, monthBars, cumLine, legend, short, monthLabel } from './charts.js';
import * as Fin from './finance.js';
import { DEFAULT_PHASES, PHASE_STATES, DOC_CATEGORIES, COST_STATES, DEFECT_STATES, ROOMS, BUILTIN_TRADES, BUDGET_SUGGESTIONS } from './phases.js';

// ---------- Hilfsfunktionen ----------
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  if (value !== undefined) el.value = value;
  return el;
}

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const fmtEUR = (n) => eur.format(Number(n) || 0);
export const today = () => new Date().toLocaleDateString('sv-SE');
export const fmtDate = (iso) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || 0) - (a.updatedAt || 0);

export const phases = () => Store.all('phases').sort((a, b) => a.order - b.order);
const phaseById = (id) => Store.get('phases', id);
// Dezimalfeld: auf dem iPhone verträgt type=number das Komma nicht zuverlässig. Daher Textfeld mit
// Dezimaltastatur; .value liefert immer einen Punkt-Wert ("1.500,5" -> "1500.5"), angezeigt wird mit Komma.
function dec(props) {
  const el = h('input', { ...props, type: 'text', inputmode: 'decimal', autocomplete: 'off', autocorrect: 'off' });
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const norm = (v) => { v = String(v ?? '').trim().replace(/\s/g, ''); if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.'); return v; };
  Object.defineProperty(el, 'value', { get() { return norm(d.get.call(el)); }, set(v) { d.set.call(el, v === '' || v == null ? '' : String(v).replace('.', ',')); }, configurable: true });
  el.value = d.get.call(el);
  el.addEventListener('input', () => { const t = d.get.call(el), c = t.replace(/[^0-9.,]/g, ''); if (c !== t) d.set.call(el, c); });
  return el;
}

const customTrades = () => Store.get('settings', 'trades')?.list || [];
const tradeOptions = () => [...BUILTIN_TRADES.map(([id, name]) => ({ id, name })), ...customTrades()];
const usageById = (id) => phaseById(id) || tradeOptions().find((t) => t.id === id);
const phaseName = (id) => usageById(id)?.name || '';

let toastTimer;
export function toast(msg, ms = 3500) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

// ---------- Dialoge ----------
let renderAfterClose = false;

export function askConfirm(text, okLabel = 'Ja') {
  return new Promise((resolve) => {
    let result = false;
    const dlg = h('dialog', { class: 'sheet more' },
      h('div', { class: 'sheet-body' },
        h('p', {}, text),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Abbrechen'),
          h('button', { type: 'button', class: 'btn primary', onclick: () => { result = true; dlg.close(); } }, okLabel))));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function sheet(title, body, { onSave, saveLabel = 'Speichern', onDelete, onCancel, noSave, bottomSave = true } = {}) {
  const dlg = h('dialog', { class: 'sheet' });
  const form = h(
    'form',
    {
      class: 'sheet-form',
      onsubmit: async (e) => {
        e.preventDefault();
        if (onSave) {
          try {
            if ((await onSave()) === false) return;
          } catch (err) {
            console.error(err);
            toast('Speichern fehlgeschlagen: ' + (err.message || err));
            return;
          }
        }
        dlg.close();
      },
    },
    h(
      'header',
      { class: 'sheet-head' },
      h('button', { type: 'button', class: 'btn-text', onclick: () => { onCancel?.(); dlg.close(); } }, noSave ? 'Schließen' : 'Abbrechen'),
      h('h2', {}, title),
      noSave || bottomSave ? h('span') : h('button', { type: 'submit', class: 'btn-text strong' }, saveLabel)
    ),
    h(
      'div',
      { class: 'sheet-body' },
      body,
      bottomSave && !noSave && h('button', { type: 'submit', class: 'btn primary block sheet-save' }, saveLabel),
      onDelete &&
        h('button', {
          type: 'button',
          class: 'btn danger block',
          onclick: async () => {
            if (await askConfirm('Wirklich löschen?', 'Löschen')) { await onDelete(); dlg.close(); }
          },
        }, 'Löschen')
    )
  );
  dlg.addEventListener('cancel', () => onCancel?.());
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (renderAfterClose && !document.querySelector('dialog[open]')) { renderAfterClose = false; render(); }
  });
  dlg.append(form);
  document.body.append(dlg);
  dlg.showModal();
  // Fokus: erstes Eingabefeld (nur wenn es unter den ersten Feldern steht), sonst neutral – nie auf „Abbrechen“
  const bodyEl = dlg.querySelector('.sheet-body');
  const fields = [...bodyEl.querySelectorAll('.field')].slice(0, 3);
  const first = fields.map((f) => f.querySelector('input, textarea, select')).find((el) => el && !el.disabled && !el.readOnly && (el.tagName === 'TEXTAREA' || ['text', 'search', 'tel', 'email', 'url', 'number'].includes(el.type || 'text')));
  if (first) first.focus({ preventScroll: true });
  else { bodyEl.tabIndex = -1; bodyEl.focus({ preventScroll: true }); }
  return dlg;
}

const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, hint && h('span', { class: 'hint' }, hint));

const optionList = (pairs, value) => pairs.map(([v, t]) => h('option', { value: v, selected: v === value }, t));
const phaseSelect = (value, none = '– keine Zuordnung –') =>
  h('select', { value: value || '' }, h('option', { value: '' }, none), phases().map((p) => h('option', { value: p.id }, p.name)));
// Gewerk / Verwendung: Bauphasen, feste Zusätze (Material, Planung, Werkzeug) und eigene Gewerke
const usageSelect = (value, none = '– keine Zuordnung –') => {
  const sel = h('select', { value: value || '' },
    h('option', { value: '' }, none),
    h('optgroup', { label: 'Bauphasen' }, phases().map((p) => h('option', { value: p.id }, p.name))),
    h('optgroup', { label: 'Weitere Verwendung' }, tradeOptions().map((t) => h('option', { value: t.id }, t.name))),
    h('option', { value: '__new' }, '+ Eigenes Gewerk anlegen …'));
  sel.value = value || '';
  let prev = sel.value;
  sel.addEventListener('change', () => { if (sel.value === '__new') tradeForm(null, (id) => { sel.value = id; prev = id; }, () => { sel.value = prev; }); else prev = sel.value; });
  return sel;
};
function tradeForm(trade, onDone, onCancel) {
  const name = h('input', { type: 'text', required: true, placeholder: 'z. B. Gartenbau', value: trade?.name || '' });
  sheet(trade ? 'Gewerk bearbeiten' : 'Eigenes Gewerk', [field('Name', name)], {
    onSave: async () => {
      const n = name.value.trim();
      if (!n) return false;
      const cur = Store.get('settings', 'trades') || { id: 'trades', list: [] };
      let list, id = trade?.id;
      if (trade) list = cur.list.map((t) => (t.id === id ? { ...t, name: n } : t));
      else { id = 'g:' + Date.now().toString(36); list = [...cur.list, { id, name: n }]; }
      await Store.save('settings', { ...cur, id: 'trades', list });
      const sel = onDone;
      if (sel) { const opt = h('option', { value: id }, n); document.querySelectorAll('select option[value="__new"]').forEach((o) => o.parentNode.insertBefore(opt.cloneNode(true), o)); sel(id); }
    },
    onCancel,
    onDelete: trade && (async () => {
      const cur = Store.get('settings', 'trades') || { id: 'trades', list: [] };
      await Store.save('settings', { ...cur, id: 'trades', list: cur.list.filter((t) => t.id !== trade.id) });
    }),
  });
}

// ---------- Fotos ----------
function thumb(id, { onRemove } = {}) {
  const img = h('img', { alt: 'Foto', class: 'thumb-img', loading: 'lazy' });
  Store.blobURL(Store.photoPaths(id).thumb)
    .then((u) => (u ? (img.src = u) : img.classList.add('missing')))
    .catch(() => img.classList.add('missing'));
  return h(
    'div',
    { class: 'thumb', onclick: () => lightbox(id) },
    img,
    onRemove && h('button', { type: 'button', class: 'x', 'aria-label': 'Foto entfernen', onclick: (e) => { e.stopPropagation(); onRemove(); } }, '×')
  );
}

function lightbox(id) {
  const img = h('img', { alt: 'Foto' });
  Store.blobURL(Store.photoPaths(id).full).then((u) => u && (img.src = u)).catch(() => toast('Foto konnte nicht geladen werden.'));
  const dlg = h('dialog', { class: 'lightbox', onclick: () => dlg.close() }, img, h('button', { class: 'lb-close', type: 'button' }, '×'));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

function photoField(initial = []) {
  const ids = [...initial];
  const added = [];
  const grid = h('div', { class: 'thumbs' });
  const status = h('span', { class: 'hint' });
  const redraw = () =>
    grid.replaceChildren(...ids.map((id) => thumb(id, { onRemove: () => { ids.splice(ids.indexOf(id), 1); redraw(); } })));
  const handle = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) {
      status.textContent = 'Foto wird verarbeitet …';
      try {
        const id = await Store.addPhoto(f);
        ids.push(id);
        added.push(id);
        redraw();
      } catch (err) {
        console.error(err);
        toast('Dieses Foto konnte nicht verarbeitet werden.');
      }
    }
    status.textContent = '';
  };
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: handle });
  const gal = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: handle });
  const el = h(
    'div',
    { class: 'photofield' },
    h('span', { class: 'lbl' }, 'Fotos'),
    grid,
    h(
      'div',
      { class: 'row' },
      h('button', { type: 'button', class: 'btn', onclick: () => cam.click() }, icon('photo_camera', { size: 20 }), ' Foto aufnehmen'),
      h('button', { type: 'button', class: 'btn', onclick: () => gal.click() }, icon('image', { size: 20 }), ' Aus Galerie')
    ),
    status,
    cam,
    gal
  );
  redraw();
  return {
    el,
    ids,
    // nach dem Speichern: entfernte Fotos löschen; beim Abbrechen: neu aufgenommene verwerfen
    commit: () => Store.discardPhotos(initial.filter((id) => !ids.includes(id))),
    cancel: () => Store.discardPhotos(added),
  };
}

// Handschrift-Notizen am Eintrag (Formular): neu anlegen, bearbeiten, entfernen; Dateien erst beim Speichern endgültig löschen
function sketchField(initial = [], getPhotos = () => []) {
  const refs = [...initial];
  const made = []; // in dieser Sitzung neu entstanden
  const obsolete = []; // alte Versionen / entfernte Notizen
  const grid = h('div', { class: 'thumbs' });
  const drop = (r) => (made.includes(r) ? (made.splice(made.indexOf(r), 1), Store.dropSketches([r])) : obsolete.push(r));
  const redraw = () => grid.replaceChildren(...refs.map((r) => inkThumb(r, {
    onClick: async () => { const n = await openInk({ ref: r, photoIds: getPhotos() }); if (n && n.v !== r.v) { refs[refs.indexOf(r)] = n; made.push(n); drop(r); } redraw(); },
    onRemove: () => { refs.splice(refs.indexOf(r), 1); drop(r); redraw(); },
  })));
  const el = h('div', { class: 'photofield' }, h('span', { class: 'lbl' }, 'Handschrift'), grid,
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: async () => { const n = await openInk({ photoIds: getPhotos() }); if (n) { refs.push(n); made.push(n); redraw(); } } }, icon('draw', { size: 20 }), ' Handschrift-Notiz')));
  redraw();
  return { el, refs, commit: () => Store.dropSketches(obsolete), cancel: () => Store.dropSketches(made) };
}
// Notiz direkt am gespeicherten Eintrag ändern (Detailansicht)
async function sketchEdit(d, ref) {
  const n = await openInk({ ref, photoIds: d.photos || [] });
  if (!n || (ref && n.v === ref.v)) return;
  const cur = Store.get('diary', d.id) || d;
  const list = ref ? (cur.sketches || []).map((r) => (r.id === ref.id ? n : r)) : [...(cur.sketches || []), n];
  await Store.save('diary', { ...cur, sketches: list });
  if (ref) await Store.dropSketches([ref]);
  const fresh = Store.get('diary', d.id);
  if (!wideQ.matches) { document.querySelector('dialog[open]')?.close(); openDiaryDetail(fresh); }
}

const photoStrip = (ids = []) => ids.length ? h('div', { class: 'thumbs small' }, ids.map((id) => thumb(id))) : null;

// ---------- Ansicht: Übersicht ----------
function progressOf(list) {
  return list.length ? Math.round(sum(list, (p) => p.progress) / list.length) : 0;
}
const bar = (pct, cls = '') => h('div', { class: 'bar ' + cls }, h('div', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } }));
const chip = (text, cls = '') => h('span', { class: 'chip ' + cls }, text);
const stat = (label, value, sub, cls = '') => h('div', { class: 'stat ' + cls }, h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label), sub && h('div', { class: 'stat-s' }, sub));
const card = (title, ...kids) => h('section', { class: 'card' }, title && h('h3', {}, title), ...kids);

// Eigene Budgetteile (z. B. Eigenkapital) – die Darlehen aus „Finanzierung“ kommen automatisch dazu
function manualParts() {
  const b = Store.get('settings', 'budget');
  if (!b) return [];
  if (Array.isArray(b.parts)) return b.parts;
  return Number(b.amount) > 0 ? [{ id: 'p0', name: 'Gesamtbudget', amount: Number(b.amount) }] : [];
}
const loanParts = () => Store.all('settings').filter((x) => x.kind === 'loan' && Number(x.amount) > 0).sort((a, b) => (a.start || '').localeCompare(b.start || '')).map((L) => ({ id: 'loan:' + L.id, name: L.name, amount: Number(L.amount), loan: true, planned: !!L.planned }));
const budgetParts = () => [...manualParts(), ...loanParts()];
function budgetInfo() { return sum(budgetParts(), (p) => p.amount); }
// Summen: Ausgaben brutto, Förderungen (ausgezahlt / noch offen), Netto nach ausgezahlter Förderung
// Angebote (verbindlich) und Budgetangebote (Alternativen zum Durchrechnen) zählen nie als Ausgaben
const isOffer = (c) => c.status === 'angebot' || c.status === 'budgetangebot';
function costSums(costs = Store.all('costs')) {
  const real = costs.filter((c) => !isOffer(c));
  const spent = sum(real, (c) => c.amount);
  const subs = real.filter((c) => c.subsidy);
  const subPaid = sum(subs.filter((c) => c.subsidyPaid), (c) => c.subsidyAmount);
  const subOpen = sum(subs.filter((c) => !c.subsidyPaid), (c) => c.subsidyAmount);
  return { spent, subPaid, subOpen, net: spent - subPaid, open: sum(costs.filter((c) => c.status === 'offen'), (c) => c.amount), offers: sum(costs.filter((c) => c.status === 'angebot'), (o) => Math.max(0, o.amount - sum(real.filter((c) => c.offerId === o.id), (c) => c.amount))) };
}

// ---------- Quick-Links (Übersicht) ----------
const QUICK = {
  'r:einkauf': ['Einkauf', 'shopping_cart', () => go('einkauf'), () => Store.all('shopping').filter((l) => !l.done).length],
  'r:aufgaben': ['Aufgaben', 'task_alt', () => go('aufgaben'), () => Store.all('todos').filter((t) => !t.done).length],
  'r:maengel': ['Mängel', 'warning', () => go('maengel'), () => Store.all('defects').filter((d) => d.status === 'offen' || d.status === 'klaerung').length],
  'r:dokumente': ['Dokumente', 'folder', () => go('dokumente')],
  'r:firmen': ['Firmen', 'contacts', () => go('firmen')],
  'r:kosten': ['Kosten', 'payments', () => go('kosten')],
  'r:tagebuch': ['Tagebuch', 'menu_book', () => go('tagebuch')],
  'r:planung': ['Planung', 'calendar_month', () => go('planung')],
  'r:finanzierung': ['Finanzierung', 'account_balance', () => go('finanzierung')],
  'r:haus': ['3D-Haus', 'view_in_ar', () => go('haus')],
  'r:suche': ['Suche', 'search', () => go('suche')],
  'n:diary': ['Neuer Eintrag', 'add', () => diaryForm()],
  'n:defect': ['Neuer Mangel', 'add', () => defectForm()],
  'n:todo': ['Neue Aufgabe', 'add', () => todoForm()],
  'n:cost': ['Neue Kosten', 'add', () => costForm()],
  'n:firma': ['Neue Firma', 'add', () => companyForm()],
  'n:shop': ['Neuer Einkaufszettel', 'add', () => { go('einkauf'); shopListForm(); }],
};
const QUICK_DEFAULT = ['r:einkauf', 'r:aufgaben', 'r:dokumente'];
const quickIds = () => {
  const mine = Store.get('settings', 'quicklinks')?.byUser?.[Store.getUserName()];
  return [0, 1, 2].map((i) => (mine?.[i] in QUICK ? mine[i] : QUICK_DEFAULT[i]));
};
function quickForm() {
  const cur = quickIds();
  const sels = cur.map((v, i) => h('select', { 'aria-label': `Kachel ${i + 1}` },
    h('optgroup', { label: 'Öffnen' }, Object.entries(QUICK).filter(([k]) => k.startsWith('r:')).map(([k, q]) => h('option', { value: k, selected: k === v }, q[0]))),
    h('optgroup', { label: 'Neu anlegen' }, Object.entries(QUICK).filter(([k]) => k.startsWith('n:')).map(([k, q]) => h('option', { value: k, selected: k === v }, q[0])))));
  sheet('Quick-Links', [h('p', { class: 'muted small' }, 'Drei Kacheln auf der Übersicht – für dich eingestellt, auf all deinen Geräten gleich.'), ...sels.map((x, i) => field(`Kachel ${i + 1}`, x))], {
    onSave: async () => {
      const doc = Store.get('settings', 'quicklinks') || { id: 'quicklinks', byUser: {} };
      await Store.save('settings', { ...doc, byUser: { ...(doc.byUser || {}), [Store.getUserName()]: sels.map((x) => x.value) } });
    },
  });
}
function quickTiles() {
  return h('section', { class: 'quick' },
    h('div', { class: 'qtiles' }, quickIds().map((id) => {
      const [label, ic, fn, badge] = QUICK[id];
      const n = badge ? badge() : 0;
      return h('button', { type: 'button', class: 'qtile', onclick: fn },
        h('span', { class: 'qi' }, icon(ic, { size: 26 }), n ? h('span', { class: 'qb' }, String(n)) : null),
        h('span', { class: 'ql' }, label));
    })),
    h('button', { type: 'button', class: 'btn-text small qedit', onclick: quickForm }, icon('edit', { size: 16 }), ' Anpassen'));
}

// Kosten in klein für die Startseite: gleicher Aufbau wie der Überblick in „Kosten“
function costMini(budget) {
  const real = Store.all('costs').filter((c) => !isOffer(c));
  const paid = sum(real.filter((c) => c.status === 'bezahlt'), (c) => c.amount), open = sum(real.filter((c) => c.status === 'offen'), (c) => c.amount);
  const sub = sum(real.filter((c) => c.subsidy && c.subsidyPaid), (c) => c.subsidyAmount);
  const net = paid + open - sub;
  return h('section', { class: 'card ov mini', role: 'link', onclick: () => go('kosten') },
    h('div', { class: 'split' }, h('h3', {}, 'Kosten'), h('strong', { class: 'amount' }, fmtEUR(paid + open))),
    paid + open > 0
      ? [stackBar([{ label: 'Bezahlt', value: paid, color: 'var(--viz-3)' }, { label: 'Rechnung offen', value: open, color: 'var(--viz-2)' }], paid + open),
        h('div', { class: 'offtxt' }, h('span', {}, h('b', {}, fmtEUR(paid)), ' bezahlt'), h('span', {}, h('b', {}, fmtEUR(open)), ' offen')),
        ...(() => { const g = payGroups(); const late = g.find((x) => x.key === 'late'), wk = g.find((x) => x.key === 'week'); return [late ? h('div', { class: 'payhint bad' }, icon('warning', { filled: true, size: 16 }), ` ${late.list.length} überfällig · ${fmtEUR(sum(late.list, (c) => c.amount))}`) : null, wk ? h('div', { class: 'payhint warn' }, icon('today', { size: 16 }), ` ${wk.list.length} in 7 Tagen fällig · ${fmtEUR(sum(wk.list, (c) => c.amount))}`) : null]; })(),
        budget ? h('div', { class: 'muted small' }, net <= budget ? `${fmtEUR(budget - net)} vom Budget übrig` : `Budget um ${fmtEUR(net - budget)} überschritten`) : null]
      : h('p', { class: 'muted small' }, 'Noch keine Rechnungen eingetragen.'));
}

function viewHome() {
  const ph = phases();
  const pct = progressOf(ph);
  const done = ph.filter((p) => p.state === 'fertig').length;
  const running = ph.filter((p) => p.state === 'laeuft');
  const costs = Store.all('costs');
  const { net: spent, open } = costSums(costs);
  const budget = budgetInfo();
  const defects = Store.all('defects').filter((d) => d.status === 'offen' || d.status === 'klaerung');
  const todos = Store.all('todos').filter((t) => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const diary = Store.all('diary').sort(byDateDesc).slice(0, 3);
  const next = ph.find((p) => p.state === 'geplant');

  return h(
    'div',
    { class: 'view' },
    h(
      'section',
      { class: 'card hero' },
      h('div', { class: 'hero-top' }, h('div', { class: 'pct' }, pct + '%'), h('div', {}, h('div', { class: 'hero-t' }, 'Baufortschritt'), h('div', { class: 'muted' }, `${done} von ${ph.length} Phasen fertig`))),
      bar(pct),
      running.length || done ? h('div', { class: 'chips' },
        running.map((p) => chip([phaseIcon(p, { size: 15 }), ` ${p.name} · ${p.progress}%`], 'run')),
        ph.filter((p) => p.state === 'fertig').map((p) => chip([phaseIcon(p, { size: 15 }), ` ${p.name.split(' ')[0].replace(',', '')}`], 'done'))) : null,
      !running.length && next && h('div', { class: 'muted small' }, `Als Nächstes geplant: ${next.name}`)
    ),
    quickTiles(),
    costMini(budget),
    h('div', { class: 'stats' },
      stat('Offene Mängel', String(defects.length), defects.length ? 'siehe Mängel' : 'alles gut', defects.length ? 'warn' : ''),
      stat('Offene Aufgaben', String(todos.length))),
    todos.length
      ? card('Nächste Aufgaben', todos.slice(0, 4).map((t) => h('div', { class: 'line' }, h('span', {}, t.title), t.due && h('span', { class: 'muted small' }, fmtDate(t.due)))))
      : null,
    card(
      'Letzte Einträge',
      diary.length
        ? diary.map((d) => h('div', { class: 'line', onclick: () => diaryForm(d) }, h('div', {}, h('strong', {}, d.title), h('div', { class: 'muted small' }, fmtDate(d.date) + (d.phaseId ? ' · ' + phaseName(d.phaseId) : '')))))
        : h('p', { class: 'muted' }, 'Noch keine Tagebucheinträge.')
    )
  );
}

// ---------- Ansicht: Tagebuch ----------
// Mehrfachauswahl Firmen (Chips + Eingabe mit Vorschlägen)
function companyPicker(initial = []) {
  const names = [...initial];
  const chips = h('div', { class: 'dc-chips cpick' });
  const inp = h('input', { type: 'text', list: 'firmen-dl', placeholder: 'Firma hinzufügen', autocomplete: 'off' });
  const add = () => {
    const v = inp.value.trim();
    if (v && !names.some((n) => norm(n) === norm(v))) names.push(companyOf(v)?.name || v);
    inp.value = ''; paint();
  };
  const paint = () => chips.replaceChildren(...names.map((n, i) => h('button', { type: 'button', class: 'tchip plain', 'aria-label': n + ' entfernen', onclick: () => { names.splice(i, 1); paint(); } }, n, ' ', icon('close', { size: 14 }))));
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
  inp.addEventListener('change', add);
  paint();
  return { el: h('div', {}, h('div', { class: 'row' }, inp, h('button', { type: 'button', class: 'btn small', onclick: add }, 'Hinzufügen')), chips), get: () => { add(); return names; } };
}
function diaryForm(entry) {
  const e = entry || { date: today(), title: '', text: '', phaseId: '', who: '', photos: [] };
  const date = h('input', { type: 'date', required: true, value: e.date });
  const title = h('input', { type: 'text', required: true, placeholder: 'z. B. Container gestellt', value: e.title });
  const text = h('textarea', { rows: 6, placeholder: 'Was ist passiert? Wer war da? Was wurde besprochen?', value: e.text || '' });
  const phase = phaseSelect(e.phaseId);
  const who = h('input', { type: 'text', placeholder: 'Personen, z. B. Bauleiter, Nachbar', value: e.who || '' });
  const comps = companyPicker(e.companies || []);
  const pf = photoField(e.photos);
  const sk = sketchField(e.sketches || [], () => pf.ids);
  // Wetter automatisch zum Datum (Ort aus den Einstellungen), bleibt am Eintrag gespeichert
  let wx = e.weather || null;
  const loc = Store.get('settings', 'location');
  const wxBox = h('div', { class: 'wx' });
  const paintWx = (msg) => wxBox.replaceChildren(
    wx ? h('span', { class: 'wx-s' }, icon(Wx.describe(wx.code).icon, { filled: true, size: 22 }), ' ' + Wx.summary(wx)) : h('span', { class: 'muted small' }, msg || (loc ? 'Kein Wetter geladen.' : 'Ort in den Einstellungen festlegen, dann wird das Wetter automatisch eingetragen.')),
    loc && h('button', { type: 'button', class: 'btn small', onclick: () => loadWx(true) }, icon('refresh', { size: 18 }), ' Laden'),
    wx && h('button', { type: 'button', class: 'btn-text small', onclick: () => { wx = null; paintWx(); } }, 'Entfernen')
  );
  let wxFor = wx?.at || '';
  const loadWx = async (force) => {
    if (!loc || !date.value || (!force && wxFor === date.value)) return;
    wxFor = date.value; paintWx('Wetter wird geladen …');
    try { wx = await Wx.fetchWeather(loc, date.value); paintWx(); } catch (err) { wx = null; paintWx(err.message || 'Wetter nicht verfügbar.'); }
  };
  paintWx();
  date.addEventListener('change', () => loadWx(false));
  if (!entry || !e.weather) loadWx(false);
  sheet(entry ? 'Eintrag bearbeiten' : 'Neuer Eintrag', [field('Datum', date), field('Wetter', wxBox), field('Titel', title), field('Notizen', text), field('Phase', phase), field('Firmen vor Ort', comps.el), field('Weitere Personen', who), pf.el, sk.el], {
    onSave: async () => {
      const cl = comps.get();
      for (const n of cl) await ensureCompany(n, phase.value);
      await Store.save('diary', { ...e, date: date.value, title: title.value.trim(), text: text.value.trim(), phaseId: phase.value, who: who.value.trim(), companies: cl, weather: wx, photos: pf.ids, sketches: sk.refs });
      await pf.commit();
      await sk.commit();
    },
    onCancel: () => { pf.cancel(); sk.cancel(); },
    onDelete: entry && (() => Store.remove('diary', e.id)),
  });
}

// ---------- Ansicht: Tagebuch ----------
// Wochenleiste mit Heute-Linie, farbige Karten je Gewerk, Detailbereich (Tablet) bzw. Detailblatt (Handy)
const dv = { range: 'week', anchor: today(), day: '', fphase: new Set(), fwho: new Set(), fcomp: new Set(), group: 'day', sel: '' };
const isoOf = (d) => d.toLocaleDateString('sv-SE');
const dateOf = (iso) => new Date(iso + 'T12:00:00');
const addDays = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const weekStartOf = (iso) => { const d = dateOf(iso); return addDays(iso, -((d.getDay() + 6) % 7)); };
const isoWeek = (iso) => { const d = dateOf(iso); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7); };
const dShort = (iso) => dateOf(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }).replace('.', '');
const dLong = (iso) => dateOf(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const HUES = [212, 18, 160, 42, 330, 130, 268, 2, 190, 78, 300, 30];
function phaseColor(id) {
  if (!id) return 'var(--muted)';
  const i = DEFAULT_PHASES.findIndex((p) => p.id === id);
  const k = i >= 0 ? i : [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return `hsl(${HUES[k % HUES.length]} 62% 52%)`;
}
// ---------- Wischen nach links: Löschen ----------
let swipeOpen = null;
const resetSwipe = (w) => { w.classList.remove('open'); const c = w.lastChild; c.style.transition = 'transform .2s ease'; c.style.transform = ''; setTimeout(() => { if (!w.classList.contains('open')) w.classList.remove('drag'); }, 230); };
const closeSwipe = () => { if (swipeOpen) { resetSwipe(swipeOpen); swipeOpen = null; } };
function swipeDel(card, doDelete, right = null, label = 'Löschen') {
  const W = 92;
  const act = h('button', { type: 'button', class: 'sw-del', 'aria-label': label }, icon('delete', { size: 24 }), h('span', {}, label));
  const ract = right && h('div', { class: 'sw-act ' + (right.cls || '') }, icon(right.icon, { size: 24 }), h('span', {}, right.label));
  const wrap = h('div', { class: 'sw' }, ract, act, card);
  let x0 = 0, y0 = 0, dx = 0, mode = '', base = 0, moved = false, pid = null;
  const setX = (v, anim) => { card.style.transition = anim ? 'transform .2s ease' : 'none'; card.style.transform = v ? `translateX(${v}px)` : ''; };
  wrap.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && !window.__swMouse) || e.target.closest('input,textarea,select')) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; mode = ''; moved = false; pid = e.pointerId;
    base = wrap.classList.contains('open') ? -W : 0;
    if (swipeOpen && swipeOpen !== wrap) closeSwipe();
  });
  wrap.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid || mode === 'v') return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!mode) {
      if (Math.abs(my) > 8 && Math.abs(my) > Math.abs(mx)) { mode = 'v'; return; }
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5) { mode = 'h'; try { wrap.setPointerCapture(pid); } catch {} } else return;
    }
    moved = true;
    wrap.classList.add('drag');
    dx = Math.max(-W - 24, Math.min(right ? W + 24 : 0, base + mx));
    setX(dx, false);
    if (ract) ract.classList.toggle('on', dx > 56);
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (mode !== 'h') return;
    if (right && dx > 56) { setX(0, true); wrap.classList.remove('open'); setTimeout(() => wrap.classList.remove('drag'), 230); if (ract) ract.classList.remove('on'); Promise.resolve(right.run()).catch(() => toast('Aktion fehlgeschlagen.')); return; }
    const open = dx < -W * 0.5;
    setX(open ? -W : 0, true);
    wrap.classList.toggle('open', open);
    if (!open) setTimeout(() => { if (!wrap.classList.contains('open')) wrap.classList.remove('drag'); }, 230);
    swipeOpen = open ? wrap : (swipeOpen === wrap ? null : swipeOpen);
  };
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
  // Nach einer Wischgeste oder bei geöffneter Zeile kein Antippen der Karte
  card.addEventListener('click', (e) => {
    if (moved || wrap.classList.contains('open')) {
      e.stopPropagation(); e.preventDefault();
      if (!moved) { resetSwipe(wrap); swipeOpen = null; }
      moved = false;
    }
  }, true);
  act.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (await askConfirm('Wirklich löschen?', 'Löschen')) { try { await doDelete(); } catch { toast('Löschen fehlgeschlagen.'); } }
    else { resetSwipe(wrap); swipeOpen = null; }
  });
  return wrap;
}
async function deleteTodo(t) {
  for (const x of successors(t)) await Store.save('todos', { ...x, after: (x.after || []).filter((id) => id !== t.id) });
  await Store.remove('todos', t.id);
  await syncPhase(t.phaseId);
}

const compList = (d) => [...new Map([...(d.companies || []), ...whoList(d).filter((w) => companyOf(w))].map((n) => [norm(n), companyOf(n)?.name || n])).values()];
const whoList = (d) => String(d.who || '').split(/\s*(?:,|;| und | & )\s*/).map((x) => x.trim()).filter(Boolean);
const initials = (n) => n.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
const profileOf = (name) => { const k = norm(name); return k ? Store.all('settings').find((x) => x.kind === 'profile' && norm(x.name) === k) || null : null; };
const myName = () => localStorage.getItem('bt.name') || Auth.account()?.name || '';
function avatar(n, size) {
  const p = profileOf(n);
  const st = size ? { width: size + 'px', height: size + 'px', fontSize: size * 0.36 + 'px' } : {};
  if (p?.photo) return h('span', { class: 'avatar has-img', title: n, style: st }, h('img', { src: p.photo, alt: n }));
  return h('span', { class: 'avatar', title: n, style: { ...st, background: `hsl(${[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 360} 55% 48%)` } }, initials(n));
}
// Foto mittig quadratisch zuschneiden und auf 256 px verkleinern (JPEG, ca. 15–30 KB)
async function resizeAvatar(file, px = 256) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    bmp = await new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { res(im); URL.revokeObjectURL(u); }; im.onerror = () => rej(new Error('Bild nicht lesbar')); im.src = u; });
  }
  const w = bmp.width || bmp.naturalWidth, hgt = bmp.height || bmp.naturalHeight, side = Math.min(w, hgt);
  const c = document.createElement('canvas'); c.width = c.height = px;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (w - side) / 2, (hgt - side) / 2, side, side, 0, 0, px, px);
  bmp.close?.();
  // Transparenz (PNG/WebP) bleibt erhalten; Fotos ohne Transparenz werden als kleines JPEG gespeichert
  const a = ctx.getImageData(0, 0, px, px).data;
  let clear = false;
  for (let i = 3; i < a.length; i += 4) if (a[i] < 250) { clear = true; break; }
  if (clear) return c.toDataURL('image/png');
  return c.toDataURL('image/jpeg', 0.86);
}
async function saveProfilePhoto(name, photo) {
  const cur = profileOf(name);
  if (!photo) { if (cur) await Store.remove('settings', cur.id); return; }
  await Store.save('settings', { ...(cur || {}), id: cur?.id || 'profile-' + norm(name).replace(/\W+/g, '-'), kind: 'profile', name, photo });
}
function profileBox() {
  const nameIn = h('input', { type: 'text', value: myName(), placeholder: 'Dein Name' });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const pic = h('button', { type: 'button', class: 'prof-pic', 'aria-label': 'Profilbild ändern', onclick: () => file.click() });
  const rm = h('button', { type: 'button', class: 'btn-text small', onclick: async () => { await saveProfilePhoto(myName(), null); toast('Profilbild entfernt.'); } }, 'Entfernen');
  const paint = () => { const n = myName(); pic.replaceChildren(n ? avatar(n, 76) : h('span', { class: 'avatar', style: { width: '76px', height: '76px', background: 'var(--muted)' } }, icon('contacts', { size: 36 })), h('span', { class: 'prof-edit' }, icon('edit', { size: 16 }))); rm.hidden = !profileOf(n)?.photo; };
  nameIn.addEventListener('change', async () => {
    const old = myName(), nn = nameIn.value.trim(), p = profileOf(old);
    Store.setUserName(nn);
    if (p && norm(p.name) !== norm(nn)) { await Store.remove('settings', p.id); if (nn) await saveProfilePhoto(nn, p.photo); }
    toast('Name gespeichert.'); paint();
  });
  file.addEventListener('change', async () => {
    nameIn.blur(); const f = file.files[0]; file.value = '';
    if (!f) return;
    if (!myName()) { toast('Bitte zuerst deinen Namen eintragen.'); nameIn.focus(); return; }
    try { await saveProfilePhoto(myName(), await resizeAvatar(f)); toast('Profilbild gespeichert.'); }
    catch (e) { toast('Bild konnte nicht verarbeitet werden.'); }
  });
  paint();
  return h('div', { class: 'prof' }, pic, h('div', { class: 'prof-r' }, nameIn, h('div', { class: 'prof-b' }, h('button', { type: 'button', class: 'btn small', onclick: () => file.click() }, icon('photo_camera', { size: 18 }), ' Profilbild'), rm)), file);
}
const wideQ = matchMedia('(min-width: 960px)');
wideQ.addEventListener?.('change', () => render());

// Autor: createdBy, sonst letzter Bearbeiter. Ältere Einträge ohne Namen gehören bei nur einer Person im Tagebuch eindeutig ihr.
const validAuthor = (n) => (n && n !== 'Unbekannt' ? n : '');
const authorOf = (d) => {
  const n = validAuthor(d.createdBy) || validAuthor(d.updatedBy);
  if (n) return n;
  const known = new Set(Store.all('diary').map((x) => validAuthor(x.createdBy) || validAuthor(x.updatedBy)).filter(Boolean));
  return known.size <= 1 ? [...known][0] || myName() : '';
};
const byline = (d, size = 20) => { const n = authorOf(d); return n ? h('span', { class: 'byline', title: 'Eingetragen von ' + n }, avatar(n, size), h('span', { class: 'muted small' }, n.split(/\s+/)[0])) : null; };
function diaryDetail(d, onEdit) {
  const ph = d.phaseId ? Store.get('phases', d.phaseId) : null;
  const pc = phaseColor(d.phaseId);
  const day = d.date;
  const tasks = d.phaseId ? Store.all('todos').filter((t) => t.phaseId === d.phaseId).sort((a, b) => Number(a.done) - Number(b.done)) : [];
  const defs = Store.all('defects').filter((x) => x.date === day);
  const costs = Store.all('costs').filter((x) => x.date === day);
  const who = whoList(d);
  const row = (label, ...val) => h('div', { class: 'drow' }, h('span', { class: 'dl' }, label), h('span', { class: 'dv' }, ...val));
  const doneT = tasks.filter((t) => t.done).length;
  return h('div', { class: 'ddetail', style: { '--pc': pc } },
    h('div', { class: 'dd-head' },
      h('div', {}, h('h2', {}, d.title), h('div', { class: 'muted small' }, dLong(d.date)), byline(d, 22)),
      h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Eintrag bearbeiten', onclick: onEdit }, icon('edit', { size: 20 }))),
    ph && h('section', { class: 'card gcard' },
      h('div', { class: 'split' }, h('h3', {}, 'Fortschritt'), chip(PHASE_STATES.find((s) => s[0] === ph.state)?.[1] || '', 'phs-' + ph.state)),
      gauge(ph.progress, pc, ph.name),
      tasks.length ? h('div', { class: 'muted small center' }, `${doneT} von ${tasks.length} Aufgaben erledigt`) : null),
    h('section', { class: 'card dlist' },
      row('Gewerk', d.phaseId ? h('span', { class: 'tchip' }, phaseName(d.phaseId)) : h('span', { class: 'muted' }, '–')),
      compList(d).length ? row('Firmen', h('span', { class: 'dc-chips' }, compList(d).map((n) => { const co = companyOf(n); return h(co ? 'button' : 'span', co ? { type: 'button', class: 'tchip', onclick: () => companyDetail(co) } : { class: 'tchip plain' }, n); }))) : null,
      row('Dabei', who.length ? h('span', { class: 'avs' }, who.map(avatar), h('span', { class: 'muted small' }, who.join(', '))) : h('span', { class: 'muted' }, '–')),
      row('Wetter', d.weather ? h('span', { class: 'wx-s' }, icon(Wx.describe(d.weather.code).icon, { filled: true, size: 20 }), ' ' + Wx.summary(d.weather)) : h('span', { class: 'muted' }, '–'))),
    d.text && h('section', { class: 'card' }, h('h3', {}, 'Notizen'), h('p', { class: 'dtext' }, d.text)),
    h('section', { class: 'card' },
      h('div', { class: 'split' }, h('h3', {}, 'Handschrift'), h('button', { type: 'button', class: 'btn-text small', onclick: () => sketchEdit(d, null) }, icon('draw', { size: 18 }), ' Neu')),
      d.sketches?.length ? h('div', { class: 'ink-list' }, d.sketches.map((r) => h('div', { class: 'ink-item' }, inkThumb(r, { big: true, onClick: () => sketchEdit(d, r) }), h('button', { type: 'button', class: 'btn small block', onclick: () => sketchEdit(d, r) }, icon('edit', { size: 18 }), ' Bearbeiten')))) : h('p', { class: 'muted small' }, 'Mit dem Apple Pencil Skizzen, Maße oder Notizen festhalten – auch direkt auf einem Foto.')),
    d.photos?.length ? h('section', { class: 'card' }, h('h3', {}, `Fotos (${d.photos.length})`), h('div', { class: 'thumbs' }, d.photos.map((id) => thumb(id)))) : null,
    h('section', { class: 'card' },
      h('div', { class: 'split' }, h('h3', {}, 'Aufgaben im Gewerk'), d.phaseId && h('button', { type: 'button', class: 'btn-text small', onclick: () => todoForm(null, d.phaseId) }, icon('add', { size: 18 }), ' Neu')),
      tasks.length ? tasks.map((t) => todoRow(t, false)) : h('p', { class: 'muted small' }, d.phaseId ? 'Noch keine Aufgaben für dieses Gewerk.' : 'Wähle beim Eintrag ein Gewerk, dann erscheinen hier die Aufgaben.')),
    h('section', { class: 'card' },
      h('h3', {}, 'Mängel und Kosten an diesem Tag'),
      defs.length || costs.length
        ? [...defs.map((x) => h('div', { class: 'hit', onclick: () => defectForm(x) }, icon('warning', { size: 22 }), h('div', { class: 'hit-t' }, h('div', {}, x.title), h('div', { class: 'muted small' }, [x.room, DEFECT_STATES.find((s) => s[0] === x.status)?.[1]].filter(Boolean).join(' · '))))),
           ...costs.map((x) => h('div', { class: 'hit', onclick: () => costForm(x) }, icon('payments', { size: 22 }), h('div', { class: 'hit-t' }, h('div', {}, `${x.title} · ${fmtEUR(x.amount)}`), h('div', { class: 'muted small' }, x.vendor || ''))))]
        : h('p', { class: 'muted small' }, 'Nichts erfasst.')));
}

function openDiaryDetail(d) {
  let dlg;
  const edit = () => { dlg.close(); diaryForm(d); };
  dlg = sheet('Eintrag', diaryDetail(d, edit), { noSave: true });
}

function viewDiary() {
  const all = Store.all('diary');
  const wide = wideQ.matches;
  const ws = weekStartOf(dv.anchor), we = addDays(ws, 6), t0 = today();
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const inRange = (d) => {
    if (dv.day) return d.date === dv.day;
    if (dv.range === 'week') return d.date >= ws && d.date <= we;
    if (dv.range === 'month') return (d.date || '').slice(0, 7) === dv.anchor.slice(0, 7);
    return true;
  };
  const compAll = [...new Map(all.flatMap(compList).map((n) => [norm(n), n])).values()].sort((a, b) => a.localeCompare(b, 'de'));
  const whoAll = [...new Set(all.flatMap(whoList))].sort((a, b) => a.localeCompare(b, 'de'));
  const list = all.filter((d) => inRange(d) && (!dv.fphase.size || dv.fphase.has(d.phaseId)) && (!dv.fcomp.size || compList(d).some((n) => [...dv.fcomp].some((x) => norm(x) === norm(n)))) && (!dv.fwho.size || whoList(d).some((w) => [...dv.fwho].some((x) => x.toLowerCase() === w.toLowerCase())))).sort(byDateDesc);
  if (wide && !list.some((d) => d.id === dv.sel)) dv.sel = list[0]?.id || '';
  const set = (patch) => { Object.assign(dv, patch); render(); };

  // Wochenleiste
  const label = dv.range === 'month' ? dateOf(dv.anchor).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) : `KW ${isoWeek(ws)} · ${dShort(ws)} – ${dShort(we)}`;
  const step = (n) => set({ anchor: dv.range === 'month' ? isoOf(new Date(dateOf(dv.anchor).getFullYear(), dateOf(dv.anchor).getMonth() + n, 1)) : addDays(dv.anchor, 7 * n), day: '' });
  const strip = h('section', { class: 'card wk' },
    h('div', { class: 'wk-nav' },
      h('button', { class: 'icon-btn small', 'aria-label': 'Zurück', onclick: () => step(-1) }, icon('chevron_left', { size: 22 })),
      h('strong', {}, label),
      h('button', { class: 'icon-btn small', 'aria-label': 'Weiter', onclick: () => step(1) }, icon('chevron_right', { size: 22 })),
      h('button', { class: 'pill small', onclick: () => set({ anchor: t0, day: '' }) }, 'Heute')),
    h('div', { class: 'wk-days' }, week.map((day) => {
      const es = all.filter((d) => d.date === day);
      const colors = [...new Set(es.map((d) => phaseColor(d.phaseId)))].slice(0, 3);
      return h('button', { class: 'wk-day' + (day === t0 ? ' today' : '') + (dv.day === day ? ' sel' : '') + (es.length ? ' has' : ''), 'aria-label': `${dLong(day)}, ${es.length} Einträge`, 'aria-pressed': String(dv.day === day), onclick: () => set({ day: dv.day === day ? '' : day }) },
        h('span', { class: 'wk-w' }, dateOf(day).toLocaleDateString('de-DE', { weekday: 'narrow' })),
        h('span', { class: 'wk-n' }, String(dateOf(day).getDate())),
        h('span', { class: 'wk-dots' }, colors.map((c) => h('i', { style: { background: c } })), es.length > 3 ? h('b', {}, '+') : null));
    })));

  // Filterleiste
  const rangeTabs = h('div', { class: 'seg' }, [['week', 'Woche'], ['month', 'Monat'], ['all', 'Alle']].map(([k, t]) => h('button', { class: 'pill' + (dv.range === k && !dv.day ? ' on' : ''), onclick: () => set({ range: k, day: '' }) }, t)));
  const filters = filterBar(dv, [
    { title: 'Gewerk', key: 'fphase', items: phases().map((p) => ({ v: p.id, t: p.name, icon: phaseIcon(p, { size: 22 }) })) },
    { title: 'Firma', key: 'fcomp', items: compAll.map((w) => ({ v: w, t: w, icon: icon('contacts', { size: 22 }) })) },
    { title: 'Person', key: 'fwho', items: whoAll.map((w) => ({ v: w, t: w, icon: icon('groups', { size: 22 }) })) },
  ], h('button', { type: 'button', class: 'pill small fpill' + (dv.group === 'phase' ? ' on' : ''), 'aria-pressed': String(dv.group === 'phase'), onclick: () => set({ group: dv.group === 'phase' ? 'day' : 'phase' }) }, icon('layers', { size: 18 }), ' Nach Gewerk'));

  const card = (d) => swipeDel(cardBody(d), () => Store.remove('diary', d.id));
  const cardBody = (d) => {
    const ph = d.phaseId ? Store.get('phases', d.phaseId) : null;
    const who = whoList(d);
    const sel = wide && dv.sel === d.id;
    return h('article', { class: 'card dcard' + (sel ? ' sel' : ''), style: { '--pc': phaseColor(d.phaseId) }, tabindex: 0, onclick: () => { if (wide) set({ sel: d.id }); else openDiaryDetail(d); }, onkeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); } },
      h('div', { class: 'dc-top' }, h('span', { class: 'muted small' }, dv.group === 'phase' ? dLong(d.date) : null), h('span', { class: 'dc-r' }, d.weather && h('span', { class: 'wx-s muted small' }, icon(Wx.describe(d.weather.code).icon, { filled: true, size: 18 }), ` ${Math.round(d.weather.tmax)}°`), byline(d, 18))),
      h('h3', {}, d.title),
      d.text && h('p', { class: 'clamp' }, d.text),
      h('div', { class: 'dc-chips' }, d.phaseId && h('span', { class: 'tchip' }, phaseName(d.phaseId)), [...compList(d), ...who.filter((w) => !companyOf(w))].slice(0, 2).map((w) => h('span', { class: 'tchip plain' }, w)), compList(d).length + who.filter((w) => !companyOf(w)).length > 2 && h('span', { class: 'tchip plain' }, `+${compList(d).length + who.filter((w) => !companyOf(w)).length - 2}`)),
      h('div', { class: 'dc-foot' },
        ph ? h('div', { class: 'dc-prog' }, h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: { width: ph.progress + '%', background: 'var(--pc)' } })), h('span', { class: 'muted small' }, ph.progress + '%')) : h('span'),
        h('span', { class: 'dc-ic' }, d.sketches?.length ? h('span', { class: 'phs' }, icon('draw', { size: 18 }), String(d.sketches.length)) : null, d.photos?.length ? h('span', { class: 'phs' }, icon('image', { size: 18 }), String(d.photos.length)) : null)));
  };

  let body;
  if (!list.length) body = empty(all.length ? 'Keine Einträge in dieser Auswahl' : 'Noch keine Einträge', all.length ? 'Wähle eine andere Woche, einen anderen Zeitraum oder entferne die Filter.' : 'Halte fest, was auf der Baustelle passiert – mit Fotos.', 'menu_book');
  else {
    const groups = new Map();
    for (const d of list) { const k = dv.group === 'phase' ? (d.phaseId || '') : d.date; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); }
    body = [...groups].map(([k, es]) => h('section', { class: 'dgroup' }, h('h4', { class: 'dg-h' }, dv.group === 'phase' ? (k ? phaseName(k) : 'Ohne Gewerk') : dLong(k), h('span', { class: 'dg-n muted small' }, ` · ${es.length} ${es.length === 1 ? 'Eintrag' : 'Einträge'}`)), es.map(card)));
  }
  const selected = wide ? all.find((d) => d.id === dv.sel) : null;
  return h('div', { class: 'view diary' + (wide ? ' wide' : '') },
    h('div', { class: 'd-main' }, rangeTabs, strip, filters, body),
    wide && h('aside', { class: 'd-side' }, selected ? diaryDetail(selected, () => diaryForm(selected)) : h('div', { class: 'empty' }, h('p', { class: 'muted' }, 'Wähle links einen Eintrag.'))),
    fab(() => diaryForm())
  );
}

// ---------- Dokumente an Kosten/Angeboten ----------
// Abschlagszahlungen: Rechnungen, die mit einem Angebot verknüpft sind und darauf angerechnet werden
function offerSplit(o) {
  const ps = Store.all('costs').filter((c) => c.offerId === o.id && !isOffer(c)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const paid = sum(ps.filter((c) => c.status === 'bezahlt'), (c) => c.amount);
  const inv = sum(ps.filter((c) => c.status === 'offen'), (c) => c.amount);
  return { ps, paid, inv, open: Math.max(0, o.amount - paid), rest: Math.max(0, o.amount - paid - inv), over: paid + inv - o.amount };
}
const offerOf = (c) => (c.offerId ? Store.get('costs', c.offerId) : null);
function offerBar(o) {
  const sp = offerSplit(o);
  const segs = [{ label: 'Bezahlt', value: sp.paid, color: 'var(--viz-3)' }, { label: 'Rechnung offen', value: sp.inv, color: 'var(--viz-2)' }, { label: 'Noch nicht abgerufen', value: sp.rest, color: 'var(--viz-track)' }];
  return h('div', { class: 'offsplit' }, stackBar(segs, Math.max(o.amount, sp.paid + sp.inv)),
    h('div', { class: 'offtxt' }, h('span', {}, h('b', {}, fmtEUR(sp.paid)), ' bezahlt'), h('span', {}, h('b', {}, fmtEUR(sp.open)), ' offen')),
    sp.inv > 0 && h('div', { class: 'muted small' }, `davon ${fmtEUR(sp.inv)} bereits in Rechnung gestellt`),
    sp.over > 0.005 && h('div', { class: 'viz-warn small' }, icon('warning', { filled: true, size: 16 }), ` Abschläge übersteigen das Angebot um ${fmtEUR(sp.over)}`));
}
const costDocCat = (status) => (status === 'angebot' || status === 'budgetangebot' ? 'Angebote' : 'Rechnungen');
const docsOfCost = (c) => (c.docIds || []).map((id) => Store.get('documents', id)).filter(Boolean);
const costsOfDoc = (d) => Store.all('costs').filter((c) => (c.docIds || []).includes(d.id));

// Datei direkt als Dokument anlegen (oder bei identischem Inhalt das vorhandene verwenden)
async function quickAddDoc(file, { cat, phaseId = '', tags = [], note = '', name = '', vendor = '' }) {
  const hash = await Store.fileHash(file);
  const twin = await Store.findDuplicate(hash, file);
  if (twin) { toast(`„${twin.name}“ gab es schon – wird verknüpft.`); return { doc: Store.get('documents', twin.id) || twin, created: false }; }
  const id = Store.uid();
  const info = await Store.addDocumentFile(file, cat, id);
  const doc = await Store.save('documents', { id, name: name || file.name.replace(/\.[^.]+$/, ''), category: cat, tags, pinned: false, phaseId, vendor, note, date: today(), hash, ...info });
  ensurePreview(doc, true);
  return { doc, created: true };
}

// Feld im Kosten-Formular: Dokumente hochladen oder vorhandene verknüpfen
function docAttachField(initial = [], meta = () => ({})) {
  const ids = [...initial];
  const made = [];
  const list = h('div', { class: 'attlist' });
  const redraw = () => list.replaceChildren(...ids.map((id) => {
    const d = Store.get('documents', id);
    if (!d) return null;
    return h('div', { class: 'att' },
      h('button', { type: 'button', class: 'att-open', onclick: () => openDoc(d) }, docIcon(d.mime), h('span', { class: 'att-n' }, d.name)),
      h('button', { type: 'button', class: 'mv', 'aria-label': 'Verknüpfung entfernen', onclick: () => { ids.splice(ids.indexOf(id), 1); if (made.includes(id)) { made.splice(made.indexOf(id), 1); Store.remove('documents', id); } redraw(); } }, '×'));
  }).filter(Boolean));
  const upload = () => pickFiles('up', async (fs) => {
    for (const f of fs) {
      try {
        const { doc, created } = await quickAddDoc(f, meta());
        if (!ids.includes(doc.id)) ids.push(doc.id);
        if (created) made.push(doc.id);
      } catch (e) { toast('Hochladen fehlgeschlagen: ' + (e.message || e)); }
    }
    redraw();
  });
  const link = () => {
    const free = Store.all('documents').filter((d) => !ids.includes(d.id)).sort(byDateDesc);
    if (!free.length) return toast('Es gibt keine weiteren Dokumente zum Verknüpfen.');
    const pick = new Set();
    sheet('Dokument verknüpfen', [h('div', { class: 'mlist' }, free.map((d) => h('label', { class: 'mrow' },
      h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? pick.add(d.id) : pick.delete(d.id)) }),
      docIcon(d.mime), h('span', { class: 'mt' }, d.name, h('small', { class: 'muted' }, ' · ' + docCat(d))))))], {
      saveLabel: 'Verknüpfen',
      onSave: () => { pick.forEach((id) => ids.push(id)); redraw(); },
    });
  };
  redraw();
  const el = h('div', { class: 'photofield' }, h('span', { class: 'lbl' }, 'Dokumente'), list,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', onclick: upload }, icon('upload_file', { size: 20 }), ' Hochladen'),
      h('button', { type: 'button', class: 'btn', onclick: link }, icon('link', { size: 20 }), ' Vorhandenes')),
    h('p', { class: 'muted small' }, 'Die Dokumente erscheinen auch unter „Dokumente“.'));
  return { el, ids, commit: () => {}, cancel: () => made.forEach((id) => Store.remove('documents', id)) };
}

// ---------- Ansicht: Kosten ----------
function costForm(entry, preset) {
  const e = entry || { date: today(), title: '', amount: '', vendor: '', phaseId: '', status: 'offen', note: '', photos: [], ...(preset || {}) };
  const date = h('input', { type: 'date', required: true, value: e.date });
  const title = h('input', { type: 'text', required: true, placeholder: 'z. B. Rechnung Elektro, Abschlag 1', value: e.title });
  const amount = dec({ required: true, step: '0.01', min: '0', inputmode: 'decimal', value: e.amount });
  const vendor = vendorInput(e.vendor, 'Firma');
  const phase = usageSelect(e.phaseId);
  const status = h('select', { value: e.status }, optionList(COST_STATES, e.status));
  const subOn = h('input', { type: 'checkbox', checked: !!e.subsidy });
  const subAmt = dec({ step: '0.01', min: '0', inputmode: 'decimal', placeholder: 'Förderbetrag (EUR)', value: e.subsidyAmount ?? '' });
  const subPaid = h('input', { type: 'checkbox', checked: !!e.subsidyPaid });
  const subBox = h('div', { class: 'subbox' }, field('Förderbetrag (EUR)', subAmt, 'Der Teil dieser Rechnung, der gefördert wird bzw. erstattet wird.'), h('label', { class: 'check' }, subPaid, h('span', {}, 'Förderung bereits ausgezahlt')));
  subBox.hidden = !subOn.checked;
  subOn.addEventListener('change', () => { subBox.hidden = !subOn.checked; });
  // Abschlagszahlung: mit einem Angebot verknüpfen und darauf anrechnen
  const offers = Store.all('costs').filter((c) => c.status === 'angebot' && c.id !== e.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const isPart = h('input', { type: 'checkbox', checked: !!e.offerId });
  const offerSel = h('select', { value: e.offerId || '' }, [h('option', { value: '' }, '– Angebot wählen –'), ...offers.map((o) => h('option', { value: o.id, selected: o.id === e.offerId }, `${o.title}${o.vendor ? ' · ' + o.vendor : ''} · ${fmtEUR(o.amount)}`))]);
  const partBox = h('div', { class: 'subbox' }, field('Angebot', offerSel, 'Der Betrag wird auf dieses Angebot angerechnet: das Angebot zeigt dann einen Teil als bezahlt und den Rest als offen.'));
  const partWrap = h('div', {}, offers.length ? [h('label', { class: 'check' }, isPart, h('span', {}, 'Abschlagszahlung zu einem Angebot')), partBox] : h('p', { class: 'muted small' }, 'Für Abschlagszahlungen zuerst ein Angebot anlegen.'));
  const syncPart = () => { partWrap.hidden = status.value === 'angebot' || status.value === 'budgetangebot'; partBox.hidden = !isPart.checked; };
  isPart.addEventListener('change', syncPart); status.addEventListener('change', syncPart); syncPart();
  offerSel.addEventListener('change', () => {
    const o = Store.get('costs', offerSel.value); if (!o) return;
    if (!vendor.value.trim() && o.vendor) vendor.value = o.vendor;
    if (!phase.value && o.phaseId) phase.value = o.phaseId;
    if (!title.value.trim()) title.value = `Abschlag ${offerSplit(o).ps.filter((c) => c.id !== e.id).length + 1} ${o.title}`;
  });
  const split = entry && e.status === 'angebot' ? offerSplit(e) : null;
  const splitEl = split && split.ps.length ? h('div', { class: 'subbox' }, h('strong', {}, 'Abschlagszahlungen'), offerBar(e), split.ps.map((c) => h('div', { class: 'split small' }, h('span', {}, `${fmtDate(c.date)} · ${c.title}`), h('span', {}, fmtEUR(c.amount), ' ', chip(c.status === 'bezahlt' ? 'bezahlt' : 'offen', 'cs-' + c.status))))) : null;
  // Zahlungsplan: Fälligkeit und Skonto (nur bei offenen Rechnungen)
  const dueIn = h('input', { type: 'date', value: e.dueDate || '' });
  const skPct = dec({ placeholder: 'z. B. 2', value: e.skontoPct ?? '' });
  const skUntil = h('input', { type: 'date', value: e.skontoUntil || '' });
  const payBox = h('div', { class: 'subbox' }, field('Zahlbar bis', dueIn, 'Erscheint im Zahlungsplan und auf der Startseite.'), field('Skonto (%)', skPct), field('Skonto gilt bis', skUntil, 'Nur bis dahin wird der Skontoabzug angezeigt.'));
  const syncPay = () => { payBox.hidden = status.value !== 'offen'; };
  status.addEventListener('change', syncPay); syncPay();
  const note = h('textarea', { rows: 3, value: e.note || '' });
  const pf = photoField(e.photos);
  const da = docAttachField(e.docIds || [], () => ({ cat: costDocCat(status.value), phaseId: phase.value, tags: vendor.value.trim() ? [vendor.value.trim()] : [], vendor: vendor.value.trim() }));
  sheet(entry ? 'Kosten bearbeiten' : 'Neue Kosten', [field('Datum', date), field('Bezeichnung', title), field('Betrag (EUR, brutto)', amount), field('Firma', vendor), field('Gewerk', phase), field('Status', status, '„Budgetangebot“ ist eine Alternative zum Durchrechnen. Sie zählt weder in den Kosten noch bei den Angeboten.'), payBox, partWrap, splitEl, h('label', { class: 'check' }, subOn, h('span', {}, 'Enthält Förderung')), subBox, field('Notiz', note), pf.el, da.el], {
    onSave: async () => {
      const saved = await Store.save('costs', { ...e, date: date.value, title: title.value.trim(), amount: Number(amount.value), vendor: vendor.value.trim(), phaseId: phase.value, status: status.value, dueDate: status.value === 'offen' ? dueIn.value : '', skontoPct: status.value === 'offen' ? Number(skPct.value) || 0 : 0, skontoUntil: status.value === 'offen' ? skUntil.value : '', paidDate: status.value === 'bezahlt' ? (e.paidDate || (e.status === 'bezahlt' ? '' : today())) : '', offerId: !['angebot', 'budgetangebot'].includes(status.value) && isPart.checked ? offerSel.value : '', note: note.value.trim(), subsidy: subOn.checked, subsidyAmount: subOn.checked ? Number(subAmt.value) || 0 : 0, subsidyPaid: subOn.checked && subPaid.checked, photos: pf.ids, docIds: da.ids });
      await pf.commit();
      await ensureCompany(saved.vendor, saved.phaseId);
      // Dokumente mit dem Kosten-Eintrag abgleichen: Kategorie (Angebot/Rechnung) und Gewerk
      for (const d of docsOfCost(saved)) {
        const patch = {};
        if (['Angebote', 'Rechnungen'].includes(docCat(d)) && docCat(d) !== costDocCat(saved.status)) patch.category = costDocCat(saved.status);
        if (!d.phaseId && saved.phaseId) patch.phaseId = saved.phaseId;
        if (!d.vendor && saved.vendor) patch.vendor = saved.vendor;
        if (Object.keys(patch).length) await Store.save('documents', { ...d, ...patch });
      }
    },
    onCancel: () => { pf.cancel(); da.cancel(); },
    onDelete: entry && (() => Store.remove('costs', e.id)),
  });
}

function budgetForm() {
  const cur = Store.get('settings', 'budget') || { id: 'budget' };
  const rows = h('div', { class: 'brows' });
  const dl = h('datalist', { id: 'budget-names' }, BUDGET_SUGGESTIONS.map((n) => h('option', { value: n })));
  const total = h('strong', {}, '');
  const upd = () => { total.textContent = fmtEUR(sum([...rows.querySelectorAll('.prow')], (r) => r.querySelector('.pamt').value)); };
  const addRow = (p = {}) => {
    const name = h('input', { type: 'text', list: 'budget-names', placeholder: 'z. B. Eigenkapital', value: p.name || '', 'aria-label': 'Bezeichnung' });
    const amt = dec({ class: 'pamt', step: '100', min: '0', inputmode: 'decimal', placeholder: 'EUR', value: p.amount ?? '', 'aria-label': 'Betrag', oninput: upd });
    const row = h('div', { class: 'prow', 'data-id': p.id || 'p' + Date.now().toString(36) + Math.floor(Math.random() * 99) }, name, amt, h('button', { type: 'button', class: 'mv', 'aria-label': 'Teil entfernen', onclick: () => { row.remove(); upd(); } }, '×'));
    rows.append(row);
  };
  const parts = manualParts();
  (parts.length ? parts : [{ name: 'Eigenkapital' }]).forEach(addRow);
  upd();
  sheet('Budget', [
    h('p', { class: 'muted small' }, 'Hier legst du eigene Budgetteile fest, z. B. Eigenkapital oder Eigenleistung. Darlehen werden automatisch aus „Finanzierung“ übernommen. Ausgezahlte Förderungen aus den Rechnungen mindern die Ausgaben.'),
    loanParts().length ? h('p', { class: 'muted small' }, 'Darlehen im Budget: ' + loanParts().map((p) => `${p.name} (${fmtEUR(p.amount)})`).join(', ')) : null,
    rows, dl,
    h('button', { type: 'button', class: 'btn block', onclick: () => addRow() }, '+ Weiteren Teil hinzufügen'),
    h('div', { class: 'line' }, h('span', {}, 'Gesamt'), total),
  ], {
    onSave: () => {
      const list = [...rows.querySelectorAll('.prow')].map((r) => ({ id: r.dataset.id, name: r.querySelector('input').value.trim(), amount: Number(r.querySelector('.pamt').value) || 0 })).filter((x) => x.name || x.amount);
      return Store.save('settings', { ...cur, id: 'budget', parts: list.map((x) => ({ ...x, name: x.name || 'Budget' })), amount: sum(list, (x) => x.amount) });
    },
  });
}

const costFilter = { phase: new Set(), status: new Set() };
const COST_ICONS = { angebot: 'request_quote', budgetangebot: 'sell', offen: 'receipt_long', bezahlt: 'task_alt' };
let costTab = 'auswertung';

// Diagramm-Karte mit Umschalter Grafik / Tabelle (für alle, die Zahlen lieber lesen)
function chartCard(title, chart, legendEl, rows, note) {
  let table = false;
  const body = h('div', { class: 'viz' });
  const btn = h('button', { class: 'icon-btn small', onclick: () => { table = !table; paint(); } });
  const paint = () => { paintBtn(); body.replaceChildren(table
    ? h('table', { class: 'viz-table' }, h('tbody', {}, rows.map(([l, v]) => h('tr', {}, h('th', { scope: 'row' }, l), h('td', {}, v)))))
    : h('div', {}, chart, legendEl, note && h('p', { class: 'muted small' }, note))); };
  const paintBtn = () => { btn.replaceChildren(icon(table ? 'insights' : 'table_chart', { size: 20 })); btn.setAttribute('aria-label', table ? 'Als Grafik anzeigen' : 'Als Tabelle anzeigen'); };
  paint();
  return h('section', { class: 'card chart' }, h('div', { class: 'split' }, h('h3', {}, title), btn), body);
}

// Variantenvergleich: Budgetangebote je Gewerk gegenüberstellen und die Auswirkung auf das Budget durchrechnen
const varSel = {};
function variantCard(all, sums, budget) {
  const vs = all.filter((c) => c.status === 'budgetangebot');
  if (!vs.length) return null;
  const groups = new Map();
  vs.forEach((c) => { const k = usageById(c.phaseId) ? c.phaseId : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
  const gl = [...groups].map(([k, list]) => ({ k, name: k ? phaseName(k) : 'Ohne Zuordnung', list: [...list].sort((a, b) => a.amount - b.amount) }));
  const base = sums.net + sums.offers;
  const box = h('section', { class: 'card variants' });
  const paint = () => {
    let extra = 0, lo = 0, hi = 0;
    const groupsEl = gl.map((g) => {
      const sel = g.list.find((c) => c.id === varSel[g.k]) || g.list[0];
      extra += sel.amount; lo += g.list[0].amount; hi += g.list[g.list.length - 1].amount;
      return h('div', { class: 'vgrp' }, h('div', { class: 'vgh' }, g.name),
        g.list.map((c) => h('button', { type: 'button', class: 'vopt' + (c.id === sel.id ? ' on' : ''), 'aria-pressed': c.id === sel.id ? 'true' : 'false', onclick: () => { varSel[g.k] = c.id; paint(); } },
          h('span', { class: 'vt' }, h('span', { class: 'vtt' }, c.title), c.vendor ? h('span', { class: 'muted small vtv' }, c.vendor) : null),
          h('span', { class: 'va' }, fmtEUR(c.amount), c.amount > g.list[0].amount ? h('span', { class: 'muted small vd' }, '+' + fmtEUR(c.amount - g.list[0].amount)) : null))));
    });
    const total = base + extra, left = budget ? budget - total : null;
    const row = (l, v, cls) => h('div', { class: 'split vrow' + (cls ? ' ' + cls : '') }, h('span', {}, l), h('strong', {}, v));
    box.replaceChildren(h('h3', {}, 'Variantenvergleich'), h('p', { class: 'muted small' }, 'Wähle je Gewerk eine Variante. Unten siehst du, wie sich das auf das Budget auswirkt.'), ...groupsEl,
      h('div', { class: 'vsum' },
        row('Kosten nach Förderung und Angebote', fmtEUR(base)),
        row('+ gewählte Varianten', fmtEUR(extra)),
        row('= Gesamt', fmtEUR(total), 'vtot'),
        budget ? row(left >= 0 ? 'Vom Budget übrig' : 'Budget überschritten um', fmtEUR(Math.abs(left)), left >= 0 ? 'vok' : 'vbad') : h('p', { class: 'muted small' }, 'Lege oben ein Budget fest, dann siehst du hier, was übrig bleibt.'),
        gl.some((g) => g.list.length > 1) ? h('p', { class: 'muted small' }, `Spanne über alle Varianten: ${fmtEUR(base + lo)} (günstigste) bis ${fmtEUR(base + hi)} (teuerste).`) : null));
  };
  paint();
  return box;
}

function costCharts(all, sums, budget) {
  const real = all.filter((c) => !isOffer(c));
  if (!real.length) return h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Sobald Rechnungen eingetragen sind, erscheinen hier die Auswertungen.'));
  const out = [];

  // 1) Budget-Auslastung
  if (budget) {
    const paid = Math.max(0, sums.net - sums.open), openV = Math.min(sums.open, Math.max(0, sums.net)), rest = Math.max(0, budget - sums.net);
    const segs = [{ label: 'Bezahlt (netto)', value: paid, color: 'var(--viz-1)' }, { label: 'Offene Rechnungen', value: openV, color: 'var(--viz-2)' }, { label: 'Noch verfügbar', value: rest, color: 'var(--viz-track)' }];
    const over = sums.net - budget;
    out.push(chartCard('Budget-Auslastung', stackBar(segs, Math.max(budget, sums.net)),
      h('div', {}, legend(segs.map((x) => ({ ...x, text: `${fmtEUR(x.value)} · ${Math.round((x.value / budget) * 100)} %` }))), over > 0 && h('p', { class: 'viz-warn' }, icon('warning', { filled: true, size: 18 }), ` Budget um ${fmtEUR(over)} überschritten`)),
      [['Budget', fmtEUR(budget)], ...segs.map((x) => [x.label, fmtEUR(x.value)])]));
  }

  // 2) Verteilung auf Gewerke
  const usages = [...phases(), ...tradeOptions()];
  let items = usages.map((u) => ({ label: u.name, value: sum(real.filter((c) => c.phaseId === u.id), (c) => c.amount) })).filter((x) => x.value > 0);
  const none = sum(real.filter((c) => !usageById(c.phaseId)), (c) => c.amount);
  if (none > 0) items.push({ label: 'Ohne Zuordnung', value: none });
  items.sort((a, b) => b.value - a.value);
  const top = items.slice(0, 5), restSum = sum(items.slice(5), (x) => x.value);
  const slices = top.map((x, i) => ({ ...x, color: `var(--viz-${i + 1})` }));
  if (restSum > 0) slices.push({ label: items.length - 5 === 1 ? items[5].label : `Weitere (${items.length - 5})`, value: restSum, color: 'var(--viz-other)' });
  const tot = sum(slices, (x) => x.value);
  out.push(chartCard('Ausgaben je Gewerk', donut(slices, short(tot), 'brutto'), legend(slices.map((x) => ({ ...x, text: `${fmtEUR(x.value)} · ${Math.round((x.value / tot) * 100)} %` }))), items.map((x) => [x.label, fmtEUR(x.value)])));

  // 3) + 4) Monatsverlauf
  const byM = {};
  for (const c of real) { const k = (c.date || '').slice(0, 7); if (k) byM[k] = (byM[k] || 0) + (Number(c.amount) || 0); }
  const keys = Object.keys(byM).sort();
  if (keys.length) {
    const [y0, m0] = keys[0].split('-').map(Number), [y1, m1] = keys[keys.length - 1].split('-').map(Number);
    let months = [];
    for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m++) { if (m > 12) { m = 1; y++; if (y > y1) break; } months.push(`${y}-${String(m).padStart(2, '0')}`); if (y === y1 && m === m1) break; }
    months = months.slice(-12);
    const data = months.map((k) => ({ key: k, label: monthLabel(k), value: byM[k] || 0 }));
    out.push(chartCard('Ausgaben pro Monat', monthBars(data), h('p', { class: 'muted small' }, 'Brutto, nach Rechnungsdatum.'), data.map((d) => [d.label, fmtEUR(d.value)])));
    let run = sum(keys.filter((k) => !months.includes(k) && k < months[0]).map((k) => ({ v: byM[k] })), (x) => x.v);
    const cum = data.map((d) => ({ label: d.label, value: (run += d.value) }));
    out.push(chartCard('Verlauf gegen Budget', cumLine(cum, budget), legend([{ label: 'Ausgaben insgesamt (brutto)', color: 'var(--viz-1)', text: fmtEUR(run) }, budget ? { label: 'Budget', color: 'var(--viz-ref)', text: fmtEUR(budget) } : null].filter(Boolean)), cum.map((d) => [d.label, fmtEUR(d.value)])));
  }

  // 5) Förderungen
  if (sums.subPaid + sums.subOpen > 0) {
    const segs = [{ label: 'Ausgezahlt', value: sums.subPaid, color: 'var(--viz-3)' }, { label: 'Noch ausstehend', value: sums.subOpen, color: 'var(--viz-4)' }];
    out.push(chartCard('Förderungen', stackBar(segs), legend(segs.map((x) => ({ ...x, text: fmtEUR(x.value) }))), [...segs.map((x) => [x.label, fmtEUR(x.value)]), ['Gesamt', fmtEUR(sums.subPaid + sums.subOpen)]]));
  }
  return swipeCharts(out);
}
function swipeCharts(out) {
  const track = h('div', { class: 'swipe', tabindex: 0, 'aria-label': 'Diagramme, seitlich wischen' }, out);
  const dots = h('div', { class: 'dots' }, out.map((_, i) => h('button', { class: 'dot' + (i ? '' : ' on'), 'aria-label': `Diagramm ${i + 1}`, onclick: () => track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' }) })));
  track.addEventListener('scroll', () => { const i = Math.round(track.scrollLeft / track.clientWidth); [...dots.children].forEach((d, j) => d.classList.toggle('on', i === j)); }, { passive: true });
  return h('div', { class: 'view-inner' }, track, out.length > 1 && dots);
}

// ---------- Zahlungsplan ----------
const skontoOf = (c) => (Number(c.skontoPct) > 0 && c.skontoUntil && c.skontoUntil >= today() ? { pct: Number(c.skontoPct), until: c.skontoUntil, save: Math.round(c.amount * Number(c.skontoPct)) / 100 } : null);
const openInvoices = (all = Store.all('costs')) => all.filter((c) => c.status === 'offen' && !isOffer(c));
// Offene Rechnungen nach Fälligkeit: überfällig, in 7 Tagen, später, ohne Datum
function payGroups(all = Store.all('costs')) {
  const t0 = today(), t7 = addDays(t0, 7);
  const list = openInvoices(all).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  return [
    { key: 'late', label: 'Überfällig', cls: 'bad', list: list.filter((c) => c.dueDate && c.dueDate < t0) },
    { key: 'week', label: 'In den nächsten 7 Tagen', cls: 'warn', list: list.filter((c) => c.dueDate && c.dueDate >= t0 && c.dueDate <= t7) },
    { key: 'later', label: 'Später', cls: '', list: list.filter((c) => c.dueDate && c.dueDate > t7) },
    { key: 'none', label: 'Ohne Fälligkeit', cls: '', list: list.filter((c) => !c.dueDate) },
  ].filter((g) => g.list.length);
}
async function markPaid(c) {
  if (await askConfirm(`„${c.title}“ (${fmtEUR(c.amount)}) als bezahlt markieren?`, 'Bezahlt')) {
    await Store.save('costs', { ...c, status: 'bezahlt', dueDate: '', paidDate: today() });
    toast('Als bezahlt markiert.');
  }
}
function payPlanCard(all) {
  const groups = payGroups(all);
  if (!groups.length) return null;
  const total = sum(groups.flatMap((g) => g.list), (c) => c.amount);
  const row = (c) => {
    const sk = skontoOf(c);
    return h('div', { class: 'payrow' },
      h('button', { type: 'button', class: 'payin', onclick: () => costForm(c) },
        h('span', { class: 'ovit' }, h('span', {}, c.title), h('span', { class: 'muted small' }, [c.dueDate ? 'fällig ' + fmtDate(c.dueDate) : '', c.vendor].filter(Boolean).join(' · ')),
          sk ? h('span', { class: 'chip warn skchip' }, `Skonto ${String(sk.pct).replace('.', ',')} % bis ${fmtDate(sk.until)} · zahle ${fmtEUR(c.amount - sk.save)}`) : null),
        h('strong', {}, fmtEUR(c.amount))),
      h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Als bezahlt markieren', onclick: () => markPaid(c) }, icon('check_circle', { size: 24 })));
  };
  return h('section', { class: 'card ov' },
    h('div', { class: 'split' }, h('h3', {}, 'Zu zahlen'), h('strong', { class: 'amount' }, fmtEUR(total))),
    ...groups.flatMap((g) => [h('div', { class: 'paygh ' + g.cls }, g.label, h('span', { class: 'muted small' }, ` · ${fmtEUR(sum(g.list, (c) => c.amount))}`)), ...g.list.map(row)]));
}
// Fällige Zahlungen je Monat gegen Darlehensauszahlungen
function liquidityCard(all) {
  const t0 = today(), ym0 = t0.slice(0, 7);
  const due = {}, pay = {};
  openInvoices(all).forEach((c) => { if (!c.dueDate) return; const k = c.dueDate < t0 ? ym0 : c.dueDate.slice(0, 7); due[k] = (due[k] || 0) + c.amount; });
  const loansReal = Store.all('settings').filter((x) => x.kind === 'loan' && !x.planned);
  loansReal.forEach((L) => (L.payouts || []).forEach((p) => { if (p.ym >= ym0) pay[p.ym] = (pay[p.ym] || 0) + Number(p.amount || 0); }));
  const keys = [...new Set([...Object.keys(due), ...Object.keys(pay)])].sort();
  if (!keys.length) return null;
  let acc = 0;
  const rows = keys.map((k) => { acc += (pay[k] || 0) - (due[k] || 0); return { k, d: due[k] || 0, p: pay[k] || 0, acc }; });
  const max = Math.max(...rows.flatMap((r) => [r.d, r.p]), 1);
  const noDue = sum(openInvoices(all).filter((c) => !c.dueDate), (c) => c.amount);
  return h('section', { class: 'card ov' },
    h('h3', {}, 'Zahlungen und Auszahlungen'),
    h('p', { class: 'muted small' }, 'Fällige Rechnungen gegen Darlehensauszahlungen je Monat. Der Saldo läuft ab diesem Monat mit; vorhandenes Eigenkapital ist nicht eingerechnet.'),
    ...rows.map((r) => h('div', { class: 'liq' },
      h('div', { class: 'split' }, h('strong', {}, monthLabel(r.k)), h('span', { class: 'liqs ' + (r.acc < 0 ? 'bad' : 'ok') }, 'Saldo ' + fmtEUR(r.acc))),
      h('div', { class: 'liqb' }, h('span', { class: 'liqt muted small' }, 'Fällig ' + fmtEUR(r.d)), h('span', { class: 'liqtr' }, h('span', { class: 'liqd', style: { width: (r.d / max) * 100 + '%' } }))),
      h('div', { class: 'liqb' }, h('span', { class: 'liqt muted small' }, 'Auszahlung ' + fmtEUR(r.p)), h('span', { class: 'liqtr' }, h('span', { class: 'liqp', style: { width: (r.p / max) * 100 + '%' } }))))),
    noDue > 0 ? h('p', { class: 'muted small' }, `Nicht enthalten: ${fmtEUR(noDue)} offene Rechnungen ohne Fälligkeit.`) : null,
    loansReal.length ? null : h('p', { class: 'muted small' }, 'Keine Darlehen mit Auszahlungsplan angelegt.'),
    Store.all('settings').some((x) => x.kind === 'loan' && x.planned) ? h('p', { class: 'muted small' }, 'Geplante Darlehen („Zum Budgetieren“) sind nicht eingerechnet.') : null);
}

// Kostenüberblick: Kosten (gestellte Rechnungen) getrennt nach bezahlt / offen, dazu Angebote und Förderung. Details nur auf Tipp.
let ovOpen = '';
function costOverview(all, sums) {
  const real = all.filter((c) => !isOffer(c));
  const paidL = real.filter((c) => c.status === 'bezahlt'), openL = real.filter((c) => c.status === 'offen');
  const paid = sum(paidL, (c) => c.amount), open = sum(openL, (c) => c.amount);
  const offerL = all.filter((c) => c.status === 'angebot').map((o) => ({ o, rest: Math.max(0, o.amount - sum(real.filter((c) => c.offerId === o.id), (c) => c.amount)) })).filter((x) => x.rest > 0);
  const subs = real.filter((c) => c.subsidy && Number(c.subsidyAmount) > 0);
  const fzPaidL = subs.filter((c) => c.subsidyPaid), fzOpenL = subs.filter((c) => !c.subsidyPaid);
  const fzPaid = sum(fzPaidL, (c) => c.subsidyAmount), fzOpen = sum(fzOpenL, (c) => c.subsidyAmount);
  const costs = paid + open;
  const groups = {
    bezahlt: { list: paidL.map((c) => ({ c, v: c.amount })), label: 'Bezahlt' },
    offen: { list: openL.map((c) => ({ c, v: c.amount })), label: 'Rechnung offen' },
    angebot: { list: offerL.map((x) => ({ c: x.o, v: x.rest })), label: 'Angebote, noch nicht abgerufen' },
    fzpaid: { list: fzPaidL.map((c) => ({ c, v: c.subsidyAmount })), label: 'Förderung ausgezahlt' },
    fzopen: { list: fzOpenL.map((c) => ({ c, v: c.subsidyAmount })), label: 'Förderung ausstehend' },
  };
  const box = h('section', { class: 'card ov' });
  const legendRow = (key, color, value) => h('button', { type: 'button', class: 'ovl' + (ovOpen === key ? ' on' : ''), 'aria-expanded': ovOpen === key ? 'true' : 'false', onclick: () => { ovOpen = ovOpen === key ? '' : key; paint(); } },
    h('span', { class: 'ovd', style: { background: color } }), h('span', { class: 'ovt' }, groups[key].label), h('strong', {}, fmtEUR(value)), icon(ovOpen === key ? 'expand_less' : 'expand_more', { size: 18 }));
  const detail = (key) => ovOpen === key ? h('div', { class: 'ovlist' }, groups[key].list.length
    ? groups[key].list.sort((a, b) => (b.c.date || '').localeCompare(a.c.date || '')).map(({ c, v }) => h('button', { type: 'button', class: 'ovi', onclick: () => costForm(c) }, h('span', { class: 'ovit' }, h('span', {}, c.title), h('span', { class: 'muted small' }, [fmtDate(c.date), c.vendor, phaseName(c.phaseId)].filter(Boolean).join(' · '))), h('strong', {}, fmtEUR(v))))
    : h('p', { class: 'muted small' }, 'Keine Einträge.')) : null;
  const paint = () => {
    const bar1 = stackBar([{ label: 'Bezahlt', value: paid, color: 'var(--viz-3)' }, { label: 'Rechnung offen', value: open, color: 'var(--viz-2)' }, { label: 'Angebote, noch nicht abgerufen', value: sum(offerL, (x) => x.rest), color: 'var(--viz-track)' }], costs + sum(offerL, (x) => x.rest));
    const out = [
      h('div', { class: 'split' }, h('h3', {}, 'Kosten'), h('strong', { class: 'amount' }, fmtEUR(costs))),
      h('p', { class: 'muted small' }, 'Alle gestellten Rechnungen, bezahlt und offen (brutto).'),
      bar1,
      legendRow('bezahlt', 'var(--viz-3)', paid), detail('bezahlt'),
      legendRow('offen', 'var(--viz-2)', open), detail('offen'),
      offerL.length ? [legendRow('angebot', 'var(--viz-track)', sum(offerL, (x) => x.rest)), detail('angebot')] : null,
    ];
    if (subs.length) {
      out.push(h('div', { class: 'ovsep' }), h('div', { class: 'split' }, h('h3', {}, 'Förderung'), h('strong', { class: 'amount' }, fmtEUR(fzPaid + fzOpen))),
        stackBar([{ label: 'Ausgezahlt', value: fzPaid, color: 'var(--viz-3)' }, { label: 'Ausstehend', value: fzOpen, color: 'var(--viz-4)' }], fzPaid + fzOpen),
        legendRow('fzpaid', 'var(--viz-3)', fzPaid), detail('fzpaid'), legendRow('fzopen', 'var(--viz-4)', fzOpen), detail('fzopen'));
    }
    out.push(h('div', { class: 'ovsep' }),
      h('div', { class: 'split ovnet' }, h('span', {}, 'Bisher ausgegeben', h('span', { class: 'muted small' }, ' bezahlt, abzüglich ausgezahlter Förderung')), h('strong', {}, fmtEUR(paid - fzPaid))),
      h('div', { class: 'split ovnet' }, h('span', {}, 'Kosten nach Förderung', h('span', { class: 'muted small' }, ' auch offene Rechnungen')), h('strong', {}, fmtEUR(costs - fzPaid))));
    box.replaceChildren(...out.flat(Infinity).filter(Boolean));
  };
  paint();
  return box;
}

// ---------- Nachweis-Export (Bank / Förderung) ----------
function proofRows(o) {
  const inRange = (c) => (!o.from || (c.date || '') >= o.from) && (!o.to || (c.date || '') <= o.to);
  let rows = Store.all('costs').filter((c) => !isOffer(c) && inRange(c));
  if (o.scope === 'paid') rows = rows.filter((c) => c.status === 'bezahlt');
  if (o.scope === 'sub') rows = rows.filter((c) => c.subsidy);
  return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}
function proofCsv(o) {
  const f = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');
  const head = ['Nr', 'Datum', 'Bezahlt am', 'Gewerk', 'Firma', 'Beschreibung', 'Status', 'Betrag', 'Förderfähig', 'Förderbetrag', 'Förderung ausgezahlt', 'Zu Angebot'];
  const q = (t) => '"' + String(t ?? '').replace(/"/g, '""') + '"';
  const rows = proofRows(o).map((c, i) => [i + 1, c.date, c.paidDate || '', q(phaseName(c.phaseId)), q(c.vendor), q(c.title), COST_STATES.find((x) => x[0] === c.status)?.[1] || c.status, f(c.amount), c.subsidy ? 'ja' : '', c.subsidy ? f(c.subsidyAmount) : '', c.subsidy ? (c.subsidyPaid ? 'ja' : 'nein') : '', q(Store.get('costs', c.offerId)?.title || '')]);
  download(`nachweis-${today()}.csv`, '﻿' + [head, ...rows].map((r) => r.join(';')).join('\n'), 'text/csv');
}
async function proofReport(o) {
  const rows = proofRows(o);
  const groups = new Map();
  rows.forEach((c) => { const k = c.phaseId || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
  const total = sum(rows, (c) => c.amount), paid = sum(rows.filter((c) => c.status === 'bezahlt'), (c) => c.amount), openA = sum(rows.filter((c) => c.status === 'offen'), (c) => c.amount);
  const subs = rows.filter((c) => c.subsidy);
  const subAll = sum(subs, (c) => c.subsidyAmount), subPaid = sum(subs.filter((c) => c.subsidyPaid), (c) => c.subsidyAmount);
  let nr = 0;
  const per = o.from || o.to ? `${o.from ? fmtDate(o.from) : 'Beginn'} – ${o.to ? fmtDate(o.to) : fmtDate(today())}` : 'gesamter Zeitraum';
  const scopeT = { paid: 'bezahlte Rechnungen', all: 'alle Rechnungen', sub: 'geförderte Positionen' }[o.scope];
  const table = [...groups.entries()].sort((a, b) => (phaseName(a[0]) || '~').localeCompare(phaseName(b[0]) || '~', 'de')).map(([k, list]) => h('table', { class: 'rp-t' },
    h('caption', {}, phaseName(k) || 'Ohne Gewerk'),
    h('thead', {}, h('tr', {}, ['Nr', 'Datum', 'Firma / Beschreibung', 'Status', 'Betrag'].map((t, i) => h('th', { class: i === 4 ? 'r' : '' }, t)))),
    h('tbody', {}, list.map((c) => h('tr', {},
      h('td', {}, String(++nr)), h('td', {}, fmtDate(c.date)),
      h('td', {}, h('strong', {}, c.vendor || '–'), h('div', {}, c.title), c.subsidy ? h('div', { class: 'rp-s' }, `Förderfähig ${fmtEUR(c.subsidyAmount)} · ${c.subsidyPaid ? 'ausgezahlt' : 'offen'}`) : null),
      h('td', {}, (COST_STATES.find((x) => x[0] === c.status)?.[1] || c.status).replace(/^Rechnung /, '') + (c.status === 'bezahlt' && c.paidDate ? ' ' + fmtDate(c.paidDate) : '')),
      h('td', { class: 'r' }, fmtEUR(c.amount))))),
    h('tfoot', {}, h('tr', {}, h('td', { colspan: 4 }, 'Zwischensumme'), h('td', { class: 'r' }, fmtEUR(sum(list, (c) => c.amount)))))));
  // Belege (Fotos und angehängte Bilder)
  const annex = [];
  if (o.photos) {
    for (const c of rows) {
      const imgs = [];
      for (const id of c.photos || []) imgs.push(Store.photoPaths(id).full);
      const files = [];
      for (const d of docsOfCost(c)) (String(d.mime || '').startsWith('image/') ? imgs.push(d.path) : files.push(d.name));
      if (!imgs.length && !files.length) continue;
      const box = h('section', { class: 'rp-a' }, h('h3', {}, `Beleg ${rows.indexOf(c) + 1}: ${c.vendor ? c.vendor + ' – ' : ''}${c.title}`), files.length ? h('p', { class: 'rp-s' }, 'Weitere Anlagen (Datei): ' + files.join(', ')) : null);
      for (const p of imgs) {
        const img = h('img', { alt: 'Beleg' });
        try { const u = await Store.blobURL(p); if (u) { img.src = u; box.append(img); } } catch {}
      }
      annex.push(box);
    }
  }
  const ov = h('div', { id: 'report' },
    h('div', { class: 'rp-bar noprint' },
      h('button', { type: 'button', class: 'btn', onclick: () => ov.remove() }, icon('chevron_left', { size: 20 }), ' Zurück'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => { document.body.classList.add('printing'); setTimeout(() => { window.print(); document.body.classList.remove('printing'); }, 50); } }, icon('download', { size: 20 }), ' Drucken / PDF')),
    h('div', { class: 'rp-page' },
      h('h1', {}, o.title || 'Kostennachweis'),
      h('p', { class: 'rp-s' }, `Zeitraum: ${per} · Umfang: ${scopeT} · erstellt am ${fmtDate(today())}`),
      h('div', { class: 'rp-sum' },
        h('div', {}, h('span', {}, 'Summe'), h('strong', {}, fmtEUR(total))),
        h('div', {}, h('span', {}, 'davon bezahlt'), h('strong', {}, fmtEUR(paid))),
        h('div', {}, h('span', {}, 'noch offen'), h('strong', {}, fmtEUR(openA))),
        subs.length ? h('div', {}, h('span', {}, 'Förderfähig'), h('strong', {}, fmtEUR(subAll))) : null,
        subs.length ? h('div', {}, h('span', {}, 'Förderung ausgezahlt'), h('strong', {}, fmtEUR(subPaid))) : null),
      rows.length ? table : h('p', {}, 'Keine Positionen im gewählten Zeitraum.'),
      annex.length ? h('h2', { class: 'rp-h2' }, 'Belege') : null, annex));
  document.body.append(ov);
  ov.scrollTop = 0;
}
function proofSheet() {
  const dates = Store.all('costs').map((c) => c.date).filter(Boolean).sort();
  const from = h('input', { type: 'date', value: '' });
  const to = h('input', { type: 'date', value: '' });
  const title = h('input', { type: 'text', value: 'Kostennachweis Bauvorhaben' });
  const scope = h('select', {}, [['paid', 'Bezahlte Rechnungen'], ['all', 'Alle Rechnungen (auch offene)'], ['sub', 'Nur geförderte Positionen']].map(([v, t]) => h('option', { value: v }, t)));
  const photos = h('input', { type: 'checkbox' });
  const get = () => ({ from: from.value, to: to.value, title: title.value.trim(), scope: scope.value, photos: photos.checked });
  const dlg = sheet('Nachweis erstellen', [
    h('p', { class: 'muted small' }, 'Bericht für Bank oder Förderstelle: Positionen je Gewerk mit Zwischensummen. Angebote sind nicht enthalten.'),
    field('Titel', title), field('Umfang', scope), field('Von', from), field('Bis', to),
    h('label', { class: 'check' }, photos, ' Belegfotos anhängen (Rechnungsfotos und Bilder)'),
    dates.length ? h('p', { class: 'muted small' }, `Belege von ${fmtDate(dates[0])} bis ${fmtDate(dates[dates.length - 1])}. Leer lassen = alles.`) : null,
    h('div', { class: 'co-btns' },
      h('button', { type: 'button', class: 'btn', onclick: () => proofCsv(get()) }, icon('download', { size: 20 }), ' CSV (Excel)'))
  ], { saveLabel: 'Bericht anzeigen', onSave: async () => { setTimeout(() => proofReport(get()), 50); } });
}

function viewCosts() {
  const all = Store.all('costs');
  const sums = costSums(all);
  const { spent, subPaid, subOpen, net, open, offers } = sums;
  const budget = budgetInfo();
  const parts = budgetParts();
  const fcount = costFilter.phase.size + costFilter.status.size;
  let list = all.filter((c) => (!costFilter.phase.size || costFilter.phase.has(c.phaseId)) && (!costFilter.status.size || costFilter.status.has(c.status))).sort(byDateDesc);
  const usages = [...phases(), ...tradeOptions()];

  const usedUsage = usages.filter((p) => all.some((c) => c.phaseId === p.id));
  const fBar = filterBar(costFilter, [
    { title: 'Status', key: 'status', items: COST_STATES.map(([v, t]) => ({ v, t, icon: icon(COST_ICONS[v] || 'receipt_long', { size: 22 }) })) },
    { title: 'Gewerk', key: 'phase', items: usedUsage.map((p) => ({ v: p.id, t: p.name, icon: phaseIcon(p, { size: 22 }) })) },
  ]);
  const tabs = h('div', { class: 'seg' }, [['auswertung', 'Auswertung'], ['rechnungen', `Belege (${all.length})`]].map(([k, t]) => h('button', { class: 'pill' + (costTab === k ? ' on' : ''), onclick: () => { costTab = k; render(); } }, t)));

  const summary = [
    costOverview(all, sums),
    payPlanCard(all),
    liquidityCard(all),
    h('section', { class: 'card budget', onclick: budgetForm },
      h('div', { class: 'split' }, h('h3', {}, 'Budget'), h('strong', { class: 'amount' }, budget ? fmtEUR(budget) : '–')),
      parts.length
        ? parts.map((p) => h('div', { class: 'brow' + (p.loan ? ' loanrow' : ''), onclick: p.loan ? (ev) => { ev.stopPropagation(); go('finanzierung'); } : null, role: p.loan ? 'link' : null },
            h('span', { class: 'bl' }, p.loan && icon('account_balance', { size: 18 }), p.name, p.loan && p.planned && chip('geplant', 'cs-angebot')), h('span', { class: 'muted' }, fmtEUR(p.amount)), bar(budget ? (p.amount / budget) * 100 : 0)))
        : h('p', { class: 'muted small' }, 'Antippen, um das Budget festzulegen (z. B. Eigenkapital). Darlehen kommen aus „Finanzierung“.'),
      parts.some((p) => p.loan) && h('p', { class: 'muted small' }, 'Darlehen antippen öffnet die Finanzierung.')),
    variantCard(all, sums, budget),
    costCharts(all, sums, budget),
  ];
  const invoices = [
    fBar,
    list.length
      ? list.map((c) =>
          swipeDel(h(
            'article',
            { class: 'card entry', onclick: () => costForm(c) },
            h('div', { class: 'entry-top' }, h('span', { class: 'muted small' }, fmtDate(c.date)), chip(COST_STATES.find((s) => s[0] === c.status)?.[1] || c.status, 'cs-' + c.status)),
            h('div', { class: 'split' }, h('h3', {}, c.title), h('strong', { class: 'amount' }, fmtEUR(c.amount))),
            h('div', { class: 'muted small' }, [c.vendor, phaseName(c.phaseId)].filter(Boolean).join(' · ')),
            offerOf(c) && h('div', {}, chip('Abschlag zu ' + offerOf(c).title, 'cs-angebot')),
            c.status === 'offen' && c.dueDate ? h('div', {}, chip((c.dueDate < today() ? 'Überfällig seit ' : 'Fällig ') + fmtDate(c.dueDate), c.dueDate < today() ? 'ds-offen' : 'warn')) : null,
            c.status === 'angebot' && offerSplit(c).ps.length ? offerBar(c) : null,
            c.status === 'angebot' && h('div', {}, h('button', { type: 'button', class: 'btn small', onclick: (ev) => { ev.stopPropagation(); costForm(null, { status: 'offen', offerId: c.id, vendor: c.vendor || '', phaseId: c.phaseId || '', title: `Abschlag ${offerSplit(c).ps.length + 1} ${c.title}` }); } }, icon('add', { size: 18 }), ' Abschlag anlegen')),
            c.subsidy && h('div', {}, chip(`Förderung ${fmtEUR(c.subsidyAmount)} · ${c.subsidyPaid ? 'ausgezahlt' : 'offen'}`, c.subsidyPaid ? 'done' : 'sub-open')),
            docsOfCost(c).length ? h('div', { class: 'att-chips' }, docsOfCost(c).map((d) => h('button', { type: 'button', class: 'tchip plain attc', onclick: (ev) => { ev.stopPropagation(); openDoc(d); } }, icon('attach_file', { size: 14 }), ' ' + d.name))) : null,
            photoStrip(c.photos)
          ), () => Store.remove('costs', c.id), c.status === 'offen' ? { label: 'Bezahlt', icon: 'check', cls: 'ok', run: () => markPaid(c) } : null)
        )
      : empty('Keine Kosten', fcount ? 'Mit diesen Filtern gibt es nichts. Tippe oben auf „Zurücksetzen“.' : 'Trage Rechnungen, Abschläge und Angebote ein und hänge Belege und Dokumente an.', 'payments'),
  ];
  const proofBtn = h('button', { type: 'button', class: 'btn block', onclick: proofSheet }, icon('description', { size: 20 }), ' Nachweis für Bank / Förderung');
  return h('div', { class: 'view' }, tabs, costTab === 'auswertung' ? [...summary, proofBtn] : invoices, fab(() => costForm()));
}

// ---------- Suche ----------
let searchQ = '';
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
function searchAll(q) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const rows = [];
  const add = (type, label, icn, items, texts, title, sub, open) => items.forEach((x) => {
    const hay = norm(texts(x).filter(Boolean).join(' · '));
    if (terms.every((t) => hay.includes(t))) rows.push({ type, label, icn, x, title: title(x), sub: sub(x), open: () => open(x), date: x.date || '' });
  });
  add('diary', 'Tagebuch', 'menu_book', Store.all('diary'), (x) => [x.title, x.text, x.who, ...(x.companies || []), phaseName(x.phaseId)], (x) => x.title, (x) => [fmtDate(x.date), x.who].filter(Boolean).join(' · '), diaryForm);
  add('companies', 'Firmen', 'contacts', companies(), (x) => [x.name, x.contact, x.phone, x.email, x.note, phaseName(x.trade)], (x) => x.name, (x) => [phaseName(x.trade), x.phone].filter(Boolean).join(' · '), companyDetail);
  add('costs', 'Kosten', 'payments', Store.all('costs'), (x) => [x.title, x.vendor, x.note, phaseName(x.phaseId)], (x) => `${x.title} · ${fmtEUR(x.amount)}`, (x) => [x.vendor, phaseName(x.phaseId), fmtDate(x.date)].filter(Boolean).join(' · '), costForm);
  add('defects', 'Mängel', 'warning', Store.all('defects'), (x) => [x.title, x.description, x.room, phaseName(x.phaseId)], (x) => x.title, (x) => [x.room, phaseName(x.phaseId)].filter(Boolean).join(' · '), defectForm);
  add('todos', 'Aufgaben', 'task_alt', Store.all('todos'), (x) => [x.title, x.note, x.assignee, phaseName(x.phaseId)], (x) => x.title, (x) => [x.done ? 'erledigt' : 'offen', phaseName(x.phaseId)].filter(Boolean).join(' · '), todoForm);
  add('shopping', 'Einkauf', 'shopping_cart', Store.all('shopping'), (x) => [x.title, x.store, ...(x.items || []).map((i) => i.name + ' ' + (i.note || ''))], (x) => x.title, (x) => [x.store, x.done ? 'erledigt' : 'offen'].filter(Boolean).join(' · '), (x) => (x.done ? shopDoneDetail(x.id) : go('einkauf')));
  add('documents', 'Dokumente', 'folder', Store.all('documents'), (x) => [x.name, x.category, x.note, phaseName(x.phaseId)], (x) => x.name, (x) => [x.category, phaseName(x.phaseId)].filter(Boolean).join(' · '), docEditForm);
  add('phases', 'Planung', 'calendar_month', phases(), (x) => [x.name, x.note], (x) => x.name, (x) => x.progress + ' %', phaseForm);
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
function viewSearch() {
  const out = h('div', { class: 'view-inner' });
  const input = h('input', { type: 'search', placeholder: 'Suchen in Tagebuch, Kosten, Mängeln …', value: searchQ, enterkeyhint: 'search', 'aria-label': 'Suche' });
  const paint = () => {
    searchQ = input.value;
    const rows = searchAll(searchQ);
    if (!searchQ.trim()) return out.replaceChildren(empty('Alles durchsuchen', 'Tippe einen Begriff – gesucht wird in Tagebuch, Kosten, Mängeln, Aufgaben, Dokumenten und Planung.', 'search'));
    if (!rows.length) return out.replaceChildren(empty('Nichts gefunden', 'Probiere einen anderen Begriff.', 'search'));
    out.replaceChildren(h('p', { class: 'muted small' }, `${rows.length} Treffer`), h('div', { class: 'card' }, rows.slice(0, 80).map((r) => h('div', { class: 'hit', onclick: r.open }, icon(r.icn, { size: 22 }), h('div', { class: 'hit-t' }, h('div', {}, r.title), h('div', { class: 'muted small' }, [r.label, r.sub].filter(Boolean).join(' · ')))))));
  };
  input.addEventListener('input', paint);
  paint();
  if (!searchQ) setTimeout(() => { if (route() === 'suche') input.focus(); }, 50);
  return h('div', { class: 'view' }, input, out);
}

// ---------- Ansicht: Finanzierung ----------
const LOAN_DEFAULT = { planned: false, name: '', amount: '', rate: '', method: 'annuitaet', repay: 2, start: '', freeYears: 0, fixYears: 10, followRate: '', payouts: [], commitRate: 3, commitFree: 12, specialYearly: '', specialMax: '', specialMonth: 12, specials: [] };
const loans = () => Store.all('settings').filter((x) => x.kind === 'loan').sort((a, b) => (a.start || '').localeCompare(b.start || '') || (a.name || '').localeCompare(b.name || ''));
const fmt0 = (n) => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';
const pct2 = (n) => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' %';
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// Zeilen aus Monat + Betrag (Auszahlungen, Sondertilgungen)
function ymRows(list, ph) {
  const box = h('div', { class: 'brows' });
  const add = (r = {}) => {
    const ym = h('input', { type: 'month', value: r.ym || '', 'aria-label': 'Monat' });
    const amt = dec({ class: 'pamt', step: '500', min: '0', inputmode: 'decimal', placeholder: 'EUR', value: r.amount ?? '', 'aria-label': 'Betrag' });
    const row = h('div', { class: 'prow ymrow' }, ym, amt, h('button', { type: 'button', class: 'mv', 'aria-label': 'Entfernen', onclick: () => row.remove() }, icon('close', { size: 18 })));
    box.append(row);
  };
  list.forEach(add);
  return { el: [box, h('button', { type: 'button', class: 'btn small', onclick: () => add() }, icon('add', { size: 18 }), ' ' + ph)], get: () => [...box.querySelectorAll('.ymrow')].map((r) => ({ ym: r.querySelector('input[type=month]').value, amount: Number(r.querySelector('.pamt').value) || 0 })).filter((x) => x.ym && x.amount > 0) };
}

function loanForm(entry) {
  const e = { ...LOAN_DEFAULT, ...(entry || {}), kind: 'loan' };
  const num = (v, o = {}) => dec({ inputmode: 'decimal', step: o.step || '0.01', min: o.min ?? '0', value: v ?? '', placeholder: o.ph || '' });
  const name = h('input', { type: 'text', required: true, value: e.name, placeholder: 'z. B. Bankdarlehen, KfW, Familie', list: 'loan-names' });
  const dl = h('datalist', { id: 'loan-names' }, ['Bankdarlehen', 'KfW-Darlehen', 'Bausparvertrag', 'Darlehen Familie'].map((n) => h('option', { value: n })));
  const amount = num(e.amount, { step: '1000', ph: 'EUR' });
  const rate = num(e.rate, { ph: 'z. B. 3,6' });
  const method = h('select', { value: e.method }, h('option', { value: 'annuitaet', selected: e.method === 'annuitaet' }, 'Annuität (feste Rate)'), h('option', { value: 'rate', selected: e.method === 'rate' }, 'Ratentilgung (feste Tilgung)'));
  const repay = num(e.repay, { ph: 'z. B. 2' });
  const start = h('input', { type: 'month', value: e.start || '' });
  const freeYears = num(e.freeYears, { step: '0.5' });
  const fixYears = num(e.fixYears, { step: '1', ph: '0 = bis zum Ende' });
  const follow = num(e.followRate, { ph: 'leer = gleicher Zins' });
  const payouts = ymRows(e.payouts || [], 'Auszahlung hinzufügen');
  const commitRate = num(e.commitRate, { step: '0.05' });
  const commitFree = num(e.commitFree, { step: '1' });
  const syear = num(e.specialYearly, { step: '500', ph: 'EUR pro Jahr' });
  const smax = num(e.specialMax, { step: '500', ph: 'EUR pro Jahr' });
  const smonth = h('select', { value: String(e.specialMonth) }, MONTHS.map((m, i) => h('option', { value: String(i + 1), selected: Number(e.specialMonth) === i + 1 }, m)));
  const specials = ymRows(e.specials || [], 'Einmalige Sondertilgung');
  const read = () => ({ ...e, name: name.value.trim() || 'Darlehen', planned: planned.checked, amount: Number(amount.value) || 0, rate: Number(rate.value) || 0, method: method.value, repay: Number(repay.value) || 0, start: start.value, freeYears: Number(freeYears.value) || 0, fixYears: Number(fixYears.value) || 0, followRate: follow.value === '' ? '' : Number(follow.value), payouts: payouts.get(), commitRate: Number(commitRate.value) || 0, commitFree: Number(commitFree.value) || 0, specialYearly: Number(syear.value) || 0, specialMax: Number(smax.value) || 0, specialMonth: Number(smonth.value) || 12, specials: specials.get() });
  const planned = h('input', { type: 'checkbox', checked: !!e.planned });
  const preview = h('div', { class: 'note' });
  const upd = () => {
    const L = read();
    if (!(L.amount > 0) || !L.start) { preview.textContent = 'Betrag und Beginn eintragen, dann erscheint die Vorschau.'; return; }
    const r = Fin.summarize(L);
    preview.replaceChildren(h('div', {}, h('strong', {}, `Rate ${fmtEUR(r.payment)}`), ` · Laufzeit bis ${r.endYm ? Fin.fmtYm(r.endYm) : 'über 60 Jahre'}`), h('div', {}, `Zinsen gesamt ${fmtEUR(r.interest)}`, r.saved > 0 ? ` · durch Sondertilgung ${fmtEUR(r.saved)} gespart` : ''));
  };
  const groups = [];
  const form = [
    field('Bezeichnung', name), dl,
    h('label', { class: 'check' }, planned, h('span', {}, 'Nur zum Budgetieren (noch kein Vertrag)')),
    h('p', { class: 'muted small' }, 'Geplante Darlehen rechnen im Budget und im Tilgungsplan mit, sind aber als Planspiel markiert – z. B. um Varianten durchzurechnen.'),
    field('Darlehensbetrag (EUR)', amount),
    h('div', { class: 'two' }, field('Sollzins (% p. a.)', rate), field('Anfangstilgung (% p. a.)', repay)),
    field('Tilgungsart', method),
    field('Beginn (erste Rate)', start),
    h('div', { class: 'two' }, field('Tilgungsfrei (Jahre)', freeYears, 'nur Zinsen, z. B. in der Bauphase'), field('Zinsbindung (Jahre)', fixYears)),
    field('Anschlusszins (% p. a.)', follow, 'gilt nach Ende der Zinsbindung; die Rate bleibt gleich'),
    h('h4', { class: 'sub' }, 'Auszahlung in Raten (optional)'),
    h('p', { class: 'muted small' }, 'Ohne Eintrag wird der ganze Betrag zum Beginn ausgezahlt. Mit Raten zahlst du Zinsen nur auf das abgerufene Geld, Tilgung startet nach der letzten Auszahlung.'),
    ...payouts.el,
    h('div', { class: 'two' }, field('Bereitstellungszins (% p. a.)', commitRate), field('Bereitstellungsfrei (Monate)', commitFree)),
    h('h4', { class: 'sub' }, 'Sondertilgung'),
    h('div', { class: 'two' }, field('Geplant pro Jahr (EUR)', syear), field('Im Monat', smonth)),
    field('Erlaubt pro Jahr (EUR)', smax, 'leer = unbegrenzt; Höchstbetrag laut Vertrag'),
    ...specials.el,
    preview,
  ];
  void groups;
  sheet(entry ? 'Darlehen bearbeiten' : 'Neues Darlehen', form, {
    onSave: () => Store.save('settings', read()),
    onDelete: entry && (() => Store.remove('settings', e.id)),
  });
  sheetEl_listen(form, upd);
  upd();
}
const sheetEl_listen = (form, fn) => { document.querySelector('dialog[open]')?.addEventListener('input', fn); document.querySelector('dialog[open]')?.addEventListener('change', fn); };

function downloadPlan(L, plan) {
  const head = ['Monat', 'Zinsen', 'Bereitstellung', 'Tilgung', 'Sondertilgung', 'Rate', 'Restschuld'];
  const f = (n) => n.toFixed(2).replace('.', ',');
  const rows = plan.rows.map((r) => [r.ym, f(r.interest), f(r.fee), f(r.principal), f(r.special), f(r.payment), f(r.balance)]);
  download(`tilgungsplan-${(L.name || 'darlehen').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, '﻿' + [head, ...rows].map((r) => r.join(';')).join('\n'), 'text/csv');
}

const openLoans = new Set();
function viewFinance() {
  const list = loans();
  if (!list.length) return h('div', { class: 'view' }, empty('Noch kein Darlehen', 'Lege Darlehen mit Zins, Tilgung, Sondertilgung und Auszahlung an – die App rechnet den Tilgungsplan.', 'account_balance'), fab(() => loanForm()));
  const res = list.map((L) => ({ L, r: Fin.summarize(L) }));
  const plans = res.map((x) => x.r.plan);
  const total = sum(list, (L) => L.amount);
  const nowBal = sum(res, (x) => x.r.nowBalance);
  const interest = sum(res, (x) => x.r.interest);
  const rateNow = sum(res, (x) => (x.r.plan.rows.find((row) => row.ym === Fin.nowYm()) || x.r.plan.rows.find((row) => row.principal > 0) || { payment: 0 }).payment);
  const ends = res.map((x) => x.r.endYm).filter(Boolean).sort();
  const end = ends.length === res.length ? ends[ends.length - 1] : null;
  const years = Fin.yearly(plans);
  const plannedSum = sum(list.filter((L) => L.planned), (L) => L.amount);

  const stats = h('div', { class: 'stats' },
    stat('Darlehen gesamt', fmtEUR(total), plannedSum ? `davon ${fmtEUR(plannedSum)} nur zum Budgetieren` : 'fließt ins Budget (Kosten)'),
    stat('Monatliche Rate', fmtEUR(rateNow), 'aktuell, alle Darlehen'),
    stat('Restschuld heute', fmtEUR(nowBal)),
    stat('Schuldenfrei', end ? Fin.fmtYm(end) : '–', `Zinsen gesamt ${fmtEUR(interest)}`));

  const out = [];
  out.push(chartCard('Restschuld im Verlauf', cumLine(years.map((y) => ({ label: y.year, value: y.balance })), null, 'var(--viz-1)', 'Restschuld'), legend([{ label: 'Restschuld (Jahresende)', color: 'var(--viz-1)', text: fmtEUR(total) + ' zu Beginn' }]), years.map((y) => [y.year, fmtEUR(y.balance)])));
  const segs = [{ label: 'Zinsen', color: 'var(--viz-2)' }, { label: 'Tilgung', color: 'var(--viz-1)' }, { label: 'Sondertilgung', color: 'var(--viz-3)' }];
  out.push(chartCard('Zinsen und Tilgung je Jahr', stackBars(years.map((y) => ({ label: y.year, vals: [y.interest, y.principal, y.special] })), segs), legend(segs.map((sg, k) => ({ ...sg, text: fmtEUR(sum(years, (y) => [y.interest, y.principal, y.special][k])) }))), years.map((y) => [y.year, `Zinsen ${fmtEUR(y.interest)} · Tilgung ${fmtEUR(y.principal)}${y.special ? ' · Sonder ' + fmtEUR(y.special) : ''}`])));

  const cards = res.map(({ L, r }) => {
    const open = openLoans.has(L.id);
    const yrs = Fin.yearly([r.plan]);
    return h('article', { class: 'card loan' },
      h('div', { class: 'split', onclick: () => loanForm(L) }, h('h3', {}, L.name), L.planned && chip('Zum Budgetieren', 'cs-angebot'), h('strong', { class: 'amount' }, fmtEUR(L.amount))),
      h('div', { class: 'muted small', onclick: () => loanForm(L) }, `${pct2(L.rate)} Zins · ${L.method === 'rate' ? 'Ratentilgung' : 'Annuität'} ${pct2(L.repay)} · Rate ${fmtEUR(r.payment)}`),
      h('div', { class: 'muted small', onclick: () => loanForm(L) }, `bis ${r.endYm ? Fin.fmtYm(r.endYm) : '–'} · Zinsen ${fmtEUR(r.interest)} · ${(L.start || '') > Fin.nowYm() ? 'Beginn ' + Fin.fmtYm(L.start) : 'Restschuld heute ' + fmtEUR(r.nowBalance)}`),
      L.fixYears > 0 && r.fixBalance != null && h('div', { class: 'muted small' }, `Restschuld nach ${L.fixYears} Jahren Zinsbindung: ${fmtEUR(r.fixBalance)}`),
      r.saved > 0 && h('div', {}, chip(`Sondertilgung spart ${fmtEUR(r.saved)} Zinsen und ${r.monthsSaved >= 12 ? Math.floor(r.monthsSaved / 12) + ' J ' : ''}${r.monthsSaved % 12} Mon.`, 'done')),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn-text small', 'aria-expanded': String(open), onclick: () => { open ? openLoans.delete(L.id) : openLoans.add(L.id); render(); } }, icon(open ? 'expand_less' : 'expand_more', { size: 20 }), ' Tilgungsplan'),
        h('button', { class: 'btn-text small', onclick: () => downloadPlan(L, r.plan) }, icon('table_chart', { size: 18 }), ' CSV')),
      open && h('div', { class: 'tablewrap' }, h('table', { class: 'viz-table plan' },
        h('thead', {}, h('tr', {}, ['Jahr', 'Zinsen', 'Tilgung', 'Sonder', 'Rest'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, yrs.map((y) => h('tr', {}, h('th', { scope: 'row' }, y.year), h('td', {}, fmt0(y.interest)), h('td', {}, fmt0(y.principal)), h('td', {}, y.special ? fmt0(y.special) : '–'), h('td', {}, fmt0(y.balance)))))))
    );
  });
  return h('div', { class: 'view' }, stats, swipeCharts(out), cards, fab(() => loanForm()));
}

// ---------- Ansicht: Mängel ----------
function defectForm(entry) {
  const e = entry || { date: today(), title: '', description: '', room: '', phaseId: '', vendor: '', status: 'offen', due: '', photos: [] };
  const title = h('input', { type: 'text', required: true, placeholder: 'z. B. Riss im Putz', value: e.title });
  const desc = h('textarea', { rows: 4, placeholder: 'Genauere Beschreibung', value: e.description || '' });
  const room = h('input', { type: 'text', list: 'rooms', placeholder: 'Raum / Ort', value: e.room || '' });
  const dl = h('datalist', { id: 'rooms' }, ROOMS.map((r) => h('option', { value: r })));
  const phase = usageSelect(e.phaseId, '– Gewerk unbekannt –');
  const vendor = vendorInput(e.vendor, 'Verantwortliche Firma');
  const status = h('select', { value: e.status }, optionList(DEFECT_STATES, e.status));
  const due = h('input', { type: 'date', value: e.due || '' });
  const date = h('input', { type: 'date', required: true, value: e.date });
  const pf = photoField(e.photos);
  sheet(entry ? 'Mangel bearbeiten' : 'Neuer Mangel', [field('Festgestellt am', date), field('Titel', title), field('Beschreibung', desc), field('Ort', room), dl, field('Gewerk', phase), field('Verantwortlich', vendor), field('Status', status), field('Frist zur Behebung', due), pf.el], {
    onSave: async () => {
      await Store.save('defects', { ...e, date: date.value, title: title.value.trim(), description: desc.value.trim(), room: room.value.trim(), phaseId: phase.value, vendor: vendor.value.trim(), status: status.value, due: due.value, photos: pf.ids });
      await ensureCompany(vendor.value, phase.value);
      await pf.commit();
    },
    onCancel: () => pf.cancel(),
    onDelete: entry && (() => Store.remove('defects', e.id)),
  });
}

let defectTab = 'aktiv';
const defectFilter = { status: new Set(), phase: new Set() };
function viewDefects() {
  const all = Store.all('defects');
  const active = (d) => d.status === 'offen' || d.status === 'klaerung';
  const nAct = all.filter(active).length;
  const tabsDef = [['aktiv', `Aktiv (${nAct})`], ['erledigt', `Behoben (${all.length - nAct})`], ['alle', `Alle (${all.length})`]];
  const list = all.filter((d) => (defectTab === 'alle' || (defectTab === 'aktiv') === active(d)) && (!defectFilter.status.size || defectFilter.status.has(d.status)) && (!defectFilter.phase.size || defectFilter.phase.has(d.phaseId))).sort(byDateDesc);
  const usedUsage = [...phases(), ...tradeOptions()].filter((p) => all.some((d) => d.phaseId === p.id));
  const DEF_ICONS = { offen: 'error', klaerung: 'warning', behoben: 'check_circle', abgenommen: 'task_alt' };
  return h(
    'div',
    { class: 'view' },
    h('div', { class: 'seg' }, tabsDef.map(([v, t]) => h('button', { class: 'pill' + (defectTab === v ? ' on' : ''), onclick: () => { defectTab = v; render(); } }, t))),
    filterBar(defectFilter, [
      { title: 'Status', key: 'status', items: DEFECT_STATES.map(([v, t]) => ({ v, t, icon: icon(DEF_ICONS[v] || 'warning', { size: 22 }) })) },
      { title: 'Gewerk', key: 'phase', items: usedUsage.map((p) => ({ v: p.id, t: p.name, icon: phaseIcon(p, { size: 22 }) })) },
    ]),
    list.length
      ? list.map((d) =>
          swipeDel(h(
            'article',
            { class: 'card entry', onclick: () => defectForm(d) },
            h('div', { class: 'entry-top' }, h('span', { class: 'muted small' }, fmtDate(d.date)), chip(DEFECT_STATES.find((s) => s[0] === d.status)?.[1] || d.status, 'ds-' + d.status)),
            h('h3', {}, d.title),
            h('div', { class: 'muted small' }, [d.room, d.vendor, d.due && 'Frist ' + fmtDate(d.due)].filter(Boolean).join(' · ')),
            d.description && h('p', { class: 'clamp' }, d.description),
            photoStrip(d.photos)
          ), () => Store.remove('defects', d.id), (() => { const act = isActiveDefect(d); return { label: act ? 'Behoben' : 'Wieder offen', icon: act ? 'check' : 'undo', cls: act ? 'ok' : '', run: () => Store.save('defects', { ...d, status: act ? 'behoben' : 'offen' }) }; })())
        )
      : empty('Keine Mängel in dieser Ansicht', 'Halte Mängel mit Foto, Ort und Frist fest, bevor Handwerker abziehen.', 'warning'),
    fab(() => defectForm())
  );
}

// ---------- Ansicht: Aufgaben ----------
// Aufgaben einer Phase bestimmen deren Fortschritt (erledigt / alle), höchstens 95 %.
// 100 % und „Fertig“ werden immer von Hand gesetzt.
const todosOf = (phaseId) => Store.all('todos').filter((t) => t.phaseId === phaseId);
async function syncPhase(phaseId) {
  const ph = phaseId && Store.get('phases', phaseId);
  if (!ph || ph.progress >= 100 || ph.state === 'fertig') return;
  const list = todosOf(phaseId);
  if (!list.length) return;
  const pct = Math.min(95, Math.round((list.filter((t) => t.done).length / list.length) * 100));
  const state = pct > 0 ? 'laeuft' : ph.state === 'laeuft' && ph.progress > 0 ? 'geplant' : ph.state;
  if (pct !== ph.progress || state !== ph.state) await Store.save('phases', { ...ph, progress: pct, state });
}
async function saveTodo(t, oldPhaseId) {
  await Store.save('todos', t);
  await syncPhase(t.phaseId);
  if (oldPhaseId && oldPhaseId !== t.phaseId) await syncPhase(oldPhaseId);
}
// Abhängigkeiten: t.after = IDs von Aufgaben, die vorher erledigt sein müssen
const preds = (t) => (t.after || []).map((id) => Store.get('todos', id)).filter(Boolean);
const openPreds = (t) => preds(t).filter((p) => !p.done);
const blockedBy = (t) => (t.done ? [] : openPreds(t));
const successors = (t) => Store.all('todos').filter((x) => (x.after || []).includes(t.id));
// hängt a (auch über Zwischenschritte) von b ab?
function dependsOn(a, b, seen = new Set()) {
  if (!a || seen.has(a.id)) return false;
  seen.add(a.id);
  return (a.after || []).some((id) => id === b.id || dependsOn(Store.get('todos', id), b, seen));
}
async function toggleTodo(t, done) {
  const wait = done ? openPreds(t) : [];
  if (wait.length && !confirm(`Noch offen: ${wait.map((p) => p.title).join(', ')}.\n\nTrotzdem als erledigt markieren?`)) { render(); return; }
  const el = done && document.querySelector(`.todo[data-id="${t.id}"]`);
  if (el) { el.querySelector('.todo-chk')?.replaceChildren(icon('check', { size: 20 })); el.classList.add('todo-pop'); await new Promise((r) => setTimeout(r, 420)); }
  await saveTodo({ ...t, done }, t.phaseId);
  if (done && t.phaseId) {
    const rest = Store.all('todos').filter((x) => x.phaseId === t.phaseId);
    if (rest.length >= 2 && rest.every((x) => x.done)) confetti();
  }
}
function confetti() {
  const cols = ['#3b5bdb', '#1f9d63', '#f59f00', '#e8590c', '#d6336c', '#7048e8'];
  const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 34; i++) {
    const a = (Math.PI * 2 * i) / 34 + Math.random() * 0.5, d = 90 + Math.random() * 150;
    box.append(h('i', { style: { background: cols[i % cols.length], '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d - 60 + 'px', '--r': Math.round(Math.random() * 720 - 360) + 'deg', animationDelay: Math.random() * 0.12 + 's' } }));
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 1500);
}

function todoForm(entry, presetPhase = '') {
  const e = entry || { title: '', due: '', assignee: '', phaseId: presetPhase, note: '', done: false, after: [] };
  const title = h('input', { type: 'text', required: true, value: e.title });
  const due = h('input', { type: 'date', value: e.due || '' });
  const names = [...new Set([Store.getUserName(), ...Store.all('todos').map((t) => t.assignee), ...Store.all('diary').map((t) => t.updatedBy)].filter((n) => n && n !== 'Unbekannt'))];
  const assignee = h('input', { type: 'text', list: 'names', placeholder: 'Wer kümmert sich?', value: e.assignee || '' });
  const dl = h('datalist', { id: 'names' }, names.map((n) => h('option', { value: n })));
  const phase = phaseSelect(e.phaseId, '– keine Zuordnung –');
  const note = h('textarea', { rows: 3, value: e.note || '' });
  // mögliche Vorgänger: alle anderen Aufgaben, außer solchen, die selbst von dieser abhängen (Kreise vermeiden)
  const cand = Store.all('todos').filter((x) => x.id !== e.id && !(e.id && dependsOn(x, e))).sort((a, b) => Number(a.done) - Number(b.done) || a.title.localeCompare(b.title));
  const picked = new Set(e.after || []);
  const boxes = cand.map((x) => h('label', { class: 'depopt' + (x.done ? ' done' : '') }, h('input', { type: 'checkbox', checked: picked.has(x.id), onchange: (ev) => (ev.target.checked ? picked.add(x.id) : picked.delete(x.id)) }), h('span', {}, x.title, h('small', { class: 'muted' }, ' · ' + (x.done ? 'erledigt' : phaseName(x.phaseId) || 'offen')))));
  const dep = cand.length ? h('div', { class: 'deplist' }, boxes) : h('div', { class: 'muted small' }, 'Noch keine anderen Aufgaben.');
  const succ = entry ? successors(entry) : [];
  sheet(entry ? 'Aufgabe bearbeiten' : 'Neue Aufgabe', [field('Aufgabe', title), field('Fällig am', due), field('Zuständig', assignee), dl, field('Planungsschritt', phase, 'Erledigte Aufgaben erhöhen den Fortschritt dieses Schritts.'), field('Wartet auf', dep, 'Diese Aufgaben müssen zuerst erledigt sein.'), succ.length ? h('div', { class: 'muted small' }, icon('link', { size: 16 }), ' Blockiert: ' + succ.map((x) => x.title).join(', ')) : null, field('Notiz', note)], {
    onSave: () => saveTodo({ ...e, title: title.value.trim(), due: due.value, assignee: assignee.value.trim(), phaseId: phase.value, note: note.value.trim(), after: [...picked] }, e.phaseId),
    onDelete: entry && (async () => {
      for (const x of succ) await Store.save('todos', { ...x, after: (x.after || []).filter((id) => id !== e.id) });
      await Store.remove('todos', e.id);
      await syncPhase(e.phaseId);
    }),
  });
}

// Eine Aufgabenzeile (Aufgaben- und Planungsansicht)
const todoRow = (t, withPhase = true) => swipeDel(todoRowBody(t, withPhase), () => deleteTodo(t), { label: t.done ? 'Wieder offen' : 'Erledigt', icon: t.done ? 'undo' : 'check', cls: t.done ? '' : 'ok', run: () => toggleTodo(t, !t.done) });
function todoRowBody(t, withPhase = true) {
  const wait = blockedBy(t);
  const nSucc = t.done ? 0 : successors(t).filter((x) => !x.done).length;
  const late = !t.done && t.due && preds(t).some((p) => !p.done && p.due && p.due > t.due);
  return h(
    'div',
    { class: 'todo' + (t.done ? ' done' : '') + (wait.length ? ' blocked' : ''), 'data-id': t.id, style: { '--pc': phaseColor(t.phaseId) }, role: 'button', tabindex: 0, 'aria-pressed': String(!!t.done), onclick: () => toggleTodo(t, !t.done), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTodo(t, !t.done); } } },
    h('span', { class: 'todo-chk' }, t.done ? icon('check', { size: 20 }) : null),
    h(
      'div',
      { class: 'todo-t' },
      h('div', {}, t.title),
      h('div', { class: 'todo-meta' },
        t.due ? (() => { const k = dueKey(t); return k === 'late' ? chip('Überfällig ' + fmtDate(t.due), 'ds-offen') : k === 'today' ? chip('Heute', 'warn') : k === 'week' ? chip(fmtDate(t.due), 'warn') : h('span', { class: 'muted small' }, fmtDate(t.due)); })() : null,
        (withPhase && phaseName(t.phaseId)) ? h('span', { class: 'muted small' }, phaseName(t.phaseId)) : null,
        t.assignee ? h('span', { class: 'muted small' }, 'für ' + t.assignee.split(/\s+/)[0]) : null),
      wait.length || nSucc || late
        ? h(
            'div',
            { class: 'deps' },
            wait.length ? h('span', { class: 'dep wait' }, icon('lock', { size: 14 }), 'Wartet auf ' + wait.map((p) => p.title).join(', ')) : null,
            nSucc ? h('span', { class: 'dep out' }, icon('link', { size: 14 }), `Blockiert ${nSucc}`) : null,
            late ? h('span', { class: 'dep warn' }, icon('warning', { size: 14 }), 'Fällig vor Vorgänger') : null
          )
        : null
    ),
    todoWho(t),
    h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Bearbeiten', onclick: (e) => { e.stopPropagation(); todoForm(t); } }, icon('edit', { size: 20 }))
  );
}

let showDone = false;
// ---------- Ansicht: Einkauf ----------
let shopTab = 'offen';
const SHOP_UNITS = ['x', '×', 'stk', 'stück', 'sack', 'säcke', 'm', 'm²', 'm³', 'kg', 'l', 'pkg', 'pack', 'rolle', 'rollen', 'eimer', 'paar', 'set', 'karton'];
const shopItems = (l) => l.items || [];
const shopTotal = (l) => sum(shopItems(l), (i) => Number(i.price) || 0);
const shopDoneN = (l) => shopItems(l).filter((i) => i.done).length;
// früher selbst eingetragene Märkte (ohne Logo)
const customStores = () => [...new Set(Store.all('shopping').map((l) => l.store).filter((n) => n && !marketByName(n)))].sort((x, y) => x.localeCompare(y, 'de'));
// "3 Sack Zement #Estrichbeton" → Menge "3 Sack", Name "Zement", Detail (Notiz) "Estrichbeton"
function parseShopLine(text) {
  const [main, ...rest] = text.split('#');
  const note = rest.map((x) => x.trim()).filter(Boolean).join(', ');
  const t = main.trim();
  if (!t) return { qty: '', name: text.replace(/#/g, '').trim() || text.trim(), note: '' };
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(\S+)?\s+(.+)$/);
  if (m) {
    if (m[2] && SHOP_UNITS.includes(m[2].toLowerCase())) return { qty: `${m[1]} ${m[2]}`, name: m[3], note };
    if (m[2]) return { qty: m[1], name: `${m[2]} ${m[3]}`, note };
  }
  return { qty: '', name: t, note };
}

async function shopToggle(id, itemId, on) {
  const cur = Store.get('shopping', id);
  if (!cur) return;
  const items = shopItems(cur).map((i) => (i.id === itemId ? { ...i, done: on, doneBy: on ? Store.getUserName() : undefined } : i));
  const all = items.length > 0 && items.every((i) => i.done);
  const next = { ...cur, items };
  if (all && !cur.done) { next.done = true; next.closedAt = today(); toast(`„${cur.title}“ ist komplett – liegt jetzt unter „Erledigt“. Dort kannst du den Beleg ablegen.`, 5000); }
  else if (!all && cur.done) { next.done = false; next.closedAt = undefined; }
  await Store.save('shopping', next);
}

function shopListForm(list) {
  const e = list || { title: '', store: '', phaseId: '', items: [], done: false, created: today() };
  const title = h('input', { type: 'text', placeholder: 'z. B. Samstag – leer lassen = Marktname', value: e.title });
  let store = e.store || '';
  const known = marketByName(store);
  // Märkte: Top 3 als Kacheln, weitere im Dropdown, eigener Markt per Eingabe
  const chips = h('div', { class: 'stchips' }, TOP_MARKETS.map((m) => h('button', { type: 'button', class: 'stchip', 'aria-pressed': 'false', 'data-name': m.name, onclick: () => pick(m.name) },
    logoEl(m.name, 34), h('span', {}, m.short))));
  const more = h('select', { 'aria-label': 'Weitere Märkte', onchange: () => { if (more.value === '__own') { own.hidden = false; own.focus(); pick(own.value.trim()); } else if (more.value) { pick(more.value); } } },
    h('option', { value: '' }, 'Weitere Märkte …'),
    h('optgroup', { label: 'Märkte' }, OTHER_MARKETS.map((m) => h('option', { value: m.name }, m.name))),
    customStores().length ? h('optgroup', { label: 'Eigene' }, customStores().map((n) => h('option', { value: n }, n))) : null,
    h('option', { value: '__own' }, 'Eigener Markt …'));
  const own = h('input', { type: 'text', placeholder: 'Name des Marktes / Händlers', hidden: true, oninput: () => pick(own.value.trim(), true) });
  const chosen = h('div', { class: 'stchosen muted small' });
  function pick(name, fromOwn = false) {
    store = name;
    const top = TOP_MARKETS.find((m) => m.name === store);
    chips.querySelectorAll('.stchip').forEach((c) => { const on = c.dataset.name === store; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); });
    if (!fromOwn && more.value !== '__own') more.value = top ? '' : [...more.options].some((o) => o.value === store) ? store : '';
    if (!fromOwn && !top && store && !OTHER_MARKETS.some((m) => m.name === store) && !customStores().includes(store) && more.value !== '__own') { own.hidden = false; own.value = store; more.value = '__own'; }
    chosen.replaceChildren(...(store && !fromOwn ? [h('span', {}, 'Gewählt: '), logoEl(store, 18), h('strong', {}, ' ' + store)] : []));
  }
  if (store) { const top = TOP_MARKETS.some((m) => m.name === store); if (!top && !known && !customStores().includes(store)) { own.hidden = false; own.value = store; more.value = '__own'; } }
  const phase = usageSelect(e.phaseId);
  pick(store, false);
  let dlg = null;
  const finish = list && !list.done ? h('button', { type: 'button', class: 'btn block', onclick: async () => {
    const cur = Store.get('shopping', e.id) || e;
    const openN = shopItems(cur).filter((i) => !i.done).length;
    if (openN && !(await askConfirm(`${openN} ${openN === 1 ? 'Produkt ist' : 'Produkte sind'} noch nicht abgehakt. Den Zettel trotzdem als erledigt markieren?`, 'Als erledigt markieren'))) return;
    await Store.save('shopping', { ...cur, done: true, closedAt: today() });
    dlg.close();
    toast(`„${cur.title}“ liegt jetzt unter „Erledigt“.`);
  } }, icon('task_alt', { size: 20 }), ' Als erledigt markieren') : null;
  dlg = sheet(list ? 'Einkaufszettel bearbeiten' : 'Neuer Einkaufszettel', [
    field('Wo wird eingekauft?', h('div', { class: 'stpick' }, chips, more, own, chosen)),
    field('Name des Zettels', title),
    field('Gewerk (optional)', phase),
    finish], {
    saveLabel: list ? 'Speichern' : 'Zettel anlegen',
    onSave: () => Store.save('shopping', { ...e, title: title.value.trim() || store || 'Einkaufszettel', store, phaseId: phase.value }),
    onDelete: list && (() => Store.remove('shopping', e.id)),
  });
}

function shopItemForm(listId, item) {
  const l = Store.get('shopping', listId);
  if (!l) return;
  const it = item || { id: Store.uid(), name: '', qty: '', note: '', price: '', phaseId: '', photos: [], done: false };
  const name = h('input', { type: 'text', required: true, value: it.name });
  const qty = h('input', { type: 'text', placeholder: 'z. B. 3 Sack, 12 m', value: it.qty || '' });
  const note = h('textarea', { rows: 3, placeholder: 'Marke, Maße, Artikelnummer, Regal …', value: it.note || '' });
  const price = dec({ step: '0.01', min: '0', inputmode: 'decimal', placeholder: 'optional', value: it.price ?? '' });
  const phase = usageSelect(it.phaseId);
  const pf = photoField(it.photos || []);
  sheet(item ? 'Produkt' : 'Neues Produkt', [field('Produkt', name), field('Menge', qty), field('Preis (EUR)', price), field('Notiz', note), field('Gewerk', phase), pf.el], {
    onSave: async () => {
      const cur = Store.get('shopping', listId) || l;
      const upd = { ...it, name: name.value.trim(), qty: qty.value.trim(), note: note.value.trim(), price: price.value === '' ? '' : Number(price.value), phaseId: phase.value, photos: pf.ids };
      const items = shopItems(cur).some((x) => x.id === it.id) ? shopItems(cur).map((x) => (x.id === it.id ? upd : x)) : [...shopItems(cur), upd];
      await Store.save('shopping', { ...cur, items });
      await pf.commit();
    },
    onCancel: () => pf.cancel(),
    onDelete: item && (async () => {
      const cur = Store.get('shopping', listId) || l;
      await Store.save('shopping', { ...cur, items: shopItems(cur).filter((x) => x.id !== it.id) });
      await pf.commit();
      await Store.discardPhotos(it.photos || []);
    }),
  });
}

// Einkaufswagen (Bilder aus icons/): pro abgehakter Artikel ein Paket auf der Ladefläche; das neueste fällt hinein
let shopFx = null; // {id, idx, t}: welches Paket gerade neu ist
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Stapelplätze auf der Ladefläche: [Mitte x %, Lage]
const CART_SLOTS = [[24, 0], [44, 0], [64, 0], [84, 0], [34, 1], [54, 1], [74, 1], [44, 2], [64, 2], [54, 3]];
function cartHtml(done, fxIdx = -1) {
  let boxes = '';
  for (let k = 0; k < Math.min(done, CART_SLOTS.length); k++) {
    const [x, layer] = CART_SLOTS[k];
    const bottom = 41 - (x - 50) * 0.12 + layer * 14.5;
    boxes += `<img class="cx-box${k === fxIdx ? ' drop' : ''}" src="icons/box.webp" alt="" style="left:${x - 11.5}%;bottom:${bottom}%;--r:${(((k * 37) % 7) - 3) * 1.2}deg">`;
  }
  return `<span class="cartx"><img class="cx-cart" src="icons/cart.webp" alt="" width="116">${boxes}</span>`;
}

function shopCard(l0) {
  const id = l0.id;
  const rows = h('div', { class: 'shi-list' });
  const head = h('div', { class: 'shc-head' });
  const cartBox = h('span', { class: 'shc-cart' });
  let el = null;
  let pending = []; // gerade getippte Produkte, die noch gespeichert werden
  let queue = Promise.resolve();
  const input = h('input', { type: 'text', class: 'shop-add', placeholder: 'Produkt … #Detail', enterkeyhint: 'next', autocomplete: 'off', autocapitalize: 'sentences', 'aria-label': 'Produkt hinzufügen' });
  const itemsNow = () => { const l = Store.get('shopping', id); return l ? [...shopItems(l), ...pending.filter((p) => !shopItems(l).some((x) => x.id === p.id))] : []; };
  const paint = () => {
    const l = Store.get('shopping', id);
    if (!l) return;
    const all = itemsNow();
    const n = all.length, d = all.filter((i) => i.done).length, tot = sum(all, (i) => Number(i.price) || 0);
    head.replaceChildren(
      h('button', { type: 'button', class: 'shc-t', onclick: () => shopListForm(l) },
        h('span', { class: 'shc-ic' + (marketByName(l.store) ? ' logo' : '') }, logoEl(l.store, 34) || icon('shopping_cart', { size: 22, filled: true })),
        h('span', { class: 'shc-n' }, h('strong', {}, l.title), l.store ? h('span', { class: 'muted small' }, l.store) : null)),
      cartBox,
      h('span', { class: 'shc-c muted small' }, `${d}/${n}` + (tot ? ` · ca. ${fmtEUR(tot)}` : '')),
      h('div', { class: 'bar shc-bar' }, h('div', { style: { width: (n ? (d / n) * 100 : 0) + '%' } })));
    const fx = shopFx && shopFx.id === id && Date.now() - shopFx.t < 1500 ? shopFx.idx : -1;
    cartBox.innerHTML = cartHtml(d, fx);
    const items = all.map((i, k) => ({ i, k })).sort((a, b) => Number(a.i.done) - Number(b.i.done) || a.k - b.k).map((x) => x.i);
    rows.replaceChildren(...items.map((i) => h('div', {
      class: 'shi' + (i.done ? ' done' : ''), role: 'button', tabindex: 0, 'aria-pressed': String(!!i.done),
      onclick: () => toggle(i), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(i); } },
    },
      h('span', { class: 'shi-ck' }, i.done ? icon('check', { size: 20 }) : null),
      h('div', { class: 'shi-t' },
        h('div', { class: 'shi-l' }, h('span', { class: 'shi-n' }, i.name), i.qty ? h('span', { class: 'tchip plain' }, i.qty) : null),
        i.note ? h('div', { class: 'shi-note muted small' }, i.note) : null,
        i.photos?.length || (i.price !== '' && i.price != null)
          ? h('div', { class: 'shi-meta muted small' }, i.photos?.length ? icon('image', { size: 15 }) : null, i.price !== '' && i.price != null ? fmtEUR(i.price) : null) : null),
      h('button', { type: 'button', class: 'mv', 'aria-label': i.name + ': Details bearbeiten', onclick: (e) => { e.stopPropagation(); shopItemForm(id, i); } }, icon('edit', { size: 20 })))));
  };
  // Antippen = erledigt / wieder offen
  const toggle = async (i) => {
    if (el.classList.contains('busy')) return;
    const cur = Store.get('shopping', id);
    if (!cur || !shopItems(cur).some((x) => x.id === i.id)) return; // noch nicht gespeichert
    const on = !i.done;
    const doneBefore = shopDoneN(cur);
    const completes = on && shopItems(cur).filter((x) => x.id !== i.id).every((x) => x.done);
    if (on) shopFx = { id, idx: doneBefore, t: Date.now() };
    if (completes && !reducedMotion()) {
      // letzter Artikel: Paket fällt in den Wagen, dann rollt er davon, erst danach wandert der Zettel nach „Erledigt“
      el.classList.add('busy');
      cartBox.innerHTML = cartHtml(doneBefore + 1, doneBefore);
      const cc = head.querySelector('.shc-c'); if (cc) cc.textContent = cc.textContent.replace(/^\d+/, String(doneBefore + 1));
      const bf = head.querySelector('.shc-bar > div'); if (bf) bf.style.width = '100%';
      rows.querySelectorAll('.shi').forEach((r) => { if (r.querySelector('.shi-n')?.textContent === i.name) r.classList.add('done'); });
      await sleep(700);
      el.classList.add('rolling');
      await sleep(1150);
    }
    shopToggle(id, i.id, on);
  };
  // Hinzufügen: sofort sichtbar, Cursor bleibt im Feld (Tastatur bleibt offen), Speichern läuft im Hintergrund
  const add = () => {
    const txt = input.value.trim();
    if (!txt) return;
    input.value = '';
    const it = { id: Store.uid(), ...parseShopLine(txt), price: '', phaseId: '', photos: [], done: false };
    pending.push(it);
    paint();
    queue = queue.then(async () => {
      const cur = Store.get('shopping', id);
      if (cur && !shopItems(cur).some((x) => x.id === it.id)) await Store.save('shopping', { ...cur, items: [...shopItems(cur), it], done: false, closedAt: undefined });
      pending = pending.filter((x) => x !== it);
    }).catch((e) => toast('Speichern fehlgeschlagen: ' + (e.message || e)));
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); input.focus(); } });
  paint();
  el = h('section', { class: 'card shopcard' }, head, rows,
    h('div', { class: 'shi-add' }, icon('add', { size: 20 }), input, h('button', { type: 'button', class: 'mv', 'aria-label': 'Hinzufügen', onmousedown: (e) => e.preventDefault(), onclick: () => { add(); input.focus(); } }, icon('check', { size: 22 }))));
  return el;
}

// Erledigter Zettel: Belege ablegen, Kosten übernehmen
function shopDoneDetail(id) {
  const body = h('div', { class: 'shopd' });
  let amt = '';
  const paint = () => {
    const l = Store.get('shopping', id);
    if (!l) return;
    const tot = shopTotal(l);
    if (amt === '' && tot) amt = String(tot);
    const cost = l.costId ? Store.get('costs', l.costId) : null;
    const rec = (l.receiptIds || []).map((rid) => Store.get('documents', rid)).filter(Boolean);
    const addReceipts = (kind) => pickFiles(kind, async (fs) => {
      const cur = Store.get('shopping', id);
      const ids = [...(cur.receiptIds || [])];
      let k = ids.length;
      for (const f of fs) {
        try {
          k++;
          const { doc } = await quickAddDoc(f, { cat: 'Rechnungen', phaseId: cur.phaseId || '', tags: ['Einkauf', ...(cur.store ? [cur.store] : [])], name: `Beleg ${cur.title}` + (k > 1 ? ` (${k})` : '') });
          if (!ids.includes(doc.id)) ids.push(doc.id);
        } catch (e) { toast('Hochladen fehlgeschlagen: ' + (e.message || e)); }
      }
      await Store.save('shopping', { ...cur, receiptIds: ids });
      const c = cur.costId && Store.get('costs', cur.costId);
      if (c) await Store.save('costs', { ...c, docIds: [...new Set([...(c.docIds || []), ...ids])] });
      paint();
    });
    const amtIn = dec({ step: '0.01', min: '0', inputmode: 'decimal', value: amt, placeholder: 'laut Beleg', oninput: (e) => { amt = e.target.value; } });
    body.replaceChildren(
      h('p', { class: 'muted small' }, [l.store, l.closedAt ? 'abgeschlossen ' + fmtDate(l.closedAt) : ''].filter(Boolean).join(' · ')),
      h('section', { class: 'card' }, h('h3', {}, shopDoneN(l) < shopItems(l).length ? `Artikel (${shopDoneN(l)} von ${shopItems(l).length} gekauft)` : `Artikel (${shopItems(l).length})`),
        shopItems(l).map((i) => h('div', { class: 'shi done static' + (i.done ? '' : ' skipped') }, i.done ? icon('check', { size: 18 }) : h('span', { class: 'muted', title: 'nicht gekauft' }, '–'), h('span', { class: 'shi-n' }, i.name), i.qty ? h('span', { class: 'tchip plain' }, i.qty) : null, i.price !== '' && i.price != null ? h('span', { class: 'muted small' }, fmtEUR(i.price)) : null))),
      h('section', { class: 'card' }, h('h3', {}, 'Beleg'),
        rec.length ? h('div', { class: 'attlist' }, rec.map((d) => h('div', { class: 'att' },
          h('button', { type: 'button', class: 'att-open', onclick: () => openDoc(d) }, docIcon(d.mime), h('span', { class: 'att-n' }, d.name)),
          h('button', { type: 'button', class: 'mv', 'aria-label': 'Verknüpfung entfernen', onclick: async () => { const cur = Store.get('shopping', id); await Store.save('shopping', { ...cur, receiptIds: (cur.receiptIds || []).filter((x) => x !== d.id) }); paint(); } }, '×')))) : h('p', { class: 'muted small' }, 'Noch kein Beleg abgelegt.'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onclick: () => addReceipts('cam') }, icon('photo_camera', { size: 20 }), ' Foto machen'),
          h('button', { type: 'button', class: 'btn', onclick: () => addReceipts('up') }, icon('upload_file', { size: 20 }), ' Hochladen')),
        h('p', { class: 'muted small' }, 'Belege erscheinen auch unter „Dokumente“ (Rechnungen, Tag „Einkauf“).')),
      h('section', { class: 'card' }, h('h3', {}, 'Kosten'),
        cost
          ? [h('p', {}, `Erfasst als „${cost.title}“ · ${fmtEUR(cost.amount)}`), h('button', { type: 'button', class: 'btn block', onclick: () => costForm(cost) }, icon('payments', { size: 20 }), ' Kosten-Eintrag öffnen')]
          : [field('Gesamtbetrag (EUR)', amtIn, tot ? 'Vorbelegt aus den Preisen der Produkte.' : 'Betrag laut Kassenbon.'),
             h('button', { type: 'button', class: 'btn block', onclick: async () => {
               const v = Number(amt);
               if (!(v > 0)) return toast('Bitte den Gesamtbetrag eintragen.');
               const cur = Store.get('shopping', id);
               const c = await Store.save('costs', { id: Store.uid(), date: cur.closedAt || today(), title: `Einkauf ${cur.title}`, amount: v, vendor: cur.store || '', phaseId: cur.phaseId || '', status: 'bezahlt', note: '', photos: [], docIds: cur.receiptIds || [], subsidy: false, subsidyAmount: 0, subsidyPaid: false, shoppingId: cur.id });
               await Store.save('shopping', { ...cur, costId: c.id });
               toast('In Kosten übernommen.');
               paint();
             } }, icon('payments', { size: 20 }), ' In Kosten übernehmen')]),
      h('button', { type: 'button', class: 'btn block', onclick: async () => { const cur = Store.get('shopping', id); await Store.save('shopping', { ...cur, done: false, closedAt: undefined }); dlg.close(); shopTab = 'offen'; render(); } }, 'Zettel wieder öffnen'),
      h('button', { type: 'button', class: 'btn danger block', onclick: async () => { if (await askConfirm('Diesen Einkaufszettel wirklich löschen? Belege in „Dokumente“ bleiben erhalten.', 'Löschen')) { await Store.remove('shopping', id); dlg.close(); } } }, 'Zettel löschen'));
  };
  paint();
  const dlg = sheet(Store.get('shopping', id)?.title || 'Einkaufszettel', [body], { noSave: true });
}

function viewShop() {
  const all = Store.all('shopping');
  const open = all.filter((l) => !l.done).sort((a, b) => (a.created || '').localeCompare(b.created || ''));
  const done = all.filter((l) => l.done).sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
  const tabs = h('div', { class: 'seg' }, [['offen', `Einkaufszettel (${open.length})`], ['erledigt', `Erledigt (${done.length})`]].map(([k, t]) => h('button', { class: 'pill' + (shopTab === k ? ' on' : ''), onclick: () => { shopTab = k; render(); } }, t)));
  const doneCard = (l) => {
    const rec = (l.receiptIds || []).filter((rid) => Store.get('documents', rid)).length;
    const tot = l.costId && Store.get('costs', l.costId) ? Store.get('costs', l.costId).amount : shopTotal(l);
    return h('article', { class: 'card entry', onclick: () => shopDoneDetail(l.id) },
      h('div', { class: 'entry-top' }, h('span', { class: 'muted small' }, fmtDate(l.closedAt || l.created)), rec ? chip(`Beleg (${rec})`, 'done') : chip('Beleg fehlt', 'sub-open')),
      h('div', { class: 'split' }, h('h3', { class: 'dn-t' }, logoEl(l.store, 22), l.title), tot ? h('strong', { class: 'amount' }, (l.costId ? '' : 'ca. ') + fmtEUR(tot)) : null),
      h('div', { class: 'muted small' }, [l.store, shopDoneN(l) < shopItems(l).length ? `${shopDoneN(l)} von ${shopItems(l).length} gekauft` : `${shopItems(l).length} Artikel`, l.costId ? 'in Kosten erfasst' : ''].filter(Boolean).join(' · ')));
  };
  return h('div', { class: 'view' }, tabs,
    shopTab === 'offen'
      ? (open.length ? open.map(shopCard) : empty('Kein Einkaufszettel', 'Lege einen Zettel pro Baumarkt oder Händler an und hake die Produkte unterwegs ab.', 'shopping_cart'))
      : (done.length ? done.map(doneCard) : empty('Noch nichts erledigt', 'Sobald alle Produkte eines Zettels abgehakt sind, landet er hier – mit Platz für den Beleg.', 'task_alt')),
    shopTab === 'offen' ? fab(() => shopListForm()) : null);
}

const todoF = { phase: new Set(), who: new Set(), due: new Set() };
let todoGroup = false;
const todoClosed = new Set();
const DUE_LABELS = { late: 'Überfällig', today: 'Heute', week: 'Diese Woche', later: 'Später', none: 'Ohne Datum' };
function dueKey(t) {
  if (!t.due) return 'none';
  const n = today();
  if (t.due < n) return 'late';
  if (t.due === n) return 'today';
  return t.due <= addDays(n, 7) ? 'week' : 'later';
}
const todoOwner = (t) => t.assignee || authorOf(t) || '';
function todoWho(t) {
  const n = todoOwner(t);
  if (!n) return null;
  return h('span', { class: 'todo-who' + (t.assignee ? '' : ' dim'), title: (t.assignee ? 'Zuständig: ' : 'Erstellt von ') + n }, avatar(n, 24));
}
function viewTodos() {
  const all = Store.all('todos');
  const t0 = today();
  const openAll = all.filter((t) => !t.done);
  const pct = all.length ? Math.round((all.filter((t) => t.done).length / all.length) * 100) : 0;
  const match = (t) => (!todoF.phase.size || todoF.phase.has(t.phaseId || '')) && (!todoF.who.size || [...todoF.who].some((w) => norm(w) === norm(todoOwner(t)))) && (!todoF.due.size || todoF.due.has(dueKey(t)));
  const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999');
  const open = openAll.filter(match).sort(byDue);
  const done = all.filter((t) => t.done && match(t)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const cnt = (k) => openAll.filter((t) => dueKey(t) === k).length;
  const tile = (k, label, cls) => h('button', { type: 'button', class: 'tdt ' + cls + (todoF.due.has(k) ? ' on' : ''), 'aria-pressed': String(todoF.due.has(k)), onclick: () => { const on = todoF.due.has(k); todoF.due.clear(); if (!on) todoF.due.add(k); render(); } }, h('strong', {}, String(cnt(k))), h('span', {}, label));
  const head = h('section', { class: 'card tdh' },
    h('div', { class: 'tdh-g' }, gauge(pct, 'var(--ok, #1f9d63)', 'erledigt'), h('div', { class: 'muted small center' }, `${all.filter((t) => t.done).length} von ${all.length} erledigt`)),
    h('div', { class: 'tdh-t' }, tile('late', 'überfällig', 'bad'), tile('today', 'heute', 'warn'), tile('week', 'diese Woche', '')));
  const phaseItems = [...new Set(all.map((t) => t.phaseId || ''))].map((id) => ({ v: id, t: id ? phaseName(id) : 'Ohne Gewerk', icon: id ? phaseIcon({ id }, { size: 22 }) : icon('task_alt', { size: 22 }) }));
  const names = [...new Map(all.map(todoOwner).filter(Boolean).map((n) => [norm(n), n])).values()].sort((a, b) => a.localeCompare(b, 'de'));
  const me = myName();
  const fbar = filterBar(todoF, [
    { title: 'Gewerk', key: 'phase', items: phaseItems },
    { title: 'Zuständig / erstellt von', key: 'who', items: names.map((n) => ({ v: n, t: n, icon: avatar(n, 22) })) },
    { title: 'Fälligkeit', key: 'due', items: Object.entries(DUE_LABELS).map(([v, t]) => ({ v, t, icon: icon('today', { size: 22 }) })) },
  ],
    me ? h('button', { type: 'button', class: 'pill small fpill' + (todoF.who.size === 1 && norm([...todoF.who][0]) === norm(me) ? ' on' : ''), onclick: () => { const on = todoF.who.size === 1 && norm([...todoF.who][0]) === norm(me); todoF.who.clear(); if (!on) todoF.who.add(me); render(); } }, avatar(me, 18), ' Meine') : null,
    h('button', { type: 'button', class: 'pill small fpill' + (todoGroup ? ' on' : ''), 'aria-pressed': String(todoGroup), onclick: () => { todoGroup = !todoGroup; render(); } }, icon('layers', { size: 18 }), ' Nach Gewerk'));
  const free = open.filter((t) => !blockedBy(t).length), blocked = open.filter((t) => blockedBy(t).length);
  const groups = (list) => {
    if (!todoGroup) {
      return ['late', 'today', 'week', 'later', 'none'].filter((k) => list.some((t) => dueKey(t) === k)).map((k) => {
        const l = list.filter((t) => dueKey(t) === k), closed = todoClosed.has(k);
        return h('div', { class: 'card tsec tsec-' + k + (closed ? ' closed' : '') },
          h('button', { type: 'button', class: 'sub tsec-h', 'aria-expanded': String(!closed), onclick: () => { closed ? todoClosed.delete(k) : todoClosed.add(k); render(); } },
            icon(closed ? 'expand_more' : 'expand_less', { size: 18 }), h('span', {}, DUE_LABELS[k]), h('span', { class: 'muted small' }, String(l.length))),
          closed ? null : l.map((t) => todoRow(t)));
      });
    }
    const m = new Map();
    list.forEach((t) => { const k = t.phaseId || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(t); });
    return [...m.entries()].map(([k, l]) => h('div', { class: 'card' }, h('div', { class: 'sub' }, k ? phaseIcon({ id: k }, { size: 16 }) : null, ' ' + (k ? phaseName(k) : 'Ohne Gewerk')), l.map((t) => todoRow(t, false))));
  };
  const qin = h('input', { type: 'text', class: 'todo-add', placeholder: 'Neue Aufgabe …', enterkeyhint: 'done', autocomplete: 'off', autocapitalize: 'sentences', 'aria-label': 'Neue Aufgabe' });
  const recent = h('div', { class: 'qrecent' });
  const qadd = h('form', { class: 'qadd', onsubmit: async (ev) => {
    ev.preventDefault();
    const title = qin.value.trim();
    if (!title) return;
    qin.value = '';
    const ph = todoF.phase.size === 1 ? [...todoF.phase][0] : '';
    const mine = me && todoF.who.size === 1 && norm([...todoF.who][0]) === norm(me) ? me : '';
    const rec = await Store.save('todos', { title, due: '', assignee: mine, phaseId: ph, note: '', done: false, after: [] });
    recent.append(h('div', { class: 'qrow' }, icon('check', { size: 16 }), h('span', {}, rec.title)));
    qin.focus();
  } }, qin, h('button', { type: 'submit', class: 'icon-btn small', 'aria-label': 'Hinzufügen' }, icon('add', { size: 22 })));
  return h(
    'div',
    { class: 'view' },
    head, qadd, recent, fbar,
    free.length ? groups(free) : (openAll.length ? empty('Nichts gefunden', 'Mit diesen Filtern gibt es keine offenen Aufgaben.', 'task_alt') : empty('Alles erledigt', 'Hier landen Aufgaben für euch beide.', 'task_alt')),
    blocked.length ? h('div', { class: 'card' }, h('div', { class: 'sub' }, icon('lock', { size: 16 }), ' Wartet auf Vorgänger'), blocked.map((t) => todoRow(t))) : null,
    done.length ? h('button', { class: 'btn-text', onclick: () => { showDone = !showDone; render(); } }, icon(showDone ? 'expand_less' : 'expand_more', { size: 20 }), ` Erledigt (${done.length})`) : null,
    showDone && done.length ? h('div', { class: 'card' }, done.map((t) => todoRow(t))) : null,
    fab(() => todoForm())
  );
}

// ---------- Ansicht: Planung ----------
const isDefaultPhase = (id) => DEFAULT_PHASES.some((p) => p.id === id);

// Reihenfolge neu durchnummerieren, damit nie zwei Phasen denselben Wert haben
async function reorderPhases(ids) {
  for (const [k, id] of ids.entries()) {
    const ph = Store.get('phases', id);
    const newOrder = (k + 1) * 10;
    if (ph && ph.order !== newOrder) await Store.save('phases', { ...ph, order: newOrder });
  }
}

// Drag & Drop per Griff (Maus und Touch): die Karte folgt dem Finger, die anderen rücken live nach.
// Die Listener hängen am window (nicht am Griff), weil das Umhängen der Karte im DOM sonst die Zeiger-Erfassung beendet.
let dragging = false;
function dragStart(e, card, container) {
  if (dragging || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault();
  dragging = true;
  const pid = e.pointerId;
  const items = () => [...container.querySelectorAll('.phase[data-id]')];
  const startIds = items().map((x) => x.dataset.id).join();
  let lastY = e.clientY, offset = 0, raf = 0, scrollStep = 0, finished = false;
  try { e.currentTarget.setPointerCapture(pid); } catch { /* optional */ }
  card.classList.add('dragging');
  document.body.classList.add('is-dragging');
  const place = () => {
    // Karte tauscht mit Nachbarn, sobald ihre Mitte deren Mitte passiert
    for (let guard = 0; guard < 30; guard++) {
      const list = items(), i = list.indexOf(card);
      const r = card.getBoundingClientRect(), mid = r.top + r.height / 2;
      const prev = list[i - 1], next = list[i + 1];
      let target = null, ref = null;
      if (prev) { const pr = prev.getBoundingClientRect(); if (mid < pr.top + pr.height / 2) { target = prev; ref = prev; } }
      if (!target && next) { const nr = next.getBoundingClientRect(); if (mid > nr.top + nr.height / 2) { target = next; ref = next.nextSibling; } }
      if (!target) break;
      const before = r.top;
      container.insertBefore(card, ref);
      offset -= card.getBoundingClientRect().top - before;
      card.style.transform = `translateY(${offset}px)`;
    }
    card.style.transform = `translateY(${offset}px)`;
  };
  const loop = () => {
    if (finished) return;
    if (scrollStep) { const y0 = window.scrollY; window.scrollBy(0, scrollStep); offset += window.scrollY - y0; place(); }
    raf = requestAnimationFrame(loop);
  };
  const move = (ev) => {
    if (ev.pointerId !== pid) return;
    ev.preventDefault();
    offset += ev.clientY - lastY; lastY = ev.clientY;
    place();
    const edge = 90;
    scrollStep = ev.clientY < edge ? -10 : ev.clientY > innerHeight - edge ? 10 : 0;
  };
  const end = async (ev) => {
    if (finished || (ev && ev.pointerId != null && ev.pointerId !== pid)) return;
    finished = true;
    cancelAnimationFrame(raf);
    for (const [t, f] of listeners) window.removeEventListener(t, f, true);
    document.body.classList.remove('is-dragging');
    card.classList.remove('dragging'); card.style.transform = '';
    dragging = false;
    const ids = items().map((x) => x.dataset.id);
    if (ids.join() !== startIds) await reorderPhases(ids);
    render();
  };
  const listeners = [['pointermove', move], ['pointerup', end], ['pointercancel', end], ['blur', () => end()], ['contextmenu', (ev) => ev.preventDefault()]];
  for (const [t, f] of listeners) window.addEventListener(t, f, { capture: true, passive: false });
  raf = requestAnimationFrame(loop);
}

function phaseForm(entry) {
  const e = entry || { name: '', state: 'geplant', progress: 0, start: '', end: '', note: '', order: (Math.max(0, ...phases().map((p) => p.order)) || 0) + 10 };
  const name = h('input', { type: 'text', required: true, value: e.name });
  const state = h('select', { value: e.state }, optionList(PHASE_STATES, e.state));
  const range = h('input', { type: 'range', min: 0, max: 100, step: 5, value: e.progress });
  const out = h('strong', {}, e.progress + ' %');
  const start = h('input', { type: 'date', value: e.start || '' });
  const end = h('input', { type: 'date', value: e.end || '' });
  const note = h('textarea', { rows: 3, placeholder: 'Firma, Besonderheiten, Termine …', value: e.note || '' });
  const animAt = h('input', { type: 'number', min: 1, max: 100, step: 1, inputmode: 'numeric', value: e.animAt || 10 });
  range.addEventListener('input', () => {
    const p = Number(range.value);
    out.textContent = p + ' %';
    state.value = p >= 100 ? 'fertig' : p > 0 ? 'laeuft' : 'geplant';
  });
  state.addEventListener('change', () => {
    if (state.value === 'fertig') range.value = 100;
    else if (state.value === 'geplant') range.value = 0;
    else if (Number(range.value) === 0 || Number(range.value) === 100) range.value = 50;
    out.textContent = range.value + ' %';
  });
  sheet(entry ? e.name : 'Eigene Phase', [field('Name', name), field('Status', state), h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Fortschritt ', out), range), field('Geplanter Beginn', start), field('Geplantes Ende', end), field('3D-Animation startet bei (%)', animAt), field('Notiz', note)], {
    onSave: async () => { await Store.save('phases', { ...e, name: name.value.trim(), state: state.value, progress: Number(range.value), start: start.value, end: end.value, animAt: Math.min(100, Math.max(1, Number(animAt.value) || 10)), note: note.value.trim() }); await syncPhase(e.id); },
    onDelete: entry && !isDefaultPhase(e.id) ? () => Store.remove('phases', e.id) : null,
  });
}

const openPhases = new Set();
function phaseTodos(p) {
  const list = todosOf(p.id).sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999'));
  const isOpen = openPhases.has(p.id);
  const done = list.filter((t) => t.done).length;
  return h('div', { class: 'ph-todos' },
    h('button', { class: 'btn-text small', 'aria-expanded': String(isOpen), onclick: () => { isOpen ? openPhases.delete(p.id) : openPhases.add(p.id); render(); } }, icon(isOpen ? 'expand_less' : 'expand_more', { size: 20 }), list.length ? ` Aufgaben ${done}/${list.length}` : ' Aufgaben'),
    isOpen && h('div', { class: 'ph-todo-list' }, list.map((t) => todoRow(t, false)), h('button', { class: 'btn-text small', onclick: () => todoForm(null, p.id) }, icon('add', { size: 18 }), ' Aufgabe hinzufügen'))
  );
}
// Zeitleiste: Phasen mit Start/Ende als Balken auf einer gemeinsamen Zeitachse (ohne Seitwärts-Scrollen)
let planTab = 'liste';
function planTimeline(list) {
  const dated = list.filter((p) => p.start || p.end).map((p) => ({ p, s: p.start || p.end, e: p.end || p.start }));
  const undated = list.filter((p) => !p.start && !p.end);
  if (!dated.length) return [empty('Noch keine Termine', 'Trage bei den Phasen Start und Ende ein, dann erscheint hier die Zeitleiste.', 'calendar_month')];
  const t0 = today();
  const dayN = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
  const dateN = (n) => new Date(n * 864e5);
  const min = Math.min(...dated.map((x) => dayN(x.s)), dayN(t0)), max = Math.max(...dated.map((x) => dayN(x.e)), dayN(t0));
  const lo = min, span = Math.max(30, max - lo + 2);
  const pos = (n) => ((n - lo) / span) * 100;
  // Monatsmarken
  const ticks = [];
  const d0 = dateN(lo);
  ticks.push({ x: 0, t: d0.toLocaleDateString('de-DE', { month: 'short', year: '2-digit', timeZone: 'UTC' }) });
  for (let y = d0.getUTCFullYear(), m = d0.getUTCMonth() + 1; ; m++) {
    const n = Math.round(Date.UTC(y, m, 1) / 864e5);
    if (n > lo + span) break;
    const dt = new Date(Date.UTC(y, m, 1));
    ticks.push({ x: pos(n), t: dt.toLocaleDateString('de-DE', { month: 'short', timeZone: 'UTC' }) + (dt.getUTCMonth() === 0 ? ' ' + String(dt.getUTCFullYear()).slice(2) : '') });
  }
  const thin = ticks.length > 8 ? 2 : 1;
  const todayX = pos(dayN(t0));
  const rows = dated.sort((a, b) => a.s.localeCompare(b.s) || a.e.localeCompare(b.e)).map(({ p, s, e }) => {
    const x = pos(dayN(s)), w = Math.max(1.5, pos(dayN(e) + 1) - x);
    const late = e < t0 && p.state !== 'fertig' && p.progress < 100;
    const col = phaseColor(p.id);
    return h('button', { type: 'button', class: 'tl-row' + (late ? ' late' : '') + (p.state === 'fertig' ? ' done' : ''), onclick: () => phaseForm(p) },
      h('div', { class: 'tl-lab' }, h('span', { class: 'tl-n' }, phaseIcon(p, { size: 16 }), ' ', p.name), h('span', { class: 'muted small' }, `${fmtDate(s)}${e !== s ? ' – ' + fmtDate(e) : ''}${late ? ' · überfällig' : ''}`)),
      h('div', { class: 'tl-track' },
        h('div', { class: 'tl-bar', style: { left: x + '%', width: w + '%', '--pc': col } }, h('i', { style: { width: Math.min(100, p.progress) + '%' } })),
        h('span', { class: 'tl-pct', style: x + w > 82 ? { right: (100 - x) + '%' } : { left: (x + w) + '%' } }, p.progress + ' %')));
  });
  return [h('section', { class: 'card tl' },
    h('div', { class: 'tl-axis' }, ticks.filter((_, i) => i % thin === 0).map((k) => h('span', { style: { left: k.x + '%' } }, k.t))),
    h('div', { class: 'tl-body' }, h('div', { class: 'tl-grid' }, ticks.map((k) => h('i', { style: { left: k.x + '%' } }))), h('div', { class: 'tl-today', style: { left: todayX + '%' } }, h('b', {}, 'Heute')), rows)),
    undated.length ? h('section', { class: 'card' }, h('h3', {}, 'Ohne Termine'), h('div', { class: 'tl-un' }, undated.map((p) => h('button', { type: 'button', class: 'tchip plain', onclick: () => phaseForm(p) }, p.name)))) : null];
}
function viewPlan() {
  const list = phases();
  const pct = progressOf(list);
  return h(
    'div',
    { class: 'view' },
    h('div', { class: 'seg' }, [['liste', 'Liste'], ['zeit', 'Zeitleiste']].map(([k, t]) => h('button', { class: 'pill' + (planTab === k ? ' on' : ''), onclick: () => { planTab = k; render(); } }, t))),
    h('section', { class: 'card' }, h('div', { class: 'split' }, h('h3', {}, 'Gesamtfortschritt'), h('strong', {}, pct + ' %')), bar(pct), h('p', { class: 'muted small' }, 'Die Reihenfolge änderst du, indem du eine Phase am Griff nach oben oder unten ziehst. Erledigte Aufgaben erhöhen den Fortschritt bis 95 %, „Fertig“ (100 %) setzt du selbst.')),
    planTab === 'zeit' ? planTimeline(list) : list.map((p) =>
      h(
        'article',
        { class: 'card phase ps-' + p.state, 'data-id': p.id },
        h('div', { class: 'phase-main', onclick: () => phaseForm(p) },
          h('div', { class: 'split' }, h('h3', { class: 'ph-title' }, phaseIcon(p, { size: 20 }), ' ', p.name), chip(PHASE_STATES.find((s) => s[0] === p.state)?.[1] || p.state, 'phs-' + p.state)),
          bar(p.progress),
          h('div', { class: 'muted small' }, [p.progress + ' %', p.start && 'ab ' + fmtDate(p.start), p.end && 'bis ' + fmtDate(p.end)].filter(Boolean).join(' · '))
        ),
        h('button', { class: 'grip', 'aria-label': `${p.name} verschieben (ziehen)`, onpointerdown: (ev) => dragStart(ev, ev.currentTarget.closest('.phase'), ev.currentTarget.closest('.view')) }, icon('drag_indicator', { size: 24 })),
        phaseTodos(p)
      )
    ),
    h('button', { class: 'btn block', onclick: () => phaseForm() }, '+ Eigene Phase hinzufügen')
  );
}

// ---------- Ansicht: Dokumente ----------
function docIcon(mime = '') {
  return icon(mime.includes('pdf') ? 'picture_as_pdf' : mime.startsWith('image/') ? 'image' : mime.includes('sheet') || mime.includes('excel') ? 'table_chart' : mime.includes('word') ? 'description' : 'attach_file', { size: 28 });
}

// Dokument in der App ansehen (statt roher Browser-Adresse): Titel, Speicherort, Teilen, Herunterladen
// PDF → PNG der ersten Seite (einmalig, wird beim Dokument gespeichert; Original-PDF bleibt unverändert)
async function ensurePreview(d, quiet = false) {
  if (d.virtual || d.preview || !(d.mime || '').includes('pdf')) return d;
  try {
    const blob = await Store.getBlobData(d.path);
    if (!blob) return d;
    if (!quiet) toast('Vorschau wird erstellt …', 2500);
    const { blob: png, pages } = await pdfToPng(blob);
    const path = await Store.putDocPreview(d, png);
    const cur = Store.get('documents', d.id) || d;
    return await Store.save('documents', { ...cur, preview: path, pages: cur.pages || pages });
  } catch (e) { console.warn('PDF-Vorschau nicht möglich:', e); return d; }
}

async function openDoc(d) {
  let url;
  try {
    toast('Dokument wird geladen …', 1500);
    url = await Store.blobURL(d.path);
  } catch (e) { return toast('Öffnen fehlgeschlagen: ' + (e.message || e)); }
  if (!url) return toast('Die Datei liegt noch nicht auf diesem Gerät und ist in OneDrive nicht auffindbar.');
  const fileName = d.fileName || d.name;
  const mime = d.mime || '';
  const st = Store.blobStatus(d.path);
  const where = { ok: ['cloud_done', 'In deinem OneDrive gesichert'], pending: ['cloud_sync', 'Wird nach OneDrive hochgeladen …'], local: ['cloud_off', 'Nur auf diesem Gerät gespeichert (OneDrive nicht verbunden)'] }[st];
  const dlg = h('dialog', { class: 'docview', 'aria-label': d.name });
  const close = () => { dlg.close(); dlg.remove(); };
  const download = () => { const a = h('a', { href: url, download: fileName }); document.body.append(a); a.click(); a.remove(); };
  const share = async () => {
    try {
      const blob = await Store.getBlobData(d.path);
      const f = new File([blob], fileName, { type: mime || blob.type });
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: d.name });
      else download();
    } catch (e) { if (e?.name !== 'AbortError') toast('Teilen nicht möglich – bitte „Herunterladen“ nutzen.'); }
  };
  const pdfInfo = h('div', { class: 'dv-pg muted small' });
  const viewPath = mime.includes('pdf') && d.preview ? d.preview : null; // PNG-Seite 1 statt PDF-Rahmen
  const baseUrl = viewPath ? await Store.blobURL(viewPath).catch(() => null) : null;
  const pdfBox = mime.includes('pdf') && !baseUrl ? h('div', { class: 'dv-page' }) : null;
  const isImg = mime.startsWith('image/') || (!!viewPath && !!baseUrl);
  const mark0 = d.sketches?.[0];
  const imgEl = h('img', { class: 'dv-img', src: baseUrl || url, alt: d.name });
  let marked = !!mark0;
  const showMark = async () => {
    if (!isImg || !mark0) return;
    const u = marked ? await Store.blobURL(Store.sketchPaths(mark0).png).catch(() => null) : (baseUrl || url);
    if (u) imgEl.src = u;
    togBtn?.replaceChildren(icon(marked ? 'visibility' : 'draw', { size: 18 }), marked ? ' Original' : ' Markiert');
  };
  const togBtn = isImg && mark0 ? h('button', { type: 'button', class: 'btn small', onclick: () => { marked = !marked; showMark(); } }) : null;
  const annotate = async () => {
    const n = await openInk({ ref: mark0 || null, docBg: { path: viewPath || d.path, label: d.name } });
    if (!n || (mark0 && n.v === mark0.v)) return;
    const cur = Store.get('documents', d.id) || d;
    await Store.save('documents', { ...cur, sketches: [n] });
    if (mark0) await Store.dropSketches([mark0]);
    close();
    openDoc(Store.get('documents', d.id));
  };
  const body = isImg ? imgEl
    : pdfBox ? pdfBox
    : h('div', { class: 'dv-none' }, docIcon(mime), h('p', {}, 'Für diesen Dateityp gibt es keine Vorschau in der App.'), h('p', { class: 'muted small' }, 'Lade die Datei herunter oder teile sie, um sie in einer anderen App zu öffnen.'));
  dlg.append(
    h('div', { class: 'dv-bar' },
      h('button', { type: 'button', class: 'ink-b', 'aria-label': 'Schließen', onclick: close }, icon('close', { size: 24 })),
      h('div', { class: 'dv-t' }, h('div', { class: 'dv-n' }, d.name), h('div', { class: 'muted small dv-w' }, icon(where[0], { size: 16 }), ' ' + where[1])),
      isImg && !d.virtual ? h('button', { type: 'button', class: 'btn small', onclick: annotate }, icon('draw', { size: 18 }), mark0 ? ' Bearbeiten' : ' Markieren') : null,
      togBtn,
      navigator.canShare ? h('button', { type: 'button', class: 'btn small', onclick: share }, 'Teilen') : null,
      h('button', { type: 'button', class: 'btn small', onclick: download }, 'Herunterladen'),
      mime.includes('pdf') ? h('button', { type: 'button', class: 'btn small', onclick: () => window.open(url, '_blank') }, 'Vollbild') : null),
    h('div', { class: 'dv-body' }, body), ...(pdfBox ? [pdfInfo] : viewPath && d.pages > 1 ? [h('div', { class: 'dv-pg muted small' }, `Seite 1 von ${d.pages} – alle Seiten siehst du mit „Vollbild“.`)] : []));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  if (pdfBox) {
    fitPdfFirstPage(dlg, pdfBox, pdfInfo, url, d);
    // PNG der ersten Seite im Hintergrund erzeugen und die Ansicht dann damit ersetzen
    if (!d.virtual && !d.preview) ensurePreview(d, true).then((nd) => { if (nd.preview && dlg.isConnected && dlg.open) { close(); openDoc(nd); } });
  }
  showMark();
}

// Erste PDF-Seite komplett sichtbar anzeigen: Seitenmaße aus der Datei lesen, Rahmen passend einpassen, Rest abschneiden
async function fitPdfFirstPage(dlg, box, info, url, d) {
  let ratio = 595 / 842, pages = 0;
  try {
    const blob = await Store.getBlobData(d.path);
    const txt = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    const m = txt.match(/\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/);
    if (m) {
      let w = Math.abs(m[3] - m[1]), hh = Math.abs(m[4] - m[2]);
      if (/\/Rotate\s+(90|270)\b/.test(txt)) [w, hh] = [hh, w];
      if (w > 0 && hh > 0) ratio = w / hh;
    }
    const cnt = [...txt.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((x) => +x[1]);
    pages = cnt.length ? Math.max(...cnt) : (txt.match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
  } catch { /* Standardformat A4 */ }
  const frame = h('iframe', { class: 'dv-frame', src: url + '#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0', title: d.name, scrolling: 'no' });
  box.append(frame);
  const size = () => {
    const st = box.parentElement; if (!st || !dlg.open) return;
    const W = st.clientWidth - 24, H = st.clientHeight - 24;
    const w = Math.max(100, Math.min(W, H * ratio));
    box.style.width = w + 'px'; box.style.height = w / ratio + 'px';
  };
  size();
  const ro = new ResizeObserver(size); ro.observe(box.parentElement);
  dlg.addEventListener('close', () => ro.disconnect());
  info.textContent = pages > 1 ? `Seite 1 von ${pages} – alle Seiten siehst du mit „Vollbild“.` : '';
}

// Kategorie normalisieren (früher gab es „Fotos & Sonstiges“)
const docCat = (d) => (d.category === 'Fotos & Sonstiges' || !DOC_CATEGORIES.includes(d.category) ? ((d.mime || '').startsWith('image/') ? 'Fotos' : 'Sonstiges') : d.category);
const parseTags = (s) => [...new Set(String(s || '').split(/[,;#]+/).map((x) => x.trim()).filter(Boolean))];
const docRules = () => Store.get('settings', 'docrules')?.list || DEFAULT_DOC_RULES;
const allDocTags = () => [...new Set(Store.all('documents').flatMap((d) => d.tags || []).concat(docRules().map((r) => r.tag).filter((t) => t && !DOC_CATEGORIES.includes(t))))].sort((a, b) => a.localeCompare(b, 'de'));

// Gemeinsame Felder für Hinzufügen/Bearbeiten: Kategorie, Gewerk, Tags + Vorschlagsbox (Bestätigung durch Tipp auf „Übernehmen“)
function docFields(init) {
  const cat = h('select', {}, DOC_CATEGORIES.map((c) => h('option', { value: c }, c)));
  cat.value = init.category || 'Sonstiges';
  const phase = usageSelect(init.phaseId || '');
  const vendor = vendorInput(init.vendor, 'Firma (optional)');
  const tags = h('input', { type: 'text', list: 'doctags', placeholder: 'z. B. Statik, Bad (mit Komma trennen)', value: (init.tags || []).join(', ') });
  const dl = h('datalist', { id: 'doctags' }, allDocTags().map((t) => h('option', { value: t })));
  const box = h('div', {});
  let dismissed = '';
  const offer = (fileName, mime) => {
    const sg = suggest(fileName, docRules(), DOC_CATEGORIES, mime);
    const key = sg ? JSON.stringify([sg.category, sg.phaseId, sg.tags]) : '';
    const cur = parseTags(tags.value);
    const differs = sg && ((sg.category && sg.category !== cat.value) || (sg.phaseId && sg.phaseId !== phase.value) || sg.tags.some((t) => !cur.includes(t)));
    if (!sg || !differs || dismissed === key) return box.replaceChildren();
    const parts = [sg.category && h('span', { class: 'tchip plain' }, sg.category), sg.phaseId && h('span', { class: 'tchip', style: { '--pc': phaseColor(sg.phaseId) } }, phaseName(sg.phaseId)), ...sg.tags.map((t) => h('span', { class: 'tchip plain' }, '#' + t))].filter(Boolean);
    box.replaceChildren(h('div', { class: 'sugg' },
      h('div', { class: 'sugg-h' }, icon('insights', { size: 18 }), h('strong', {}, ' Vorschlag'), h('span', { class: 'muted small' }, ' · ' + [...new Set(sg.reasons)].join(', '))),
      h('div', { class: 'dc-chips' }, parts),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn small', onclick: () => {
          if (sg.category) cat.value = sg.category;
          if (sg.phaseId) phase.value = sg.phaseId;
          tags.value = [...new Set([...parseTags(tags.value), ...sg.tags])].join(', ');
          box.replaceChildren();
        } }, 'Übernehmen'),
        h('button', { type: 'button', class: 'btn-text small', onclick: () => { dismissed = key; box.replaceChildren(); } }, 'Ignorieren'))));
  };
  return { cat, phase, vendor, tags, offer, els: [box, field('Kategorie', cat), field('Gewerk', phase), field('Firma', vendor), field('Tags', tags, 'Zusätzliche Schlagworte, auch eigene.'), dl] };
}

// Datei-Eingaben liegen dauerhaft im Dokument (nicht in der Ansicht): Beim Öffnen der Kamera kann die Ansicht neu zeichnen,
// ohne dass die Eingabe verloren geht.
const docIn = {};
function docInput(kind) {
  if (!docIn[kind]) {
    const cam = kind === 'cam';
    const el = h('input', { type: 'file', hidden: true, accept: cam ? 'image/*' : null, capture: cam ? 'environment' : null });
    el.addEventListener('change', () => { const fs = [...el.files]; el.value = ''; const t = el._target; el._target = null; if (fs.length && t) t(fs); });
    document.body.append(el);
    docIn[kind] = el;
  }
  return docIn[kind];
}
const pickFiles = (kind, cb) => { const el = docInput(kind); el._target = cb; el.click(); };

// Hochladen / Foto machen: erst Datei bzw. Foto wählen, dann erscheint die Maske. Mehrere Fotos werden ein PDF.
function docAddForm({ files = [], mode = 'upload' } = {}) {
  let file = mode === 'upload' ? files[0] : null;
  const shots = mode === 'photo' ? [...files] : [];
  const urls = new Map();
  const urlOf = (f) => { if (!urls.has(f)) urls.set(f, URL.createObjectURL(f)); return urls.get(f); };
  const defName = mode === 'photo' ? `Foto ${fmtDate(today())}` : (file?.name || '').replace(/\.[^.]+$/, '');
  const name = h('input', { type: 'text', required: true, placeholder: 'Bezeichnung', value: defName });
  const f = docFields({ category: 'Sonstiges' });
  const note = h('textarea', { rows: 3 });
  const preview = h('div', { class: 'photofield' });
  const check = () => f.offer(mode === 'photo' ? name.value.trim() : (file?.name || '') + ' ' + name.value.trim(), mode === 'photo' ? 'image/jpeg' : file?.type || '');
  const paint = () => {
    if (mode === 'photo') {
      preview.replaceChildren(
        h('span', { class: 'lbl' }, `Fotos (${shots.length})`),
        h('div', { class: 'thumbs' }, shots.map((sh, i) => h('div', { class: 'thumb nozoom' }, h('img', { class: 'thumb-img', alt: `Foto ${i + 1}`, src: urlOf(sh) }), h('span', { class: 'pg' }, String(i + 1)), h('button', { type: 'button', class: 'x', 'aria-label': 'Foto entfernen', onclick: () => { shots.splice(i, 1); paint(); } }, '×')))),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => pickFiles('cam', (fs) => { shots.push(...fs); paint(); }) }, icon('photo_camera', { size: 20 }), ' Weiteres Foto')),
        shots.length > 1 ? h('p', { class: 'muted small' }, `Die ${shots.length} Fotos werden als ein PDF mit ${shots.length} Seiten gespeichert.`) : null);
    } else {
      preview.replaceChildren(
        h('span', { class: 'lbl' }, 'Datei'),
        h('div', { class: 'hint' }, `${file.name} · ${fmtSize(file.size)}`),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => pickFiles('up', (fs) => { file = fs[0]; if (!name.value.trim() || name.dataset.auto === '1') { name.value = file.name.replace(/\.[^.]+$/, ''); name.dataset.auto = '1'; } paint(); }) }, icon('folder_open', { size: 20 }), ' Andere Datei')));
    }
    check();
  };
  name.dataset.auto = '1';
  name.addEventListener('input', () => { name.dataset.auto = '0'; });
  name.addEventListener('change', check);
  paint();
  sheet('Dokument hinzufügen', [preview, field('Bezeichnung', name), ...f.els, field('Notiz', note)], {
    onSave: async () => {
      let out = file;
      const nm = name.value.trim() || 'Dokument';
      const safe = nm.replace(/[\\/:*?"<>|#%]/g, '_').slice(0, 60);
      if (mode === 'photo') {
        if (!shots.length) { toast('Bitte mindestens ein Foto aufnehmen.'); return false; }
        if (shots.length === 1) out = new File([shots[0]], safe + '.jpg', { type: shots[0].type || 'image/jpeg' });
        else { toast('PDF wird erstellt …', 2500); out = new File([await imagesToPdf(shots)], safe + '.pdf', { type: 'application/pdf' }); }
      }
      const id = Store.uid();
      const hash = await Store.fileHash(out);
      let info = null;
      const twin = await Store.findDuplicate(hash, out);
      if (twin) {
        if (await askConfirm(`Diese Datei gibt es schon als „${twin.name}“. Statt sie noch einmal hochzuladen mit dem vorhandenen Dokument verlinken?`, 'Verlinken')) info = { path: twin.path, size: twin.size, mime: twin.mime, fileName: twin.fileName, preview: twin.preview, linked: true };
        else if (!(await askConfirm('Die Datei wird dann doppelt gespeichert. Trotzdem?', 'Doppelt speichern'))) return false;
      }
      if (!info) info = await Store.addDocumentFile(out, f.cat.value, id);
      const saved = await Store.save('documents', { id, name: nm, category: f.cat.value, tags: parseTags(f.tags.value), pinned: false, phaseId: f.phase.value, vendor: f.vendor.value.trim(), note: note.value.trim(), date: today(), pages: mode === 'photo' ? shots.length : undefined, hash, ...info });
      await ensureCompany(saved.vendor, saved.phaseId);
      ensurePreview(saved, true); // im Hintergrund: PNG der ersten PDF-Seite
    },
    onCancel: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  });
}

function docEditForm(d) {
  const name = h('input', { type: 'text', required: true, value: d.name });
  const f = docFields({ category: docCat(d), phaseId: d.phaseId, tags: d.tags, vendor: d.vendor });
  const note = h('textarea', { rows: 3, value: d.note || '' });
  const pin = h('input', { type: 'checkbox', role: 'switch', checked: !!d.pinned });
  f.offer(d.fileName || d.name, d.mime);
  const links = costsOfDoc(d);
  sheet('Dokument', [h('p', { class: 'muted small' }, `${fmtSize(d.size || 0)} · ${fmtDate(d.date)}${d.fileName ? ' · ' + d.fileName : ''}`), ...links.map((c) => h('button', { type: 'button', class: 'btn block', onclick: () => costForm(c) }, icon('receipt_long', { size: 20 }), ` Verknüpft mit Kosten: ${c.title}`)), field('Bezeichnung', name), ...f.els, h('label', { class: 'switch-row' }, h('span', {}, 'Oben anpinnen'), pin), field('Notiz', note), h('button', { type: 'button', class: 'btn block', onclick: () => openDoc(d) }, 'Öffnen')], {
    onSave: async () => { await Store.save('documents', { ...d, name: name.value.trim(), category: f.cat.value, tags: parseTags(f.tags.value), pinned: pin.checked, phaseId: f.phase.value, vendor: f.vendor.value.trim(), note: note.value.trim() }); await ensureCompany(f.vendor.value, f.phase.value); },
    onDelete: () => Store.remove('documents', d.id),
  });
}

// Filterleiste der Dokumente: Kategorie, Gewerk, Tag (je mit Mehrfachauswahl) und Angepinnt – die Filter gelten gemeinsam
const docF = { cat: new Set(), phase: new Set(), tag: new Set(), vendor: new Set(), pin: false };
const CAT_ICONS = { 'Verträge': 'edit_note', 'Pläne': 'straighten', 'Rechnungen': 'receipt_long', 'Angebote': 'request_quote', 'Genehmigungen': 'task_alt', 'Fotos': 'photo_camera', 'Sonstiges': 'attach_file' };
const docMatches = (d, f) => (!f.cat.size || f.cat.has(docCat(d))) && (!f.phase.size || f.phase.has(d.phaseId)) && (!f.tag.size || (d.tags || []).some((t) => f.tag.has(t))) && (!f.vendor.size || [...f.vendor].some((v) => norm(v) === norm(d.vendor))) && (!f.pin || d.pinned);

// Filtermaske: Kategorien, Gewerke und Tags in einem Blatt (Mehrfachauswahl, mit Icons). Erst „Anwenden“ übernimmt die Auswahl.
// Filter-Maske (Mehrfachauswahl, Anwenden/Abbrechen). F = Objekt aus Sets, sections = [{title, key, items:[{v,t,icon}]}]
function filterSheet(F, sections) {
  const tmp = Object.fromEntries(sections.map((x) => [x.key, new Set(F[x.key])]));
  const section = (x) => h('section', { class: 'fsec' },
    h('h3', {}, x.title, h('span', { class: 'muted small' }, ' ' + (x.items.length ? '' : '– nichts vorhanden'))),
    h('div', { class: 'mlist' }, x.items.map((o) => h('label', { class: 'mrow' },
      h('input', { type: 'checkbox', checked: tmp[x.key].has(o.v), onchange: (e) => { e.target.checked ? tmp[x.key].add(o.v) : tmp[x.key].delete(o.v); } }),
      o.icon, h('span', { class: 'mt' }, o.t)))));
  sheet('Filter', [
    ...sections.map(section),
    h('button', { type: 'button', class: 'btn block', onclick: (e) => { Object.values(tmp).forEach((v) => v.clear()); e.currentTarget.closest('form').querySelectorAll('input[type=checkbox]').forEach((c) => (c.checked = false)); } }, 'Alle Filter aufheben'),
  ], {
    saveLabel: 'Anwenden',
    onSave: () => { sections.forEach((x) => { F[x.key] = tmp[x.key]; }); render(); },
  });
}
// Einheitliche Filterleiste: Button „Filter“ mit Zähler, optional „Zurücksetzen“ und weitere Elemente
function filterBar(F, sections, ...extra) {
  const n = sections.reduce((a, x) => a + F[x.key].size, 0);
  return h('div', { class: 'pills dfilters' },
    h('button', { type: 'button', class: 'pill small fpill' + (n ? ' on' : ''), onclick: () => filterSheet(F, sections) }, icon('tune', { size: 18 }), ' Filter', n ? h('span', { class: 'fcount' }, String(n)) : null),
    ...extra,
    n ? h('button', { type: 'button', class: 'btn-text small', onclick: () => { sections.forEach((x) => F[x.key].clear()); render(); } }, 'Zurücksetzen') : null);
}
function docFilterSheet(opts) {
  filterSheet(docF, [{ title: 'Kategorie', key: 'cat', items: opts.cats }, { title: 'Gewerk', key: 'phase', items: opts.phases }, { title: 'Firma', key: 'vendor', items: opts.vendors }, { title: 'Tags', key: 'tag', items: opts.tags }]);
}

// Rechnungs-Fotos aus „Kosten“ erscheinen verlinkt (ohne Kopie) in den Dokumenten
function costDocs() {
  const out = [];
  for (const c of Store.all('costs')) {
    const ph = c.photos || [];
    ph.forEach((id, i) => out.push({ id: `cost:${c.id}:${id}`, virtual: true, costId: c.id, name: c.title + (ph.length > 1 ? ` (${i + 1}/${ph.length})` : ''), category: costDocCat(c.status), tags: c.vendor ? [c.vendor] : [], vendor: c.vendor, phaseId: c.phaseId, date: c.date, mime: 'image/jpeg', path: Store.photoPaths(id).full, fileName: `${c.title}.jpg` }));
  }
  return out;
}

function viewDocs() {
  const all = [...Store.all('documents'), ...costDocs()].sort(byDateDesc);
  const list = all.filter((d) => docMatches(d, docF));
  const pinned = list.filter((d) => d.pinned), rest = list.filter((d) => !d.pinned);
  const set = (patch) => { Object.assign(docF, patch); render(); };
  const count = docF.cat.size + docF.phase.size + docF.tag.size + docF.vendor.size;
  const active = count || docF.pin;
  const phaseIds = [...new Set(all.map((d) => d.phaseId).filter(Boolean))];
  const tagIds = [...new Set(all.flatMap((d) => d.tags || []))].sort((a, b) => a.localeCompare(b, 'de'));
  const vendorNames = [...new Map(all.filter((d) => d.vendor).map((d) => [norm(d.vendor), d.vendor])).values()].sort((a, b) => a.localeCompare(b, 'de'));
  const row = (d) => (d.virtual ? rowBody(d) : swipeDel(rowBody(d), () => Store.remove('documents', d.id), { label: d.pinned ? 'Lösen' : 'Anheften', icon: 'push_pin', cls: '', run: () => Store.save('documents', { ...d, pinned: !d.pinned }) }));
  const rowBody = (d) => {
    const chips = [h('span', { class: 'tchip plain' }, docCat(d)),
      d.phaseId && h('span', { class: 'tchip', style: { '--pc': phaseColor(d.phaseId) } }, phaseName(d.phaseId)),
      d.vendor && !(d.tags || []).some((t) => norm(t) === norm(d.vendor)) ? h('span', { class: 'tchip plain' }, d.vendor) : null,
      ...(d.tags || []).map((t) => h('span', { class: 'tchip plain' }, '#' + t)),
      d.virtual && h('span', { class: 'tchip plain' }, 'aus Kosten'),
      !d.virtual && costsOfDoc(d).length ? h('span', { class: 'tchip plain' }, 'Kosten') : null,
      d.sketches?.length && h('span', { class: 'tchip plain' }, 'markiert')].filter(Boolean);
    const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
    return h('div', { class: 'doc' + (d.pinned ? ' pinned' : ''), role: 'button', tabindex: 0, onclick: () => openDoc(d), onkeydown: (e) => { if (e.key === 'Enter') openDoc(d); } },
      h('div', { class: 'doc-i' }, docIcon(d.mime)),
      h('div', { class: 'doc-t' }, h('div', {}, d.name), h('div', { class: 'dc-chips' }, chips), h('div', { class: 'muted small' }, [fmtDate(d.date), fmtSize(d.size || 0)].filter(Boolean).join(' · '))),
      d.virtual ? null : h('button', { class: 'mv pinbtn' + (d.pinned ? ' on' : ''), 'aria-label': d.pinned ? 'Nicht mehr anpinnen' : 'Anpinnen', 'aria-pressed': String(!!d.pinned), onclick: stop(() => Store.save('documents', { ...d, pinned: !d.pinned })) }, icon('push_pin', { size: 22, filled: !!d.pinned })),
      h('button', { class: 'mv', 'aria-label': d.virtual ? 'Kosten-Eintrag öffnen' : 'Bearbeiten', onclick: stop(() => (d.virtual ? costForm(Store.get('costs', d.costId)) : docEditForm(d))) }, icon(d.virtual ? 'receipt_long' : 'edit', { size: 22 })));
  };
  return h(
    'div',
    { class: 'view' },
    h('div', { class: 'pills dfilters' },
      h('button', { type: 'button', class: 'pill small fpill' + (count ? ' on' : ''), onclick: () => docFilterSheet({
        cats: DOC_CATEGORIES.map((c) => ({ v: c, t: c, icon: icon(CAT_ICONS[c] || 'folder', { size: 22 }) })),
        phases: phaseIds.map((id) => ({ v: id, t: phaseName(id), icon: phaseIcon({ id }, { size: 22 }) })),
        vendors: vendorNames.map((v) => ({ v, t: v, icon: icon('contacts', { size: 22 }) })),
        tags: tagIds.map((t) => ({ v: t, t: '#' + t, icon: icon('sell', { size: 22 }) })),
      }) }, icon('tune', { size: 18 }), ' Filter', count ? h('span', { class: 'fcount' }, String(count)) : null),
      h('button', { class: 'pill small' + (docF.pin ? ' on' : ''), 'aria-pressed': String(docF.pin), onclick: () => set({ pin: !docF.pin }) }, icon('push_pin', { size: 16, filled: true }), ' Angepinnt'),
      active ? h('button', { class: 'btn-text small', onclick: () => { docF.cat.clear(); docF.phase.clear(); docF.tag.clear(); docF.vendor.clear(); docF.pin = false; render(); } }, 'Zurücksetzen') : null),
    list.length
      ? [pinned.length && rest.length ? h('div', { class: 'sub' }, icon('push_pin', { size: 16, filled: true }), ' Angepinnt') : null,
         pinned.length ? h('div', { class: 'card' }, pinned.map(row)) : null,
         pinned.length && rest.length ? h('div', { class: 'sub' }, 'Weitere') : null,
         rest.length ? h('div', { class: 'card' }, rest.map(row)) : null]
      : empty('Keine Dokumente', active ? 'Mit diesen Filtern gibt es nichts. Tippe oben auf „Zurücksetzen“.' : 'Verträge, Pläne, Rechnungen und Genehmigungen – alles liegt in eurem OneDrive-Ordner.', 'folder_open'),
    (() => {
      const menu = h('div', { class: 'fab-menu', hidden: true },
        h('button', { class: 'fab-x alt', onclick: () => { menu.hidden = true; pickFiles('up', (fs) => docAddForm({ files: fs, mode: 'upload' })); } }, icon('upload_file', { size: 22 }), ' Hochladen'),
        h('button', { class: 'fab-x', onclick: () => { menu.hidden = true; pickFiles('cam', (fs) => docAddForm({ files: fs, mode: 'photo' })); } }, icon('photo_camera', { size: 22 }), ' Foto machen'));
      return h('div', {}, menu, fab(() => { menu.hidden = !menu.hidden; }));
    })()
  );
}

// Referenztabelle bearbeiten (Einstellungen)
function ruleForm(rule) {
  const kind = h('select', {}, h('option', { value: 'name' }, 'Dateiname enthält'), h('option', { value: 'ext' }, 'Dateiendung ist'));
  kind.value = rule?.kind || 'name';
  const words = h('input', { type: 'text', required: true, placeholder: 'z. B. rechnung, abschlag', value: rule?.words || '' });
  const tag = h('input', { type: 'text', list: 'ruletags', placeholder: 'Kategorie oder Tag', value: rule?.tag || '' });
  const dl = h('datalist', { id: 'ruletags' }, [...DOC_CATEGORIES, ...allDocTags()].map((t) => h('option', { value: t })));
  const phase = usageSelect(rule?.phaseId || '', '– kein Gewerk –');
  const save = async (list) => Store.save('settings', { id: 'docrules', list });
  sheet(rule ? 'Regel bearbeiten' : 'Neue Regel', [field('Wenn …', kind), field('Wörter / Endungen', words, 'Mehrere mit Komma trennen. Umlaute sind egal (küche = kueche). Bei Namen zählen Wörter ab 3 Buchstaben.'), field('… dann Kategorie oder Tag', tag, `Feste Kategorien: ${DOC_CATEGORIES.join(', ')}. Alles andere wird ein zusätzlicher Tag.`), dl, field('… und Gewerk', phase)], {
    onSave: async () => {
      if (!words.value.trim()) return false;
      if (!tag.value.trim() && !phase.value) { toast('Bitte ein Tag oder ein Gewerk angeben.'); return false; }
      const r = { id: rule?.id || 'r' + Date.now().toString(36), kind: kind.value, words: words.value.trim(), tag: tag.value.trim(), phaseId: phase.value };
      const cur = docRules();
      await save(rule ? cur.map((x) => (x.id === r.id ? r : x)) : [...cur, r]);
    },
    onDelete: rule && (async () => save(docRules().filter((x) => x.id !== rule.id))),
  });
}
let rulesOpen = false;
function docRulesCard() {
  const list = docRules();
  const custom = !!Store.get('settings', 'docrules');
  return card('Dokumente: Zuordnungs-Vorschläge',
    h('p', { class: 'muted small' }, 'Beim Hinzufügen schlägt die App anhand von Dateiendung und Dateiname Kategorie, Gewerk und Tags vor. Du bestätigst oder änderst den Vorschlag selbst. Die Regeln der Reihe nach: Die erste passende Kategorie und das erste passende Gewerk gelten.'),
    h('details', { class: 'rules', open: rulesOpen, ontoggle: (e) => { rulesOpen = e.currentTarget.open; } }, h('summary', {}, `Regeln anzeigen (${list.length})`),
      h('div', { class: 'rule-list' }, list.map((r) => h('div', { class: 'line rule', onclick: () => ruleForm(r) },
        h('span', { class: 'rk' }, r.kind === 'ext' ? 'Endung' : 'Name'),
        h('span', { class: 'rw' }, r.words),
        h('span', { class: 'ra muted small' }, '→ ' + [r.tag, r.phaseId && phaseName(r.phaseId)].filter(Boolean).join(' · '))))),
      h('button', { class: 'btn block', onclick: () => ruleForm(null) }, '+ Regel hinzufügen'),
      custom && h('button', { class: 'btn block', onclick: async () => { if (await askConfirm('Alle eigenen Änderungen an den Regeln verwerfen und die Standardregeln wiederherstellen?', 'Zurücksetzen')) await Store.remove('settings', 'docrules'); } }, 'Auf Standard zurücksetzen')));
}

// Beispieldaten für Kosten (zum Ausprobieren); alle Einträge sind mit demo: true markiert und lassen sich wieder entfernen
const demoCosts = () => Store.all('costs').filter((c) => c.demo);
async function loadDemoCosts() {
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const N = 'Beispieldaten';
  const rows = [
    ['d-elek', 'Angebot Elektro komplett', 'Elektro Müller', 'elektro', 18400, 'angebot', 40],
    ['d-elek-1', 'Abschlag 1 Elektro', 'Elektro Müller', 'elektro', 5000, 'bezahlt', 25, 'd-elek'],
    ['d-elek-2', 'Abschlag 2 Elektro', 'Elektro Müller', 'elektro', 4000, 'offen', 5, 'd-elek', 0, { dueDate: 6, skontoPct: 2, skontoUntil: 3 }],
    ['d-fen-a', 'Fenster Kunststoff', 'Fensterbau Weber', 'fenster', 14900, 'budgetangebot', 30],
    ['d-fen-b', 'Fenster Holz-Alu', 'Fensterbau Weber', 'fenster', 21800, 'budgetangebot', 30],
    ['d-fen-c', 'Fenster Alu', 'Metallbau Krause', 'fenster', 26500, 'budgetangebot', 28],
    ['d-heiz-a', 'Wärmepumpe', 'Haustechnik Schmidt', 'sanitaer', 32000, 'budgetangebot', 20],
    ['d-heiz-b', 'Gas-Brennwert', 'Haustechnik Schmidt', 'sanitaer', 17500, 'budgetangebot', 20],
    ['d-dach-a', 'Dacheindeckung Ziegel', 'Dachdecker Lang', 'dach', 28000, 'budgetangebot', 15],
    ['d-dach-b', 'Dacheindeckung Betonstein', 'Dachdecker Lang', 'dach', 23500, 'budgetangebot', 15],
    ['d-tank', 'Rechnung Öltank entfernen', 'Entsorgung Nord', 'oeltank', 3800, 'bezahlt', 90],
    ['d-kern', 'Rechnung Entkernung', 'Abbruch Becker', 'entkernung', 6200, 'bezahlt', 70],
    ['d-roh', 'Rechnung Rohbau Aufstockung', 'Bau Hoffmann', 'aufstockung', 7500, 'offen', 3, null, 0, { dueDate: -2 }],
    ['d-dach-r', 'Abschlagsrechnung Dachstuhl', 'Dachdecker Lang', 'dach', 9800, 'offen', 1, null, 0, { dueDate: 30 }],
    ['d-solar', 'Anzahlung Solar', 'Solartechnik Berg', 'solar', 2000, 'bezahlt', 10, null, 500],
  ];
  const inDays = (n) => day(-n);
  for (const [id, title, vendor, phaseId, amount, status, ago, offerId, sub, pay] of rows) {
    const pp = pay ? { dueDate: inDays(pay.dueDate), skontoPct: pay.skontoPct || 0, skontoUntil: pay.skontoUntil != null ? inDays(pay.skontoUntil) : '' } : {};
    await Store.save('costs', { ...pp, id, date: day(ago), title, vendor, phaseId, amount, status, offerId: offerId || '', note: N, demo: true, photos: [], docIds: [], subsidy: !!sub, subsidyAmount: sub || 0, subsidyPaid: false });
  }
  const firmen = [['Elektro Müller', 'elektro', 'Frau Müller'], ['Fensterbau Weber', 'fenster', 'Herr Weber'], ['Metallbau Krause', 'fenster', ''], ['Haustechnik Schmidt', 'sanitaer', 'Herr Schmidt'], ['Dachdecker Lang', 'dach', 'Herr Lang'], ['Entsorgung Nord', 'oeltank', ''], ['Abbruch Becker', 'entkernung', ''], ['Bau Hoffmann', 'aufstockung', 'Herr Hoffmann'], ['Solartechnik Berg', 'solar', '']];
  for (const [nm, trade, contact] of firmen) await Store.save('settings', { id: 'd-firma-' + norm(nm).replace(/\W+/g, '-'), kind: 'company', demo: true, name: nm, trade, contact, phone: '01234 567890', email: '', note: 'Beispieldaten' });
  // Beispiel-Darlehen mit Auszahlungsplan für den Zahlungsplan (wird mit den Beispieldaten entfernt)
  const ym = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7); };
  await Store.save('settings', { ...LOAN_DEFAULT, id: 'd-loan', kind: 'loan', demo: true, name: 'Beispiel-Darlehen', amount: 150000, rate: 3.6, repay: 2, start: ym(0), payouts: [{ ym: ym(0), amount: 20000 }, { ym: ym(1), amount: 30000 }, { ym: ym(2), amount: 20000 }] });
}

// ---------- Firmenverzeichnis ----------
// Firmen sind Einstellungs-Datensätze (kind: 'company'). Kosten und Mängel verweisen weiter über den Firmennamen (vendor).
const companies = () => Store.all('settings').filter((x) => x.kind === 'company').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
const companyOf = (name) => { const n = norm(name); return n ? companies().find((c) => norm(c.name) === n) || null : null; };
const isActiveDefect = (d) => d.status === 'offen' || d.status === 'klaerung';
function companyStats(co) {
  const n = norm(co.name);
  const costs = Store.all('costs').filter((c) => norm(c.vendor) === n);
  const defects = Store.all('defects').filter((d) => norm(d.vendor) === n);
  const offers = costs.filter((c) => c.status === 'angebot'), budget = costs.filter((c) => c.status === 'budgetangebot'), inv = costs.filter((c) => !isOffer(c));
  return {
    costs, defects, offers, budget, inv,
    paid: sum(inv.filter((c) => c.status === 'bezahlt'), (c) => c.amount),
    open: sum(inv.filter((c) => c.status === 'offen'), (c) => c.amount),
    offerRest: sum(offers, (o) => Math.max(0, o.amount - sum(inv.filter((c) => c.offerId === o.id), (c) => c.amount))),
    openDefects: defects.filter(isActiveDefect).length,
  };
}
// Firmenfeld mit Vorschlagsliste aus dem Verzeichnis
function vendorInput(value, placeholder = 'Firma') {
  let dl = document.getElementById('firmen-dl');
  if (!dl) { dl = h('datalist', { id: 'firmen-dl' }); document.body.append(dl); }
  dl.replaceChildren(...companies().map((c) => h('option', { value: c.name })));
  return h('input', { type: 'text', placeholder, value: value || '', list: 'firmen-dl', autocomplete: 'off' });
}
// Neue Firmennamen aus Kosten/Mängeln wandern automatisch ins Verzeichnis
async function ensureCompany(name, trade = '') {
  const nm = String(name || '').trim();
  if (!nm || companyOf(nm)) return;
  await Store.save('settings', { id: Store.uid(), kind: 'company', name: nm, trade: trade || '', contact: '', phone: '', email: '', note: '' });
}
const strayVendors = () => {
  const seen = new Map();
  [...Store.all('costs'), ...Store.all('defects')].forEach((x) => { const v = String(x.vendor || '').trim(); if (v && !companyOf(v) && !seen.has(norm(v))) seen.set(norm(v), { name: v, trade: x.phaseId || '' }); });
  return [...seen.values()];
};
function companyForm(entry) {
  const e = entry || { name: '', trade: '', contact: '', phone: '', email: '', note: '' };
  const name = h('input', { type: 'text', required: true, placeholder: 'z. B. Elektro Müller', value: e.name });
  const trade = usageSelect(e.trade || '');
  const contact = h('input', { type: 'text', placeholder: 'Ansprechpartner', value: e.contact || '' });
  const phone = h('input', { type: 'tel', inputmode: 'tel', placeholder: 'Telefon', value: e.phone || '' });
  const mail = h('input', { type: 'email', inputmode: 'email', placeholder: 'E-Mail', value: e.email || '', autocapitalize: 'off' });
  const note = h('textarea', { rows: 3, value: e.note || '' });
  sheet(entry ? 'Firma bearbeiten' : 'Neue Firma', [field('Firma', name), field('Gewerk', trade), field('Ansprechpartner', contact), field('Telefon', phone), field('E-Mail', mail), field('Notiz', note)], {
    onSave: async () => {
      const nm = name.value.trim();
      const dup = companyOf(nm);
      if (dup && dup.id !== e.id) { toast('Diese Firma gibt es schon.'); return false; }
      await Store.save('settings', { ...e, id: e.id || Store.uid(), kind: 'company', name: nm, trade: trade.value, contact: contact.value.trim(), phone: phone.value.trim(), email: mail.value.trim(), note: note.value.trim() });
      // Umbenennen: Einträge mit dem alten Namen übernehmen den neuen
      if (entry && norm(entry.name) !== norm(nm)) {
        for (const c of Store.all('costs')) if (norm(c.vendor) === norm(entry.name)) await Store.save('costs', { ...c, vendor: nm });
        for (const d of Store.all('defects')) if (norm(d.vendor) === norm(entry.name)) await Store.save('defects', { ...d, vendor: nm });
        for (const d of Store.all('documents')) if (norm(d.vendor) === norm(entry.name)) await Store.save('documents', { ...d, vendor: nm });
        for (const d of Store.all('diary')) if ((d.companies || []).some((n) => norm(n) === norm(entry.name))) await Store.save('diary', { ...d, companies: d.companies.map((n) => (norm(n) === norm(entry.name) ? nm : n)) });
      }
    },
    onDelete: entry && (async () => { await Store.remove('settings', e.id); }),
  });
}
function companyDetail(co) {
  let dlg;
  const st = companyStats(co);
  const costRow = (c) => h('button', { type: 'button', class: 'ovi', onclick: () => costForm(c) },
    h('span', { class: 'ovit' }, h('span', {}, c.title), h('span', { class: 'muted small' }, [fmtDate(c.date), phaseName(c.phaseId)].filter(Boolean).join(' · ')), c.status === 'offen' && c.dueDate ? h('span', { class: 'muted small' }, 'fällig ' + fmtDate(c.dueDate)) : null),
    h('span', { class: 'cdr' }, h('strong', {}, fmtEUR(c.amount)), chip(COST_STATES.find((x) => x[0] === c.status)?.[1] || c.status, 'cs-' + c.status)));
  const defRow = (d) => h('button', { type: 'button', class: 'ovi', onclick: () => defectForm(d) },
    h('span', { class: 'ovit' }, h('span', {}, d.title), h('span', { class: 'muted small' }, [fmtDate(d.date), d.room].filter(Boolean).join(' · '))),
    chip(DEFECT_STATES.find((x) => x[0] === d.status)?.[1] || d.status, 'ds-' + d.status));
  const myDocs = [...new Map([...Store.all('documents').filter((d) => norm(d.vendor) === norm(co.name)), ...st.costs.flatMap(docsOfCost)].map((d) => [d.id, d])).values()];
  const myDiary = Store.all('diary').filter((d) => compList(d).some((n) => norm(n) === norm(co.name))).sort(byDateDesc);
  const docRow = (d) => h('button', { type: 'button', class: 'ovi', onclick: () => { dlg.close(); docEditForm(d); } },
    h('span', { class: 'ovit' }, h('span', {}, d.name), h('span', { class: 'muted small' }, [docCat(d), fmtDate(d.date)].filter(Boolean).join(' · '))), icon('chevron_right', { size: 20 }));
  const diaRow = (d) => h('button', { type: 'button', class: 'ovi', onclick: () => { dlg.close(); openDiaryDetail(d); } },
    h('span', { class: 'ovit' }, h('span', {}, d.title), h('span', { class: 'muted small' }, [fmtDate(d.date), phaseName(d.phaseId)].filter(Boolean).join(' · '))), icon('chevron_right', { size: 20 }));
  const group = (title, list, row) => list.length ? h('section', { class: 'cdg' }, h('h3', {}, title, h('span', { class: 'muted small' }, ` · ${list.length}`)), h('div', { class: 'ovlist cd' }, list.map(row))) : null;
  const offerBlock = st.offers.length ? h('section', { class: 'cdg' }, h('h3', {}, 'Angebote', h('span', { class: 'muted small' }, ` · ${st.offers.length}`)),
    ...st.offers.map((o) => h('div', { class: 'cdo' }, costRow(o), offerSplit(o).ps.length ? offerBar(o) : null))) : null;
  const body = h('div', { class: 'cd-wrap' },
    h('div', { class: 'cd-head' }, h('h2', {}, co.name), co.trade ? chip(phaseName(co.trade), 'cs-angebot') : null, co.contact ? h('div', { class: 'muted' }, co.contact) : null),
    h('div', { class: 'cd-actions' },
      co.phone ? h('a', { class: 'btn', href: 'tel:' + co.phone.replace(/[^+\d]/g, '') }, icon('call', { size: 20 }), ' Anrufen') : null,
      co.email ? h('a', { class: 'btn', href: 'mailto:' + co.email }, icon('mail', { size: 20 }), ' E-Mail') : null,
      h('button', { type: 'button', class: 'btn', onclick: () => { dlg.close(); companyForm(co); } }, icon('edit', { size: 20 }), ' Bearbeiten')),
    co.phone || co.email ? h('div', { class: 'muted small' }, [co.phone, co.email].filter(Boolean).join(' · ')) : null,
    h('div', { class: 'cd-stats' },
      stat('Bezahlt', fmtEUR(st.paid)), stat('Rechnung offen', fmtEUR(st.open), null, st.open ? 'warn' : ''), stat('Angebote (offen)', fmtEUR(st.offerRest))),
    offerBlock,
    group('Rechnungen', st.inv, costRow),
    group('Budgetangebote', st.budget, costRow),
    group('Mängel', st.defects, defRow),
    group('Dokumente', myDocs, docRow),
    group('Tagebuch', myDiary, diaRow),
    !st.costs.length && !st.defects.length && !myDocs.length && !myDiary.length ? h('p', { class: 'muted small' }, 'Noch keine Angebote, Rechnungen oder Mängel mit dem Namen „' + co.name + '“.') : null,
    co.note ? h('p', { class: 'clamp3' }, co.note) : null);
  dlg = sheet(co.name, body, { noSave: true });
}
function viewCompanies() {
  const list = companies();
  const stray = strayVendors();
  const q = h('input', { type: 'search', placeholder: 'Firma suchen', 'aria-label': 'Firma suchen', autocomplete: 'off' });
  const cards = list.map((co) => {
    const st = companyStats(co);
    const el = h('article', { class: 'card entry coc', onclick: () => companyDetail(co), 'data-q': norm([co.name, co.contact, co.phone, co.email, phaseName(co.trade)].join(' ')) },
      h('div', { class: 'split' }, h('h3', {}, co.name), co.trade ? chip(phaseName(co.trade), 'cs-angebot') : null),
      co.contact ? h('div', { class: 'muted small' }, co.contact) : null,
      st.costs.length || st.defects.length
        ? h('div', { class: 'cosum' },
            st.offerRest ? h('span', {}, 'Angebote ', h('b', {}, fmtEUR(st.offerRest))) : null,
            st.open ? h('span', { class: 'cow' }, 'Offen ', h('b', {}, fmtEUR(st.open))) : null,
            st.paid ? h('span', {}, 'Bezahlt ', h('b', {}, fmtEUR(st.paid))) : null,
            st.openDefects ? h('span', { class: 'cob' }, icon('warning', { size: 15, filled: true }), ` ${st.openDefects} Mängel`) : null)
        : h('div', { class: 'muted small' }, 'Noch keine Einträge'),
      co.phone || co.email
        ? h('div', { class: 'co-btns' },
            co.phone ? h('a', { class: 'pill small', href: 'tel:' + co.phone.replace(/[^+\d]/g, ''), onclick: (ev) => ev.stopPropagation() }, icon('call', { size: 16 }), ' ' + co.phone) : null,
            co.email ? h('a', { class: 'pill small', href: 'mailto:' + co.email, onclick: (ev) => ev.stopPropagation() }, icon('mail', { size: 16 }), ' E-Mail') : null)
        : null);
    return el;
  });
  const none = h('div', { class: 'muted small center', hidden: true }, 'Keine Firma gefunden.');
  q.addEventListener('input', () => { const t = norm(q.value); let n = 0; cards.forEach((c) => { const hit = !t || c.dataset.q.includes(t); c.hidden = !hit; if (hit) n++; }); none.hidden = n > 0; });
  return h('div', { class: 'view' },
    list.length > 4 ? q : null,
    stray.length ? h('button', { type: 'button', class: 'btn block', onclick: async () => { for (const s of stray) await ensureCompany(s.name, s.trade); toast(`${stray.length} Firmen übernommen.`); } }, icon('add', { size: 18 }), ` ${stray.length} Firmen aus Kosten und Mängeln übernehmen`) : null,
    cards.length ? cards : empty('Noch keine Firmen', 'Lege Handwerker und Händler mit Telefon und Gewerk an. Hier siehst du je Firma Angebote, Rechnungen und Mängel.', 'contacts'),
    none,
    fab(() => companyForm()));
}

// ---------- Ansicht: Einstellungen ----------
function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function locBox() {
  const cur = Store.get('settings', 'location');
  const q = h('input', { type: 'search', placeholder: 'Ort oder PLZ, z. B. 80331 München', value: '', enterkeyhint: 'search' });
  const res = h('div', { class: 'res' });
  const go_ = async () => {
    if (!q.value.trim()) return;
    res.replaceChildren(h('p', { class: 'muted small' }, 'Suche …'));
    try {
      const list = await Wx.searchPlaces(q.value.trim());
      res.replaceChildren(...(list.length ? list.map((p) => h('button', { class: 'btn block', onclick: async () => { await Store.save('settings', { id: 'location', name: p.name, lat: p.lat, lon: p.lon }); toast('Ort gespeichert.'); } }, icon('location_on', { size: 18 }), ' ' + p.name)) : [h('p', { class: 'muted small' }, 'Nichts gefunden.')]));
    } catch (e) { res.replaceChildren(h('p', { class: 'muted small' }, e.message || 'Suche fehlgeschlagen.')); }
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go_(); } });
  return [
    cur ? h('p', { class: 'signed' }, icon('location_on', { filled: true, size: 20 }), ' ', h('strong', {}, cur.name)) : h('p', { class: 'muted small' }, 'Noch kein Ort festgelegt. Damit trägt das Tagebuch das Wetter zum Datum automatisch ein.'),
    h('div', { class: 'quickadd' }, q, h('button', { class: 'btn', onclick: go_ }, 'Suchen')),
    res,
  ];
}

const dlBlob = (name, blob) => {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// Ordner im eigenen OneDrive durchsuchen und als Datenordner wählen (z. B. einen vorhandenen mit Bautagebuch-Daten)
function folderPicker() {
  let path = '';
  const list = h('div', { class: 'fp-list' });
  const crumb = h('div', { class: 'muted small fp-crumb' });
  const useBtn = h('button', { type: 'button', class: 'btn primary block' });
  const dlg = sheet('Ordner in OneDrive wählen', [crumb, list, useBtn], { noSave: true });
  async function load() {
    crumb.textContent = 'OneDrive' + (path ? ' / ' + path.split('/').join(' / ') : '');
    useBtn.hidden = !path;
    useBtn.textContent = path ? `„${path.split('/').pop()}“ als Datenordner verwenden` : '';
    list.replaceChildren(h('p', { class: 'muted small' }, 'Lade Ordner …'));
    try {
      const names = await Remote.listFolders(path);
      const rows = names.map((n) => {
        const full = path ? path + '/' + n : n;
        const badge = h('span', { class: 'chip' }, '');
        badge.hidden = true;
        Remote.hasData(full).then((ok) => { if (ok) { badge.textContent = 'enthält Daten'; badge.classList.add('ok'); badge.hidden = false; } }).catch(() => {});
        return h('div', { class: 'line', onclick: () => { path = full; load(); } }, icon('folder', { size: 22 }), h('span', { class: 'grow' }, n), badge, icon('chevron_right', { size: 20 }));
      });
      list.replaceChildren(
        path && h('div', { class: 'line', onclick: () => { path = path.split('/').slice(0, -1).join('/'); load(); } }, icon('chevron_left', { size: 22 }), h('span', {}, 'Eine Ebene höher')),
        ...(rows.length ? rows : [h('p', { class: 'muted small' }, 'Keine Unterordner.')])
      );
    } catch (e) { list.replaceChildren(h('p', { class: 'muted small' }, 'Ordner konnten nicht geladen werden: ' + (e.message || e))); }
  }
  useBtn.onclick = async () => { const p = path; dlg.close(); await switchTarget({ kind: 'own', folder: p }); toast(`Datenordner: „${p}“.`); };
  load();
}

function viewSettings() {
  const st = Store.getState();
  const signed = Auth.isSignedIn();
  const acc = Auth.account();
  const target = Session.getTarget();
  const link = h('input', { type: 'url', placeholder: 'Freigabe-Link aus OneDrive einfügen' });
  const restoreIn = h('input', { type: 'file', accept: '.zip,.json,application/zip,application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      toast('Sicherung wird gelesen …', 2500);
      const { data, blobs } = await readBackup(f);
      const n = Object.values(data).reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0);
      if (!(await askConfirm(`Sicherung enthält ${n} Einträge und ${blobs.size} Dateien. Einträge mit gleicher Kennung werden überschrieben, alles andere bleibt erhalten. Wiederherstellen?`, 'Wiederherstellen'))) return;
      const r = await Store.importAll(data, blobs);
      toast(`Wiederhergestellt: ${r.records} Einträge, ${r.files} Dateien.`, 6000);
      render();
    } catch (err) { toast('Wiederherstellen fehlgeschlagen: ' + (err.message || err), 8000); }
  } });
  const demoCount = ['diary', 'costs', 'defects', 'todos'].reduce((n, t) => n + Store.all(t).filter((x) => x.demo).length, 0);

  const connectBox = !Auth.configured()
    ? h('div', { class: 'note warn' }, h('strong', {}, 'OneDrive ist noch nicht eingerichtet. '), 'Trage nach der Microsoft-Einrichtung die Client-ID in js/config.js ein (siehe SETUP.md). Bis dahin läuft die App nur lokal auf diesem Gerät.')
    : !signed
    ? [h('p', { class: 'muted' }, 'Melde dich mit dem Microsoft-Konto an, auf dessen OneDrive die Daten liegen sollen (oder mit dem Konto, für das der Ordner freigegeben wurde).'), h('button', { class: 'btn primary block', onclick: () => Auth.login().catch((e) => toast(e.message)) }, 'Mit Microsoft anmelden')]
    : [
        h('p', { class: 'signed' }, icon('check_circle', { filled: true, size: 20 }), ' Angemeldet als ', h('strong', {}, acc?.name || acc?.username || 'Microsoft-Konto')),
        !Session.hasTarget() && h('div', { class: 'note' }, h('strong', {}, 'Wo sollen die Daten liegen? '), 'Erste Person: im eigenen OneDrive. Zweite Person: im Ordner, den die erste Person geteilt hat (Link unten einfügen).'),
        !Session.hasTarget() && h('button', { class: 'btn primary block', onclick: () => switchTarget({ kind: 'own' }) }, `Eigenen OneDrive-Ordner „${CONFIG.rootFolder}“ verwenden`),
        Session.hasTarget() && h('div', { class: 'seg' },
          h('button', { class: 'pill' + (target.kind === 'own' ? ' on' : ''), onclick: async () => { if (target.kind !== 'own') await switchTarget({ kind: 'own' }); } }, 'Mein OneDrive'),
          h('button', { class: 'pill' + (target.kind === 'shared' ? ' on' : ''), onclick: () => link.focus() }, 'Geteilter Ordner')),
        Session.hasTarget() && (target.kind === 'own'
          ? h('p', { class: 'muted small' }, `Die Daten liegen im Ordner „${target.folder || CONFIG.rootFolder}“ in deinem OneDrive.`)
          : h('p', { class: 'muted small' }, `Verbunden mit dem geteilten Ordner „${target.name}“.`)),
        h('button', { class: 'btn block', onclick: () => folderPicker() }, icon('folder_open', { size: 20 }), ' Vorhandenen Ordner in meinem OneDrive wählen'),
        field('Mit geteiltem Ordner verbinden', link, 'Für die zweite Person: den Link einfügen, den die erste Person über „Teilen“ in OneDrive erzeugt hat.'),
        h('button', { class: 'btn block', onclick: async () => {
          if (!link.value.trim()) return toast('Bitte zuerst den Freigabe-Link einfügen.');
          try {
            toast('Prüfe Link …', 2000);
            const t = await Remote.resolveShare(link.value);
            await switchTarget(t);
            toast(`Verbunden mit „${t.name}“.`);
          } catch (e) { toast(e.message, 7000); }
        } }, 'Mit geteiltem Ordner verbinden'),
        Session.hasTarget() && h('button', { class: 'btn block', onclick: () => Store.sync().then(() => toast('Synchronisiert.')).catch((e) => toast('Sync fehlgeschlagen: ' + (e.message || e), 6000)) }, 'Jetzt synchronisieren'),
        h('button', { class: 'btn block', onclick: () => { Session.signOut(); render(); } }, 'Abmelden'),
      ];

  return h(
    'div',
    { class: 'view' },
    card('Profil', profileBox(), h('p', { class: 'muted small' }, 'Name und Profilbild erscheinen bei deinen Einträgen. Das Foto wird automatisch quadratisch zugeschnitten und verkleinert.')),
    card('OneDrive', h('div', { class: 'syncline' }, syncBadge(), st.error && h('span', { class: 'muted small' }, st.error)), connectBox),
    card('Standort für das Wetter', locBox()),
    card('Darstellung', h('div', { class: 'seg' }, [['auto', 'Browser', 'settings'], ['light', 'Hell', 'light_mode'], ['dark', 'Dunkel', 'dark_mode']].map(([k, t, ic]) => h('button', { class: 'pill' + (getTheme() === k ? ' on' : ''), onclick: () => { setTheme(k); render(); } }, icon(ic, { size: 18 }), ' ', t))), h('p', { class: 'muted small' }, '„Browser“ folgt der Einstellung deines Geräts.')),
    card('Startbildschirm', h('label', { class: 'switch-row' }, h('span', {}, 'Startbildschirm beim Öffnen zeigen'), h('input', { type: 'checkbox', role: 'switch', checked: splashOn(), onchange: (e) => setSplash(e.target.checked) })), h('p', { class: 'muted small' }, 'Gilt nur für dieses Gerät. Ein Tipp beendet den Startbildschirm sofort.')),
    docRulesCard(),
    card('Eigene Gewerke',
      customTrades().length ? customTrades().map((t) => h('div', { class: 'line', onclick: () => tradeForm(t) }, h('span', {}, t.name), h('span', { class: 'muted small' }, 'bearbeiten'))) : h('p', { class: 'muted small' }, 'Material, Architektur und Planung sowie Werkzeug gibt es schon. Hier kannst du weitere Gewerke oder Verwendungen anlegen.'),
      h('button', { class: 'btn block', onclick: () => tradeForm(null) }, '+ Eigenes Gewerk')
    ),
    card('Daten',
      h('button', { class: 'btn block', onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          const r = await makeBackup((i, n) => { b.textContent = `Sicherung läuft … ${i}/${n}`; });
          dlBlob(`bautagebuch-vollsicherung-${today()}.zip`, r.blob);
          toast(`Vollsicherung erstellt (${r.files} Dateien${r.missing ? `, ${r.missing} nicht verfügbar` : ''}).`, 6000);
        } catch (err) { toast('Sicherung fehlgeschlagen: ' + (err.message || err), 7000); }
        b.disabled = false; b.replaceChildren(icon('download', { size: 20 }), ' Vollsicherung (ZIP)');
      } }, icon('download', { size: 20 }), ' Vollsicherung (ZIP)'),
      h('button', { class: 'btn block', onclick: () => download(`bautagebuch-sicherung-${today()}.json`, JSON.stringify(Store.exportAll(), null, 2)) }, icon('download', { size: 20 }), ' Nur Daten (JSON)'),
      h('button', { class: 'btn block', onclick: () => restoreIn.click() }, icon('restart_alt', { size: 20 }), ' Sicherung wiederherstellen'),
      restoreIn,
      demoCount
        ? h('button', { class: 'btn block', onclick: async () => { await Store.removeDemo(); toast('Beispieldaten entfernt.'); } }, icon('delete', { size: 20 }), ` Beispieldaten entfernen (${demoCount})`)
        : h('button', { class: 'btn block', onclick: async () => { await Store.loadDemo(); await loadDemoCosts(); toast('Beispieldaten geladen.'); } }, icon('table_chart', { size: 20 }), ' Beispieldaten laden'),
      h('p', { class: 'muted small' }, 'Die Vollsicherung enthält alle Einträge samt Fotos, Dokumenten und Handschrift; die JSON-Datei nur die Texte und Zahlen. Beispieldaten sind markiert und lassen sich jederzeit mit einem Tipp entfernen. Sobald OneDrive verbunden ist, werden auch sie hochgeladen – bitte vorher entfernen.')
    ),
    h('p', { class: 'muted small center' }, `Bautagebuch ${CONFIG.version}`)
  );
}

async function switchTarget(t) {
  if (Store.pendingCount() > 0 && JSON.stringify(Session.getTarget()) !== JSON.stringify(t)) {
    if (!(await askConfirm('Auf diesem Gerät gibt es noch nicht synchronisierte Einträge. Beim Wechsel des Ordners gehen sie verloren. Trotzdem wechseln?', 'Wechseln'))) return;
  }
  await Session.setTarget(t);
  render();
}

// ---------- Gemeinsame Bausteine ----------
const empty = (title, text, ic = 'construction') => h('div', { class: 'empty' }, h('div', { class: 'empty-i' }, icon(ic, { size: 40 })), h('strong', {}, title), h('p', { class: 'muted' }, text));
const fab = (fn) => h('button', { class: 'fab', 'aria-label': 'Hinzufügen', onclick: fn }, icon('add', { size: 28 }));

function syncBadge() {
  const s = Store.getState();
  const map = { local: ['dim', 'cloud_off', 'Nur lokal'], online: ['ok', 'cloud_done', 'Synchronisiert'], syncing: ['run', 'cloud_sync', 'Synchronisiere …'], offline: ['warn', 'cloud_off', 'Offline'], auth: ['warn', 'error', 'Anmeldung nötig'], error: ['bad', 'error', 'Sync-Fehler'] };
  const [cls, ic, text] = s.mode === 'online' && !s.last ? ['run', 'cloud_sync', 'Verbunden'] : map[s.mode] || map.local;
  return h('span', { class: 'sync ' + cls }, icon(ic, { size: 16 }), ' ' + text + (s.pending ? ` · ${s.pending} offen` : ''));
}

// ---------- Rahmen und Navigation ----------
const ROUTES = {
  '': ['Übersicht', viewHome],
  tagebuch: ['Tagebuch', viewDiary],
  kosten: ['Kosten', viewCosts],
  maengel: ['Mängel', viewDefects],
  aufgaben: ['Aufgaben', viewTodos],
  einkauf: ['Einkauf', viewShop],
  planung: ['Planung', viewPlan],
  dokumente: ['Dokumente', viewDocs],
  finanzierung: ['Finanzierung', viewFinance],
  suche: ['Suche', viewSearch],
  firmen: ['Firmen', viewCompanies],
  einstellungen: ['Einstellungen', viewSettings],
  haus: ['3D-Haus', () => hausView(phases())],
};
const NAV_ = [['', 'home', 'Übersicht'], ['haus', 'view_in_ar', '3D-Haus'], ['tagebuch', 'menu_book', 'Tagebuch'], ['kosten', 'payments', 'Kosten'], ['finanzierung', 'account_balance', 'Finanzierung'], ['maengel', 'warning', 'Mängel']];
const MORE_ = [['aufgaben', 'task_alt', 'Aufgaben'], ['einkauf', 'shopping_cart', 'Einkauf'], ['planung', 'calendar_month', 'Planung'], ['dokumente', 'folder', 'Dokumente'], ['firmen', 'contacts', 'Firmen'], ['einstellungen', 'settings', 'Einstellungen']];

const ALL = [...NAV_, ...MORE_];
const readHash = () => {
  const r = location.hash.replace(/^#\/?/, '');
  return r in ROUTES ? r : '';
};
let current = null;
const route = () => (current === null ? (current = readHash()) : current);

export function go(r) {
  current = r in ROUTES ? r : '';
  try { history.pushState(null, '', '#/' + current); } catch { /* z. B. eingebettete Vorschau */ }
  window.scrollTo(0, 0);
  render();
}
const navClick = (k, after) => (e) => { e.preventDefault(); after?.(); go(k); };

let root, headerSync, mainEl, menuBtn;

function openMenu() {
  const r = route();
  const dlg = h('dialog', { class: 'drawer', 'aria-label': 'Menü' },
    h('div', { class: 'drawer-head' }, myName() ? h('div', { class: 'dr-me' }, avatar(myName(), 40), h('div', {}, h('strong', {}, myName()), h('div', { class: 'muted small' }, 'Bautagebuch'))) : h('strong', {}, 'Bautagebuch'), h('button', { class: 'icon-btn', 'aria-label': 'Menü schließen', onclick: () => dlg.close() }, icon('close', { size: 24 }))),
    h('nav', { class: 'drawer-list' }, ALL.map(([k, ic, t]) => h('a', { href: '#/' + k, class: 'drawer-item' + (r === k ? ' on' : '') + (k === 'einstellungen' ? ' last' : ''), 'aria-current': r === k ? 'page' : null, onclick: navClick(k, () => dlg.close()) }, icon(ic, { filled: r === k, size: 24 }), h('span', {}, t)))));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

export function render() {
  if (!root) return;
  if (dragging) return; // wird am Ende des Ziehens neu gezeichnet
  if (document.querySelector('dialog[open]')) { renderAfterClose = true; return; }
  const r = route();
  // In den Einstellungen nicht neu zeichnen, während gerade getippt wird (z. B. der Freigabe-Link).
  const ae = document.activeElement;
  if (r === 'aufgaben' && ae?.classList?.contains('todo-add')) { renderAfterClose = true; return; }
  if (r === 'einkauf' && ae?.classList?.contains('shop-add')) { renderAfterClose = true; return; } // Tastatur offen lassen
  if (r === 'einstellungen' && mainEl.contains(ae) && ['INPUT', 'TEXTAREA'].includes(ae.tagName)) { renderAfterClose = true; return; }
  const y = window.scrollY;
  const [title, view] = ROUTES[r];
  document.title = title + ' · Bautagebuch';
  root.querySelector('.title').textContent = title;
  headerSync.replaceChildren(syncBadge());
  mainEl.classList.toggle('wide', r === 'tagebuch');
  mainEl.replaceChildren(view());
  window.scrollTo(0, y);
}

export function mount(el) {
  root = el;
  headerSync = h('button', { class: 'sync-btn', 'aria-label': 'Synchronisierung', onclick: () => go('einstellungen') });
  mainEl = h('main', {});
  menuBtn = h('button', { class: 'icon-btn', 'aria-label': 'Menü öffnen', 'aria-haspopup': 'dialog', onclick: openMenu }, icon('menu', { size: 26 }));
  root.append(h('header', { class: 'topbar' }, menuBtn, h('h1', { class: 'title' }, 'Bautagebuch'), h('button', { class: 'icon-btn', 'aria-label': 'Suche', onclick: () => go('suche') }, icon('search', { size: 24 })), headerSync), mainEl);
  const onNav = () => { const r = readHash(); if (r !== current) { current = r; window.scrollTo(0, 0); render(); } };
  addEventListener('hashchange', onNav);
  addEventListener('popstate', onNav);
  // Zurückgestellte Aktualisierung nachholen, sobald ein Dialog schließt oder das Eingabefeld verlassen wird.
  const flush = () => setTimeout(() => { if (renderAfterClose && !document.querySelector('dialog[open]')) { renderAfterClose = false; render(); } }, 0);
  document.addEventListener('close', flush, true);
  document.addEventListener('focusout', flush);
  let queued = false;
  Store.onChange(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  });
  render();
}
