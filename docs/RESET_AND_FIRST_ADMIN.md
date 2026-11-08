# TJUCPE 测试环境重置与首位管理员初始化

## 本次测试数据重置范围（2026-11-08）

已清理 Supabase 项目中的全部旧测试身份与教学业务数据：

- Supabase Auth 用户与对应 profiles：0
- 教学班、班级成员：0
- 实验任务：0
- 学生实验记录、报告、报告修订：0
- 审计日志：0
- Storage 报告文件：重置前为空，无文件需要删除

**保留内容：**
- 数据库表结构、RLS、索引、函数、触发器和迁移历史；
- 14 个实验目录项目（experiment_catalog）；
- 私有 Storage bucket `lab-reports`；
- GitHub 源代码、算法与数据模板。

本次是清空测试数据，不是删除数据库结构，也没有删除实验目录或迁移记录。

## 重新创建首位管理员

所有 Auth 账号已清空。首次注册的新账号仍会默认成为 student，这是刻意的安全设计；注册完成并验证邮箱后，由项目所有者在 Supabase SQL Editor 中将指定账号任命为管理员。

先查询邮箱对应账号，确认只返回一行：

```sql
select id, email
from auth.users
where lower(email) = lower('YOUR_EMAIL@example.com');
```

确认邮箱无误后执行：

```sql
update public.profiles
set role = 'admin', account_status = 'active'
where id = (
  select id from auth.users
  where lower(email) = lower('YOUR_EMAIL@example.com')
)
returning id, full_name, role, account_status;
```

必须确认返回一行且 `role = admin`。然后退出网站并重新登录，使新权限生效。

## 创建教师与学生测试账号

1. 教师先通过注册页面创建账号，默认角色为 student。
2. 管理员在「用户与权限」中将该账号调整为 teacher。
3. 教师创建班级、导入或邀请学生、发布实验任务。
4. 学生注册并验证邮箱；教师将其加入班级，或学生使用班级加入码加入。
5. 只有有效班级成员才能看到该班级已开放任务；报告提交还必须绑定对应任务。

## 账号删除验收

- 管理员可在用户与权限页勾选学生并批量永久删除。
- 教师只能管理自己负责班级的学生；学生若仍属于其他班级，教师操作只移出当前班级。
- 密码重置通过恢复链接完成，不显示旧密码。
- 删除班级时，如存在历史报告，系统会阻止永久删除，要求归档，以保护教学记录；没有历史报告的班级可永久删除。

## 注意

不要将 Secret / service_role key 写入网页、仓库或发送给任何人。首位管理员任命只在 Supabase Dashboard 的 SQL Editor 中执行。
