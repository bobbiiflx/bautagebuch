// Märkte für die Einkaufszettel: Top 4 (drei Märkte in der Nähe plus Amazon), weitere im Dropdown. Logos werden beim ersten Online-Start geladen,
// auf 64 px verkleinert und lokal gespeichert (danach offline verfügbar). Eigene Märkte haben kein Logo.
import { h } from './ui.js';
import { icon } from './icons.js';
import * as Store from './store.js';

const fav = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
export const MARKETS = [
  { id: 'globus', name: 'Globus Baumarkt', short: 'Globus', keys: ['globus'], logo: fav('globus-baumarkt.de'), top: true },
  { id: 'toom', name: 'Toom', short: 'Toom', keys: ['toom'], logo: fav('toom.de'), top: true },
  { id: 'schulte', name: 'Schulte Baustoffhandel', short: 'Schulte', keys: ['schulte'], logo: 'https://www.schulte-baustoffe.de/assets/favicon/schulte-baustoffe/ms-icon-144x144.png', top: true },
  { id: 'amazon', name: 'Amazon', short: 'Amazon', keys: ['amazon'], logo: fav('amazon.de'), top: true },
  { id: 'hornbach', name: 'Hornbach', keys: ['hornbach'], logo: fav('hornbach.de') },
  { id: 'obi', name: 'OBI', keys: ['obi'], logo: fav('obi.de') },
  { id: 'bauhaus', name: 'Bauhaus', keys: ['bauhaus'], logo: fav('bauhaus.info') },
  { id: 'hagebau', name: 'Hagebau', keys: ['hagebau'], logo: fav('hagebau.de') },
  { id: 'rewe', name: 'Rewe', keys: ['rewe'], logo: fav('rewe.de') },
  { id: 'lidl', name: 'Lidl', keys: ['lidl'], logo: fav('lidl.de') },
  { id: 'aldi', name: 'Aldi', keys: ['aldi'], logo: fav('aldi.de') },
];
export const TOP_MARKETS = MARKETS.filter((m) => m.top);
export const OTHER_MARKETS = MARKETS.filter((m) => !m.top);
export const marketByName = (name) => {
  const t = String(name || '').toLowerCase();
  return t ? MARKETS.find((m) => m.keys.some((k) => t.includes(k))) || null : null;
};

async function shrink(blob, px) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(px / img.naturalWidth, px / img.naturalHeight, 1);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob(r, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

const cache = new Map(); // Markt-ID → Promise<URL | null>
async function load(m) {
  try {
    const b = await Store.getLocalAsset('logo/' + m.id);
    if (b) return URL.createObjectURL(b);
  } catch { /* weiter */ }
  if (!navigator.onLine) return null;
  try {
    const res = await fetch(m.logo, { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const small = await shrink(await res.blob(), 64);
    if (!small) throw new Error('leer');
    await Store.putLocalAsset('logo/' + m.id, small);
    return URL.createObjectURL(small);
  } catch {
    return m.logo; // Server erlaubt kein Auslesen: direkt anzeigen (der Service Worker merkt sich das Bild)
  }
}
export function marketLogoURL(m) {
  if (!cache.has(m.id)) cache.set(m.id, load(m).then((u) => { if (!u) cache.delete(m.id); return u; }));
  return cache.get(m.id);
}

// Kleines Logo-Element für einen Marktnamen; null bei eigenen Märkten
export function logoEl(name, size = 22) {
  const m = marketByName(name);
  if (!m) return null;
  const box = h('span', { class: 'stlogo', style: { width: size + 'px', height: size + 'px' } }, icon('storefront', { size: Math.round(size * 0.7) }));
  marketLogoURL(m).then((u) => {
    if (!u) return;
    const img = h('img', { src: u, alt: '', width: size, height: size, loading: 'lazy' });
    img.addEventListener('error', () => img.remove());
    box.replaceChildren(img);
  }).catch(() => {});
  return box;
}
