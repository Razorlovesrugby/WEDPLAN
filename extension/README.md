# Moodboard clipper

A Chrome extension (Manifest V3) that right-clicks any image on the web into a
wedplan moodboard. Built to `docs/specs/09.1-pinterest-import-and-clipper.md`.

It lives in this repository rather than its own because it is versioned
against `/api/clip` in this app, and the two would drift apart immediately
anywhere else. It is not part of the Next.js build and is excluded from
`tsconfig.json`.

## Installing

There is no Chrome Web Store listing, and deliberately so: a store listing
means a review, a privacy policy and a public identity for a tool with two
users.

1. `chrome://extensions` → turn on **Developer mode**.
2. **Load unpacked** → choose this `extension/` folder.
3. In the app, go to **Settings → Clipper** and create a clip token. It is
   shown once; copy it.
4. Click the extension's icon, paste your site's address and the token, and
   press **Save & connect**. Chrome will ask for permission to talk to that
   one address — that is the only host permission this extension asks for, and
   it is requested at this point rather than up front so it can be scoped to
   your deployment.

Then right-click any image → **Send to moodboard** → pick a board.

## What it does

- **Any image, any site.** The right-click menu appears on images everywhere.
- **Better URLs on Pinterest.** A content script (Pinterest only) finds the
  pin's own page rather than the feed, and the largest image the page offers
  rather than the grid thumbnail — including the `/originals/` guess, checked
  before it is used, with a fallback when it 404s.
- **Resizes before uploading.** An offscreen document produces the same two
  WebP derivatives the app's own uploader does, so the server never processes
  pixels and usually never fetches anything. If it can't decode the image
  (no permission for that host, a format it doesn't know), it sends the URL
  instead and the server fetches it through `src/lib/net/fetch-image.ts`.
- **Never loses a clip.** A failed send is queued in `chrome.storage.local`,
  the badge shows how many are waiting, and they retry on the next clip, on
  browser startup, or from **Retry queued** in the options.
- **Animated GIFs stay animated** — passed through untouched, because drawing
  one to a canvas keeps the first frame and silently drops the rest.

## Permissions, and why each one

| Permission | Why |
| --- | --- |
| `contextMenus` | The right-click entry. |
| `storage` | The token, the board list and the retry queue. Nothing else. |
| `offscreen` | A canvas to resize with. MV3 service workers have no DOM. |
| `notifications` | Telling you a clip worked, failed, or was queued. |
| `https://*.pinterest.com/*` | The content script that finds better URLs. |
| `https://*.pinimg.com/*` | Fetching the full-size pin image to resize it. |
| `<all_urls>` *(optional)* | Never requested on install. Chrome asks for your app's address alone when you press Save; grant more only if you want images from other sites resized locally rather than fetched by the server. |

## Things that will bite whoever changes this

- **The service worker is killed constantly.** Nothing may live in a
  module-level variable between events. State is `chrome.storage.local`.
- **Context menus do not survive that.** They are rebuilt on `onInstalled`,
  on `onStartup`, and whenever the board list changes. Remove any of those
  three and the extension silently stops working after the laptop sleeps.
- **Blobs do not survive `chrome.runtime.sendMessage`.** The offscreen
  document returns data URLs, and the worker turns them back into blobs.
- **The sizes in `offscreen.js` duplicate `src/lib/moodboards.ts`.** There is
  no import across that boundary. Change one, change the other.

## Testing it by hand

There is no harness for an extension, so this is the pass:

- Clip from Pinterest, from Instagram, and from a plain blog.
- Clip a `data:` image — it should fail cleanly, not hang.
- Turn off wifi, clip, and confirm the badge shows `1`; turn it back on and
  press **Retry queued**.
- Revoke the token in Settings and clip — the notification should say so.
- **Sleep the laptop, wake it, and check the menu is still there.**
