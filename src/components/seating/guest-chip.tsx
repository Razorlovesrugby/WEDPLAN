"use client";

import { dietaryText, hasAllergy, hasAnyDietary } from "@/lib/dietary";
import { useDraggable } from "@dnd-kit/core";
import { guestColour } from "@/lib/seating/colour";
import { guestName, type SeatingGuest } from "@/lib/seating/model";
import { useSeating } from "./seating-state";

/** Drag payload: who moves. A household drags as all of its unseated members. */
export type DragPayload = { guestIds: string[]; label: string };

/**
 * One guest, as a chip: name, the colour-by dot, and markers for what a
 * caterer or venue needs to see at a glance (dietary, accessibility, child,
 * high chair). Drags, and taps to pick up for tap-to-place.
 */
export function GuestChip({ guest, compact = false }: { guest: SeatingGuest; compact?: boolean }) {
  const { colourBy, data, held, hold, selectMode, selected, toggleSelected } = useSeating();
  const name = guestName(guest);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `guest:${guest.id}`,
    data: { guestIds: [guest.id], label: name } satisfies DragPayload,
  });
  const colour = guestColour(guest, colourBy, data.colour);
  const isHeld = held?.guestIds.length === 1 && held.guestIds[0] === guest.id;

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        if (selectMode) {
          toggleSelected(guest.id, e.shiftKey);
          return;
        }
        hold(isHeld ? null : { guestIds: [guest.id], label: name });
      }}
      title={[
        name,
        hasAnyDietary(guest.dietaryNeeds, guest.dietary) ? `Dietary: ${dietaryText(guest.dietaryNeeds, guest.dietary)}` : null,
        guest.accessibility ? `Access: ${guest.accessibility}` : null,
        colour ? colour.label : null,
      ]
        .filter(Boolean)
        .join("\n")}
      aria-pressed={selectMode ? selected.has(guest.id) : isHeld}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 ${
        compact ? "py-0.5 text-xs" : "py-1 text-sm"
      } ${isHeld || (selectMode && selected.has(guest.id)) ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-muted"} ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {selectMode ? <span aria-hidden>{selected.has(guest.id) ? "☑" : "☐"}</span> : null}
      {colour ? (
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colour.colour }} />
      ) : null}
      <span className="truncate">{name}</span>
      <GuestMarkers guest={guest} />
    </button>
  );
}

export function GuestMarkers({ guest }: { guest: SeatingGuest }) {
  return (
    <>
      {guest.ageBand === "child" ? <Marker title="Child">C</Marker> : null}
      {guest.ageBand === "infant" ? <Marker title="Infant — needs a high chair, doesn't take a seat">HC</Marker> : null}
      {guest.needsHighchair && guest.ageBand !== "infant" ? <Marker title="Needs a highchair">HC</Marker> : null}
      {guest.usesWheelchair ? <Marker title="Uses a wheelchair — a gap at the table, not a chair">♿</Marker> : null}
      {hasAnyDietary(guest.dietaryNeeds, guest.dietary) ? (
        <Marker title={`Dietary: ${dietaryText(guest.dietaryNeeds, guest.dietary)}`} tone={hasAllergy(guest.dietaryNeeds) ? "allergy" : "plain"}>
          D
        </Marker>
      ) : null}
      {guest.accessibility ? <Marker title={`Access: ${guest.accessibility}`}>A</Marker> : null}
    </>
  );
}

function Marker({ title, children, tone = "plain" }: { title: string; children: string; tone?: "plain" | "allergy" }) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`shrink-0 rounded px-1 text-[0.65rem] font-semibold leading-4 ${tone === "allergy" ? "bg-red-100 text-red-800" : "bg-line/70 text-muted"}`}
    >
      {children}
    </span>
  );
}

/** What follows the pointer during a drag. */
export function DragPreview({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-3 py-1 text-sm text-white shadow-lg">
      {label}
      {count > 1 ? <span className="rounded-full bg-white/20 px-1.5 text-xs">{count}</span> : null}
    </span>
  );
}
