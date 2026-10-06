// Zugriff auf OneDrive über Microsoft Graph. Alle Daten liegen als einzelne Dateien in einem Ordner.
import { CONFIG } from './config.js';
import { getToken, invalidate } from './auth.js';

const G = 'https://graph.microsoft.com/v1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const SIMPLE_LIMIT = 4 * 1024 * 1024; // einfacher Upload bis 4 MB, darüber Upload-Sitzung
const CHUNK = 10 * 327680; // Vielfaches von 320 KiB, wie von Graph verlangt

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function gfetch(url, { method = 'GET', headers = {}, body } = {}) {
  for (let attempt = 0; ; attempt++) {
    const token = await getToken();
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
    if ([429, 503, 504].includes(res.status) && attempt < 3) {
      await sleep((Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000);
      continue;
    }
    if (res.status === 401 && attempt < 1) {
      invalidate();
      continue;
    }
    return res;
  }
}

async function failFrom(res) {
  let msg = `${res.status}`;
  try {
    const j = await res.json();
    msg = j.error?.message || msg;
  } catch { /* ignorieren */ }
  return new HttpError(res.status, msg);
}

export const toShareId = (link) =>
  'u!' + btoa(unescape(encodeURIComponent(link.trim()))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export class Remote {
  // target: { kind: 'own' } oder { kind: 'shared', driveId, itemId, name }
  constructor(target) {
    this.target = target || { kind: 'own' };
  }

  // Basis-Adresse eines Pfads. Endet bei Pfaden auf ':' (dann folgt z. B. '/content'), beim Wurzelordner
  // eines geteilten Ordners auf der Item-ID.
  ref(path = '') {
    const t = this.target;
    if (t.kind === 'shared') {
      return path ? `${G}/drives/${t.driveId}/items/${t.itemId}:/${enc(path)}:` : `${G}/drives/${t.driveId}/items/${t.itemId}`;
    }
    const root = enc(CONFIG.rootFolder);
    return path ? `${G}/me/drive/root:/${root}/${enc(path)}:` : `${G}/me/drive/root:/${root}:`;
  }

  async me() {
    const res = await gfetch(`${G}/me?$select=displayName,userPrincipalName,mail`);
    if (!res.ok) throw await failFrom(res);
    const j = await res.json();
    return { name: j.displayName, username: j.userPrincipalName || j.mail };
  }

  // Dateien eines Ordners. Fehlender Ordner = leere Liste.
  async list(folder) {
    const sel = 'id,name,size,eTag,lastModifiedDateTime,webUrl,folder,file,@microsoft.graph.downloadUrl';
    let url = `${this.ref(folder)}/children?$select=${encodeURIComponent(sel)}&$top=200`;
    const out = [];
    while (url) {
      const res = await gfetch(url);
      if (res.status === 404) return [];
      if (!res.ok) throw await failFrom(res);
      const j = await res.json();
      for (const it of j.value) {
        out.push({
          id: it.id,
          name: it.name,
          size: it.size,
          eTag: it.eTag,
          modified: it.lastModifiedDateTime,
          webUrl: it.webUrl,
          folder: !!it.folder,
          downloadUrl: it['@microsoft.graph.downloadUrl'],
        });
      }
      url = j['@odata.nextLink'];
    }
    return out;
  }

  async getJSON(item) {
    // downloadUrl ist vorab autorisiert: kein Authorization-Header senden.
    let res = await fetch(item.downloadUrl);
    if (!res.ok) throw new HttpError(res.status, `Download fehlgeschlagen (${res.status})`);
    return res.json();
  }

  async putJSON(path, obj) {
    const res = await gfetch(`${this.ref(path)}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj),
    });
    if (!res.ok) throw await failFrom(res);
    const j = await res.json();
    return { eTag: j.eTag, id: j.id };
  }

  async putBlob(path, blob) {
    if (blob.size < SIMPLE_LIMIT) {
      const res = await gfetch(`${this.ref(path)}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
        body: blob,
      });
      if (!res.ok) throw await failFrom(res);
      return res.json();
    }
    const s = await gfetch(`${this.ref(path)}/createUploadSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
    });
    if (!s.ok) throw await failFrom(s);
    const { uploadUrl } = await s.json();
    let last;
    for (let off = 0; off < blob.size; off += CHUNK) {
      const end = Math.min(off + CHUNK, blob.size);
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${off}-${end - 1}/${blob.size}` },
        body: blob.slice(off, end),
      });
      if (![200, 201, 202].includes(res.status)) throw new HttpError(res.status, `Upload fehlgeschlagen (${res.status})`);
      last = res;
    }
    return last.json();
  }

  async getBlob(path) {
    const meta = await gfetch(`${this.ref(path)}?$select=${encodeURIComponent('@microsoft.graph.downloadUrl')}`);
    if (meta.status === 404) return null;
    if (!meta.ok) throw await failFrom(meta);
    const j = await meta.json();
    const url = j['@microsoft.graph.downloadUrl'];
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) throw new HttpError(res.status, `Download fehlgeschlagen (${res.status})`);
    return res.blob();
  }

  async delete(path) {
    const res = await gfetch(this.ref(path), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw await failFrom(res);
  }

  // Stellt sicher, dass der Hauptordner existiert (nur für den eigenen Ordner nötig).
  async ensureRoot() {
    await this.putJSON('meta/app.json', { app: 'bautagebuch', version: CONFIG.version, created: new Date().toISOString() });
  }

  // Freigabe-Link eines Ordners (von OneDrive "Teilen") in Laufwerk/Item-IDs auflösen.
  static async resolveShare(link) {
    const res = await gfetch(
      `${G}/shares/${toShareId(link)}/driveItem?$select=id,name,folder,parentReference,remoteItem`,
      { headers: { Prefer: 'redeemSharingLinkIfNecessary' } }
    );
    if (res.status === 404 || res.status === 403) {
      throw new HttpError(res.status, 'Auf diesen Link kann mit dem angemeldeten Konto nicht zugegriffen werden. Wurde der Ordner für genau dieses Konto freigegeben (mit Bearbeitungsrecht)?');
    }
    if (!res.ok) throw await failFrom(res);
    const j = await res.json();
    const item = j.remoteItem || j;
    if (!j.folder && !item.folder) throw new HttpError(400, 'Der Link zeigt auf eine Datei, nicht auf einen Ordner.');
    return {
      kind: 'shared',
      driveId: item.parentReference?.driveId || j.parentReference?.driveId,
      itemId: item.id || j.id,
      name: j.name,
    };
  }
}
