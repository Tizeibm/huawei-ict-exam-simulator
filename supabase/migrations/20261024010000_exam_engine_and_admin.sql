-- ICT Prep: Complete Exam Simulator Engine, Admin Capabilities & RLS Hardening
-- IDEMPOTENT and NON-DESTRUCTIVE migration building on 20261024000000_auth_approval.sql.
-- Never deletes existing user data, questions, or exam history.

-- 1. Enhance profiles with email & role constraint -----------------------------------------
alter table public.profiles add column if not exists email text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_valid' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_valid
      check (lower(role) in ('candidate', 'admin')) not valid;
  end if;
end $$;

-- Backfill profile email from auth.users where missing
update public.profiles p
set email = coalesce(u.email, '')
from auth.users u
where p.id = u.id and (p.email is null or p.email = '');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
    'candidate',
    'PENDING'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when public.profiles.full_name = '' then excluded.full_name
          else public.profiles.full_name
        end;
  return new;
end;
$$;

-- 2. Questions table & strict answer-key protection ----------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  type text not null,
  question_text text not null,
  options jsonb not null default '{}'::jsonb,
  correct_answers jsonb not null default '[]'::jsonb,
  explanation text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.questions add column if not exists explanation text not null default '';
alter table public.questions add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.questions add column if not exists created_at timestamptz not null default now();
alter table public.questions add column if not exists updated_at timestamptz not null default now();

create index if not exists questions_topic_type_idx on public.questions (topic, type);

alter table public.questions enable row level security;

-- IMPORTANT SECURITY FIX:
-- Do NOT allow non-admin clients to SELECT directly from public.questions in the browser,
-- because public.questions contains `correct_answers` and `explanation`.
-- All candidate exam questions are served through server endpoints that strip `correct_answers`
-- during active scored exams.
drop policy if exists "questions_select_approved" on public.questions;
drop policy if exists "questions_select_admin" on public.questions;
create policy "questions_select_admin" on public.questions
  for select to authenticated using (public.is_admin());

drop policy if exists "questions_insert_admin" on public.questions;
create policy "questions_insert_admin" on public.questions
  for insert to authenticated with check (public.is_admin());

drop policy if exists "questions_update_admin" on public.questions;
create policy "questions_update_admin" on public.questions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "questions_delete_admin" on public.questions;
create policy "questions_delete_admin" on public.questions
  for delete to authenticated using (public.is_admin());

revoke all on public.questions from anon;
grant select, insert, update, delete on public.questions to authenticated;

-- Safe aggregate helper for approved users to inspect question bank counts without seeing answers
create or replace function public.get_question_counts()
returns table (topic text, type text, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select q.topic, q.type, count(*)::bigint as total
  from public.questions q
  where public.is_approved()
  group by q.topic, q.type;
$$;

revoke all on function public.get_question_counts() from public, anon;
grant execute on function public.get_question_counts() to authenticated;

-- 3. Extend exam_attempts for stateful sessions, timer enforcement & analytics -------------
alter table public.exam_attempts add column if not exists mode text not null default 'FULL';
alter table public.exam_attempts add column if not exists status text not null default 'SUBMITTED';
alter table public.exam_attempts add column if not exists started_at timestamptz not null default now();
alter table public.exam_attempts add column if not exists expires_at timestamptz null;
alter table public.exam_attempts add column if not exists submitted_at timestamptz null;
alter table public.exam_attempts add column if not exists duration_seconds integer null;
alter table public.exam_attempts add column if not exists time_used_seconds integer null;
alter table public.exam_attempts add column if not exists question_ids jsonb not null default '[]'::jsonb;
alter table public.exam_attempts add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.exam_attempts add column if not exists flagged_ids jsonb not null default '[]'::jsonb;
alter table public.exam_attempts add column if not exists topic_stats jsonb null;
alter table public.exam_attempts add column if not exists practice_config jsonb null;
alter table public.exam_attempts add column if not exists updated_at timestamptz not null default now();

-- Backfill submitted_at for legacy completed attempts
update public.exam_attempts
set submitted_at = created_at
where submitted_at is null and status in ('SUBMITTED', 'EXPIRED');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exam_attempts_mode_valid' and conrelid = 'public.exam_attempts'::regclass
  ) then
    alter table public.exam_attempts
      add constraint exam_attempts_mode_valid
      check (mode in ('FULL', 'PRACTICE', 'REVIEW')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'exam_attempts_status_valid' and conrelid = 'public.exam_attempts'::regclass
  ) then
    alter table public.exam_attempts
      add constraint exam_attempts_status_valid
      check (status in ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'ABANDONED')) not valid;
  end if;
end $$;

create index if not exists exam_attempts_user_status_idx on public.exam_attempts (user_id, status, created_at desc);

-- Ensure RLS on exam_attempts strictly isolates user data while allowing admins to view their own attempts
-- (and admin overview endpoints use service role when computing platform-wide metrics).
drop policy if exists "attempts_select_own" on public.exam_attempts;
create policy "attempts_select_own" on public.exam_attempts
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_approved());

drop policy if exists "attempts_select_admin" on public.exam_attempts;
-- Note: Removing permissive "attempts_select_admin" on client queries prevents an admin's personal
-- candidate dashboard query (`select * from exam_attempts`) from accidentally mixing other users'
-- attempts if `.eq('user_id', user.id)` is ever omitted. Server-side admin routes use service role.
