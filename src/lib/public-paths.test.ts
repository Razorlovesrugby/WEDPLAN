import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it("lets a household reach its RSVP page", () => {
    expect(isPublicPath("/rsvp/abc123")).toBe(true);
  });

  /**
   * The regression this file exists for. /m was added with the moodboards
   * feature and NOT added here, so every share link bounced the recipient to
   * a login screen — which looks exactly like a broken link.
   */
  it("lets a photographer open a share link", () => {
    expect(isPublicPath("/m")).toBe(true);
    expect(isPublicPath("/m/aVeryLongBase64UrlTokenGoesHere")).toBe(true);
  });

  /** Same bug, same commit: the extension's POST would have followed a redirect to HTML. */
  it("lets the Chrome extension reach the clip endpoint", () => {
    expect(isPublicPath("/api/clip")).toBe(true);
    expect(isPublicPath("/api/clip/boards")).toBe(true);
  });

  it("lets the cron sender and the health check through", () => {
    expect(isPublicPath("/api/cron/reminders")).toBe(true);
    expect(isPublicPath("/api/health")).toBe(true);
  });

  it("keeps the public site, the privacy notice and the auth pages open", () => {
    for (const path of [
      "/w",
      "/w/alex-sam",
      "/api/public/events/11111111-1111-4111-8111-111111111111/ics",
      "/w/anything",
      "/privacy",
      "/login",
      "/forgot-password",
      "/auth/callback",
    ]) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it("keeps every planner screen behind a session", () => {
    for (const path of [
      "/",
      "/guests",
      "/guests/rank",
      "/moodboards",
      "/moodboards/abc",
      "/moodboards/abc/import",
      "/budget",
      "/settings",
      "/api/export/guests",
      "/api/proxy-image",
      "/api/pinterest/callback",
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  /**
   * Whole segments only. A substring match would make "/weddings" public
   * because "/w" is, and "/mood" public because "/m" is — which is exactly
   * how a planner route leaks.
   */
  it("matches whole segments, never prefixes of a word", () => {
    for (const path of ["/weddings", "/moodboards", "/logins", "/rsvps", "/authenticate"]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });
});
