#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Verify supabase/bootstrap.sql against a clean cluster.
#
# Separate from verify-migrations.sh because bootstrap must run on an EMPTY
# database — the seed creates weddings, and bootstrap refuses when one exists.
#
# This is the one script a person runs by hand against their real project, so
# it is the one most worth testing: a broken bootstrap is the first thing they
# would hit, before anything else in the app has a chance to work.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"

WORK="$(mktemp -d)"
PGDATA="$WORK/data"
SOCK="$WORK/sock"
PORT="${PGPORT:-5441}"
mkdir -p "$SOCK"

cleanup() {
  pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

initdb -D "$PGDATA" -A trust -U postgres >/dev/null
pg_ctl -D "$PGDATA" -o "-k $SOCK -p $PORT -c listen_addresses=''" \
  -l "$PGDATA/server.log" start >/dev/null
sleep 1

run() { command psql -v ON_ERROR_STOP=1 -q -h "$SOCK" -p "$PORT" -U postgres -d wedplan "$@"; }
command psql -q -h "$SOCK" -p "$PORT" -U postgres -d postgres -c "create database wedplan" >/dev/null

run -f "$ROOT/supabase/tests/fixtures/supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do run -f "$f"; done

fail() { echo "FAIL — $1"; exit 1; }

echo "==> refuses when the invited user does not exist"
set +e; out="$(run -f "$ROOT/supabase/bootstrap.sql" 2>&1)"; set -e
grep -q "No user with email" <<<"$out" || fail "did not refuse a missing user"

echo "==> creates the wedding once the users exist"
run -c "insert into auth.users (email) values ('you@example.com'), ('them@example.com')"
run -f "$ROOT/supabase/bootstrap.sql" >/dev/null 2>&1

expect() {
  actual="$(run -tAc "$2")"
  [ "$actual" = "$3" ] || fail "$1 — expected $3, got $actual"
  echo "    ok  $1"
}

expect "one wedding"            "select count(*) from public.weddings"       1
expect "both collaborators"     "select count(*) from public.collaborators"  2
expect "ceremony and reception" "select count(*) from public.events"         2
# Five since 0023, not four: spec 22 added the built-in decline-note question
# (`ensure_builtin_questions`, fired by a trigger on weddings). This check was
# left at 4 in session 27 and has been failing ever since — found in session 29
# while running the full pass for spec 8.
expect "standard questions"     "select count(*) from public.rsvp_questions" 5
expect "site content blocks"    "select count(*) from public.site_content"   4

echo "==> the owner can see their own wedding through RLS"
# The whole point of bootstrapping in SQL is that the collaborators row exists
# before anyone signs in. If this returns 0, the app would redirect for ever.
visible="$(run -tAc "
  begin;
  select set_config('request.jwt.claim.sub',
    (select id::text from auth.users where email = 'you@example.com'), true);
  set local role authenticated;
  select count(*) from public.weddings;
  rollback;" | tail -n1 | tr -d '[:space:]')"   # set_config echoes a row first
[ "$visible" = "1" ] || fail "owner sees $visible weddings, expected 1"
echo "    ok  owner sees exactly their wedding"

echo "==> refuses to run a second time"
set +e; out="$(run -f "$ROOT/supabase/bootstrap.sql" 2>&1)"; set -e
grep -q "already exists" <<<"$out" || fail "ran a second time without complaint"

echo
echo "PASS — bootstrap applies cleanly and leaves a usable wedding."
