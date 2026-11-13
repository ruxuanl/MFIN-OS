# Google Calendar 接入与故障恢复

范围：D10/D11、ADR-0004。读取已授权账号的日历，只写应用创建的产品日历；不申请全账户写权限，不修改用户原有事件。使用本地隔离 Test 时，仅使用专用测试账号和合成事项。

## 配置与连接

1. 按 [测试环境手册](test-environment.md) 配置 Supabase 和 Google OAuth Web 客户端。
2. 在该客户端所属的 Google Cloud 项目启用 Google Calendar API，登记精确回调 `http://localhost:3000/api/calendar/oauth/callback`；部署环境改为实际站点的同一路径。
3. 仅在忽略的 `apps/web/.env.local` 或托管服务的密钥环境配置 `SUPABASE_SECRET_KEY`、`GOOGLE_CALENDAR_CLIENT_ID`、`GOOGLE_CALENDAR_CLIENT_SECRET`、`GOOGLE_CALENDAR_REDIRECT_URI`。不要提交密钥或 OAuth 回调地址中的 code/state。
4. 启动 `pnpm dev`，在 Edge 或 Chrome 打开 `/calendar`。状态中心需持续开启 `calendar.connection` 和 `calendar.read`。写入需另行开启 `calendar.write_confirmed_plan` 和 `calendar.update_product_event`；确认计划和隐私锁继续生效。
5. 如提示重新验证，使用 Google 重新登录或 Passkey。验证后返回日历页，点击“连接 Google Calendar”，在 Google 同意页面勾选三项日历权限。
6. 授权后应出现产品日历与四类标签，完成一次同步后才算初始化完成。创建一条合成个人行动并填写日期，选择“全天事件”或“时间事件”，点击“立即同步”；再次同步不得产生重复事件。

Calendar 与 Gmail 的 OAuth 入口使用普通整页链接，不能通过 Next.js `Link` 预取或以 RSC 页面导航访问；否则 Google 跨域重定向会先触发 RSC fetch 失败，再回退浏览器导航，造成额外等待和授权入口的意外请求。

Windows 日常使用可双击根目录 `start-app.cmd`，先构建一次再启动生产服务器；`start-local.cmd` 保持开发热更新模式。先停止同一端口上的旧服务，避免两个实例竞争 3000 端口。

三项 scope 固定为 `calendar.calendarlist.readonly`、`calendar.events.readonly`、`calendar.app.created`（均以 `https://www.googleapis.com/auth/` 为前缀）。未授予全部权限时不保存本次凭据。Google 登录与 Calendar 数据授权是两个流程。

## 故障恢复

| 页面提示 | 处理 |
| --- | --- |
| OAuth 客户端配置无效 | 核对客户端 ID、密钥、客户端类型与精确回调地址；只修改服务器配置。 |
| 未授予全部日历权限 | 重新连接并勾选全部三项 Calendar 权限。 |
| 返回接入范围之外的权限 | 使用独立 Calendar OAuth 客户端，避免扩大既定 scope。 |
| Calendar API 尚未启用 | 在客户端所属项目启用 API，再点击“立即同步”。 |
| Google 授权已失效 | 重新验证后，点击“重新连接 Google Calendar”。外部应用的 Testing 模式授权通常在 7 天后过期。 |
| 已暂停 / 隐私锁 | 先恢复连接，或在设置中重新验证并解锁，再主动同步；不自动补跑历史。 |
| 同步异常 | 授权可能已保存，但初始化或后续同步未完成。页面保留错误提示，可重试或重新连接；不要只凭“已连接”判断成功。 |

参照 [Google OAuth 文档](https://developers.google.com/identity/protocols/oauth2/web-server)、[Calendar 错误处理](https://developers.google.com/workspace/calendar/api/guides/errors) 与 [事件创建](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)。

## 回归验证

- `pnpm run ci`：格式、治理、lint、类型、静态检查、根测试、Web 测试、生产构建。
- Calendar 服务测试覆盖初始化失败清除误写的成功时间、刷新授权失效，以及隐私锁/暂停/读取权限关闭时不访问 Google。
- OAuth 测试覆盖缺少/超出 scope、刷新时 scope 省略和缩减。适配器测试覆盖稳定事件 ID 的重复插入恢复、远端修改或取消后的显式冲突，以及事件归属不匹配时拒绝恢复。
- 新创建操作以操作 UUID 的十六进制形式作为 provider ID；相同操作重试复用 ID。Google 返回 409 时只读取并核对归属与内容，不重新插入或覆盖远端事件。
- 首次镜像每批最多 50 个事件，批量读取已有投影和本地 Action，再按稳定键 upsert。游标仅在整页处理成功后推进，产品日历继续逐项核对同步冲突。121 个合成事件的回归测试固定为三批，并检查取消事件保留元数据、外部 Action 标记不能取得本地写入归属。
- 真实 Google 授权、双向改时间、自然定时与手机验收需单独记录，单元测试通过不能替代真实连接成功。
