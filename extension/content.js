/**
 * Pinterest only.
 *
 * Right-clicking a pin gives the background worker two disappointing things:
 * info.srcUrl is whatever size the grid happened to render (often a small
 * thumbnail), and info.pageUrl is the feed rather than the pin. This script
 * does better with what the page already knows.
 *
 * Everything here is a heuristic WITH A FALLBACK. A clip must never fail
 * because an optimistic guess about a URL did not exist.
 */

let lastTarget = null;

document.addEventListener(
  "contextmenu",
  (event) => {
    lastTarget = event.target instanceof Element ? event.target : null;
  },
  true,
);

/** The largest candidate the page itself offers, straight out of srcset. */
function fromSrcset(img) {
  const srcset = img?.getAttribute("srcset");
  if (!srcset) return null;

  let best = null;
  let bestWidth = -1;
  for (const candidate of srcset.split(",")) {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    if (!url) continue;
    const width = descriptor?.endsWith("x")
      ? parseFloat(descriptor) * 1000 // density descriptors: bigger is better
      : parseInt(descriptor ?? "0", 10);
    if (width > bestWidth) {
      bestWidth = width;
      best = url;
    }
  }
  return best;
}

/**
 * i.pinimg.com URLs carry their size as a path segment (/236x/, /474x/,
 * /736x/), and /originals/ usually holds the full-size file. "Usually" is
 * why this is offered as a candidate rather than used as the answer.
 */
function originalsGuess(url) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)pinimg\.com$/i.test(parsed.hostname)) return null;
    const guess = parsed.pathname.replace(/\/\d+x\d*\//, "/originals/");
    if (guess === parsed.pathname) return null;
    parsed.pathname = guess;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** HEAD, so a 404 costs nothing. A failure here just means "use the fallback". */
async function exists(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

function pinLink(element) {
  const anchor = element?.closest?.("[data-test-id='pin'], [data-test-pin-id]")?.querySelector?.("a[href*='/pin/']")
    ?? element?.closest?.("a[href*='/pin/']");
  const href = anchor?.getAttribute("href");
  if (!href) return null;
  try {
    return new URL(href, location.origin).toString();
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "wedplan:describe") return false;

  (async () => {
    const img =
      lastTarget instanceof HTMLImageElement
        ? lastTarget
        : lastTarget?.querySelector?.("img") ?? null;

    const candidates = [];
    const guess = originalsGuess(message.srcUrl);
    if (guess) candidates.push(guess);
    const srcset = fromSrcset(img);
    if (srcset) candidates.push(srcset);
    candidates.push(message.srcUrl);

    let imageUrl = message.srcUrl;
    for (const candidate of candidates) {
      // The first candidate that actually exists wins; the last one always
      // does, because it is what the browser already loaded.
      if (candidate === message.srcUrl || (await exists(candidate))) {
        imageUrl = candidate;
        break;
      }
    }

    sendResponse({
      imageUrl,
      sourceUrl: pinLink(lastTarget) ?? location.href,
      title: img?.getAttribute("alt") ?? document.title ?? "",
    });
  })();

  return true;
});
