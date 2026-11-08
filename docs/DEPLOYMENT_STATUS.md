# TJUCPE deployment status

Last checked: 2026-11-08

## Confirmed on the connected Supabase project

- Project `TJUCPE` is `ACTIVE_HEALTHY`.
- Database migration history includes five applied migrations, through `tjucpe_legacy_report_resubmit_guard_v10`.
- Verified application tables: `profiles`, `experiment_records`, `report_submissions`, `audit_logs`, `classes`, `class_members`, `experiment_catalog`, `experiment_assignments`, `report_revisions`.
- RLS is enabled on the inspected business tables.
- `experiment_catalog` currently contains 14 experiment entries.
- The `lab-reports` bucket exists and is private, with a 20 MiB limit and PDF/DOCX MIME allowlist.
- Storage policies now include current-report/revision-history reads and class-staff upload of reviewed PDFs.
- Edge Function `classroom-admin` is ACTIVE version 9 with JWT verification.
- The existing legacy report without a class/task assignment remains intact; the new-submission trigger requires class membership and a matching open assignment for all new student submissions.
- Migration v5 adds `profiles.account_status` and `report_submissions.review_annotations`; migration v6 adds foreign-key/audit lookup indexes; migration v7 enforces deadlines on student resubmissions without altering legacy reports; migration v8 blocks new and resubmitted student reports in archived classes; migration v9 tunes RLS policy overlap and auth.uid() evaluation; migration v10 blocks resubmission of legacy reports without class/task links while preserving their records.

## Confirmed repository changes

- Added class editing, class archival/reactivation and administrator teacher assignment.
- Added experiment catalog create/edit/disable/enable UI for teachers and administrators.
- Added per-table Excel/CSV import controls with workbook-specific column mapping for the supplied experiment workbooks; added a safeguard for unequal-length Sn/Pb cooling curves.
- Added embedded PDF page rendering and freehand annotation layer in the teacher grading workspace. Saving annotations uploads a new reviewed PDF version and updates the current report path; old files remain referenced by report revisions.
- Added version-aware cache busting for the current application assets.
- Added the deployed `classroom-admin` Edge Function source to the repository.
- Teachers can generate recovery links for students in their own classes. A teacher can permanently delete an account only when the student has no other active class membership; otherwise the teacher can only remove that student from their own class. Administrators can permanently delete student accounts globally.

## Remaining verification / cautions

- The repository's Pages workflow checks JavaScript syntax, experiment engine, regression and database-security smoke tests. The Jekyll Pages configuration excludes design/deployment docs, Supabase migrations, tests and source-data file types from the website artifact. The GitHub repository itself remains public.
- End-to-end browser testing with synthetic student/teacher/admin accounts has not been completed in this session. PDF drawing, save, student re-open and revision-history flows still need a real browser acceptance pass.
- Supabase Security Advisor reports leaked-password protection disabled. Enable this in Auth password security settings.
- Performance Advisor may report RLS policy init-plan/multiple-permissive-policy optimizations; these are performance recommendations and do not indicate that RLS is disabled.
- Do not import production student data until the multi-role acceptance tests pass and the production hosting environment is appropriate for authenticated student transactions.


## Latest deployment verification

- Latest source commit: `f5b3344266ce4337d94b1e94790f4dc0fd2fc0bc`.
- Custom application deployment: GitHub Actions run `42400925071` — **success**.
- GitHub Pages Jekyll build/deployment: run `42400925365` — **success**.
- Verified CI steps: `node --check app.js`, `node --check experiment-engine.js`, 14-workflow calculation smoke test, regression smoke test, database-security schema smoke test, static-site assembly and Pages deployment — all passed.
- Supabase migration history is applied through `tjucpe_legacy_report_resubmit_guard_v10`; `classroom-admin` is ACTIVE v9.
- Remaining manual acceptance: use synthetic student/teacher/admin accounts to test invite/reset/delete, class assignment gating, report withdraw/edit/delete, PDF annotation save and student re-open. No production student data was used for this acceptance pass.


## 2026-11-08 follow-up correction

- classroom-admin Edge Function deployed and ACTIVE v10; new delete_class action allows teacher/admin permanent deletion only when no report records exist. Classes with reports must be archived to preserve teaching history.
- Experiment workspaces now expose a per-table TXT template and a multi-sheet XLSX template. The same templates can be uploaded; XLSX import matches expected column headers. Manual entry remains available.
- Student report center now loads open assignments from active class memberships and displays them as actionable task cards.
- Staff dashboard now displays teaching metrics and management shortcuts rather than student personal activity or student-oriented metrics.
- Fixed student account checkbox rendering in the admin user table.
- CI run 42441486227 succeeded on commit 3c7aab70bb618e53c679cba31be203f5b0c29fd0, including all 14 experiment workflow smoke tests, regression, schema security and Pages deployment.
- Reset all existing Auth users and teaching test records on 2026-11-08. Post-reset counts: Auth users 0; profiles 0; classes 0; memberships 0; assignments 0; reports 0; experiment records 0; audit logs 0. The 14 experiment catalog entries, schema, policies, migrations and private report bucket remain.
- First administrator setup is documented in docs/RESET_AND_FIRST_ADMIN.md. After first registration, project owner must promote the selected account to admin in Supabase SQL Editor.
