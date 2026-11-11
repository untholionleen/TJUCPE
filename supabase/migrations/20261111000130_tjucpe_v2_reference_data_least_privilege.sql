-- TJUCPE 2.0 reference-data least-privilege migration.
-- RLS policies restrict authenticated rows to teachers of the class and administrators.
revoke all privileges on table public.experiment_reference_sets from anon;
grant select, insert, update, delete on table public.experiment_reference_sets to authenticated;
