-- TJUCPE post-deployment verification
-- Read-only checks. Run AFTER supabase/migrations/202611070001_initial_schema.sql.
-- Run in Supabase SQL Editor as a project owner. Do not paste student data here.

-- 1) Required tables and Row Level Security.
with expected(table_name) as (
  values
    ('profiles'),
    ('experiment_records'),
    ('report_submissions'),
    ('audit_logs')
)
select
  e.table_name,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.relforcerowsecurity, false) as rls_forced
from expected e
left join pg_class c
  on c.relname = e.table_name
 and c.relnamespace = 'public'::regnamespace
order by e.table_name;

-- 2) The report bucket must exist, be private, and enforce the expected file constraints.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'lab-reports';

-- 3) Show every policy on the application tables and Storage objects.
-- Review any additional permissive policies on storage.objects: policies combine with OR.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where (schemaname = 'public'
       and tablename in ('profiles','experiment_records','report_submissions','audit_logs'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 4) Verify client-facing table privileges. RLS policies further restrict each row.
select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('profiles','experiment_records','report_submissions','audit_logs')
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;

-- 5) Inspect SECURITY DEFINER helpers and their fixed search_path settings.
select
  p.proname as function_name,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin','is_staff','handle_new_user','log_profile_role_change')
order by p.proname;

-- 6) Confirm expected triggers exist.
select
  event_object_schema,
  event_object_table,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where (event_object_schema = 'auth' and event_object_table = 'users')
   or (event_object_schema = 'public' and event_object_table in
       ('profiles','experiment_records','report_submissions'))
order by event_object_schema, event_object_table, trigger_name;

-- 7) Optional: inspect the first administrator after you register your own account.
-- Replace the email literal with your own address; never publish this query result.
-- select p.id, p.full_name, p.role
-- from public.profiles p
-- join auth.users u on u.id = p.id
-- where lower(u.email) = lower('YOUR_ADMIN_EMAIL@example.com');
