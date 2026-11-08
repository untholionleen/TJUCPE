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


## 2026-11-08 latest optimization deployment

- Front-end request timeout reduced from 30s to 15s with a clear Chinese timeout message; common Auth, SMTP, CORS, permission and redirect errors receive Chinese explanations.
- Account management supports admin invitation of teacher/student accounts, role changes, single and bulk recovery emails, disable/restore, and student deletion. The `list_users` action is restricted to administrators.
- Password reset uses a one-time email recovery link only to verify mailbox access. Users set their own password in the recovery page; the platform does not email a shared plaintext default password.
- Template downloads remain synchronous and include TXT per-table and multi-sheet Excel workbook with XLS fallback; click handler now provides an explicit message when no experiment is open.
- Assignment ZIP export includes class roster/status CSV, report files, raw data and analysis JSON, Chinese field indexes, and LaTeX formula metadata.
- KaTeX is loaded for formula rendering; mobile layout has horizontal table/LaTeX scrolling and full-width controls.
- `classroom-admin` Edge Function deployed ACTIVE v19 with JWT verification enabled.
- Current database check: 1 active admin, 1 active teacher, 1 active student; 1 class, 1 assignment, 0 reports. No data was cleared during this optimization.
- Supabase Security Advisor still warns that leaked-password protection is disabled; enable it in Authentication password security settings. Health Advisor reports no findings. Performance Advisor reports 13 unused indexes (informational; do not drop them before real usage patterns are observed).
- Latest GitHub Pages run `42465459327` succeeded; syntax checks, all 14 experiment workflow smoke tests, regression, schema-security checks and Pages deploy all passed. This does not replace real browser acceptance testing.

## 2026-11-08 19:50 — PDF save hardening and fresh audit

- Added an explicit **“保存批注并发布”** action beside the PDF annotation tools, in addition to the main grading save action.
- PDF review save now requires the updated `report_submissions` row to be returned by PostgREST (`select(...).single()`). A filtered/no-row UPDATE is no longer treated as success.
- If the client loses the network response after a possible database commit, the app re-reads the report before cleanup. It will not delete a reviewed PDF that has actually become the current report file.
- Added a narrowly scoped Storage DELETE policy for class staff: they may delete only orphaned files under `reviewed/<report-id>/`; a file referenced by any current report row remains protected.
- The matching database migration is `20261108114917_tjucpe_reviewed_pdf_orphan_cleanup_v12.sql`.
- Revoked authenticated execution on the unused legacy `public.is_admin()` and `public.is_staff()` SECURITY DEFINER wrappers. The Security Advisor no longer reports those two warnings.
- Current live Edge Function `classroom-admin`: ACTIVE v22, JWT verification enabled.
- Fresh data snapshot: 3 Auth users / 3 profiles, 1 class, 1 assignment, 1 submitted report, 0 report revisions, 0 experiment records. The existing submitted report row and its current Storage object were detected; this audit did not modify or delete that report.
- Security Advisor remaining warning: leaked-password protection is disabled and must be enabled in Supabase Authentication password security settings. Performance Advisor reports 13 unused indexes as informational only; retain them until representative workload data exists.
- JavaScript syntax, experiment-engine smoke tests, regression smoke tests, and schema-security smoke tests passed in the latest Pages workflow attempt before the final documentation-only update. Real authenticated browser acceptance (draw → save → reopen as teacher/student → inspect revision history) is still required and is not claimed as passed.

## 2026-11-08 19:54 — Role-helper dependency correction and latency review

- A fresh Postgres log review exposed a dependency that the earlier role-helper cleanup had not fully accounted for: trigger functions still called the legacy `public.is_staff()` / `public.is_admin()` wrappers. This was corrected by making `private.is_admin()` and `private.is_staff()` perform their role checks directly, then updating report-insert, profile-role and experiment-owner triggers to call the private helpers.
- Private role helpers now have EXECUTE only for `authenticated` and `service_role`; anonymous execution is false. The unused public wrappers have no execute permission for anon/authenticated. A database function scan found no remaining trigger/function dependencies on the public wrappers.
- The corresponding migrations are `20261108115218_tjucpe_private_role_helpers_direct_v14.sql` and `20261108115233_tjucpe_private_helper_grants_v15.sql`.
- Postgres error-log review after 2026-11-08 11:52 UTC returned no new ERROR entries. Earlier `permission denied for function is_staff/is_admin` entries predate the helper correction and are retained in historical logs; do not treat historical entries as current failures.
- Supabase project region is `us-west-2` while recent Edge Function execution was served from `us-west-1`; this project is therefore hosted in the US West region, not Europe. Recent observed storage request latency was about 252 ms average / 844 ms p95 across 30 requests (max about 971 ms). One historical `classroom-admin` request took about 5.7 seconds. This supports the user's latency concern but does not show a sustained database outage. Moving the project to an EU region would require a separate project and a planned data/auth/storage migration; region cannot be safely changed in place.
- The latest test workflow was triggered after the v14/v15 test additions; final completion status is tracked in GitHub Actions. No authenticated browser test has been fabricated or marked as passed.

## 2026-11-08 19:57 — Assignment export latency optimization

- `classroom-admin` Edge Function deployed ACTIVE v23 with JWT verification enabled.
- The `export_assignment_reports` action now fetches independent assignment/class, catalog/report/roster and profile/analysis/signed-URL data in parallel. It also reuses one profile lookup for submitted, missing and analysis rows instead of issuing repeated profile queries. Export scope remains exact `assignment_id` matching; no time-window guessing was introduced.
- This is a code-level latency optimization. A real authenticated large-class ZIP download has not yet been exercised after deployment, so no end-to-end export success is claimed.

## 2026-11-08 20:00 — Request timeout separation and role-check verification

- Supabase client timeout is now request-specific: ordinary database/API calls 15 seconds, Auth 30 seconds, Edge Functions 45 seconds, Storage uploads/downloads 60 seconds. The custom fetch also preserves an AbortSignal supplied on a Request object. This avoids terminating a legitimate PDF transfer or class export at the same 15-second threshold used for ordinary queries.
- Direct role-helper checks were executed under the `authenticated` database role with test JWT subjects: teacher → `is_staff=true`, `is_admin=false`; admin → both true; student → both false. The test transactions were rolled back and did not change application records.
- The report currently in the database remains a submitted student report; its stored PDF object exists. It was not edited during this audit. Its annotation save/reopen/history path still needs a real teacher-browser acceptance pass.

## 2026-11-08 20:02 — Transactional report-review database acceptance

- Executed a rollback-only transaction under the authenticated teacher role against the existing submitted report. The transaction temporarily changed the report path, score, feedback, status and annotation JSON; the `report_revisions` trigger recorded `file_replaced` with the prior path and version 1.
- The transaction was rolled back. A subsequent query confirmed the original report path, `submitted` status, `submission_version=1`, and zero persisted revisions were unchanged. No Storage object was uploaded, overwritten or deleted during this database-only test.
- This verifies teacher RLS update permission, the report update guards, and revision-history trigger behavior. It does not replace the browser test of PDF generation, Storage upload, signed/private-file readback, and student-side reopening.
