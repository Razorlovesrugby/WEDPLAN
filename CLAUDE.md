# Instructions for Claude Code working in this repo

## Spec requests are not build authorization

If the person asks for a **spec**, write the spec file under `docs/specs/`
and stop. Do not write migrations, edit application code, run `npm`
commands beyond what's needed to check the spec's facts, or commit/push
anything beyond the spec doc itself — until they say to build it, in
words that actually mean "write code" (e.g. "build it," "implement it,"
"go ahead and make the change").

**Answering a spec's open questions is not the same as authorizing a
build.** If the person responds to a spec with decisions — "make it X,"
"just hardcode Y," "drop the Z requirement" — that is content for the
spec, not a green light. Update the spec doc with their answers and stop
there. Ask explicitly before touching code: "Want me to update the spec
with this, or go ahead and build it?"

This distinction exists in `docs/specs/README.md` already ("a spec is not
a green light... nothing beyond schema is built until its open questions
are answered") — treat that as binding, not as background color to
pattern-match against. Prior sessions in `docs/HANDOFF.md` that show
"decided, then built, same session" are a record of what happened when
the planner explicitly said to proceed each time, not a template to
apply on your own judgment when the person's tone sounds decisive.

**Why this is written down:** a session spec'd, then built, committed,
and pushed a real feature (NZD-only budget + GST toggle, session 22) after
the person had only ever asked for a spec and then answered questions
about its content — never once said "build" until after the fact. The
proximate cause was pattern-matching the person's decisive tone to this
repo's own "decided → built same session" history instead of checking
what was actually asked. Don't repeat that: the person's words this turn
are the instruction, not what similar-sounding turns meant in past
sessions.

## When in doubt

For any action that's hard to reverse or touches more than the file the
person is discussing — a migration, a delete, a multi-file refactor, a
commit, a push — pause and confirm the scope before starting, even if you
are confident about the technical approach. Confirming costs one message;
an unwanted build costs a revert and the person's trust.
