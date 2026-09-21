"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addVendorNote,
  archiveVendor,
  deleteVendor,
  deleteVendorNote,
  removeVendorContact,
  restoreVendor,
  saveVendorContact,
  setPrimaryVendorContact,
  toggleVendorNotePin,
  unlinkBudgetItemFromVendor,
  updateVendor,
  updateVendorNote,
  vendorDeletionImpact,
} from "@/server/actions/vendors";
import { STAGE_LABEL, VENDOR_STAGES } from "@/lib/vendors";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import type { VendorNote, VendorTask } from "@/server/queries/vendors";
import type {
  BudgetItemView,
  VendorCategoryRow,
  VendorContactRow,
  VendorView,
} from "@/lib/types/database";

/**
 * `/vendors/[id]` — four cards (spec 8 §5).
 *
 * The money card reads spec 6's views and computes nothing: a vendor with a
 * price in two places is a vendor with two prices that disagree.
 */
export function VendorDetail({
  vendor,
  categories,
  contacts,
  notes,
  lines,
  tasks,
}: {
  vendor: VendorView;
  categories: VendorCategoryRow[];
  contacts: VendorContactRow[];
  notes: VendorNote[];
  lines: BudgetItemView[];
  tasks: VendorTask[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function act(run: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    startTransition(async () => {
      const result = await run();
      setMessage(result.ok ? (done ?? null) : (result.error ?? "That didn't work"));
      if (result.ok) router.refresh();
    });
  }

  const committed = lines.reduce((sum, line) => sum + line.computed_current, 0);
  const paid = lines.reduce((sum, line) => sum + line.paid, 0);

  return (
    <div className="space-y-5">
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {vendor.archived_at ? (
        <p className="rounded border border-line bg-white px-3 py-2 text-sm">
          Archived {formatRelative(vendor.archived_at)}. Its budget lines are untouched.{" "}
          <button
            type="button"
            className="underline"
            disabled={pending}
            onClick={() => act(() => restoreVendor(vendor.id), "Restored")}
          >
            Restore
          </button>
        </p>
      ) : null}

      {/* ---- header ---- */}
      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="field flex-1 font-medium"
            defaultValue={vendor.name}
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next && next !== vendor.name) act(() => updateVendor(vendor.id, { name: next }));
            }}
          />
          <select
            className="field w-auto"
            value={vendor.stage}
            disabled={pending}
            onChange={(event) => act(() => updateVendor(vendor.id, { stage: event.target.value }))}
          >
            {VENDOR_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABEL[stage]}
              </option>
            ))}
          </select>
          <select
            className="field w-auto"
            value={vendor.category_id ?? ""}
            disabled={pending}
            onChange={(event) =>
              act(() => updateVendor(vendor.id, { category_id: event.target.value || null }))
            }
          >
            <option value="">Uncategorised</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["website", "Website"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["address", "Address"],
              ["source", "How we found them"],
              ["recommended_by", "Recommended by"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="text-sm">
              <span className="block text-xs uppercase tracking-wide text-muted">{label}</span>
              <input
                className="field mt-1"
                defaultValue={vendor[field] ?? ""}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next !== (vendor[field] ?? "")) {
                    act(() => updateVendor(vendor.id, { [field]: next }));
                  }
                }}
              />
            </label>
          ))}
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-muted">Gut feel</span>
            <select
              className="field mt-1"
              value={vendor.gut_score ?? ""}
              disabled={pending}
              onChange={(event) =>
                act(() => updateVendor(vendor.id, { gut_score: event.target.value }))
              }
            >
              <option value="">Not scored</option>
              {[1, 2, 3, 4, 5].map((score) => (
                <option key={score} value={score}>
                  {"★".repeat(score)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="block text-xs uppercase tracking-wide text-muted">
            A line about them
          </span>
          <textarea
            className="field mt-1"
            rows={2}
            defaultValue={vendor.notes ?? ""}
            placeholder="The throwaway one-liner. Anything with a date goes in the log below."
            onBlur={(event) => {
              if (event.target.value.trim() !== (vendor.notes ?? "")) {
                act(() => updateVendor(vendor.id, { notes: event.target.value }));
              }
            }}
          />
        </label>

        <div className="flex flex-wrap gap-3 border-t border-line pt-3 text-xs">
          {!vendor.archived_at ? (
            <button
              type="button"
              className="text-muted hover:underline"
              disabled={pending}
              onClick={() => act(() => archiveVendor(vendor.id), "Archived")}
            >
              Archive
            </button>
          ) : null}
          <button
            type="button"
            className="text-red-700 hover:underline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                // Counted BEFORE the confirm, so the planner is told what they
                // are about to lose rather than finding out afterwards.
                const impact = await vendorDeletionImpact(vendor.id);
                if (!impact.ok) {
                  setMessage(impact.error);
                  return;
                }
                const { contacts: c, notes: n, budgetLines: b } = impact.data;
                const lost = [
                  c > 0 ? `${c} contact${c === 1 ? "" : "s"}` : null,
                  n > 0 ? `${n} note${n === 1 ? "" : "s"}` : null,
                ]
                  .filter(Boolean)
                  .join(" and ");
                const kept =
                  b > 0
                    ? ` ${b} budget line${b === 1 ? "" : "s"} will keep their numbers and payments, and read as plain text.`
                    : "";
                if (
                  !window.confirm(
                    `Delete ${vendor.name}?${lost ? ` This removes ${lost}.` : ""}${kept}`,
                  )
                )
                  return;
                const result = await deleteVendor(vendor.id);
                if (result.ok) router.push("/vendors");
                else setMessage(result.error);
              })
            }
          >
            Delete
          </button>
        </div>
      </section>

      {/* ---- contacts ---- */}
      <section className="card space-y-3 p-4">
        <h2 className="font-medium">Contacts</h2>
        <p className="text-sm text-muted">
          The person you book and the person who answers on the day are routinely different. The
          primary one is who shows on the list and the contact sheet.
        </p>

        <ul className="space-y-2">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="font-medium">{contact.name}</span>
              {contact.role ? <span className="text-muted">{contact.role}</span> : null}
              {contact.email ? (
                <a className="underline" href={`mailto:${contact.email}`}>
                  {contact.email}
                </a>
              ) : null}
              {contact.phone ? (
                <a className="underline" href={`tel:${contact.phone}`}>
                  {contact.phone}
                </a>
              ) : null}
              {contact.is_primary ? (
                <span className="text-xs uppercase tracking-wide text-accent">Primary</span>
              ) : (
                <button
                  type="button"
                  className="text-xs text-muted hover:underline"
                  disabled={pending}
                  onClick={() => act(() => setPrimaryVendorContact(vendor.id, contact.id))}
                >
                  Make primary
                </button>
              )}
              <button
                type="button"
                className="text-xs text-red-700 hover:underline"
                disabled={pending}
                onClick={() => act(() => removeVendorContact(contact.id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <ContactForm vendorId={vendor.id} pending={pending} act={act} />
      </section>

      {/* ---- notes ---- */}
      <section className="card space-y-3 p-4">
        <h2 className="font-medium">Notes</h2>
        <NoteForm vendorId={vendor.id} pending={pending} act={act} />
        {notes.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. &ldquo;Quoted $3,200 over the phone, valid 30 days&rdquo; is the kind of
            thing you will want in March.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {notes.map((note) => (
              <NoteRow key={note.id} note={note} pending={pending} act={act} />
            ))}
          </ul>
        )}
      </section>

      {/* ---- money ---- */}
      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Budget lines</h2>
          {lines.length > 0 ? (
            <p className="text-sm tabular-nums">
              {formatMoney(committed)} committed · {formatMoney(paid)} paid ·{" "}
              {formatMoney(committed - paid)} outstanding
            </p>
          ) : null}
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-muted">
            None yet. Link one from <Link href="/budget" className="underline">the budget</Link> —
            type their name in a line&rsquo;s Vendor field and pick them.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
                <Link href={`/budget?item=${line.id}`} className="flex-1 text-sm hover:underline">
                  {line.label}
                </Link>
                <span className="text-sm tabular-nums">
                  {formatMoney(line.computed_current)}
                  <span className="text-muted"> · {formatMoney(line.paid)} paid</span>
                </span>
                <button
                  type="button"
                  className="text-xs text-muted hover:underline"
                  disabled={pending}
                  onClick={() => act(() => unlinkBudgetItemFromVendor(line.id), "Unlinked")}
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}

        {tasks.length > 0 ? (
          <div className="border-t border-line pt-3">
            <h3 className="text-xs uppercase tracking-wide text-muted">
              Tasks about these lines
            </h3>
            <ul className="mt-2 space-y-1">
              {tasks.map((task) => (
                <li key={task.listItemId} className="text-sm">
                  <Link
                    href={`/lists/${task.listId}?highlight=${task.listItemId}`}
                    className="hover:underline"
                  >
                    {task.doneAt ? <span className="text-muted line-through">{task.title}</span> : task.title}
                  </Link>
                  <span className="ml-2 text-xs text-muted">
                    {task.listTitle}
                    {task.dueDate ? ` · ${formatDate(task.dueDate, "UTC")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {/* Read-only on purpose: a task is linked to a budget line, and a
                line to a vendor. Two ways to express one relationship is two
                places to look when it is wrong. */}
            <p className="mt-2 text-xs text-muted">
              Derived from the budget lines above — edit them on their own list.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

type Act = (run: () => Promise<{ ok: boolean; error?: string }>, done?: string) => void;

function ContactForm({ vendorId, pending, act }: { vendorId: string; pending: boolean; act: Act }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
      <input className="field" value={name} placeholder="Name" aria-label="Contact name"
        onChange={(e) => setName(e.target.value)} />
      <input className="field" value={role} placeholder="Role" aria-label="Role"
        onChange={(e) => setRole(e.target.value)} />
      <input className="field" value={email} placeholder="Email" aria-label="Email"
        onChange={(e) => setEmail(e.target.value)} />
      <input className="field" value={phone} placeholder="Phone" aria-label="Phone"
        onChange={(e) => setPhone(e.target.value)} />
      <button
        type="button"
        className="btn"
        disabled={pending || name.trim() === ""}
        onClick={() =>
          act(async () => {
            const result = await saveVendorContact({ vendor_id: vendorId, name, role, email, phone });
            if (result.ok) {
              setName("");
              setRole("");
              setEmail("");
              setPhone("");
            }
            return result;
          }, "Added")
        }
      >
        Add
      </button>
    </div>
  );
}

function NoteForm({ vendorId, pending, act }: { vendorId: string; pending: boolean; act: Act }) {
  const [body, setBody] = useState("");
  return (
    <div className="space-y-2">
      <textarea
        className="field"
        rows={2}
        value={body}
        placeholder="Quoted $3,200 over the phone, valid 30 days."
        onChange={(event) => setBody(event.target.value)}
      />
      <button
        type="button"
        className="btn"
        disabled={pending || body.trim() === ""}
        onClick={() =>
          act(async () => {
            const result = await addVendorNote(vendorId, body);
            if (result.ok) setBody("");
            return result;
          })
        }
      >
        Add note
      </button>
    </div>
  );
}

function NoteRow({ note, pending, act }: { note: VendorNote; pending: boolean; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);

  return (
    <li className="py-3">
      {editing ? (
        <div className="space-y-2">
          <textarea
            className="field"
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              className="text-accent hover:underline"
              disabled={pending}
              onClick={() => {
                act(() => updateVendorNote(note.id, body));
                setEditing(false);
              }}
            >
              Save
            </button>
            <button type="button" className="text-muted hover:underline" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-line text-sm">{note.body}</p>
          <p className="mt-1 text-xs text-muted">
            {formatRelative(note.created_at)}
            {note.authorName ? ` · ${note.authorName}` : ""}
            {note.pinned ? " · pinned" : ""}
          </p>
          <div className="mt-1 flex gap-3 text-xs">
            <button
              type="button"
              className="text-muted hover:underline"
              disabled={pending}
              onClick={() => act(() => toggleVendorNotePin(note.id, !note.pinned))}
            >
              {note.pinned ? "Unpin" : "Pin"}
            </button>
            <button type="button" className="text-muted hover:underline" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="text-red-700 hover:underline"
              disabled={pending}
              onClick={() => act(() => deleteVendorNote(note.id))}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  );
}
