#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Apply every migration to a throwaway PostgreSQL cluster, then run the SQL
# test suite against it. No Docker, no Supabase CLI, no network.
#
#   ./scripts/verify-migrations.sh
#
# Requires the PostgreSQL 15+ server binaries (initdb, pg_ctl, psql). On
# Debian/Ubuntu: apt-get install postgresql-16
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"

WORK="$(mktemp -d)"
PGDATA="$WORK/data"
SOCK="$WORK/sock"
PORT="${PGPORT:-5433}"
mkdir -p "$SOCK"

cleanup() {
  pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "==> initdb ($(pg_config --version))"
initdb -D "$PGDATA" -A trust -U postgres >/dev/null

echo "==> starting cluster on port $PORT"
pg_ctl -D "$PGDATA" \
  -o "-k $SOCK -p $PORT -c listen_addresses=''" \
  -l "$PGDATA/server.log" start >/dev/null
sleep 1

psql() { command psql -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U postgres -d wedplan "$@"; }
command psql -q -h "$SOCK" -p "$PORT" -U postgres -d postgres -c "create database wedplan" >/dev/null

echo "==> applying Supabase shim"
psql -q -f "$ROOT/supabase/tests/fixtures/supabase_shim.sql"

echo "==> applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  psql -q -f "$f"
done

echo "==> applying seed"
psql -q -f "$ROOT/supabase/seed.sql"

shopt -s nullglob
tests=("$ROOT"/supabase/tests/*.sql)
if [ ${#tests[@]} -gt 0 ]; then
  echo "==> running tests"
  total=0
  for f in "${tests[@]}"; do
    out="$(psql -q -f "$f" 2>&1)"
    n="$(grep -c '  ok  ' <<<"$out" || true)"
    total=$((total + n))
    echo "    $(basename "$f") — $n assertions"
    grep -E 'FAIL|ERROR' <<<"$out" && exit 1
  done
  echo "    $total assertions passed"
fi

echo
echo "PASS — migrations, seed and tests applied cleanly."
