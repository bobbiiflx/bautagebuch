// Microsoft-Anmeldung per OAuth 2.0 Authorization Code Flow mit PKCE (Single-Page-App, kein Client-Secret).
import { CONFIG } from './config.js';

const K_TOKEN = 'bt.auth';
const K_PKCE = 'bt.pkce';
const K_ACCOUNT = 'bt.account';

export class AuthError extends Error {}

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export const redirectUri = () => new URL('./', location.href).href.split('?')[0].split('#')[0];
export const configured = () => !!CONFIG.clientId && !CONFIG.clientId.startsWith('HIER');

const load = () => {
  try { return JSON.parse(localStorage.getItem(K_TOKEN) || 'null'); } catch { return null; }
};
const save = (t) => localStorage.setItem(K_TOKEN, JSON.stringify(t));

export const isSignedIn = () => !!load();
export const account = () => {
  try { return JSON.parse(localStorage.getItem(K_ACCOUNT) || 'null'); } catch { return null; }
};
export const setAccount = (a) => localStorage.setItem(K_ACCOUNT, JSON.stringify(a));

export async function login() {
  if (!configured()) throw new AuthError('Client-ID fehlt in js/config.js (siehe SETUP.md).');
  const verifier = rand(48);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = rand(16);
  localStorage.setItem(K_PKCE, JSON.stringify({ verifier, state }));
  const p = new URLSearchParams({
    client_id: CONFIG.clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: CONFIG.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  const hint = account()?.username;
  if (hint) p.set('login_hint', hint);
  else p.set('prompt', 'select_account');
  location.assign(`${CONFIG.authority}/oauth2/v2.0/authorize?${p}`);
}

async function tokenRequest(body) {
  const res = await fetch(`${CONFIG.authority}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    const e = new AuthError(j.error_description || j.error || `Token-Fehler ${res.status}`);
    e.code = j.error;
    throw e;
  }
  const old = load();
  save({
    access: j.access_token,
    refresh: j.refresh_token || old?.refresh || null,
    expires: Date.now() + (j.expires_in || 3600) * 1000,
  });
}

// Wird beim Start aufgerufen: schließt die Anmeldung ab, wenn Microsoft zurückgeleitet hat.
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return false;
  const clean = () => history.replaceState(null, '', redirectUri() + location.hash);
  if (q.has('error')) {
    const msg = q.get('error_description') || q.get('error');
    clean();
    throw new AuthError(msg);
  }
  const saved = JSON.parse(localStorage.getItem(K_PKCE) || 'null');
  localStorage.removeItem(K_PKCE);
  if (!saved || saved.state !== q.get('state')) {
    clean();
    throw new AuthError('Anmeldung konnte nicht abgeschlossen werden (state stimmt nicht). Bitte erneut versuchen.');
  }
  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    scope: CONFIG.scopes.join(' '),
    code: q.get('code'),
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
    code_verifier: saved.verifier,
  });
  try {
    await tokenRequest(body);
  } finally {
    clean();
  }
  return true;
}

let refreshing = null;

export async function getToken() {
  const t = load();
  if (!t) throw new AuthError('Nicht angemeldet.');
  if (t.expires - Date.now() > 120000) return t.access;
  if (!t.refresh) {
    logout();
    throw new AuthError('Sitzung abgelaufen. Bitte erneut anmelden.');
  }
  refreshing ||= tokenRequest(
    new URLSearchParams({
      client_id: CONFIG.clientId,
      grant_type: 'refresh_token',
      refresh_token: t.refresh,
      scope: CONFIG.scopes.join(' '),
    })
  ).finally(() => { refreshing = null; });
  try {
    await refreshing;
  } catch (e) {
    if (e instanceof AuthError) {
      // Bei Single-Page-Apps läuft das Refresh-Token nach 24 h ab: dann ist eine neue Anmeldung nötig.
      logout();
      throw new AuthError('Sitzung abgelaufen. Bitte erneut anmelden.');
    }
    throw e; // z. B. offline
  }
  return load().access;
}

// Markiert das Access-Token als abgelaufen, damit beim nächsten Aufruf ein neues geholt wird.
export function invalidate() {
  const t = load();
  if (t) save({ ...t, expires: 0 });
}

export function logout() {
  localStorage.removeItem(K_TOKEN);
}
