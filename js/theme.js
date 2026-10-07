// Darstellung: 'auto' (Browser/Gerät), 'light' oder 'dark'. Wird lokal pro Gerät gespeichert.
const KEY = 'bt.theme';
export function getTheme() { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } }
export function applyTheme(t = getTheme()) {
  const r = document.documentElement;
  if (t === 'light' || t === 'dark') r.setAttribute('data-theme', t); else r.removeAttribute('data-theme');
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0f14' : '#f6f7f9');
}
export function setTheme(t) { try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* ignorieren */ } applyTheme(t); }
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
