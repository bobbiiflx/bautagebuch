// Referenztabelle: aus Dateiendung und Dateiname werden Kategorie, Gewerk und Tags VORGESCHLAGEN (nie automatisch gesetzt).
// Regel: { id, kind: 'name' | 'ext', words: 'a, b, c', tag: 'Rechnungen', phaseId: 'elektro' }
// Ist die Regel-Kategorie eine der festen Dokumentkategorien, wird sie zur Kategorie, sonst zu einem zusätzlichen Tag.
export const DEFAULT_DOC_RULES = [
  ['ext', 'jpg, jpeg, png, heic, heif, webp, gif', 'Fotos', ''],
  ['ext', 'dwg, dxf, ifc', 'Pläne', ''],
  ['ext', 'xls, xlsx, csv', 'Tabelle', ''],
  ['ext', 'zip', 'Archiv', ''],
  ['name', 'rechnung, invoice, abschlag, schlussrechnung', 'Rechnungen', ''],
  ['name', 'angebot, kostenvoranschlag, offerte', 'Angebote', ''],
  ['name', 'vertrag, werkvertrag, kaufvertrag, bauvertrag', 'Verträge', ''],
  ['name', 'grundriss, lageplan, schnitt, ansicht, bauplan, zeichnung, statik', 'Pläne', ''],
  ['name', 'genehmigung, bauantrag, bescheid, baugenehmigung', 'Genehmigungen', ''],
  ['name', 'oeltank, tankentsorgung', '', 'oeltank'],
  ['name', 'entkernung, abbruch, container', '', 'entkernung'],
  ['name', 'rohbau, aufstockung, maurer, beton', '', 'aufstockung'],
  ['name', 'dach, dachstuhl, ziegel, sparren', '', 'dach'],
  ['name', 'elektro, schaltplan, steckdose, zaehler', '', 'elektro'],
  ['name', 'heizung, sanitaer, fussbodenheizung, rohr, wasser', '', 'sanitaer'],
  ['name', 'fenster, verglasung', '', 'fenster'],
  ['name', 'daemmung, wdvs', '', 'daemmung'],
  ['name', 'fassade, putz', '', 'fassade'],
  ['name', 'estrich', '', 'estrich'],
  ['name', 'trockenbau, gipskarton', '', 'trockenbau'],
  ['name', 'maler, anstrich', '', 'maler'],
  ['name', 'boden, parkett, fliese', '', 'boeden'],
  ['name', 'kueche', '', 'kueche'],
  ['name', 'solar, photovoltaik, wechselrichter', '', 'solar'],
  ['name', 'aussentreppe', '', 'aussentreppe'],
  ['name', 'baumfaellung, faellung', '', 'baum'],
].map(([kind, words, tag, phaseId], i) => ({ id: 'd' + i, kind, words, tag, phaseId }));

// Umlaute/Akzente vereinheitlichen, damit „Küche“, „Kueche“ und „KÜCHE“ dasselbe sind
export const fold = (s) => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const wordsOf = (r) => String(r.words || '').split(/[,;\n]+/).map((w) => fold(w).trim().replace(/^\./, '')).filter(Boolean);

// → { category, phaseId, tags, reasons } oder null, wenn nichts passt
export function suggest(fileName, rules, categories, mime = '') {
  const m = String(fileName || '').match(/^(.*?)(?:\.([A-Za-z0-9]{1,6}))?$/);
  const base = fold(m[1]), ext = fold(m[2] || '');
  const out = { category: '', phaseId: '', tags: [], reasons: [] };
  for (const r of rules) {
    const ws = wordsOf(r);
    let hit = null;
    if (r.kind === 'ext') hit = ext && ws.includes(ext) ? `Endung .${ext}` : null;
    else { const w = ws.find((x) => x.length >= 3 && base.includes(x)); hit = w ? `Name enthält „${w}“` : null; }
    if (!hit) continue;
    let used = false;
    if (r.tag) {
      if (categories.includes(r.tag)) { if (!out.category) { out.category = r.tag; used = true; } }
      else if (!out.tags.includes(r.tag)) { out.tags.push(r.tag); used = true; }
    }
    if (r.phaseId && !out.phaseId) { out.phaseId = r.phaseId; used = true; }
    if (used) out.reasons.push(hit);
  }
  if (!out.category && String(mime).startsWith('image/') && categories.includes('Fotos')) { out.category = 'Fotos'; out.reasons.push('Bilddatei'); }
  return out.category || out.phaseId || out.tags.length ? out : null;
}
