-- Teacher analysis records are personal workspace data. Class task exports use
-- the service-side endpoint, which verifies class ownership before returning records.
drop policy if exists records_select_owner_or_staff on public.experiment_records;
create policy records_select_owner_or_admin
on public.experiment_records
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or private.is_admin()
);