// Mehrere Fotos zu einem mehrseitigen PDF zusammenfassen (je Foto eine Seite, JPEG direkt eingebettet, keine Bibliothek nötig).
async function toJpeg(file, maxPx, quality) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch {
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); bmp = img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
  const s = Math.min(1, maxPx / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

export async function imagesToPdf(files, maxPx = 2000, quality = 0.82) {
  const pages = [];
  for (const f of files) pages.push(await toJpeg(f, maxPx, quality));
  const parts = [], offsets = [];
  let pos = 0;
  const add = (x) => { const u = typeof x === 'string' ? new TextEncoder().encode(x) : x; parts.push(u); pos += u.length; };
  const obj = (n, body) => { offsets[n] = pos; add(`${n} 0 obj\n`); body(); add('\nendobj\n'); };
  add('%PDF-1.4\n');
  const n = pages.length;
  obj(1, () => add('<</Type/Catalog/Pages 2 0 R>>'));
  obj(2, () => add(`<</Type/Pages/Count ${n}/Kids[${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}]>>`));
  pages.forEach((p, i) => {
    const k = Math.min(595 / p.w, 842 / p.h), W = (p.w * k).toFixed(2), H = (p.h * k).toFixed(2);
    const page = 3 + 3 * i, cont = page + 1, img = page + 2;
    obj(page, () => add(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${W} ${H}]/Resources<</XObject<</Im0 ${img} 0 R>>>>/Contents ${cont} 0 R>>`));
    const stream = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(cont, () => add(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`));
    obj(img, () => { add(`<</Type/XObject/Subtype/Image/Width ${p.w}/Height ${p.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${p.bytes.length}>>\nstream\n`); add(p.bytes); add('\nendstream'); });
  });
  const total = 3 + 3 * n, xref = pos;
  add(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) add(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  add(`trailer\n<</Size ${total}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
