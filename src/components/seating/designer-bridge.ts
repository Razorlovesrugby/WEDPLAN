"use client";

/**
 * How ⌘K reaches the Room view (spec 59 A.6). The palette lives in the shell
 * and the Room view deep in the seating screen, so the Room view registers one
 * handler here while it is on screen and the palette runs commands through it.
 * With no Room view mounted there is no handler, and the palette offers none.
 */

type Handler = (id: string) => void;
let handler: Handler | null = null;

export function setDesignerHandler(next: Handler | null) {
  handler = next;
}

export function hasDesignerHandler(): boolean {
  return handler !== null;
}

export function runDesignerCommand(id: string): boolean {
  if (!handler) return false;
  handler(id);
  return true;
}
