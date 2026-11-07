-- Archived classes cannot accept new report submissions or student resubmissions.
create or replace function public.guard_report_assignment()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  a public.experiment_assignments%rowtype;
begin
  if current_user in ('postgres','supabase_admin') or private.is_staff() then return new; end if;
  if new.student_id is distinct from auth.uid() then raise exception 'Report owner must be the signed-in student'; end if;
  if new.class_id is null or new.assignment_id is null then raise exception 'A class and assigned experiment task are required before submitting a report'; end if;
  if not exists (select 1 from public.classes c where c.id=new.class_id and c.is_active=true) then
    raise exception 'The selected class is not active';
  end if;
  if not exists (select 1 from public.class_members cm where cm.class_id=new.class_id and cm.student_id=auth.uid() and cm.status='active') then
    raise exception 'Student must be an active member of the selected class';
  end if;
  select * into a from public.experiment_assignments x where x.id=new.assignment_id and x.class_id=new.class_id and x.is_open and x.required;
  if not found then raise exception 'This experiment is not currently assigned to the selected class'; end if;
  if not exists (select 1 from public.experiment_catalog e where e.id=a.experiment_id and e.slug=new.experiment_slug and e.is_active) then
    raise exception 'Submitted experiment does not match the assigned task';
  end if;
  if a.due_at is not null and a.due_at<now() then raise exception 'The submission deadline has passed'; end if;
  return new;
end;
$function$;

create or replace function private.guard_student_report_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  assignment_open boolean := false;
  active_member boolean := false;
  active_class boolean := false;
begin
  if private.is_staff() or current_user in ('postgres','supabase_admin','service_role') then return new; end if;
  if new.student_id is distinct from old.student_id
     or new.class_id is distinct from old.class_id
     or new.assignment_id is distinct from old.assignment_id
     or new.experiment_slug is distinct from old.experiment_slug
     or new.score is distinct from old.score
     or new.feedback is distinct from old.feedback
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Students cannot change report ownership, assignment, or teacher review fields';
  end if;
  if old.class_id is null and old.assignment_id is null then
    if new.status not in ('submitted','withdrawn') then raise exception 'Legacy report status must remain submitted or be withdrawn'; end if;
  elsif old.status='submitted' then
    if new.status<>'withdrawn' then raise exception 'A submitted report must be withdrawn before editing'; end if;
  elsif old.status in ('draft','returned','withdrawn') then
    if new.status not in ('draft','submitted','withdrawn') then raise exception 'Invalid student report status transition'; end if;
    if new.status='submitted' then
      select exists(select 1 from public.experiment_assignments a where a.id=old.assignment_id and a.class_id=old.class_id and a.is_open=true and a.required=true and (a.due_at is null or a.due_at>=now())) into assignment_open;
      select exists(select 1 from public.class_members cm where cm.class_id=old.class_id and cm.student_id=old.student_id and cm.status='active') into active_member;
      select exists(select 1 from public.classes c where c.id=old.class_id and c.is_active=true) into active_class;
      if not assignment_open or not active_member or not active_class then
        raise exception 'The class, membership, assignment, or assignment deadline is no longer valid';
      end if;
    end if;
  else
    raise exception 'Graded reports cannot be modified by students';
  end if;
  if new.status='submitted' then new.submitted_at:=now();new.withdrawn_at:=null;
  elsif new.status='withdrawn' then new.withdrawn_at:=now(); end if;
  if new.storage_path is distinct from old.storage_path then new.submission_version:=old.submission_version+1;
  else new.submission_version:=old.submission_version; end if;
  return new;
end;
$function$;
