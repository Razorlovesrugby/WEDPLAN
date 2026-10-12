#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Prove the nightly backup restores (spec 32 §3.3).
#
#   ./scripts/verify-restore.sh
#
# A backup nobody has restored is a hope. This builds a database the way the
# real one is built (shim + every migration + the seed), dumps it with
# scripts/backup-db.sh — the SAME script the nightly workflow runs — then
# restores into a second, freshly migrated database by the steps in
# docs/RESTORE.md, and compares the two:
#
#   * every public table has the same number of rows, plus auth.users;
#   * policies, user triggers and table grants match (a dump that lost the
#     grants would restore into an app that can't read its own tables);
#   * a restored collaborator still sees exactly their own wedding through RLS;
#   * the audit_log id sequence survived, so the next change doesn't collide.
#
# Needs the PostgreSQL server AND client binaries (initdb, pg_dump,
# pg_restore). No network. What it cannot prove: Supabase's managed schemas
# and role privileges behave like plain Postgres — see docs/RESTORE.md.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"

WORK="$(mktemp -d)"
PGDATA="$WORK/data"
SOCK="$WORK/sock"
PORT="${PGPORT:-5445}"
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

export PGOPTIONS="-c client_min_messages=warning"
psql_in() { local db="$1"; shift; command psql -v ON_ERROR_STOP=1 -q -At -h "$SOCK" -p "$PORT" -U postgres -d "$db" "$@"; }
url() { echo "postgresql://postgres@/$1?host=$SOCK&port=$PORT"; }

command psql -q -h "$SOCK" -p "$PORT" -U postgres -d postgres -c "create database src" >/dev/null
command psql -q -h "$SOCK" -p "$PORT" -U postgres -d postgres -c "create database dst" >/dev/null

# A new project, as RESTORE.md step 1 leaves it: managed surface + every migration.
build() {
  psql_in "$1" -f "$ROOT/supabase/tests/fixtures/supabase_shim.sql" >/dev/null
  for f in "$ROOT"/supabase/migrations/*.sql; do psql_in "$1" -f "$f" >/dev/null; done
}
echo "==> building the source database (shim + migrations + seed)"
build src
psql_in src -f "$ROOT/supabase/seed.sql" >/dev/null

echo "==> dumping with scripts/backup-db.sh"
"$ROOT/scripts/backup-db.sh" "$(url src)" "$WORK/dump"

echo "==> building a fresh target (RESTORE.md step 1)"
build dst

echo "==> restoring with scripts/restore-db.sh (RESTORE.md steps 2–3)"
"$ROOT/scripts/restore-db.sh" "$(url dst)" "$WORK/dump"

# Row count of every public base table, plus auth.users, as "table|n" lines.
COUNTS="
select quote_ident(table_schema) || '.' || quote_ident(table_name) || '|' ||
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables
 where table_type = 'BASE TABLE'
   and (table_schema = 'public' or (table_schema = 'auth' and table_name = 'users'))
 order by 1;"

# Things that live outside the rows and are easy to lose in a dump.
SHAPE="
select 'policy|' || tablename || '|' || policyname from pg_policies where schemaname = 'public'
union all select 'trigger|' || c.relname || '|' || t.tgname
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and not t.tgisinternal
union all select 'grant|' || table_name || '|' || grantee || '|' || privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
union all select 'function|' || p.proname || '|' || pg_get_function_identity_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all select 'view|' || viewname from pg_views where schemaname = 'public'
order by 1;"

fail=0
compare() {
  local what="$1" sql="$2"
  psql_in src -c "$sql" > "$WORK/src.txt"
  psql_in dst -c "$sql" > "$WORK/dst.txt"
  if ! diff -u "$WORK/src.txt" "$WORK/dst.txt" > "$WORK/diff.txt"; then
    echo "!! $what differ after restore:"; cat "$WORK/diff.txt"; fail=1
  else
    echo "    $what match ($(wc -l < "$WORK/src.txt") checked)"
  fi
}
echo "==> comparing"
compare "row counts" "$COUNTS"
compare "policies / triggers / grants / functions / views" "$SHAPE"

# Not vacuous: the tables we care most about actually have data to lose.
for t in public.households public.guests public.audit_log auth.users; do
  n="$(psql_in dst -c "select count(*) from $t")"
  if [ "$n" -eq 0 ]; then echo "!! $t is empty after restore"; fail=1; else echo "    $t has $n rows"; fi
done

# RLS still keys on the restored collaborator rows.
rls="select count(*) from public.households"
seen_src="$(psql_in src -c "begin; select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',true); set local role authenticated; $rls; rollback;" | grep -E '^[0-9]+$' | head -1)"
seen_dst="$(psql_in dst -c "begin; select set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',true); set local role authenticated; $rls; rollback;" | grep -E '^[0-9]+$' | head -1)"
if [ -z "$seen_dst" ] || [ "$seen_src" != "$seen_dst" ]; then
  echo "!! a restored collaborator sees $seen_dst households through RLS, the source shows $seen_src"; fail=1
else
  echo "    a restored collaborator sees $seen_dst households through RLS, as in the source"
fi

# The identity sequence came back at the right value: a new change must not collide.
if ! psql_in dst -c "insert into public.tags (wedding_id, name) values ('11111111-1111-4111-8111-111111111111', 'after restore')" >/dev/null; then
  echo "!! the first write after a restore failed (audit_log sequence not restored?)"; fail=1
else
  echo "    the first write after the restore succeeded and was audited"
fi

if [ "$fail" -ne 0 ]; then
  echo; echo "FAIL — the backup does not restore cleanly."; exit 1
fi
echo; echo "PASS — dumped with backup-db.sh and restored into a fresh database; the two match."
