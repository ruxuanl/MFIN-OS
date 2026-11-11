# 贡献与仓库工作流

本仓库是单用户产品，但仍使用可审计的分支与提交规则。

## 分支

- `main`：只保存已经验收合并的稳定状态。
- `feat/<issue号>-<topic>`：功能或修复分支，对应一个 GitHub issue；文档类可用 `docs/<topic>`。
- 历史 `codex/<milestone>-<topic>` 分支保留不改。
- 一次只推进一个 issue；任务来源与流程见 `docs/SCRUM.md`。

## 提交

提交格式：`<type>(<scope>): <summary>`。

允许的 `type`：`docs`、`chore`、`test`、`feat`、`fix`、`refactor`、`security`。

每次提交应：

- 只包含当前 issue 相关变更。
- 不包含真实凭据、真实邮件、简历、微信截图或课程文件。
- 通过 `pnpm run ci`。
- 在说明中标记尚未验证的真实设备或外部服务行为。

## 合并与验收

- 通过 PR 合并到 `main`；PR 描述写 `Closes #<issue号>`，并写明改了什么、验证了什么、没做什么和剩余风险。
- `main` 应启用 CI 必须通过和禁止强制推送。
- 产品负责人验收后合并；完成定义见 `docs/SCRUM.md`。
