"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  GROUP_LABEL,
  goCommands,
  makeCommands,
  rankCommands,
  type Command,
} from "@/lib/command-palette";
import type { Viewer } from "@/lib/nav-groups";
import { SHORTCUTS } from "@/lib/shortcuts";
import { searchPalette } from "@/server/actions/search";
import { quickAddItem } from "@/server/actions/lists";
import { createVendor } from "@/server/actions/vendors";
import { createMoodboard } from "@/server/actions/moodboards";

/** Opened by ⌘K (ShellFrame) or the header's Search button; both send this event. */
export const OPEN_PALETTE_EVENT = "wedplan:palette";
export const OPEN_SHORTCUTS_EVENT = "wedplan:shortcuts";

export function openPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

/** The header's Search button, so ⌘K's search works by touch on an iPad or phone. */
export function PaletteButton() {
  return (
    <button
      type="button"
      onClick={openPalette}
      className="rounded px-2 py-1 text-xs text-muted hover:bg-line/50 hover:text-ink"
      aria-label="Search, go to, or make something (⌘K)"
    >
      Search <kbd className="ml-1 hidden rounded border border-line px-1 font-sans text-[10px] sm:inline">⌘K</kbd>
    </button>
  );
}

/**
 * ⌘K (spec 46): one box to go anywhere, find anything by name, or make
 * something. Hand-built rather than a library: a text box and a list, with
 * the list's active row announced through `aria-activedescendant` so focus
 * never leaves the box.
 */
export function CommandPalette({ viewer }: { viewer: Viewer }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Command[]>([]);
  const [lists, setLists] = useState<{ id: string; title: string }[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onOpen = () => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setFound([]);
      setMessage(null);
      setActiveIndex(0);
      setHelp(false);
      setOpen(true);
    };
    const onHelp = () => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setOpen(false);
      setHelp(true);
    };
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, onHelp);
    return () => {
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, onHelp);
    };
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // Ask the server as you type, a moment after you stop. Lists come back with
  // every answer, for "Add … to <list>".
  useEffect(() => {
    if (!open) return;
    const text = query;
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchPalette(text);
        if (result.ok) {
          setFound(result.data.found);
          setLists(result.data.lists);
        }
      } catch {
        // Go to and Make still work without the server's answer.
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const sections = useMemo(
    () => rankCommands([...goCommands(viewer), ...found, ...makeCommands(viewer, query, lists)], query),
    [viewer, found, query, lists],
  );
  const flat = sections.flatMap((section) => section.commands);
  const active = flat[Math.min(activeIndex, flat.length - 1)];

  function close() {
    setOpen(false);
    setHelp(false);
    returnFocus.current?.focus?.();
  }

  function run(command: Command | undefined) {
    if (!command) return;
    if (command.href) {
      close();
      router.push(command.href);
      return;
    }
    const action = command.action;
    if (!action) return;
    startTransition(async () => {
      if (action.kind === "add-task") {
        const result = await quickAddItem(action.listId, null, action.title);
        if (!result.ok) return setMessage(result.error);
        close();
        router.push(`/lists/${action.listId}?highlight=${result.data.id}`);
      } else if (action.kind === "add-vendor") {
        const result = await createVendor({ name: action.name });
        if (!result.ok) return setMessage(result.error);
        close();
        router.push(`/vendors?inspect=vendor:${result.data.id}`);
      } else {
        const result = await createMoodboard({ title: action.title });
        if (!result.ok) return setMessage(result.error);
        close();
        router.push(`/moodboards/${result.data.id}`);
      }
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      // Stop here, so the side panel's own Esc doesn't close it as well.
      event.stopPropagation();
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(active);
    } else if (event.key === "Tab") {
      // Focus stays in the box; the list is chosen with the arrows.
      event.preventDefault();
    }
  }

  if (help) {
    return (
      <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/30 p-4 pt-[15vh]" onClick={close}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          className="card w-full max-w-md space-y-3 p-4"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="flex items-center justify-between">
            <h2 id="shortcuts-title" className="font-medium">
              Keyboard shortcuts
            </h2>
            <button type="button" className="btn" onClick={close} autoFocus>
              Done
            </button>
          </div>
          <dl className="divide-y divide-line text-sm">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center justify-between gap-4 py-2">
                <dt>{shortcut.label}</dt>
                <dd>
                  <kbd className="rounded border border-line px-1.5 py-0.5 font-sans text-xs">{shortcut.keys}</kbd>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">On Windows, use Ctrl for ⌘.</p>
        </div>
      </div>
    );
  }

  if (!open) return null;

  let optionIndex = -1;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/30 p-4 pt-[12vh]" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="card w-full max-w-xl overflow-hidden shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={input}
          id="command-palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={active ? `command-${active.id}` : undefined}
          aria-autocomplete="list"
          placeholder="Go to, find, or make something…"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-base outline-none"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setMessage(null);
          }}
        />
        <div id="command-palette-list" role="listbox" aria-label="Results" className="max-h-[55vh] overflow-y-auto py-1">
          {sections.length === 0 ? <p className="px-4 py-3 text-sm text-muted">Nothing matches.</p> : null}
          {sections.map((section) => (
            <div key={section.group} role="group" aria-labelledby={`command-group-${section.group}`}>
              <p id={`command-group-${section.group}`} className="px-4 pb-1 pt-2 text-xs font-medium text-muted">
                {GROUP_LABEL[section.group]}
              </p>
              {section.commands.map((command) => {
                optionIndex += 1;
                const index = optionIndex;
                const selected = command === active;
                return (
                  <div
                    key={command.id}
                    id={`command-${command.id}`}
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => run(command)}
                    className={`flex cursor-pointer items-baseline justify-between gap-3 px-4 py-2 text-sm ${
                      selected ? "bg-line/60" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate">{command.label}</span>
                    {command.hint ? <span className="shrink-0 text-xs text-muted">{command.hint}</span> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-xs text-muted">
          <span role="status">{pending ? "Working…" : (message ?? "↑↓ to move · Enter to open · Esc to close")}</span>
          <button
            type="button"
            className="underline"
            onClick={() => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))}
          >
            Shortcuts
          </button>
        </div>
      </div>
    </div>
  );
}
