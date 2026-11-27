/**
 * A venue's plan that arrives as a PDF (spec 57 B.2). The person picks a page,
 * which is drawn in the browser with pdf.js at 150 dpi (longest side at most
 * 6000 px) and then goes through the same image path as any other plan. The
 * PDF itself is never uploaded or kept. Client-only: pdf.js is imported on
 * demand so nobody else pays for it.
 */

export const PDF_DPI = 150;
export const PDF_MAX_SIDE_PX = 6000;

/** The scale to draw a page at: 150 dpi, shrunk if that would make its longest side more than 6000 px. PDF points are 1/72 inch. */
export function pdfScale(pageWidthPt: number, pageHeightPt: number): number {
  const wanted = PDF_DPI / 72;
  const longest = Math.max(pageWidthPt, pageHeightPt, 1) * wanted;
  return longest > PDF_MAX_SIDE_PX ? wanted * (PDF_MAX_SIDE_PX / longest) : wanted;
}

export type PdfPlan = {
  pages: number;
  /** Draws page `n` (1-based) at plan quality as a PNG. */
  render: (n: number) => Promise<{ blob: Blob; width: number; height: number }>;
  /** A small copy of page `n` to choose by. */
  preview: (n: number, maxSide: number) => Promise<string>;
  destroy: () => void;
};

export function isPdf(file: Pick<File, "type" | "name">): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export async function openPdfPlan(file: File): Promise<PdfPlan> {
  const pdfjs = await import("pdfjs-dist");
  // The worker is a file of its own; webpack gives it a URL.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;

  const draw = async (n: number, scaleFor: (w: number, h: number) => number) => {
    const page = await doc.getPage(Math.min(Math.max(1, Math.round(n)), doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: scaleFor(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't draw the PDF");
    // A plan on transparent paper would come out black once it is flattened.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  };

  return {
    pages: doc.numPages,
    render: async (n) => {
      const canvas = await draw(n, pdfScale);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Couldn't turn that page into an image");
      return { blob, width: canvas.width, height: canvas.height };
    },
    preview: async (n, maxSide) => (await draw(n, (w, h) => maxSide / Math.max(w, h, 1))).toDataURL("image/png"),
    destroy: () => void doc.destroy(),
  };
}
