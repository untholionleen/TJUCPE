# TJUCPE · 物理化学实验教学与电子报告管理平台

面向物理化学实验教学的浏览器工作区，包含学生端、教师端和管理员端。

## 当前代码内容

- 学生：实验数据录入、统计与回归拟合、散点/折线图、CSV/PNG 导出、分析记录保存、私有报告上传与反馈查看。
- 教师：查看提交报告、生成短时签名下载链接、录入成绩与评语、退回修改。
- 管理员：查看账号资料、分配学生/教师/管理员身份；数据库记录角色变更审计。
- 数据库：Supabase Auth、用户资料、实验记录、报告记录、私有 Storage bucket 与 RLS。

## 快速部署

1. 在 Supabase SQL Editor 执行 `supabase/migrations/202611070001_initial_schema.sql`。
2. 执行 `supabase/verification/post_deploy_checks.sql`，核对 RLS、grants、Storage policies、私有函数和触发器。
3. 在 Authentication 中启用邮箱/密码登录并设置站点回调 URL。
4. 在 GitHub 仓库 Settings → Pages 中将 Source 设为 GitHub Actions。
5. 等待 Actions 中的部署 workflow 成功。
6. 首次注册管理员账号后，按迁移文件末尾 SQL 在数据库中授予 admin 角色。

详细步骤见 `docs/DEPLOYMENT.md`、`docs/SUPABASE_SETUP.md`、`docs/SECURITY.md` 和 `docs/DEPLOYMENT_STATUS.md`。CI 包含 JavaScript 语法、回归拟合和数据库安全结构冒烟检查；这些检查不等于已在真实 Supabase 项目执行 SQL。

## 重要安全边界

此仓库初始核验时是 Public。仓库只保存通用程序代码，不保存实验报告、学生名单或原始教学数据。浏览器只使用 Supabase publishable key；严禁将 service_role / secret key 放入前端。不要在 RLS 尚未启用且权限测试未通过时投入真实学生数据。当前 GitHub Pages 地址仅作页面预览；GitHub 官方限制说明不应用 Pages 处理密码等敏感交易，正式教学前应迁移至适合认证业务的托管平台。

## 科学计算边界

首版提供通用多项式回归与绘图，不等于每个实验的专业公式都已完成验证。Excel 主要作为数据列组织和绘图展示参考；脚本中的高级模型及各项实验公式状态见 docs/ALGORITHM_STATUS.md。
