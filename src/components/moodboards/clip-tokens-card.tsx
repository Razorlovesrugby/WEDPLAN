"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClipToken, revokeClipToken } from "@/server/actions/moodboards";
import type { MoodboardClipTokenRow, MoodboardRow } from "@/lib/types/database";

/**
 * Clip tokens — one per browser, so "revoke my old laptop" is a button.
 *
 * The raw token appears exactly once, here, because what is stored is a hash
 * of it. Same rule as an invitation link.
 */
export function ClipTokensCard({
  tokens,
  boards,
}: {
  tokens: MoodboardClipTokenRow[];
  boards: Pick<MoodboardRow, "id" | "title">[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [boardId, setBoardId] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const live = tokens.filter((token) => token.revoked_at === null);

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-serif text-xl">Clipper</h2>
      <p className="text-sm text-muted">
        The Chrome extension in <code>extension/</code> right-clicks any image on the web into a
        board. It needs one of these tokens, pasted into its options page.
      </p>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {fresh ? (
        <div className="rounded border border-accent bg-accent/5 p-3">
          <p className="text-sm font-medium">Copy this now — it isn&rsquo;t shown again.</p>
          <p className="mt-1 break-all font-mono text-xs">{fresh}</p>
          <button type="button" className="btn mt-2" onClick={() => void navigator.clipboard.writeText(fresh)}>
            Copy
          </button>
        </div>
      ) : null}

      {live.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {live.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
              <span className="font-medium">{token.label}</span>
              <span className="text-muted">
                {token.last_used_at
                  ? `last used ${new Date(token.last_used_at).toLocaleDateString()}`
                  : "never used"}
              </span>
              <button
                type="button"
                className="btn ml-auto text-red-700"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await revokeClipToken(token.id);
                    if (!result.ok) setError(result.error);
                    else router.refresh();
                  })
                }
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="text-muted">Which browser?</span>
          <input
            className="field mt-1"
            placeholder="My laptop"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="text-muted">Default board</span>
          <select className="field mt-1" value={boardId} onChange={(event) => setBoardId(event.target.value)}>
            <option value="">First board</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn-primary mb-1"
          disabled={pending || !label.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await createClipToken(label, boardId || null);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setFresh(result.data.token);
              setLabel("");
              router.refresh();
            })
          }
        >
          Create token
        </button>
      </div>
    </section>
  );
}
