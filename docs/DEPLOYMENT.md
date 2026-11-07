# TJUCPE deployment guide

## 0. Current boundary

This repository contains a static browser application and Supabase SQL migration. The connected GitHub integration can write repository files, but it does not expose Supabase project administration or hosting-dashboard configuration. A committed migration is not the same as an applied database migration, and a committed Pages workflow is not proof that a public site is already live.

The repository was public when inspected. It contains application source only. Do not upload class rosters, student reports, identifiers, grade exports, original workbooks, or private teaching materials here.

## 1. Apply the Supabase database migration

1. Open the Supabase project whose reference is snkokdrjxymlmyjbitbu.
2. Open SQL Editor → New query.
3. Copy the complete file supabase/migrations/202611070001_initial_schema.sql from this repository into the editor and run it as the project owner.
4. Run `supabase/verification/post_deploy_checks.sql` and inspect the four tables' RLS state, all policies on the application tables and `storage.objects`, grants, private helper functions, triggers, and private bucket. Review any pre-existing permissive Storage policies because policies combine with OR.
5. In Authentication → URL Configuration, add the eventual GitHub Pages address to the allowed redirect URLs. The usual project URL is https://untholionleen.github.io/TJUCPE/; use it only after the Pages deployment has succeeded.
6. Register your own account in the site, verify the email if email confirmation is enabled, then run the admin bootstrap SQL at the bottom of the migration, replacing YOUR_ADMIN_EMAIL with the email used for your own account.
7. Assign teacher users with the same SQL pattern and role teacher. Student registration itself never accepts a role.

## 2. Enable GitHub Pages

1. Open repository Settings → Pages.
2. Under Build and deployment, select GitHub Actions as the source.
3. Open Actions and allow the workflow to run if GitHub asks for approval.
4. The workflow .github/workflows/pages.yml deploys the repository root on pushes to main.
5. Wait for the Deploy TJUCPE to GitHub Pages workflow to complete successfully. The site URL is usually https://untholionleen.github.io/TJUCPE/.

The GitHub connector used here cannot change repository visibility or switch the Pages setting. Both are account-level repository settings.

## 3. Configure Authentication

In Supabase Authentication settings:
- Enable the email/password provider.
- Decide whether email confirmation is required for the course.
- Set the Site URL to the final Pages URL.
- Add the Pages URL to Redirect URLs.
- Test registration, email confirmation, login, logout and password reset.

## 4. First-use acceptance tests

Use two separate student test accounts and one staff account.

- A new registration creates a profiles row with role student.
- Sending role=admin or role=teacher in signup metadata has no effect.
- A student cannot read another student's experiment_records, report rows, or report objects.
- A student cannot update their own role, grade, feedback, reviewer, report status, report path, or any submitted report row.
- A student cannot delete an already-submitted report object; the student can only clean up an orphan upload when no report row references it.
- A teacher can read report submissions and private report files, and can save grade/feedback/status. A teacher cannot change roles or delete submitted report files.
- An admin can manage user roles and delete report rows/objects under the administrative process; role changes generate an audit_logs row.
- Student report uploads are limited to PDF/DOCX and 20 MB in the app; Storage also enforces its configured file limit and MIME allowlist.
- Signed download URLs expire after 90 seconds.
- Data analysis exports CSV and PNG; the original input data is kept separately from fitted values.

## 5. Production notes

- The browser contains only the Supabase URL and publishable key. Never place service_role, secret keys, database passwords or deployment tokens in config.js.
- RLS and SQL grants together are the security boundary. Do not launch with the migration unapplied. Keep the `private` schema out of the Supabase API's Exposed schemas.
- Use HTTPS and enable MFA for administrative Supabase/GitHub accounts.
- Establish data-retention and report deletion policies with the teaching center before importing real student records.
- Back up the Supabase database and Storage. A scheduled export is not configured by this repository.
- GitHub Pages is static hosting; it does not provide a private application backend. GitHub explicitly says Pages should not be used for sensitive transactions such as sending passwords. Treat the current Pages deployment as a public preview, not the production student login/report endpoint. Move the frontend to hosting intended for authenticated applications before accepting real student credentials or reports. Student records remain in Supabase, governed by RLS.

## 6. Supabase Free project inactivity

A Free project can be paused after a period of inactivity under Supabase's current policy. A frontend keep-alive ping is not a guaranteed prevention method. For a teaching service that must remain available throughout a semester, evaluate an eligible paid plan and configure backups/monitoring. Check the current Supabase pricing and pause policy before deciding.
