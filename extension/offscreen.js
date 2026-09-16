/**
 * The canvas the service worker does not have.
 *
 * MV3 service workers have no DOM, so resizing happens here, in an offscreen
 * document. Producing the two derivatives in the browser is what keeps image
 * processing off the server entirely — no sharp, no transform pipeline, no
 * paid image-transformation add-on.
 *
 * Sizes and quality deliberately match src/lib/moodboards.ts. If those change,
 * change them here too; there is no import across that boundary.
 */

const DISPLAY_MAX_EDGE = 2000;
const THUMB_MAX_EDGE = 480;
const DISPLAY_QUALITY = 0.82;
const THUMB_QUALITY = 0.7;

function target(width, height, maxEdge) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

async function toDataUrl(bitmap, maxEdge, quality) {
  const size = target(bitmap.width, bitmap.height, maxEdge);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  const blob = await canvas.convertToBlob({ type: "image/webp", quality });

  // Blobs do not survive chrome.runtime.sendMessage, so they cross as data
  // URLs and the worker turns them back into blobs.
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "wedplan:derive") return false;

  (async () => {
    try {
      // Cross-origin without host permission fails here, and that is fine:
      // the worker falls back to letting the server fetch the URL instead.
      const response = await fetch(message.imageUrl);
      if (!response.ok) throw new Error(`fetch ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("not an image");

      // An animated GIF loses its animation the moment it is drawn to a
      // canvas, so it is passed through untouched — same exception the app
      // makes, and the reason GIFs have a smaller size cap.
      if (blob.type === "image/gif") {
        const bitmap = await createImageBitmap(blob);
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        sendResponse({ ok: true, display: dataUrl, thumb: dataUrl, width: bitmap.width, height: bitmap.height });
        return;
      }

      const bitmap = await createImageBitmap(blob);
      const [display, thumb] = await Promise.all([
        toDataUrl(bitmap, DISPLAY_MAX_EDGE, DISPLAY_QUALITY),
        toDataUrl(bitmap, THUMB_MAX_EDGE, THUMB_QUALITY),
      ]);
      sendResponse({ ok: true, display, thumb, width: bitmap.width, height: bitmap.height });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  })();

  return true;
});
