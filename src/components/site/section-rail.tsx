import { blockAnchor, chapterName, sectionNumbers, type SiteBlock } from "@/lib/site/blocks";

/**
 * The chapter rail down the right edge (Editorial).
 *
 * One row per numbered chapter: a 12px hairline, then the chapter's title.
 * It is the same list `sectionNumbers` builds the eyebrows from, so the rail
 * and the page can never disagree about what chapter 04 is — a rail with its
 * own idea of the order is a rail that sends somebody to the wrong section
 * after a reorder.
 *
 * The anchors are `blockAnchor` — the same function `Shell` uses to put an id on
 * each section — so a second "What to wear" has a chapter entry of its own
 * rather than sharing the first one's (spec 28 §9.6). Each row reads
 * `chapterName`: the planner's title if they wrote one, else the small label,
 * so renaming a section renames it here too.
 *
 * Placement is entirely CSS (`.site-rail` in `globals.css`): fixed to the
 * right edge at 38vh, shown only on Editorial, only above 1180px — below that
 * there is no margin for it to sit in — and never inside the builder's
 * preview, where `position: fixed` would pin it to the editor window.
 */
export function SectionRail({ blocks }: { blocks: SiteBlock[] }) {
  const marks = [...sectionNumbers(blocks).entries()];
  // One chapter is not a table of contents.
  if (marks.length < 2) return null;

  const byId = new Map(blocks.map((block) => [block.id, block]));

  return (
    <nav aria-label="Chapters" className="site-rail no-print-site">
      <ul className="space-y-2.5">
        {marks.map(([id]) => {
          const block = byId.get(id);
          if (!block) return null;
          return (
            <li key={id}>
              <a
                href={`#${blockAnchor(block)}`}
                className="group flex items-center justify-end gap-2 text-muted hover:text-accent"
              >
                <span
                  aria-hidden="true"
                  className="h-px w-3 bg-current opacity-60 transition-opacity group-hover:opacity-100"
                />
                <span className="site-label text-[10px] tracking-[0.16em] text-current">
                  {chapterName(block)}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
