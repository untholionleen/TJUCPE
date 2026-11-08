import { withSupabase } from "npm:@supabase/server";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

type StudentInput = { email?: string; full_name?: string; student_no?: string };

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
        if (error || !target || target.role !== "student") {
          return { user_id: targetId, ok: false, error: "Student account not found" };
        }
        if (!isAdmin && !await isStudentInManagedClass(targetId)) {
          return { user_id: targetId, ok: false, error: "Student is not in your managed class" };
        }
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(targetId);
        if (authError || !authUser.user?.email) {
          return { user_id: targetId, ok: false, error: "Student email unavailable" };
        }
        const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery", email: authUser.user.email
        });
        if (linkError || !link.properties?.action_link) {
          return { user_id: targetId, ok: false, error: linkError?.message ?? "Recovery link unavailable" };
        }
        await audit(targetId, "account.password_recovery_link_generated", { class_id: classId || null });
        return {
          user_id: targetId, full_name: target.full_name, email: authUser.user.email,
          ok: true, action_link: link.properties.action_link
        };
      };

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
