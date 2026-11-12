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

        // profiles.role is the canonical role source for this platform. Keep Auth app_metadata
        // aligned as well, so new JWTs and any other server integrations receive the same role.
        // A metadata sync failure is reported but never hides the account list or changes profiles.
        const roleMetadataSyncWarnings: { user_id: string; error: string }[] = [];
        for (const authUser of authUsers) {
          const profile = profileMap.get(String(authUser.id)) as Record<string, unknown> | undefined;
          if (!profile || !["student", "teacher", "admin"].includes(String(profile.role ?? ""))) continue;
          const role = String(profile.role);
          if (String(authUser.app_metadata?.role ?? "") === role) continue;
          const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
            app_metadata: { ...(authUser.app_metadata ?? {}), role }
          });
          if (metadataError) roleMetadataSyncWarnings.push({ user_id: authUser.id, error: metadataError.message });
          else authUser.app_metadata = { ...(authUser.app_metadata ?? {}), role };
        }

        return json({
          users: authUsers.map((u: Record<string, any>) => {
            const p = profileMap.get(String(u.id)) ?? {};
            return {
              id: u.id, email: u.email ?? "", full_name: p.full_name ?? u.user_metadata?.full_name ?? "",
              student_no: p.student_no ?? u.user_metadata?.student_no ?? "",
              role: p.role ?? "student", created_at: p.created_at ?? u.created_at,
              account_status: p.account_status ?? "active",
              must_change_password: !!p.must_change_password,
              email_confirmed: !!u.email_confirmed_at,
              app_metadata_role: u.app_metadata?.role ?? null
            };
          }),
          role_metadata_sync_warnings: roleMetadataSyncWarnings
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
        const { data: targetProfile, error: targetProfileError } = await supabaseAdmin.from("profiles")
          .select("role,account_status").eq("id",targetId).single();
        if(targetProfileError||!targetProfile)return json({error:"Account profile not found"},404);
        if(status==="disabled"&&targetProfile.role==="admin"&&targetProfile.account_status!=="disabled"){
          const {count,error:adminCountError}=await supabaseAdmin.from("profiles").select("id",{count:"exact",head:true})
            .eq("role","admin").eq("account_status","active");
          if(adminCountError)return json({error:adminCountError.message},500);
          if((count??0)<=1)return json({error:"不能停用最后一个有效管理员账号。请先任命另一名管理员。"},409);
        }

        // Keep the canonical profile status and Supabase Auth ban state consistent.
        // If Auth rejects the ban/unban call, roll back the database status.
        const { error: profileError } = await supabaseAdmin.from("profiles")
          .update({ account_status: status }).eq("id", targetId);
        if (profileError) return json({ error: profileError.message }, 500);
        const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
          ban_duration: status === "disabled" ? "876000h" : "none"
        });
        if (authUpdateError) {
          const { error: rollbackError } = await supabaseAdmin.from("profiles")
            .update({ account_status: targetProfile.account_status }).eq("id", targetId);
          return json({
            error: "Auth account status update failed; profile rollback " + (rollbackError ? "also failed: " + rollbackError.message : "succeeded") + ": " + authUpdateError.message
          }, 500);
        }
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
        const { data: targetProfile, error: targetProfileError } = await supabaseAdmin.from("profiles")
          .select("role,account_status").eq("id",targetId).single();
        if(targetProfileError||!targetProfile)return json({error:"Account profile not found"},404);
        if(targetProfile.role==="admin"&&role!=="admin"&&targetProfile.account_status==="active"){
          const {count,error:adminCountError}=await supabaseAdmin.from("profiles").select("id",{count:"exact",head:true})
            .eq("role","admin").eq("account_status","active");
          if(adminCountError)return json({error:adminCountError.message},500);
          if((count??0)<=1)return json({error:"不能降级最后一个有效管理员。请先任命另一名管理员。"},409);
        }

        // Change the canonical database role first. If Auth metadata cannot be updated,
        // roll the profile back so the two role sources cannot silently diverge.
        const { error: profileUpdateError } = await supabaseAdmin.from("profiles").update({ role }).eq("id", targetId);
        if (profileUpdateError) return json({ error: profileUpdateError.message }, 500);
        const nextMetadata = { ...(authTarget.user.app_metadata ?? {}), role };
        const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(targetId, { app_metadata: nextMetadata });
        if (authUpdateError) {
          const { error: rollbackError } = await supabaseAdmin.from("profiles").update({ role: targetProfile.role }).eq("id", targetId);
          return json({
            error: "Auth role update failed; profile role rollback " + (rollbackError ? "also failed: " + rollbackError.message : "succeeded") + ": " + authUpdateError.message
          }, 500);
        }
        await audit(targetId, "account.role_changed", { previous_role: targetProfile.role, role });
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
        if (profileUpdateError) {
          await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id);
          return json({ error: "账号档案写入失败，系统已回滚刚创建的账号：" + profileUpdateError.message }, 500);
        }
        const { data: authTarget, error: authTargetError } = await supabaseAdmin.auth.admin.getUserById(inviteData.user.id);
        if(authTargetError||!authTarget.user){
          await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id);
          return json({error:"读取新账号失败，系统已回滚刚创建的账号。"},500);
        }
        const {error:metadataError}=await supabaseAdmin.auth.admin.updateUserById(inviteData.user.id, {
          app_metadata: { ...(authTarget.user.app_metadata ?? {}), role }
        });
        if(metadataError){
          await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id);
          return json({error:"账号角色写入失败，系统已回滚刚创建的账号："+metadataError.message},500);
        }
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

        // Fetch the assignment and class label together; they are independent reads.
        const [assignmentResult, classResult] = await Promise.all([
          supabaseAdmin.from("experiment_assignments")
            .select("id,class_id,title,experiment_id,due_at,created_at")
            .eq("id", assignmentId).eq("class_id", classId).maybeSingle(),
          supabaseAdmin.from("classes").select("name").eq("id", classId).maybeSingle()
        ]);
        const { data: assignment, error: assignmentError } = assignmentResult;
        if (assignmentError || !assignment) return json({ error: "Assignment not found in this class" }, 404);
        const cls = classResult.data;

        // Catalog, submissions and roster are independent after the assignment is verified.
        const [catalogResult, reportResult, memberResult] = await Promise.all([
          supabaseAdmin.from("experiment_catalog").select("name,slug").eq("id", assignment.experiment_id).maybeSingle(),
          supabaseAdmin.from("report_submissions")
            .select("id,student_id,experiment_slug,file_name,storage_path,status,score,feedback,created_at,submitted_at,submission_version")
            .eq("class_id", classId).eq("assignment_id", assignmentId)
            .order("created_at", { ascending: true }).limit(1000),
          supabaseAdmin.from("class_members").select("student_id").eq("class_id", classId).eq("status", "active")
        ]);
        const catalog = catalogResult.data;
        if (reportResult.error) return json({ error: reportResult.error.message }, 500);
        if (memberResult.error) return json({ error: memberResult.error.message }, 500);
        const reports = reportResult.data ?? [];
        const members = memberResult.data ?? [];

        const ownerIds = [...new Set([
          ...members.map((m: { student_id: string }) => m.student_id),
          ...reports.map((r: { student_id: string }) => r.student_id)
        ])];
        const reportPaths = [...new Set(reports.map((r: { storage_path: string }) => r.storage_path).filter(Boolean))];
        const signedChunks: string[][] = [];
        for (let offset = 0; offset < reportPaths.length; offset += 100) {
          signedChunks.push(reportPaths.slice(offset, offset + 100));
        }

        // One profile lookup serves report rows, missing-submission rows and analysis records.
        // Independent data and signed-URL work is performed concurrently to reduce Edge latency.
        const [peopleResult, recordsResult, signedResults] = await Promise.all([
          ownerIds.length
            ? supabaseAdmin.from("profiles").select("id,full_name,student_no").in("id", ownerIds)
            : Promise.resolve({ data: [], error: null }),
          ownerIds.length && catalog?.slug
            ? supabaseAdmin.from("experiment_records")
                .select("id,owner_id,experiment_slug,title,raw_data,analysis,engine_version,created_at,assignment_id")
                .in("owner_id", ownerIds).eq("experiment_slug", catalog.slug).eq("assignment_id", assignmentId)
                .order("created_at", { ascending: true }).limit(2000)
            : Promise.resolve({ data: [], error: null }),
          Promise.all(signedChunks.map(chunk => supabaseAdmin.storage.from("lab-reports").createSignedUrls(chunk, 900)))
        ]);
        if (peopleResult.error) return json({ error: peopleResult.error.message }, 500);
        if (recordsResult.error) return json({ error: recordsResult.error.message }, 500);
        const peopleMap = new Map((peopleResult.data ?? []).map((s: Record<string, unknown>) => [String(s.id), s]));
        const signedUrlMap = new Map<string, string>();
        for (const batch of signedResults) {
          if (batch.error) return json({ error: "Report download links could not be prepared: " + batch.error.message }, 500);
          for (const item of batch.data ?? []) {
            if (item.path && item.signedUrl && !item.error) signedUrlMap.set(item.path, item.signedUrl);
          }
        }

        const rows = reports.map((report: Record<string, any>) => {
          const student = peopleMap.get(String(report.student_id)) ?? {};
          return {
            report_id: report.id, student_id: report.student_id,
            student_name: student.full_name ?? "未填写姓名", student_no: student.student_no ?? "",
            experiment_name: catalog?.name ?? report.experiment_slug,
            file_name: report.file_name ?? "", status: report.status,
            score: report.score, feedback: report.feedback ?? "",
            created_at: report.created_at, submitted_at: report.submitted_at,
            submission_version: report.submission_version ?? 1,
            signed_url: report.storage_path ? signedUrlMap.get(report.storage_path) ?? null : null
          };
        });
        const submittedIds = new Set(rows.map((r: { student_id: string }) => r.student_id));
        for (const member of members) {
          if (submittedIds.has(member.student_id)) continue;
          const student = peopleMap.get(String(member.student_id)) ?? {};
          rows.push({
            report_id: null, student_id: member.student_id,
            student_name: student.full_name ?? "未填写姓名", student_no: student.student_no ?? "",
            experiment_name: catalog?.name ?? "", file_name: "", status: "missing",
            score: null, feedback: "", created_at: null, submitted_at: null,
            submission_version: null, signed_url: null
          });
        }

        const recordRows = (recordsResult.data ?? []).map((record: Record<string, any>) => {
          const student = peopleMap.get(String(record.owner_id)) ?? {};
          return {
            record_id: record.id, student_id: record.owner_id,
            student_name: student.full_name ?? "未填写姓名", student_no: student.student_no ?? "",
            experiment_name: catalog?.name ?? record.experiment_slug, experiment_slug: record.experiment_slug,
            title: record.title ?? "", created_at: record.created_at, engine_version: record.engine_version ?? "",
            raw_data: record.raw_data ?? {}, analysis: record.analysis ?? {}
          };
        });
        await audit(null, "class.assignment_reports_exported", {
          class_id: classId, assignment_id: assignmentId,
          report_count: rows.length, analysis_record_count: recordRows.length
        });
        return json({
          ok: true, class_name: cls?.name ?? "教学班", assignment_title: assignment.title,
          experiment_name: catalog?.name ?? "", rows, records: recordRows,
          record_scope_note: "仅导出明确绑定本次 assignment_id 的数据处理记录；未关联任务的历史记录不会按时间猜测归档。"
        });
      }

      const getClassCounts = async (targetClassId: string) => {
        const [members, assignments, reports, references] = await Promise.all([
          supabaseAdmin.from("class_members").select("student_id", { count: "exact", head: true }).eq("class_id", targetClassId),
          supabaseAdmin.from("experiment_assignments").select("id", { count: "exact", head: true }).eq("class_id", targetClassId),
          supabaseAdmin.from("report_submissions").select("id", { count: "exact", head: true }).eq("class_id", targetClassId),
          supabaseAdmin.from("experiment_reference_sets").select("id", { count: "exact", head: true }).eq("class_id", targetClassId)
        ]);
        const failure = [members, assignments, reports, references].find((item: any) => item.error);
        if (failure?.error) throw new Error("班级数据计数读取失败：" + failure.error.message);
        return {
          member_count: members.count ?? 0,
          assignment_count: assignments.count ?? 0,
          report_count: reports.count ?? 0,
          reference_set_count: references.count ?? 0
        };
      };

      if (action === "admin_list_classes") {
        if (!isAdmin) return json({ error: "Administrator required" }, 403);
        const [classResult, teacherResult, syncResult] = await Promise.all([
          supabaseAdmin.from("classes")
            .select("id,name,course_code,description,teacher_id,join_code,is_active,created_at,updated_at")
            .order("created_at", { ascending: false }).limit(500),
          supabaseAdmin.from("profiles")
            .select("id,full_name,student_no,role,account_status")
            .in("role", ["teacher", "admin"]).order("full_name").limit(500),
          supabaseAdmin.from("audit_logs")
            .select("details,created_at").eq("action", "admin.class_data_sync_checked")
            .order("created_at", { ascending: false }).limit(1000)
        ]);
        if (classResult.error) return json({ error: "班级目录读取失败：" + classResult.error.message }, 500);
        if (teacherResult.error) return json({ error: "班级负责人目录读取失败：" + teacherResult.error.message }, 500);
        if (syncResult.error) return json({ error: "同步记录读取失败：" + syncResult.error.message }, 500);
        const syncMap = new Map<string, string>();
        for (const row of syncResult.data ?? []) {
          const targetId = String((row.details as Record<string, unknown> | null)?.class_id ?? "");
          if (targetId && !syncMap.has(targetId)) syncMap.set(targetId, row.created_at);
        }
        const classes = await Promise.all((classResult.data ?? []).map(async (cls: Record<string, any>) => {
          const teacher = (teacherResult.data ?? []).find((p: Record<string, any>) => p.id === cls.teacher_id);
          return {
            ...cls,
            teacher_name: teacher?.full_name ?? "未设置",
            teacher_role: teacher?.role ?? "",
            counts: await getClassCounts(String(cls.id)),
            last_sync_at: syncMap.get(String(cls.id)) ?? null
          };
        }));
        const totals = classes.reduce((acc: Record<string, number>, cls: Record<string, any>) => {
          acc.class_count += 1;
          acc.active_class_count += cls.is_active ? 1 : 0;
          acc.member_count += cls.counts.member_count;
          acc.assignment_count += cls.counts.assignment_count;
          acc.report_count += cls.counts.report_count;
          acc.reference_set_count += cls.counts.reference_set_count;
          return acc;
        }, { class_count: 0, active_class_count: 0, member_count: 0, assignment_count: 0, report_count: 0, reference_set_count: 0 });
        return json({ ok: true, classes, teachers: teacherResult.data ?? [], totals });
      }

      if (action === "admin_class_data_sync") {
        if (!isAdmin) return json({ error: "Administrator required" }, 403);
        const requestedClassId = String(body.class_id ?? "").trim();
        const classQuery = supabaseAdmin.from("classes")
          .select("id,name,course_code,teacher_id,is_active")
          .order("created_at", { ascending: false }).limit(500);
        const { data: classRows, error: classesError } = requestedClassId
          ? await classQuery.eq("id", requestedClassId)
          : await classQuery;
        if (classesError) return json({ error: "同步核验读取班级失败：" + classesError.message }, 500);
        if (requestedClassId && !(classRows ?? []).length) return json({ error: "Class not found" }, 404);
        const checks = [];
        for (const cls of classRows ?? []) {
          try {
            const counts = await getClassCounts(String(cls.id));
            const checkedAt = new Date().toISOString();
            const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
              actor_id: actorId,
              target_user_id: null,
              action: "admin.class_data_sync_checked",
              details: {
                class_id: cls.id, class_name: cls.name, counts,
                source: "supabase_primary_database",
                check_type: "live_count_reconciliation",
                checked_at: checkedAt
              }
            });
            if (auditError) throw new Error("同步检查记录保存失败：" + auditError.message);
            checks.push({ class_id: cls.id, class_name: cls.name, counts, checked_at: checkedAt, ok: true });
          } catch (error) {
            checks.push({
              class_id: cls.id, class_name: cls.name, ok: false,
              error: error instanceof Error ? error.message : "同步检查失败"
            });
          }
        }
        const failed = checks.filter((row: Record<string, unknown>) => !row.ok).length;
        await audit(null, "admin.class_data_sync_batch_completed", {
          class_count: checks.length, failed_count: failed, requested_class_id: requestedClassId || null
        });
        return json({
          ok: true,
          checks,
          checked_at: new Date().toISOString(),
          message: "已从 Supabase 主数据库重新读取班级、名单、任务、报告和参考数据计数；未覆盖或改写教学数据。"
        });
      }

      if (action === "admin_update_class") {
        if (!isAdmin) return json({ error: "Administrator required" }, 403);
        const targetClassId = String(body.class_id ?? "").trim();
        if (!targetClassId) return json({ error: "class_id required" }, 400);
        const { data: currentClass, error: lookupError } = await supabaseAdmin.from("classes")
          .select("id,name,course_code,description,teacher_id,is_active")
          .eq("id", targetClassId).maybeSingle();
        if (lookupError || !currentClass) return json({ error: lookupError?.message ?? "Class not found" }, 404);
        const update: Record<string, unknown> = {};
        if (body.name !== undefined) {
          const value = String(body.name ?? "").trim();
          if (!value || value.length > 120) return json({ error: "班级名称不能为空且不得超过 120 个字符。" }, 400);
          update.name = value;
        }
        if (body.course_code !== undefined) {
          const value = String(body.course_code ?? "").trim();
          if (value.length > 40) return json({ error: "课程代码不得超过 40 个字符。" }, 400);
          update.course_code = value;
        }
        if (body.description !== undefined) {
          const value = String(body.description ?? "").trim();
          if (value.length > 2000) return json({ error: "班级说明不得超过 2000 个字符。" }, 400);
          update.description = value;
        }
        if (body.teacher_id !== undefined) {
          const teacherId = String(body.teacher_id ?? "").trim();
          const { data: owner, error: ownerError } = await supabaseAdmin.from("profiles")
            .select("id,role,account_status").eq("id", teacherId).maybeSingle();
          if (ownerError || !owner || !["teacher", "admin"].includes(owner.role) || owner.account_status === "disabled") {
            return json({ error: "班级负责人必须是有效的教师或管理员账号。" }, 400);
          }
          update.teacher_id = teacherId;
        }
        if (body.is_active !== undefined) {
          if (typeof body.is_active !== "boolean") return json({ error: "is_active must be a boolean" }, 400);
          update.is_active = body.is_active;
        }
        if (!Object.keys(update).length) return json({ error: "No class changes supplied" }, 400);
        const { data: updatedClass, error: updateError } = await supabaseAdmin.from("classes")
          .update(update).eq("id", targetClassId)
          .select("id,name,course_code,description,teacher_id,join_code,is_active,created_at,updated_at").single();
        if (updateError || !updatedClass) return json({ error: "班级信息保存失败：" + (updateError?.message ?? "未返回更新记录") }, 400);
        await audit(null, "admin.class_updated", {
          class_id: targetClassId, previous: currentClass, changes: update
        });
        return json({ ok: true, class: updatedClass });
      }

      if (action === "export_class_backup") {
        if (actor.role !== "teacher" && !isAdmin) return json({ error: "Teacher or administrator required" }, 403);
        if (!await canManageClass()) return json({ error: "You do not manage this class" }, 403);

        const [classResult, assignmentResult, memberResult, reportResult, referenceResult] = await Promise.all([
          supabaseAdmin.from("classes").select("*").eq("id", classId).maybeSingle(),
          supabaseAdmin.from("experiment_assignments").select("*").eq("class_id", classId).order("created_at"),
          supabaseAdmin.from("class_members").select("*").eq("class_id", classId).order("joined_at"),
          supabaseAdmin.from("report_submissions").select("*").eq("class_id", classId).order("created_at").limit(3000),
          supabaseAdmin.from("experiment_reference_sets").select("*").eq("class_id", classId).order("updated_at")
        ]);
        if (classResult.error || !classResult.data) return json({ error: classResult.error?.message ?? "Class not found" }, 404);
        for (const result of [assignmentResult, memberResult, reportResult, referenceResult]) {
          if (result.error) return json({ error: result.error.message }, 500);
        }

        const assignments = assignmentResult.data ?? [];
        const members = memberResult.data ?? [];
        const reports = reportResult.data ?? [];
        const references = referenceResult.data ?? [];
        const reportIds = reports.map((row: Record<string, any>) => String(row.id));
        const assignmentIds = assignments.map((row: Record<string, any>) => String(row.id));

        const [revisionResult, recordResult, templateResult] = await Promise.all([
          reportIds.length
            ? supabaseAdmin.from("report_revisions").select("*").in("report_id", reportIds).order("changed_at")
            : Promise.resolve({ data: [], error: null }),
          assignmentIds.length
            ? supabaseAdmin.from("experiment_records").select("*").in("assignment_id", assignmentIds).order("created_at").limit(10000)
            : Promise.resolve({ data: [], error: null }),
          assignmentIds.length
            ? supabaseAdmin.from("assignment_templates").select("*").in("assignment_id", assignmentIds)
            : Promise.resolve({ data: [], error: null })
        ]);
        if (revisionResult.error) return json({ error: revisionResult.error.message }, 500);
        if (recordResult.error) return json({ error: recordResult.error.message }, 500);
        if (templateResult.error) return json({ error: templateResult.error.message }, 500);
        const revisions = revisionResult.data ?? [];
        const records = recordResult.data ?? [];
        const templates = templateResult.data ?? [];

        const studentIds = [...new Set([
          ...members.map((row: Record<string, any>) => String(row.student_id)),
          ...reports.map((row: Record<string, any>) => String(row.student_id))
        ])];
        const profileResult = studentIds.length
          ? await supabaseAdmin.from("profiles").select("id,full_name,student_no,role,account_status").in("id", studentIds)
          : { data: [], error: null };
        if (profileResult.error) return json({ error: profileResult.error.message }, 500);
        const profiles = profileResult.data ?? [];
        const profileMap = new Map(profiles.map((row: Record<string, any>) => [String(row.id), row]));

        const paths = [...new Set([
          ...reports.flatMap((row: Record<string, any>) => [row.storage_path, row.data_file_path, row.annotation_source_path]),
          ...revisions.flatMap((row: Record<string, any>) => [row.previous_storage_path, row.previous_data_file_path]),
          ...references.map((row: Record<string, any>) => row.storage_path)
        ].filter((path: unknown): path is string => typeof path === "string" && path.length > 0))];

        const signedUrlMap = new Map<string, string>();
        for (let offset = 0; offset < paths.length; offset += 80) {
          const chunk = paths.slice(offset, offset + 80);
          const signed = await supabaseAdmin.storage.from("lab-reports").createSignedUrls(chunk, 900);
          if (signed.error) return json({ error: "备份文件链接生成失败：" + signed.error.message }, 500);
          for (const item of signed.data ?? []) {
            if (item.path && item.signedUrl && !item.error) signedUrlMap.set(item.path, item.signedUrl);
          }
        }
        const missingLinks = paths.filter(path => !signedUrlMap.has(path));
        if (missingLinks.length) {
          return json({ error: "有 " + missingLinks.length + " 个报告或数据文件无法读取，已中止备份；班级不会被删除。" }, 500);
        }

        const safe = (value: unknown) => String(value ?? "未命名").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
        const files: Record<string, unknown>[] = [];
        const addFile = (path: unknown, displayName: string, kind: string, reportId = "") => {
          if (typeof path !== "string" || !path) return;
          files.push({
            path,
            archive_name: displayName,
            kind,
            report_id: reportId,
            signed_url: signedUrlMap.get(path)
          });
        };
        for (const report of reports as Record<string, any>[]) {
          const person = profileMap.get(String(report.student_id)) ?? {};
          const studentFolder = safe(person.student_no || person.full_name || report.student_id);
          addFile(report.storage_path, "报告文件/" + studentFolder + "/" + safe(report.file_name), "report", report.id);
          addFile(report.data_file_path, "数据工作簿/" + studentFolder + "/" + safe(report.data_file_name), "student_data", report.id);
          if (report.annotation_source_path && report.annotation_source_path !== report.storage_path) {
            addFile(report.annotation_source_path, "PDF原件/" + studentFolder + "/" + report.id + "_annotation_source.pdf", "annotation_source", report.id);
          }
        }
        for (const revision of revisions as Record<string, any>[]) {
          const report = reports.find((row: Record<string, any>) => String(row.id) === String(revision.report_id));
          const person = report ? profileMap.get(String(report.student_id)) ?? {} : {};
          const studentFolder = safe(person.student_no || person.full_name || "学生");
          addFile(revision.previous_storage_path, "历史报告版本/" + studentFolder + "/" + revision.report_id + "_v" + revision.version + "_" + safe(revision.previous_file_name), "report_revision", revision.report_id);
          addFile(revision.previous_data_file_path, "历史数据版本/" + studentFolder + "/" + revision.report_id + "_v" + revision.version + "_" + safe(revision.previous_data_file_name), "data_revision", revision.report_id);
        }
        for (const reference of references as Record<string, any>[]) {
          addFile(reference.storage_path, "教师参考数据/" + safe(reference.title || reference.source_file_name || reference.id), "reference_set", "");
        }

        const backupName = "TJUCPE_" + safe(classResult.data.name) + "_班级完整备份_" + new Date().toISOString().replace(/[:.]/g, "-") + ".zip";
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        const { data: receipt, error: receiptError } = await supabaseAdmin.from("class_backup_receipts").insert({
          class_id: classId,
          actor_id: actorId,
          expires_at: expiresAt,
          backup_file_name: backupName,
          metadata: {
            member_count: members.length,
            assignment_count: assignments.length,
            report_count: reports.length,
            revision_count: revisions.length,
            analysis_record_count: records.length,
            reference_set_count: references.length,
            file_count: files.length
          }
        }).select("id,expires_at").single();
        if (receiptError || !receipt) return json({ error: "备份凭证创建失败：" + (receiptError?.message ?? "unknown") }, 500);

        await audit(null, "class.backup_prepared", {
          class_id: classId,
          backup_id: receipt.id,
          file_count: files.length,
          report_count: reports.length,
          analysis_record_count: records.length
        });
        return json({
          ok: true,
          backup_id: receipt.id,
          expires_at: receipt.expires_at,
          backup_file_name: backupName,
          class: classResult.data,
          assignments,
          members,
          profiles,
          reports,
          revisions,
          experiment_records: records,
          assignment_templates: templates,
          reference_sets: references,
          files,
          counts: {
            member_count: members.length,
            assignment_count: assignments.length,
            report_count: reports.length,
            revision_count: revisions.length,
            analysis_record_count: records.length,
            reference_set_count: references.length,
            file_count: files.length
          }
        });
      }

      if (action === "ack_class_backup_downloaded") {
        if (actor.role !== "teacher" && !isAdmin) return json({ error: "Teacher or administrator required" }, 403);
        if (!await canManageClass()) return json({ error: "You do not manage this class" }, 403);
        const backupId = String(body.backup_id ?? "");
        const fileName = String(body.backup_file_name ?? "").slice(0, 240);
        const { data: receipt, error: receiptError } = await supabaseAdmin.from("class_backup_receipts")
          .select("id,expires_at,downloaded_at,used_at")
          .eq("id", backupId).eq("class_id", classId).eq("actor_id", actorId).maybeSingle();
        if (receiptError || !receipt) return json({ error: "备份凭证不存在。" }, 404);
        if (receipt.used_at || receipt.downloaded_at) return json({ error: "该备份凭证已使用或已确认。" }, 409);
        if (new Date(receipt.expires_at).getTime() <= Date.now()) return json({ error: "备份凭证已过期，请重新生成备份。" }, 409);
        const { error } = await supabaseAdmin.from("class_backup_receipts")
          .update({ downloaded_at: new Date().toISOString(), backup_file_name: fileName || "班级完整备份.zip" })
          .eq("id", backupId).eq("class_id", classId).eq("actor_id", actorId);
        if (error) return json({ error: "备份确认写入失败：" + error.message }, 500);
        await audit(null, "class.backup_download_confirmed", { class_id: classId, backup_id: backupId, file_name: fileName });
        return json({ ok: true, backup_id: backupId });
      }

      if (action === "delete_class") {
        if (actor.role !== "teacher" && !isAdmin) return json({ error: "Teacher or administrator required" }, 403);
        if (!await canManageClass()) return json({ error: "You do not manage this class" }, 403);
        const backupId = String(body.backup_id ?? "");
        if (!backupId) return json({ error: "删除班级前必须完成完整备份并确认下载。" }, 409);

        const { data: deleted, error: deleteError } = await supabaseAdmin.rpc("tjucpe_finalize_class_delete", {
          p_class_id: classId,
          p_backup_id: backupId,
          p_actor_id: actorId
        });
        if (deleteError || !deleted?.ok) {
          return json({ error: "班级删除未完成，数据库事务已回滚：" + (deleteError?.message ?? "invalid backup receipt") }, 409);
        }

        const paths = Array.isArray(deleted.storage_paths) ? deleted.storage_paths.filter((p: unknown) => typeof p === "string") : [];
        let removedFiles = 0;
        const cleanupWarnings: string[] = [];
        for (let offset = 0; offset < paths.length; offset += 100) {
          const chunk = paths.slice(offset, offset + 100);
          const { error } = await supabaseAdmin.storage.from("lab-reports").remove(chunk);
          if (error) cleanupWarnings.push(error.message);
          else removedFiles += chunk.length;
        }
        if (cleanupWarnings.length) {
          await audit(null, "class.backup_storage_cleanup_warning", {
            class_id: classId, backup_id: backupId, warnings: cleanupWarnings.slice(0, 10)
          });
        }
        return json({
          ok: true,
          class_id: classId,
          report_count: deleted.report_count ?? 0,
          analysis_record_count: deleted.analysis_record_count ?? 0,
          reference_set_count: deleted.reference_set_count ?? 0,
          removed_files: removedFiles,
          cleanup_warning: cleanupWarnings.length > 0,
          cleanup_messages: cleanupWarnings
        });
      }

      if (action === "create_class") {
        if (!["teacher", "admin"].includes(actor.role)) return json({ error: "Teacher or administrator required" }, 403);
        const name = String(body.name ?? "").trim();
        const courseCode = String(body.course_code ?? "").trim();
        const description = String(body.description ?? "").trim();
        if (!name) return json({ error: "Class name is required" }, 400);
        if (name.length > 120 || courseCode.length > 40 || description.length > 2000) return json({ error: "Class name, course code or description exceeds the allowed length" }, 400);
        const requestedTeacherId = String(body.teacher_id ?? "").trim();
        const teacherId = isAdmin && requestedTeacherId ? requestedTeacherId : actorId;
        if (!isAdmin && teacherId !== actorId) return json({ error: "Teachers can only create classes for themselves" }, 403);
        const { data: owner, error: ownerError } = await supabaseAdmin.from("profiles").select("id,role,account_status").eq("id", teacherId).single();
        if (ownerError || !owner || !["teacher", "admin"].includes(owner.role) || owner.account_status === "disabled") return json({ error: "The selected class owner must be an active teacher or administrator" }, 400);
        const { data: created, error: createError } = await supabaseAdmin.from("classes")
          .insert({ name, course_code: courseCode, description, teacher_id: teacherId })
          .select("id,name,course_code,description,teacher_id,join_code,is_active,created_at").single();
        if (createError || !created) {
          await audit(null, "class.create_failed", { class_name: name, teacher_id: teacherId, error_code: createError?.code ?? null, error: createError?.message ?? "Class could not be created" });
          return json({ error: createError?.message ?? "Class could not be created", code: createError?.code ?? null, details: createError?.details ?? null }, 400);
        }
        await audit(null, "class.created", { class_id: created.id, class_name: created.name, teacher_id: teacherId, scope: isAdmin ? "administrator_global" : "teacher_own_class" });
        return json({ ok: true, class: created });
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
        for (let i=0;i<ids.length;i++){
          const result=await makeRecoveryLink(ids[i]);
          results.push(result);
          if(result.error&&/rate.?limit|only request this after|too many/i.test(result.error)){
            for(const pendingId of ids.slice(i+1))results.push({user_id:pendingId,ok:false,error:"邮件服务触发发送频率限制，本次未发送。请等待后分批重试。"});
            break;
          }
        }
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
            .update({ status: "inactive" }).eq("class_id", classId).eq("student_id", id);
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
              const { error } = await supabaseAdmin.from("class_members").update({ status: "inactive" })
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
