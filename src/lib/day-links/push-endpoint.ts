/**
 * A web push endpoint is a URL the server will POST to, so it must be one of
 * the browser vendors' push services and nothing else (spec 54 §6.15): a link
 * holder must not be able to aim the server at an internal address.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge, Android
  "updates.push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari and home-screen web apps (web.push.apple.com)
  "notify.windows.com", // Windows (*.notify.windows.com)
];

export function isPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
