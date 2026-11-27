"use client";

import { useState } from "react";
import { confirmSeatingBackground, requestSeatingBackgroundUpload } from "@/server/actions/seating";
import { toWebp } from "@/lib/site/encode-image";
import { UPLOAD_CACHE_CONTROL } from "@/lib/storage-cache";
import { isPdf, openPdfPlan, type PdfPlan } from "@/lib/seating/pdf-plan";
import { useSeating } from "./seating-state";

/**
 * Puts the venue's own plan under the shown space: encode it, upload it
 * straight to storage with a signed URL (the bytes never pass through an
 * action), then record it. Used by the Venue panel and "The room" settings.
 */
export function useBackgroundUpload() {
  const { eventId, layoutId, spaceId, refresh, setError } = useSeating();
  const [busy, setBusy] = useState<string | null>(null);
  /** A PDF with more than one page waits here while the person picks which page is the plan. */
  const [pdf, setPdf] = useState<PdfPlan | null>(null);

  const uploadImage = async (file: File): Promise<boolean> => {
    setBusy("Uploading…");
    const fail = (message: string) => {
      setBusy(null);
      setError(message);
      return false;
    };
    const encoded = await toWebp(file, 3000);
    if (!encoded) return fail("Couldn't read that image — a JPEG, PNG or WebP works best.");
    const slot = await requestSeatingBackgroundUpload(eventId, { content_type: "image/webp", byte_size: encoded.blob.size });
    if (!slot.ok) return fail(slot.error);
    const put = await fetch(slot.data.uploadUrl, {
      method: "PUT",
      body: encoded.blob,
      headers: { "content-type": "image/webp", "cache-control": UPLOAD_CACHE_CONTROL },
    }).catch(() => null);
    if (!put?.ok) return fail("That upload didn't finish. Try again?");
    const done = await confirmSeatingBackground(eventId, { path: slot.data.path, width: encoded.width, height: encoded.height }, layoutId, spaceId);
    setBusy(null);
    if (!done.ok) {
      setError(done.error);
      return false;
    }
    refresh();
    return true;
  };

  /** A PDF is drawn in the browser (one page: that one; several: the person chooses), then goes the way an image does. The PDF itself is never uploaded. */
  const upload = async (file: File): Promise<boolean> => {
    if (!isPdf(file)) return uploadImage(file);
    setBusy("Opening the PDF…");
    try {
      const plan = await openPdfPlan(file);
      if (plan.pages > 1) {
        setPdf(plan);
        setBusy(null);
        return false;
      }
      return await takePdfPage(plan, 1);
    } catch {
      setBusy(null);
      setError("Couldn't read that PDF. A photo or screenshot of the plan works too.");
      return false;
    }
  };

  const takePdfPage = async (plan: PdfPlan, page: number): Promise<boolean> => {
    setBusy("Drawing the page…");
    try {
      const { blob } = await plan.render(page);
      plan.destroy();
      setPdf(null);
      return await uploadImage(new File([blob], "plan.png", { type: "image/png" }));
    } catch {
      setBusy(null);
      setError("Couldn't draw that page. A photo or screenshot of the plan works too.");
      return false;
    }
  };

  return {
    busy,
    upload,
    pdf,
    takePdfPage: (page: number) => (pdf ? takePdfPage(pdf, page) : Promise.resolve(false)),
    cancelPdf: () => {
      pdf?.destroy();
      setPdf(null);
    },
  };
}
