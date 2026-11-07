-- Ensure a student cannot resubmit an edited report after the assigned deadline.
create or replace function private.guard_student_report_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  assignment_open boolean := false;
  active_member boolean := false;
begin
  if private.is_staff() or current_user in ('postgres','supabase_admin','service_role') then
    return new;
  end if;
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
    if new.status not in ('submitted','withdrawn') then
      raise exception 'Legacy report status must remain submitted or be withdrawn';
    end if;
  elsif old.status = 'submitted' then
    if new.status <> 'withdrawn' then
      raise exception 'A submitted report must be withdrawn before editing';
    end if;
  elsif old.status in ('draft','returned','withdrawn') then
    if new.status not in ('draft','submitted','withdrawn') then
      raise exception 'Invalid student report status transition';
    end if;
    if new.status = 'submitted' then
      select exists (
        select 1 from public.experiment_assignments a
        where a.id = old.assignment_id and a.class_id = old.class_id
          and a.is_open = true and a.required = true
          and (a.due_at is null or a.due_at >= now())
      ) into assignment_open;
      select exists (
        select 1 from public.class_members cm
        where cm.class_id = old.class_id and cm.student_id = old.student_id
          and cm.status = 'active'
      ) into active_member;
      if not assignment_open or not active_member then
        raise exception 'The class membership, assignment, or assignment deadline is no longer valid';
      end if;
    end if;
  else
    raise exception 'Graded reports cannot be modified by students';
  end if;
  if new.status = 'submitted' then
    new.submitted_at := now();
    new.withdrawn_at := null;
  elsif new.status = 'withdrawn' then
    new.withdrawn_at := now();
  end if;
  if new.storage_path is distinct from old.storage_path then
    new.submission_version := old.submission_version + 1;
  else
    new.submission_version := old.submission_version;
  end if;
  return new;
end;
$function$;
