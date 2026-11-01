# 港大 MFin 个人系统

单用户的学业、实习、秋招、邮件与日程个人系统。当前维护以 PROJECT_STATUS.md 和 docs/DECISIONS.md 为准。2026-11-11 已退役微信功能，修复版本仍需正式发布和真实运行验收。

## 开始前必读

任何设计或实施任务均按以下顺序读取：

1. `AGENTS.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/IMPLEMENTATION_PLAN.md`
4. `docs/DECISIONS.md`
5. 当前里程碑相关 ADR 与治理文档

## 已确认技术底座

- iPhone 可安装 PWA＋电脑 Web App
- TypeScript＋Next.js
- Supabase 托管 PostgreSQL、Auth 与 Storage，数据区域优先新加坡
- Vercel 托管 Web/PWA
- 开发阶段优先免费套餐；接入真实数据前重新确认备份、可靠性与费用

隔离的 Supabase（新加坡）与 Vercel 测试资源已创建。后台任务目前只有持久化状态底座；实际 Worker 运行方式将在需要定时自动化前单独确认。

## 本地治理检查

要求 Node.js 22+ 与 pnpm 11+。无需安装项目依赖即可运行：

```bash
pnpm run ci
```

该命令检查文本编码与结尾、治理与密钥边界、M2/M3 迁移安全约束、领域规则、ESLint、TypeScript 和生产构建。

## 当前边界

- 不得提交真实密钥、令牌、验证码或账号数据。
- 测试默认只用合成/匿名化数据。
- 第一阶段不包含微信后台监测、受限招聘平台自动登录、发送消息或自动投递。

## 工作流

- 稳定分支：`main`
- 工作分支：`codex/<milestone>-<topic>`
- 提交格式：`<type>(<scope>): <summary>`，例如 `docs(m0): record hosting decision`
- 完整规则见 `CONTRIBUTING.md`。

## History

Commit dates in this public repository are reconstructed and do not represent actual development activity. Pull request dates reflect actual GitHub activity.

