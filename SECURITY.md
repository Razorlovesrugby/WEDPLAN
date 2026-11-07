# Security policy

If you find a vulnerability, please report it privately through GitHub's
**Security → Report a vulnerability** form on this repository rather than
opening a public issue. I'll aim to respond within a few days.

No secrets are committed to this repository; `.env.example` lists the
variables the app needs. Every table is protected by row-level security keyed
to `wedding_id`, and the SQL test suite in `supabase/tests/` checks tenancy
with a second account.
