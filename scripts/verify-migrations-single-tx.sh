#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Apply every migration the way the Supabase SQL editor does: one file per
# paste, each paste a single implicit transaction.
#
#   ./scripts/verify-migrations-single-tx.sh
#
# This is the companion to verify-migrations.sh, and it exists because that
# script cannot catch this class of bug by design. psql -f applies a file
# statement-by-statement, each its own transaction — so does the Supabase CLI.
# The dashboard's SQL editor does not: a pasted script runs as ONE implicit
# transaction, and some statements are illegal in the same transaction as the
# DDL they depend on.
#
# Session 21 found the first instance: `alter type ... add value` followed by
# any use of that value throws `55P04 unsafe use of new value`, which is why
# 0011 is split into two files. Adding a column and then updating through it,
# or creating a function and then calling it, are both fine — the enum case is
# the unusual one, and there is no way to know which is which by reading.
#
# The planner applies migrations by hand in that editor, so this is the path
# that actually matters for a live project.
#
# Same constraints as verify-migrations.sh: PostgreSQL 15+ server binaries, no
# Docker, no network, and it must not run as root because initdb refuses.
# ---------------------------------------------------------------------------
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
WORK="$(mktemp -d)"; PGDATA="$WORK/data"; SOCK="$WORK/sock"; PORT="${PGPORT:-5434}"
mkdir -p "$SOCK"
trap 'pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
echo "==> initdb ($(pg_config --version))"
initdb -D "$PGDATA" -A trust -U postgres >/dev/null
pg_ctl -D "$PGDATA" -o "-k $SOCK -p $PORT -h ''" -w start >/dev/null
export PGHOST="$SOCK" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/fixtures/supabase_shim.sql" >/dev/null
echo "==> applying each migration as one transaction"
fails=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  name="$(basename "$f")"
  if psql -q -1 -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$WORK/err"; then
    echo "  ok   $name"
  else
    echo "  FAIL $name"; sed 's/^/        /' "$WORK/err" | head -4; fails=$((fails+1))
  fi
done
echo
[ "$fails" -eq 0 ] && echo "PASS — every migration applies as a single transaction." || { echo "$fails file(s) failed"; exit 1; }
