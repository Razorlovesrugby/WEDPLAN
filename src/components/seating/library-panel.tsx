"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteCustomItem, deleteMarquee, saveCustomItem, saveMarquee } from "@/server/actions/seating-library";
import { banquetPreset } from "@/lib/seating/geometry";
import { GROUP_LABEL, isStampable, libraryTiles, searchLibrary, tileByRef, tileDrawSize, type LibraryGroup, type LibraryTile } from "@/lib/seating/library";
import { moveFavourite, toggleFavourite } from "@/lib/seating/stamp";
import { setSeatingFavourites } from "@/server/actions/seating-workspace";
import { useRecentStamps } from "./canvas-prefs";
import { SELECT, type PlaceItem } from "@/lib/seating/tools";
import { useSeating } from "./seating-state";

/** The data a tile carries when it is dragged onto the canvas. */
export const DRAG_ITEM_TYPE = "application/x-wedplan-item";
/** What a favourite carries when it is dragged along the Favourites row, to reorder it. */
const DRAG_FAVOURITE_TYPE = "application/x-wedplan-favourite";

const GROUPS: LibraryGroup[] = ["tables", "room", "decor", "outdoors"];

/**
 * The Library (spec 57 A.3): to-scale tiles to drag onto the space, or click
 * and then click the spot (spec 45: nothing needs a drag). The couple's own
 * décor and marquee templates sit with the built-in items.
 */
export function LibraryPanel() {
  const { eventId, data, tool, setTool, setError, refresh, settings } = useSeating();
  const [query, setQuery] = useState("");
  const [setup, setSetup] = useState<LibraryTile | null>(null);
  const [adding, setAdding] = useState<"item" | "marquee" | null>(null);
  const [pending, startTransition] = useTransition();

  const all = libraryTiles(data.customItems, data.marquees, settings.defaultSizes);
  const tiles = searchLibrary(all, query);
  const placing = tool.kind === "place" ? tool.item : null;
  // The tile in hand: compared by what it is, since the couple's own tiles are rebuilt on every render.
  const isActive = (tile: LibraryTile) => placing !== null && JSON.stringify(placing) === JSON.stringify(tile.item);

  // Favourites (spec 59 Part C): wedding-wide, kept in the plan's settings; the star shows at once and is put back if the save fails.
  const stored = settings.favourites;
  const storedKey = stored.join("|");
  const [favs, setFavs] = useState(stored);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setFavs(stored), [storedKey]);
  const [recent] = useRecentStamps();
  const saveFavs = (next: string[]) => {
    setFavs(next);
    startTransition(async () => {
      const r = await setSeatingFavourites(eventId, next);
      if (!r.ok) {
        setError(r.error);
        setFavs(stored);
      }
      refresh();
    });
  };
  const favTiles = favs.flatMap((ref) => tileByRef(all, ref) ?? []);
  const recentTiles = recent.filter((ref) => !favs.includes(ref)).flatMap((ref) => tileByRef(all, ref) ?? []);

  const choose = (tile: LibraryTile) => {
    if (tile.needsSetup) {
      setSetup(setup?.id === tile.id ? null : tile);
      return;
    }
    // Choosing a tile starts Stamp with it: each click on the plan puts one down, until Esc (spec 59 Part C).
    setTool(isActive(tile) ? SELECT : { kind: "place", item: tile.item });
  };

  return (
    <div className="space-y-3 text-sm" aria-label="Library">
      <input className="field w-full" type="search" placeholder="Search the library" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the library" />
      {placing ? (
        <p className="rounded bg-accent/10 px-2 py-1.5 text-xs">
          Stamping <strong>{placing.label}</strong>: click the plan to put one down, as many as you like. <button type="button" className="underline" onClick={() => setTool(SELECT)}>Stop (Esc)</button>
        </p>
      ) : (
        <p className="text-xs text-muted">Drag a tile onto the plan to put one down, or click it to stamp as many as you like. ★ keeps a tile at the top.</p>
      )}

      {favTiles.length > 0 && query.trim() === "" ? (
        <section aria-label="Favourites">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Favourites</h3>
          <ul className="grid grid-cols-3 gap-1.5">
            {favTiles.map((tile, i) => (
              <li
                key={tile.id}
                className="group relative"
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DRAG_FAVOURITE_TYPE, tile.id)}
                onDragOver={(e) => e.dataTransfer.types.includes(DRAG_FAVOURITE_TYPE) && e.preventDefault()}
                onDrop={(e) => {
                  const ref = e.dataTransfer.getData(DRAG_FAVOURITE_TYPE);
                  if (!ref || ref === tile.id) return;
                  e.preventDefault();
                  saveFavs(moveFavourite(favs, ref, i));
                }}
              >
                <TileCell tile={tile} active={isActive(tile) || setup?.id === tile.id} starred onChoose={() => choose(tile)} onStar={() => saveFavs(toggleFavourite(favs, tile.id))} />
                <div className="absolute inset-x-0 -bottom-2 z-10 hidden justify-between px-0.5 group-focus-within:flex group-hover:flex">
                  <button type="button" className="rounded bg-white/90 px-1 text-xs shadow-sm disabled:opacity-30" disabled={i === 0} aria-label={`Move ${tile.label} earlier`} onClick={() => saveFavs(moveFavourite(favs, tile.id, i - 1))}>
                    ‹
                  </button>
                  <button type="button" className="rounded bg-white/90 px-1 text-xs shadow-sm disabled:opacity-30" disabled={i === favTiles.length - 1} aria-label={`Move ${tile.label} later`} onClick={() => saveFavs(moveFavourite(favs, tile.id, i + 1))}>
                    ›
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {recentTiles.length > 0 && query.trim() === "" ? (
        <section aria-label="Recent">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Recent</h3>
          <ul className="grid grid-cols-3 gap-1.5">
            {recentTiles.map((tile) => (
              <li key={tile.id}>
                <TileCell tile={tile} active={isActive(tile) || setup?.id === tile.id} starred={favs.includes(tile.id)} onChoose={() => choose(tile)} onStar={() => saveFavs(toggleFavourite(favs, tile.id))} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {GROUPS.map((group) => {
        const inGroup = tiles.filter((t) => t.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} aria-label={GROUP_LABEL[group]}>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{GROUP_LABEL[group]}</h3>
            <ul className="grid grid-cols-3 gap-1.5">
              {inGroup.map((tile) => (
                <li key={tile.id}>
                  <TileCell tile={tile} active={isActive(tile) || setup?.id === tile.id} starred={favs.includes(tile.id)} onChoose={() => choose(tile)} onStar={() => saveFavs(toggleFavourite(favs, tile.id))} />
                </li>
              ))}
            </ul>
            {group === "decor" ? (
              <button type="button" className="mt-2 text-xs underline" onClick={() => setAdding(adding === "item" ? null : "item")}>
                + Add your own item
              </button>
            ) : null}
            {group === "outdoors" ? (
              <button type="button" className="mt-2 text-xs underline" onClick={() => setAdding(adding === "marquee" ? null : "marquee")}>
                + Add a marquee
              </button>
            ) : null}
            {group === "decor" && adding === "item" ? (
              <CustomItemForm
                vendors={data.vendors}
                pending={pending}
                onSave={(input) =>
                  startTransition(async () => {
                    const r = await saveCustomItem(eventId, input);
                    if (!r.ok) setError(r.error);
                    else setAdding(null);
                    refresh();
                  })
                }
              />
            ) : null}
            {group === "outdoors" && adding === "marquee" ? (
              <MarqueeForm
                pending={pending}
                onSave={(input) =>
                  startTransition(async () => {
                    const r = await saveMarquee(eventId, input);
                    if (!r.ok) setError(r.error);
                    else setAdding(null);
                    refresh();
                  })
                }
              />
            ) : null}
          </section>
        );
      })}
      {tiles.length === 0 ? <p className="text-muted">Nothing in the library matches “{query}”.</p> : null}

      {setup ? (
        <SetupForm
          tile={setup}
          onPlace={(item) => {
            setTool({ kind: "place", item });
            setSetup(null);
          }}
          onCancel={() => setSetup(null)}
        />
      ) : null}

      {data.customItems.length > 0 || data.marquees.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">Your items and marquees</summary>
          <ul className="mt-1 divide-y divide-line rounded border border-line">
            {data.customItems.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-2 py-1">
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-muted">{c.width_cm} × {c.depth_cm} cm</span>
                <button type="button" className="text-red-700 underline" disabled={pending} onClick={() => startTransition(async () => { const r = await deleteCustomItem(eventId, c.id); if (!r.ok) setError(r.error); refresh(); })}>
                  Remove
                </button>
              </li>
            ))}
            {data.marquees.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-2 py-1">
                <span className="flex-1 truncate">{m.name}</span>
                <span className="text-muted">{m.width_cm / 100} × {m.length_cm / 100} m</span>
                <button type="button" className="text-red-700 underline" disabled={pending} onClick={() => startTransition(async () => { const r = await deleteMarquee(eventId, m.id); if (!r.ok) setError(r.error); refresh(); })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** A tile with its star: the star is a button of its own, beside the tile's, never inside it. */
function TileCell({ tile, active, starred, onChoose, onStar }: { tile: LibraryTile; active: boolean; starred: boolean; onChoose: () => void; onStar: () => void }) {
  return (
    <div className="relative">
      <Tile tile={tile} active={active} onChoose={onChoose} />
      <button
        type="button"
        aria-pressed={starred}
        aria-label={starred ? `Take ${tile.label} off your favourites` : `Add ${tile.label} to your favourites`}
        title={starred ? "Favourite" : "Add to favourites"}
        className={`absolute right-0.5 top-0.5 rounded px-1 text-sm leading-none ${starred ? "text-amber-600" : "text-muted/60 hover:text-amber-600"}`}
        onClick={onStar}
      >
        {starred ? "★" : "☆"}
      </button>
    </div>
  );
}

function Tile({ tile, active, onChoose }: { tile: LibraryTile; active: boolean; onChoose: () => void }) {
  const size = tileDrawSize(tile, 44);
  const round = tile.item.type === "table" ? tile.item.shape === "round" : tile.item.kind === "tree" || tile.item.kind === "plant" || tile.item.kind === "lantern";
  return (
    <button
      type="button"
      draggable={!tile.needsSetup}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_ITEM_TYPE, JSON.stringify(tile.item));
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onChoose}
      aria-pressed={active}
      title={tile.label}
      className={`flex h-[4.5rem] w-full flex-col items-center justify-between rounded border px-1 py-1.5 text-center text-[0.7rem] leading-tight ${active ? "border-ink bg-line/50" : "border-line hover:bg-line/30"}`}
    >
      <span className="flex h-11 items-center justify-center">
        <svg width={size.w} height={size.h} aria-hidden>
          {round ? <ellipse cx={size.w / 2} cy={size.h / 2} rx={size.w / 2 - 0.5} ry={size.h / 2 - 0.5} fill="#f3efe8" stroke="#8a8580" /> : <rect x={0.5} y={0.5} width={size.w - 1} height={size.h - 1} fill="#f3efe8" stroke="#8a8580" />}
        </svg>
      </span>
      <span className="w-full truncate">{tile.label}</span>
    </button>
  );
}

/** Rows and banquet runs need a few choices before they can be placed. */
function SetupForm({ tile, onPlace, onCancel }: { tile: LibraryTile; onPlace: (item: PlaceItem) => void; onCancel: () => void }) {
  const [rows, setRows] = useState("10");
  const [perRow, setPerRow] = useState("10");
  const [aisle, setAisle] = useState("1.2");
  const [kind, setKind] = useState<"straight" | "l" | "u">("straight");
  const [pieces, setPieces] = useState("3");
  const [pieceM, setPieceM] = useState("3");
  const [capacity, setCapacity] = useState("24");
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v.replace(",", "."))) && Number(v.replace(",", ".")) > 0 ? Number(v.replace(",", ".")) : fallback);

  return (
    <form
      className="card space-y-2 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (tile.needsSetup === "rows") {
          const r = Math.min(100, Math.max(1, Math.round(num(rows, 10))));
          const p = Math.min(40, Math.max(2, Math.round(num(perRow, 10))));
          onPlace({ type: "table", shape: "rows", capacity: Math.min(400, r * p), label: "Ceremony", extra: { rows_count: r, aisle_cm: Math.round(num(aisle, 1.2) * 100) } });
        } else {
          onPlace({
            type: "table",
            shape: "banquet",
            capacity: Math.min(400, Math.max(2, Math.round(num(capacity, 24)))),
            label: "Banquet",
            extra: { segments: banquetPreset(kind, Math.round(num(pieceM, 3) * 100), Math.round(num(pieces, 3))) },
          });
        }
      }}
    >
      <p className="text-xs font-medium">{tile.label}</p>
      {tile.needsSetup === "rows" ? (
        <div className="grid grid-cols-3 gap-2">
          <label>
            <span className="mb-1 block text-xs text-muted">Rows</span>
            <input className="field w-full" inputMode="numeric" value={rows} onChange={(e) => setRows(e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">Chairs per row</span>
            <input className="field w-full" inputMode="numeric" value={perRow} onChange={(e) => setPerRow(e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">Aisle (m)</span>
            <input className="field w-full" inputMode="decimal" value={aisle} onChange={(e) => setAisle(e.target.value)} />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="mb-1 block text-xs text-muted">Shape</span>
            <select className="field w-full" value={kind} onChange={(e) => setKind(e.target.value as "straight" | "l" | "u")}>
              <option value="straight">Straight</option>
              <option value="l">L</option>
              <option value="u">U</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">Seats</span>
            <input className="field w-full" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">Piece length (m)</span>
            <input className="field w-full" inputMode="decimal" value={pieceM} onChange={(e) => setPieceM(e.target.value)} />
          </label>
          {kind === "straight" ? (
            <label>
              <span className="mb-1 block text-xs text-muted">Pieces</span>
              <input className="field w-full" inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} />
            </label>
          ) : null}
          <p className="col-span-2 text-xs text-muted">A T is two runs: a straight one with a second set across its middle.</p>
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary py-1">
          Then click the spot
        </button>
        <button type="button" className="btn py-1" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CustomItemForm({ vendors, pending, onSave }: { vendors: { id: string; name: string }[]; pending: boolean; onSave: (input: unknown) => void }) {
  const [name, setName] = useState("");
  const [shape, setShape] = useState<"rect" | "round">("rect");
  const [w, setW] = useState("100");
  const [d, setD] = useState("100");
  const [colour, setColour] = useState("#d9c7a3");
  const [vendor, setVendor] = useState("");
  return (
    <form
      className="card mt-2 space-y-2 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, shape, width_cm: Math.round(Number(w)), depth_cm: Math.round(Number(d)), colour, vendor_id: vendor || null });
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Name</span>
        <input className="field w-full" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Neon sign, hay bales…" />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className="mb-1 block text-xs text-muted">Shape</span>
          <select className="field w-full" value={shape} onChange={(e) => setShape(e.target.value as "rect" | "round")}>
            <option value="rect">Rectangle</option>
            <option value="round">Round</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Width (cm)</span>
          <input className="field w-full" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Depth (cm)</span>
          <input className="field w-full" inputMode="numeric" value={d} onChange={(e) => setD(e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-[auto,1fr] items-end gap-2">
        <label>
          <span className="mb-1 block text-xs text-muted">Colour</span>
          <input type="color" className="h-9 w-12 rounded border border-line" value={colour} onChange={(e) => setColour(e.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Supplier (optional)</span>
          <select className="field w-full" value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">None</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" className="btn-primary py-1" disabled={pending || !name.trim()}>
        Save the item
      </button>
    </form>
  );
}

function MarqueeForm({ pending, onSave }: { pending: boolean; onSave: (input: unknown) => void }) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState("6");
  const [length, setLength] = useState("12");
  const [spacing, setSpacing] = useState("3");
  const [middle, setMiddle] = useState(false);
  const [rounded, setRounded] = useState(false);
  const m = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
  return (
    <form
      className="card mt-2 space-y-2 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, width_cm: m(width), length_cm: m(length), pole_spacing_cm: spacing.trim() ? m(spacing) : null, middle_poles: middle, rounded_ends: rounded });
      }}
    >
      <p className="text-xs text-muted">Enter the marquee the hire company is bringing.</p>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Name</span>
        <input className="field w-full" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="The 6 × 12 m" />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className="mb-1 block text-xs text-muted">Width (m)</span>
          <input className="field w-full" inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Length (m)</span>
          <input className="field w-full" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Poles every (m)</span>
          <input className="field w-full" inputMode="decimal" value={spacing} onChange={(e) => setSpacing(e.target.value)} placeholder="none" />
        </label>
      </div>
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={middle} onChange={(e) => setMiddle(e.target.checked)} /> Poles down the middle too
      </label>
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={rounded} onChange={(e) => setRounded(e.target.checked)} /> Rounded ends
      </label>
      <button type="submit" className="btn-primary py-1" disabled={pending || !name.trim()}>
        Save the marquee
      </button>
    </form>
  );
}
