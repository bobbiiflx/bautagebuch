// Vollsicherung als ZIP (ohne Kompression, Fotos sind ohnehin komprimiert): daten.json + dateien/…
// Wiederherstellung liest eigene ZIPs sowie die reine JSON-Sicherung.
import * as Store from './store.js';

const te = new TextEncoder();
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
async function crc32(blob) {
  let c = 0xffffffff;
  const buf = new Uint8Array(await blob.arrayBuffer());
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const u16 = (n) => new Uint8Array([n & 255, (n >> 8) & 255]);
const u32 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);

async function zip(files /* [{name, blob}] */) {
  const parts = [], central = [];
  let off = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const name = te.encode(f.name), crc = await crc32(f.blob), size = f.blob.size;
    const head = [u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc), u32(size), u32(size), u16(name.length), u16(0), name];
    parts.push(...head, f.blob);
    central.push([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), name]);
    off += 30 + name.length + size;
  }
  const cdStart = off;
  let cdSize = 0;
  for (const c of central) { parts.push(...c); cdSize += c.reduce((n, x) => n + x.length, 0); }
  parts.push(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(cdStart), u16(0));
  return new Blob(parts, { type: 'application/zip' });
}

async function unzip(file) {
  const tail = await file.slice(Math.max(0, file.size - 66000)).arrayBuffer();
  const tv = new DataView(tail);
  let e = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (tv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Das ist keine gültige ZIP-Datei.');
  const count = tv.getUint16(e + 10, true), cdSize = tv.getUint32(e + 12, true), cdOff = tv.getUint32(e + 16, true);
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  const out = new Map();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP-Verzeichnis beschädigt.');
    const method = cd.getUint16(p + 10, true), csize = cd.getUint32(p + 20, true);
    const nl = cd.getUint16(p + 28, true), el = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), lho = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl));
    p += 46 + nl + el + cl;
    if (name.endsWith('/')) continue;
    const lh = new DataView(await file.slice(lho, lho + 30).arrayBuffer());
    const start = lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    let blob = file.slice(start, start + csize);
    if (method === 8) blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    else if (method !== 0) throw new Error('Nicht unterstütztes ZIP-Format.');
    out.set(name, blob);
  }
  return out;
}

// → Blob (ZIP). onProgress(erledigt, gesamt)
export async function makeBackup(onProgress) {
  const paths = Store.referencedBlobs();
  const files = [{ name: 'daten.json', blob: new Blob([JSON.stringify(Store.exportAll(), null, 2)], { type: 'application/json' }) }];
  let missing = 0;
  for (const [i, path] of paths.entries()) {
    onProgress?.(i, paths.length);
    const blob = await Store.getBlobData(path);
    if (blob) files.push({ name: 'dateien/' + path, blob }); else missing++;
  }
  return { blob: await zip(files), files: paths.length - missing, missing };
}

// → { data, blobs } aus ZIP oder JSON
export async function readBackup(file) {
  const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip';
  if (!isZip) {
    const j = JSON.parse(await file.text());
    if (j?.app !== 'bautagebuch' || !j.data) throw new Error('Das ist keine Sicherung dieser App.');
    return { data: j.data, blobs: new Map() };
  }
  const entries = await unzip(file);
  const dj = entries.get('daten.json');
  if (!dj) throw new Error('In der ZIP-Datei fehlt daten.json – ist es eine Sicherung dieser App?');
  const j = JSON.parse(await dj.text());
  if (j?.app !== 'bautagebuch' || !j.data) throw new Error('Das ist keine Sicherung dieser App.');
  const blobs = new Map();
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf', json: 'application/json', txt: 'text/plain', svg: 'image/svg+xml' };
  for (const [name, blob] of entries) if (name.startsWith('dateien/')) blobs.set(name.slice(8), new Blob([blob], { type: MIME[name.split('.').pop().toLowerCase()] || 'application/octet-stream' }));
  return { data: j.data, blobs };
}
