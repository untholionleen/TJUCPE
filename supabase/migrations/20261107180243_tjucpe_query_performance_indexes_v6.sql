-- TJUCPE query performance indexes for foreign-key joins and audit lookups
create index if not exists audit_logs_actor_created_idx on public.audit_logs(actor_id, created_at desc);
create index if not exists audit_logs_target_created_idx on public.audit_logs(target_user_id, created_at desc);
create index if not exists experiment_assignments_created_by_idx on public.experiment_assignments(created_by);
create index if not exists experiment_assignments_experiment_id_idx on public.experiment_assignments(experiment_id);
create index if not exists experiment_catalog_created_by_idx on public.experiment_catalog(created_by);
create index if not exists experiment_catalog_updated_by_idx on public.experiment_catalog(updated_by);
create index if not exists report_revisions_changed_by_idx on public.report_revisions(changed_by);
create index if not exists report_submissions_reviewed_by_idx on public.report_submissions(reviewed_by);
