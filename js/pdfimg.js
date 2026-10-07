// PDF → PNG (erste Seite). Nutzt pdf.js, das erst bei Bedarf aus dem Netz geladen wird (kein Teil der App-Dateien).
const V = '3.11.174';
const SRC = [
  [`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${V}/pdf.min.js`, `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${V}/pdf.worker.min.js`],
  [`https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/build/pdf.min.js`, `https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/build/pdf.worker.min.js`],
];
let loading = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    const t = setTimeout(() => { s.remove(); rej(new Error('Zeitüberschreitung')); }, 7000);
    s.onload = () => { clearTimeout(t); res(); };
    s.onerror = () => { clearTimeout(t); s.remove(); rej(new Error('Laden fehlgeschlagen')); };
    document.head.append(s);
  });
}
export function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!loading) {
    loading = (async () => {
      for (const [lib, worker] of SRC) {
        try {
          await loadScript(lib);
          if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker; return window.pdfjsLib; }
        } catch { /* nächste Quelle */ }
      }
      throw new Error('PDF-Modul konnte nicht geladen werden (offline?)');
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

// Erste Seite als PNG (längste Kante max. maxPx), weißer Hintergrund
export async function pdfToPng(blob, maxPx = 2000) {
  const lib = await loadPdfJs();
  const task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(4, maxPx / Math.max(v1.width, v1.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const png = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (!png) throw new Error('PNG-Erstellung fehlgeschlagen');
    return { blob: png, pages: pdf.numPages };
  } finally {
    pdf.destroy?.();
  }
}
