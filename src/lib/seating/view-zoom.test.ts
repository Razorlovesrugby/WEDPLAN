import { describe, expect, it } from "vitest";
import { FIT, MAX_K, MIN_K, clampPan, isZoomedIn, keyAction, panBy, percentOf, viewWheel, zoomAbout, zoomToPercent } from "./view-zoom";

describe("view-only zoom (spec 60 D.1)", () => {
  it("zooms about a point and keeps that point where it was", () => {
    const p = { x: 300, y: 200 };
    const z = zoomAbout(FIT, p, 2);
    expect(z.k).toBe(2);
    // The point of the picture under the pointer is the same before and after.
    expect((p.x - z.x) / z.k).toBeCloseTo((p.x - FIT.x) / FIT.k, 6);
    expect((p.y - z.y) / z.k).toBeCloseTo((p.y - FIT.y) / FIT.k, 6);
  });

  it("stays between 10% and 800%", () => {
    expect(zoomAbout(FIT, { x: 0, y: 0 }, 1000).k).toBe(MAX_K);
    expect(zoomAbout(FIT, { x: 0, y: 0 }, 0.0001).k).toBe(MIN_K);
    expect(percentOf(zoomAbout(FIT, { x: 0, y: 0 }, 1000))).toBe(800);
    expect(percentOf(zoomAbout(FIT, { x: 0, y: 0 }, 0.0001))).toBe(10);
  });

  it("ignores a nonsense factor", () => {
    expect(zoomAbout(FIT, { x: 0, y: 0 }, 0)).toBe(FIT);
    expect(zoomAbout(FIT, { x: 0, y: 0 }, NaN)).toBe(FIT);
  });

  it("goes to an exact percentage", () => {
    expect(zoomToPercent(zoomAbout(FIT, { x: 10, y: 10 }, 3), 100, { x: 50, y: 50 }).k).toBeCloseTo(1, 9);
    expect(percentOf(zoomToPercent(FIT, 250, { x: 0, y: 0 }))).toBe(250);
  });

  it("knows when it is zoomed in (so a drag pans, and the page scrolls otherwise)", () => {
    expect(isZoomedIn(FIT)).toBe(false);
    expect(isZoomedIn({ k: 1.0005, x: 0, y: 0 })).toBe(false);
    expect(isZoomedIn({ k: 1.5, x: 0, y: 0 })).toBe(true);
  });

  it("pans, and keeps some of the picture on screen", () => {
    const z = panBy({ k: 2, x: 0, y: 0 }, -50, 30);
    expect(z).toEqual({ k: 2, x: -50, y: 30 });
    const view = { w: 600, h: 400 };
    const content = { w: 600, h: 400 };
    // Dragged far off to the left: at least 48 px stays in view.
    const gone = clampPan({ k: 2, x: -99999, y: 0 }, view, content);
    expect(gone.x).toBe(48 - 1200);
    // Dragged far to the right and down.
    const far = clampPan({ k: 1, x: 99999, y: 99999 }, view, content);
    expect(far.x).toBe(600 - 48);
    expect(far.y).toBe(400 - 48);
    // Already in range: untouched.
    expect(clampPan({ k: 2, x: -100, y: -50 }, view, content)).toEqual({ k: 2, x: -100, y: -50 });
  });

  it("a plain scroll is not ours: the page scrolls", () => {
    expect(viewWheel({ deltaX: 0, deltaY: 120, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false })).toBeNull();
    expect(viewWheel({ deltaX: 0, deltaY: 4, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: true })).toBeNull();
  });

  it("a pinch or Ctrl/⌘ + scroll zooms: down zooms out, up zooms in, in proportion", () => {
    const up = viewWheel({ deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: true, metaKey: false, shiftKey: false })!;
    const down = viewWheel({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, metaKey: true, shiftKey: false })!;
    expect(up.factor).toBeGreaterThan(1);
    expect(down.factor).toBeLessThan(1);
    const tiny = viewWheel({ deltaX: 0, deltaY: -2, deltaMode: 0, ctrlKey: true, metaKey: false, shiftKey: false })!;
    expect(tiny.factor).toBeGreaterThan(1);
    expect(tiny.factor).toBeLessThan(up.factor);
  });

  it("reads + − 0 and Shift+1", () => {
    expect(keyAction({ key: "+", shiftKey: true })).toBe("in");
    expect(keyAction({ key: "=", shiftKey: false })).toBe("in");
    expect(keyAction({ key: "-", shiftKey: false })).toBe("out");
    expect(keyAction({ key: "0", shiftKey: false })).toBe("hundred");
    expect(keyAction({ key: "!", code: "Digit1", shiftKey: true })).toBe("fit");
    expect(keyAction({ key: "a", shiftKey: false })).toBeNull();
    // Browser shortcuts are not ours.
    expect(keyAction({ key: "0", shiftKey: false, metaKey: true })).toBeNull();
    expect(keyAction({ key: "-", shiftKey: false, ctrlKey: true })).toBeNull();
  });
});
