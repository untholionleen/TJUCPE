-- TJUCPE report lifecycle guard correction v4
-- The v3 private guard already validates student status transitions, class membership,
-- assignment availability, ownership and submission versioning. This public trigger
-- must not pre-empt it by blocking legitimate student withdraw/resubmit file changes.

create or replace function public.guard_report_review_fields()
returns trigger
language plpgsql
set search_path = public
as $guard$
begin
  if not private.is_staff()
     and current_user not in ('postgres','supabase_admin','service_role') then
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
  end if;
  -- Status transitions and storage_path changes are checked by
  -- private.guard_student_report_update_v3, the authoritative lifecycle guard.
  return new;
end;
$guard$;

-- Existing report_revision_audit_v3 preserves the prior file path and status/grade
-- history. The client must not delete an old file when a student replaces a report.
