// Standard-Bauphasen in der bisher geplanten Reihenfolge. Reihenfolge, Namen und Status sind in der App änderbar.
// Die IDs sind fest, damit beide Geräte dieselben Phasen kennen und das 3D-Haus später jede Phase
// unabhängig von ihrer Position in der Reihenfolge zeigen kann.
export const DEFAULT_PHASES = [
  { id: 'oeltank', name: 'Öltank entfernen' },
  { id: 'entkernung', name: 'Entkernung' },
  { id: 'aufstockung', name: 'Aufstockung / Rohbau' },
  { id: 'dach', name: 'Dach (Dachstuhl & Eindeckung)' },
  { id: 'elektro', name: 'Elektro' },
  { id: 'sanitaer', name: 'Sanitär, Heizung & Fußbodenheizung' },
  { id: 'fenster', name: 'Fenster' },
  { id: 'daemmung', name: 'Dämmung' },
  { id: 'fassade', name: 'Fassade / Putz' },
  { id: 'estrich', name: 'Estrich' },
  { id: 'trockenbau', name: 'Trockenbau' },
  { id: 'maler', name: 'Maler' },
  { id: 'boeden', name: 'Böden' },
  { id: 'kueche', name: 'Küche' },
  { id: 'solar', name: 'Solar' },
  { id: 'aussentreppe', name: 'Außentreppe' },
  { id: 'baum', name: 'Baum fällen', order: 5 },   // kommt vor allen anderen Phasen
].map((p, i) => ({ ...p, order: p.order ?? (i + 1) * 10, state: 'geplant', progress: 0, start: '', end: '', note: '' }));

export const PHASE_STATES = [
  ['geplant', 'Geplant'],
  ['laeuft', 'Läuft'],
  ['fertig', 'Fertig'],
];

export const DOC_CATEGORIES = ['Verträge', 'Pläne', 'Rechnungen', 'Angebote', 'Genehmigungen', 'Fotos & Sonstiges'];

export const COST_STATES = [
  ['angebot', 'Angebot'],
  ['offen', 'Rechnung offen'],
  ['bezahlt', 'Bezahlt'],
];

export const DEFECT_STATES = [
  ['offen', 'Offen'],
  ['klaerung', 'In Klärung'],
  ['behoben', 'Behoben'],
  ['abgenommen', 'Abgenommen'],
];

// Räume laut Entwurfsgrundrissen (KG / EG / DG), als Vorschlagsliste für Mängel und Tagebuch.
export const ROOMS = [
  'KG – Hobby 1', 'KG – Hobby 2', 'KG – Werkstatt', 'KG – Sport', 'KG – WC', 'KG – Dusche/Waschen',
  'KG – Öltankraum', 'KG – Flur', 'KG – Keller/Bar', 'KG – Heizung/Technik', 'KG – Vorrat/Keller', 'KG – Treppe',
  'EG – Wohnen/Essen', 'EG – Küche', 'EG – Diele', 'EG – Flur', 'EG – WC', 'EG – Schlafen', 'EG – Ankleide',
  'EG – Bad', 'EG – Treppe', 'EG – Garage',
  'DG – Wohnen/Essen', 'DG – Loggia', 'DG – Schlafen', 'DG – Bad', 'DG – Flur', 'DG – Kind 1', 'DG – Kind 2',
  'DG – Balkon',
  'Außen – Fassade', 'Außen – Dach', 'Außen – Außentreppe', 'Außen – Lichtgraben', 'Außen – Garten',
];

// Weitere Verwendungen/Gewerke neben den Bauphasen (eigene lassen sich in der App ergänzen).
export const BUILTIN_TRADES = [
  ['g:material', 'Material'],
  ['g:planung', 'Architektur und Planung'],
  ['g:werkzeug', 'Werkzeug'],
];
export const BUDGET_SUGGESTIONS = ['Eigenkapital', 'Kredit', 'Förderung', 'Eigenleistung', 'Darlehen Familie', 'Rücklage'];
