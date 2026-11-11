# 协作与 Sprint 工作流

本文件说明人和 Agent 如何从 GitHub 获取任务、如何在本地运行、以及一个任务怎样才算完成。产品边界仍以 `docs/PRODUCT_SPEC.md` 和 `AGENTS.md` 为准；本文件只管“怎么协作”。

## 1. 任务来源

- **唯一任务来源是 GitHub Issues**：<https://github.com/ruxuanl/MFIN-OS/issues>。
- 每个 issue 是一个可独立交付的 ticket，正文包含背景、范围、不做、验收标准、依赖和参考。
- 只做**当前 Sprint 内**且**状态为 ready** 的 issue。列入 Sprint 即视为产品负责人已批准实施。
- issue 正文与仓库文档冲突时，以 `PRODUCT_SPEC.md` 和 `DECISIONS.md` 为准，并在 issue 中评论指出冲突。

## 2. 标签

| 类别 | 标签 | 含义 |
|---|---|---|
| Sprint | `sprint-1`、`sprint-2`、`backlog` | 所属 Sprint；`backlog` 表示尚未排期 |
| 状态 | `status:ready` | 依赖已满足，可以领取 |
| | `status:in-progress` | 已有人领取 |
| | `status:review` | PR 已提交，等待验收 |
| | `status:blocked` | 需要决策、外部条件或依赖未完成 |
| 领域 | `area:infra`、`area:perf`、`area:search`、`area:apply`、`area:workflow`、`area:source` | 所属模块 |

没有标签权限的协作者可以用标题前缀识别，例如 `[S1][search]` 表示 Sprint 1、检索领域。

## 3. 领取与交付流程

1. 在 issue 列表筛选当前 Sprint 和 `status:ready`，按 issue 编号从小到大优先领取（编号顺序即依赖顺序）。
2. 在 issue 下评论“领取”，改标签为 `status:in-progress`。
3. 从最新 `main` 建分支：`feat/<issue号>-<简短英文主题>`，例如 `feat/7-application-package`。
4. 按 `AGENTS.md` 的阅读顺序读完相关文档后再动手；只改该 issue 范围内的内容。
5. 提交格式：`<type>(<scope>): <summary>`，见 `CONTRIBUTING.md`。
6. 提交 PR，描述里写 `Closes #<issue号>`，并按 PR 模板填写验证结果；改标签为 `status:review`。
7. 产品负责人验收后合并；未通过的在 PR 中说明原因，退回 `status:in-progress`。

一次只做一个 issue。发现需要额外工作时，新开 issue 放入 `backlog`，不要顺带实现。

## 4. 就绪定义（DoR）

issue 进入 `status:ready` 前必须满足：

- 范围、不做和验收标准写清楚，能在一周内完成。
- 依赖的 issue 已合并，或明确可以并行。
- 所需决策已在 `docs/DECISIONS.md` 中确认。
- 不需要真实账号、真实个人数据或 Production 权限。

## 5. 完成定义（DoD）

- 满足 issue 中全部验收标准。
- `pnpm run ci` 通过（格式、治理、lint、类型、静态检查、测试、生产构建）。
- 数据库变更只新增迁移，并在隔离 Test 项目用合成数据验证；涉及权限的变更附 RLS 与函数权限矩阵测试。
- 隐私锁、权限关闭和失败路径已验证。
- PR 写明改了什么、验证了什么、没做什么、剩余风险。
- 涉及行为或约束变化时，同步更新 `docs/` 中对应文档。

## 6. 停止条件

遇到以下情况，在 issue 中评论说明、标记 `status:blocked` 并停止：

- 需要 `AGENTS.md` 第 5 节禁止的能力（自动投递、发送邮件、联系他人、登录招聘平台等）。
- 需要尚未确认的产品或技术决策。
- 需要真实账号、真实个人数据、Production 部署或付费资源。
- 验收标准无法达成，或评测指标不达标。

## 7. 本地运行

### 7.1 前置条件

- Node.js 22 以上；pnpm 11（Windows 上通过 `corepack pnpm` 使用，无需管理员权限）。
- 一个**你自己的**隔离 Supabase 项目作为 Test 环境（D33）。不要使用他人的 Test 或 Production 项目。

### 7.2 只看界面（mock 模式）

在 `apps/web/.env.local` 写入：

```text
AUTH_MODE=mock
APP_ENV=development
APP_BASE_URL=http://localhost:3000
```

mock 模式使用虚构身份，所有数据为空，只能检查界面，不能验证功能、搜索或性能。

### 7.3 连接自己的 Test 环境

1. 在 Supabase 创建新项目，按文件名顺序应用 `supabase/migrations/` 下全部迁移。
2. 在 Supabase Auth 启用 Google 登录，并把自己的登录邮箱写入单用户白名单（只保存 SHA-256 摘要）。在 SQL Editor 执行，邮箱换成自己的：

   ```sql
   insert into private.auth_signup_allowlist (email_hash)
   values (pg_catalog.sha256(pg_catalog.convert_to(lower(trim('you@example.com')), 'UTF8')));
   ```

   然后在 Auth Hooks 中把 Before User Created 指向 `public.before_user_created_single_user`。数据库只允许一个用户，必须使用空项目。
3. 在 Google Cloud 创建 OAuth Web Client，回调地址加入：
   - `https://<项目 ref>.supabase.co/auth/v1/callback`
   - `http://localhost:3000/api/calendar/oauth/callback`
   - `http://localhost:3000/api/gmail/oauth/callback`
4. 参考根目录 `.env.example` 填写 `apps/web/.env.local`，不要设置 `AUTH_MODE=mock`。
5. 灌入合成数据（见 Sprint 1 的合成数据 issue），不要导入真实邮件、简历或 JD。

### 7.4 启动

- Windows：双击根目录 `start-local.cmd`，或在仓库根目录运行 `powershell -ExecutionPolicy Bypass -File scripts\windows\start-local.ps1`。脚本默认使用 npmmirror 源；设置环境变量 `MFIN_REGISTRY` 可改回官方源。
- macOS / Linux：`pnpm install --frozen-lockfile`，然后 `pnpm dev`。
- 打开 <http://localhost:3000>。

### 7.5 检查

- 全量检查：`pnpm run ci`。
- 只跑测试：`pnpm test`。

## 8. Sprint 节奏

- Sprint 为期一周，Sprint 1 从 2026-11-12 开始。
- Sprint 开始时由产品负责人确认本 Sprint 的 issue 和目标；结束时验收已合并的 issue，未完成的移入下一 Sprint 或 `backlog`。
- Sprint 目标和范围以 GitHub issue 为准；编号索引见 `docs/adr/0009-job-search-enhancement-plan.md` 第 6 节，不在本文件重复维护任务清单。
- 在仓库维护者创建标签之前，以标题前缀 `[S1]`、`[S2]`、`[Backlog]` 区分 Sprint。
