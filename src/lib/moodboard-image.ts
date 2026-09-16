/**
 * Turning a File into the two derivatives a moodboard item stores.
 *
 * Browser only — it needs `Image`, `canvas` and `createObjectURL`. It is
 * deliberately thin and deliberately untested: every decision it makes about
 * sizes, quality and accepted types comes from src/lib/moodboards.ts, which
 * is pure and is tested. What is left here is the part that can only be
 * verified by running it in a real browser with a real photograph.
 *
 * Why this is in the browser at all: the bytes never pass through a server
 * action. next.config.mjs caps action payloads at 4MB on purpose, and routing
 * photographs through one would mean raising that ceiling for every action in
 * the app. The browser that has the file also has a canvas.
 */

import {
  DISPLAY_MAX_EDGE,
  DISPLAY_QUALITY,
  THUMB_MAX_EDGE,
  THUMB_QUALITY,
  downscaleTarget,
} from "./moodboards";

export type Derivatives = {
  display: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** What the display copy actually is — WebP, except a GIF passed through. */
  contentType: string;
};

/** Decoding can fail for a format this browser does not know. HEIC, mostly. */
export class DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecodeError";
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      // The message matters: this is what an iPhone HEIC hits in Chrome, and
      // "couldn't upload" would send somebody hunting in the wrong place.
      reject(
        new DecodeError(
          "This browser can't read that image. If it came from an iPhone it's probably HEIC — convert it to JPEG first.",
        ),
      );
    };
    image.src = url;
  });
}

function draw(image: HTMLImageElement, maxEdge: number, quality: number): Promise<Blob> {
  const { width, height } = downscaleTarget(image.naturalWidth, image.naturalHeight, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new DecodeError("This browser wouldn't give us a canvas to resize with.");
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // A tainted canvas throws on toBlob; a browser that cannot encode
        // WebP hands back null. Both arrive here.
        if (blob) resolve(blob);
        else reject(new DecodeError("This browser couldn't re-encode that image."));
      },
      "image/webp",
      quality,
    );
  });
}

/**
 * A display copy and a thumbnail, both WebP — except an animated GIF, which
 * is passed through untouched because drawing one to a canvas keeps the first
 * frame and silently discards the animation. Its "thumbnail" is the same
 * file; the grid loads it at CSS size. That is a deliberate exception to the
 * two-derivatives rule and the reason GIFs have their own, lower size cap.
 */
export async function deriveImages(file: File): Promise<Derivatives> {
  const image = await loadImage(file);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) throw new DecodeError("That image has no dimensions this can read.");

  if (file.type === "image/gif") {
    return { display: file, thumb: file, width, height, contentType: "image/gif" };
  }

  const [display, thumb] = await Promise.all([
    draw(image, DISPLAY_MAX_EDGE, DISPLAY_QUALITY),
    draw(image, THUMB_MAX_EDGE, THUMB_QUALITY),
  ]);

  return { display, thumb, width, height, contentType: "image/webp" };
}
