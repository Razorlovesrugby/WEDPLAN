#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Dump the database to two files (spec 32 §3).
#
#   ./scripts/backup-db.sh "$DATABASE_URL" ./out
#
# Used by .github/workflows/backup.yml for the nightly copy AND by
# scripts/verify-restore.sh, which proves the result restores. They share this
# script so the flags that are tested are the flags that run.
#
#   public.dump   schema + data of the `public` schema (everything the app owns,
#                 including audit_log), with privileges, so the RLS grants to
#                 anon/authenticated/service_role survive a restore.
#   auth.dump     DATA ONLY for auth.users and auth.identities, so people can
#                 still sign in after a restore. Nothing else of Supabase's
#                 managed schemas is taken: it is rebuilt by a new project.
#
# What this does NOT contain: Storage objects (scripts/backup-storage.mjs),
# Supabase project settings, environment variables, Vercel config.
#
# --no-owner because the owner on a new project is whoever restores. Privileges
# are KEPT (no --no-privileges): migrations revoke from anon and grant to
# authenticated, and a dump that dropped those would restore into an app that
# can't read its own tables.
# ---------------------------------------------------------------------------
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <database-url> <output-dir>" >&2
  exit 2
fi
URL="$1"
OUT="$2"
mkdir -p "$OUT"

pg_dump "$URL" --format=custom --no-owner --schema=public --file="$OUT/public.dump"

pg_dump "$URL" --format=custom --no-owner --data-only \
  --table=auth.users --table=auth.identities --file="$OUT/auth.dump" \
  || pg_dump "$URL" --format=custom --no-owner --data-only \
       --table=auth.users --file="$OUT/auth.dump"

# A file pg_restore can't read is not a backup. --list reads the whole table of
# contents without a database.
for f in public.dump auth.dump; do
  pg_restore --list "$OUT/$f" > /dev/null
  echo "==> $f  $(wc -c < "$OUT/$f") bytes"
done
