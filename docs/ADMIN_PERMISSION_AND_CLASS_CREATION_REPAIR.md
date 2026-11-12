# TJUCPE 管理员权限与班级创建修复

- 班级创建增加按钮 click 与表单 submit 双入口，并使用互斥状态防止重复请求；页面显示处理中和失败原因。
- 管理员全局用户清单将批量选择项修复为真实 checkbox，批量重置与批量学生删除可正确读取所选账号。
- 管理员打开用户管理页时，以 profiles.role 为权威同步 Auth app_metadata.role；同步失败作为警告返回，不隐藏用户列表。
- 角色变更和账号停用/恢复先写入 canonical profile，再同步 Auth；Auth 失败时回滚 profile，避免无提示的角色/状态分裂。
- 角色辅助函数 private.is_class_teacher(uuid) 撤销 PUBLIC/anon execute，只授权 authenticated/service_role。
- Edge Function classroom-admin 保持 JWT verification=true。
