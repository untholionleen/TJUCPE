-- TJUCPE teacher workbook templates, private reference workbooks, and assignment-level sharing.
-- Historical migration v21. The live project applied this migration before this source
-- file was added to the repository; migration v22 additionally tightens its privileges.

create table if not exists public.assignment_templates (
  assignment_id uuid primary key references public.experiment_assignments(id) on delete cascade,
  workbook_snapshot jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint assignment_templates_snapshot_size_check
    check (octet_length(workbook_snapshot::text) <= 400000)
);

alter table public.assignment_templates enable row level security;

drop policy if exists assignment_templates_select_staff_or_student on public.assignment_templates;
create policy assignment_templates_select_staff_or_student
on public.assignment_templates for select to authenticated
using (
  exists (
    select 1 from public.experiment_assignments a
    where a.id = assignment_templates.assignment_id
      and (
        private.is_admin()
        or private.is_class_teacher(a.class_id)
        or (
          a.is_open = true
          and exists (
            select 1 from public.class_members cm
            where cm.class_id = a.class_id
              and cm.student_id = (select auth.uid())
              and cm.status = 'active'
          )
        )
      )
  )
);

drop policy if exists assignment_templates_insert_staff on public.assignment_templates;
create policy assignment_templates_insert_staff
on public.assignment_templates for insert to authenticated
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.experiment_assignments a
    where a.id = assignment_templates.assignment_id
      and (private.is_admin() or private.is_class_teacher(a.class_id))
  )
);

drop policy if exists assignment_templates_update_staff on public.assignment_templates;
create policy assignment_templates_update_staff
on public.assignment_templates for update to authenticated
using (
  exists (
    select 1 from public.experiment_assignments a
    where a.id = assignment_templates.assignment_id
      and (private.is_admin() or private.is_class_teacher(a.class_id))
  )
)
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.experiment_assignments a
    where a.id = assignment_templates.assignment_id
      and (private.is_admin() or private.is_class_teacher(a.class_id))
  )
);

drop policy if exists assignment_templates_delete_staff on public.assignment_templates;
create policy assignment_templates_delete_staff
on public.assignment_templates for delete to authenticated
using (
  exists (
    select 1 from public.experiment_assignments a
    where a.id = assignment_templates.assignment_id
      and (private.is_admin() or private.is_class_teacher(a.class_id))
  )
);

alter table public.experiment_reference_sets
  add column if not exists storage_path text,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type text;

-- Teacher reference XLSX files live in the private lab-reports bucket.
-- File path shape: teacher-reference/<class UUID>/<randomized filename>.
drop policy if exists teacher_reference_objects_insert on storage.objects;
create policy teacher_reference_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'lab-reports'
  and (storage.foldername(name))[1] = 'teacher-reference'
  and exists (
    select 1 from public.classes c
    where c.id::text = (storage.foldername(name))[2]
      and (private.is_admin() or private.is_class_teacher(c.id))
  )
);

drop policy if exists teacher_reference_objects_select on storage.objects;
create policy teacher_reference_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'lab-reports'
  and (storage.foldername(name))[1] = 'teacher-reference'
  and exists (
    select 1 from public.classes c
    where c.id::text = (storage.foldername(name))[2]
      and (private.is_admin() or private.is_class_teacher(c.id))
  )
);

drop policy if exists teacher_reference_objects_delete on storage.objects;
create policy teacher_reference_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'lab-reports'
  and (storage.foldername(name))[1] = 'teacher-reference'
  and exists (
    select 1 from public.classes c
    where c.id::text = (storage.foldername(name))[2]
      and (private.is_admin() or private.is_class_teacher(c.id))
  )
);
