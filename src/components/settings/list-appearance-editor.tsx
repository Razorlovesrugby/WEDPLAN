"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateList } from "@/server/actions/lists";
import { LIST_COLOR_PALETTE, DEFAULT_LIST_COLOR } from "@/lib/list-colors";
import { InlineText } from "@/components/guests/inline-text";
import type { ListRow } from "@/lib/types/database";

export function ListAppearanceEditor({ lists }: { lists: ListRow[] }) {
  if (lists.length === 0) {
    return <p className="text-sm text-muted">No lists yet — generate the timeline from Setup first.</p>;
  }

  return (
    <ul className="card divide-y divide-line">
      {lists.map((list) => (
        <ListAppearanceRow key={list.id} list={list} />
      ))}
    </ul>
  );
}

function ListAppearanceRow({ list }: { list: ListRow }) {
  const router = useRouter();
  const [icon, setIcon] = useState(list.icon ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(patch: { color?: string; icon?: string }) {
    startTransition(async () => {
      const result = await updateList(list.id, patch);
      if (result.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  async function saveTitle(next: string) {
    const result = await updateList(list.id, { title: next });
    if (result.ok) router.refresh();
    return result;
  }

  const hasIcon = Boolean(list.icon);

  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      {/* A list is either a color or an emoji, never both — icon wins when set (spec 16 §2). */}
      {list.icon ? (
        <span className="w-3 flex-none text-center" aria-hidden>
          {list.icon}
        </span>
      ) : (
        <span
          className="h-3 w-3 flex-none rounded-full"
          style={{ backgroundColor: list.color ?? DEFAULT_LIST_COLOR }}
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1">
        <InlineText
          value={list.title}
          ariaLabel="List title"
          onSave={saveTitle}
          className="text-sm font-medium"
        />
      </span>

      <div
        className={`flex flex-wrap items-center gap-1 ${hasIcon ? "opacity-40" : ""}`}
        role="group"
        aria-label={`Color for ${list.title}`}
        title={hasIcon ? "Clear the icon to pick a color" : undefined}
      >
        {LIST_COLOR_PALETTE.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            title={swatch.name}
            disabled={pending || hasIcon}
            aria-pressed={!hasIcon && (list.color ?? DEFAULT_LIST_COLOR) === swatch.value}
            // Clicking a swatch while an icon is set clears the icon too — otherwise the
            // pick would be a silent no-op, since the icon still wins at render time.
            onClick={() => {
              setIcon("");
              save({ color: swatch.value, icon: "" });
            }}
            className={`h-6 w-6 rounded-full border-2 ${
              !hasIcon && (list.color ?? DEFAULT_LIST_COLOR) === swatch.value ? "border-ink" : "border-transparent"
            }`}
            style={{ backgroundColor: swatch.value }}
          />
        ))}
      </div>

      <input
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        onBlur={() => {
          if (icon !== (list.icon ?? "")) save({ icon });
        }}
        maxLength={4}
        placeholder="🎉"
        aria-label={`Icon for ${list.title}`}
        className="field w-16 flex-none text-center"
        disabled={pending}
      />

      {error ? <p className="w-full text-xs text-red-700">{error}</p> : null}
    </li>
  );
}
