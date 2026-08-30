/**
 * Pure pdfjs page-render core, shared by the Finder thumbnail cache
 * (src/lib/finder/thumbnails.ts) and local-file previews (Ingest).
 */

const COVER_WIDTH = 320;

export async function renderPdfCover(
  data: ArrayBuffer,
  pageIndex = 0,
  width = COVER_WIDTH,
  bgColor = '#ffffff'
): Promise<Blob | null> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const doc = await pdfjs.getDocument({
    data,
    cMapPacked: true,
    cMapUrl: '/pdfjs/cmaps/',
    standardFontDataUrl: '/pdfjs/standard_fonts/',
  }).promise;

  try {
    if (pageIndex >= doc.numPages) return null;
    const page = await doc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    // PDF.js cancels outstanding worker/network work during teardown. Await
    // and absorb that expected cancellation so a thumbnail cleanup cannot
    // surface as an unhandled AbortError in the app.
    await doc.destroy().catch(() => undefined);
  }
}

/**
 * First-page preview of a local (not yet uploaded) PDF file.
 * Returns an object URL — the caller owns revocation.
 */
export async function renderLocalPdfCover(file: File, bgColor = '#ffffff'): Promise<string | null> {
  try {
    const blob = await renderPdfCover(await file.arrayBuffer(), 0, COVER_WIDTH, bgColor);
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}
