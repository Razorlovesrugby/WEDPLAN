#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Restore a backup made by scripts/backup-db.sh (spec 32 §3.3).
#
#   ./scripts/restore-db.sh "$TARGET_DATABASE_URL" ./decrypted-dump-dir
#
# The target must already have every migration applied (docs/RESTORE.md step
# 1). That is what supplies the extensions, the Supabase-managed pieces and the
# migration history; this script then puts the DATA and the exact schema from
# the dump on top.
#
#   1. auth.users / auth.identities — first, because public.collaborators has
#      a foreign key to auth.users and would not validate against an empty one.
#   2. the public schema — dropped and recreated object by object from the dump
#      (--clean --if-exists), which loads data BEFORE constraints and triggers
#      are created. That ordering is why the audit trigger doesn't fire on every
#      restored row and why no superuser-only --disable-triggers is needed.
#
# The `public` schema ITSELF is never dropped: Supabase's own roles, extensions
# and grants hang off it, and dropping it is the one thing pg_restore --clean
# would do here that cannot be undone. The list file below removes it.
#
# PRIVILEGES. A project's default privileges hand every new table to anon,
# authenticated and service_role; the migrations then REVOKE from anon. A dump
# records only what differs from the owner's defaults, so restoring onto those
# defaults would quietly give anon back everything the migrations took away.
# So default privileges are switched off for the duration, the dump's explicit
# grants are the only ones applied, and the project's defaults are put back.
#
# This replaces the target's public data. Run it against a new project, not a
# live one you care about.
# ---------------------------------------------------------------------------
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <target-database-url> <dump-directory>" >&2
  exit 2
fi
URL="$1"
DIR="$2"
for f in public.dump auth.dump; do
  [ -f "$DIR/$f" ] || { echo "missing $DIR/$f" >&2; exit 1; }
done

ROLES="anon, authenticated, service_role"
defaults() {  # $1 = revoke | grant, $2 = from | to
  psql "$URL" -v ON_ERROR_STOP=1 -q <<SQL
alter default privileges in schema public $1 all on tables    $2 $ROLES;
alter default privileges in schema public $1 all on sequences $2 $ROLES;
alter default privileges in schema public $1 all on functions $2 $ROLES;
SQL
}

pg_restore --exit-on-error --data-only --no-owner -d "$URL" "$DIR/auth.dump"

defaults revoke from
trap 'defaults grant to; rm -f "${LIST:-}"' EXIT

LIST="$(mktemp)"
pg_restore --list "$DIR/public.dump" \
  | grep -v -E '(^|[ ])(SCHEMA - public|COMMENT - SCHEMA public|ACL - SCHEMA public) ' > "$LIST"

pg_restore --exit-on-error --clean --if-exists --no-owner --use-list="$LIST" -d "$URL" "$DIR/public.dump"
echo "==> restored"
