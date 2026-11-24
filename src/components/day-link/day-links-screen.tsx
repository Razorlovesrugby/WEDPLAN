"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  answerHelp,
  deleteDayContact,
  deleteInfoSection,
  getDayLinkUrl,
  makeDayLink,
  revokeDayLink,
  saveDayContact,
  saveInfoSection,
  setAssigneeContact,
} from "@/server/actions/day-links";
import {
  callCue,
  deleteAnnouncement,
  deleteGroup,
  moveInfoSection,
  resetCue,
  saveGroup,
  sendAnnouncement,
  setLinkModules,
} from "@/server/actions/day-planning";
import { setDayLinkExpiry } from "@/server/actions/day-links";
import { DAY_MODULES, offeredModules } from "@/lib/day-links/modules";
import type { DayLinksOverview, DayLinkPerson } from "@/server/queries/day-links";

const INFO_STARTERS = ["Venue and parking", "Wet-weather plan", "First aid and toilets", "Wifi"];

export function DayLinksScreen({ overview, timeZone }: { overview: DayLinksOverview; timeZone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(work: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) return setError(result.error ?? "That didn't save");
      if (done) setMessage(done);
      router.refresh();
    });
  }

  async function copy(person: DayLinkPerson) {
    if (!person.link) return;
    const result = await getDayLinkUrl(person.link.id);
    if (!result.ok) return setError(result.error);
    try {
      await navigator.clipboard.writeText(result.data.url);
      setMessage(`Copied ${person.name}'s link`);
    } catch {
      window.prompt("Copy this link", result.data.url);
    }
  }

  const unlinked = overview.people.filter((p) => !p.link);
  const when = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("en-NZ", { timeZone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : null;

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-muted">{message}</p> : null}

      <section className="card divide-y divide-line">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">People with jobs</h2>
          <div className="flex gap-2">
            {unlinked.length > 0 ? (
              <button
                className="btn"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    for (const p of unlinked) {
                      const r = await makeDayLink({ type: p.type, id: p.id });
                      if (!r.ok) return r;
                    }
                    return { ok: true };
                  }, `Made ${unlinked.length} ${unlinked.length === 1 ? "link" : "links"}`)
                }
              >
                Make links for everyone without one
              </button>
            ) : null}
            <Link href="/run-sheet/links/print" className="btn" prefetch={false}>
              Print sheet
            </Link>
          </div>
        </div>
        {overview.people.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            Nobody has a job yet. Add a vendor, guest or helper to a run sheet item and they&rsquo;ll appear here.
          </p>
        ) : null}
        {overview.people.map((p) => (
          <div key={`${p.type}:${p.id}`} className="space-y-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-medium">{p.name}</span>{" "}
                <span className="text-xs text-muted">
                  {p.type === "vendor" ? "Vendor" : p.type === "guest" ? "Guest" : "Helper"} · {p.tasks}{" "}
                  {p.tasks === 1 ? "job" : "jobs"}
                  {p.done > 0 ? ` · ${p.done} done` : ""}
                  {p.handedBack > 0 ? ` · ${p.handedBack} handed back` : ""}
                </span>
              </div>
              <span className="text-xs text-muted">
                {!p.link
                  ? "No link"
                  : p.link.opened
                    ? `Opened ${when(p.link.lastSeenAt)}${p.link.arrivedAt ? " · here" : ""}`
                    : "Made, not opened yet"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!p.link ? (
                <button className="btn" disabled={pending} onClick={() => run(() => makeDayLink({ type: p.type, id: p.id }), `Made ${p.name}'s link`)}>
                  Make their link
                </button>
              ) : (
                <>
                  <button className="btn" onClick={() => void copy(p)}>Copy link</button>
                  <button
                    className="btn"
                    disabled={pending}
                    onClick={() => run(() => makeDayLink({ type: p.type, id: p.id }), `New link for ${p.name}. The old one no longer works.`)}
                  >
                    New link
                  </button>
                  <button
                    className="btn text-red-700"
                    disabled={pending}
                    onClick={() => window.confirm(`Turn off ${p.name}'s link?`) && run(() => revokeDayLink(p.link!.id), "Turned off")}
                  >
                    Turn off
                  </button>
                </>
              )}
              {p.link ? (
                <>
                  <Link href={`/run-sheet/links/preview/${p.link.id}`} className="btn" prefetch={false}>
                    See what they see
                  </Link>
                  <button
                    className="btn"
                    disabled={pending}
                    onClick={() => run(() => setDayLinkExpiry(p.link!.id, new Date(Date.parse(p.link!.expiresAt) + 7 * 86_400_000).toISOString()), "Link extended by a week")}
                  >
                    Extend a week
                  </button>
                </>
              ) : null}
              <PhoneEmail person={p} disabled={pending} onSave={(fields) => run(() => setAssigneeContact({ type: p.type, id: p.id }, fields), "Saved")} />
            </div>
            {p.link && DAY_MODULES.length > 0 ? (
              <div className="flex flex-wrap gap-3 text-sm">
                {offeredModules(p.type === "vendor" ? { type: "vendor", categoryName: null } : { type: p.type }).map((m) => (
                  <label key={m.key} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={p.link!.modules.includes(m.key)}
                      disabled={pending}
                      onChange={(e) =>
                        run(() =>
                          setLinkModules(
                            p.link!.id,
                            e.target.checked ? [...p.link!.modules, m.key] : p.link!.modules.filter((k) => k !== m.key),
                          ),
                        )
                      }
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </section>

      {overview.needsSomeone.length > 0 ? (
        <section className="card space-y-2 p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Needs someone</h2>
          {overview.needsSomeone.map((n, i) => (
            <p key={i} className="text-sm">
              <strong>{n.itemTitle}</strong> · {n.who} handed it back
              {n.reason ? `: ${n.reason}` : ""}
              {n.suggested ? ` · suggests ${n.suggested}` : ""}
            </p>
          ))}
          <p className="text-xs text-muted">Nobody is moved until you reassign it on the run sheet.</p>
        </section>
      ) : null}

      {overview.cues.length > 0 ? (
        <section className="card space-y-2 p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Cues</h2>
          {overview.cues.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{c.title} <span className="text-xs text-muted">{when(c.startsAt)}</span></span>
              {c.calledAt ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted">Go at {when(c.calledAt)}</span>
                  <button className="btn" disabled={pending} onClick={() => run(() => resetCue(c.id))}>Reset</button>
                </span>
              ) : (
                <button className="btn-primary" disabled={pending} onClick={() => run(() => callCue(c.id), `Go sent for ${c.title}`)}>Go</button>
              )}
            </div>
          ))}
        </section>
      ) : null}

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Announcements</h2>
        <AnnouncementForm groups={overview.groups} people={overview.people.filter((p) => p.link)} disabled={pending} onSend={(input) => run(() => sendAnnouncement(input), "Sent")} />
        {overview.announcements.map((a) => (
          <div key={a.id} className="space-y-0.5 border-t border-line pt-3 text-sm">
            <div>{a.important ? "❗ " : ""}{a.text}</div>
            <div className="text-xs text-muted">
              To {a.to} · {when(a.sentAt)} · seen by {a.seen} of {a.reached}
              {a.important ? ` · OK from ${a.acknowledged}` : ""}
            </div>
            <button className="btn text-red-700" disabled={pending} onClick={() => run(() => deleteAnnouncement(a.id))}>Delete</button>
          </div>
        ))}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Groups</h2>
        <p className="text-xs text-muted">
          A saved set of helpers (Ushers). Pick a group on a task to add each member, or open a task to a group so they can claim it.
          Changing a group later doesn&rsquo;t change tasks already assigned.
        </p>
        {overview.groups.map((g) => (
          <GroupEditor key={g.id} group={g} candidates={overview.candidates} disabled={pending}
            onSave={(name, members) => run(() => saveGroup(g.id, { name, members }), "Saved")}
            onDelete={() => window.confirm(`Delete the group "${g.name}"?`) && run(() => deleteGroup(g.id))} />
        ))}
        <GroupEditor group={null} candidates={overview.candidates} disabled={pending}
          onSave={(name, members) => run(() => saveGroup(null, { name, members }), "Group added")} onDelete={() => undefined} />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Help requests and questions</h2>
        {overview.help.length === 0 ? <p className="text-sm text-muted">None yet.</p> : null}
        {overview.help.map((h) => (
          <HelpRow key={h.id} help={h} disabled={pending} when={when(h.tappedAt)} onAnswer={(text) => run(() => answerHelp(h.id, text), "Answer sent")} />
        ))}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Day contacts</h2>
        <p className="text-xs text-muted">Shown on every link, and offered as &ldquo;who to ask&rdquo; on a task.</p>
        {overview.contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{c.label} · {c.phone}</span>
            <button className="btn text-red-700" disabled={pending} onClick={() => run(() => deleteDayContact(c.id))}>Remove</button>
          </div>
        ))}
        <ContactForm disabled={pending} onSave={(label, phone) => run(() => saveDayContact(null, { label, phone }), "Contact added")} />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Good to know</h2>
        <p className="text-xs text-muted">What every helper needs and nobody wants to ring about. Empty sections aren&rsquo;t shown.</p>
        {overview.info.map((s) => (
          <InfoEditor key={s.id} heading={s.heading} body={s.body} disabled={pending}
            onMove={(dir) => run(() => moveInfoSection(s.id, dir))}
            onSave={(heading, body) => run(() => saveInfoSection(s.id, { heading, body }), "Saved")}
            onDelete={() => run(() => deleteInfoSection(s.id))} />
        ))}
        {overview.info.length === 0 ? (
          <button className="btn" disabled={pending} onClick={() => run(async () => {
            for (const heading of INFO_STARTERS) {
              const r = await saveInfoSection(null, { heading, body: "" });
              if (!r.ok) return r;
            }
            return { ok: true };
          })}>
            Start with the usual sections
          </button>
        ) : (
          <button className="btn" disabled={pending} onClick={() => run(() => saveInfoSection(null, { heading: "New section", body: "" }))}>
            + Add a section
          </button>
        )}
      </section>
    </div>
  );
}

function PhoneEmail({ person, disabled, onSave }: { person: DayLinkPerson; disabled: boolean; onSave: (fields: { phone: string; email: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [email, setEmail] = useState(person.email ?? "");
  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        {person.phone ? `📞 ${person.phone}` : "Add phone"}
        {person.email ? "" : " / email"}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input className="field w-36" aria-label="Phone" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input className="field w-48" aria-label="Email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn-primary" disabled={disabled} onClick={() => { onSave({ phone, email }); setOpen(false); }}>Save</button>
      <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}

function HelpRow({ help, when, disabled, onAnswer }: { help: DayLinksOverview["help"][number]; when: string | null; disabled: boolean; onAnswer: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-1 border-t border-line pt-3 text-sm first:border-0 first:pt-0">
      <div>
        <strong>{help.who}</strong> · {help.reason}
        {help.itemTitle ? ` · ${help.itemTitle}` : ""} <span className="text-xs text-muted">{when}</span>
      </div>
      {help.text ? <div className="text-muted">{help.text}</div> : null}
      {help.answeredAt ? (
        <div className="text-muted">Answered: {help.answer}</div>
      ) : (
        <div className="flex gap-2">
          <input className="field flex-1" aria-label="Answer" placeholder="Mere is on her way" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
          <button className="btn-primary" disabled={disabled || !text.trim()} onClick={() => { onAnswer(text); setText(""); }}>Answer</button>
        </div>
      )}
    </div>
  );
}

function ContactForm({ disabled, onSave }: { disabled: boolean; onSave: (label: string, phone: string) => void }) {
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <div className="flex flex-wrap gap-2">
      <input className="field w-48" aria-label="Contact label" placeholder="Planner, Venue coordinator…" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
      <input className="field w-40" aria-label="Contact phone" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
      <button className="btn" disabled={disabled || !label.trim() || phone.trim().length < 3} onClick={() => { onSave(label, phone); setLabel(""); setPhone(""); }}>Add</button>
    </div>
  );
}

function InfoEditor({ heading, body, disabled, onSave, onDelete, onMove }: { heading: string; body: string; disabled: boolean; onSave: (heading: string, body: string) => void; onDelete: () => void; onMove: (dir: "up" | "down") => void }) {
  const [h, setH] = useState(heading);
  const [b, setB] = useState(body);
  return (
    <div className="space-y-1 border-t border-line pt-3 first:border-0 first:pt-0">
      <input className="field" aria-label="Heading" value={h} onChange={(e) => setH(e.target.value)} maxLength={80} />
      <textarea className="field" aria-label="Details" rows={2} value={b} onChange={(e) => setB(e.target.value)} maxLength={2000} />
      <div className="flex gap-2">
        <button className="btn" disabled={disabled || (h === heading && b === body)} onClick={() => onSave(h, b)}>Save</button>
        <button className="btn" disabled={disabled} aria-label="Move up" onClick={() => onMove("up")}>↑</button>
        <button className="btn" disabled={disabled} aria-label="Move down" onClick={() => onMove("down")}>↓</button>
        <button className="btn text-red-700" disabled={disabled} onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function AnnouncementForm({
  groups,
  people,
  disabled,
  onSend,
}: {
  groups: DayLinksOverview["groups"];
  people: DayLinkPerson[];
  disabled: boolean;
  onSend: (input: { audience: "everyone" | "group" | "link"; groupId?: string; linkId?: string; text: string; important: boolean }) => void;
}) {
  const [to, setTo] = useState("everyone");
  const [text, setText] = useState("");
  const [important, setImportant] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select className="field w-auto" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="everyone">Everyone</option>
          {groups.map((g) => (
            <option key={g.id} value={`group:${g.id}`}>{g.name}</option>
          ))}
          {people.map((p) => (
            <option key={p.link!.id} value={`link:${p.link!.id}`}>{p.name}</option>
          ))}
        </select>
        <input className="field flex-1" aria-label="Message" placeholder="Ceremony running 10 minutes late" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
        Important: stays pinned until they tap OK
      </label>
      <button
        className="btn-primary"
        disabled={disabled || !text.trim()}
        onClick={() => {
          const [kind, id] = to.split(":");
          onSend({
            audience: kind === "group" ? "group" : kind === "link" ? "link" : "everyone",
            groupId: kind === "group" ? id : undefined,
            linkId: kind === "link" ? id : undefined,
            text,
            important,
          });
          setText("");
          setImportant(false);
        }}
      >
        Send
      </button>
    </div>
  );
}

function GroupEditor({
  group,
  candidates,
  disabled,
  onSave,
  onDelete,
}: {
  group: DayLinksOverview["groups"][number] | null;
  candidates: DayLinksOverview["candidates"];
  disabled: boolean;
  onSave: (name: string, members: { type: "vendor" | "guest" | "person"; id: string }[]) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [members, setMembers] = useState(group?.members ?? []);
  const [search, setSearch] = useState("");
  const taken = new Set(members.map((m) => `${m.type}:${m.id}`));
  const matches = search.trim()
    ? candidates.filter((c) => !taken.has(`${c.type}:${c.id}`) && c.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
    : [];
  return (
    <div className="space-y-2 border-t border-line pt-3 first:border-0 first:pt-0">
      <input className="field" aria-label="Group name" placeholder={group ? undefined : "New group, e.g. Ushers"} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <button key={`${m.type}:${m.id}`} type="button" className="rounded-full border border-line px-2 py-0.5 text-xs" onClick={() => setMembers(members.filter((x) => !(x.type === m.type && x.id === m.id)))}>
            {m.name} ×
          </button>
        ))}
      </div>
      <input className="field" aria-label="Add a member" placeholder="Add someone…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {matches.map((c) => (
        <button key={`${c.type}:${c.id}`} type="button" className="block text-left text-sm underline" onClick={() => { setMembers([...members, c]); setSearch(""); }}>
          {c.name} <span className="text-xs text-muted">{c.type === "person" ? "helper" : c.type}</span>
        </button>
      ))}
      <div className="flex gap-2">
        <button className="btn" disabled={disabled || !name.trim()} onClick={() => { onSave(name, members); if (!group) { setName(""); setMembers([]); } }}>
          {group ? "Save group" : "Add group"}
        </button>
        {group ? <button className="btn text-red-700" disabled={disabled} onClick={onDelete}>Delete</button> : null}
      </div>
    </div>
  );
}
