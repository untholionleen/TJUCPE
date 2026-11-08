-- Allow class staff to remove only orphaned reviewed PDFs after a failed save.
-- Current report files remain protected from deletion through this policy.
drop policy if exists report_objects_delete_orphan_reviewed_pdf_class_staff on storage.objects;
create policy report_objects_delete_orphan_reviewed_pdf_class_staff
on storage.objects for delete to authenticated
using (
  bucket_id = 'lab-reports'
  and (storage.foldername(name))[1] = 'reviewed'
  and exists (
    select 1
    from public.report_submissions r
    where r.id::text = (storage.foldername(objects.name))[2]
      and private.is_class_teacher(r.class_id)
  )
  and not exists (
    select 1 from public.report_submissions current_report
    where current_report.storage_path = objects.name
  )
);