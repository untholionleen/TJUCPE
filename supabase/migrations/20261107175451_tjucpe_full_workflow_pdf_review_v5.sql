-- TJUCPE full workflow and PDF review support
-- Applied to Supabase project on 2026-11-07.
alter table public.profiles
  add column if not exists account_status text not null default 'active'
  check (account_status in ('active','disabled'));

alter table public.report_submissions
  add column if not exists review_annotations jsonb not null default '[]'::jsonb;

create index if not exists report_submissions_class_assignment_idx
  on public.report_submissions(class_id, assignment_id, created_at desc);

drop policy if exists report_objects_select_current_owner_and_revision_history on storage.objects;
create policy report_objects_select_current_owner_and_revision_history
on storage.objects for select to authenticated
using (
  bucket_id = 'lab-reports'
  and (
    exists (
      select 1 from public.report_submissions r
      where r.storage_path = objects.name
        and (r.student_id = (select auth.uid()) or private.is_class_teacher(r.class_id))
    )
    or exists (
      select 1
      from public.report_revisions rr
      join public.report_submissions r on r.id = rr.report_id
      where rr.previous_storage_path = objects.name
        and (r.student_id = (select auth.uid()) or private.is_class_teacher(r.class_id))
    )
  )
);

drop policy if exists report_objects_insert_reviewed_pdf_class_staff on storage.objects;
create policy report_objects_insert_reviewed_pdf_class_staff
on storage.objects for insert to authenticated
with check (
  bucket_id = 'lab-reports'
  and (storage.foldername(name))[1] = 'reviewed'
  and exists (
    select 1 from public.report_submissions r
    where r.id::text = (storage.foldername(name))[2]
      and private.is_class_teacher(r.class_id)
  )
);

comment on column public.report_submissions.review_annotations is
  'Normalized PDF annotation strokes saved by the teacher; current annotated PDF remains the student-facing file.';
comment on column public.profiles.account_status is
  'Account lifecycle state. Disabled accounts are blocked by the classroom-admin service and should be banned in Auth.';
