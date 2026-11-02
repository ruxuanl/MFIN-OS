# 环境边界

本文件定义全阶段环境隔离原则。Test/Preview 与 Production 使用独立的 Supabase 和 Vercel 项目；Production Google 登录、Calendar 与 Gmail 只读连接均已验收。

| 环境 | 用途 | 数据 | 外部连接 | 当前状态 |
|---|---|---|---|---|
| Local | 本地开发、模拟模式与视觉检查 | 合成数据 | 默认关闭 | M0-M7 安全切片可用；Gmail 验收后已断连 |
| CI | 自动格式、静态、单元与生产构建 | 仓库合成夹具 | 禁止 | 已配置；本地全量 CI 为验收门 |
| Test | 数据库事务与外部适配器联调 | 专用测试账号/数据 | 逐里程碑授权 | 新加坡 Supabase 隔离项目可用；Calendar OAuth 待配置 |
| Preview | 用户验收候选版本 | 匿名化或专用测试数据 | 默认关闭 | Vercel 隔离项目可用，M4 尚未部署 |
| Production | 用户本人真实使用 | 真实个人数据 | 权限中心控制 | 新加坡 Supabase 与独立 Vercel 已上线；Google 登录、Calendar、Gmail 只读与定时侦测可用 |

## 固定规则

- Test、Preview、Production 使用不同的 Supabase 项目和凭据；不得共用数据库。
- Production 优先使用新加坡区域。区域一旦创建，变更必须通过迁移计划。
- Preview 不得默认连接真实 Gmail、Google Calendar、微信内容或 AI 供应商。
- 所有连接默认关闭，只有到达对应里程碑并获用户明确授权后才创建。
- 开发期可采用免费套餐；接入真实数据前必须重新评估暂停策略、备份、恢复、费用和数据保留。
- 环境变量只由本地未跟踪文件或托管平台密钥系统提供，不复制到文档、日志、测试输出或 AI 上下文。

## M1 前置条件

- 用户确认 D11：Google 登录与数据授权的最小范围。
- 用户确认 D18：个人内测与测试/生产隔离方式。
- 明确用于 Safari/PWA 验收的 iPhone。
- 用户另行授权后才创建 Google 测试项目；M0 不代为创建。

## M2 状态

- M2 迁移只应用到 `hku-mfin-m1-test` 隔离项目；未创建 Production 数据库。
- Gmail、Google Calendar、微信、AI 供应商和真实业务数据仍未连接。
- 数据库验收只使用事务内合成记录并回滚。

## M4 状态

- M4 Calendar 迁移已应用到 `hku-mfin-m1-test`；所有数据库验收使用事务内合成记录并确认回滚。
- 本地与 Preview 需要服务器端 `SUPABASE_SECRET_KEY`、`GOOGLE_CALENDAR_CLIENT_ID`、`GOOGLE_CALENDAR_CLIENT_SECRET`、`GOOGLE_CALENDAR_REDIRECT_URI`；Supabase 变量优先使用可独立轮换的 `sb_secret_...`，并兼容旧 `SUPABASE_SERVICE_ROLE_KEY`。这些值不得进入浏览器或仓库。
- 真实联调仅使用专用 Google 测试账号和独立产品日历，其他测试日历只读；M4 验收已完成并断连，Vault 凭据已删除，未连接任何真实个人日历。
- Production 数据库与 Web 已创建；Calendar 仍须使用 Production 专属服务器密钥和 Google OAuth 配置。测试 Vault 中不得留下联调结束后不再需要的凭据，断连流程必须验证远端撤销与本地删除。

## M5 状态

- M5 的 9 个迁移已应用到 `hku-mfin-m1-test`；数据库验收只使用合成记录并在结束后清理。
- SQL-only 报告 cron 每 5 分钟检查一次到期计划，不发起网络请求；仅有一个活动 job。
- Production 已安装同一套报告迁移，SQL-only 报告 cron 已激活；首位用户登录后已初始化 morning/evening/weekly 三条默认计划。报告仍只使用数据库能力，不会因 Calendar/Gmail 尚未连接而发起对应网络请求。

## M6 状态

- M6 及验收修复迁移已应用到 `hku-mfin-m1-test`，累计 40 个；事务内合成面试邮件更新/Calendar 队列/通知/撤销已通过并回滚。
- Test 复用既有 Google OAuth Web Client 身份；Gmail 使用独立精确 scope、独立 token、独立 Vault 引用和连接记录，环境值不进入仓库或聊天。
- 专用测试 Gmail 已完成有界首次/增量同步、附件关闭、暂停、远端撤销与 Vault/scope/游标清理；最终连接为 disconnected，活动 Gmail 临时授权为 0。Production Gmail 尚未配置或连接。

## M7 状态

- M7 与 Production Auth 加固/兼容迁移已应用到 `hku-mfin-m1-test`，累计 54 个；合成白名单/投影/心跳事务验收均已回滚，无合成测试记录残留。
- 本机已完成当前单一目标群的只读可见 OCR 验收；不注入、不读取微信数据库、不发送消息。Worker 和投影只连接隔离 Test，不连接 Production。
- 自动监测只在电脑开机、Windows 用户会话可用且微信已登录时提供覆盖；锁屏、退出或界面不可确认时状态中心必须显示暂停/失联，而不是“无新增”。
- 2026-08-15 只读环境盘点记录为 Windows build `26200`、`AppliedDPI=144`（约 150%）；未发现可确认的微信可执行文件/版本，也未发现 `tesseract` 或 `paddleocr` 命令，因此均保持 `unconfirmed/not_configured`。
- 本地进程允许 `synthetic` 与 `visible_ocr_v1` 适配器；真实可见 OCR 最高置信度 0.89，只进入待确认。适配器无键盘、剪贴板或发送能力，身份/UI/登录状态不确定时失败关闭。

## Production 状态

- Supabase：`hku-mfin-production`，项目引用 `juoqmufihsprolnaiaxn`，新加坡 `ap-southeast-1`；57 个迁移已应用，40 张 public 表全部启用 RLS，唯一 Google 用户 1 个、默认报告计划 3 条。
- Vercel：团队 `mfin-system` 下独立项目 `hku-mfin-production`，固定域名 `https://hku-mfin-production.vercel.app`；没有复用 Preview/Test 项目。
- Vercel 已配置 Production Supabase、Google 登录、Calendar/Gmail OAuth 运行变量；任何密钥均不得写入仓库或聊天。Gmail 与 Calendar 使用独立 state、PKCE、token 和 Vault 引用。
- Production Gmail scope 精确为 `gmail.readonly`；首次同步最多 50 封并已建立增量游标。Supabase Cron 每 15 分钟创建单次运行 UUID 并调用 Vercel 内部路由；无效、过期或已消费 UUID 只返回 `202 ignored`。
- `gmail.rules_extract`、`gmail.rules_status_update` 与 `calendar.write_fact` 已在用户单独确认后启用。仅新到达、明确面试邀请、唯一岗位匹配且规则置信度不低于 98% 时创建可撤销的 MFin/Calendar 操作；其他邮件及既有待确认项不自动处理。
- 本机微信 Worker 仍只连接隔离 Test；不得将其服务器密钥或目标群配置复制到 Production。
- Production 的唯一登录邮箱只以 SHA-256 摘要保存在 private singleton allowlist；Before User Created Hook 采用 invoker 权限，仅 `supabase_auth_admin` 可执行。Hook 已在 Dashboard 启用，真实未授权注册请求返回 403 且未创建用户；函数使用 PostgreSQL 内置 SHA-256，不授予 `extensions` schema 权限。Google provider、精确回调与三个基础 scopes 已配置，真实 PKCE 登录成功。
- M7 blanket revoke 的跨里程碑权限回归已由第 55 个迁移修复：只恢复 7 个既有私有包装实现给 authenticated/service_role，public/anon 仍无执行权；首页报告初始化 RPC 已从 403 恢复为 200。
