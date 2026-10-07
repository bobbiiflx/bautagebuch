// Startbildschirm: erscheint beim Öffnen der App kurz mit dem App-Icon; in den Einstellungen abschaltbar (pro Gerät).
const KEY = 'bt.splash';
export function splashOn() { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } }
export function setSplash(on) {
  try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, 'off'); } catch { /* ignorieren */ }
  document.documentElement.classList.toggle('no-splash', !on);
}
// Blendet den Startbildschirm aus, frühestens nach minMs seit dem Seitenstart; Tippen beendet ihn sofort.
export function hideSplash(minMs = 1500) {
  const el = document.getElementById('splash');
  if (!el) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = Math.max(0, (reduce ? 500 : minMs) - performance.now());
  let done = false;
  const out = () => {
    if (done) return;
    done = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), 500);
  };
  el.addEventListener('pointerdown', out, { once: true });
  setTimeout(out, wait);
}
