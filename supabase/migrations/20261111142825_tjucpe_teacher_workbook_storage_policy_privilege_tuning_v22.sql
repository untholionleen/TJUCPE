-- TJUCPE v2.1 storage policy correction, least-privilege grants and FK index.
-- Safe, additive and non-destructive. Existing report/reference files are retained.

create index if not exists assignment_templates_updated_by_idx
  on public.assignment_templates (updated_by);

-- Keep RLS as the row-level boundary, and remove excess table-level privileges.
revoke all on table public.assignment_templates from anon, authenticated;
grant select, insert, update, delete on table public.assignment_templates to authenticated;
grant all on table public.assignment_templates to service_role;

revoke all on table public.experiment_reference_sets from anon, authenticated;
grant select, insert, update, delete on table public.experiment_reference_sets to authenticated;
grant all on table public.experiment_reference_sets to service_role;

-- The class UUID is the second folder segment in
-- teacher-reference/<class UUID>/<filename>; never derive it from classes.name.
drop policy if exists teacher_reference_objects_insert on storage.objects;
create policy teacher_reference_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'lab-reports'
  and (storage.foldername(objects.name))[1] = 'teacher-reference'
  and exists (
    select 1 from public.classes c
    where c.id::text = (storage.foldername(objects.name))[2]
      and (private.is_admin() or private.is_class_teacher(c.id))
  )
);

drop policy if exists teacher_reference_objects_select on storage.objects;
create policy teacher_reference_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'lab-reports'
  and (storage.foldername(objects.name))[1] = 'teacher-reference'
  and exists (
    select 1 from public.classes c
    where c.id::text = (storage.foldername(objects.name))[2]
      and (private.is_admin() or private.is_class_teacher(c.id))
  )
);

drop policy if exists teacher_reference_objects_delete on storage.objects;
create policy teacher_reference_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'lab-reports'
  and (storage.foldername(objects.name))[1] = 'teacher-reference'
  and exists (
    select 1 from public.classes c
    where c.id::text = (storage.foldername(objects.name))[2]
      and (private.is_admin() or private.is_class_teacher(c.id))
  )
);
