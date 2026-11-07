# Security and privacy notes

## Credential model

- The browser uses only the Supabase Project URL and a publishable key. A publishable key is intentionally public; it identifies the app, not an individual user.
- Supabase Auth identifies signed-in users. Postgres grants and Row Level Security decide which operations and rows each user may access.
- Never put a Supabase secret key, legacy service-role key, database password, OAuth secret, or GitHub deployment token in browser code or this repository.
- SECURITY DEFINER functions live in the non-exposed `private` schema, have an empty `search_path`, and are not directly executable by browser roles except the two role-check helpers used by RLS.

## Database access model

| Resource | Student | Teacher | Admin |
|---|---|---|---|
| Own profile | Read / update permitted profile fields | Same | Manage profiles and roles |
| Experiment records | Read / insert / update / delete own | Read all for teaching support | Read / manage all |
| Report rows | Read own; no update or delete after submission | Read all; grade / feedback / status update | Full review and administrative delete |
| Submitted report files | Read own; cannot delete once linked to a report row | Read all authorized reports | Read and delete |
| Orphan uploads | May delete own upload only while no report row references it | No special cleanup permission | Administrative delete |
| Audit logs | No access | No access | Read only |

New signups always create a `student` profile. User-editable signup metadata is never trusted to assign teacher/admin roles. Role changes are guarded in the database and written to `audit_logs`.

## Storage controls

- The `lab-reports` bucket must remain private.
- Object paths begin with the authenticated user's UUID.
- The bucket enforces a 20 MiB file-size limit and PDF/DOCX MIME allowlist.
- Students can read only their own objects; teaching staff can read reports for teaching review.
- A student can delete an uploaded object only if no `report_submissions` row references that path. This supports cleanup after a failed metadata insert without allowing deletion of an already-submitted report.
- Storage policies are permissive by default and multiple permissive policies combine with OR. Inspect all policies on `storage.objects` for this bucket; remove or revise any unrelated broad policy that would widen access.

## Repository and hosting boundary

The repository was verified as Public at the time of deployment checks. Only generic source code, SQL schema and public documentation are committed. Uploaded student reports, spreadsheets containing personal or grade information, class rosters and private teaching materials are excluded.

The current GitHub Pages site is a public preview. GitHub's documentation explicitly says Pages should not be used for sensitive transactions such as sending passwords. Move the frontend to hosting intended for authenticated applications before collecting real student credentials, student identifiers, grades, or experiment reports.

## Required acceptance tests before real data

1. Apply the SQL migration successfully in the correct Supabase project.
2. Run `supabase/verification/post_deploy_checks.sql`; verify all four business tables have RLS enabled, the report bucket is private, expected grants/policies/triggers exist, and no additional Storage policies broaden access.
3. Test with two separate student accounts: each can access only their own records and report objects; neither can modify submitted report rows or delete submitted objects.
4. Test a teacher account: it can view and review reports but cannot manage roles or delete report files.
5. Test an admin account: role changes are audited and admin-only actions work.
6. Verify email confirmation, password recovery, sign-out, and session expiry.
7. Use test-only accounts and synthetic files until these checks pass.

## Scope and limitations

The current CI verifies JavaScript syntax, polynomial regression smoke cases, and static schema/security invariants. It does not connect to the user's Supabase database and therefore does not prove the SQL has executed, the live RLS policies match the file, or Storage is isolated correctly.

The repository does not claim application-layer end-to-end encryption. Database/storage encryption-at-rest and transport security depend on Supabase's service configuration. Retention periods, backups, access reviews, MFA and incident response still need to be established by the institution.
