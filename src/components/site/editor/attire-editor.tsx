"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addNote,
  createDressCode,
  deleteDressCode,
  deleteNote,
  renameDressCode,
  saveNote,
  setDressCodeBoard,
  setEventDressCode,
} from "@/server/actions/attire";
import type { ResolvedDressCode } from "@/lib/site/dress-codes";
import type { EventRow, MoodboardRow } from "@/lib/types/database";

type EventLite = Pick<EventRow, "id" | "name" | "dress_code_id">;
type BoardLite = Pick<MoodboardRow, "id" | "title">;

/**
 * The attire editor (spec 25 §4).
 *
 * Two things this screen is deliberately shaped around:
 *
 * **Coverage is a tick, not a text field.** The events a code covers are the
 * events pointing at it. There is nowhere here to type "for the welcome
 * dinner", because a typed list is a second copy of the truth and the second
 * copy is the one that goes stale.
 *
 * **The labels are content.** A new code arrives with "For her" and "For him"
 * already there, which is what most couples want and what the reference does.
 * They are editable text, and one of them can be deleted — the schema takes no
 * view (spec 25 Answered, question 1), so neither does this form.
 */
export function AttireEditor({
  codes,
  events,
  boards,
}: {
  codes: ResolvedDressCode[];
  events: EventLite[];
  boards: BoardLite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await run();
      setMessage(result.ok ? null : (result.error ?? "That didn't work"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex-1 text-sm">
          <span className="block font-medium">Add a dress code</span>
          <input
            className="field mt-1"
            value={newName}
            placeholder="Formal summer"
            maxLength={120}
            onChange={(event) => setNewName(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn-primary"
          disabled={pending || newName.trim().length === 0}
          onClick={() => {
            act(() => createDressCode(newName));
            setNewName("");
          }}
        >
          Add
        </button>
      </div>

      {message ? <p className="text-sm text-red-700">{message}</p> : null}

      {codes.length === 0 ? (
        <p className="text-sm text-muted">
          No dress codes yet. Most weddings have one or two — one for the day and one for the
          evening.
        </p>
      ) : null}

      {codes.map((code) => (
        <section key={code.id} className="card space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <RenameField
              name={code.name}
              pending={pending}
              onSave={(next) => act(() => renameDressCode(code.id, next))}
            />
            <button
              type="button"
              className="text-xs text-red-700 hover:underline"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    `Delete "${code.name}"? Any event wearing it will have no dress code.`,
                  )
                )
                  return;
                act(() => deleteDressCode(code.id));
              }}
            >
              Delete
            </button>
          </div>

          {/* ---- which events wear it ---- */}
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted">Worn at</h3>
            {events.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No events yet.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {events.map((event) => {
                  const wearing = event.dress_code_id === code.id;
                  const takenBy = !wearing && event.dress_code_id
                    ? codes.find((other) => other.id === event.dress_code_id)
                    : null;
                  return (
                    <li key={event.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={wearing}
                          disabled={pending}
                          onChange={() =>
                            act(() => setEventDressCode(event.id, wearing ? null : code.id))
                          }
                        />
                        <span>{event.name}</span>
                        {/* An event wears one code. Saying which one has it is
                            more use than a disabled tickbox with no reason. */}
                        {takenBy ? (
                          <span className="text-xs text-muted">({takenBy.name})</span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ---- the guidance ---- */}
          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-wide text-muted">What to say</h3>
            {code.notes.map((note) => (
              <NoteRow key={note.id} note={note} boards={boards} pending={pending} act={act} />
            ))}
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => act(() => addNote(code.id, "For everyone"))}
            >
              Add another
            </button>
          </div>

          {/* ---- a board for the whole code ---- */}
          {boards.length > 0 ? (
            <label className="block text-sm">
              <span className="text-xs uppercase tracking-wide text-muted">Moodboard</span>
              <select
                className="field mt-1"
                value={code.board_id ?? ""}
                disabled={pending}
                onChange={(event) =>
                  act(() => setDressCodeBoard(code.id, event.target.value || null))
                }
              >
                <option value="">None</option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.title}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted">
                Only boards you have published show on the site.
              </span>
            </label>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/** A dress code's name, saved with a button rather than on blur (spec 42 §5.3). */
function RenameField({ name, pending, onSave }: { name: string; pending: boolean; onSave: (next: string) => void }) {
  const [value, setValue] = useState(name);
  const next = value.trim();
  const dirty = next !== name;
  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <input
        className="field flex-1 font-medium"
        aria-label="Dress code name"
        value={value}
        maxLength={120}
        onChange={(event) => setValue(event.target.value)}
      />
      {dirty ? (
        <>
          <button type="button" className="btn-primary" disabled={pending || !next} onClick={() => onSave(next)}>
            Save
          </button>
          <span className="text-xs text-muted">Unsaved changes</span>
        </>
      ) : null}
    </div>
  );
}

function NoteRow({
  note,
  boards,
  pending,
  act,
}: {
  note: ResolvedDressCode["notes"][number];
  boards: BoardLite[];
  pending: boolean;
  act: (run: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [label, setLabel] = useState(note.label);
  const [body, setBody] = useState(note.body ?? "");
  const [boardId, setBoardId] = useState(note.board_id ?? "");

  // Spec 42 §5.3 (Q9): words wait for Save, with a note while they differ.
  const dirty = label !== note.label || body !== (note.body ?? "");

  function save() {
    act(() => saveNote(note.id, { label, body, boardId: boardId || null }));
  }

  return (
    <div className="space-y-2 border-l-2 border-line pl-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="field w-48"
          value={label}
          maxLength={80}
          aria-label="Who this note is for"
          onChange={(event) => setLabel(event.target.value)}
        />
        <button
          type="button"
          className="text-xs text-red-700 hover:underline"
          disabled={pending}
          onClick={() => act(() => deleteNote(note.id))}
        >
          Remove
        </button>
      </div>
      <textarea
        className="field"
        rows={3}
        value={body}
        maxLength={4000}
        placeholder="We'll be outdoors, so a block heel will serve you better than a stiletto."
        aria-label="What to wear"
        onChange={(event) => setBody(event.target.value)}
      />
      {dirty ? (
        <div className="flex items-center gap-2 text-xs">
          <button type="button" className="btn-primary" disabled={pending || !label.trim()} onClick={save}>
            Save
          </button>
          <span className="text-muted">Unsaved changes</span>
        </div>
      ) : null}
      {boards.length > 0 ? (
        <select
          className="field"
          value={boardId}
          disabled={pending}
          onChange={(event) => {
            setBoardId(event.target.value);
            act(() => saveNote(note.id, { label, body, boardId: event.target.value || null }));
          }}
        >
          <option value="">No moodboard for this one</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.title}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
