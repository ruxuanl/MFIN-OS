# 日报与周报（本地电脑）

用户在 2026-11-15 授权晨晚合并为日报、DeepSeek 总结、定时 PDF 与历史档案。入口 `/review`；2026-11-16按用户反馈改为每个日期一条记录，默认仅展示摘要与主题；同日版本合并到一框，旧版折叠，点击“打开源文件”在新标签页阅读归档PDF；默认日报 22:30、周日周报 20:00，Asia/Shanghai。旧规则报告保留在折叠区，当前用户旧三类计划已关闭。首页旧生成入口转到新日报；原今日行动快照仍是历史规则数据，不冒称已被 AI 更新。

`scripts/windows/install-reports.ps1` 安装 MFIN-OS-Reports，每五分钟检查保存的时间；电脑和 3000 本地服务需运行。错过的当天任务可补一次，不追溯补生成其他日期。任务失败不自动重复付费，由页面手动重试。生成中断遗留 `generation.lock` 时，先确认没有运行中的生成请求再移除该用户目录的锁；不得清理其他档案。

本地环境配置 REPORT_OWNER_ID、REPORT_SCHEDULER_SECRET，后者仅供受保护内部接口；不得提交密钥。正式历史内容与 PDF 位于忽略目录 `work/report-archive/<owner>/`，不在 public，不跨设备同步；备份应保留整个目录，迁移电脑时需一并迁移。Python 3 与 ReportLab 为本地 PDF 依赖，Windows 使用 PYTHONUTF8=1。

每份包含截止、范围、模型、摘要、分色模块和来源。仅收集必要的任务、时间线、求职状态、课程、净化邮件摘要、日程与新增材料名称，不发送完整邮件、简历正文或凭据。来源设上限，达到上限明确给 AI 截断标记；缺失记录不等于未发生。报告不会更新行动、日历或提交申请。

service-only report_ai_work 同时检查报告权限、AI 总开关与隐私锁，沿用共享 HK$100 月预算、预留/结算及审计；请求前和落盘前复核权限变化。超时保留不确定费用。模型结果先保存 pending JSON，PDF 失败重试复用，不重复模型请求。成功 PDF 后才列入档案，版本均保留。PDF 阅读（`?view=1`，inline）需登录并按当前用户隔离目录；显式下载（attachment）需登录且十分钟内重新验证；未满足返回 403，重新登录再下载。

检查：`node scripts/report-scheduler.mjs`；状态 `work/report-archive/scheduler-status.json` 与用户目录 attempt 文件；Windows Get-ScheduledTaskInfo。仅内部接口允许配置 owner，浏览器不能指定他人。接口不输出正文或原始模型错误。

定向验证：archive-model.test.ts、archive.test.ts、model.test.ts；Test 数据库回滚验证 report-ai.sql；页面用无密钥合成副本检查浅/深与 1100/1440，真实数据不作仓库夹具。PDF 渲染后人工检查所有日报页面。
