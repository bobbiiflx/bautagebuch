// Oberfläche: Hilfsfunktionen, Dialoge und alle Ansichten.
import * as Store from './store.js';
import * as Auth from './auth.js';
import * as Session from './session.js';
import { Remote } from './onedrive.js';
import { CONFIG } from './config.js';
import { DEFAULT_PHASES, PHASE_STATES, DOC_CATEGORIES, COST_STATES, DEFECT_STATES, ROOMS } from './phases.js';

// ---------- Hilfsfunktionen ----------
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
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
const phaseName = (id) => phaseById(id)?.name || '';

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
            if (confirm('Wirklich löschen?')) { await onDelete(); dlg.close(); }
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
      h('button', { type: 'button', class: 'btn', onclick: () => cam.click() }, '📷 Foto aufnehmen'),
      h('button', { type: 'button', class: 'btn', onclick: () => gal.click() }, '🖼️ Aus Galerie')
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

function budgetInfo() {
  const b = Store.get('settings', 'budget');
  return b ? Number(b.amount) || 0 : 0;
}

function viewHome() {
  const ph = phases();
  const pct = progressOf(ph);
  const done = ph.filter((p) => p.state === 'fertig').length;
  const running = ph.filter((p) => p.state === 'laeuft');
  const costs = Store.all('costs');
  const spent = sum(costs.filter((c) => c.status !== 'angebot'), (c) => c.amount);
  const open = sum(costs.filter((c) => c.status === 'offen'), (c) => c.amount);
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
      running.length ? h('div', { class: 'chips' }, running.map((p) => chip(`${p.icon || '🔧'} ${p.name} · ${p.progress}%`, 'run'))) : next && h('div', { class: 'muted small' }, `Als Nächstes geplant: ${next.name}`)
    ),
    card(
      '3D-Haus',
      h('p', { class: 'muted' }, 'Hier erscheint im nächsten Schritt euer Haus als Low-Poly-Modell. Es zeigt genau die Phasen, die ihr als fertig markiert habt – egal in welcher Reihenfolge.'),
      h('div', { class: 'chips' }, ph.map((p) => chip(`${p.icon || '🔧'} ${p.name.split(' ')[0].replace(',', '')}`, p.state === 'fertig' ? 'done' : p.state === 'laeuft' ? 'run' : 'dim')))
    ),
    h(
      'div',
      { class: 'stats' },
      stat('Ausgaben', fmtEUR(spent), budget ? `von ${fmtEUR(budget)} Budget` : 'Budget unter „Kosten“ setzen', budget && spent > budget ? 'bad' : ''),
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
  const phase = phaseSelect(e.phaseId);
  const status = h('select', { value: e.status }, optionList(COST_STATES, e.status));
  const note = h('textarea', { rows: 3, value: e.note || '' });
  const pf = photoField(e.photos);
  sheet(entry ? 'Kosten bearbeiten' : 'Neue Kosten', [field('Datum', date), field('Bezeichnung', title), field('Betrag (EUR, brutto)', amount), field('Firma', vendor), field('Gewerk / Phase', phase), field('Status', status), field('Notiz', note), pf.el], {
    onSave: async () => {
      await Store.save('costs', { ...e, date: date.value, title: title.value.trim(), amount: Number(amount.value), vendor: vendor.value.trim(), phaseId: phase.value, status: status.value, note: note.value.trim(), photos: pf.ids });
      await pf.commit();
    },
    onCancel: () => pf.cancel(),
    onDelete: entry && (() => Store.remove('costs', e.id)),
  });
}

function budgetForm() {
  const cur = Store.get('settings', 'budget') || { id: 'budget', amount: '' };
  const amount = h('input', { type: 'number', step: '100', min: '0', inputmode: 'decimal', value: cur.amount });
  sheet('Gesamtbudget', [field('Budget (EUR)', amount, 'Dient nur dem Vergleich in der Übersicht.')], {
    onSave: () => Store.save('settings', { ...cur, id: 'budget', amount: Number(amount.value) || 0 }),
  });
}

let costFilter = { phase: '', status: '' };
function viewCosts() {
  const all = Store.all('costs');
  const spent = sum(all.filter((c) => c.status !== 'angebot'), (c) => c.amount);
  const open = sum(all.filter((c) => c.status === 'offen'), (c) => c.amount);
  const offers = sum(all.filter((c) => c.status === 'angebot'), (c) => c.amount);
  const budget = budgetInfo();
  let list = all.filter((c) => (!costFilter.phase || c.phaseId === costFilter.phase) && (!costFilter.status || c.status === costFilter.status)).sort(byDateDesc);

  const perPhase = phases()
    .map((p) => ({ p, v: sum(all.filter((c) => c.phaseId === p.id && c.status !== 'angebot'), (c) => c.amount) }))
    .filter((x) => x.v > 0);
  const other = sum(all.filter((c) => c.status !== 'angebot' && !phaseById(c.phaseId)), (c) => c.amount);
  const max = Math.max(1, ...perPhase.map((x) => x.v), other);

  const fPhase = h('select', { value: costFilter.phase, onchange: (e) => { costFilter.phase = e.target.value; render(); } }, h('option', { value: '' }, 'Alle Phasen'), phases().map((p) => h('option', { value: p.id }, p.name)));
  const fStatus = h('select', { value: costFilter.status, onchange: (e) => { costFilter.status = e.target.value; render(); } }, h('option', { value: '' }, 'Alle Status'), optionList(COST_STATES, costFilter.status));

  return h(
    'div',
    { class: 'view' },
    h(
      'div',
      { class: 'stats' },
      stat('Ausgaben', fmtEUR(spent), budget ? `${fmtEUR(budget - spent)} vom Budget übrig` : null, budget && spent > budget ? 'bad' : ''),
      stat('Davon offen', fmtEUR(open)),
      stat('Angebote', fmtEUR(offers)),
      h('button', { class: 'stat btn-stat', onclick: budgetForm }, h('div', { class: 'stat-v' }, budget ? fmtEUR(budget) : '–'), h('div', { class: 'stat-l' }, 'Budget (antippen)'))
    ),
    perPhase.length || other
      ? card('Ausgaben je Phase', [...perPhase.map(({ p, v }) => h('div', { class: 'brow' }, h('span', {}, p.name), h('span', { class: 'muted' }, fmtEUR(v)), bar((v / max) * 100))), other ? h('div', { class: 'brow' }, h('span', {}, 'Ohne Zuordnung'), h('span', { class: 'muted' }, fmtEUR(other)), bar((other / max) * 100)) : null])
      : null,
    h('div', { class: 'filters' }, fPhase, fStatus),
    list.length
      ? list.map((c) =>
          h(
            'article',
            { class: 'card entry', onclick: () => costForm(c) },
            h('div', { class: 'entry-top' }, h('span', { class: 'muted small' }, fmtDate(c.date)), chip(COST_STATES.find((s) => s[0] === c.status)?.[1] || c.status, 'cs-' + c.status)),
            h('div', { class: 'split' }, h('h3', {}, c.title), h('strong', { class: 'amount' }, fmtEUR(c.amount))),
            h('div', { class: 'muted small' }, [c.vendor, phaseName(c.phaseId)].filter(Boolean).join(' · ')),
            photoStrip(c.photos)
          )
        )
      : empty('Keine Kosten', 'Trage Rechnungen, Abschläge und Angebote ein und fotografiere die Belege.'),
    fab(() => costForm())
  );
}

// ---------- Ansicht: Mängel ----------
function defectForm(entry) {
  const e = entry || { date: today(), title: '', description: '', room: '', phaseId: '', vendor: '', status: 'offen', due: '', photos: [] };
  const title = h('input', { type: 'text', required: true, placeholder: 'z. B. Riss im Putz', value: e.title });
  const desc = h('textarea', { rows: 4, placeholder: 'Genauere Beschreibung', value: e.description || '' });
  const room = h('input', { type: 'text', list: 'rooms', placeholder: 'Raum / Ort', value: e.room || '' });
  const dl = h('datalist', { id: 'rooms' }, ROOMS.map((r) => h('option', { value: r })));
  const phase = phaseSelect(e.phaseId, '– Gewerk unbekannt –');
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
      h('div', { class: 'todo-t', onclick: () => todoForm(t) }, h('div', {}, t.title), h('div', { class: 'muted small' }, [t.due && (t.due < today() && !t.done ? '⚠ überfällig · ' : '') + fmtDate(t.due), t.assignee, phaseName(t.phaseId)].filter(Boolean).join(' · ')))
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
    done.length ? h('button', { class: 'btn-text', onclick: () => { showDone = !showDone; render(); } }, `${showDone ? '▾' : '▸'} Erledigt (${done.length})`) : null,
    showDone && done.length ? h('div', { class: 'card' }, done.map(row)) : null
  );
}

// ---------- Ansicht: Planung ----------
const isDefaultPhase = (id) => DEFAULT_PHASES.some((p) => p.id === id);

async function movePhase(p, dir) {
  const list = phases();
  const i = list.findIndex((x) => x.id === p.id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  // Reihenfolge neu durchnummerieren, damit nie zwei Phasen denselben Wert haben
  const order = list.map((x) => x.id);
  [order[i], order[j]] = [order[j], order[i]];
  for (const [k, id] of order.entries()) {
    const ph = Store.get('phases', id);
    const newOrder = (k + 1) * 10;
    if (ph.order !== newOrder) await Store.save('phases', { ...ph, order: newOrder });
  }
}

function phaseForm(entry) {
  const e = entry || { name: '', icon: '🔧', state: 'geplant', progress: 0, start: '', end: '', note: '', order: (Math.max(0, ...phases().map((p) => p.order)) || 0) + 10 };
  const name = h('input', { type: 'text', required: true, value: e.name });
  const state = h('select', { value: e.state }, optionList(PHASE_STATES, e.state));
  const range = h('input', { type: 'range', min: 0, max: 100, step: 5, value: e.progress });
  const out = h('strong', {}, e.progress + ' %');
  const start = h('input', { type: 'date', value: e.start || '' });
  const end = h('input', { type: 'date', value: e.end || '' });
  const note = h('textarea', { rows: 3, placeholder: 'Firma, Besonderheiten, Termine …', value: e.note || '' });
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
  sheet(entry ? e.name : 'Eigene Phase', [field('Name', name), field('Status', state), h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Fortschritt ', out), range), field('Geplanter Beginn', start), field('Geplantes Ende', end), field('Notiz', note)], {
    onSave: () => Store.save('phases', { ...e, name: name.value.trim(), state: state.value, progress: Number(range.value), start: start.value, end: end.value, note: note.value.trim() }),
    onDelete: entry && !isDefaultPhase(e.id) ? () => Store.remove('phases', e.id) : null,
  });
}

function viewPlan() {
  const list = phases();
  const pct = progressOf(list);
  return h(
    'div',
    { class: 'view' },
    h('section', { class: 'card' }, h('div', { class: 'split' }, h('h3', {}, 'Gesamtfortschritt'), h('strong', {}, pct + ' %')), bar(pct), h('p', { class: 'muted small' }, 'Die Reihenfolge lässt sich mit den Pfeilen ändern. Das Haus zeigt später jede fertige Phase, egal an welcher Stelle sie steht.')),
    list.map((p, i) =>
      h(
        'article',
        { class: 'card phase ps-' + p.state },
        h('div', { class: 'phase-main', onclick: () => phaseForm(p) },
          h('div', { class: 'split' }, h('h3', {}, `${p.icon || '🔧'} ${p.name}`), chip(PHASE_STATES.find((s) => s[0] === p.state)?.[1] || p.state, 'phs-' + p.state)),
          bar(p.progress),
          h('div', { class: 'muted small' }, [p.progress + ' %', p.start && 'ab ' + fmtDate(p.start), p.end && 'bis ' + fmtDate(p.end)].filter(Boolean).join(' · '))
        ),
        h('div', { class: 'movers' },
          h('button', { class: 'mv', disabled: i === 0, 'aria-label': 'Nach oben', onclick: () => movePhase(p, -1) }, '▲'),
          h('button', { class: 'mv', disabled: i === list.length - 1, 'aria-label': 'Nach unten', onclick: () => movePhase(p, 1) }, '▼'))
      )
    ),
    h('button', { class: 'btn block', onclick: () => phaseForm() }, '+ Eigene Phase hinzufügen')
  );
}

// ---------- Ansicht: Dokumente ----------
let docFilter = '';
function docIcon(mime = '') {
  return mime.includes('pdf') ? '📄' : mime.startsWith('image/') ? '🖼️' : mime.includes('sheet') || mime.includes('excel') ? '📊' : mime.includes('word') ? '📝' : '📎';
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
  const phase = phaseSelect('');
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
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => fileIn.click() }, '📁 Datei wählen'), h('button', { type: 'button', class: 'btn', onclick: () => camIn.click() }, '📷 Fotografieren')),
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
  const phase = phaseSelect(d.phaseId);
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
        h('p', {}, '✅ Angemeldet als ', h('strong', {}, acc?.name || acc?.username || 'Microsoft-Konto')),
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
    if (!confirm('Auf diesem Gerät gibt es noch nicht synchronisierte Einträge. Beim Wechsel des Ordners gehen sie verloren. Trotzdem wechseln?')) return;
  }
  await Session.setTarget(t);
  render();
}

// ---------- Gemeinsame Bausteine ----------
const empty = (title, text) => h('div', { class: 'empty' }, h('div', { class: 'empty-i' }, '🏗️'), h('strong', {}, title), h('p', { class: 'muted' }, text));
const fab = (fn) => h('button', { class: 'fab', 'aria-label': 'Hinzufügen', onclick: fn }, '+');

function syncBadge() {
  const s = Store.getState();
  const map = { local: ['dim', '● Nur lokal'], online: ['ok', '☁ Synchronisiert'], syncing: ['run', '⟳ Synchronisiere …'], offline: ['warn', '⚠ Offline'], auth: ['warn', '⚠ Anmeldung nötig'], error: ['bad', '⚠ Sync-Fehler'] };
  const [cls, text] = s.mode === 'online' && !s.last ? ['run', '☁ Verbunden'] : map[s.mode] || map.local;
  return h('span', { class: 'sync ' + cls }, text + (s.pending ? ` · ${s.pending} offen` : ''));
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
};
const NAV = [['', '🏠', 'Übersicht'], ['tagebuch', '📓', 'Tagebuch'], ['kosten', '💶', 'Kosten'], ['maengel', '⚠️', 'Mängel']];
const MORE = [['aufgaben', '✅', 'Aufgaben'], ['planung', '📅', 'Planung'], ['dokumente', '📁', 'Dokumente'], ['einstellungen', '⚙️', 'Einstellungen']];

const route = () => {
  const r = location.hash.replace(/^#\/?/, '');
  return r in ROUTES ? r : '';
};

let root, headerSync, mainEl, navEl;

function openMore() {
  const dlg = h('dialog', { class: 'sheet more' },
    h('div', { class: 'sheet-body' }, MORE.map(([r, ic, t]) => h('a', { class: 'more-item', href: '#/' + r, onclick: () => dlg.close() }, h('span', {}, ic), t)), h('button', { class: 'btn block', onclick: () => dlg.close() }, 'Schließen')));
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
  navEl.replaceChildren(
    ...NAV.map(([k, ic, t]) => h('a', { href: '#/' + k, class: r === k ? 'on' : '' }, h('span', { class: 'ic' }, ic), t)),
    h('button', { class: MORE.some((m) => m[0] === r) ? 'on' : '', onclick: openMore }, h('span', { class: 'ic' }, '☰'), 'Mehr')
  );
  window.scrollTo(0, y);
}

export function mount(el) {
  root = el;
  headerSync = h('button', { class: 'sync-btn', 'aria-label': 'Synchronisierung', onclick: () => { location.hash = '#/einstellungen'; } });
  mainEl = h('main', {});
  navEl = h('nav', { class: 'tabbar' });
  root.append(h('header', { class: 'topbar' }, h('h1', { class: 'title' }, 'Bautagebuch'), headerSync), mainEl, navEl);
  addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
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
