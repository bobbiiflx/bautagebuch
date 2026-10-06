// Verbindet Anmeldung, Zielordner und Speicher.
import * as Auth from './auth.js';
import * as Store from './store.js';
import { Remote } from './onedrive.js';

export const getTarget = () => {
  try { return JSON.parse(localStorage.getItem('bt.target') || 'null') || { kind: 'own' }; } catch { return { kind: 'own' }; }
};

export const hasTarget = () => !!localStorage.getItem('bt.target');

export async function start() {
  // Erst synchronisieren, wenn bewusst gewählt wurde, wo die Daten liegen (eigener Ordner oder geteilter Ordner).
  if (!Auth.configured() || !Auth.isSignedIn() || !hasTarget()) {
    Store.disconnect();
    return;
  }
  const target = getTarget();
  let acc = Auth.account();
  Store.connect(target, acc?.name);
  Store.startPolling();
  if (!acc) {
    try {
      acc = await new Remote(target).me();
      Auth.setAccount(acc);
      Store.connect(target, acc.name);
    } catch (e) {
      console.warn('Konto konnte nicht gelesen werden', e);
    }
  }
  Store.sync().catch(() => {});
}

// Zielordner wechseln (eigener Ordner oder geteilter Ordner). Lokale Daten gehören zum alten Ordner und werden verworfen.
export async function setTarget(target) {
  const changed = JSON.stringify(getTarget()) !== JSON.stringify(target);
  localStorage.setItem('bt.target', JSON.stringify(target));
  if (changed) await Store.resetLocal();
  await start();
}

export function signOut() {
  Auth.logout();
  Store.stopPolling();
  Store.disconnect();
}
