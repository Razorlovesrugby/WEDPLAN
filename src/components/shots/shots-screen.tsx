"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addPeopleToShots,
  addShotProposals,
  applyShotOrder,
  confirmGuestPhoto,
  confirmShotReference,
  deleteSection,
  deleteShot,
  duplicateShot,
  moveSection,
  moveShot,
  moveShotToSection,
  removeGuestPhoto,
  removeShotReference,
  requestGuestPhotoUpload,
  requestShotReferenceUpload,
  saveSection,
  saveShot,
  setGuestFace,
  setShotStatusAsCouple,
  type ShotPersonInput,
} from "@/server/actions/shots";
import { callBacks, suggestOrder, type OrderShot } from "@/lib/shots/order";
import { suggestFormals, type FamilySide, type Who } from "@/lib/shots/formals";
import { PeopleChooser } from "./people-chooser";
import { recentPeople } from "@/lib/shots/people";
import { counts, slotFit } from "@/lib/shots/progress";
import { DEFAULT_MINUTES, KIND_LABEL, personKey, type ShotItem, type ShotSectionItem } from "@/lib/shots/model";
import type { ShotKind } from "@/lib/types/database";
import type { ShotListData } from "@/server/queries/shots";
import { UPLOAD_CACHE_CONTROL } from "@/lib/storage-cache";

const STATUS_LABEL = { todo: "To do", taken: "Taken", skipped: "Skipped", later: "Later" } as const;

type Editing = { shot: ShotItem | null; sectionId: string; selectTitle?: boolean };

function fmt(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-NZ", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

async function putFile(uploadUrl: string, file: File) {
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type, "cache-control": UPLOAD_CACHE_CONTROL }, body: file });
  return put.ok;
}

export function ShotsScreen({ data, timeZone }: { data: ShotListData; timeZone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(data.sections[0]?.id ?? null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [panel, setPanel] = useState<"order" | "groups" | "faces" | null>(null);
  const [previous, setPrevious] = useState<{ sectionId: string; ids: string[] } | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState(false);
  const [openAfter, setOpenAfter] = useState<string | null>(null);

  // A duplicate opens for editing once the refreshed list holds it (spec 58 §3.1).
  useEffect(() => {
    if (!openAfter) return;
    for (const sec of data.sections) {
      const found = sec.shots.find((x) => x.id === openAfter);
      if (found) {
        setEditing({ shot: found, sectionId: sec.id, selectTitle: true });
        setOpenAfter(null);
      }
    }
  }, [data.sections, openAfter]);

  // Live progress on the day (§5.2).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    }, 15_000);
    return () => clearInterval(id);
  }, [router]);

  const section = data.sections.find((s) => s.id === selected) ?? data.sections[0] ?? null;
  const couple = useMemo(() => new Set(data.sections.flatMap((s) => s.shots.flatMap((sh) => sh.people.filter((p) => p.kind === "person").map((p) => p.key)))), [data.sections]);

  function run(work: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setError(null);
    startTransition(async () => {
      const r = await work();
      if (!r.ok) return setError(r.error ?? "That didn't save");
      if (done) setMessage(done);
      router.refresh();
    });
  }

  if (!section) return <p className="card p-6 text-sm text-muted">No sections yet.</p>;

  const orderShots: OrderShot[] = section.shots.map((s) => ({ id: s.id, people: s.people.map((p) => p.key) }));
  const cb = callBacks(orderShots, couple);
  const fit = slotFit(section.shots, section.startsAt, section.endsAt);
  const c = counts(section.shots);

  return (
    <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
      <aside className="space-y-2">
        <ul className="card divide-y divide-line text-sm">
          {data.sections.map((s, i) => {
            const sc = counts(s.shots);
            return (
              <li key={s.id} className={s.id === section.id ? "bg-black/5" : undefined}>
                <button type="button" className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left" onClick={() => setSelected(s.id)}>
                  <span>{s.name}</span>
                  <span className="text-xs text-muted">{sc.taken} of {sc.total}</span>
                </button>
                {s.id === section.id ? (
                  <div className="flex gap-1 px-3 pb-2">
                    <button className="btn" aria-label="Move up" disabled={pending || i === 0} onClick={() => run(() => moveSection(s.id, "up"))}>↑</button>
                    <button className="btn" aria-label="Move down" disabled={pending || i === data.sections.length - 1} onClick={() => run(() => moveSection(s.id, "down"))}>↓</button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <button className="btn w-full" disabled={pending} onClick={() => { const name = window.prompt("Name for the new section"); if (name) run(() => saveSection(null, { name }), "Section added"); }}>
          + Section
        </button>
        <div className="space-y-1 text-xs">
          <Link href="/shots/print" className="underline" prefetch={false}>Print</Link>{" · "}
          <a href="/api/export/shots" className="underline">Export CSV</a>
        </div>
      </aside>

      <div className="space-y-3">
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        {message ? <p role="status" className="text-sm text-muted">{message}</p> : null}

        <section className="card space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg">{section.name}</h2>
            <div className="flex gap-2">
              <button className="btn" onClick={() => { const name = window.prompt("Rename the section", section.name); if (name) run(() => saveSection(section.id, { name, location: section.location ?? "", runSheetItemId: section.runSheetItemId }), "Renamed"); }}>Rename</button>
              <button className="btn text-red-700" disabled={pending} onClick={() => window.confirm(`Delete "${section.name}" and its shots?`) && run(() => deleteSection(section.id))}>Delete</button>
            </div>
          </div>
          <label className="block text-sm">
            Tied to a run sheet item
            <select
              className="field mt-1"
              value={section.runSheetItemId ?? ""}
              onChange={(e) => run(() => saveSection(section.id, { name: section.name, location: section.location ?? "", runSheetItemId: e.target.value || null }), "Saved")}
            >
              <option value="">No, any time</option>
              {data.items.map((i) => (
                <option key={i.id} value={i.id}>{fmt(i.startsAt, timeZone)} {i.title}</option>
              ))}
            </select>
          </label>
          {section.startsAt && section.endsAt ? <p className="text-xs text-muted">{fmt(section.startsAt, timeZone)}–{fmt(section.endsAt, timeZone)}{section.location ? ` · ${section.location}` : ""}</p> : null}
          {fit ? (
            <p className={`text-sm ${fit.over ? "text-amber-700" : "text-muted"}`}>
              {fit.groups} {fit.groups === 1 ? "group" : "groups"} · about {fit.minutes} minutes of a {fit.slotMinutes} minute slot{fit.over ? " — over" : ""}
            </p>
          ) : null}
          <p className="text-sm text-muted">
            {c.taken} of {c.total} taken{c.skipped ? ` · ${c.skipped} skipped` : ""} · {cb} {cb === 1 ? "call-back" : "call-backs"}
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => setEditing({ shot: null, sectionId: section.id })}>Add a shot</button>
          <button className="btn" onClick={() => setPanel(panel === "order" ? null : "order")}>Suggest an order</button>
          <button className="btn" onClick={() => setPanel(panel === "groups" ? null : "groups")}>Suggest groups</button>
          <button className="btn" onClick={() => setPanel(panel === "faces" ? null : "faces")}>Faces</button>
          {previous && previous.sectionId === section.id ? (
            <button className="btn" disabled={pending} onClick={() => run(() => applyShotOrder(previous.sectionId, previous.ids), "Order restored")}>Undo the order</button>
          ) : null}
        </div>

        {panel === "order" ? (
          <OrderPanel section={section} couple={couple} disabled={pending} onUse={(ids) => { setPrevious({ sectionId: section.id, ids: section.shots.map((s) => s.id) }); run(() => applyShotOrder(section.id, ids), "Order applied"); setPanel(null); }} />
        ) : null}
        {panel === "groups" ? <GroupsPanel data={data} disabled={pending} onAdd={(proposals) => { run(() => addShotProposals(section.id, proposals), `Added ${proposals.length} ${proposals.length === 1 ? "group" : "groups"}`); setPanel(null); }} /> : null}
        {panel === "faces" ? <FacesPanel data={data} section={section} onError={setError} onDone={() => router.refresh()} /> : null}

        {section.shots.some((x) => ticked.has(x.id)) ? (
          <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
            <span>{section.shots.filter((x) => ticked.has(x.id)).length} ticked</span>
            <button className="btn-primary" onClick={() => setBulk(true)}>Add people to ticked shots</button>
            <button className="btn" onClick={() => setTicked(new Set())}>Untick all</button>
          </div>
        ) : null}
        {section.shots.length === 0 ? <p className="card p-6 text-center text-sm text-muted">No shots here yet. Add one, or try Suggest groups.</p> : null}
        <ol className="space-y-2">
          {section.shots.map((s, i) => (
            <li key={s.id} className="card space-y-1 p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <input
                    type="checkbox"
                    className="mr-2 align-middle"
                    aria-label={`Tick ${s.title}`}
                    checked={ticked.has(s.id)}
                    onChange={(e) => setTicked((t) => { const n = new Set(t); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })}
                  />
                  <span className="mr-2 text-muted">{i + 1}.</span>
                  <strong>{s.mustHave ? "★ " : ""}{s.title}</strong>{" "}
                  <span className="text-xs text-muted">{KIND_LABEL[s.kind]}{s.shooter ? ` · ${s.shooter} shooter` : ""}</span>
                </span>
                <span className={`text-xs ${s.status === "taken" ? "text-green-700" : s.status === "skipped" ? "text-amber-700" : "text-muted"}`}>
                  {STATUS_LABEL[s.status]}{s.statusAt && s.status !== "todo" ? ` ${fmt(s.statusAt, timeZone)}${s.statusBy ? ` · ${s.statusBy}` : ""}` : ""}
                </span>
              </div>
              <div className="text-muted">{s.people.length ? s.people.map((p) => p.name).join(", ") : "Nobody in this shot"}</div>
              {s.note ? <div className="italic">{s.note}</div> : null}
              <div className="flex flex-wrap gap-1">
                <button className="btn" aria-label="Move up" disabled={pending || i === 0} onClick={() => run(() => moveShot(s.id, "up"))}>↑</button>
                <button className="btn" aria-label="Move down" disabled={pending || i === section.shots.length - 1} onClick={() => run(() => moveShot(s.id, "down"))}>↓</button>
                <button className="btn" onClick={() => setEditing({ shot: s, sectionId: s.sectionId })}>Edit</button>
                <button className="btn" disabled={pending} onClick={() => run(async () => { const r = await duplicateShot(s.id); if (r.ok) setOpenAfter(r.data.id); return r; })}>Duplicate</button>
                {s.status !== "todo" ? <button className="btn" disabled={pending} onClick={() => run(() => setShotStatusAsCouple(s.id, "todo"))}>Reset</button> : <button className="btn" disabled={pending} onClick={() => run(() => setShotStatusAsCouple(s.id, "taken"))}>Mark taken</button>}
              </div>
            </li>
          ))}
        </ol>

        <section className="card space-y-1 p-4 text-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Shared with</h2>
          {data.sharedWith.length === 0 ? <p className="text-muted">Nobody has the Shot list on their day link yet.</p> : null}
          {data.sharedWith.map((l) => (
            <p key={l.linkId}>{l.label}{l.sectionId ? ` · ${data.sections.find((s) => s.id === l.sectionId)?.name ?? "one section"} only` : " · everything"}</p>
          ))}
          <Link href="/run-sheet/links" className="underline">Day links</Link>
        </section>
      </div>

      {bulk ? (
        <BulkAdd
          data={data}
          shotIds={section.shots.filter((x) => ticked.has(x.id)).map((x) => x.id)}
          section={section}
          pending={pending}
          onClose={() => setBulk(false)}
          onApply={(people) => run(async () => { const r = await addPeopleToShots(section.shots.filter((x) => ticked.has(x.id)).map((x) => x.id), people); if (r.ok) { setBulk(false); setTicked(new Set()); } return r; }, "People added")}
        />
      ) : null}

      {editing ? (
        <ShotEditor
          data={data}
          editing={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(input) =>
            run(async () => {
              const r = await saveShot(editing.shot?.id ?? null, input.sectionId, input.value);
              if (r.ok) setEditing(null);
              return r;
            }, "Saved")
          }
          onDelete={() => editing.shot && window.confirm("Delete this shot?") && run(async () => { const r = await deleteShot(editing.shot!.id); if (r.ok) setEditing(null); return r; })}
          onDuplicate={() => editing.shot && run(async () => { const r = await duplicateShot(editing.shot!.id); if (r.ok) { setEditing(null); setOpenAfter(r.data.id); } return r; })}
          onMove={(sectionId) => editing.shot && run(async () => { const r = await moveShotToSection(editing.shot!.id, sectionId); if (r.ok) setEditing(null); return r; })}
          onError={setError}
          onDone={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

function OrderPanel({ section, couple, disabled, onUse }: { section: ShotSectionItem; couple: ReadonlySet<string>; disabled: boolean; onUse: (ids: string[]) => void }) {
  const result = useMemo(() => suggestOrder(section.shots.map((s) => ({ id: s.id, people: s.people.map((p) => p.key) })), couple), [section.shots, couple]);
  const title = new Map(section.shots.map((s) => [s.id, s.title]));
  return (
    <div className="card space-y-2 p-4 text-sm">
      {result.unchanged ? (
        <p>Your order is already the best this search found ({result.before} {result.before === 1 ? "call-back" : "call-backs"}).</p>
      ) : (
        <>
          <p>Suggested order: {result.callBacks} {result.callBacks === 1 ? "call-back" : "call-backs"} instead of {result.before}. It's advice; your order is what the photographer sees.</p>
          <ol className="list-decimal pl-6">{result.order.map((id) => <li key={id}>{title.get(id)}</li>)}</ol>
          <button className="btn-primary" disabled={disabled} onClick={() => onUse(result.order)}>Use this order</button>
        </>
      )}
    </div>
  );
}

function GroupsPanel({ data, disabled, onAdd }: { data: ShotListData; disabled: boolean; onAdd: (p: { title: string; minutes: number; people: ShotPersonInput[] }[]) => void }) {
  type Side = { label: string; partner: string; parents: string[]; siblings: string[]; grandparents: string[]; stepParents: string[] };
  const blank = (label: string): Side => ({ label, partner: "", parents: [], siblings: [], grandparents: [], stepParents: [] });
  const [sides, setSides] = useState<Side[]>([blank("Their"), blank("Their")]);
  const [labels, setLabels] = useState(["Partner one", "Partner two"]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [built, setBuilt] = useState<ReturnType<typeof suggestFormals> | null>(null);

  const who = (id: string): Who => ({ kind: "guest", id });
  const nameOf = (id: string) => data.guests.find((g) => g.id === id)?.name;
  const guestsOptions = data.guests;

  function build() {
    const familySides: FamilySide[] = sides.map((s, i) => ({
      label: `${labels[i]!.trim() || `Side ${i + 1}`}'s`,
      partner: s.partner ? who(s.partner) : null,
      parents: s.parents.map(who),
      siblings: s.siblings.map(who),
      grandparents: s.grandparents.map(who),
      stepParents: s.stepParents.map(who),
      parentNames: s.parents.map((id) => nameOf(id) ?? "parent"),
      stepParentNames: s.stepParents.map((id) => nameOf(id) ?? "step-parent"),
    }));
    const couple = sides.filter((s) => s.partner).map((s) => who(s.partner));
    const list = suggestFormals(familySides, couple);
    setBuilt(list);
    setTicked(new Set(list.map((p) => p.key)));
  }

  const picker = (side: number, field: "parents" | "siblings" | "grandparents" | "stepParents", label: string) => (
    <label className="block">
      {label}
      <select
        multiple
        className="field mt-1 h-24"
        value={sides[side]![field]}
        onChange={(e) => {
          const values = [...e.target.selectedOptions].map((o) => o.value);
          setSides((cur) => cur.map((s, i) => (i === side ? { ...s, [field]: values } : s)));
        }}
      >
        {guestsOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="card space-y-3 p-4 text-sm">
      <p className="text-muted">Pick each side&rsquo;s family from the guest list (hold Ctrl or Cmd to pick several). Nothing is added until you tick groups and add them.</p>
      {sides.map((s, i) => (
        <fieldset key={i} className="grid gap-2 rounded border border-line p-3 sm:grid-cols-2">
          <legend className="px-1">Side {i + 1}</legend>
          <label className="block">Name <input className="field mt-1" value={labels[i]} onChange={(e) => setLabels((l) => l.map((x, j) => (j === i ? e.target.value : x)))} /></label>
          <label className="block">The partner on this side
            <select className="field mt-1" value={s.partner} onChange={(e) => setSides((cur) => cur.map((x, j) => (j === i ? { ...x, partner: e.target.value } : x)))}>
              <option value="">Not in the guest list</option>
              {guestsOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          {picker(i, "parents", "Parents")}
          {picker(i, "siblings", "Siblings")}
          {picker(i, "grandparents", "Grandparents")}
          {picker(i, "stepParents", "Step-parents (own groups)")}
        </fieldset>
      ))}
      <button className="btn" onClick={build}>Suggest groups</button>
      {built ? (
        <div className="space-y-1">
          {built.length === 0 ? <p className="text-muted">Pick some family first.</p> : null}
          {built.map((p) => (
            <label key={p.key} className="flex items-start gap-2">
              <input type="checkbox" checked={ticked.has(p.key)} onChange={() => setTicked((t) => { const n = new Set(t); if (!n.delete(p.key)) n.add(p.key); return n; })} />
              <span>{p.title} <span className="text-xs text-muted">({p.people.length} people)</span></span>
            </label>
          ))}
          {built.length > 0 ? (
            <button
              className="btn-primary"
              disabled={disabled || ticked.size === 0}
              onClick={() => onAdd(built.filter((p) => ticked.has(p.key)).map((p) => ({ title: p.title, minutes: p.minutes, people: p.people.map((w) => (w.kind === "role" ? { kind: "role" as const, role: w.role } : { kind: w.kind, id: w.id })) })))}
            >
              Add {ticked.size} to this section
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FacesPanel({ data, section, onError, onDone }: { data: ShotListData; section: ShotSectionItem; onError: (e: string) => void; onDone: () => void }) {
  const inShots = new Set(data.sections.flatMap((s) => s.shots.flatMap((sh) => sh.people.filter((p) => p.kind === "guest").map((p) => (p as { id: string }).id))));
  const ids = new Set(section.shots.flatMap((sh) => sh.people.filter((p) => p.kind === "guest").map((p) => (p as { id: string }).id)));
  const rows = data.guests.filter((g) => ids.has(g.id) || (inShots.has(g.id) && (g.photoUrl || g.relationship)));
  const [busy, setBusy] = useState(false);

  async function upload(guestId: string, file: File) {
    setBusy(true);
    try {
      const slot = await requestGuestPhotoUpload(guestId, file.type, file.size);
      if (!slot.ok) return onError(slot.error);
      if (!(await putFile(slot.data.uploadUrl, file))) return onError("The upload didn't go through.");
      const saved = await confirmGuestPhoto(guestId, slot.data.path);
      if (!saved.ok) return onError(saved.error);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-4 text-sm">
      <p className="text-muted">Faces to know: shown to the photographer only through their day link. Your private guest notes never are.</p>
      {rows.length === 0 ? <p className="text-muted">Add guests to this section&rsquo;s shots first.</p> : null}
      {rows.map((g) => (
        <FaceRow key={g.id} guest={g} busy={busy} onUpload={(f) => void upload(g.id, f)} onRemove={async () => { const r = await removeGuestPhoto(g.id); if (!r.ok) return onError(r.error); onDone(); }} onSave={async (relationship, vendorNote) => { const r = await setGuestFace(g.id, { relationship, vendorNote }); if (!r.ok) return onError(r.error); onDone(); }} />
      ))}
    </div>
  );
}

function FaceRow({ guest, busy, onUpload, onRemove, onSave }: { guest: ShotListData["guests"][number]; busy: boolean; onUpload: (f: File) => void; onRemove: () => void; onSave: (relationship: string, note: string) => void }) {
  const [rel, setRel] = useState(guest.relationship ?? "");
  const [note, setNote] = useState(guest.vendorNote ?? "");
  return (
    <div className="flex flex-wrap items-start gap-3 border-t border-line pt-3 first:border-0 first:pt-0">
      {guest.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={guest.photoUrl} alt="" className="h-14 w-14 rounded object-cover" />
      ) : (
        <div className="h-14 w-14 rounded bg-black/5" />
      )}
      <div className="min-w-[12rem] flex-1 space-y-1">
        <div className="font-medium">{guest.name}</div>
        <input className="field" aria-label={`${guest.name}: relationship`} placeholder="Relationship (Aroha's grandmother)" value={rel} onChange={(e) => setRel(e.target.value)} maxLength={120} />
        <input className="field" aria-label={`${guest.name}: note for the photographer`} placeholder="Note for the photographer (needs a chair)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" disabled={rel === (guest.relationship ?? "") && note === (guest.vendorNote ?? "")} onClick={() => onSave(rel, note)}>Save</button>
          <label className="btn cursor-pointer">
            {guest.photoUrl ? "Change photo" : "Add photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(f); }} />
          </label>
          {guest.photoUrl ? <button className="btn text-red-700" disabled={busy} onClick={onRemove}>Remove photo</button> : null}
        </div>
      </div>
    </div>
  );
}

function ShotEditor({
  data,
  editing,
  pending,
  onClose,
  onSave,
  onDelete,
  onMove,
  onDuplicate,
  onError,
  onDone,
}: {
  data: ShotListData;
  editing: Editing;
  pending: boolean;
  onClose: () => void;
  onSave: (input: { sectionId: string; value: Parameters<typeof saveShot>[2] }) => void;
  onDelete: () => void;
  onMove: (sectionId: string) => void;
  onDuplicate: () => void;
  onError: (e: string) => void;
  onDone: () => void;
}) {
  const shot = editing.shot;
  const [title, setTitle] = useState(shot?.title ?? "");
  const [kind, setKind] = useState<ShotKind>(shot?.kind ?? "group");
  const [mustHave, setMustHave] = useState(shot?.mustHave ?? false);
  const [minutes, setMinutes] = useState(shot?.minutes ?? DEFAULT_MINUTES.group);
  const [note, setNote] = useState(shot?.note ?? "");
  const [shooter, setShooter] = useState<string>(shot?.shooter ?? "");
  const [people, setPeople] = useState<ShotPersonInput[]>(
    (shot?.people ?? []).map((p) => (p.kind === "role" ? { kind: "role" as const, role: p.role } : { kind: p.kind, id: p.id })),
  );
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing.selectTitle) titleRef.current?.select(); }, [editing.selectTitle]);

  const sec = data.sections.find((x) => x.id === editing.sectionId);
  const siblings = sec?.shots ?? [];
  const index = shot ? siblings.findIndex((x) => x.id === shot.id) : siblings.length;
  const above = index > 0 ? siblings[index - 1]! : null;
  const copyFrom = [
    ...siblings.filter((x) => x.id !== shot?.id).map((x) => ({ id: x.id, label: x.title, people: x.people })),
    ...data.sections.filter((x) => x.id !== editing.sectionId).flatMap((x) => x.shots.map((y) => ({ id: y.id, label: `${x.name}: ${y.title}`, people: y.people }))),
  ];

  async function uploadReference(file: File) {
    if (!shot) return;
    setBusy(true);
    try {
      const slot = await requestShotReferenceUpload(shot.id, file.type, file.size);
      if (!slot.ok) return onError(slot.error);
      if (!(await putFile(slot.data.uploadUrl, file))) return onError("The upload didn't go through.");
      const saved = await confirmShotReference(shot.id, slot.data.path);
      if (!saved.ok) return onError(saved.error);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <form
        className="max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-xl bg-white p-5 text-sm sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ sectionId: editing.sectionId, value: { title, kind, mustHave, minutes, note, shooter: (shooter || null) as "lead" | "second" | null, people } });
        }}
      >
        <h2 className="font-serif text-lg">{shot ? "Edit shot" : "New shot"}</h2>
        <label className="block">Title <input ref={titleRef} className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} autoFocus placeholder="The couple with Aroha's grandparents" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">Kind
            <select className="field mt-1" value={kind} onChange={(e) => { const k = e.target.value as ShotKind; setKind(k); if (!shot) setMinutes(DEFAULT_MINUTES[k]); }}>
              {(Object.keys(KIND_LABEL) as ShotKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="block">Minutes <input type="number" min={0} max={120} className="field mt-1" value={minutes} onChange={(e) => setMinutes(Math.max(0, Math.min(120, Number(e.target.value) || 0)))} /></label>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={mustHave} onChange={(e) => setMustHave(e.target.checked)} /> Must-have</label>
        <label className="block">Who shoots it
          <select className="field mt-1" value={shooter} onChange={(e) => setShooter(e.target.value)}>
            <option value="">Either</option>
            <option value="lead">Lead</option>
            <option value="second">Second shooter</option>
          </select>
        </label>

        <PeopleChooser
          data={data}
          people={people}
          onChange={setPeople}
          previous={above && above.people.length > 0 ? above : null}
          recent={recentPeople(siblings, index)}
          copyFrom={copyFrom}
        />

        <label className="block">Note for the photographer <textarea className="field mt-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Nan uses a walking stick" /></label>

        {shot ? (
          <div className="space-y-1">
            <div>Reference image</div>
            {shot.referenceUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.referenceUrl} alt="Reference" className="max-h-40 rounded" />
            ) : null}
            <div className="flex gap-2">
              <label className="btn cursor-pointer">
                {shot.referenceUrl ? "Change" : "Add an image"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadReference(f); }} />
              </label>
              {shot.referenceUrl ? <button type="button" className="btn text-red-700" onClick={async () => { const r = await removeShotReference(shot.id); if (!r.ok) return onError(r.error); onDone(); }}>Remove</button> : null}
            </div>
          </div>
        ) : null}

        {shot ? (
          <label className="block">Move to another section
            <select className="field mt-1" value="" onChange={(e) => e.target.value && onMove(e.target.value)}>
              <option value="">Keep it here</option>
              {data.sections.filter((s) => s.id !== editing.sectionId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-2 pt-1">
          {shot ? <button type="button" className="btn text-red-700" disabled={pending} onClick={onDelete}>Delete</button> : null}
          {shot ? <button type="button" className="btn" disabled={pending} onClick={onDuplicate}>Duplicate</button> : null}
          <button type="button" className="btn ml-auto" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={pending || !title.trim()}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function BulkAdd({ data, shotIds, section, pending, onClose, onApply }: { data: ShotListData; shotIds: string[]; section: ShotSectionItem; pending: boolean; onClose: () => void; onApply: (people: ShotPersonInput[]) => void }) {
  const [people, setPeople] = useState<ShotPersonInput[]>([]);
  const copyFrom = data.sections.flatMap((x) => x.shots.filter((y) => !shotIds.includes(y.id)).map((y) => ({ id: y.id, label: x.id === section.id ? y.title : `${x.name}: ${y.title}`, people: y.people })));
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-xl bg-white p-5 text-sm sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-lg">Add people to {shotIds.length} {shotIds.length === 1 ? "shot" : "shots"}</h2>
        <p className="text-muted">Anyone already in a shot is skipped.</p>
        <PeopleChooser data={data} people={people} onChange={setPeople} recent={[]} copyFrom={copyFrom} />
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn ml-auto" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={pending || people.length === 0} onClick={() => onApply(people)}>{pending ? "Adding…" : "Add"}</button>
        </div>
      </div>
    </div>
  );
}
