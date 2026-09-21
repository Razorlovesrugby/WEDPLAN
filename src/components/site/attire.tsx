import { Label } from "./section";
import { Prose } from "./content";
import { PublicBoardView } from "@/components/moodboards/public-board";
import { coverageLabel, type ResolvedDressCode } from "@/lib/site/dress-codes";
import type { RenderContext } from "@/server/queries/site-render";

/**
 * The attire section (spec 25 §4).
 *
 * Each code in full: its name, THE EVENTS IT COVERS, and its labelled
 * guidance. The coverage line is a reverse lookup over the events — never a
 * typed list — which is what stops it disagreeing with the tag the schedule
 * prints on the event itself.
 *
 * The labels are whatever the couple wrote. "For her" and "For him" are what a
 * new code is pre-filled with and what most will keep; the schema takes no
 * view (spec 25 Answered, question 1), so this component takes none either and
 * simply prints what it is given.
 */
export function Attire({
  codes,
  boards,
}: {
  codes: ResolvedDressCode[];
  boards: RenderContext["boards"];
}) {
  if (codes.length === 0) return null;

  return (
    <div className="space-y-12">
      {codes.map((code) => {
        const coverage = coverageLabel(code);
        const codeBoard = code.board_id
          ? boards.find((entry) => entry.board.id === code.board_id)
          : null;

        return (
          <section key={code.id}>
            <h3 className="font-serif text-2xl italic text-ink">{code.name}</h3>
            {/* Omitted entirely rather than rendered as "For —": a code that
                covers nothing visible to this reader has no coverage line. */}
            {coverage ? (
              <p className="mt-1">
                <Label>For {coverage}</Label>
              </p>
            ) : null}

            {code.notes.length > 0 ? (
              <div className="mt-6 space-y-6">
                {code.notes.map((note) => {
                  const noteBoard = note.board_id
                    ? boards.find((entry) => entry.board.id === note.board_id)
                    : null;
                  return (
                    <div key={note.id}>
                      <Label>{note.label}</Label>
                      {note.body ? (
                        <div className="mt-1.5">
                          <Prose body={note.body} />
                        </div>
                      ) : null}
                      {noteBoard ? (
                        <div className="mt-4">
                          <PublicBoardView board={noteBoard} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {codeBoard ? (
              <div className="mt-6">
                <PublicBoardView board={codeBoard} />
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
