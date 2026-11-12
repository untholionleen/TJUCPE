# TJUCPE v2.5.0：班级创建诊断与管理员全局班级/数据管理

## 班级创建链路
- 创建班级改为通过已登录 Supabase session token 直接请求 Edge Function，并读取完整 HTTP 状态、JSON/文本响应体、数据库错误码和 details。
- 创建按钮原生 click、表单 submit 和独立入口统一经过安全 wrapper，捕获请求前初始化异常，避免只显示全局“操作未完成”。
- 创建失败页面显示接口原始响应，便于明确区分前端异常、网络/CORS、JWT 鉴权、Edge Function 和数据库写入问题。
- Supabase 03:58 的相关窗口内没有看到对应 create_class POST/审计记录；不能将旧泛化提示认定为数据库拒绝写入。

## 管理员独立工作台
- 新增管理员专属“班级与数据管理”页，与教师“班级与任务”工作台分离。
- 全局班级目录包含班级、课程代码、负责人、成员数、任务数、Excel 模板数、报告数、参考数据数、状态及最近同步核验时间。
- 管理员可新增班级、修改班级资料及负责人、归档/重新启用班级。
- 永久删除使用完整 ZIP 备份凭证工作流：生成备份、下载并由管理员确认、服务器核验凭证后执行事务删除；不提供绕过备份的直接删除按钮。
- 数据同步核验会从 Supabase 主数据库重新读取成员、任务、模板、报告、报告历史、分析记录和参考数据计数，并写入管理员审计记录。它是数据库数据核对，不是与未配置的第三方系统同步。

## 班级完整备份修复
- ZIP 包含 classes、members、assignments、assignment_templates、profiles、reports、revisions、experiment_records、reference_sets、counts，以及报告/数据文件、历史版本、教师参考工作簿原文件。
- 修复 tjucpe_finalize_class_delete：在事务返回的 storage_paths 中包含 experiment_reference_sets.storage_path，确保参考工作簿文件可由 Edge Function 在数据库提交后清理。
- assignment_templates 依赖 experiment_assignments，数据库外键为 ON DELETE CASCADE；备份已显式导出其 JSON 快照，避免随任务级联删除后无法恢复。

## 数据与安全
- 本次不创建真实班级、不生成虚假学生或任务、不清空任何正式数据。
- 所有新增管理员接口均在 Edge Function 服务端检查 profiles.role = admin。
- 类别归档不删除关联数据；永久删除需要有效且已确认下载的备份凭证。
