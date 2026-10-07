import * as Auth from './auth.js';
import * as Store from './store.js';
import * as Session from './session.js';
import * as UI from './ui.js';
import { CONFIG } from './config.js';
import { applyTheme } from './theme.js';
import { hideSplash } from './splash.js';
applyTheme();

async function boot() {
  let authError = null;
  try {
    await Store.init();
  } catch (e) {
    hideSplash(0);
    document.getElementById('app').textContent = 'Der lokale Speicher ist nicht verfügbar (privater Modus?). ' + e.message;
    return;
  }
  let fresh = false;
  try {
    fresh = await Auth.handleRedirect();
  } catch (e) {
    authError = e.message;
  }
  // Frisch angemeldet, aber noch kein Ordner gewählt: direkt zu den Einstellungen.
  if (fresh && !Session.hasTarget()) location.hash = '#/einstellungen';
  // Nur in der Vorschau: beim ersten Öffnen ein paar Beispieldaten laden, damit nichts leer ist.
  if (CONFIG.preview) {
    let seeded = false;
    try { seeded = !!localStorage.getItem('bt.demoSeeded'); } catch { seeded = true; }
    if (!seeded && Store.all('diary').length === 0 && Store.all('costs').length === 0) {
      await Store.loadDemo();
      try { localStorage.setItem('bt.demoSeeded', '1'); } catch { /* ignorieren */ }
    }
  }
  UI.mount(document.getElementById('app'));
  hideSplash();
  if (authError) UI.toast('Anmeldung fehlgeschlagen: ' + authError, 9000);
  await Session.start();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
  }
}

boot();
