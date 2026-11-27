"use client";

import { useEffect, useState } from "react";
import type { PdfPlan } from "@/lib/seating/pdf-plan";

/** Which page of the PDF is the plan (spec 57 B.2). Pages are drawn in the browser; the PDF is never uploaded. */
export function PdfPagePicker({ plan, onUse, onCancel }: { plan: PdfPlan; onUse: (page: number) => void; onCancel: () => void }) {
  const [page, setPage] = useState(1);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    plan.preview(page, 280).then((url) => live && setSrc(url)).catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [plan, page]);
  return (
    <div className="card space-y-2 p-3 text-sm" role="dialog" aria-label="Choose the page that is the plan">
      <p className="font-medium">Which page is the plan?</p>
      <div className="flex items-center gap-2">
        <button type="button" className="btn py-1" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
          ‹
        </button>
        <span>
          Page {page} of {plan.pages}
        </span>
        <button type="button" className="btn py-1" disabled={page >= plan.pages} onClick={() => setPage(page + 1)} aria-label="Next page">
          ›
        </button>
      </div>
      <div className="flex min-h-[8rem] items-center justify-center rounded border border-line bg-paper p-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={`Page ${page}`} className="max-h-72 max-w-full" /> : <span className="text-muted">Drawing the page…</span>}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-primary py-1" onClick={() => onUse(page)}>
          Use this page
        </button>
        <button type="button" className="btn py-1" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
