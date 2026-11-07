# TJUCPE deployment status

Last checked: 2026-11-07

## Confirmed

- The user manually ran the website's Supabase Auth connection check and reported HTTP 200. This confirms the Auth endpoint recognized the current publishable key at that time; it does not test the database schema or RLS.
- The repository's `main` branch contains the latest publishable-key configuration and cache-busting script reference.
- GitHub Actions run [42385334817](https://github.com/untholionleen/TJUCPE/actions/runs/42385334817) completed successfully for commit `59606a0f7283fbb4d148385a9a46b3841898c8aa`.
- The latest workflow passed JavaScript syntax, polynomial regression smoke tests, database-security schema smoke tests, Pages assembly, artifact upload and deployment.
- The migration includes tables, RLS policies, least-privilege grants, private Storage, private role helpers, role/report guards, and fail-fast post-creation checks.
- A read-only follow-up inspection script is available at `supabase/verification/post_deploy_checks.sql`.

## Not yet confirmed / not yet deployed

- The SQL migration has **not** been executed against Supabase project `snkokdrjxymlmyjbitbu`.
- The live existence of `profiles`, `experiment_records`, `report_submissions`, `audit_logs`, and the `lab-reports` bucket has not been checked.
- Live RLS behavior, table grants, Storage policy isolation, auth email delivery, administrator bootstrap, teacher workflow, and student-to-student isolation have not been tested.
- No production student accounts, grades, reports, or class rosters should be entered yet.

## Remaining Supabase deployment sequence

1. Connect the Supabase project through the Supabase integration so project-level SQL execution is available, or have the project owner execute the migration below.
2. Run the complete `supabase/migrations/202611070001_initial_schema.sql` in SQL Editor as project owner. It ends with fail-fast checks for key tables, RLS, policies, private bucket, anon grants, and private schema access.
3. Run `supabase/verification/post_deploy_checks.sql` and inspect every policy on `storage.objects`, including policies that existed before this migration.
4. Register only synthetic test accounts first. Bootstrap the administrator and assign teacher accounts through the documented owner/admin workflow.
5. Test two separate student accounts, one teacher, and one administrator against the acceptance matrix in `docs/SECURITY.md`.
6. Only after all checks pass, consider migration away from GitHub Pages to hosting appropriate for authenticated student transactions.

A successful Auth HTTP 200 or GitHub Pages build is not proof that the database migration has been applied.
