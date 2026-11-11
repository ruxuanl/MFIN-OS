# ADR-0004：M4 Google Calendar 授权与同步闭环

- 状态：已接受
- 日期：2026-08-10
- 对应决策或里程碑：D10、D11、D18；M4

## 背景

M4 需要读取专用测试账号的既有日历事件用于冲突判断，同时只向一本文档化的产品日历写入。Google Calendar 负责每日时间与提醒，产品数据库继续负责 Action、岗位、课程和追加历史。OAuth 凭据不得进入浏览器包、普通业务字段、日志或审计。

## 决定

1. 使用独立 Calendar OAuth 授权，不修改 M1 基础身份登录范围。请求 `calendar.calendarlist.readonly`、`calendar.events.readonly` 与 `calendar.app.created`；不请求 Gmail、ACL 或全账户 Calendar 写权限。
2. 测试账号中新建产品日历 `港大 MFin｜个人系统`，时区 `Asia/Hong_Kong`。学业、实习、秋招、个人标签采用固定低饱和色，Google 标签 API 请求携带 `eventLabelVersion=1`。
3. OAuth access/refresh token 只保存到 Supabase Vault。普通表只保存 `private.secret_references` 引用；读取、更新和删除秘密的 RPC 只授予 `service_role`。
4. `calendar_sources` 与 `calendar_events` 保存最小必要镜像；增量游标位于私有 schema。Google 返回 `410` 时清除该来源镜像和旧游标后执行受控全量同步。
5. `calendar_event_links` 只映射产品 Action 与产品日历事件。外部既有事件没有写入入口；产品事件使用稳定 provider ID、ETag、Action 版本与幂等操作防止重复和循环写入。
6. Calendar 时间变化在 Action 未并发修改时回写排期并追加时间线；双方同时变化时创建显式冲突。远端删除只创建“取消排期或重新同步”冲突，不自动重建、不删除 Action 历史。
7. 完成或取消 Action 时保留 Google 事件，只更新标题。产品创建的事件详情包含返回产品的 HTTPS 路径与私有扩展标记。
8. 连接暂停、权限关闭、授权过期和隐私锁在每次外部请求与写入前复核。暂停期间保留待同步操作；恢复后需要用户主动触发同步，不补跑未知历史范围。

## 后果

- 产品无法修改用户原有事件；如未来需要此能力，必须增加逐项确认令牌和新的权限审查。
- OAuth 回调、同步和 Vault 访问只能运行在服务端，需要服务器环境变量与隔离 Google 测试项目配置。
- 标签是 2026 年 Calendar API 的版本化能力；适配器保留标签版本参数，标签不可用时必须显式失败，不能静默退回不一致的颜色语义。
- 第一版使用手动同步入口和持久化操作队列，不引入新的定时 Worker 供应商；M5 需要自动报告前再决定调度运行时。

## 验证

- 领域/适配器契约测试覆盖时间与全天映射、标题、标签、ETag、410、412、重复操作和外部事件只读。
- PostgreSQL 回滚事务覆盖 RLS、权限关闭、隐私锁、待同步、远端删除冲突、解决与追加审计。
- 真实联调只使用专用测试账号和产品测试日历，验收后删除合成事件并确认未触及真实日历。
