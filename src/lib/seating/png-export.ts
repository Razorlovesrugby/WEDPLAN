/**
 * The shown space as a PNG at 1×, 2× or 4× (spec 57 Part E). Drawn from the
 * canvas's own SVG, in the browser: no server, no screenshot. The venue's
 * plan image is left out, because a picture from another address would stop
 * the browser from saving the result; the walls, furniture, décor and chairs
 * are all vector and come through.
 */

export const PNG_SCALES = [1, 2, 4] as const;
export type PngScale = (typeof PNG_SCALES)[number];

/** The most pixels a side may have: past this some browsers refuse to make the picture. */
export const PNG_MAX_SIDE = 8192;

/**
 * The size to draw: the plan's own box at `scale` pixels for every 2 cm, so
 * 1× is a screen-sized picture (a 22 m box is 1100 px), 2× is for a document
 * and 4× for a print. Held under `PNG_MAX_SIDE`, keeping its shape.
 */
export function pngSize(viewBox: { w: number; h: number }, scale: PngScale): { width: number; height: number; capped: boolean } {
  let width = (viewBox.w / 2) * scale;
  let height = (viewBox.h / 2) * scale;
  const side = Math.max(width, height);
  const capped = side > PNG_MAX_SIDE;
  if (capped) {
    const k = PNG_MAX_SIDE / side;
    width *= k;
    height *= k;
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), capped };
}

/** "Seating - Hall.png" without anything a file name dislikes. */
export function pngFileName(eventName: string, spaceName: string): string {
  const clean = (s: string) => s.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 40);
  return `${[clean(eventName), clean(spaceName)].filter(Boolean).join(" - ") || "Seating plan"}.png`;
}

export async function downloadSvgAsPng(svg: SVGSVGElement, scale: PngScale, fileName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const vb = svg.viewBox.baseVal;
  if (!vb || vb.width === 0 || vb.height === 0) return { ok: false, error: "There's no plan to save." };
  const { width, height } = pngSize({ w: vb.width, h: vb.height }, scale);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll("image").forEach((n) => n.remove());
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  // Paint the paper white: a transparent PNG goes black on some viewers.
  const paper = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  paper.setAttribute("x", String(vb.x));
  paper.setAttribute("y", String(vb.y));
  paper.setAttribute("width", String(vb.width));
  paper.setAttribute("height", String(vb.height));
  paper.setAttribute("fill", "#ffffff");
  copy.insertBefore(paper, copy.firstChild);

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("load"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "This browser can't make the picture." };
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return { ok: false, error: "This browser couldn't save the picture. Try 1× or 2×." };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't draw the plan as a picture." };
  } finally {
    URL.revokeObjectURL(url);
  }
}
