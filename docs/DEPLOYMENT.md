# TJUCPE deployment and operations

## Current verified state (2026-11-08)

- Repository: `untholionleen/TJUCPE`, default branch `main`.
- Supabase project: `TJUCPE`, status `ACTIVE_HEALTHY`.
- Applied database migrations:
  - `20261107154542_tjucpe_classroom_catalog_assignments_v2`
  - `20261107170207_tjucpe_report_lifecycle_v3`
  - `20261107173313_report_student_edit_guard_v4`
  - `20261107175451_tjucpe_full_workflow_pdf_review_v5`
  - `20261107180243_tjucpe_query_performance_indexes_v6`
  - `20261107181323_tjucpe_report_resubmission_deadline_guard_v7`
  - `20261107181407_tjucpe_active_class_submission_guard_v8`
  - `20261107181850_tjucpe_rls_performance_policy_tuning_v9`
  - `20261107181935_tjucpe_legacy_report_resubmit_guard_v10`
- Verified business tables include profiles, classes, class_members, experiment_catalog (14 rows), experiment_assignments, report_submissions, report_revisions, audit_logs. RLS is enabled on these tables.
- Storage bucket `lab-reports` is private, with a 20 MiB limit and PDF/DOCX allowlist.
- Edge Function `classroom-admin` is ACTIVE version 9 with JWT verification.
- Current sample database has three profiles, one class, one class member, 14 experiment catalog rows, no experiment assignments yet, one legacy report, one report revision and three audit entries. These are counts only; no student personal details are copied into this document.

## Deploying code

1. Push to `main`; the `.github/workflows/pages.yml` workflow checks JavaScript syntax and experiment/regression/security smoke tests, then deploys the static application to GitHub Pages.
2. Verify the latest workflow run completed successfully before treating the public preview as updated.
3. Browser cache references are versioned in `index.html`; hard-refresh only if an older asset remains cached.

## Database migration discipline

The five migrations above have already been applied to the connected TJUCPE project. **Do not rerun the original initial schema or reapply the same migrations on this live database.** For a new environment, apply the migration files in timestamp order and then run `supabase/verification/post_deploy_checks.sql`.

The v5 migration adds account lifecycle metadata, review annotation storage, and Storage policies so students can read the current annotated PDF and authorized teachers can upload reviewed PDF versions. The v6 migration adds foreign-key and audit lookup indexes. The v7 migration prevents student resubmission after an assignment deadline while retaining legacy report compatibility. The v8 migration also blocks new submissions and student resubmissions when a class has been archived. The v9 migration splits overlapping ALL policies and wraps direct auth.uid() policy checks in SELECT InitPlans to reduce per-row evaluation. The v10 migration prevents unassigned legacy reports from being resubmitted without inventing class/task links.

## Roles and account lifecycle

- Students can only submit against an active membership and a currently open required assignment in their class.
- Teachers can create/manage their own classes, import their class roster, manage class memberships, reset student passwords by generating recovery links, and review reports in their assigned classes.
- Teachers can permanently delete a student account only when that student has no other active class membership. If the student belongs to multiple active classes, the teacher action removes the student from the teacher’s own class only. Administrators can permanently delete student accounts globally.
- Only administrators can permanently delete student Auth accounts. This operation removes associated report objects and account-linked data; use only after confirming retention requirements.
- Password resets use Supabase Auth recovery links. Staff should deliver the one-time link securely; the platform does not reveal or display a student's existing password.
- Administrators can assign teachers to classes, manage all classes and experiment catalog entries, assign roles, and access system diagnostics and audit logs.

## Reports and PDF review

- New submissions require class membership and a published experiment assignment.
- A submitted student report must be withdrawn before the student can replace its file. Draft, returned and withdrawn reports may be edited/deleted under the lifecycle policy; graded reports are read-only to students.
- Teacher PDF annotations are drawn in the embedded PDF review workspace. Saving annotations creates a new PDF object under `reviewed/<report-id>/...`, updates the current report file path, increments the submission version, and lets the revision trigger preserve the previous path. The original PDF is not overwritten.
- Students and teachers both resolve the current `report_submissions.storage_path`; revision history keeps the previous file reference.
- DOCX files can be previewed and reviewed with written feedback; page-level ink annotations are currently PDF-only.

## Experiment data and plotting

- The 14 built-in experiment workflows use separate table schemas and experiment-specific calculations.
- Each experiment table has its own Excel/CSV import control. The workbook importer maps the supplied saponification, adsorption, galvanic-cell, phase-diagram, boiling-composition, reaction-enthalpy, freezing-point, equilibrium, thermostat/viscosity and passivation sheets into the corresponding table columns. Surface tension accepts the processed c/γ/Γ workbook directly. Zeta-potential is intentionally left to manual column confirmation because the workbook’s KCl concentration cell is ambiguous; vapor-pressure and peroxide sheets do not provide a verified numeric source table.
- Interactive Plotly rectangle/lasso selection controls the selected fit points; Matplotlib/Python is used for publication-style raster plots. If the Python runtime is unavailable, the interactive Plotly chart remains available.
- CSV export is Origin-compatible. The browser does not remotely control a local Origin installation.
- Newly added catalog entries default to the generic workspace until a teacher-reviewed dedicated calculation template is supplied.
- Experimental constants and equations must be verified against the actual lab manual and current course requirements; warnings in the calculation engine are intentional and must not be bypassed silently.

## Security and remaining checks

- The browser uses only the Supabase publishable key. Never place service-role or secret keys in static assets or GitHub.
- The repository is public; do not commit rosters, student reports, grade exports, identifiers or private teaching datasets.
- RLS and Storage policies are the security boundary; UI hiding is not authorization.
- Supabase Security Advisor currently reports leaked-password protection disabled. Enable it in Supabase Auth password-security settings.
- Performance Advisor may continue to report RLS init-plan and multiple permissive-policy optimization suggestions. These are performance advisories, not evidence that row security is disabled; review them before scaling to large classes.
- GitHub Pages is a preview host. Before collecting real student credentials or sensitive reports at scale, deploy behind an appropriate authenticated application host and complete synthetic multi-role acceptance tests.
