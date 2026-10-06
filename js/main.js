import * as Auth from './auth.js';
import * as Store from './store.js';
import * as Session from './session.js';
import * as UI from './ui.js';

async function boot() {
  let authError = null;
  try {
    await Store.init();
  } catch (e) {
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
  UI.mount(document.getElementById('app'));
  if (authError) UI.toast('Anmeldung fehlgeschlagen: ' + authError, 9000);
  await Session.start();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
  }
}

boot();
