# ICT Prep — authentication & approval setup

## Required environment variables (`.env.local`, never committed)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...   # or NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=...              # server only; no NEXT_PUBLIC_ prefix
```

## 1. Audit before migrating (SQL Editor, read-only)

The original schema was not in the repository, so check these first:

```sql
select column_name, data_type, column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles';
select tgname, tgrelid::regclass from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
 where schemaname = 'public' and tablename in ('profiles', 'questions', 'exam_attempts');
select role, status, count(*) from public.profiles group by 1, 2;
```

Look for: another trigger on `auth.users` (the migration's insert uses `on conflict do nothing`, so it will not
duplicate a profile), and any **permissive** policy that lets non-admins write `profiles` or lets pending users
read `questions`. Permissive policies are OR-ed, so the migration cannot remove them for you — drop them manually.

## 2. Apply the migration

Run `supabase/migrations/20261024000000_auth_approval.sql` (SQL Editor, or `supabase db push`). It is idempotent
and non-destructive. It: makes new profiles `candidate`/`PENDING` via trigger (ignoring browser metadata), enables RLS,
removes browser write access to `profiles`, restricts `questions` (read: approved, insert: admin) and creates `exam_attempts`.

## 3. Dashboard settings you must change yourself

1. **Authentication → Sign In / Providers → Email**: turn **Confirm email OFF** (this app does not use email verification).
2. **Authentication → URL Configuration**: set Site URL to your deployed URL and add `<site>/auth/callback` to Redirect URLs (needed only for password recovery).
3. Keep "Allow new users to sign up" ON. Recovery emails need working email delivery (the built-in sender is heavily rate-limited; configure SMTP for real use).

## 4. Create the first administrator

1. **Authentication → Users → Add user → Create new user**: enter email + password, tick **Auto Confirm User**.
2. SQL Editor: run `supabase/admin-bootstrap.sql` after replacing `admin@example.com`.
3. Sign in at `/login`; you land on `/admin`.

> The role value is lowercase `admin` because the existing import API already used it. Code compares case-insensitively.

## 5. Approval workflow

Users submit **Request access** at `/signup` → profile `PENDING` → they only see `/pending`. In `/admin` an approved admin
can Approve / Reject (pending), Suspend (approved) or Reinstate (rejected/suspended). Enforcement is layered:
`proxy.ts` (page routing), `lib/auth/server.ts` (API handlers; role always read from the database), and RLS.
Admins cannot suspend or reject themselves.

## Tests

`pnpm test` (Node's built-in runner, no extra dependency) covers the routing/approval rules in `lib/auth/access.ts`.
