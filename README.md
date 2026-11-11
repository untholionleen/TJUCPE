# TJUCPE · 物理化学实验教学与电子报告管理平台

面向物理化学实验教学的浏览器工作区，包含学生端、教师端和管理员端。

## v2.1 学生提交与教师数据工作区

- **学生端**：只下载教师按任务发布的 Excel 模板，填写数据后与 PDF/DOCX 报告同步提交；查看报告状态、教师反馈和批阅版报告。不再提供学生制图、拟合或数据处理入口。
- **教师端**：提供在线 Excel 工作簿设计器，无需修改 JSON；教师可按任务编辑工作表、单元格、公式和格式。批阅时同页查看报告与学生 Excel 数据，按需读取参考工作簿并执行数据比较、区间选择、线性/二次/三次拟合及图表分析。
- **管理员端**：管理全站账号与角色、跨班级管理、班级与实验目录、审计日志和系统检测。
- **文件与数据库**：学生报告、学生 Excel 数据和教师参考工作簿存放在私有 Storage；数据库保留必要的提交元数据和工作簿模板快照，不将教师参考 Excel 的全部单元格写入 JSONB。
- **性能策略**：学生端按需加载轻量资源；在线 Excel、图表、PDF 编辑引擎只在教师使用对应功能时加载；教师报告列表每次分页 100 条；模板只在点击下载时单份读取；分析计算尽量在浏览器本地运行。
- **报告版本**：批阅 PDF 作为新版本上传，原始 PDF 不覆盖，版本表保留旧文件路径；学生与教师读取同一当前版本。

## 数据库部署状态

Supabase 迁移按顺序记录在 `supabase/migrations/`。本次 v2.1 新增：

- `20261111131435_tjucpe_teacher_workbook_templates_storage_and_query_efficiency_v21.sql`
- `20261111142825_tjucpe_teacher_workbook_storage_policy_privilege_tuning_v22.sql`
- `20261111142948_tjucpe_student_analysis_write_restriction_v23.sql`

本次没有清空、删除或重置现有学生报告、提交版本、PDF 批注或教师历史参考记录。`experiment_records` 的历史学生记录保留可读，但新的分析记录写入仅允许教师/管理员。`lab-reports` 为私有 Storage。

## 快速访问

- 网站：<https://untholionleen.github.io/TJUCPE/>
- GitHub 仓库：<https://github.com/untholionleen/TJUCPE>

## 性能与验收边界

本版本通过前端按需加载、分页、减少重复查询、模板按需读取、参考 Excel 文件化存储和本地分析，降低日常数据库交互和数据库存储量。**30,000 次交互目前是容量目标，不是已完成的并发压测结果。**正式确认该指标前，仍需用合成账号和数据执行 30,000 次并发/持续交互测试，并观察 Database、Storage、Auth、网络出站流量、RLS 查询和 CDN 资源指标。

正式用于真实课程前，还应分别使用学生、教师和管理员账号验收权限，并使用 Microsoft Excel 与 WPS 完成中文、公式、日期/数字格式、多工作表和文件往返测试。自动化代码检查通过不等同于完成这些人工验收。

详细说明见 `docs/TJUCPE_V2_1_TEACHER_WORKFLOW.md`、`docs/DEPLOYMENT.md`、`docs/SECURITY.md` 和 `docs/ALGORITHM_STATUS.md`。
