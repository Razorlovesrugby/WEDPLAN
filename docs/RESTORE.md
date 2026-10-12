# Backups and restoring (spec 32)

Free-plan Supabase has no downloadable backups and no point-in-time recovery.
This is the copy that lives outside Supabase. **Nothing here has been run
against a real Supabase project** — `scripts/verify-restore.sh` proves the dump
and restore against plain PostgreSQL on every push, and the first real restore
should be a rehearsal on a throwaway project (see "Rehearsal" below), not the
night you need it.

## What you get

| | |
| --- | --- |
| **When** | Every night at 03:17 NZ (14:17 UTC). Sundays also copy the images. |
| **What** | `public.dump` — the whole `public` schema, data and structure, including the audit log. `auth.dump` — users and identities only, so people can still sign in. `storage/` — every image in the `moodboards` bucket (Sundays). |
| **Where** | A GitHub Actions artifact, `wedplan-backup-YYYY-MM-DD`, kept **30 days**. Encrypted with `age` before it leaves the runner. |
| **Worst case** | You lose everything since the last night's dump — at most about a day. The [activity log](/settings/activity) tells you what changed in that day, so it can be re-done by hand. |

Not in it: Supabase project settings, Vercel environment variables, the Resend
domain, the Pinterest app. **Keep a copy of your environment variables in a
password manager** — especially `INVITE_TOKEN_PEPPER`. It hashes every
invitation link, moodboard share link and clipper token; a restored database
with a different pepper has links that no longer open.

## Setting it up (once)

1. **The repository must be private.** The workflow refuses to run otherwise:
   artifacts of a public repository can be downloaded by anyone signed in to
   GitHub.
2. **Make a key pair** on your own computer (not in the repo, not on GitHub):
   ```bash
   age-keygen -o wedplan-backup.key        # prints "Public key: age1..."
   ```
   Put `wedplan-backup.key` in your password manager. **It is the whole
   backup**: lose it and every artifact is noise.
3. **Connection string.** Supabase → *Connect* → **Session pooler**. Not the
   direct connection: a free project's direct host is IPv6-only and GitHub's
   runners are IPv4. Replace the `[YOUR-PASSWORD]` placeholder.
4. **Repository secrets** (Settings → Secrets and variables → Actions):
   | Secret | Value |
   | --- | --- |
   | `SUPABASE_DB_URL` | the session pooler string from step 3 |
   | `BACKUP_AGE_PUBLIC_KEY` | the `age1...` public key from step 2 |
   | `NEXT_PUBLIC_SUPABASE_URL` | the project URL (for the image copy) |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service role key (for the image copy) |
5. **Run it once by hand**: Actions → *backup* → *Run workflow*. Open the
   artifact and do the rehearsal below.

If a run fails you get GitHub's usual email. The likeliest first failures:
`pg_dump: server version mismatch` (the workflow installs the matching client,
so look at that step), a connection timeout (wrong connection string — see step
3), or an image-copy refusal over the size limit (below).

**Size.** GitHub's free plan allows 500 MB of artifacts in total. Each night's
database dump is small; the weekly image copy is the risk. The image step
refuses above 200 MB (`STORAGE_BACKUP_MAX_MB`) rather than quietly filling the
quota. If you hit it, either raise the limit and shorten `retention-days`, or
move the copies to an object store (Backblaze B2 / Cloudflare R2 have a free
10 GB) — that is spec 32, Q2.

## Restoring

You need: the artifact, your private key, the Supabase CLI or the SQL editor,
and a PostgreSQL client (`pg_restore`, `psql`) **of the same major version as
the target database**.

1. **Get a database.** Easiest is a **new** Supabase project (the old one may be
   paused or gone). If you restore into the existing project it is **replaced**
   — public data is dropped and recreated from the dump.
2. **Apply every migration, in order, to it** — `supabase link` then
   `supabase db push`, or paste `supabase/migrations/0001_…` through the latest
   into the SQL editor. This supplies the extensions and Supabase's own wiring;
   the restore then puts your data and exact schema on top.
3. **Decrypt and unpack:**
   ```bash
   mkdir restore
   age -d -i wedplan-backup.key wedplan-YYYY-MM-DD.tar.age | tar -x -C restore/
   ls restore        # db/  and, on Sundays, storage/
   ```
4. **Restore the database** (session pooler URL of the *target*):
   ```bash
   ./scripts/restore-db.sh "$TARGET_DATABASE_URL" restore/db
   ```
   It restores `auth.users`/`auth.identities` first (collaborators point at
   them), then the `public` schema object by object. It never drops the
   `public` schema itself, and it re-applies the dump's exact privileges so
   `anon` stays locked out. It prints `==> restored` on success.
5. **Restore the images:**
   ```bash
   node scripts/ensure-bucket.mjs                # creates the private bucket
   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
     node scripts/restore-storage.mjs restore/storage
   ```
   Use the most recent *Sunday's* artifact for these; any night's database dump
   goes with them (a row that points at an image newer than the copy will show
   a broken picture until it is re-uploaded).
6. **Point the app at it.** In Vercel set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for the new
   project and redeploy. Keep `INVITE_TOKEN_PEPPER` and every other variable
   **exactly as it was**.
7. **Re-do what lives outside the database:** in Supabase → Authentication →
   URL configuration, set the Site URL and the redirect URL for the magic link;
   re-run `scripts/verify-live.mjs` if you use it; reconnect Pinterest if
   its tokens no longer decrypt.
8. **Check:** sign in, open `/guests` and compare the household count with what
   you expect, open `/settings/activity` (the log came back with the data), and
   open one invitation link.

### What a restore does and doesn't give back

- Everything in `public`, including guests (soft-deleted ones too), RSVPs,
  budget, lists, vendors, the site, and the audit log.
- Sign-in for existing collaborators. Sessions are gone; people sign in again.
- **Not** changes made after the dump. Check `/settings/activity` on the old
  project if it is still readable, and re-enter them.

## Rehearsal (do this once, before you need it)

Create a throwaway free Supabase project (you have two on the free plan),
follow "Restoring" steps 2–4 and 8 against it using a real artifact, then delete
the project. Record what happened — particularly any step that did not work as
written — at the bottom of `docs/specs/32-backup-and-audit-log.md` under
"Build status". Until that is done the restore is verified only against plain
PostgreSQL.

Things the rehearsal exists to catch, because plain PostgreSQL can't:
- the `postgres` role on Supabase may lack permission to write
  `auth.users`/`auth.identities` data (step 4 would fail at its first line — the
  fallback is to re-invite the collaborators instead of restoring their logins);
- Supabase-managed extensions and roles behaving differently from the test shim;
- `pg_restore --clean` meeting an object the dump didn't know about.

## What is checked automatically

`scripts/verify-restore.sh` runs in CI on every push: it builds a database from
the migrations and seed, dumps it with `scripts/backup-db.sh` (the same script
the nightly job runs), restores it into a fresh database with
`scripts/restore-db.sh` (the same script as step 4), and compares row counts for
every table, every policy, trigger, function, view and table grant, and what a
restored collaborator sees through row-level security. A migration that breaks
the dump fails there rather than on the night you need it.
