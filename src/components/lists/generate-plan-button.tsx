"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateTimelineTemplate } from "@/server/actions/lists";

export function GeneratePlanButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onGenerate() {
    startTransition(async () => {
      const result = await generateTimelineTemplate();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/lists/${result.data.listId}`);
    });
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button type="button" className="btn-primary" disabled={pending} onClick={onGenerate}>
        {pending ? "Generating…" : "Generate the countdown"}
      </button>
    </div>
  );
}
