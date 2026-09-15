import "server-only";
import QRCode from "qrcode";

/**
 * QR codes for printed stationery.
 *
 * What the code encodes is the RSVP link, which is the household's only
 * credential — anyone holding it can answer for that household. That has two
 * consequences worth stating where the rendering happens:
 *
 *   These images are never cached by anything shared. The route that serves
 *   one sets no-store; the print sheet inlines them as data URIs so they do
 *   not travel as separately-addressable URLs at all.
 *
 *   They are only as private as the paper. That is the point — a card on a
 *   fridge is the intended threat model, the same as the printed link beside
 *   it — but it is why the codes are generated per invitation and reissuing
 *   an invitation invalidates the old one.
 *
 * Error correction is M (~15%). Printed at 30mm and up that survives the
 * handling a card in an envelope gets; H would tolerate more damage but makes
 * a visibly denser code, which at this size starts to fail on older phone
 * cameras — the more likely failure at a wedding with a broad guest list.
 */

const OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 1,
  // Quiet zone plus a size that stays sharp when a browser scales it down for
  // print. Smaller than this and the modules blur at 300dpi.
  width: 512,
  color: { dark: "#1c1917", light: "#ffffff" },
} as const;

/** A PNG, for a one-off download. */
export function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...OPTIONS, type: "png" });
}

/** A data URI, for embedding in a page that will be printed. */
export function qrDataUri(url: string): Promise<string> {
  return QRCode.toDataURL(url, { ...OPTIONS });
}

/** An SVG, for a stationer who wants something resolution-independent. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...OPTIONS, type: "svg" });
}
