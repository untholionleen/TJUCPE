-- Fix reference-object policies to explicitly read the outer storage.objects.name.
-- The unqualified name was shadowed by classes.name in the EXISTS subquery.

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
