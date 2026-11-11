-- Student submission workflow is report + data workbook only.
-- Preserve historical student records as readable data, but make new analysis records
-- and their modification/deletion a teacher/admin workflow.

drop policy if exists records_insert_owner on public.experiment_records;
create policy records_insert_staff_only
on public.experiment_records for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and private.is_staff()
);

drop policy if exists records_update_owner_or_admin on public.experiment_records;
create policy records_update_staff_or_admin
on public.experiment_records for update to authenticated
using (
  private.is_admin()
  or (owner_id = (select auth.uid()) and private.is_staff())
)
with check (
  private.is_admin()
  or (owner_id = (select auth.uid()) and private.is_staff())
);

drop policy if exists records_delete_owner_or_admin on public.experiment_records;
create policy records_delete_staff_or_admin
on public.experiment_records for delete to authenticated
using (
  private.is_admin()
  or (owner_id = (select auth.uid()) and private.is_staff())
);
