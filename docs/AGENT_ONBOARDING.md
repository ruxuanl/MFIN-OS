# 给朋友及其 Agent 的上手指南

仓库：<https://github.com/ruxuanl/MFIN-OS>。本文按 2026-11-14 的代码入口整理；实际版本以拉取后的 `main`、根目录 `AGENTS.md` 和对应脚本为准。

## 1. 先选择用途

| 用途 | 环境 | 从哪里开始 |
| --- | --- | --- |
| 先看界面 | 本机 mock，无数据库、无真实数据 | 第 3 节 |
| 协助开发或验证功能 | 自己的隔离 Supabase Test 项目、合成数据、专用 Google 测试账号 | 第 4 节 |
| 自己长期使用 | 自己独立的单用户实例、云资源和账号 | 先完成 Test，再看第 7 节 |

这个应用每个实例只允许一个用户，不是邀请朋友注册同一个站点的多人系统。朋友的 Google 邮箱不能直接登录维护者现有实例；应建立自己的实例，不能关闭单用户限制来解决登录失败。

克隆代码不会带上维护者的数据库、登录权限、Google 授权、AI 密钥或已保存的数据。也不要向维护者索取 `.env.local`、数据库备份、会话 Cookie 或 OAuth 令牌。

## 2. 可以直接发给 Agent 的任务

将下面整段发给朋友自己的 Agent；需要填写账号资料时，由朋友本人私下提供给自己的运行环境。

```text
请在我的电脑上帮我安装并运行 https://github.com/ruxuanl/MFIN-OS 。

目标：先完成本地界面预览，再按仓库指南搭建我自己的隔离 Test 环境，
用合成数据验证功能。当前不部署正式实例，不接入真实个人 Gmail、日历、简历或 JD。

先读取根目录 AGENTS.md，再按它要求的顺序完整读取产品规格、实施计划、
决策和相关运行手册，最后读取 docs/AGENT_ONBOARDING.md。
先检查本机 Git 状态、Node、包管理器、3000 端口和现有环境文件，保留已有改动。

使用我的 Supabase 项目和 Google OAuth 测试客户端。
不要使用仓库维护者的任何 Test/Production 项目、账号或密钥。
密钥只保存在忽略的 apps/web/.env.local 或服务端密钥环境中，
检查配置时只报告变量是否存在，不输出其值，也不要复制到聊天或提交记录。

能在当前授权内完成的本地安装、配置检查和修复请直接执行。
遇到需要我登录、Google 授权、付费或正式部署的步骤，说明具体需要处理的操作，
不要绕过平台的身份验证或权限确认。

按照本指南的验收清单逐项报告“通过 / 未运行 / 阻塞”，
区分 mock、真实数据库、Google 实际连接和生产构建，不能把启动成功当成功能验收。
不要重新启用微信、每日自动搜岗，或实现发送消息、联系他人、自动投递和提交申请。

如果发现代码问题，按 docs/SCRUM.md 和 CONTRIBUTING.md 处理；
没有明确的开发任务时，先完成安装验证，不自行认领其他功能。
```

## 3. 拉取代码并预览界面

需要 Git、Node.js 22+，以及 `package.json` 声明的 pnpm 版本。当前仓库固定为 `pnpm@11.16.0`。Windows 脚本通过 Corepack 使用 pnpm，不要求系统 PATH 中有全局 `pnpm`。

```bash
git clone https://github.com/ruxuanl/MFIN-OS.git
cd MFIN-OS
git status --short
node --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
```

如果本机没有 `corepack`，先安装 Corepack 或按仓库指定版本安装 pnpm，再继续；不要因找不到命令而降级锁文件或改依赖版本。已有仓库先检查未提交改动，再用 `git pull --ff-only` 更新。

仅预览时，在 `apps/web/.env.local` 写入以下三行；已有文件不能直接覆盖，应先保留本地副本：

```dotenv
AUTH_MODE=mock
APP_ENV=development
APP_BASE_URL=http://localhost:3000
```

Windows 双击 `start-local.cmd`；其他系统在仓库根目录执行 `corepack pnpm dev`。打开 <http://localhost:3000>。

mock 只有界面与空状态，没有真实登录和数据写入，不能据此宣布搜索、AI、日历或数据库功能正常。mock 必须用开发模式，不能用 `start-app.cmd`。

## 4. 搭建自己的功能测试环境

完整步骤以 [隔离 Test 环境运行手册](RUNBOOKS/test-environment.md) 为准。按以下顺序执行，不要直接拿维护者的配置试运行：

1. 在自己的 Supabase 账号中新建空的隔离 Test 项目。记录自己的项目 ref，明确它不是维护者或他人的项目。
2. 为自己的测试登录邮箱生成初始化 SQL。下面的示例邮箱必须替换成测试账号；它不会成为维护者实例的白名单。
3. 仅在这个空 Test 项目的 SQL Editor 执行生成的 `work/test-env/bootstrap.sql`。它包含全部迁移和单用户白名单摘要；不能在已有数据或正式数据库上重放全量初始化。
4. 启用 Authentication 的 Before User Created Hook：`public.before_user_created_single_user`。
5. 在自己的 Google Cloud 项目配置 Web OAuth 客户端和测试用户，在自己的 Supabase 中启用 Google 登录。
6. 设置环境变量，移除 `AUTH_MODE=mock`，用白名单账号登录一次。
7. 生成并执行合成种子 SQL，再验证功能。初始占位 Calendar 连接显示“已断开”是正常的，种子没有 Google 授权。

Windows 生成初始化 SQL：

```powershell
$env:MFIN_ALLOWED_EMAIL = "your-test-account@example.com"
node scripts/test-env/build-bootstrap-sql.mjs
Remove-Item Env:MFIN_ALLOWED_EMAIL
```

macOS / Linux：

```bash
MFIN_ALLOWED_EMAIL=your-test-account@example.com node scripts/test-env/build-bootstrap-sql.mjs
```

登录成功后，在仓库根目录生成合成数据：

```bash
node scripts/test-env/build-seed-sql.mjs
```

在自己的 Test 项目 SQL Editor 执行 `work/test-env/seed.sql`。需要移除种子时，先确认项目和范围，再使用同目录的 `unseed.sql`；不要删除自己另外创建的数据。

### 环境变量

参照根目录 [.env.example](../.env.example) 的字段结构，写入本机忽略的 `apps/web/.env.local`。不要把 `.env.local` 放在仓库根目录代替应用目录。

| 能力 | 必需配置 |
| --- | --- |
| 本地站点 | `APP_ENV=development`、`APP_BASE_URL=http://localhost:3000` |
| Google 登录与数据库 | 自己的 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，以及 Supabase 中的 Google provider、白名单和 Hook |
| 服务端日历操作 | 自己的 `SUPABASE_SECRET_KEY`、`GOOGLE_CALENDAR_CLIENT_ID`、`GOOGLE_CALENDAR_CLIENT_SECRET`、`GOOGLE_CALENDAR_REDIRECT_URI` |
| Gmail 测试 | 自己的 Gmail OAuth 配置和 `GOOGLE_GMAIL_REDIRECT_URI`；未单配客户端时，代码可复用 Calendar 客户端身份，但仍独立授权和存储令牌 |
| AI（可选） | `.env.example` 中整组 `OPENAI_*` 服务器变量；不需要 AI 时可以留空，其他基础功能可独立验证 |

不要给任何服务器密钥添加 `NEXT_PUBLIC_` 前缀。`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 是浏览器使用的 publishable key，不能填成 secret/service-role key。

### Google 回调地址

在 Google OAuth Web 客户端登记以下精确地址；`<your-ref>` 替换成自己的 Supabase ref：

```text
https://<your-ref>.supabase.co/auth/v1/callback
http://localhost:3000/api/calendar/oauth/callback
http://localhost:3000/api/gmail/oauth/callback
```

Supabase URL Configuration 的 Site URL 填 `http://localhost:3000`，Redirect URLs 按 [Test 手册](RUNBOOKS/test-environment.md) 同时覆盖 `/auth/callback` 和带 `?next=…` 的回调。不要混用 `localhost`、`127.0.0.1` 和其他端口；改地址必须同步更新配置。

基础 Google 登录不等于 Calendar 或 Gmail 已授权。Calendar 联调继续按 [日历接入手册](RUNBOOKS/calendar-connection.md)：启用 API、开启必要权限、重新验证、连接、手动同步。只写应用创建的日历；Gmail 只允许精确 `gmail.readonly`。

## 5. 日常启动、开发和更新

| 场景 | Windows | macOS / Linux（仓库根目录） |
| --- | --- | --- |
| 修改代码、热更新、mock 预览 | `start-local.cmd` | `corepack pnpm dev` |
| 已配置独立数据库的日常使用 | `start-app.cmd` | 先 `corepack pnpm build`，再 `corepack pnpm --dir apps/web start` |
| 全量检查 | `start-local.cmd -Ci` | `corepack pnpm run ci` |

`start-app.cmd` 会先构建，再运行 `next start`；之后访问新页面不再触发开发模式按需编译。这里的“生产模式”只是本地 Node 运行模式，不代表自动部署了云端正式环境，也不会把 Test 数据库自动变成正式库。

启动、更新或构建前，先正常停止同一项目正在运行的旧服务。3000 端口已占用时先确认进程归属，不要杀掉不明进程、同时启动多个实例或在正在服务的生产构建目录上重新构建。

更新流程：停止旧服务 → 保留本地改动 → `git pull --ff-only` → 安装锁定依赖 → 检查新增迁移 → 在对应隔离环境验证后应用尚未执行的迁移 → 重新构建并启动。已有数据库不能重新执行 `bootstrap.sql` 代替增量升级。

## 6. Agent 的验收与排错清单

按实际完成情况报告，不要把以下项目全部默认勾选：

- [ ] Node 与 pnpm 版本符合仓库要求，工作区现有改动得到保留。
- [ ] mock 预览可打开，且明确未验证真实业务。
- [ ] 自己的 Test 数据库完成迁移、白名单和 Hook 配置；白名单 Google 登录成功，其他邮箱不能新增用户。
- [ ] 合成岗位、候选和日历镜像可见；搜索有结果；未把种子中的断开连接误报为真实 Google 接通。
- [ ] 如在本次范围内：专用 Google 测试账号已实际完成 Calendar 授权和同步，待同步/冲突状态可见；重复同步没有重复事件。
- [ ] 如在本次范围内：暂停、权限关闭、隐私锁与失败路径真实生效。
- [ ] `corepack pnpm run ci` 通过；单独列出跳过的可选 PostgreSQL 集成测试。生产构建成功不等于外部服务联调成功。
- [ ] Git 提交不含环境文件、令牌、生成 SQL、真实个人数据或私有日志；`git status --short` 与 `git diff --cached` 已检查。

| 现象 | 优先检查 |
| --- | --- |
| 登录 403 | 自己的邮箱白名单、是否已有另一个唯一用户、Hook；不要关闭单用户保护 |
| OAuth `redirect_uri_mismatch` | Google 客户端中登记的精确 URI、端口和自己 Supabase 的 ref |
| 登录后返回不了本地页面 | 使用 Edge/Chrome；某些桌面内置浏览器不能完成到 localhost 的回跳 |
| 日历一直“正在连接” | 拉取最新 main；OAuth 入口必须整页跳转；检查服务器安全错误提示，而不是只看按钮 |
| Calendar 授权失效 | 查看日历页重连提示；测试模式授权可能过期，重新验证并授权 |
| 访问新页面时显示 Compiling | 当前是 `next dev`；日常使用切换为已构建的 `next start`，数据库请求耗时另行测量 |
| AI 无法使用 | AI 变量、允许发送的数据、权限、模型/价格配置和预算；不绕过预算，不把真实简历拿来当测试夹具 |
| 本地没有自动同步/自动日报 | 本地网页能打开不代表云端调度已配置；Test 使用手动入口，不能沿用维护者的调度目标或 Vault 配置 |

自动搜岗当前保持暂停，微信已经永久退役。文档里的历史里程碑说明不能作为重新启用这些能力的依据。

## 7. 如果朋友希望长期自用

先完成隔离 Test 验证，再由朋友本人明确授权其 Agent 建立**自己专用**的正式环境、真实账号连接与预算。协助开发的 Test 授权不自动包含这些操作。

正式使用仍是“一个人、一套实例”：自己的 Supabase、Google OAuth 客户端、托管项目和密钥。不要复用维护者的生产域名、项目 ref、白名单、服务器密钥或 OAuth 配置；不要把 Test 种子灌进正式库。

手机和电脑共用云端数据需要自己的可访问 HTTPS 站点，并配置对应域名的登录/OAuth 回调和服务端环境。`localhost` 只指当前设备，朋友的手机无法通过自己的 `localhost:3000` 访问电脑。定时任务、通知、备份、费用与真实数据权限都应分别验证，不能把本地启动成功称为完整上线。

此指南不改变 [产品边界](PRODUCT_SPEC.md)、[已确认决策](DECISIONS.md) 和 [协作流程](SCRUM.md)。如为上游仓库贡献代码，按当前 ready issue 建分支和 PR；没有仓库写权限时使用自己的 fork 提 PR，未经维护者授权不直接合并或部署其正式实例。
