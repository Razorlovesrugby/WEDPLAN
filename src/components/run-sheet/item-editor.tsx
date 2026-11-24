"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPerson } from "@/server/actions/people";
import { deleteRunSheetItem, saveRunSheetItem, saveTaskContent } from "@/server/actions/run-sheet";
import { formatTime } from "@/lib/format";
import { addMinutesIso, assigneeKey, linesOf, MAX_STEPS, spanMinutes, type RunSheetAssignee, type RunSheetItem } from "@/lib/run-sheet";
import { utcToZonedInput, zonedInputToUtc } from "@/lib/timezone";

const TYPE_LABEL: Record<RunSheetAssignee["type"], string> = {
  collaborator: "Us",
  vendor: "Vendors",
  guest: "Guests",
  person: "Others",
};

/**
 * One item (spec 50): title, when it starts and ends, who is on it, and an
 * optional "starts after" link. A dialog, not a route.
 */
export function RunSheetItemEditor({
  open,
  onClose,
  item,
  initialStartsAt,
  allItems,
  options,
  events,
  contacts,
  timeZone,
  canAddPeople,
}: {
  open: boolean;
  onClose: () => void;
  item: RunSheetItem | null;
  /** A `datetime-local` value for a new item made by tapping the timeline. */
  initialStartsAt?: string;
  allItems: RunSheetItem[];
  options: RunSheetAssignee[];
  events: { id: string; name: string }[];
  contacts: { id: string; label: string; phone: string }[];
  timeZone: string;
  canAddPeople: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [eventId, setEventId] = useState("");
  const [guestVisible, setGuestVisible] = useState(false);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [predecessorId, setPredecessorId] = useState("");
  const [gap, setGap] = useState(0);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [extra, setExtra] = useState<RunSheetAssignee[]>([]);
  const [newPerson, setNewPerson] = useState("");
  // What the people helping see (spec 54 §10.1), separate from the private notes.
  const [instructions, setInstructions] = useState("");
  const [address, setAddress] = useState("");
  const [critical, setCritical] = useState(false);
  const [contactId, setContactId] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [bringText, setBringText] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setNotes(item?.notes ?? "");
    setLocation(item?.location ?? "");
    setEventId(item?.event_id ?? "");
    setGuestVisible(item?.guest_visible ?? false);
    const start = item ? utcToZonedInput(item.starts_at, timeZone) : (initialStartsAt ?? "");
    setStartInput(start);
    setEndInput(
      item
        ? utcToZonedInput(item.ends_at, timeZone)
        : start
          ? utcToZonedInput(addMinutesIso(zonedInputToUtc(start, timeZone) ?? new Date().toISOString(), 30), timeZone)
          : "",
    );
    setPredecessorId(item?.predecessor_id ?? "");
    setGap(item?.offset_minutes ?? 0);
    setChosen(new Set(item?.assignees.map((a) => a.key) ?? []));
    setSearch("");
    setNewPerson("");
    setExtra([]);
    setInstructions(item?.helper.instructions ?? "");
    setAddress(item?.helper.address ?? "");
    setCritical(item?.helper.critical ?? false);
    setContactId(item?.helper.contactId ?? "");
    setStepsText((item?.helper.steps ?? []).join("\n"));
    setBringText((item?.helper.bring ?? []).join("\n"));
    setError(null);
  }, [open, item, initialStartsAt, timeZone]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const predecessor = allItems.find((i) => i.id === predecessorId) ?? null;

  /** Where it will start and end, given a predecessor or the typed times. */
  const times = useMemo(() => {
    const typedStart = zonedInputToUtc(startInput, timeZone);
    const typedEnd = zonedInputToUtc(endInput, timeZone);
    if (!typedStart || !typedEnd) return null;
    if (!predecessor) return { start: typedStart, end: typedEnd };
    const start = addMinutesIso(predecessor.ends_at, gap);
    return { start, end: addMinutesIso(start, spanMinutes(typedStart, typedEnd)) };
  }, [startInput, endInput, predecessor, gap, timeZone]);

  const everyone = useMemo(() => [...options, ...extra], [options, extra]);
  const shown = everyone.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()));
  const couple = options.filter((o) => o.type === "collaborator");

  function toggle(key: string) {
    setChosen((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function add() {
    const name = newPerson.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await addPerson(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const who: RunSheetAssignee = {
        key: assigneeKey("person", result.data.id),
        type: "person",
        id: result.data.id,
        label: name,
      };
      setExtra((was) => [...was, who]);
      setChosen((was) => new Set(was).add(who.key));
      setNewPerson("");
    });
  }

  function save() {
    if (!title.trim()) return setError("Give the item a title");
    if (!times) return setError("Give the item a start and an end");
    startTransition(async () => {
      const result = await saveRunSheetItem({
        id: item?.id ?? null,
        title,
        notes,
        location,
        eventId: eventId || null,
        guestVisible,
        startsAt: startInput,
        endsAt: endInput,
        predecessorId: predecessorId || null,
        offsetMinutes: predecessorId ? gap : null,
        assignees: everyone
          .filter((o) => chosen.has(o.key))
          .map((o) => ({ type: o.type, id: o.id })),
      });
      if (!result.ok) return setError(result.error);
      const content = await saveTaskContent(result.data.id, {
        instructions,
        address,
        critical,
        contactId: contactId || null,
        steps: linesOf(stepsText),
        bring: linesOf(bringText),
      });
      router.refresh();
      if (!content.ok) return setError(content.error);
      onClose();
    });
  }

  function remove() {
    if (!item || !window.confirm(`Delete "${item.title}"?`)) return;
    startTransition(async () => {
      const result = await deleteRunSheetItem(item.id);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  }

  const groups = (["collaborator", "vendor", "guest", "person"] as const)
    .map((type) => ({ type, rows: shown.filter((o) => o.type === type) }))
    .filter((g) => g.rows.length > 0);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-full max-w-lg rounded-lg p-0 backdrop:bg-black/40"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="max-h-[90vh] space-y-3 overflow-y-auto p-5"
      >
        <h2 className="font-serif text-lg">{item ? "Edit item" : "New item"}</h2>

        <label className="block text-sm">
          Title
          <input className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
        </label>

        <label className="block text-sm">
          Starts after (optional)
          <select className="field mt-1" value={predecessorId} onChange={(e) => setPredecessorId(e.target.value)}>
            <option value="">Nothing, I will set the start</option>
            {allItems
              .filter((i) => i.id !== item?.id)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title} (ends {formatTime(i.ends_at, timeZone)})
                </option>
              ))}
          </select>
        </label>

        {predecessor ? (
          <label className="block text-sm">
            Gap after it, in minutes
            <input
              type="number"
              min={0}
              max={1440}
              className="field mt-1"
              value={gap}
              onChange={(e) => setGap(Math.max(0, Math.min(1440, Number(e.target.value) || 0)))}
            />
          </label>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Start
            <input
              type="datetime-local"
              className="field mt-1"
              value={predecessor && times ? utcToZonedInput(times.start, timeZone) : startInput}
              disabled={!!predecessor}
              onChange={(e) => setStartInput(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            End
            <input
              type="datetime-local"
              className="field mt-1"
              value={predecessor && times ? utcToZonedInput(times.end, timeZone) : endInput}
              onChange={(e) => setEndInput(e.target.value)}
            />
          </label>
        </div>
        {item?.time_estimated ? (
          <p className="text-xs text-muted">This time was estimated when the run sheet was converted. Set it to what you want.</p>
        ) : null}

        <fieldset className="space-y-2 text-sm">
          <legend>Who is on it</legend>
          <div className="flex flex-wrap items-center gap-2">
            {couple.length > 1 ? (
              <button
                type="button"
                className="btn"
                onClick={() => setChosen((was) => new Set([...was, ...couple.map((c) => c.key)]))}
              >
                Both of us
              </button>
            ) : null}
            <input
              className="field w-auto flex-1"
              placeholder="Search people"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search people"
            />
          </div>
          <div className="max-h-48 overflow-y-auto rounded border border-line p-2">
            {groups.length === 0 ? <p className="text-muted">No one matches.</p> : null}
            {groups.map((g) => (
              <div key={g.type} className="mb-2">
                <div className="text-xs text-muted">{TYPE_LABEL[g.type]}</div>
                {g.rows.map((o) => (
                  <label key={o.key} className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={chosen.has(o.key)} onChange={() => toggle(o.key)} />
                    {o.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
          {canAddPeople ? (
            <div className="flex gap-2">
              <input
                className="field flex-1"
                placeholder="Add someone not listed"
                value={newPerson}
                onChange={(e) => setNewPerson(e.target.value)}
                maxLength={80}
              />
              <button type="button" className="btn" onClick={add} disabled={pending || !newPerson.trim()}>
                Add
              </button>
            </div>
          ) : null}
        </fieldset>

        <label className="block text-sm">
          Location
          <input className="field mt-1" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
        </label>

        <label className="block text-sm">
          Event (optional)
          <select className="field mt-1" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">None</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          Notes
          <textarea className="field mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </label>

        <fieldset className="space-y-3 rounded border border-line p-3 text-sm">
          <legend className="px-1">For the people helping</legend>
          <p className="text-xs text-muted">
            Shown on their day link. Your notes above stay private.
          </p>
          <label className="block">
            Instructions
            <textarea
              className="field mt-1"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={2000}
              placeholder="Two per household, keep a few for latecomers"
            />
          </label>
          <label className="block">
            Steps (one per line, up to {MAX_STEPS})
            <textarea className="field mt-1" rows={3} value={stepsText} onChange={(e) => setStepsText(e.target.value)} />
          </label>
          <label className="block">
            What to bring (one per line, up to {MAX_STEPS})
            <textarea className="field mt-1" rows={2} value={bringText} onChange={(e) => setBringText(e.target.value)} />
          </label>
          <label className="block">
            Address or map link (for Directions)
            <input className="field mt-1" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
          </label>
          <label className="block">
            Who to ask if anything&rsquo;s wrong
            <select className="field mt-1" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">No one</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.phone})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} />
            Must not slip (helpers see a tag)
          </label>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={guestVisible} onChange={(e) => setGuestVisible(e.target.checked)} />
          Show guests this item
        </label>

        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2 pt-2">
          {item ? (
            <button type="button" className="btn text-red-700" onClick={remove} disabled={pending}>
              Delete
            </button>
          ) : null}
          <button type="button" className="btn ml-auto" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
