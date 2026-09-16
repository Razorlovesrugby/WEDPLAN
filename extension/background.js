/**
 * The clipper's service worker.
 *
 * Three MV3 facts shape this whole file, and each one is a bug if forgotten:
 *
 *   1. This worker is killed aggressively. NOTHING may live in a module-level
 *      variable between events — state is chrome.storage.local, every time.
 *
 *   2. Context menus do not survive that. They are created on install AND on
 *      startup, and rebuilt whenever the board list changes. A menu that has
 *      vanished after the laptop slept is the single most likely bug here.
 *
 *   3. There is no DOM. Resizing an image needs a canvas, so it happens in an
 *      offscreen document (see offscreen.js), not here.
 *
 * A clip that cannot be sent is queued rather than lost. Hotel wifi, an
 * expired token, a sleeping server — the image the planner just right-clicked
 * must not evaporate, so failures go into chrome.storage.local, the badge
 * shows how many are waiting, and they are retried on the next clip and on
 * startup.
 */

const PARENT_ID = "wedplan-clip";
const DEFAULT_ITEM = "wedplan-clip-default";

async function state() {
  return chrome.storage.local.get({
    appOrigin: "",
    clipToken: "",
    boards: [],
    defaultBoardId: "",
    queue: [],
  });
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

async function buildMenus() {
  await chrome.contextMenus.removeAll();
  const { boards } = await state();

  chrome.contextMenus.create({
    id: PARENT_ID,
    title: "Send to moodboard",
    contexts: ["image"],
  });

  chrome.contextMenus.create({
    id: DEFAULT_ITEM,
    parentId: PARENT_ID,
    title: "Default board",
    contexts: ["image"],
  });

  for (const board of boards) {
    chrome.contextMenus.create({
      id: `board:${board.id}`,
      parentId: PARENT_ID,
      title: board.title,
      contexts: ["image"],
    });
  }

  if (boards.length === 0) {
    chrome.contextMenus.create({
      id: "wedplan-setup",
      parentId: PARENT_ID,
      title: "Set up the clipper first…",
      contexts: ["image"],
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void buildMenus();
});

// Menus do not survive the worker being torn down. This is not belt and
// braces; without it the extension silently stops working after a sleep.
chrome.runtime.onStartup.addListener(() => {
  void buildMenus();
  void flushQueue();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.boards) void buildMenus();
});

// ---------------------------------------------------------------------------
// Clipping
// ---------------------------------------------------------------------------

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "wedplan-setup") {
    void chrome.runtime.openOptionsPage();
    return;
  }
  const boardId =
    typeof info.menuItemId === "string" && info.menuItemId.startsWith("board:")
      ? info.menuItemId.slice("board:".length)
      : "";

  void clip(info, tab, boardId);
});

/**
 * On Pinterest the right-clicked <img> is usually the grid's thumbnail and
 * info.pageUrl is the feed, not the pin — so the content script gets asked
 * for something better first. Everywhere else, info is all there is.
 */
async function betterSource(info, tab) {
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "wedplan:describe", srcUrl: info.srcUrl });
  } catch {
    // No content script on this page. Expected, not an error.
    return null;
  }
}

async function clip(info, tab, boardId) {
  const { appOrigin, clipToken } = await state();
  if (!appOrigin || !clipToken) {
    notify("Set up the clipper", "Open its options and paste a clip token from Settings.");
    void chrome.runtime.openOptionsPage();
    return;
  }

  const better = await betterSource(info, tab);
  const payload = {
    imageUrl: better?.imageUrl || info.srcUrl,
    sourceUrl: better?.sourceUrl || info.pageUrl || "",
    title: better?.title || info.selectionText || tab?.title || "",
    boardId,
  };

  const sent = await send(payload, appOrigin, clipToken);
  if (sent.ok) {
    notify("Clipped", payload.title || "Added to your moodboard.");
    return;
  }

  if (sent.retryable) {
    await enqueue(payload);
    notify("Saved for later", "That clip will be retried when the connection is back.");
  } else {
    notify("Couldn't clip that", sent.error);
  }
}

/**
 * Preferred path: decode and downscale here, POST the two derivatives, and
 * the server never fetches anything. Fallback: POST the URL as JSON and let
 * the server fetch it through its hardened fetcher — which is the only
 * reason that module exists.
 */
async function send(payload, appOrigin, clipToken) {
  const endpoint = `${appOrigin.replace(/\/+$/, "")}/api/clip`;

  let derived = null;
  try {
    derived = await derive(payload.imageUrl);
  } catch {
    derived = null;
  }

  try {
    let response;
    if (derived) {
      const form = new FormData();
      form.set("boardId", payload.boardId ?? "");
      form.set("sourceUrl", payload.sourceUrl ?? "");
      form.set("title", payload.title ?? "");
      form.set("width", String(derived.width));
      form.set("height", String(derived.height));
      form.set("display", derived.display, "display.webp");
      form.set("thumb", derived.thumb, "thumb.webp");
      response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${clipToken}` },
        body: form,
      });
    } else {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${clipToken}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    if (response.ok) return { ok: true };

    const body = await response.json().catch(() => ({}));
    // 401 and 4xx are decisions, not outages: retrying will not change them.
    const retryable = response.status >= 500 || response.status === 429;
    return { ok: false, retryable, error: body.error || `The app said ${response.status}.` };
  } catch (error) {
    // Network. Worth retrying.
    return { ok: false, retryable: true, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Offscreen downscaling
// ---------------------------------------------------------------------------

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument?.();
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS"],
    justification: "Resize a clipped image before uploading it.",
  });
}

async function derive(imageUrl) {
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({ type: "wedplan:derive", imageUrl });
  if (!result?.ok) throw new Error(result?.error ?? "derive failed");
  return {
    display: await (await fetch(result.display)).blob(),
    thumb: await (await fetch(result.thumb)).blob(),
    width: result.width,
    height: result.height,
  };
}

// ---------------------------------------------------------------------------
// The retry queue
// ---------------------------------------------------------------------------

async function enqueue(payload) {
  const { queue } = await state();
  // Cap it: a queue that grows forever on a broken token is its own problem.
  const next = [...queue, { ...payload, at: Date.now() }].slice(-50);
  await chrome.storage.local.set({ queue: next });
  await badge(next.length);
}

async function flushQueue() {
  const { appOrigin, clipToken, queue } = await state();
  if (!appOrigin || !clipToken || queue.length === 0) return;

  const remaining = [];
  for (const payload of queue) {
    const sent = await send(payload, appOrigin, clipToken);
    if (!sent.ok && sent.retryable) remaining.push(payload);
  }
  await chrome.storage.local.set({ queue: remaining });
  await badge(remaining.length);
}

async function badge(count) {
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#b45309" });
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title,
    message: String(message ?? "").slice(0, 200),
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "wedplan:flush") {
    void flushQueue().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "wedplan:rebuild-menus") {
    void buildMenus().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
