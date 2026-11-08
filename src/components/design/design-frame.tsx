import type { ReactNode } from "react";
import { SubTabs } from "@/components/sub-tabs";
import { DESIGN_TABS } from "@/lib/nav-tabs";
import type { PreviewHousehold } from "@/lib/site/preview-households";
import { DesignPreview } from "./design-preview";

/**
 * Every Design tab's frame (spec 42 §5.3): "the design UI process should be
 * similar." The Design tabs, the title, then the controls beside a live
 * preview of what guests will see.
 *
 * Two editors already carry their own live preview, tied to unsaved state
 * (the invitation builder and the save-the-date editor); they pass no
 * `preview` and get the full width under the same header. Everything else
 * passes `preview` and gets the shared `DesignPreview` beside its controls.
 */
export function DesignFrame({
  title,
  description,
  actions,
  preview,
  children,
}: {
  /** Pages that already lay out their own heading inside the controls leave this out. */
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  preview?: {
    households: PreviewHousehold[];
    /** A block on the page to scroll to, e.g. "rsvp". */
    anchor?: string;
  };
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <SubTabs tabs={DESIGN_TABS} />
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl">{title}</h1>
            {description ? <div className="mt-1 max-w-2xl text-sm text-muted">{description}</div> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {preview ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">{children}</div>
          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <DesignPreview households={preview.households} anchor={preview.anchor} renderedAt={Date.now()} />
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
