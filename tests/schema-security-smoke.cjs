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

const verification = fs.readFileSync("supabase/verification/post_deploy_checks.sql", "utf8").toLowerCase();
assert.ok(verification.includes("from pg_policies"), "post-deployment policy inspection must be provided");
assert.ok(verification.includes("from storage.buckets"), "post-deployment bucket inspection must be provided");
assert.ok(verification.includes("from information_schema.role_table_grants"),
  "post-deployment grants inspection must be provided");

console.log("TJUCPE schema security smoke tests passed (RLS, role boundaries, private Storage, helper grants).");
