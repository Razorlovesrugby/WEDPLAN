"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import type { EventRow, TagRow } from "@/lib/types/database";

const RSVP_OPTIONS = [
  { value: "yes", label: "Attending" },
  { value: "no", label: "Declined" },
  { value: "maybe", label: "Maybe" },
  { value: "pending", label: "No answer" },
] as const;

const MISSING_OPTIONS = [
  { value: "email", label: "No email" },
  { value: "dietary", label: "No dietary info" },
  { value: "address", label: "No address" },
] as const;

/**
 * Filters write to the URL rather than to component state, so a filtered list
 * is a link. That is also what makes the dashboard's click-through work: a
 * stat tile is a link carrying the filter that produced its number.
 */
export function FilterBar({
  tags,
  events,
  activeCount,
}: {
  tags: TagRow[];
  events: EventRow[];
  activeCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(searchDebounce.current), []);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.replace(`/guests?${params.toString()}`, { scroll: false }));
  }

  // Typing a name shouldn't re-query on every keystroke — wait for a pause.
  function setSearch(value: string) {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => setParam("q", value), 300);
  }

  const current = (key: string) => searchParams.get(key) ?? "";

  return (
    <div className={`flex flex-wrap items-end gap-2 ${pending ? "opacity-70" : ""}`}>
      <label className="flex-1 basis-56">
        <span className="mb-1 block text-xs text-muted">Search</span>
        <input
          type="search"
          defaultValue={current("q")}
          placeholder="Name, email, household"
          onChange={(e) => setSearch(e.target.value)}
          className="field"
        />
      </label>

      <label>
        <span className="mb-1 block text-xs text-muted">RSVP</span>
        <select value={current("rsvp")} onChange={(e) => setParam("rsvp", e.target.value)} className="field">
          <option value="">Any</option>
          {RSVP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {events.length > 1 ? (
        <label>
          <span className="mb-1 block text-xs text-muted">For event</span>
          <select value={current("event")} onChange={(e) => setParam("event", e.target.value)} className="field">
            <option value="">Any event</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        <span className="mb-1 block text-xs text-muted">Tier</span>
        <select value={current("tier")} onChange={(e) => setParam("tier", e.target.value)} className="field">
          <option value="">Any</option>
          <option value="A">A — above the cut</option>
          <option value="B">B — waitlist</option>
          <option value="C">C — below</option>
        </select>
      </label>

      <label>
        <span className="mb-1 block text-xs text-muted">Tag</span>
        <select value={current("tag")} onChange={(e) => setParam("tag", e.target.value)} className="field">
          <option value="">Any</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="mb-1 block text-xs text-muted">Age</span>
        <select value={current("age")} onChange={(e) => setParam("age", e.target.value)} className="field">
          <option value="">Any</option>
          <option value="adult">Adults</option>
          <option value="child">Children</option>
          <option value="infant">Infants</option>
        </select>
      </label>

      <label>
        <span className="mb-1 block text-xs text-muted">Missing</span>
        <select value={current("missing")} onChange={(e) => setParam("missing", e.target.value)} className="field">
          <option value="">Nothing</option>
          {MISSING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {activeCount > 0 ? (
        <button
          type="button"
          className="btn"
          onClick={() => {
            clearTimeout(searchDebounce.current);
            startTransition(() => router.replace("/guests", { scroll: false }));
          }}
        >
          Clear {activeCount}
        </button>
      ) : null}
    </div>
  );
}
