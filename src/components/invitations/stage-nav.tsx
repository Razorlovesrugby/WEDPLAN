import Link from "next/link";
import {
  STAGES,
  STAGE_LABEL,
  STEPS,
  STEP_LABEL,
  journeyHref,
  type Stage,
  type StageProgress,
  type Step,
} from "@/lib/invitations/journey";

/**
 * The two stages in order, each with its progress, then the current stage's
 * three steps (spec 42 §5.4). Plain links with the stage and step in the URL,
 * so Back, bookmarks and an AI assistant land on the same view.
 */
export function StageNav({
  stage,
  step,
  progress,
}: {
  stage: Stage;
  step: Step;
  progress: Record<Stage, StageProgress>;
}) {
  return (
    <div className="space-y-3">
      <nav aria-label="Stages" className="grid gap-2 sm:grid-cols-2">
        {STAGES.map((candidate, index) => {
          const active = candidate === stage;
          const { done, total, caption } = progress[candidate];
          const percent = total === 0 ? 0 : Math.round((done / total) * 100);
          return (
            <Link
              key={candidate}
              href={journeyHref(candidate, candidate === stage ? step : "track")}
              aria-current={active ? "page" : undefined}
              className={`block rounded-lg border p-3 transition-colors ${
                active ? "border-ink bg-white" : "border-line bg-white/60 hover:border-ink/40"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium">
                  <span className="text-muted">{index + 1}.</span> {STAGE_LABEL[candidate]}
                </span>
                <span className="text-xs text-muted">{caption}</span>
              </span>
              <span
                className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-label={`${STAGE_LABEL[candidate]} sent`}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
              >
                <span className="block h-full bg-ink" style={{ width: `${percent}%` }} />
              </span>
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Steps" className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-line bg-line/30 p-0.5">
        {STEPS.map((candidate) => {
          const active = candidate === step;
          return (
            <Link
              key={candidate}
              href={journeyHref(stage, candidate)}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                active ? "bg-white font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {STEP_LABEL[candidate]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
