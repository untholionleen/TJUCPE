alter table public.experiment_records
  add column if not exists assignment_id uuid null
  references public.experiment_assignments(id) on delete set null;

create index if not exists experiment_records_assignment_owner_created_idx
  on public.experiment_records (assignment_id, owner_id, created_at desc)
  where assignment_id is not null;
