# Supabase 配置操作手册（TJUCPE）

适用项目：物理化学实验教学与电子报告管理平台  
当前前端站点：<https://untholionleen.github.io/TJUCPE/>  
GitHub 仓库：<https://github.com/untholionleen/TJUCPE>  
Supabase 项目引用：`snkokdrjxymlmyjbitbu`

> **上线边界提醒（请先读）**：GitHub Pages 的官方说明指出，Pages 不应用于处理密码等敏感交易。当前 Pages 地址适合检查页面布局和公开预览；在收集真实学生密码、个人信息或实验报告之前，建议把前端迁移到适合认证业务的托管平台，并完成数据库权限测试。不要把真实学生资料放在 GitHub 仓库。见 GitHub Pages 限制说明：https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

## 一、进入正确的 Supabase 项目

1. 登录 https://supabase.com/dashboard 。
2. 在组织和项目列表中打开本项目，确认项目引用是 `snkokdrjxymlmyjbitbu`。
3. 不要把其他项目的 URL 或 key 粘贴到本项目配置。
4. 左侧菜单中常用入口：
   - SQL Editor：运行数据库迁移。
   - Table Editor：确认业务表。
   - Authentication：配置邮箱注册、确认邮件和 URL。
   - Storage：确认报告文件桶是私有。
   - Settings → API Keys：查看公开 publishable key 和私密 secret key。

## 二、核对 API URL 和 publishable key

本仓库的 `config.js` 已经写入项目 URL 和 publishable key：

- Project URL：`https://snkokdrjxymlmyjbitbu.supabase.co`
- Key 类型：`sb_publishable_...`

这类 publishable key 本来就会出现在浏览器代码中。它只标识项目，真正的数据访问权限由登录会话、Postgres grants 和 RLS policies 决定。

**绝对不要**把以下内容复制进 `config.js`、HTML、JavaScript、GitHub 仓库、Issue 或公开聊天：
- `sb_secret_...`
- 旧式 `service_role` key
- 数据库密码
- GitHub personal access token
- SMTP 密码或其他后台密钥

如果以后需要服务器级任务，secret key 只能保存在可信的后端/Edge Function 环境变量中；本项目的静态前端不需要 secret key。

官方说明：
- API keys：https://supabase.com/docs/guides/getting-started/api-keys
- Securing your data：https://supabase.com/docs/guides/database/secure-data

## 三、执行数据库迁移 SQL（最重要）

迁移文件路径：

`supabase/migrations/202611070001_initial_schema.sql`

操作步骤：

1. 在 GitHub 打开该文件：  
   https://github.com/untholionleen/TJUCPE/blob/main/supabase/migrations/202611070001_initial_schema.sql
2. 点击 Raw，或下载该文件。
3. 回到 Supabase Dashboard → SQL Editor → New query。
4. 将 SQL 文件全部内容复制到编辑器。不要只执行其中一段。
5. 点击 Run。请使用项目所有者/具有数据库管理权限的 Dashboard 会话。
6. 如果出现红色错误提示，先停止，不要跳过报错继续创建用户；保存完整错误信息再处理。

迁移会建立以下对象：

| 对象 | 用途 |
|---|---|
| `profiles` | 姓名、学号/工号、角色 |
| `experiment_records` | 学生实验原始数据快照、分析结果、算法版本 |
| `report_submissions` | 报告文件路径、状态、成绩与评语 |
| `audit_logs` | 管理员角色变更记录 |
| `lab-reports` Storage bucket | 私有 PDF / DOCX 报告文件桶 |

迁移同时配置 RLS、必要的 SQL grants、用户注册触发器、角色保护触发器、报告评分保护、私有文件桶及文件访问策略。

### 迁移完成后的检查

在 SQL Editor 中运行：

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'experiment_records',
    'report_submissions',
    'audit_logs'
  )
order by tablename;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'lab-reports';
```

预期：
- 四张业务表均能查到，`rowsecurity = true`。
- `lab-reports` 存在，`public = false`，文件大小上限为 20,971,520 bytes（20 MiB）。
- 报告桶只允许 PDF 和 DOCX。

## 四、配置 Auth 邮箱登录

打开 Supabase → Authentication → Sign In / Providers（部分控制台版本可能显示为 Providers）。

1. 找到 Email provider，确认启用 Email。
2. 确认允许 Email + Password 登录。
3. 建议真实教学使用开启邮箱确认（Confirm email），防止随意填写不存在的邮箱；若开启，注册后学生需先查收确认邮件，再回来登录。
4. 确认密码强度要求。平台前端要求至少 8 位；可按学校要求进一步增强。
5. 如课程会集中注册较多学生，先配置自有 SMTP 并测试投递。Supabase 默认邮件服务有速率限制，不宜直接承担大批量教学通知。

## 五、配置 Site URL 与 Redirect URLs

打开 Authentication → URL Configuration。

将 **Site URL** 设为当前 GitHub Pages 预览地址：

```
https://untholionleen.github.io/TJUCPE/
```

在 **Redirect URLs** 增加：

```
https://untholionleen.github.io/TJUCPE/**
```

如需本地测试，再额外添加本地地址，例如：

```
http://localhost:8080/**
```

不要把 `https://**` 这种过宽通配符当作常规配置。保存设置。

Site URL 会影响邮件确认和密码重置的默认跳转；代码里的 `redirectTo` 必须匹配允许列表。官方说明：https://supabase.com/docs/guides/auth/redirect-urls

## 六、建立第一个管理员账号

**管理员不能在注册页面自行选择。** 必须先正常注册，再由项目所有者在数据库中授予。

1. 打开前端注册页面，使用您自己的邮箱注册。
2. 填写姓名、学号/工号；注册身份自动为“学生”。
3. 如开启邮箱确认，先完成邮箱验证。
4. 正常登录一次，确认用户资料已生成。
5. 回 Supabase → SQL Editor，先查询账号：

```sql
select id, email
from auth.users
where lower(email) = lower('YOUR_EMAIL@example.com');
```

6. 确认结果只有您自己的账号，然后执行：

```sql
update public.profiles
set role = 'admin'
where id = (
  select id
  from auth.users
  where lower(email) = lower('YOUR_EMAIL@example.com')
)
returning id, full_name, student_no, role;
```

把 `YOUR_EMAIL@example.com` 替换成您的注册邮箱。预期返回一行，role 为 `admin`。

### 授予教师身份

确认教师已经注册并完成邮箱验证后，由管理员在 SQL Editor 执行：

```sql
update public.profiles
set role = 'teacher'
where id = (
  select id
  from auth.users
  where lower(email) = lower('TEACHER_EMAIL@example.com')
)
returning id, full_name, student_no, role;
```

如果用户尚未注册，查询会返回空，不会自动创建账号。身份修改会写入 `audit_logs`。

## 七、验证学生、教师和管理员权限

至少创建两个学生测试账号（Student A / Student B）和一个教师测试账号。不要直接拿真实学生报告做初测。

### 学生 A
- 登录后能看到自己的工作台、实验列表、报告页面。
- 输入两列或多列数据，运行拟合，导出 PNG / CSV。
- 保存分析记录后，只能在自己的账号中看到该记录。
- 上传 PDF / DOCX 报告后，自己的报告列表中能看到提交记录。

### 学生 B
- 登录后不应看到学生 A 的实验记录。
- 不应看到或下载学生 A 的报告文件。
- 不能更改自己的角色、成绩、教师评语、批阅人、报告状态或文件路径。

### 教师
- 登录后能看到“报告批阅”。
- 能查看提交记录、生成短时签名链接、录入成绩与反馈、退回修改。
- 不应看到“用户与权限”管理员管理页。

### 管理员
- 能看到“报告批阅”和“用户与权限”。
- 可以把已注册用户调整为教师或学生。
- 更改身份后，`audit_logs` 应出现一条对应记录。

若任一隔离测试不符合预期，请不要导入真实教学数据，先检查 RLS、Storage policies 和 grants。

Supabase 官方强调：RLS 与 grants 要同时配置；仅有 policy 并不等于已经撤销其他角色的表权限。官方说明：https://supabase.com/docs/guides/database/postgres/row-level-security

## 八、报告文件存储与隐私

- 学生 PDF/DOCX 放在私有 `lab-reports` bucket。
- 对象路径格式以用户 UUID 开头，学生只能访问自己文件夹。
- 教师/管理员按数据库角色访问教学报告。
- 下载链接为限时签名链接（当前前端设为 90 秒）。
- 不要把学生上传的报告放进 GitHub 仓库、公共网盘或 issue。
- 当前系统不宣称应用层端到端加密。请按学校要求设置数据保留期限、备份、访问审计、账户 MFA 和人员离岗权限回收。

Storage 官方说明：https://supabase.com/docs/guides/storage/security/access-control

## 九、Supabase Free 项目可能 7 天暂停

官方说明：Free 项目如果一周内数据库活动过低，可能自动暂停；每天几次真实用户请求通常有帮助，但不是保证。付费计划的项目不会因闲置而自动暂停。

收到暂停预警邮件时，可登录 Dashboard 访问项目或让真实应用产生必要数据库请求；若已暂停，进入 Dashboard 选择项目并点 Resume project。要避免自动闲置暂停，需升级到适用的付费计划。

官方政策：
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/kb/faqs/platform/free-project-pausing

不要用浏览器无意义地每几秒轮询数据库来“保活”，这既不可靠也会制造多余请求。

## 十、GitHub 仓库公开性与前端托管

本次核验仓库为 Public。仓库内有通用程序、SQL 结构和文档，没有上传学生报告或原始 Excel。

GitHub Pages 官方将 Free 计划 Pages 限定为公开仓库；私有仓库 Pages 需要 Pro、Team 或 Enterprise 等计划。并且 GitHub Pages 文档明确提示，不应用于密码等敏感交易。因此当前页面请视为可访问的预览环境，不要作为真实学生账号/报告系统正式入口。

- GitHub Pages 限制：https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- Supabase publishable key 可在浏览器使用；secret key 不可以。
- 若要把源代码设为私有，先确认 GitHub 账号计划支持私有仓库 Pages，或规划迁移至其他支持认证业务的托管平台，不能简单地切换仓库可见性后假设站点仍正常。

## 十一、出错时先看哪里

| 现象 | 优先检查 |
|---|---|
| 登录后提示未找到用户资料 | 是否完整执行 SQL 迁移；`handle_new_user` 触发器和 `profiles` 是否存在 |
| 注册后不能马上登录 | 是否开启邮箱确认；是否先完成确认邮件 |
| 确认邮件/重置邮件跳错地址 | Authentication → URL Configuration 的 Site URL 与 Redirect URLs |
| 报告上传失败 | `lab-reports` bucket 是否存在且私有；Storage INSERT policy；MIME 类型及 20 MiB 限制 |
| 报告能上传但列表没有记录 | `report_submissions` 表、RLS insert policy、触发器和前端错误提示 |
| 学生能访问别人的数据 | 立即停止使用；检查 RLS 是否开启、策略和 grants 是否与迁移一致 |
| 教师端无报告 | 当前账号 role 是否为 teacher/admin |
| 管理员页不可见 | 是否已经在 profiles 中授予 admin 并重新登录/刷新会话 |
| 项目显示 paused | Dashboard → Resume project；检查 Free 计划活动暂停政策 |

## 十二、当前工程状态和限制

- GitHub Pages 的最新自定义发布工作流已成功执行。
- JavaScript 语法检查及线性/二次/三次回归冒烟测试通过。
- 本次会话没有 Supabase 项目管理或 SQL 执行权限，因此**数据库迁移仍需要项目所有者亲自执行**。
- 专业实验公式仍按 `docs/ALGORITHM_STATUS.md` 中的校核状态逐项推进。通用回归与绘图通过测试，不代表所有实验公式均已通过实验指导书验证。
- 请先将本手册第三至第七节完成，再安排真实账号与私有报告测试。
