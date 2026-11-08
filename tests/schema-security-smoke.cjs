const assert = require("node:assert/strict");
const fs = require("node:fs");

const sql = fs.readFileSync("supabase/migrations/202611070001_initial_schema.sql", "utf8").toLowerCase();

const required = [
  "create table if not exists public.profiles",
  "create table if not exists public.experiment_records",
  "create table if not exists public.report_submissions",
  "create table if not exists public.audit_logs",
  "alter table public.profiles enable row level security",
  "alter table public.experiment_records enable row level security",
  "alter table public.report_submissions enable row level security",
  "alter table public.audit_logs enable row level security",
  "create policy profiles_select_self_or_staff",
  "create policy records_select_owner_or_staff",
  "create policy reports_select_student_or_staff",
  "create policy reports_update_staff_only",
  "create policy reports_delete_admin_only",
  "create policy report_objects_insert_own",
  "create policy report_objects_select_own_or_staff",
  "create policy report_objects_delete_orphan_own_or_admin",
  "values (\n  'lab-reports','lab-reports',false,20971520",
  "grant select, insert, delete on storage.objects to authenticated",
  "revoke all on function private.is_admin() from public, anon",
  "revoke all on function private.is_staff() from public, anon",
  "grant execute on function private.is_admin() to authenticated",
  "grant execute on function private.is_staff() to authenticated",
  "set search_path = ''",
  "create schema if not exists private",
  "create or replace function private.is_admin()",
  "create or replace function private.is_staff()",
  "create or replace function private.handle_new_user()",
  "create or replace function private.log_profile_role_change()",
  "do $verify$",
  "has_table_privilege('anon','public.profiles','select')",
];

for (const fragment of required) {
  assert.ok(sql.includes(fragment), `missing required schema/security fragment: ${fragment}`);
}

assert.ok(!sql.includes("create policy reports_update_student_or_staff"),
  "students must not have a report-row update policy");
assert.ok(!sql.includes("create policy report_objects_update_own"),
  "the browser must not be allowed to overwrite existing report objects");


const migrationLines = sql.split("\n");
let currentFunction = "";
let securityDefinerCount = 0;
for (const line of migrationLines) {
  const match = line.match(/create or replace function\s+([a-z0-9_.]+)/i);
  if (match) currentFunction = match[1];
  if (/security definer/i.test(line)) {
    securityDefinerCount += 1;
    assert.ok(currentFunction.startsWith("private."),
      `SECURITY DEFINER function must be isolated in private schema: ${currentFunction}`);
  }
}
assert.equal(securityDefinerCount, 4, "exactly four private SECURITY DEFINER functions are expected");

const dollarTags = [...sql.matchAll(/\$[a-z_]*\$|\$\$/gi)].map(match => match[0]);
assert.equal(dollarTags.length % 2, 0, "SQL dollar-quoted blocks must be paired");
for (let i = 0; i < dollarTags.length; i += 2) {
  assert.equal(dollarTags[i], dollarTags[i + 1], "SQL dollar-quote delimiters must match in pairs");
}
assert.ok(!migrationLines.some(line => /\bas\s+\$$/.test(line)),
  "SQL must not contain a truncated single-dollar function opener");

const reviewMigration = fs.readFileSync("supabase/migrations/20261107175451_tjucpe_full_workflow_pdf_review_v5.sql", "utf8").toLowerCase();
for (const fragment of [
  "add column if not exists review_annotations",
  "report_objects_select_current_owner_and_revision_history",
  "report_objects_insert_reviewed_pdf_class_staff",
  "reviewed"
]) assert.ok(reviewMigration.includes(fragment), "missing PDF review migration fragment: " + fragment);

const deadlineMigration = fs.readFileSync("supabase/migrations/20261107181323_tjucpe_report_resubmission_deadline_guard_v7.sql", "utf8").toLowerCase();
assert.ok(deadlineMigration.includes("a.due_at is null or a.due_at >= now()"),
  "student report resubmission must enforce assignment deadlines");
assert.ok(deadlineMigration.includes("old.class_id is null and old.assignment_id is null"),
  "legacy reports must remain compatible without invented class/task links");

const activeClassMigration = fs.readFileSync("supabase/migrations/20261107181407_tjucpe_active_class_submission_guard_v8.sql", "utf8").toLowerCase();
assert.ok(activeClassMigration.includes("c.is_active=true"),
  "new submissions must require an active class");
assert.ok(activeClassMigration.includes("active_class"),
  "student resubmissions must require an active class");

const rlsTuningMigration = fs.readFileSync("supabase/migrations/20261107181850_tjucpe_rls_performance_policy_tuning_v9.sql", "utf8").toLowerCase();
assert.ok(rlsTuningMigration.includes("create policy class_members_insert_teacher_admin"));
assert.ok(rlsTuningMigration.includes("create policy assignments_insert_teacher_admin"));
assert.ok(rlsTuningMigration.includes("reports_update_student_or_class_staff_v4"));
assert.ok(rlsTuningMigration.includes("(select auth.uid())"));

const legacyGuardMigration = fs.readFileSync("supabase/migrations/20261107181935_tjucpe_legacy_report_resubmit_guard_v10.sql", "utf8").toLowerCase();
assert.ok(legacyGuardMigration.includes("legacy reports cannot be resubmitted without a class assignment"));

const verification = fs.readFileSync("supabase/verification/post_deploy_checks.sql", "utf8").toLowerCase();
assert.ok(verification.includes("from pg_policies"), "post-deployment policy inspection must be provided");
assert.ok(verification.includes("from storage.buckets"), "post-deployment bucket inspection must be provided");
assert.ok(verification.includes("from information_schema.role_table_grants"),
  "post-deployment grants inspection must be provided");

console.log("TJUCPE schema security smoke tests passed (RLS, role boundaries, private Storage, helper grants).");

const reviewedCleanupMigration = fs.readFileSync("supabase/migrations/20261108114917_tjucpe_reviewed_pdf_orphan_cleanup_v12.sql", "utf8").toLowerCase();
assert.ok(reviewedCleanupMigration.includes("report_objects_delete_orphan_reviewed_pdf_class_staff"));
assert.ok(reviewedCleanupMigration.includes("private.is_class_teacher(r.class_id)"));
assert.ok(reviewedCleanupMigration.includes("not exists"), "staff may delete only orphaned reviewed PDFs, never the current report file");

const legacyHelperRevoke = fs.readFileSync("supabase/migrations/20261108115040_tjucpe_revoke_legacy_public_role_helpers_v13.sql", "utf8").toLowerCase();
assert.ok(legacyHelperRevoke.includes("revoke all on function public.is_admin() from public, anon, authenticated"));
assert.ok(legacyHelperRevoke.includes("revoke all on function public.is_staff() from public, anon, authenticated"));
