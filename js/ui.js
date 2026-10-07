// Oberfläche: Hilfsfunktionen, Dialoge und alle Ansichten.
import * as Store from './store.js';
import * as Auth from './auth.js';
import * as Session from './session.js';
import { Remote } from './onedrive.js';
import { CONFIG } from './config.js';
import { hausView } from './haus-view.js';
import { icon, phaseIcon } from './icons.js';
import { getTheme, setTheme } from './theme.js';
import { donut, stackBar, monthBars, cumLine, legend, short, monthLabel } from './charts.js';
import { DEFAULT_PHASES, PHASE_STATES, DOC_CATEGORIES, COST_STATES, DEFECT_STATES, ROOMS, BUILTIN_TRADES, BUDGET_SUGGESTIONS } from './phases.js';

// ---------- Hilfsfunktionen ----------
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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

export function sheet(title, body, { onSave, saveLabel = 'Speichern', onDelete, onCancel, noSave } = {}) {
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
      noSave ? h('span') : h('button', { type: 'submit', class: 'btn-text strong' }, saveLabel)
    ),
    h(
      'div',
      { class: 'sheet-body' },
      body,
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

const photoStrip = (ids = []) => ids.length ? h('div', { class: 'thumbs small' }, ids.map((id) => thumb(id))) : null;

// ---------- Ansicht: Übersicht ----------
function progressOf(list) {
  return list.length ? Math.round(sum(list, (p) => p.progress) / list.length) : 0;
}
const bar = (pct, cls = '') => h('div', { class: 'bar ' + cls }, h('div', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } }));
const chip = (text, cls = '') => h('span', { class: 'chip ' + cls }, text);
const stat = (label, value, sub, cls = '') => h('div', { class: 'stat ' + cls }, h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label), sub && h('div', { class: 'stat-s' }, sub));
const card = (title, ...kids) => h('section', { class: 'card' }, title && h('h3', {}, title), ...kids);

function budgetParts() {
  const b = Store.get('settings', 'budget');
  if (!b) return [];
  if (Array.isArray(b.parts)) return b.parts;
  return Number(b.amount) > 0 ? [{ id: 'p0', name: 'Gesamtbudget', amount: Number(b.amount) }] : [];
}
function budgetInfo() { return sum(budgetParts(), (p) => p.amount); }
// Summen: Ausgaben brutto, Förderungen (ausgezahlt / noch offen), Netto nach ausgezahlter Förderung
function costSums(costs = Store.all('costs')) {
  const real = costs.filter((c) => c.status !== 'angebot');
  const spent = sum(real, (c) => c.amount);
  const subs = real.filter((c) => c.subsidy);
  const subPaid = sum(subs.filter((c) => c.subsidyPaid), (c) => c.subsidyAmount);
  const subOpen = sum(subs.filter((c) => !c.subsidyPaid), (c) => c.subsidyAmount);
  return { spent, subPaid, subOpen, net: spent - subPaid, open: sum(costs.filter((c) => c.status === 'offen'), (c) => c.amount), offers: sum(costs.filter((c) => c.status === 'angebot'), (c) => c.amount) };
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
    h(
      'div',
      { class: 'stats' },
      stat('Ausgaben (netto)', fmtEUR(spent), budget ? `von ${fmtEUR(budget)} Budget` : 'Budget unter „Kosten“ festlegen', budget && spent > budget ? 'bad' : ''),
      stat('Offene Rechnungen', fmtEUR(open)),
      stat('Offene Mängel', String(defects.length), defects.length ? 'siehe Mängel' : 'alles gut', defects.length ? 'warn' : ''),
      stat('Offene Aufgaben', String(todos.length))
    ),
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
function diaryForm(entry) {
  const e = entry || { date: today(), title: '', text: '', phaseId: '', who: '', photos: [] };
  const date = h('input', { type: 'date', required: true, value: e.date });
  const title = h('input', { type: 'text', required: true, placeholder: 'z. B. Container gestellt', value: e.title });
  const text = h('textarea', { rows: 6, placeholder: 'Was ist passiert? Wer war da? Was wurde besprochen?', value: e.text || '' });
  const phase = phaseSelect(e.phaseId);
  const who = h('input', { type: 'text', placeholder: 'Firma / Handwerker', value: e.who || '' });
  const pf = photoField(e.photos);
  sheet(entry ? 'Eintrag bearbeiten' : 'Neuer Eintrag', [field('Datum', date), field('Titel', title), field('Notizen', text), field('Phase', phase), field('Wer war da?', who), pf.el], {
    onSave: async () => {
      await Store.save('diary', { ...e, date: date.value, title: title.value.trim(), text: text.value.trim(), phaseId: phase.value, who: who.value.trim(), photos: pf.ids });
      await pf.commit();
    },
    onCancel: () => pf.cancel(),
    onDelete: entry && (() => Store.remove('diary', e.id)),
  });
}

function viewDiary() {
  const list = Store.all('diary').sort(byDateDesc);
  return h(
    'div',
    { class: 'view' },
    list.length
      ? list.map((d) =>
          h(
            'article',
            { class: 'card entry', onclick: () => diaryForm(d) },
            h('div', { class: 'entry-top' }, h('span', { class: 'muted small' }, fmtDate(d.date)), d.phaseId && chip(phaseName(d.phaseId))),
            h('h3', {}, d.title),
            d.text && h('p', { class: 'clamp' }, d.text),
            photoStrip(d.photos),
            h('div', { class: 'muted small' }, [d.who, d.updatedBy].filter(Boolean).join(' · '))
          )
        )
      : empty('Noch keine Einträge', 'Halte fest, was auf der Baustelle passiert – mit Fotos.'),
    fab(() => diaryForm())
  );
}

// ---------- Ansicht: Kosten ----------
function costForm(entry) {
  const e = entry || { date: today(), title: '', amount: '', vendor: '', phaseId: '', status: 'offen', note: '', photos: [] };
  const date = h('input', { type: 'date', required: true, value: e.date });
  const title = h('input', { type: 'text', required: true, placeholder: 'z. B. Rechnung Elektro, Abschlag 1', value: e.title });
  const amount = h('input', { type: 'number', required: true, step: '0.01', min: '0', inputmode: 'decimal', value: e.amount });
  const vendor = h('input', { type: 'text', placeholder: 'Firma', value: e.vendor || '' });
  const phase = usageSelect(e.phaseId);
  const status = h('select', { value: e.status }, optionList(COST_STATES, e.status));
  const subOn = h('input', { type: 'checkbox', checked: !!e.subsidy });
  const subAmt = h('input', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', placeholder: 'Förderbetrag (EUR)', value: e.subsidyAmount ?? '' });
  const subPaid = h('input', { type: 'checkbox', checked: !!e.subsidyPaid });
  const subBox = h('div', { class: 'subbox' }, field('Förderbetrag (EUR)', subAmt, 'Der Teil dieser Rechnung, der gefördert wird bzw. erstattet wird.'), h('label', { class: 'check' }, subPaid, h('span', {}, 'Förderung bereits ausgezahlt')));
  subBox.hidden = !subOn.checked;
  subOn.addEventListener('change', () => { subBox.hidden = !subOn.checked; });
  const note = h('textarea', { rows: 3, value: e.note || '' });
  const pf = photoField(e.photos);
  sheet(entry ? 'Kosten bearbeiten' : 'Neue Kosten', [field('Datum', date), field('Bezeichnung', title), field('Betrag (EUR, brutto)', amount), field('Firma', vendor), field('Gewerk / Verwendung', phase), field('Status', status), h('label', { class: 'check' }, subOn, h('span', {}, 'Enthält Förderung')), subBox, field('Notiz', note), pf.el], {
    onSave: async () => {
      await Store.save('costs', { ...e, date: date.value, title: title.value.trim(), amount: Number(amount.value), vendor: vendor.value.trim(), phaseId: phase.value, status: status.value, note: note.value.trim(), subsidy: subOn.checked, subsidyAmount: subOn.checked ? Number(subAmt.value) || 0 : 0, subsidyPaid: subOn.checked && subPaid.checked, photos: pf.ids });
      await pf.commit();
    },
    onCancel: () => pf.cancel(),
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
    const amt = h('input', { type: 'number', class: 'pamt', step: '100', min: '0', inputmode: 'decimal', placeholder: 'EUR', value: p.amount ?? '', 'aria-label': 'Betrag', oninput: upd });
    const row = h('div', { class: 'prow', 'data-id': p.id || 'p' + Date.now().toString(36) + Math.floor(Math.random() * 99) }, name, amt, h('button', { type: 'button', class: 'mv', 'aria-label': 'Teil entfernen', onclick: () => { row.remove(); upd(); } }, '×'));
    rows.append(row);
  };
  const parts = budgetParts();
  (parts.length ? parts : [{ name: 'Eigenkapital' }, { name: 'Kredit' }]).forEach(addRow);
  upd();
  sheet('Budget', [
    h('p', { class: 'muted small' }, 'Das Budget kann aus mehreren Teilen bestehen, z. B. Eigenkapital, Kredit oder Eigenleistung. Ausgezahlte Förderungen aus den Rechnungen mindern die Ausgaben.'),
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

let costFilter = { phase: '', status: '' };
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

function costCharts(all, sums, budget) {
  const real = all.filter((c) => c.status !== 'angebot');
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
  const track = h('div', { class: 'swipe', tabindex: 0, 'aria-label': 'Diagramme, seitlich wischen' }, out);
  const dots = h('div', { class: 'dots' }, out.map((_, i) => h('button', { class: 'dot' + (i ? '' : ' on'), 'aria-label': `Diagramm ${i + 1}`, onclick: () => track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' }) })));
  track.addEventListener('scroll', () => { const i = Math.round(track.scrollLeft / track.clientWidth); [...dots.children].forEach((d, j) => d.classList.toggle('on', i === j)); }, { passive: true });
  return h('div', { class: 'view-inner' }, track, out.length > 1 && dots);
}

function viewCosts() {
  const all = Store.all('costs');
  const sums = costSums(all);
  const { spent, subPaid, subOpen, net, open, offers } = sums;
  const budget = budgetInfo();
  const parts = budgetParts();
  let list = all.filter((c) => (!costFilter.phase || c.phaseId === costFilter.phase) && (!costFilter.status || c.status === costFilter.status)).sort(byDateDesc);
  const usages = [...phases(), ...tradeOptions()];

  const fPhase = h('select', { value: costFilter.phase, onchange: (e) => { costFilter.phase = e.target.value; render(); } }, h('option', { value: '' }, 'Alle Gewerke'), usages.map((p) => h('option', { value: p.id }, p.name)));
  const fStatus = h('select', { value: costFilter.status, onchange: (e) => { costFilter.status = e.target.value; render(); } }, h('option', { value: '' }, 'Alle Status'), optionList(COST_STATES, costFilter.status));
  const tabs = h('div', { class: 'seg' }, [['auswertung', 'Auswertung'], ['rechnungen', `Rechnungen (${all.length})`]].map(([k, t]) => h('button', { class: 'pill' + (costTab === k ? ' on' : ''), onclick: () => { costTab = k; render(); } }, t)));

  const summary = [
    h('div', { class: 'stats' },
      stat('Ausgaben (netto)', fmtEUR(net), budget ? `${fmtEUR(budget - net)} vom Budget übrig` : null, budget && net > budget ? 'bad' : ''),
      stat('Davon offen', fmtEUR(open)),
      stat('Ausgaben brutto', fmtEUR(spent)),
      stat('Angebote', fmtEUR(offers)),
      stat('Förderung ausgezahlt', fmtEUR(subPaid)),
      stat('Förderung ausstehend', fmtEUR(subOpen), subOpen ? 'noch nicht ausgezahlt' : null, subOpen ? 'warn' : '')),
    h('section', { class: 'card budget', onclick: budgetForm },
      h('div', { class: 'split' }, h('h3', {}, 'Budget'), h('strong', { class: 'amount' }, budget ? fmtEUR(budget) : '–')),
      parts.length
        ? parts.map((p) => h('div', { class: 'brow' }, h('span', {}, p.name), h('span', { class: 'muted' }, fmtEUR(p.amount)), bar(budget ? (p.amount / budget) * 100 : 0)))
        : h('p', { class: 'muted small' }, 'Antippen, um das Budget festzulegen – auch in mehreren Teilen (Eigenkapital, Kredit …).')),
    costCharts(all, sums, budget),
  ];
  const invoices = [
    h('div', { class: 'filters' }, fPhase, fStatus),
    list.length
      ? list.map((c) =>
          h(
            'article',
            { class: 'card entry', onclick: () => costForm(c) },
            h('div', { class: 'entry-top' }, h('span', { class: 'muted small' }, fmtDate(c.date)), chip(COST_STATES.find((s) => s[0] === c.status)?.[1] || c.status, 'cs-' + c.status)),
            h('div', { class: 'split' }, h('h3', {}, c.title), h('strong', { class: 'amount' }, fmtEUR(c.amount))),
            h('div', { class: 'muted small' }, [c.vendor, phaseName(c.phaseId)].filter(Boolean).join(' · ')),
            c.subsidy && h('div', {}, chip(`Förderung ${fmtEUR(c.subsidyAmount)} · ${c.subsidyPaid ? 'ausgezahlt' : 'offen'}`, c.subsidyPaid ? 'done' : 'sub-open')),
            photoStrip(c.photos)
          )
        )
      : empty('Keine Kosten', 'Trage Rechnungen, Abschläge und Angebote ein und fotografiere die Belege.'),
  ];
  return h('div', { class: 'view' }, tabs, costTab === 'auswertung' ? summary : invoices, fab(() => costForm()));
}

// ---------- Ansicht: Mängel ----------
function defectForm(entry) {
  const e = entry || { date: today(), title: '', description: '', room: '', phaseId: '', vendor: '', status: 'offen', due: '', photos: [] };
  const title = h('input', { type: 'text', required: true, placeholder: 'z. B. Riss im Putz', value: e.title });
  const desc = h('textarea', { rows: 4, placeholder: 'Genauere Beschreibung', value: e.description || '' });
  const room = h('input', { type: 'text', list: 'rooms', placeholder: 'Raum / Ort', value: e.room || '' });
  const dl = h('datalist', { id: 'rooms' }, ROOMS.map((r) => h('option', { value: r })));
  const phase = usageSelect(e.phaseId, '– Gewerk unbekannt –');
  const vendor = h('input', { type: 'text', placeholder: 'Verantwortliche Firma', value: e.vendor || '' });
  const status = h('select', { value: e.status }, optionList(DEFECT_STATES, e.status));
  const due = h('input', { type: 'date', value: e.due || '' });
  const date = h('input', { type: 'date', required: true, value: e.date });
  const pf = photoField(e.photos);
  sheet(entry ? 'Mangel bearbeiten' : 'Neuer Mangel', [field('Festgestellt am', date), field('Titel', title), field('Beschreibung', desc), field('Ort', room), dl, field('Gewerk / Phase', phase), field('Verantwortlich', vendor), field('Status', status), field('Frist zur Behebung', due), pf.el], {
    onSave: async () => {
      await Store.save('defects', { ...e, date: date.value, title: title.value.trim(), description: desc.value.trim(), room: room.value.trim(), phaseId: phase.value, vendor: vendor.value.trim(), status: status.value, due: due.value, photos: pf.ids });
      await pf.commit();
    },
    onCancel: () => pf.cancel(),
    onDelete: entry && (() => Store.remove('defects', e.id)),
  });
}

let defectFilter = 'aktiv';
function viewDefects() {
  const all = Store.all('defects');
  const active = (d) => d.status === 'offen' || d.status === 'klaerung';
  const filters = [['aktiv', `Aktiv (${all.filter(active).length})`], ['alle', 'Alle'], ...DEFECT_STATES.map(([v, t]) => [v, t])];
  const list = all.filter((d) => (defectFilter === 'alle' ? true : defectFilter === 'aktiv' ? active(d) : d.status === defectFilter)).sort(byDateDesc);
  return h(
    'div',
    { class: 'view' },
    h('div', { class: 'pills' }, filters.map(([v, t]) => h('button', { class: 'pill' + (defectFilter === v ? ' on' : ''), onclick: () => { defectFilter = v; render(); } }, t))),
    list.length
      ? list.map((d) =>
          h(
            'article',
            { class: 'card entry', onclick: () => defectForm(d) },
            h('div', { class: 'entry-top' }, h('span', { class: 'muted small' }, fmtDate(d.date)), chip(DEFECT_STATES.find((s) => s[0] === d.status)?.[1] || d.status, 'ds-' + d.status)),
            h('h3', {}, d.title),
            h('div', { class: 'muted small' }, [d.room, d.vendor, d.due && 'Frist ' + fmtDate(d.due)].filter(Boolean).join(' · ')),
            d.description && h('p', { class: 'clamp' }, d.description),
            photoStrip(d.photos)
          )
        )
      : empty('Keine Mängel in dieser Ansicht', 'Halte Mängel mit Foto, Ort und Frist fest, bevor Handwerker abziehen.'),
    fab(() => defectForm())
  );
}

// ---------- Ansicht: Aufgaben ----------
function todoForm(entry) {
  const e = entry || { title: '', due: '', assignee: '', phaseId: '', note: '', done: false };
  const title = h('input', { type: 'text', required: true, value: e.title });
  const due = h('input', { type: 'date', value: e.due || '' });
  const names = [...new Set([Store.getUserName(), ...Store.all('todos').map((t) => t.assignee), ...Store.all('diary').map((t) => t.updatedBy)].filter((n) => n && n !== 'Unbekannt'))];
  const assignee = h('input', { type: 'text', list: 'names', placeholder: 'Wer kümmert sich?', value: e.assignee || '' });
  const dl = h('datalist', { id: 'names' }, names.map((n) => h('option', { value: n })));
  const phase = phaseSelect(e.phaseId);
  const note = h('textarea', { rows: 3, value: e.note || '' });
  sheet(entry ? 'Aufgabe bearbeiten' : 'Neue Aufgabe', [field('Aufgabe', title), field('Fällig am', due), field('Zuständig', assignee), dl, field('Phase', phase), field('Notiz', note)], {
    onSave: () => Store.save('todos', { ...e, title: title.value.trim(), due: due.value, assignee: assignee.value.trim(), phaseId: phase.value, note: note.value.trim() }),
    onDelete: entry && (() => Store.remove('todos', e.id)),
  });
}

let showDone = false;
function viewTodos() {
  const all = Store.all('todos');
  const open = all.filter((t) => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const done = all.filter((t) => t.done).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const row = (t) =>
    h(
      'div',
      { class: 'todo' + (t.done ? ' done' : '') },
      h('input', { type: 'checkbox', checked: t.done, 'aria-label': 'Erledigt', onchange: (e) => Store.save('todos', { ...t, done: e.target.checked }) }),
      h('div', { class: 'todo-t', onclick: () => todoForm(t) }, h('div', {}, t.title), h('div', { class: 'muted small' }, [t.due && (t.due < today() && !t.done ? 'überfällig · ' : '') + fmtDate(t.due), t.assignee, phaseName(t.phaseId)].filter(Boolean).join(' · ')))
    );
  const quick = h('input', { type: 'text', placeholder: 'Neue Aufgabe …', enterkeyhint: 'done' });
  const add = async () => {
    const v = quick.value.trim();
    if (!v) return;
    quick.value = '';
    await Store.save('todos', { title: v, due: '', assignee: '', phaseId: '', note: '', done: false });
  };
  quick.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  return h(
    'div',
    { class: 'view' },
    h('div', { class: 'quickadd' }, quick, h('button', { class: 'btn primary', onclick: add }, 'Hinzufügen')),
    open.length ? h('div', { class: 'card' }, open.map(row)) : empty('Alles erledigt', 'Hier landen Aufgaben für euch beide.'),
    done.length ? h('button', { class: 'btn-text', onclick: () => { showDone = !showDone; render(); } }, icon(showDone ? 'expand_less' : 'expand_more', { size: 20 }), ` Erledigt (${done.length})`) : null,
    showDone && done.length ? h('div', { class: 'card' }, done.map(row)) : null
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
function dragStart(e, card, container) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  const handle = e.currentTarget;
  handle.setPointerCapture(e.pointerId);
  const items = () => [...container.querySelectorAll('.phase[data-id]')];
  const startIds = items().map((x) => x.dataset.id).join();
  let lastY = e.clientY, offset = 0, raf = 0;
  card.classList.add('dragging');
  const place = () => {
    // Karte tauscht mit Nachbarn, sobald ihre Mitte deren Mitte passiert
    let moved = true;
    while (moved) {
      moved = false;
      const list = items(), i = list.indexOf(card), r = card.getBoundingClientRect(), mid = r.top + r.height / 2;
      const prev = list[i - 1], next = list[i + 1];
      if (prev) { const pr = prev.getBoundingClientRect(); if (mid < pr.top + pr.height / 2) { const before = r.top; container.insertBefore(card, prev); offset -= card.getBoundingClientRect().top - before; moved = true; continue; } }
      if (next) { const nr = next.getBoundingClientRect(); if (mid > nr.top + nr.height / 2) { const before = r.top; container.insertBefore(card, next.nextSibling); offset -= card.getBoundingClientRect().top - before; moved = true; } }
    }
    card.style.transform = `translateY(${offset}px)`;
  };
  const move = (ev) => {
    offset += ev.clientY - lastY; lastY = ev.clientY;
    place();
    cancelAnimationFrame(raf);
    const edge = 70, y = ev.clientY, step = y < edge + 60 ? -12 : y > innerHeight - edge ? 12 : 0;
    if (step) { const tick = () => { window.scrollBy(0, step); offset += step; place(); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); }
  };
  const end = async () => {
    cancelAnimationFrame(raf);
    handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end);
    card.classList.remove('dragging'); card.style.transform = '';
    const ids = items().map((x) => x.dataset.id);
    if (ids.join() !== startIds) { await reorderPhases(ids); }
    else render();
  };
  handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
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
    onSave: () => Store.save('phases', { ...e, name: name.value.trim(), state: state.value, progress: Number(range.value), start: start.value, end: end.value, animAt: Math.min(100, Math.max(1, Number(animAt.value) || 10)), note: note.value.trim() }),
    onDelete: entry && !isDefaultPhase(e.id) ? () => Store.remove('phases', e.id) : null,
  });
}

function viewPlan() {
  const list = phases();
  const pct = progressOf(list);
  return h(
    'div',
    { class: 'view' },
    h('section', { class: 'card' }, h('div', { class: 'split' }, h('h3', {}, 'Gesamtfortschritt'), h('strong', {}, pct + ' %')), bar(pct), h('p', { class: 'muted small' }, 'Die Reihenfolge änderst du, indem du eine Phase am Griff nach oben oder unten ziehst. Das Haus zeigt später jede fertige Phase, egal an welcher Stelle sie steht.')),
    list.map((p) =>
      h(
        'article',
        { class: 'card phase ps-' + p.state, 'data-id': p.id },
        h('div', { class: 'phase-main', onclick: () => phaseForm(p) },
          h('div', { class: 'split' }, h('h3', { class: 'ph-title' }, phaseIcon(p, { size: 20 }), ' ', p.name), chip(PHASE_STATES.find((s) => s[0] === p.state)?.[1] || p.state, 'phs-' + p.state)),
          bar(p.progress),
          h('div', { class: 'muted small' }, [p.progress + ' %', p.start && 'ab ' + fmtDate(p.start), p.end && 'bis ' + fmtDate(p.end)].filter(Boolean).join(' · '))
        ),
        h('button', { class: 'grip', 'aria-label': `${p.name} verschieben (ziehen)`, onpointerdown: (ev) => dragStart(ev, ev.currentTarget.closest('.phase'), ev.currentTarget.closest('.view')) }, icon('drag_indicator', { size: 24 }))
      )
    ),
    h('button', { class: 'btn block', onclick: () => phaseForm() }, '+ Eigene Phase hinzufügen')
  );
}

// ---------- Ansicht: Dokumente ----------
let docFilter = '';
function docIcon(mime = '') {
  return icon(mime.includes('pdf') ? 'picture_as_pdf' : mime.startsWith('image/') ? 'image' : mime.includes('sheet') || mime.includes('excel') ? 'table_chart' : mime.includes('word') ? 'description' : 'attach_file', { size: 28 });
}

async function openDoc(d) {
  try {
    toast('Dokument wird geladen …', 1500);
    const url = await Store.blobURL(d.path);
    if (!url) return toast('Die Datei liegt noch nicht auf diesem Gerät und ist in OneDrive nicht auffindbar.');
    const w = window.open(url, '_blank');
    if (!w) {
      const a = h('a', { href: url, download: d.fileName || d.name });
      document.body.append(a);
      a.click();
      a.remove();
    }
  } catch (e) {
    toast('Öffnen fehlgeschlagen: ' + (e.message || e));
  }
}

function docAddForm() {
  let file = null;
  const label = h('div', { class: 'hint' }, 'Noch nichts ausgewählt');
  const name = h('input', { type: 'text', required: true, placeholder: 'Bezeichnung' });
  const cat = h('select', {}, DOC_CATEGORIES.map((c) => h('option', { value: c }, c)));
  const phase = usageSelect('');
  const note = h('textarea', { rows: 3 });
  const pick = (e) => {
    file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    label.textContent = `${file.name} · ${fmtSize(file.size)}`;
    if (!name.value) name.value = file.name.replace(/\.[^.]+$/, '');
    if (/rechnung/i.test(file.name)) cat.value = 'Rechnungen';
    else if (/angebot/i.test(file.name)) cat.value = 'Angebote';
    else if (/vertrag/i.test(file.name)) cat.value = 'Verträge';
    else if (/plan|grundriss/i.test(file.name)) cat.value = 'Pläne';
  };
  const fileIn = h('input', { type: 'file', hidden: true, onchange: pick });
  const camIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: pick });
  sheet('Dokument hinzufügen', [
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => fileIn.click() }, icon('folder_open', { size: 20 }), ' Datei wählen'), h('button', { type: 'button', class: 'btn', onclick: () => camIn.click() }, icon('photo_camera', { size: 20 }), ' Fotografieren')),
    label, fileIn, camIn, field('Bezeichnung', name), field('Kategorie', cat), field('Gewerk / Phase', phase), field('Notiz', note),
  ], {
    onSave: async () => {
      if (!file) { toast('Bitte zuerst eine Datei wählen oder fotografieren.'); return false; }
      const id = Store.uid();
      const info = await Store.addDocumentFile(file, cat.value, id);
      await Store.save('documents', { id, name: name.value.trim(), category: cat.value, phaseId: phase.value, note: note.value.trim(), date: today(), ...info });
    },
  });
}

function docEditForm(d) {
  const name = h('input', { type: 'text', required: true, value: d.name });
  const phase = usageSelect(d.phaseId);
  const note = h('textarea', { rows: 3, value: d.note || '' });
  sheet('Dokument', [h('p', { class: 'muted small' }, `${d.category} · ${fmtSize(d.size || 0)} · ${fmtDate(d.date)}`), field('Bezeichnung', name), field('Gewerk / Phase', phase), field('Notiz', note), h('button', { type: 'button', class: 'btn block', onclick: () => openDoc(d) }, 'Öffnen')], {
    onSave: () => Store.save('documents', { ...d, name: name.value.trim(), phaseId: phase.value, note: note.value.trim() }),
    onDelete: () => Store.remove('documents', d.id),
  });
}

function viewDocs() {
  const all = Store.all('documents').sort(byDateDesc);
  const list = all.filter((d) => !docFilter || d.category === docFilter);
  return h(
    'div',
    { class: 'view' },
    h('div', { class: 'pills' }, [['', 'Alle'], ...DOC_CATEGORIES.map((c) => [c, c])].map(([v, t]) => h('button', { class: 'pill' + (docFilter === v ? ' on' : ''), onclick: () => { docFilter = v; render(); } }, t))),
    list.length
      ? h('div', { class: 'card' }, list.map((d) => h('div', { class: 'doc' }, h('div', { class: 'doc-i', onclick: () => openDoc(d) }, docIcon(d.mime)), h('div', { class: 'doc-t', onclick: () => openDoc(d) }, h('div', {}, d.name), h('div', { class: 'muted small' }, [d.category, phaseName(d.phaseId), fmtDate(d.date)].filter(Boolean).join(' · '))), h('button', { class: 'mv', 'aria-label': 'Details', onclick: () => docEditForm(d) }, '⋯'))))
      : empty('Keine Dokumente', 'Verträge, Pläne, Rechnungen und Genehmigungen – alles liegt in eurem OneDrive-Ordner.'),
    fab(docAddForm)
  );
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

function viewSettings() {
  const st = Store.getState();
  const signed = Auth.isSignedIn();
  const acc = Auth.account();
  const target = Session.getTarget();
  const name = h('input', { type: 'text', value: localStorage.getItem('bt.name') || acc?.name || '', placeholder: 'Dein Name', onchange: (e) => { Store.setUserName(e.target.value.trim()); toast('Name gespeichert.'); } });
  const link = h('input', { type: 'url', placeholder: 'Freigabe-Link aus OneDrive einfügen' });
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
          ? h('p', { class: 'muted small' }, `Die Daten liegen im Ordner „${CONFIG.rootFolder}“ in deinem OneDrive.`)
          : h('p', { class: 'muted small' }, `Verbunden mit dem geteilten Ordner „${target.name}“.`)),
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
    card('Dein Name', name, h('p', { class: 'muted small' }, 'Wird bei deinen Einträgen als Autor gespeichert.')),
    card('OneDrive', h('div', { class: 'syncline' }, syncBadge(), st.error && h('span', { class: 'muted small' }, st.error)), connectBox),
    card('Darstellung', h('div', { class: 'seg' }, [['auto', 'Browser', 'settings'], ['light', 'Hell', 'light_mode'], ['dark', 'Dunkel', 'dark_mode']].map(([k, t, ic]) => h('button', { class: 'pill' + (getTheme() === k ? ' on' : ''), onclick: () => { setTheme(k); render(); } }, icon(ic, { size: 18 }), ' ', t))), h('p', { class: 'muted small' }, '„Browser“ folgt der Einstellung deines Geräts.')),
    card('Eigene Gewerke',
      customTrades().length ? customTrades().map((t) => h('div', { class: 'line', onclick: () => tradeForm(t) }, h('span', {}, t.name), h('span', { class: 'muted small' }, 'bearbeiten'))) : h('p', { class: 'muted small' }, 'Material, Architektur und Planung sowie Werkzeug gibt es schon. Hier kannst du weitere Gewerke oder Verwendungen anlegen.'),
      h('button', { class: 'btn block', onclick: () => tradeForm(null) }, '+ Eigenes Gewerk')
    ),
    card('Daten',
      h('button', { class: 'btn block', onclick: () => download(`bautagebuch-sicherung-${today()}.json`, JSON.stringify(Store.exportAll(), null, 2)) }, 'Sicherung herunterladen (JSON)'),
      demoCount
        ? h('button', { class: 'btn block', onclick: async () => { await Store.removeDemo(); toast('Beispieldaten entfernt.'); } }, `Beispieldaten entfernen (${demoCount})`)
        : h('button', { class: 'btn block', onclick: async () => { await Store.loadDemo(); toast('Beispieldaten geladen.'); } }, 'Beispieldaten zum Ausprobieren laden'),
      h('p', { class: 'muted small' }, 'Beispieldaten sind markiert und lassen sich jederzeit mit einem Tipp entfernen. Sobald OneDrive verbunden ist, werden auch sie hochgeladen – bitte vorher entfernen.')
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
const empty = (title, text) => h('div', { class: 'empty' }, h('div', { class: 'empty-i' }, icon('construction', { size: 40 })), h('strong', {}, title), h('p', { class: 'muted' }, text));
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
  planung: ['Planung', viewPlan],
  dokumente: ['Dokumente', viewDocs],
  einstellungen: ['Einstellungen', viewSettings],
  haus: ['3D-Haus', () => hausView(phases())],
};
const NAV_ = [['', 'home', 'Übersicht'], ['haus', 'view_in_ar', '3D-Haus'], ['tagebuch', 'menu_book', 'Tagebuch'], ['kosten', 'payments', 'Kosten'], ['maengel', 'warning', 'Mängel']];
const MORE_ = [['aufgaben', 'task_alt', 'Aufgaben'], ['planung', 'calendar_month', 'Planung'], ['dokumente', 'folder', 'Dokumente'], ['einstellungen', 'settings', 'Einstellungen']];

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
    h('div', { class: 'drawer-head' }, h('strong', {}, 'Bautagebuch'), h('button', { class: 'icon-btn', 'aria-label': 'Menü schließen', onclick: () => dlg.close() }, icon('close', { size: 24 }))),
    h('nav', { class: 'drawer-list' }, ALL.map(([k, ic, t]) => h('a', { href: '#/' + k, class: 'drawer-item' + (r === k ? ' on' : ''), 'aria-current': r === k ? 'page' : null, onclick: navClick(k, () => dlg.close()) }, icon(ic, { filled: r === k, size: 24 }), h('span', {}, t)))));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

export function render() {
  if (!root) return;
  if (document.querySelector('dialog[open]')) { renderAfterClose = true; return; }
  const r = route();
  // In den Einstellungen nicht neu zeichnen, während gerade getippt wird (z. B. der Freigabe-Link).
  const ae = document.activeElement;
  if (r === 'einstellungen' && mainEl.contains(ae) && ['INPUT', 'TEXTAREA'].includes(ae.tagName)) { renderAfterClose = true; return; }
  const y = window.scrollY;
  const [title, view] = ROUTES[r];
  document.title = title + ' · Bautagebuch';
  root.querySelector('.title').textContent = title;
  headerSync.replaceChildren(syncBadge());
  mainEl.replaceChildren(view());
  window.scrollTo(0, y);
}

export function mount(el) {
  root = el;
  headerSync = h('button', { class: 'sync-btn', 'aria-label': 'Synchronisierung', onclick: () => go('einstellungen') });
  mainEl = h('main', {});
  menuBtn = h('button', { class: 'icon-btn', 'aria-label': 'Menü öffnen', 'aria-haspopup': 'dialog', onclick: openMenu }, icon('menu', { size: 26 }));
  root.append(h('header', { class: 'topbar' }, menuBtn, h('h1', { class: 'title' }, 'Bautagebuch'), headerSync), mainEl);
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
