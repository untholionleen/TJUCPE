# TJUCPE deployment status

Last checked: 2026-11-08

## Confirmed on the connected Supabase project

- Project `TJUCPE` is `ACTIVE_HEALTHY`.
- Database migration history includes five applied migrations, through `tjucpe_active_class_submission_guard_v8`.
- Verified application tables: `profiles`, `experiment_records`, `report_submissions`, `audit_logs`, `classes`, `class_members`, `experiment_catalog`, `experiment_assignments`, `report_revisions`.
- RLS is enabled on the inspected business tables.
- `experiment_catalog` currently contains 14 experiment entries.
- The `lab-reports` bucket exists and is private, with a 20 MiB limit and PDF/DOCX MIME allowlist.
- Storage policies now include current-report/revision-history reads and class-staff upload of reviewed PDFs.
- Edge Function `classroom-admin` is ACTIVE version 9 with JWT verification.
- The existing legacy report without a class/task assignment remains intact; the new-submission trigger requires class membership and a matching open assignment for all new student submissions.
- Migration v5 adds `profiles.account_status` and `report_submissions.review_annotations`; migration v6 adds foreign-key/audit lookup indexes; migration v7 enforces deadlines on student resubmissions without altering legacy reports; migration v8 blocks new and resubmitted student reports in archived classes.

## Confirmed repository changes

- Added class editing, class archival/reactivation and administrator teacher assignment.
- Added experiment catalog create/edit/disable/enable UI for teachers and administrators.
- Added per-table Excel/CSV import controls with workbook-specific column mapping for the supplied experiment workbooks; added a safeguard for unequal-length Sn/Pb cooling curves.
- Added embedded PDF page rendering and freehand annotation layer in the teacher grading workspace. Saving annotations uploads a new reviewed PDF version and updates the current report path; old files remain referenced by report revisions.
- Added version-aware cache busting for the current application assets.
- Added the deployed `classroom-admin` Edge Function source to the repository.
- Teachers can generate recovery links for students in their own classes. A teacher can permanently delete an account only when the student has no other active class membership; otherwise the teacher can only remove that student from their own class. Administrators can permanently delete student accounts globally.

## Remaining verification / cautions

- The repository's Pages workflow file contains JavaScript syntax, experiment engine, regression and database-security smoke checks. The latest Pages run must be confirmed in GitHub Actions before declaring the public preview updated.
- End-to-end browser testing with synthetic student/teacher/admin accounts has not been completed in this session. PDF drawing, save, student re-open and revision-history flows still need a real browser acceptance pass.
- Supabase Security Advisor reports leaked-password protection disabled. Enable this in Auth password security settings.
- Performance Advisor may report RLS policy init-plan/multiple-permissive-policy optimizations; these are performance recommendations and do not indicate that RLS is disabled.
- Do not import production student data until the multi-role acceptance tests pass and the production hosting environment is appropriate for authenticated student transactions.
