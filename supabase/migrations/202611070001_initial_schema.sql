-- TJUCPE initial schema and Row Level Security
-- Execute this complete file in Supabase SQL Editor as the project owner.
-- Browser clients use only the publishable key. Never add service_role keys to config.js.

create extension if not exists pgcrypto;

-- Private authorization helpers. Keep this schema out of Supabase's exposed API schemas.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  student_no text,
  department text,
  role text not null default 'student' check (role in ('student','teacher','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $is_admin$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$is_admin$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $is_staff$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('teacher','admin')
  );
$is_staff$;

-- Do not derive role from user-editable signup metadata. Every new account is a student.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $handle_new_user$
begin
  insert into public.profiles (id, full_name, student_no, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'student_no', ''),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$handle_new_user$;

drop trigger if exists on_auth_user_created_tjucpe on auth.users;
create trigger on_auth_user_created_tjucpe
after insert on auth.users
for each row execute procedure private.handle_new_user();

-- Block role escalation through a student's own profile update.
-- SQL Editor runs as a database owner, so authorized database administrators can assign roles there.
create or replace function public.guard_profile_role_change()
returns trigger language plpgsql set search_path = public as $role$
begin
  if new.role is distinct from old.role
     and current_user not in ('postgres','supabase_admin')
     and not private.is_admin() then
    raise exception 'Only a platform administrator can change account roles';
  end if;
  return new;
end;
$role$;

drop trigger if exists guard_profile_role_change_tjucpe on public.profiles;
create trigger guard_profile_role_change_tjucpe
before update on public.profiles
for each row execute procedure public.guard_profile_role_change();

drop trigger if exists profiles_touch_updated_at_tjucpe on public.profiles;
create trigger profiles_touch_updated_at_tjucpe
before update on public.profiles
for each row execute procedure public.touch_updated_at();

create table if not exists public.experiment_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  experiment_slug text not null,
  title text not null,
  raw_data jsonb not null default '[]'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  engine_version text not null default 'tjucpe-webcalc-1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.guard_experiment_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id and not private.is_admin() then
    raise exception 'Experiment record owner cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists experiment_owner_guard_tjucpe on public.experiment_records;
create trigger experiment_owner_guard_tjucpe
before update on public.experiment_records
for each row execute procedure public.guard_experiment_owner();

drop trigger if exists experiment_records_touch_updated_at_tjucpe on public.experiment_records;
create trigger experiment_records_touch_updated_at_tjucpe
before update on public.experiment_records
for each row execute procedure public.touch_updated_at();

create table if not exists public.report_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  experiment_slug text not null,
  title text not null,
  file_name text not null,
  storage_path text not null unique,
  status text not null default 'submitted' check (status in ('draft','submitted','returned','graded')),
  score numeric(5,2) check (score is null or (score >= 0 and score <= 100)),
  feedback text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.guard_report_insert_fields()
returns trigger language plpgsql set search_path = public as $guard$
begin
  if not private.is_staff() and current_user not in ('postgres','supabase_admin') then
    new.student_id := auth.uid();
    new.score := null;
    new.feedback := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    if new.status not in ('draft','submitted') then
      new.status := 'submitted';
    end if;
  end if;
  return new;
end;
$guard$;

drop trigger if exists report_insert_fields_guard_tjucpe on public.report_submissions;
create trigger report_insert_fields_guard_tjucpe
before insert on public.report_submissions
for each row execute procedure public.guard_report_insert_fields();

create or replace function public.guard_report_review_fields()
returns trigger language plpgsql set search_path = public as $review$
begin
  if not private.is_staff() and current_user not in ('postgres','supabase_admin') then
    if new.student_id is distinct from old.student_id
       or new.score is distinct from old.score
       or new.feedback is distinct from old.feedback
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.status is distinct from old.status
       or new.storage_path is distinct from old.storage_path then
      raise exception 'Students cannot modify report review, ownership, status, or storage fields';
    end if;
  end if;
  return new;
end;
$review$;

drop trigger if exists report_review_fields_guard_tjucpe on public.report_submissions;
create trigger report_review_fields_guard_tjucpe
before update on public.report_submissions
for each row execute procedure public.guard_report_review_fields();

drop trigger if exists report_submissions_touch_updated_at_tjucpe on public.report_submissions;
create trigger report_submissions_touch_updated_at_tjucpe
before update on public.report_submissions
for each row execute procedure public.touch_updated_at();

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.log_profile_role_change()
returns trigger language plpgsql security definer set search_path = ''
as $log_profile_role_change$
begin
  if new.role is distinct from old.role then
    insert into public.audit_logs(actor_id,target_user_id,action,details)
    values (auth.uid(),new.id,'profile.role_changed',
      jsonb_build_object('from',old.role,'to',new.role));
  end if;
  return new;
end;
$log_profile_role_change$;

-- Only authenticated users may invoke role helpers used by RLS; no browser role can invoke trigger functions.
revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_staff() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_staff() to authenticated;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function public.guard_profile_role_change() from public, anon, authenticated;
revoke all on function public.guard_experiment_owner() from public, anon, authenticated;
revoke all on function public.guard_report_insert_fields() from public, anon, authenticated;
revoke all on function public.guard_report_review_fields() from public, anon, authenticated;
revoke all on function private.log_profile_role_change() from public, anon, authenticated;

drop trigger if exists profile_role_audit_tjucpe on public.profiles;
create trigger profile_role_audit_tjucpe
after update on public.profiles
for each row execute procedure private.log_profile_role_change();

create index if not exists experiment_records_owner_created_idx
  on public.experiment_records(owner_id, created_at desc);
create index if not exists report_submissions_student_created_idx
  on public.report_submissions(student_id, created_at desc);
create index if not exists report_submissions_status_created_idx
  on public.report_submissions(status, created_at desc);
create index if not exists audit_logs_created_idx
  on public.audit_logs(created_at desc);

alter table public.profiles enable row level security;
alter table public.experiment_records enable row level security;
alter table public.report_submissions enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users read/update themselves; staff can view roster; admins can manage roles.
drop policy if exists profiles_select_self_or_staff on public.profiles;
create policy profiles_select_self_or_staff on public.profiles
for select to authenticated
using (id = auth.uid() or private.is_staff());

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
for update to authenticated
using (id = auth.uid() or private.is_admin())
with check (id = auth.uid() or private.is_admin());

-- Experiment records are private to their owner; teaching staff may inspect for teaching support.
drop policy if exists records_select_owner_or_staff on public.experiment_records;
create policy records_select_owner_or_staff on public.experiment_records
for select to authenticated using (owner_id = auth.uid() or private.is_staff());

drop policy if exists records_insert_owner on public.experiment_records;
create policy records_insert_owner on public.experiment_records
for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists records_update_owner_or_admin on public.experiment_records;
create policy records_update_owner_or_admin on public.experiment_records
for update to authenticated using (owner_id = auth.uid() or private.is_admin())
with check (owner_id = auth.uid() or private.is_admin());

drop policy if exists records_delete_owner_or_admin on public.experiment_records;
create policy records_delete_owner_or_admin on public.experiment_records
for delete to authenticated using (owner_id = auth.uid() or private.is_admin());

-- Reports: students see their own files and submissions; teaching staff can review all.
drop policy if exists reports_select_student_or_staff on public.report_submissions;
create policy reports_select_student_or_staff on public.report_submissions
for select to authenticated using (student_id = auth.uid() or private.is_staff());

drop policy if exists reports_insert_own on public.report_submissions;
create policy reports_insert_own on public.report_submissions
for insert to authenticated with check (
  student_id = auth.uid() and status in ('draft','submitted')
);

-- Only teaching staff can change status, grades and feedback.
-- Students have read access to their own reports, but cannot rewrite submitted records.
drop policy if exists reports_update_student_or_staff on public.report_submissions;
drop policy if exists reports_update_staff_only on public.report_submissions;
create policy reports_update_staff_only on public.report_submissions
for update to authenticated
using (private.is_staff())
with check (private.is_staff());

-- Only administrators can delete report rows; this avoids students removing submissions
-- while leaving orphaned files in Storage.
drop policy if exists reports_delete_owner_or_admin on public.report_submissions;
drop policy if exists reports_delete_admin_only on public.report_submissions;
create policy reports_delete_admin_only on public.report_submissions
for delete to authenticated using (private.is_admin());

-- Audit history is visible to admins only; writes are generated by database triggers.
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
for select to authenticated using (private.is_admin());

-- Private report bucket. Object path convention: <auth.uid()>/<uuid>_<filename>.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'lab-reports','lab-reports',false,20971520,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
set public=false,
    file_size_limit=20971520,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists report_objects_insert_own on storage.objects;
create policy report_objects_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id='lab-reports'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists report_objects_select_own_or_staff on storage.objects;
create policy report_objects_select_own_or_staff on storage.objects
for select to authenticated
using (
  bucket_id='lab-reports'
  and ((storage.foldername(name))[1]=auth.uid()::text or private.is_staff())
);

-- The client never edits uploaded objects in place; replacement uses a new UUID path.
drop policy if exists report_objects_update_own on storage.objects;

-- Students may clean up an orphan upload only before a report row is created.
-- Once a path is referenced by a submission, only an administrator can delete it.
drop policy if exists report_objects_delete_own_or_admin on storage.objects;
drop policy if exists report_objects_delete_orphan_own_or_admin on storage.objects;
create policy report_objects_delete_orphan_own_or_admin on storage.objects
for delete to authenticated
using (
  bucket_id='lab-reports'
  and (
    private.is_admin()
    or (
      (storage.foldername(name))[1]=auth.uid()::text
      and not exists (
        select 1 from public.report_submissions r
        where r.storage_path = storage.objects.name
      )
    )
  )
);

-- Remove inherited default grants first, then add back only the operations used by the client.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.experiment_records from anon, authenticated;
revoke all on table public.report_submissions from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.experiment_records to authenticated;
grant select, insert, update, delete on public.report_submissions to authenticated;
grant select on public.audit_logs to authenticated;

-- Supabase Storage API operations are still constrained by the bucket-specific RLS policies above.
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;


-- Admin bootstrap:
-- 1) Register your own account through the application and verify your email.
-- 2) Run the following statement in SQL Editor, replacing the email:
-- update public.profiles p set role='admin'
-- where p.id=(select u.id from auth.users u where u.email='YOUR_ADMIN_EMAIL');
-- 3) Assign teacher accounts similarly with role='teacher'.
-- Never add a role selector to public registration.
