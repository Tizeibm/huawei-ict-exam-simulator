# ICT Prep — Authentication, Database Migrations & Deployment Guide

## Required Environment Variables (`.env.local`, never committed)

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...   # or NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=...              # SERVER ONLY; never prefix with NEXT_PUBLIC_
```

## 1. Database Migrations (Run in Order)

Apply both idempotent, non-destructive SQL migrations in the Supabase SQL Editor (or via `supabase db push`):

1. `supabase/migrations/20261024000000_auth_approval.sql`
   - Creates/updates `public.profiles` (`id`, `full_name`, `role`, `status`, `created_at`, `updated_at`)
   - Adds `public.is_approved()` and `public.is_admin()` `SECURITY DEFINER` helpers
   - Installs `on_auth_user_created` trigger so self-registered accounts always start as `candidate` / `PENDING`
   - Enables RLS on `profiles`, `questions`, and `exam_attempts`
2. `supabase/migrations/20261024010000_exam_engine_and_admin.sql`
   - Adds `email` column and `profiles_role_valid` constraint to `public.profiles`
   - Hardens `public.questions` RLS so `correct_answers` and `explanation` cannot be queried directly from the browser by non-admin clients during active scored exams
   - Adds `questions_update_admin` and `questions_delete_admin` policies for administrator question management
   - Extends `public.exam_attempts` with stateful session and analytics columns (`mode`, `status`, `started_at`, `expires_at`, `submitted_at`, `duration_seconds`, `time_used_seconds`, `question_ids`, `answers`, `flagged_ids`, `topic_stats`, `practice_config`, `updated_at`)

## 2. Supabase Dashboard Settings

1. **Authentication → Sign In / Providers → Email**: keep **Confirm email OFF** (accounts are approved manually by an administrator or created directly in the Admin Console with `email_confirm: true`).
2. **Authentication → URL Configuration**: set Site URL to your deployed URL and add `<site>/auth/callback` to Redirect URLs for password recovery.

## 3. Bootstrapping the First Administrator

1. In Supabase Dashboard → **Authentication → Users → Add user → Create new user** (tick **Auto Confirm User**).
2. Run `supabase/admin-bootstrap.sql` in the SQL Editor after replacing the email address.
3. Subsequent administrators or pre-approved candidates can be created directly inside the `/admin` console (**User Management → Create User Account**).

## 4. Verification & Automated Tests

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```
