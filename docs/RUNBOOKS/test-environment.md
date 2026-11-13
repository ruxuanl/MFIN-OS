# 运行手册：搭建自己的隔离 Test 环境

对应 issue #7 与决策 D33。每位开发者使用**自己新建的** Supabase 项目和 Google OAuth 客户端，只放合成数据。不要使用他人的 Test 或 Production 项目，也不要把任何密钥写进仓库、issue、PR 或聊天。

## 1. 新建 Supabase 项目

1. 在 Supabase 新建一个**空项目**（区域推荐新加坡，与 D04 一致）。数据库只允许一个用户，必须是空项目。
2. 记下项目 ref（`https://<ref>.supabase.co` 中的 `<ref>`）。

## 2. 应用全部迁移并写入白名单

在仓库根目录运行（邮箱换成你自己用来登录的 Google 邮箱）：

```bash
# macOS / Linux
MFIN_ALLOWED_EMAIL=you@example.com node scripts/test-env/build-bootstrap-sql.mjs
```

```powershell
# Windows PowerShell
$env:MFIN_ALLOWED_EMAIL = "you@example.com"; node scripts/test-env/build-bootstrap-sql.mjs
```

脚本会生成 `work/test-env/bootstrap.sql`（已被 git 忽略），内容是按文件名顺序拼接的全部迁移，加上白名单插入语句。白名单只写入邮箱的 SHA-256 摘要，文件里不会出现邮箱明文。

然后任选一种方式执行这个文件：

- **SQL Editor**：在 Supabase 控制台 SQL Editor 新建查询，粘贴文件全部内容并运行。
- **psql**：`psql "<你的数据库连接串>" -v ON_ERROR_STOP=1 -f work/test-env/bootstrap.sql`。连接串在控制台 Connect 页面，只在本机终端使用。

执行失败时，记下报错所在的迁移文件名（文件中以 `-- >>> 文件名` 分隔），在 issue #7 中评论。不要修改已有迁移；需要修复时新增迁移。

## 3. 启用单用户注册限制

Supabase 控制台 → Authentication → Hooks → Before User Created，选择 Postgres 函数 `public.before_user_created_single_user`。启用后，白名单以外的邮箱注册会返回 403。

## 4. Google OAuth

1. 在 Google Cloud 新建项目和 OAuth 同意屏幕（测试模式即可，测试用户填你自己的邮箱）。
2. 新建 OAuth 客户端，类型为 Web application，Authorized redirect URIs 填：
   - `https://<ref>.supabase.co/auth/v1/callback`
   - `http://localhost:3000/api/calendar/oauth/callback`
   - `http://localhost:3000/api/gmail/oauth/callback`
3. Supabase 控制台 → Authentication → Providers → Google：填入客户端 ID 与密钥并启用。
4. Supabase 控制台 → Authentication → URL Configuration：Site URL 填 `http://localhost:3000`，Redirect URLs 加入 `http://localhost:3000/auth/callback`。
5. 如需在 Test 中联调 Calendar 或 Gmail，在 Google Cloud 启用对应 API。Gmail 只允许 `gmail.readonly`（D11）；联调只用测试数据，不同步真实个人邮箱或日历。

## 5. 本地环境变量

复制根目录 `.env.example` 的结构到 `apps/web/.env.local`，填入：

| 变量 | 来源 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API Keys，publishable key |
| `SUPABASE_SECRET_KEY` | 同上，secret key（只放在本机，不进浏览器、仓库或聊天） |
| `GOOGLE_CALENDAR_CLIENT_ID` / `_SECRET` | 第 4 步的 OAuth 客户端（Gmail 未单独配置时会复用） |
| `GOOGLE_CALENDAR_REDIRECT_URI` | `http://localhost:3000/api/calendar/oauth/callback` |
| `GOOGLE_GMAIL_REDIRECT_URI` | `http://localhost:3000/api/gmail/oauth/callback` |

不要设置 `AUTH_MODE=mock`，否则不会连接 Supabase。

## 6. 验证

1. 启动本地服务（Windows 双击 `start-local.cmd`；其他系统 `pnpm dev`）。
2. 打开 <http://localhost:3000>，用白名单邮箱完成 Google 登录，能进入首页。
3. 用另一个 Google 账号尝试登录，应被拒绝且 Supabase Authentication → Users 中没有新增用户。
4. 在 issue #7 中勾选验收项，并记录迁移是否一次通过。

## 6.1 灌入合成数据（#8）

先在本地应用里登录一次（数据库里要有这个唯一用户），然后在仓库根目录运行：

```bash
pnpm test-env:seed
```

脚本会生成两份已被 git 忽略的文件：

- `work/test-env/seed.sql`：约 200 个岗位（实习与秋招各半，含 JD 原文）、80 个候选、300 条 Gmail 最小投影和 150 个日历事件。全部是虚构公司和示例文本，不含真实邮箱或电话。
- `work/test-env/unseed.sql`：只删除种子创建的数据（按固定 ID），以及种子新建的占位日历连接。

在 SQL Editor 执行 `seed.sql` 即可；重复执行不会产生重复数据。不再需要时执行 `unseed.sql`。

说明：

- 种子数据不包含简历文件。简历版本必须对应私有存储里的真实文件，请在“材料”页上传一份虚构简历。
- 日历事件挂在一个只读的“合成示例日历（seed）”下；如果还没有 Calendar 连接，会创建一个状态为“已断开”的占位连接，`unseed.sql` 会删除它。

## 6.2 实测记录与常见坑（2026-11-14，#7）

首次在真实 Supabase 上按本手册搭建并验证通过：

- 81 个迁移作为一个整体在 SQL Editor 一次跑通（约 58 万字符，约 20 秒）。执行时弹出“destructive operations / tables without RLS”提示，选 **Run without RLS**：空库上的“破坏性”语句只是迁移自身的约束调整，RLS 由迁移逐表开启。核对结果为 57 张 public 表全部启用 RLS，白名单 1 行，`skills_dict_v1` 44 条，pg_cron 任务 7 个。
- Before User Created Hook 选 `public.before_user_created_single_user` 后启用。实测其他邮箱返回 403；已有用户之后，同一白名单邮箱再次注册也返回 403。
- 灌入合成数据后，触发器生成搜索文档 530 条、岗位技能 1026 条、公司 12 个、邮件关联建议 15 条。以该用户身份经 RLS 调用：搜索“投行”38、“python”49、邮件“面试邀请”50，与本地数据库测试一致。

常见坑：

- **区域**：新建项目时选笼统的 “Asia-Pacific” 可能落到悉尼。要新加坡请点 “Need a specific region?”。
- **Redirect URLs**：应用发起登录时带 `?next=…`，除 `http://localhost:3000/auth/callback` 外，再加一条 `http://localhost:3000/auth/callback**`。
- **Google 登录不能在 Claude 桌面应用的内置浏览器里完成**：它不允许外部页面跳回 `localhost`。请在 Edge 或 Chrome 里打开 <http://localhost:3000> 登录。
- **Google 客户端密钥**：在新版 Google Auth Platform 中，密钥通常只在创建时显示一次。窗口较窄时，“Add secret”收在客户端详情页右上角 ⓘ 打开的侧栏里。
- **SQL Editor 粘贴**：直接用记事本打开 `bootstrap.sql` 或 `seed.sql`，全选复制后粘贴即可；若浏览器卡顿，可按迁移边界拆分，分几次执行。
- **`.env.local` 删除 `AUTH_MODE` 行后**：旧版 `start-local.ps1` 会报“无法对 Null 数组进行索引”，已在 #41 修复。
- 每日 Gmail / Calendar 同步等定时任务会调用已部署站点的 HTTPS 地址，本地收不到，在 Test 中会持续报错但无影响；请使用页面上的手动同步。

## 7. 已知限制

- 定时任务（Gmail、Calendar 增量同步、岗位来源）会调用已部署站点的 HTTPS 地址，本地 `localhost` 收不到。Test 环境中这些定时任务保持未配置，使用界面上的手动同步。
- 每日自动搜岗保持暂停（当前维护授权），来源适配器只在回滚事务中验证。
- Supabase 免费套餐最多两个活跃项目；不要为此暂停或删除他人的项目。

## 8. 清理

不再需要时直接在 Supabase 删除整个 Test 项目，并在 Google Cloud 删除对应 OAuth 客户端。
