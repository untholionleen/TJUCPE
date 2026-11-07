-- TJUCPE report lifecycle v3: additive migration; existing records and files are preserved.
alter table public.report_submissions
  add column if not exists submission_version integer not null default 1,
  add column if not exists submitted_at timestamptz,
  add column if not exists withdrawn_at timestamptz;
alter table public.report_submissions drop constraint if exists report_submissions_status_check;
alter table public.report_submissions add constraint report_submissions_status_check
  check (status in ('draft','submitted','returned','graded','withdrawn'));
update public.report_submissions set submitted_at=coalesce(submitted_at,created_at)
where status in ('submitted','returned','graded') and submitted_at is null;

create table if not exists public.report_revisions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.report_submissions(id) on delete cascade,
  version integer not null,
  previous_file_name text not null,
  previous_storage_path text not null,
  action text not null check (action in ('file_replaced','withdrawn','resubmitted','teacher_returned','teacher_graded')),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
create index if not exists report_revisions_report_version_idx on public.report_revisions(report_id,version desc);
alter table public.report_revisions enable row level security;
drop policy if exists report_revisions_select_owner_or_staff on public.report_revisions;
create policy report_revisions_select_owner_or_staff on public.report_revisions for select to authenticated
using (exists(select 1 from public.report_submissions r where r.id=report_revisions.report_id
  and (r.student_id=(select auth.uid()) or private.is_admin() or private.is_class_teacher(r.class_id))));
revoke all on table public.report_revisions from anon,authenticated;
grant select on public.report_revisions to authenticated;

create or replace function private.guard_student_report_update()
returns trigger language plpgsql set search_path=''
as $guard_student_report_update$
declare assignment_open boolean:=false; active_member boolean:=false;
begin
  if private.is_staff() or current_user in ('postgres','supabase_admin','service_role') then return new; end if;
  if new.student_id is distinct from old.student_id or new.class_id is distinct from old.class_id
    or new.assignment_id is distinct from old.assignment_id or new.experiment_slug is distinct from old.experiment_slug
    or new.score is distinct from old.score or new.feedback is distinct from old.feedback
    or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Students cannot change report ownership, assignment, or teacher review fields';
  end if;
  if old.class_id is null and old.assignment_id is null then
    if new.status not in ('submitted','withdrawn') then raise exception 'Legacy report status must remain submitted or be withdrawn'; end if;
  elsif old.status='submitted' then
    if new.status<>'withdrawn' then raise exception 'A submitted report must be withdrawn before editing'; end if;
  elsif old.status in ('draft','returned','withdrawn') then
    if new.status not in ('draft','submitted','withdrawn') then raise exception 'Invalid student report status transition'; end if;
    if new.status='submitted' then
      select exists(select 1 from public.experiment_assignments a where a.id=old.assignment_id
        and a.class_id=old.class_id and a.is_open=true and a.required=true) into assignment_open;
      select exists(select 1 from public.class_members cm where cm.class_id=old.class_id
        and cm.student_id=old.student_id and cm.status='active') into active_member;
      if not assignment_open or not active_member then raise exception 'The class membership or assigned experiment task is no longer active'; end if;
    end if;
  else raise exception 'Graded reports cannot be modified by students';
  end if;
  if new.status='submitted' then new.submitted_at:=now();new.withdrawn_at:=null;
  elsif new.status='withdrawn' then new.withdrawn_at:=now(); end if;
  if new.storage_path is distinct from old.storage_path then new.submission_version:=old.submission_version+1;
  else new.submission_version:=old.submission_version; end if;
  return new;
end;
$guard_student_report_update$;
drop trigger if exists report_student_update_guard_v3 on public.report_submissions;
create trigger report_student_update_guard_v3 before update on public.report_submissions
for each row execute function private.guard_student_report_update();

create or replace function private.log_report_revision_v3()
returns trigger language plpgsql security definer set search_path=''
as $log_report_revision_v3$
declare event_name text;
begin
  if new.storage_path is distinct from old.storage_path then
    event_name:='file_replaced';
    insert into public.report_revisions(report_id,version,previous_file_name,previous_storage_path,action,changed_by,details)
    values(new.id,old.submission_version,old.file_name,old.storage_path,event_name,auth.uid(),
      jsonb_build_object('new_file_name',new.file_name,'new_version',new.submission_version));
  elsif old.status is distinct from new.status then
    event_name:=case when new.status='withdrawn' then 'withdrawn' when new.status='submitted' then 'resubmitted'
      when new.status='returned' then 'teacher_returned' when new.status='graded' then 'teacher_graded'
      else 'status_changed' end;
    if event_name in ('withdrawn','resubmitted','teacher_returned','teacher_graded') then
      insert into public.report_revisions(report_id,version,previous_file_name,previous_storage_path,action,changed_by,details)
      values(new.id,new.submission_version,old.file_name,old.storage_path,event_name,auth.uid(),
        jsonb_build_object('from',old.status,'to',new.status,'score',new.score));
    end if;
  end if;
  if old.status is distinct from new.status or old.storage_path is distinct from new.storage_path
    or old.score is distinct from new.score or old.feedback is distinct from new.feedback then
    insert into public.audit_logs(actor_id,target_user_id,action,details)
    values(auth.uid(),new.student_id,'report.updated',jsonb_build_object('report_id',new.id,
      'from_status',old.status,'to_status',new.status,'version',new.submission_version,
      'file_changed',old.storage_path is distinct from new.storage_path));
  end if;
  return new;
end;
$log_report_revision_v3$;
revoke all on function private.guard_student_report_update() from public,anon,authenticated;
revoke all on function private.log_report_revision_v3() from public,anon,authenticated;
drop trigger if exists report_revision_audit_v3 on public.report_submissions;
create trigger report_revision_audit_v3 after update on public.report_submissions
for each row execute function private.log_report_revision_v3();

drop policy if exists reports_update_class_teacher_admin on public.report_submissions;
drop policy if exists reports_update_staff_only on public.report_submissions;
drop policy if exists reports_update_student_lifecycle_v3 on public.report_submissions;
create policy reports_update_student_lifecycle_v3 on public.report_submissions for update to authenticated
using (student_id=(select auth.uid()) and status in ('draft','submitted','returned','withdrawn'))
with check (student_id=(select auth.uid()) and status in ('draft','submitted','withdrawn'));
drop policy if exists reports_update_class_staff_v3 on public.report_submissions;
create policy reports_update_class_staff_v3 on public.report_submissions for update to authenticated
using (private.is_admin() or private.is_class_teacher(class_id))
with check (private.is_admin() or private.is_class_teacher(class_id));
drop policy if exists reports_delete_admin_only on public.report_submissions;
drop policy if exists reports_delete_student_or_class_staff_v3 on public.report_submissions;
create policy reports_delete_student_or_class_staff_v3 on public.report_submissions for delete to authenticated
using (private.is_admin() or private.is_class_teacher(class_id)
  or (student_id=(select auth.uid()) and status in ('draft','submitted','returned','withdrawn')));
drop policy if exists report_objects_delete_orphan_owner_admin_v3 on storage.objects;
create policy report_objects_delete_orphan_owner_admin_v3 on storage.objects for delete to authenticated
using (bucket_id='lab-reports' and (private.is_admin() or (
  (storage.foldername(name))[1]=(select auth.uid())::text and not exists(
    select 1 from public.report_submissions r where r.storage_path=storage.objects.name))));
grant select,insert,update,delete on public.report_submissions to authenticated;
grant usage on schema private to authenticated;
do $verify$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='report_submissions'
    and policyname='reports_update_student_lifecycle_v3') then raise exception 'student lifecycle policy missing'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='report_submissions'
    and policyname='reports_update_class_staff_v3') then raise exception 'class staff policy missing'; end if;
  if (select count(*) from public.report_submissions)<1 then raise exception 'existing report rows unexpectedly missing'; end if;
end;
$verify$;
