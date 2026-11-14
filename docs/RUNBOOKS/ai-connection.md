# AI 接入与迁移

适用于用户已明确选择的 OpenAI 或 DeepSeek。这里只配置服务器变量，不修改数据库权限、隐私锁或月度 HK$100 上限。真实材料只在用户明确选择且产品权限有效时发送；联调使用合成内容。

## 提供商与密钥

在忽略的 `apps/web/.env.local` 或正式部署的服务器环境设置 `AI_PROVIDER=openai` 或 `AI_PROVIDER=deepseek`。默认保持 OpenAI。两组密钥完全独立；选中一组缺少配置时停止，不向其他提供商回退，也不复用另一组 Key。正式部署需另行明确授权。

每组均有 `API_KEY`、`ANALYSIS_MODEL`、`INPUT_USD_PER_MILLION`、`OUTPUT_USD_PER_MILLION`、`USD_HKD_RATE` 和 `REQUEST_RESERVE_HKD_CENTS`，前缀分别为 `OPENAI_`、`DEEPSEEK_`。密钥不得加 `NEXT_PUBLIC_`、发到聊天、记录日志或提交版本控制。配置模板见根目录 `.env.example`。

端点在适配器配置中绑定官方主机：OpenAI 为 `https://api.openai.com/v1`，DeepSeek 为 `https://api.deepseek.com`。不接受任意 Base URL，不自动跨提供商重试。缓存指纹包含提供商与模型，切换后不会误用其他模型的分析。

## DeepSeek 模式

使用 `deepseek-flash` 或 `deepseek-v4-pro`，通过 Responses API 请求 JSON Schema，`store=false`、非思考模式、有界输出，SDK 自动重试关闭。只发送当前选中的 JD、简历文字和适用的申请问题，不发送邮箱或日历。

请求同时在指令中明确完整 JSON Schema，并在服务器校验实际结果。截断、无效 JSON、缺字段或计费不确定的网络失败不归档为成功，也不自动重试；保留本次预算预留并显示待确认提示，避免已发生的费用被错误释放。明确的调用前拒绝（如余额不足）才允许按失败路径释放。保留的预留需结合供应商用量人工核对，不自动清空。

PDF/DOCX 使用已提取的文本，不上传原始文件到 DeepSeek。没有可用文本时拒绝调用。简历分析的 `layoutScope=content_only`、`layoutScore=0`（未评估），页面显示“排版未评估”，不把文本模式冒充视觉评估。

2026-11-14 核对的 DeepSeek 官方美元计价：Flash 高峰未缓存输入 $0.30/百万 tokens、输出 $1.20/百万 tokens；低峰为一半。配置使用高峰、未缓存价格保守计入预算，不假设享受折扣。示例 USD/HKD 预算换算率 `8` 是保守核算系数，不是实时外汇报价；示例单次预留 `200` 港分。部署前重新核对价格与换算，额度不足、预算或权限拒绝时均不得放宽限制。投递包仍按输入大小计算预留。

官方参考：[价格](https://api-docs.deepseek.com/quick_start/pricing/)、[Responses 兼容性](https://api-docs.deepseek.com/guides/responses_api/)、[账户余额](https://api-docs.deepseek.com/api/get-user-balance/)。

## 验收顺序

1. 用户本人登录官方平台创建独立 Key；以本机密码框或服务器密钥设置保存，不读取剪贴板。
2. 用选中提供商的 Key 向固定官方模型/余额接口检查连接。没有余额时由用户本人小额充值。
3. 合成内容调用验证结构化回复、token 用量、PDF 文本模式、JD 匹配和草稿；这些适配器诊断费用在提供商账户发生，不能冒称已验证产品预算落账。
4. 运行自动检查及构建；构建前确认同项目服务已停止，完成后重新启动。
5. 登录产品，使用合成材料完成上传→AI 分析→预算入账→刷新→相同输入缓存，并核对关闭权限/隐私锁前置拒绝。第 3 步不替代此项。
6. 正式迁移须重新配置服务器密钥与模型/价格、重建并重测，不复制本机环境文件或自动扩大数据权限。

现有数据库升级时，在启用新代码前应用新增迁移 `20261114085908_deepseek_provider_accounting.sql`。它允许两种服务商标签，并新增显式提供商预留 RPC；继续调用原预算/权限函数，不改变 HK$100 跨服务商总上限。已有模型明确为 DeepSeek 的记录只修正提供商标签，不修改结果、费用或追加审计历史。原三参数预留 RPC 保持兼容。

隔离单用户 Test 可执行 `tests/db/deepseek-provider-accounting.sql`，核对提供商预留、跨服务商预算、无效提供商和未登录拒绝；所有测试写入回滚。该脚本要求 Test 仅有一个用户且正常 AI 权限有效，不在正式库运行。
