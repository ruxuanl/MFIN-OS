# Gmail 只读连接与验收

依据：D11、D23、ADR-0006。基础 Google 登录、Calendar 授权和 Gmail 授权彼此独立；Calendar 成功不表示 Gmail 已连接。

## 配置与授权

1. 按 [Test 手册](test-environment.md) 配置自己的隔离项目和专用测试账号；真实个人邮箱需要实例拥有者单独授权。
2. 服务器配置 `SUPABASE_SECRET_KEY` 和 Gmail OAuth 客户端 ID、密钥、回调地址。代码支持未单配 Gmail 客户端时回退 Calendar 客户端身份，但两者仍使用独立 scope、state、PKCE 和 Vault 引用。
3. Google Cloud 客户端所属项目需启用 Gmail API，并登记精确回调 `http://localhost:3000/api/gmail/oauth/callback`；部署站点使用自己的 HTTPS 地址。仅把值保存在忽略的本地文件或托管密钥环境。
4. `/status` 中开启 `gmail.connection` 和 `gmail.sync`；隐私锁、依赖权限和有效期继续生效。
5. 在 `/inbox` 使用 Google 重新登录或 Passkey 刷新身份验证，再点击“连接 Gmail”。单纯保持网页登录不等于仍有最近 10 分钟的敏感操作再验证证明。
6. Google 最后同意页面只应申请 `https://www.googleapis.com/auth/gmail.readonly`。如果操作工具要求当次权限确认，先由用户确认，不以先前宽泛授权代替。

客户端返回超出精确只读范围的 token 时不保存本次凭据，应使用独立 Gmail 客户端排查；不能放宽 scope 检查来“打通”。授权回调使用普通整页导航，一次性 Cookie 按原 `/api` 路径清理。

## 连接不等于同步完成

回调成功仅表示只读授权已保存。随后点击“立即同步”，必须观察实际读取结果和持久化游标，不能只看“已连接”。

- 首次范围：最近 30 天收件箱，最多 50 封。后台每批有时间与数量上限，未完成时显示分批进度，可再次同步继续。
- 超出历史上限的补同步需要另外确认范围；不要自动扩展或把旧 D27 的一次授权照搬到另一实例。
- 后续使用 Gmail historyId 增量同步，避免重复导入。同步中断保留检查点。
- 邮件完整正文和原始 MIME 不落库，只保存既定最小投影。发送、回复、归档、删除、标签和已读写入始终不可用。
- 附件复制、规则状态更新、个人事项提取有各自权限，接通 Gmail 不自动扩大这些能力。

## 故障恢复

| 提示/错误 | 处理 |
| --- | --- |
| 需要重新验证 | 刷新 Google/Passkey 身份证明后回到收件箱，再开始连接。 |
| `oauth_state_invalid` | 当前浏览器内重新发起授权，不复用旧回调链接或跨浏览器传递 code/state。 |
| 客户端配置无效 | 核对 Gmail 独立客户端或回退客户端的 ID、密钥和回调。 |
| 授权码已失效 | 重新发起授权；code 只能使用一次。 |
| 权限不符合精确只读范围 | 不保存 token；使用独立 Gmail OAuth 客户端，不申请广泛邮件权限。 |
| 离线凭据不完整 | 重新完成只读同意流程，确认返回 refresh token，不把 token 写进日志。 |
| `gmail_api_403` | 排查 Gmail API 是否在正确项目启用、Google 账号策略、实际 scope 和配额；仅凭 403 不能断言一定是 API 未启用。 |
| `gmail_oauth_invalid_grant` / `gmail_api_401` | Google 授权可能过期或撤销，重新验证后使用“重新连接 Gmail”。 |
| 历史补同步待确认 | 保留当前数据和检查点，先确认额外历史范围。 |

## 尚需独立验收的部分

本地手动同步不证明云端定时正常。本地 localhost 接收不到 Supabase 调用的公网 HTTPS 调度请求；托管部署、调度目标、服务端密钥、自然续跑、手机双端、通知、备份与真实业务自动更新需要分别记录证据。规则提取是 `mail_rules_v1 · 非 AI`，不能写成 AI 邮件理解已上线。
