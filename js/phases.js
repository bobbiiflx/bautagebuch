// Standard-Bauphasen in der bisher geplanten Reihenfolge. Reihenfolge, Namen und Status sind in der App änderbar.
// Die IDs sind fest, damit beide Geräte dieselben Phasen kennen und das 3D-Haus später jede Phase
// unabhängig von ihrer Position in der Reihenfolge zeigen kann.
export const DEFAULT_PHASES = [
  { id: 'oeltank', name: 'Öltank entfernen', icon: '🛢️' },
  { id: 'entkernung', name: 'Entkernung', icon: '🔨' },
  { id: 'aufstockung', name: 'Aufstockung / Rohbau', icon: '🧱' },
  { id: 'dach', name: 'Dach (Dachstuhl & Eindeckung)', icon: '🏠' },
  { id: 'elektro', name: 'Elektro', icon: '⚡' },
  { id: 'sanitaer', name: 'Sanitär, Heizung & Fußbodenheizung', icon: '🚿' },
  { id: 'fenster', name: 'Fenster', icon: '🪟' },
  { id: 'daemmung', name: 'Dämmung', icon: '🧶' },
  { id: 'fassade', name: 'Fassade / Putz', icon: '🎨' },
  { id: 'estrich', name: 'Estrich', icon: '🏗️' },
  { id: 'trockenbau', name: 'Trockenbau', icon: '📐' },
  { id: 'maler', name: 'Maler', icon: '🖌️' },
  { id: 'boeden', name: 'Böden', icon: '🪵' },
  { id: 'kueche', name: 'Küche', icon: '🍳' },
  { id: 'solar', name: 'Solar', icon: '☀️' },
  { id: 'aussentreppe', name: 'Außentreppe', icon: '🪜' },
].map((p, i) => ({ ...p, order: (i + 1) * 10, state: 'geplant', progress: 0, start: '', end: '', note: '' }));

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
