"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setRoomLock } from "@/server/actions/seating-layouts";
import { isTypingTarget } from "@/lib/shortcuts";
import type { SeatingDayActivity, SeatingSnapshotSummary, ShareLinkSummary } from "@/server/queries/seating";
import { RAIL_PANELS, useRail, type RailPanel } from "./canvas-prefs";
import { DayActivityPanel } from "./day-activity-panel";
import { DeclinedSeats } from "./declined-seats";
import { ExportDialog } from "./export-dialog";
import { FoodPanel } from "./food-panel";
import { LayoutTabs } from "./layout-tabs";
import { LibraryPanel } from "./library-panel";
import { PrintMenu } from "./print-menu";
import { RulesPanel } from "./rules-panel";
import { SettingsPanel } from "./settings-panel";
import { useSeating } from "./seating-state";
import { ShareDialog } from "./share-dialog";
import { RevealPanel, SnapshotsPanel } from "./snapshots-panel";
import { SpaceTabs } from "./space-tabs";
import { StylesPanel } from "./styles-panel";
import { SummaryBar } from "./summary-bar";
import { Tray } from "./tray";
import { VenuePanel } from "./venue-panel";
import { RoomSettings } from "./room-view";

type Collaborators = { user_id: string; display_name: string | null; role: string }[];

/**
 * Focus mode (spec 59 A.1 and A.2): the Room view takes the whole browser
 * window. A thin top bar, a 48 px rail of icons that each open a 320 px panel
 * (over the plan's edge, or pinned beside it), and the plan filling the rest;
 * the inspector docks on the plan's right. `\` hides every panel. Nothing here
 * scrolls but the panels.
 */
export function FocusShell({
  eventName,
  timeZone,
  shareLinks,
  snapshots,
  dayActivity,
  collaborators,
  canEdit,
  printHref,
  unseated,
  onLeave,
  children,
}: {
  eventName: string;
  timeZone: string;
  shareLinks: ShareLinkSummary[];
  snapshots: SeatingSnapshotSummary[];
  dayActivity: SeatingDayActivity[];
  collaborators: Collaborators;
  canEdit: boolean;
  printHref: (view: string) => string;
  unseated: number;
  onLeave: () => void;
  children: ReactNode;
}) {
  const { eventId, error, setError, held, hold } = useSeating();
  const [rail, setRail] = useRail();

  // Nothing scrolls but the panels: the page behind stays where it is.
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = was;
    };
  }, []);

  // `\` (or ⌘/Ctrl + .) hides the rail, inspector and tools so only the plan and the zoom remain; again brings them back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      const command = e.metaKey || e.ctrlKey;
      if ((e.key === "\\" && !command && !e.altKey) || (command && e.key === ".")) {
        e.preventDefault();
        setRail({ hidden: !rail.hidden });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rail.hidden, setRail]);

  const open = (id: RailPanel) => setRail({ panel: rail.panel === id ? null : id });
  const panelOpen = !rail.hidden && rail.panel !== null;
  const panel = panelOpen ? (
    <PanelHost
      id={rail.panel!}
      pinned={rail.pinned}
      onPin={() => setRail({ pinned: !rail.pinned })}
      onClose={() => setRail({ panel: null })}
      canEdit={canEdit}
      snapshots={snapshots}
      dayActivity={dayActivity}
      collaborators={collaborators}
    />
  ) : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-paper" role="region" aria-label="Seating plan, full window">
      <TopBar eventName={eventName} timeZone={timeZone} shareLinks={shareLinks} collaborators={collaborators} printHref={printHref} unseated={unseated} onLeave={onLeave} hidden={rail.hidden} onShow={() => setRail({ hidden: false })} />
      <div className="relative flex min-h-0 flex-1">
        {!rail.hidden ? (
          <nav aria-label="Panels" className="flex w-12 shrink-0 flex-col items-stretch gap-0.5 overflow-y-auto border-r border-line bg-white py-1">
            {RAIL_PANELS.filter((p) => canEdit || p.id !== "library").map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={rail.panel === p.id}
                aria-label={p.label}
                title={p.label}
                className={`mx-0.5 rounded px-0.5 py-2 text-center text-[0.62rem] leading-tight ${rail.panel === p.id ? "bg-ink text-white" : "text-muted hover:bg-line/50 hover:text-ink"}`}
                onClick={() => open(p.id)}
              >
                {p.label}
              </button>
            ))}
          </nav>
        ) : null}
        {panel && rail.pinned ? panel : null}
        <main className="relative min-w-0 flex-1">
          {error || held ? (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex flex-col items-center gap-1.5 px-3">
              {error ? (
                <p role="alert" className="pointer-events-auto flex max-w-xl items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 shadow">
                  <span className="flex-1">{error}</span>
                  <button type="button" className="underline" onClick={() => setError(null)}>
                    Dismiss
                  </button>
                </p>
              ) : null}
              {held ? (
                <div className="pointer-events-auto flex items-center gap-2 rounded border border-ink bg-ink px-3 py-2 text-sm text-white shadow">
                  <span>
                    Holding <strong>{held.label}</strong> — tap a table or chair to seat them.
                  </span>
                  <button type="button" className="underline" onClick={() => hold(null)}>
                    Put down
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {children}
        </main>
        {panel && !rail.pinned ? <div className="absolute inset-y-0 left-12 z-30 flex">{panel}</div> : null}
      </div>
      <span className="sr-only">Event {eventId}</span>
    </div>
  );
}

/** The 44 px bar: back, the event, the layout and room, undo, whether it's saved, then the things you do with the finished plan. */
function TopBar({
  eventName,
  timeZone,
  shareLinks,
  collaborators,
  printHref,
  unseated,
  onLeave,
  hidden,
  onShow,
}: {
  eventName: string;
  timeZone: string;
  shareLinks: ShareLinkSummary[];
  collaborators: Collaborators;
  printHref: (view: string) => string;
  unseated: number;
  onLeave: () => void;
  hidden: boolean;
  onShow: () => void;
}) {
  const { eventId, data, undo, redo, canUndo, canRedo, undoLabel, redoLabel, saving, setError } = useSeating();
  const router = useRouter();
  const [lockPending, startTransition] = useTransition();
  const current = data.layouts.find((l) => l.id === data.layoutId) ?? null;
  const space = data.spaces.find((s) => s.id === data.spaceId) ?? data.spaces[0] ?? null;
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-white px-2 text-sm">
      <button type="button" className="btn py-1" onClick={onLeave} title="Back to the seating page (Esc)">
        ← Seating
      </button>
      <strong className="hidden max-w-[12rem] truncate md:inline" title={eventName}>
        {eventName}
      </strong>
      <Popover label={`${current?.name ?? "Layout"}${current && !current.isLive ? " (draft)" : ""}${current?.lockedAt ? " 🔒" : ""}`} title="Layouts: the live one, and drafts to try">
        <LayoutTabs collaborators={collaborators} timeZone={timeZone} />
      </Popover>
      {data.spaces.length > 0 ? (
        <Popover label={space?.name ?? "Room"} title="Rooms of this layout">
          <SpaceTabs editable />
        </Popover>
      ) : null}
      <div className="ml-1 flex items-center gap-1">
        <button type="button" className="btn py-1" disabled={!canUndo} onClick={undo} title="Undo (Ctrl or ⌘ Z)" aria-label="Undo">
          ↶
        </button>
        <button type="button" className="btn py-1" disabled={!canRedo} onClick={redo} title="Redo (Shift Ctrl or ⌘ Z)" aria-label="Redo">
          ↷
        </button>
        <span className="hidden max-w-[14rem] truncate text-xs text-muted lg:inline" aria-live="polite">
          {saving ? "Saving…" : undoLabel ?? (redoLabel ? `Undone: ${redoLabel}` : "All changes saved")}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {hidden ? (
          <button type="button" className="btn py-1" onClick={onShow} title="Bring the panels back (\)">
            Show panels
          </button>
        ) : null}
        {current ? (
          <button
            type="button"
            className="btn py-1"
            disabled={lockPending}
            aria-pressed={Boolean(current.lockedAt)}
            title={current.lockedAt ? "Unlock the room so walls, furniture and décor can move again" : "Hold the walls, furniture and décor still. Seating carries on."}
            onClick={() =>
              startTransition(async () => {
                const r = await setRoomLock(eventId, current.id, !current.lockedAt);
                if (!r.ok) setError(r.error ?? "That didn't work");
                router.refresh();
              })
            }
          >
            {current.lockedAt ? "🔒 Unlock room" : "Lock room"}
          </button>
        ) : null}
        <ShareDialog links={shareLinks} timeZone={timeZone} />
        <ExportDialog eventName={eventName} />
        <PrintMenu eventId={eventId} printHref={printHref} unseated={unseated} />
      </div>
    </header>
  );
}

/** A top-bar button that opens a floating panel: for the layout and room controls, which are bigger than a bar. */
function Popover({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button type="button" className="btn max-w-[12rem] truncate py-1" aria-expanded={open} aria-haspopup="dialog" title={title} onClick={() => setOpen((o) => !o)}>
        {label} <span aria-hidden>▾</span>
      </button>
      {open ? <div className="absolute left-0 top-full z-50 mt-1 max-h-[80vh] w-[min(38rem,92vw)] overflow-y-auto rounded border border-line bg-white p-3 shadow-xl">{children}</div> : null}
    </div>
  );
}

function PanelHost({
  id,
  pinned,
  onPin,
  onClose,
  canEdit,
  snapshots,
  dayActivity,
  collaborators,
}: {
  id: RailPanel;
  pinned: boolean;
  onPin: () => void;
  onClose: () => void;
  canEdit: boolean;
  snapshots: SeatingSnapshotSummary[];
  dayActivity: SeatingDayActivity[];
  collaborators: Collaborators;
}) {
  const label = RAIL_PANELS.find((p) => p.id === id)!.label;
  return (
    <aside aria-label={label} className={`flex w-80 shrink-0 flex-col border-r border-line bg-paper ${pinned ? "" : "shadow-xl"}`}>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-3 text-sm">
        <h2 className="font-medium">{label}</h2>
        <button type="button" className={`ml-auto rounded px-1.5 text-xs ${pinned ? "bg-ink text-white" : "text-muted hover:bg-line/50"}`} aria-pressed={pinned} onClick={onPin} title={pinned ? "Unpin: float over the plan" : "Pin: keep beside the plan"}>
          {pinned ? "Pinned" : "Pin"}
        </button>
        <button type="button" className="rounded px-1.5 text-muted hover:bg-line/50" onClick={onClose} aria-label={`Close ${label}`}>
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        {id === "guests" ? (
          <>
            <SummaryBar />
            <DeclinedSeats />
            <Tray />
          </>
        ) : id === "library" ? (
          canEdit ? (
            <LibraryPanel />
          ) : (
            <p className="p-2 text-sm text-muted">The Library is for placing things, which needs a laptop or tablet and a room that isn&rsquo;t locked.</p>
          )
        ) : id === "venue" ? (
          <>
            <VenuePanel editable={canEdit} />
            {canEdit ? <RoomSettings /> : null}
          </>
        ) : id === "styles" ? (
          <StylesPanel />
        ) : id === "food" ? (
          <FoodPanel defaultOpen />
        ) : id === "rules" ? (
          <RulesPanel defaultOpen />
        ) : id === "history" ? (
          <>
            <SnapshotsPanel snapshots={snapshots} collaborators={collaborators} defaultOpen />
            <DayActivityPanel activity={dayActivity} defaultOpen />
            <RevealPanel defaultOpen />
          </>
        ) : (
          <SettingsPanel defaultOpen />
        )}
      </div>
    </aside>
  );
}
