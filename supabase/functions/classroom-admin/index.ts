import { withSupabase } from "npm:@supabase/server";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

type StudentInput = { email?: string; full_name?: string; student_no?: string };
const APP_REDIRECT_URL = "https://untholionleen.github.io/TJUCPE/";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "POST required" }, 405);
    try {
      const { supabaseAdmin, userClaims } = ctx;
      const actorId = userClaims?.sub ?? userClaims?.id;
      if (!actorId) return json({ error: "Unauthorized" }, 401);

      const { data: actor, error: actorError } = await supabaseAdmin
        .from("profiles").select("id,role,account_status").eq("id", actorId).single();
      if (actorError || !actor || !["teacher", "admin", "student"].includes(actor.role)) {
        return json({ error: "Authenticated platform account required" }, 403);
      }

      if (actor.account_status === "disabled") return json({ error: "This account is disabled. Contact the platform administrator." }, 403);

      const body = await req.json();
      const action = String(body.action ?? "");
      const classId = String(body.class_id ?? "");
      const isAdmin = actor.role === "admin";

      const canManageClass = async () => {
        if (!classId) return false;
        if (isAdmin) return true;
        if (actor.role !== "teacher") return false;
        const { data } = await supabaseAdmin.from("classes")
          .select("id").eq("id", classId).eq("teacher_id", actorId).maybeSingle();
        return !!data;
      };

      const isStudentInManagedClass = async (targetId: string) => {
        if (!await canManageClass()) return false;
        const { data } = await supabaseAdmin.from("class_members").select("student_id")
          .eq("class_id", classId).eq("student_id", targetId).eq("status", "active").maybeSingle();
        return !!data;
      };

      const audit = async (targetId: string | null, event: string, details: Record<string, unknown> = {}) => {
        await supabaseAdmin.from("audit_logs").insert({
          actor_id: actorId, target_user_id: targetId, action: event, details
        });
      };

      const makeRecoveryLink = async (targetId: string) => {
        const { data: target, error } = await supabaseAdmin.from("profiles")
          .select("id,role,full_name").eq("id", targetId).single();
        if (error || !target || !["student", "teacher"].includes(target.role)) {
          return { user_id: targetId, ok: false, error: "Student/teacher account not found" };
        }
        if (!isAdmin && (target.role !== "student" || !await isStudentInManagedClass(targetId))) {
          return { user_id: targetId, ok: false, error: "Teachers can reset only students in their own class" };
        }
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(targetId);
        if (authError || !authUser.user?.email) {
          return { user_id: targetId, ok: false, error: "Student email unavailable" };
        }
        const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
          authUser.user.email, { redirectTo: APP_REDIRECT_URL }
        );
        if (resetError) {
          return { user_id: targetId, email: authUser.user.email, ok: false, error: resetError.message };
        }
        await audit(targetId, "account.password_recovery_email_sent", { class_id: classId || null });
        return {
          user_id: targetId, full_name: target.full_name, email: authUser.user.email,
          ok: true, email_sent: true
        };
      };

      if (action === "list_users") {
        if (!isAdmin) return json({ error: "Administrator required" }, 403);
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
        if (authError) return json({ error: authError.message }, 500);
        const authUsers = authData?.users ?? [];
        const ids = authUsers.map((u: { id: string }) => u.id);
        const { data: profiles, error: profileError } = ids.length
          ? await supabaseAdmin.from("profiles").select("id,role,full_name,student_no,created_at,account_status,must_change_password").in("id", ids)
          : { data: [], error: null };
        if (profileError) return json({ error: profileError.message }, 500);
        const profileMap = new Map((profiles ?? []).map((p: Record<string, unknown>) => [String(p.id), p]));
        return json({
          users: authUsers.map((u: Record<string, any>) => {
            const p = profileMap.get(String(u.id)) ?? {};
            return {
              id: u.id, email: u.email ?? "", full_name: p.full_name ?? u.user_metadata?.full_name ?? "",
              student_no: p.student_no ?? u.user_metadata?.student_no ?? "",
              role: p.role ?? "student", created_at: p.created_at ?? u.created_at,
              account_status: p.account_status ?? "active",
              must_change_password: !!p.must_change_password,
              email_confirmed: !!u.email_confirmed_at
            };
          })
        });
      }

      if (action === "set_account_status") {
        if (!isAdmin) return json({ error: "Administrator required" }, 403);
        const targetId = String(body.user_id ?? "");
        const status = String(body.account_status ?? "");
        if (!targetId || !["active", "disabled"].includes(status)) {
          return json({ error: "Valid user_id and account_status are required" }, 400);
        }
        if (targetId === actorId) return json({ error: "You cannot disable your own administrator account" }, 409);
        const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(targetId);
        if (targetError || !target.user) return json({ error: "Account not found" }, 404);
        const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
          ban_duration: status === "disabled" ? "876000h" : "none"
        });
        if (authUpdateError) return json({ error: authUpdateError.message }, 500);
        const { error: profileError } = await supabaseAdmin.from("profiles")
          .update({ account_status: status }).eq("id", targetId);
        if (profileError) return json({ error: profileError.message }, 500);
        await audit(targetId, status === "disabled" ? "account.disabled" : "account.enabled");
        return json({ ok: true, user_id: targetId, account_status: status });
      }

      if (action === "set_user_role") {
        if (!isAdmin) return json({ error: "Administrator required" }, 403);
        const targetId = String(body.user_id ?? "");
        const role = String(body.role ?? "");
        if (!targetId || !["student", "teacher", "admin"].includes(role)) {
          return json({ error: "Valid user_id and role are required" }, 400);
        }
        if (targetId === actorId && role !== "admin") {
          return json({ error: "You cannot remove your own administrator role" }, 409);
        }
        const { data: authTarget, error: authLookupError } = await supabaseAdmin.auth.admin.getUserById(targetId);
        if (authLookupError || !authTarget.user) return json({ error: "Account not found" }, 404);
        const nextMetadata = { ...(authTarget.user.app_metadata ?? {}), role };
        const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(targetId, { app_metadata: nextMetadata });
        if (authUpdateError) return json({ error: authUpdateError.message }, 500);
        const { error: profileUpdateError } = await supabaseAdmin.from("profiles").update({ role }).eq("id", targetId);
        if (profileUpdateError) return json({ error: "Auth role updated but profile role failed: " + profileUpdateError.message }, 500);
        await audit(targetId, "account.role_changed", { role });
        return json({ ok: true, user_id: targetId, role });
      }

      if (action === "admin_invite_account") {
        if (!isAdmin) return json({ error: "Administrator required" }, 403);
        const email = String(body.email ?? "").trim().toLowerCase();
        const full_name = String(body.full_name ?? "").trim();
        const student_no = String(body.student_no ?? "").trim();
        const role = String(body.role ?? "student");
        if (!email || !full_name || !["student", "teacher"].includes(role)) {
          return json({ error: "Email, name and student/teacher role are required" }, 400);
        }
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: { full_name, student_no }, redirectTo: APP_REDIRECT_URL
        });
        if (inviteError || !inviteData.user) return json({ error: inviteError?.message ?? "Invite failed" }, 400);
        const { error: profileUpdateError } = await supabaseAdmin.from("profiles")
          .update({ role, full_name, student_no, account_status: "active" }).eq("id", inviteData.user.id);
        if (profileUpdateError) return json({ error: profileUpdateError.message }, 500);
        const { data: authTarget } = await supabaseAdmin.auth.admin.getUserById(inviteData.user.id);
        await supabaseAdmin.auth.admin.updateUserById(inviteData.user.id, {
          app_metadata: { ...(authTarget.user?.app_metadata ?? {}), role }
        });
        await audit(inviteData.user.id, "account.invited_by_admin", { role, email });
        return json({ ok: true, user_id: inviteData.user.id, email, role });
      }

      if (action === "mark_password_change_required" || action === "complete_password_change") {
        const mustChange = action === "mark_password_change_required";
        // The authenticated PASSWORD_RECOVERY session proves mailbox control. Never set a shared
        // temporary password here: the user chooses a private password directly in the recovery session.
        const { error: updateError } = await supabaseAdmin.from("profiles")
          .update({ must_change_password: mustChange }).eq("id", actorId);
        if (updateError) return json({ error: updateError.message }, 500);
        await audit(actorId, mustChange ? "account.password_recovery_verified" : "account.personal_password_set");
        return json({ ok: true, must_change_password: mustChange });
      }

      if (action === "export_assignment_reports") {
        if (actor.role !== "teacher" && !isAdmin) return json({ error: "Teacher or administrator required" }, 403);
        if (!await canManageClass()) return json({ error: "You do not manage this class" }, 403);
        const assignmentId = String(body.assignment_id ?? "");
        if (!assignmentId) return json({ error: "assignment_id required" }, 400);
        const { data: assignment, error: assignmentError } = await supabaseAdmin.from("experiment_assignments")
          .select("id,class_id,title,experiment_id,due_at,created_at").eq("id", assignmentId).eq("class_id", classId).maybeSingle();
        if (assignmentError || !assignment) return json({ error: "Assignment not found in this class" }, 404);
        const { data: cls } = await supabaseAdmin.from("classes").select("name").eq("id", classId).maybeSingle();
        const { data: catalog } = await supabaseAdmin.from("experiment_catalog").select("name,slug").eq("id", assignment.experiment_id).maybeSingle();
        const { data: reports, error: reportError } = await supabaseAdmin.from("report_submissions")
          .select("id,student_id,experiment_slug,file_name,storage_path,status,score,feedback,created_at,submitted_at,submission_version")
          .eq("class_id", classId).eq("assignment_id", assignmentId)
          .order("created_at", { ascending: true }).limit(1000);
        if (reportError) return json({ error: reportError.message }, 500);
        const ids = [...new Set((reports ?? []).map((r: { student_id: string }) => r.student_id))];
        const { data: students, error: studentsError } = ids.length
          ? await supabaseAdmin.from("profiles").select("id,full_name,student_no").in("id", ids)
          : { data: [], error: null };
        if (studentsError) return json({ error: studentsError.message }, 500);
        const studentMap = new Map((students ?? []).map((s: Record<string, unknown>) => [String(s.id), s]));
        const rows = [];
        for (const report of reports ?? []) {
          const student = studentMap.get(report.student_id) ?? {};
          let signedUrl: string | null = null;
          if (report.storage_path) {
            const { data: signed, error: signedError } = await supabaseAdmin.storage.from("lab-reports")
              .createSignedUrl(report.storage_path, 900);
            if (!signedError) signedUrl = signed?.signedUrl ?? null;
          }
          rows.push({
            report_id: report.id, student_id: report.student_id,
            student_name: student.full_name ?? "未填写姓名", student_no: student.student_no ?? "",
            experiment_name: catalog?.name ?? report.experiment_slug,
            file_name: report.file_name ?? "", status: report.status,
            score: report.score, feedback: report.feedback ?? "",
            created_at: report.created_at, submitted_at: report.submitted_at,
            submission_version: report.submission_version ?? 1, signed_url: signedUrl
          });
        }
        const { data: members, error: membersError } = await supabaseAdmin.from("class_members")
          .select("student_id").eq("class_id", classId).eq("status", "active");
        if (membersError) return json({ error: membersError.message }, 500);
        const ownerIds = [...new Set([...(members ?? []).map((m: { student_id: string }) => m.student_id),
          ...(reports ?? []).map((r: { student_id: string }) => r.student_id)])];
        const submittedIds = new Set(rows.map((r: { student_id: string }) => r.student_id));
        const missingIds = (members ?? []).map((m: { student_id: string }) => m.student_id).filter((id: string) => !submittedIds.has(id));
        const { data: missingStudents, error: missingStudentsError } = missingIds.length
          ? await supabaseAdmin.from("profiles").select("id,full_name,student_no").in("id", missingIds)
          : { data: [], error: null };
        if (missingStudentsError) return json({ error: missingStudentsError.message }, 500);
        for (const student of missingStudents ?? []) rows.push({
          report_id: null, student_id: student.id, student_name: student.full_name ?? "未填写姓名",
          student_no: student.student_no ?? "", experiment_name: catalog?.name ?? "",
          file_name: "", status: "missing", score: null, feedback: "",
          created_at: null, submitted_at: null, submission_version: null, signed_url: null
        });
        const { data: recordStudents, error: recordStudentsError } = ownerIds.length
          ? await supabaseAdmin.from("profiles").select("id,full_name,student_no").in("id", ownerIds)
          : { data: [], error: null };
        if (recordStudentsError) return json({ error: recordStudentsError.message }, 500);
        const recordStudentMap = new Map((recordStudents ?? []).map((s: Record<string, unknown>) => [String(s.id), s]));
        // Only records explicitly linked to this assignment are exported; no fuzzy time-window matching.
        const { data: records, error: recordsError } = ownerIds.length && catalog?.slug
          ? await supabaseAdmin.from("experiment_records")
              .select("id,owner_id,experiment_slug,title,raw_data,analysis,engine_version,created_at,assignment_id")
              .in("owner_id", ownerIds).eq("experiment_slug", catalog.slug).eq("assignment_id", assignmentId)
              .order("created_at", { ascending: true }).limit(2000)
          : { data: [], error: null };
        if (recordsError) return json({ error: recordsError.message }, 500);
        const recordRows = (records ?? []).map((record: Record<string, any>) => {
          const student = recordStudentMap.get(String(record.owner_id)) ?? {};
          return {
            record_id: record.id, student_id: record.owner_id,
            student_name: student.full_name ?? "未填写姓名", student_no: student.student_no ?? "",
            experiment_name: catalog?.name ?? record.experiment_slug, title: record.title ?? "",
            created_at: record.created_at, engine_version: record.engine_version ?? "",
            raw_data: record.raw_data ?? {}, analysis: record.analysis ?? {}
          };
        });
        await audit(null, "class.assignment_reports_exported", { class_id: classId, assignment_id: assignmentId, report_count: rows.length, analysis_record_count: recordRows.length });
        return json({ ok: true, class_name: cls?.name ?? "教学班", assignment_title: assignment.title,
          experiment_name: catalog?.name ?? "", rows, records: recordRows,
          record_scope_note: "仅导出明确绑定本次 assignment_id 的数据分析记录；未关联任务的历史记录不会被猜测归入。" });
      }

      if (action === "delete_class") {
        if (actor.role !== "teacher" && !isAdmin) return json({ error: "Teacher or administrator required" }, 403);
        if (!await canManageClass()) return json({ error: "You do not manage this class" }, 403);
        const { data: reportRows, error: reportError } = await supabaseAdmin
          .from("report_submissions").select("id").eq("class_id", classId).limit(1);
        if (reportError) return json({ error: reportError.message }, 500);
        if (reportRows?.length) return json({ error: "该班级已有报告记录。为保护报告、成绩和审计关联，请先停用/归档，不能永久删除。" }, 409);
        await audit(null, "class.permanently_deleted", { class_id: classId });
        const { error: assignmentError } = await supabaseAdmin.from("experiment_assignments").delete().eq("class_id", classId);
        if (assignmentError) return json({ error: assignmentError.message }, 500);
        const { error: memberError } = await supabaseAdmin.from("class_members").delete().eq("class_id", classId);
        if (memberError) return json({ error: memberError.message }, 500);
        const { error: classError } = await supabaseAdmin.from("classes").delete().eq("id", classId);
        if (classError) return json({ error: classError.message }, 500);
        return json({ ok: true, class_id: classId });
      }

      if (action === "join_class") {
        if (actor.role !== "student") return json({ error: "Only student accounts can join a class" }, 403);
        const joinCode = String(body.join_code ?? "").trim().toUpperCase();
        if (!joinCode) return json({ error: "Join code required" }, 400);
        const { data: cls, error: classError } = await supabaseAdmin.from("classes")
          .select("id").eq("join_code", joinCode).eq("is_active", true).maybeSingle();
        if (classError || !cls) return json({ error: "Invalid or inactive class code" }, 404);
        const { error: memberError } = await supabaseAdmin.from("class_members")
          .upsert({ class_id: cls.id, student_id: actorId, status: "active" });
        if (memberError) return json({ error: memberError.message }, 400);
        await audit(actorId, "class.joined", { class_id: cls.id });
        return json({ ok: true, class_id: cls.id });
      }

      if (action === "invite_students") {
        if (!await canManageClass()) return json({ error: "You do not manage this class" }, 403);
        const rows = Array.isArray(body.students) ? body.students.slice(0, 200) as StudentInput[] : [];
        if (!rows.length) return json({ error: "No students supplied" }, 400);
        const results = [];
        for (const item of rows) {
          const email = String(item.email ?? "").trim().toLowerCase();
          const full_name = String(item.full_name ?? "").trim();
          const student_no = String(item.student_no ?? "").trim();
          if (!email || !full_name) {
            results.push({ email, ok: false, error: "Email and name are required" });
            continue;
          }
          const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { full_name, student_no }
          });
          if (error || !data.user) {
            results.push({ email, ok: false, error: error?.message ?? "Invite failed" });
            continue;
          }
          const { error: memberError } = await supabaseAdmin.from("class_members")
            .upsert({ class_id: classId, student_id: data.user.id, status: "active" });
          if (memberError) {
            results.push({ email, ok: false, error: memberError.message });
            continue;
          }
          await audit(data.user.id, "class.student_invited", { class_id: classId, student_no });
          results.push({ email, ok: true, user_id: data.user.id });
        }
        return json({ results });
      }

      if (action === "reset_password" || action === "reset_passwords") {
        if (!isAdmin && actor.role !== "teacher") return json({ error: "Teacher or administrator required" }, 403);
        if (action === "reset_password") {
          const targetId = String(body.user_id ?? "");
          if (!targetId) return json({ error: "Student user_id required" }, 400);
          return json(await makeRecoveryLink(targetId));
        }
        const ids = Array.isArray(body.user_ids) ? [...new Set(body.user_ids.map(String))].slice(0, 100) : [];
        if (!ids.length) return json({ error: "No user IDs supplied" }, 400);
        if (!isAdmin && !await canManageClass()) return json({ error: "You do not manage this class" }, 403);
        const results = [];
        for (const id of ids) results.push(await makeRecoveryLink(id));
        return json({ results });
      }

      if (action === "remove_students_from_class") {
        if (actor.role !== "teacher" && !isAdmin) return json({ error: "Teacher or administrator required" }, 403);
        if (!await canManageClass()) return json({ error: "You do not manage this class" }, 403);
        const ids = Array.isArray(body.user_ids) ? [...new Set(body.user_ids.map(String))].slice(0, 200) : [];
        if (!ids.length) return json({ error: "No user IDs supplied" }, 400);
        const results = [];
        for (const id of ids) {
          const { data: target } = await supabaseAdmin.from("profiles").select("id,role").eq("id", id).maybeSingle();
          if (!target || target.role !== "student") {
            results.push({ user_id: id, ok: false, error: "Only student memberships can be removed" });
            continue;
          }
          const { data: member } = await supabaseAdmin.from("class_members").select("student_id")
            .eq("class_id", classId).eq("student_id", id).eq("status", "active").maybeSingle();
          if (!member) {
            results.push({ user_id: id, ok: false, error: "Student is not an active member of this class" });
            continue;
          }
          const { error } = await supabaseAdmin.from("class_members")
            .update({ status: "removed" }).eq("class_id", classId).eq("student_id", id);
          if (error) results.push({ user_id: id, ok: false, error: error.message });
          else {
            await audit(id, "class.student_removed", { class_id: classId });
            results.push({ user_id: id, ok: true });
          }
        }
        return json({ results });
      }

      if (action === "delete_report") {
        const reportId = String(body.report_id ?? "");
        if (!reportId) return json({ error: "report_id required" }, 400);
        const { data: report, error: reportError } = await supabaseAdmin.from("report_submissions")
          .select("id,student_id,class_id,status,storage_path,file_name").eq("id", reportId).maybeSingle();
        if (reportError || !report) return json({ error: "Report not found" }, 404);
        const ownerCanDelete = report.student_id === actorId && ["draft","returned","withdrawn"].includes(report.status);
        const staffCanDelete = isAdmin || (actor.role === "teacher" && !!report.class_id && await (async () => {
          const { data } = await supabaseAdmin.from("classes").select("id").eq("id", report.class_id).eq("teacher_id", actorId).maybeSingle();
          return !!data;
        })());
        if (!ownerCanDelete && !staffCanDelete) return json({ error: "You are not allowed to delete this report in its current state" }, 403);
        const { data: revisions, error: revisionError } = await supabaseAdmin.from("report_revisions")
          .select("previous_storage_path").eq("report_id", reportId);
        if (revisionError) return json({ error: revisionError.message }, 500);
        const paths = [...new Set([report.storage_path, ...(revisions ?? []).map((r: { previous_storage_path: string }) => r.previous_storage_path)].filter(Boolean))];
        const { error: deleteError } = await supabaseAdmin.from("report_submissions").delete().eq("id", reportId);
        if (deleteError) return json({ error: deleteError.message }, 500);
        if (paths.length) {
          const { error: storageError } = await supabaseAdmin.storage.from("lab-reports").remove(paths);
          if (storageError) {
            await audit(report.student_id, "report.deleted_storage_cleanup_failed", { report_id: reportId, file_count: paths.length, error: storageError.message });
            return json({ ok: true, report_id: reportId, removed_files: 0, cleanup_warning: storageError.message });
          }
        }
        await audit(report.student_id, "report.deleted", { report_id: reportId, version_file_count: paths.length });
        return json({ ok: true, report_id: reportId, removed_files: paths.length });
      }

      if (action === "delete_students") {
        const ids = Array.isArray(body.user_ids) ? [...new Set(body.user_ids.map(String))].slice(0, 100) : [];
        if (!ids.length) return json({ error: "No user IDs supplied" }, 400);
        if (!isAdmin && (actor.role !== "teacher" || !await canManageClass())) {
          return json({ error: "Teacher access to the selected class is required" }, 403);
        }
        const results = [];
        for (const id of ids) {
          if (id === actorId) { results.push({ user_id: id, ok: false, error: "Cannot delete your own account" }); continue; }
          if (!isAdmin) {
            if (!await isStudentInManagedClass(id)) {
              results.push({ user_id: id, ok: false, error: "Student is not an active member of your class" });
              continue;
            }
            const { data: memberships, error: membershipError } = await supabaseAdmin.from("class_members")
              .select("class_id").eq("student_id", id).eq("status", "active");
            if (membershipError) { results.push({ user_id: id, ok: false, error: membershipError.message }); continue; }
            if ((memberships ?? []).length > 1) {
              const { error } = await supabaseAdmin.from("class_members").update({ status: "removed" })
                .eq("class_id", classId).eq("student_id", id);
              if (error) results.push({ user_id: id, ok: false, error: error.message });
              else {
                await audit(id, "class.student_removed_by_teacher", { class_id: classId, reason: "student_has_other_active_classes" });
                results.push({ user_id: id, ok: true, operation: "removed_from_this_class" });
              }
              continue;
            }
          }
          const { data: target } = await supabaseAdmin.from("profiles").select("id,role").eq("id", id).maybeSingle();
          if (!target || target.role !== "student") { results.push({ user_id: id, ok: false, error: "Only student accounts can be deleted in this operation" }); continue; }
          const { data: reports, error: reportError } = await supabaseAdmin.from("report_submissions")
            .select("id,storage_path").eq("student_id", id);
          if (reportError) { results.push({ user_id: id, ok: false, error: reportError.message }); continue; }
          const reportIds = (reports ?? []).map((r: { id: string }) => r.id);
          const { data: revisions, error: revisionError } = reportIds.length
            ? await supabaseAdmin.from("report_revisions").select("previous_storage_path").in("report_id", reportIds)
            : { data: [], error: null };
          if (revisionError) { results.push({ user_id: id, ok: false, error: revisionError.message }); continue; }
          const paths = [...new Set([
            ...(reports ?? []).map((r: { storage_path: string }) => r.storage_path),
            ...(revisions ?? []).map((r: { previous_storage_path: string }) => r.previous_storage_path)
          ].filter(Boolean))];
          await audit(id, "account.student_permanent_delete_requested", {
            report_count: reports?.length ?? 0, archived_file_count: paths.length,
            scope: isAdmin ? "administrator_global" : "teacher_single_active_class"
          });
          const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
          if (error) { results.push({ user_id: id, ok: false, error: error.message }); continue; }
          const { error: storageError } = paths.length
            ? await supabaseAdmin.storage.from("lab-reports").remove(paths)
            : { error: null };
          if (storageError) results.push({ user_id: id, ok: true, operation: "permanently_deleted", cleanup_warning: storageError.message });
          else results.push({ user_id: id, ok: true, operation: "permanently_deleted" });
        }
        return json({ results });
      }

      return json({ error: "Unsupported action" }, 400);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
    }
  })
};
