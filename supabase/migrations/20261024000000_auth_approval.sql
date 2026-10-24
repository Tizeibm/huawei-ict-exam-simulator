-- ICT Prep: manual account approval, RLS hardening and exam attempt history.
--
-- IDEMPOTENT and NON-DESTRUCTIVE: it never drops tables, rows or unknown policies.
-- The repository did not contain the original schema, so this migration only relies on
-- the columns the application code already uses (profiles: id, full_name, role, status,
-- created_at, updated_at; questions: id, topic, type, question_text, options,
-- correct_answers, explanation, created_by). Review the audit queries in
-- docs/AUTH_SETUP.md BEFORE running it against a live project.

-- 1. Profiles ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'candidate',
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text not null default '';
alter table public.profiles add column if not exists role text not null default 'candidate';
alter table public.profiles add column if not exists status text not null default 'PENDING';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- New rows are always pending candidates unless written by a trusted (service role / SQL) path.
alter table public.profiles alter column role set default 'candidate';
alter table public.profiles alter column status set default 'PENDING';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_status_valid' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_status_valid
      check (upper(status) in ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')) not valid;
  end if;
end $$;

-- 2. Authorization helpers (SECURITY DEFINER so policies do not recurse into profiles RLS) --
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and upper(p.status) = 'APPROVED'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and upper(p.status) = 'APPROVED' and lower(p.role) = 'admin'
  );
$$;

revoke all on function public.is_approved() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 3. Profile creation trigger: ignores any role/status supplied by the browser --------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, status)
  values (
    new.id,
    left(coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
    'candidate',
    'PENDING'
  )
  on conflict (id) do nothing;   -- never duplicate a profile created by another trigger
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. RLS on profiles: users read their own row, admins read all, nobody writes from the browser --
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select to authenticated using (public.is_admin());

-- Status/role changes go only through the server API (service role) or the SQL editor.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;

-- 5. Questions: only approved users read, only admins write ----------------------------------
alter table public.questions enable row level security;

drop policy if exists "questions_select_approved" on public.questions;
create policy "questions_select_approved" on public.questions
  for select to authenticated using (public.is_approved());

drop policy if exists "questions_insert_admin" on public.questions;
create policy "questions_insert_admin" on public.questions
  for insert to authenticated with check (public.is_admin());

-- 6. Persisted exam attempts (replaces any need for fabricated history) ---------------------
create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null check (score >= 0),
  total integer not null check (total > 0),
  details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (score <= total)
);

create index if not exists exam_attempts_user_created_idx on public.exam_attempts (user_id, created_at desc);

alter table public.exam_attempts enable row level security;

drop policy if exists "attempts_select_own" on public.exam_attempts;
create policy "attempts_select_own" on public.exam_attempts
  for select to authenticated using (user_id = (select auth.uid()) and public.is_approved());

drop policy if exists "attempts_select_admin" on public.exam_attempts;
create policy "attempts_select_admin" on public.exam_attempts
  for select to authenticated using (public.is_admin());

-- Rows are written by the server API, which recomputes the score from the question bank.
revoke all on public.exam_attempts from anon;
revoke insert, update, delete on public.exam_attempts from authenticated;
grant select on public.exam_attempts to authenticated;
