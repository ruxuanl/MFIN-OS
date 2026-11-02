# ADR-0001：第一阶段技术与托管底座

- 状态：已接受
- 日期：2026-08-09
- 对应决策或里程碑：D02、D03、D04、D17、D19；M0

## 背景

产品只服务一个用户，需要在 iPhone 与电脑上同步使用，并降低长期运维和 Apple 平台成本。M0 需要确定工程方向，但不得创建云资源、数据库或外部连接。

## 决定

- 客户端采用 TypeScript＋Next.js 响应式 PWA，同一工程覆盖 iPhone 主屏幕应用与电脑 Web。
- 后端保持 TypeScript 模块化单体边界。
- Supabase 作为 PostgreSQL、Auth 与 Storage 的托管基础，数据区域优先新加坡。
- Vercel 托管 Web/PWA。
- 开发阶段优先免费套餐；接入真实数据前重新确认可靠性、自动备份和付费边界。
- Worker、持久化任务队列和定时调度不在本 ADR 中锁定，在对应自动化里程碑前另行决定。

## 后果

- 不需要 Mac、Xcode、App Store 或 Apple Developer Program。
- PWA 的安装、Web Push、Passkey 和快捷导入必须在真实 iPhone Safari 验收并提供能力降级。
- 供应商能力只能通过适配器和领域边界使用，不能让核心状态机依赖 Supabase/Vercel 专有接口。
- Supabase 项目区域迁移需要新项目与数据迁移，创建 Production 前必须再次确认。
- 免费套餐只用于开发验证，不自动等同于符合真实数据可靠性要求。

## 验证

- M0 只验证决策记录、目录与 CI 治理，不创建供应商账号或资源。
- M1 验证 PWA 能力矩阵和身份边界。
- 真实数据接入前必须完成备份/恢复与费用复核。
