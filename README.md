# TJUCPE · 物理化学实验教学与电子报告管理平台

面向物理化学实验教学的浏览器工作区，包含学生端、教师端和管理员端。

## 当前已部署能力

- **学生端**：14 个实验专属数据模板；按班级任务提交 PDF/DOCX；提交后可查看、撤回、修改和删除符合状态规则的报告；查看教师反馈和批阅后的 PDF。
- **教师端**：创建/修改/停用班级；分班导入名单；发布、修改和关闭实验任务；管理本班学生；生成密码恢复链接；在线预览 PDF 并直接页面圈画批注，发布新的批阅版 PDF。
- **管理员端**：管理全站账号与角色、跨班级管理、永久删除学生账号、重置密码；管理班级与实验目录；查看审计日志、Supabase 检测和技术资料。
- **实验项目管理**：14 个已建立实验模板；教师/管理员可新增、编辑、停用和重新启用实验目录项。新建项目默认通用数据工作区，专属公式需经课程教师核验后再启用。
- **Origin 风格数据处理**：专属实验表格、逐表 Excel/CSV 导入、CSV 导出、交互矩形/套索拟合选区、重新拟合、残差和统计结果；Matplotlib/Python 生成科研图，Plotly 提供交互选区。
- **报告版本**：批阅 PDF 作为新版本上传，更新当前报告路径；原始 PDF 不覆盖，版本表保留旧文件路径，学生与教师读取同一当前版本。

## 数据库部署状态

Supabase 项目 `TJUCPE` 已连接并完成以下迁移：

- `20261107154542_tjucpe_classroom_catalog_assignments_v2`
- `20261107170207_tjucpe_report_lifecycle_v3`
- `20261107173313_report_student_edit_guard_v4`
- `20261107175451_tjucpe_full_workflow_pdf_review_v5`
- `20261107180243_tjucpe_query_performance_indexes_v6`
- `20261107181323_tjucpe_report_resubmission_deadline_guard_v7`
- `20261107181407_tjucpe_active_class_submission_guard_v8`
- `20261107181850_tjucpe_rls_performance_policy_tuning_v9`
- `20261107181935_tjucpe_legacy_report_resubmit_guard_v10`

当前已检查到 `profiles`、`classes`、`class_members`、`experiment_catalog`、`experiment_assignments`、`report_submissions`、`report_revisions` 和 `audit_logs`；相关业务表已启用 RLS。 `lab-reports` 是私有 Storage bucket。 `classroom-admin` Edge Function 当前为 ACTIVE v9。

**兼容性说明**：已有的旧报告即使没有 `class_id` / `assignment_id` 也会保留，不会被伪造归班；新报告必须关联有效班级和教师发布的实验任务。

## 快速访问

- 网站预览：<https://untholionleen.github.io/TJUCPE/>
- GitHub 仓库：<https://github.com/untholionleen/TJUCPE>

## 部署与验收边界

- 当前仓库公开；仅提交通用程序、迁移和文档，不提交学生名单、报告原件、成绩或其他个人数据。
- 浏览器只使用 Supabase publishable key。严禁将 service_role、secret key 或数据库密码写入前端。
- 代码推送不等于 Pages 已完成部署；以 GitHub Actions 中最新 `Deploy TJUCPE to GitHub Pages` 工作流成功为准。
- 真实学生数据上线前，仍须使用两名合成学生、教师和管理员完成权限、报告提交、撤回、批阅 PDF 同步和文件历史验收。
- 自动化计算模板是实验教学辅助工具；实验公式、单位、常数与结果仍须按课程指导书由教师逐项验收。
- GitHub Pages 仅作预览；正式收集学生账号和报告前，应迁移至适合认证业务和敏感文件处理的托管环境。

详见 `docs/DEPLOYMENT.md`、`docs/SECURITY.md`、`docs/ALGORITHM_STATUS.md`。
