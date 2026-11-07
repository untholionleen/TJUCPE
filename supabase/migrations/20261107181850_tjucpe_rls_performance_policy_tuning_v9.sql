-- Tune RLS policies for predictable query plans and avoid overlapping permissive SELECT/UPDATE policies.
drop policy if exists class_members_manage_teacher_admin on public.class_members;
create policy class_members_insert_teacher_admin on public.class_members for insert to authenticated
  with check (private.is_class_teacher(class_id));
create policy class_members_update_teacher_admin on public.class_members for update to authenticated
  using (private.is_class_teacher(class_id)) with check (private.is_class_teacher(class_id));
create policy class_members_delete_teacher_admin on public.class_members for delete to authenticated
  using (private.is_class_teacher(class_id));

drop policy if exists assignments_manage_teacher_admin on public.experiment_assignments;
create policy assignments_insert_teacher_admin on public.experiment_assignments for insert to authenticated
  with check (private.is_class_teacher(class_id));
create policy assignments_update_teacher_admin on public.experiment_assignments for update to authenticated
  using (private.is_class_teacher(class_id)) with check (private.is_class_teacher(class_id));
create policy assignments_delete_teacher_admin on public.experiment_assignments for delete to authenticated
  using (private.is_class_teacher(class_id));

drop policy if exists reports_update_class_staff_v3 on public.report_submissions;
drop policy if exists reports_update_student_lifecycle_v3 on public.report_submissions;
create policy reports_update_student_or_class_staff_v4 on public.report_submissions
  for update to authenticated
  using (
    private.is_class_teacher(class_id)
    or (student_id = (select auth.uid()) and status = any(array['draft','submitted','returned','withdrawn']::text[]))
  )
  with check (
    private.is_class_teacher(class_id)
    or (student_id = (select auth.uid()) and status = any(array['draft','submitted','withdrawn']::text[]))
  );

do $$
declare p record; new_qual text; new_check text; stmt text;
begin
  for p in
    select schemaname,tablename,policyname,qual,with_check
    from pg_policies
    where schemaname='public'
      and policyname in (
        'catalog_insert_staff','assignments_select_class_members_staff',
        'records_update_owner_or_admin','records_insert_owner','records_delete_owner_or_admin',
        'profiles_update_self_or_admin','classes_select_member_or_staff','classes_insert_teacher_admin',
        'class_members_select_self_teacher_admin','profiles_select_self_admin_or_own_roster',
        'reports_insert_assigned_class_task','reports_select_student_class_teacher_admin',
        'records_select_owner_or_staff'
      )
  loop
    new_qual := case when p.qual is null then null else replace(p.qual,'auth.uid()','(select auth.uid())') end;
    new_check := case when p.with_check is null then null else replace(p.with_check,'auth.uid()','(select auth.uid())') end;
    stmt := format('alter policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
    if new_qual is not null then stmt := stmt || format(' using (%s)',new_qual); end if;
    if new_check is not null then stmt := stmt || format(' with check (%s)',new_check); end if;
    execute stmt;
  end loop;
end $$;
