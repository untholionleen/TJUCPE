# TJUCPE v2.5.1：二维码生成与教师班级权限范围

## 二维码修复
- 原实现请求 qrcode@1.5.4/build/qrcode.min.js；该版本 npm 包没有发布 build 目录，两个旧 CDN 地址均不可用。
- 将 QRCode.js 浏览器构建文件固定到上游提交 04f46c6a0708418cb7b96fc563eacae0fbf77674，随 GitHub Pages 同站点发布；保留 cdnjs 与 jsDelivr 作为加载失败时的备用地址。
- 同步保留 QRCode.js 的 MIT License。
- 按 QRCode.js 构造器 API 生成 canvas/image，不再误调用 node-qrcode 的 toCanvas API。
- 管理员全局班级目录也提供二维码操作；二维码查找同时支持教师缓存和管理员全局目录缓存。
- 加入二维码加载超时、失败提示、复制链接和重新生成入口；归档班级明确提示不能加入。

## 班级权限边界
- 教师创建班级时 teacher_id 固定为当前登录教师；不能通过请求参数将班级转给他人。
- 教师只能查看、修改、归档自己负责的班级；成员、任务、模板、报告与参考数据沿用 private.is_class_teacher(class_id) 限制。
- 管理员不受 teacher_id 限制，可以管理全平台所有班级，也可以重新指定负责人。
- 管理员全局目录从 Supabase 主数据库读取班级，因此教师自主创建班级自动进入管理员的全局管理范围。
- experiment_records 是教师个人分析工作区记录。将其 SELECT RLS 从全体 staff 收紧为记录 owner 或 admin；按班级导出的记录仍由经过 canManageClass 验证的服务端导出接口处理。

## 变更边界
- 未新增/删除班级，未重置或清空现有数据。
- 不改变共享实验目录管理；它不是班级所有权数据。
