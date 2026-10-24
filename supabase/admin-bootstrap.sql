-- Run MANUALLY in Supabase Dashboard -> SQL Editor, after creating the user under
-- Authentication -> Users -> Add user -> Create new user (tick "Auto Confirm User").
-- Replace the email below. This is intentionally not a migration: it contains
-- environment-specific data and must be reviewed before it is run.

insert into public.profiles (id, full_name, role, status)
select id, coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), 'Administrator'), 'admin', 'APPROVED'
from auth.users
where email = 'tizeahmed750@gmail.com'
on conflict (id) do update
  set role = 'admin', status = 'APPROVED', updated_at = now();

-- Verify (exactly one row expected):
select u.email, p.role, p.status
from auth.users u join public.profiles p on p.id = u.id
where u.email = 'admin@example.com';
