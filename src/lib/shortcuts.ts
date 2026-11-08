/**
 * The keyboard shortcuts (spec 46). Pure: which action a key press means, so
 * "never while typing" is tested in one place. ⌘ on a Mac or iPad keyboard,
 * Ctrl elsewhere.
 */

export type ShortcutAction = "palette" | "settings" | "sidebar" | "help";

export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "⌘K", label: "Search, go to, or make something" },
  { keys: "⌘,", label: "Settings" },
  { keys: "⌘⇧S", label: "Show or hide the sidebar" },
  { keys: "Esc", label: "Close the search, side panel or a sheet" },
  { keys: "?", label: "Show these shortcuts" },
];

export type KeyLike = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/** True when focus is somewhere a person types: a plain key there is text, not a command. */
export function isTypingTarget(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes((target.tagName ?? "").toUpperCase());
}

export function shortcutFor(event: KeyLike, typing: boolean): ShortcutAction | null {
  const command = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  // ⌘K works everywhere, even in a field: it's how you leave one to search.
  if (command && !event.altKey && !event.shiftKey && key === "k") return "palette";
  if (command && !event.altKey && !event.shiftKey && key === ",") return "settings";
  if (command && event.shiftKey && !event.altKey && key === "s") return "sidebar";
  // A bare "?" is text in a field; only outside one does it open the list.
  if (!typing && !command && !event.altKey && event.key === "?") return "help";
  return null;
}
