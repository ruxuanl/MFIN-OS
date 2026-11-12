# M2-M7 与岗位发现 V0 数据模型

本文件记录 M2-M7 已落地的数据底座；后续里程碑只在各自获批后扩展。

## 权限与连接

- `capability_definitions`：23 项允许配置的能力注册表；永久禁止的发送、联系、投递、申请提交和 Offer 决策由数据库约束拒绝。
- `capability_dependencies`：能力依赖图，例如邮件分析依赖 Gmail 同步与 AI 分析。
- `permission_grants`：关闭、仅本次、24 小时或持续授权；仅本次必须绑定 `operation_id`。
- `privacy_locks`：服务器权威的一键隐私锁；解除要求锁定后产生的新认证证明。
- `external_connections`：只保存连接状态、范围和错误码，不保存令牌。
- `private.secret_references`：只保存受控密钥存储的引用元数据，不保存明文密钥；私有 schema、RLS、无客户端策略。

## 证据、审计与撤销

- `evidence_refs`：来源定位、哈希、必要摘要及核验时间。
- `audit_events`、`audit_event_evidence`：追加式操作、结构化差异、权限判定、结果和证据关联。
- `field_locks`：用户手动字段锁及解除历史。
- `undo_operations`：补偿操作、有效期与执行结果。

审计、撤销和任务 JSON 载荷限制大小，并递归拒绝令牌、密码、验证码、完整邮件正文和材料正文等敏感键。

## 持久化任务底座

- `automation_runs`：幂等键、权限快照、排队/运行/取消请求/完成/失败/dead-letter、进度、安全点、有限重试和错误码。
- `automation_attempts`：每次执行尝试的追加记录。

隐私锁或权限失效后，排队任务立即变为 `cancelled`，运行任务变为 `cancel_requested`，由 Worker 在最近安全点结束。M2 不锁定定时 Worker 供应商，也不连接任何后续外部数据源。

## 访问模型

- 所有 `public` 表显式启用 RLS，并显式授予 `authenticated` 所需的最小 Data API 权限；`anon` 没有表权限。
- 用户数据按 `auth.uid() = user_id` 隔离；系统注册表仅允许登录用户读取。
- 内部触发器位于未暴露的 `private` schema；需要提升权限的触发器固定输入、锁定 `search_path`，且不向客户端开放执行权限。
- 浏览器和服务器共用 Supabase 生成的 `Database` TypeScript 类型。

## M3 工作区

- `opportunity_candidates`：实习/秋招候选池；只有调用显式 promotion RPC 后才产生正式岗位。
- `opportunities`：实习与秋招共用的正式岗位表；`track`、所有者与候选来源在创建后不可变，避免静默串线。
- `courses`：学业长期表，保存课程、模块、状态、时间和备注。
- `actions`、`action_dependencies`：跨岗位、课程和个人上下文的下一步；支持等待方、完成/取消时间戳、优先级与数据库拒绝的循环依赖。
- `timeline_entries`：候选、岗位、课程和 Action 的追加式演进事实。
- `custom_field_definitions`、`custom_field_values`：用户字段定义和值；手动写入同时建立 `field_locks`。
- `saved_views`：工作区筛选、排序和默认视图。
- `client_mutations`、`sync_conflicts`：离线写入幂等记录与待人工处理冲突。

## M3 并发与离线不变量

- 每个可离线编辑对象持有单调递增 `version`；客户端提交 mutation ID、基线版本、基线字段与目标字段。
- 重复 mutation ID 返回既有结果；不同字段可自动合并；同一字段相对基线同时变化时写入 `sync_conflicts`，不覆盖服务器值。
- 冲突解决是新的受审计写入，保留本地值、服务器值、基线值、选择和解决时间。
- PWA 只缓存列表所需的最小快照和 Outbox；数据库提交成功前不把本地写入宣称为服务器事实。
- Realtime 只用于通知客户端刷新，不作为排序、冲突判定或最终状态的事实源。

## JD 粘贴快速建档（实习与秋招）

- `opportunity_candidates.jd_fingerprint`：保存用户粘贴原文的 SHA-256；按用户唯一，保证重复提交返回同一正式记录。
- `opportunities.raw_jd`：最长 50000 字的用户主动粘贴原文；详情页按需展开，不进入普通日志或审计差异。
- `opportunity_candidates.posted_on`、`opportunities.posted_on`：保存 JD 来源页面显示或由相对文案换算出的发布日期；不与系统发现时间或投递日期混用。
- `opportunities.responsibilities`、`requirements`、`application_method`：保存确定性规则识别出的职责、要求和申请方式分段。
- `opportunities.parser_version`、`extraction_confidence`、`extraction_gaps`：记录当前 `jd_rules_v2`、规则初始置信度和仍待核对字段，不把规则输出冒充 AI。
- `import_my_internship_jd`：authenticated-only、`SECURITY INVOKER` 原子 RPC。用户点击保存构成显式追踪确认；事务内创建候选证据与实习长期记录，追加时间线/审计，且绝不执行投递。
- 同一用户与 JD 指纹先取得事务级 advisory lock，再查重和写入；重复请求返回现有 `opportunity_id`，不重复建立候选、岗位或时间线。
- `import_my_jd`（2026-11-12，#11）：在上述约束不变的前提下增加 `target_track`（仅 `internship` / `graduate`），实习页与秋招页共用；审计动作为 `<track>.jd_import`。指纹仍按用户跨两条线唯一，重复粘贴返回原记录及其所属求职线。原 `import_my_internship_jd` 保留不改，供兼容。

## 私有简历库与 AI 分析

- `resume_documents`：用户拥有的逻辑简历，区分唯一激活的通用版 Master 与针对岗位的派生简历；归档不删除历史版本。
- `resume_versions`：不可原位覆盖的具体 PDF/DOCX 版本，记录版本号、私有 Storage 对象路径、哈希、文件类型、大小、抽取字符数和上传时间。每次修改都创建新版本。
- `opportunity_resume_assignments`：把一条岗位精确绑定到一个简历版本，并保留历史；没有专用绑定时，读取层明确回退到最新 Master，而不是复制或猜测版本。
- `ai_analyses`：保存简历分析或 JD＋简历匹配分析的结构化结果、提示版本、模型标识、输入指纹和完成时间。同一用户、分析类型与指纹可复用缓存。
- `ai_usage_events`：在 OpenAI 请求前原子预留港币分成本，完成后记录 token 用量和实际成本；香港时区同月已完成加在途预留不得超过 10000 分。
- `resume-files`：私有 Supabase Storage bucket，仅允许 PDF/DOCX、单文件最大 10 MB。客户端只读本人对象，上传与版本登记通过可信服务器和受控 RPC 完成。
- 简历版本、岗位绑定、分析与成本表对浏览器只授予 owner SELECT；写入包装器为 authenticated-only `SECURITY INVOKER`，内部特权函数位于未暴露的 `private` schema，并重新核验用户、能力授权与隐私锁。

## M4 Calendar 闭环

- `calendar_sources`：测试账号可读日历清单、访问角色、冲突选择和同步水位；仅一项可标为产品日历且必须为 owner。
- `calendar_events`：最小事件镜像、ETag、时间/全天范围、标签和删除墓碑；另存从 Google 私有扩展属性观察到的 `product_owned` 与 `product_action_id`，禁止凭本地关联推断可写所有权。
- `private.calendar_sync_cursors`：按来源保存增量 `syncToken` 与查询指纹；客户端无读取策略，Google 返回 410 时由服务端清除并全量重建镜像。
- `calendar_event_links`：Action 与产品事件的一对一映射、排期、最后同步的 Action 版本和 provider 更新时间。
- `calendar_sync_operations`：幂等创建/更新、有限重试、暂停原因与终态；每个链接最多一个 pending/processing 操作，新排队会安全替代旧 pending 操作。
- `calendar_sync_conflicts`：远端删除、双方并发变化和写保护冲突；只允许用户显式取消排期、重建、采用产品/Calendar 时间或保持只读。
- OAuth access/refresh token 进入 Supabase Vault；`private.secret_references` 仅增加 `vault_secret_id` 引用，不保存秘密值。

面向 Data API 的 Calendar 表只授予登录用户 SELECT，并由 owner RLS 隔离。三项写操作使用 `public SECURITY INVOKER` 包装器调用未暴露 `private` schema 中的定形 `SECURITY DEFINER` 实现；匿名角色不能执行，服务端同步使用 service role 并在每次外部 I/O 前重新计算权限。

## M5 今日行动与报告

- `report_schedules`：每个用户三种报告的启用状态、本地时刻、时区、下次运行、最近结果和错误码。客户端仅 SELECT，通过窄 RPC 修改启用状态与时刻。
- `reports`：晨报、晚报、周报的不可变版本，包含日期、数据截止点、来源健康、策略版本、状态和摘要。
- `report_items`：固定日程、必须事项、规则重点、双线岗位、风险及晚间未完成项；保留排序理由和跳转引用。
- `notifications`：高优先级类型、去重键、原因、投递状态和阅读时间；投递状态由系统持有。

报告不会更新 Action 当前状态。晚间收口通过受控 RPC 追加时间线与审计；只有用户显式选择后才更新 Action。规则报告以 `rules_v1` 标记，不冒充 AI 输出。

## M6 Gmail 与统一收件箱

- `private.gmail_sync_cursors`：保存 Gmail `historyId`；游标失效时回退到有界全量查询，客户端不可读。
- `gmail_messages`：只保存来源身份、分类、必要摘要、行动、日期、置信度和 Gmail 链接，不保存完整正文或原始 MIME。
- `inbox_items`：统一待确认/信息/行动/状态更新队列；低置信内容保持 pending。
- `gmail_attachments`：默认仅链接；显式授权后复制到 10MB 私有桶，并保存 SHA-256 与立即删除状态。
- `gmail_updates`：高置信面试更新对应的原状态、Action、Calendar 队列、审计和撤销引用。

邮件投影、证据、收件箱项与附件元数据由 service-only RPC 在单一事务中写入；客户端只有 owner SELECT。高置信状态更新要求唯一岗位匹配、日期与 `0.98` 置信度，并可补偿撤销。

## M7 微信雷达数据库与控制面切片

- `wechat_allowlist_groups`：用户逐项确认的群身份哈希与启用状态；不保存完整群成员或聊天。
- `wechat_monitor_states`：期望/观测状态、停止代数、新鲜心跳、最后成功与有限环境摘要；未运行不能冒充无新增。
- `private.wechat_scan_cursors`：每个白名单群的私有 capture 游标与内容哈希，客户端不可读。
- `wechat_projections`：本地净化后的公司、岗位、轨道、必要证据、哈希、规则版本和置信度；`ingestion_mode` 区分白名单监测与用户手动导入，手动链接只保存用户提交的 HTTPS 引用；不表示原始截图或完整聊天。
- `wechat_screenshot_intakes`：只保存用户主动提交截图的 SHA-256、白名单 MIME、大小、请求内删除时间与 `ocr_unavailable` 状态；不保存原文件名、存储路径、图片字节或 OCR 文本。
- `inbox_items`：扩展为 Gmail 或微信投影二选一来源；高置信微信 JD 关联候选池，低置信内容仅待确认。

`store_wechat_projection` 仅允许 service role 调用，并在单一事务内重新检查 `wechat.monitor`、依赖授权、白名单身份、新鲜心跳和 stop generation。重复 capture key 幂等返回；任何投影都不能自动 promotion 到实习/秋招长期表。

`create_my_wechat_manual_import` 仅接收文字/链接的最小结构化字段和不超过 1000 字的证据片段，重新检查 `wechat.import`、本地净化依赖与隐私锁。公开函数是 authenticated invoker 薄包装，特权实现位于 `private`；默认产生待确认项，只有用户明确核对或之后接受才创建候选，重复内容哈希幂等返回。

`record_my_wechat_screenshot_intake` 仅允许 trusted Web service 调用，在确认临时原图已删除后才记录元数据，并重新检查 `wechat.import`、`files.upload`、本地净化依赖与隐私锁。浏览器既不能直接写表也不能伪造删除证明；相同用户与内容哈希幂等返回。当前状态固定为 `ocr_unavailable`，不能创建候选或宣称完成提取。

白名单创建、标签/逐群开关及运行/暂停/停止只通过公开 invoker RPC 进入私有特权实现。新群默认关闭；请求启动要求依赖权限与至少一个启用群；暂停、停止和逐群禁用会失效旧 stop generation，并同步更新任务取消状态与审计。

`get_wechat_monitor_assignment` 与 `report_wechat_monitor_heartbeat` 是仅 service role 可执行的公开 invoker 包装器；私有实现返回最小白名单任务并在写心跳时锁定状态、复核权限/隐私锁/启用群/stop generation。环境摘要接受 `synthetic` 或 `visible_ocr_v1`；后者必须声明 Windows Media OCR、只读可见列表鼠标模式，以及键盘、剪贴板、发送能力均为 false。

`pair_wechat_visible_group` 是 service-only public invoker/private definer 配对入口，只接收用户 ID、当前可见群的标题派生哈希、显示标签和微信版本；不接收聊天或截图。新群固定默认关闭，身份冲突拒绝，并追加审计。真实目标群已在隔离 Test 形成唯一记录，后经用户明确授权以临时权限启用。

## 岗位发现 V0 公开来源控制面

- `job_sources`：用户级公开 HTTPS 来源注册表，声明来源类型、域名、覆盖范围、适配器版本、60 分钟至 7 天的最低间隔、审批/启用状态、最近尝试/成功/核验、错误码和覆盖缺口。建议来源默认待审批且关闭，批准不会隐式启用。
- `job_source_runs`：每次只读采集的追加运行记录，关联 `automation_runs`，以 `(source_id, run_key)` 幂等；部分和失败必须记录覆盖缺口，失败还必须记录错误码。
- `private.job_source_cursors`：未来适配器的私有游标与查询指纹；无客户端策略，仅 service role 可读写。

浏览器只读本人来源与运行记录。来源提议、运行开始和运行完成均为 service-only public invoker/private definer 边界；用户审批/启停通过 owner-scoped 窄 RPC。运行开始复核 `job_radar.discovery`、隐私锁、审批、启用、公开访问和最低间隔；完成前权限失效会安全记为取消。当前切片没有真实来源行、外部抓取、候选写入或评分。

## 投递包 v1（2026-11-12，#13）

- `application_packages`：每个用户每个岗位一份（`unique (user_id, opportunity_id)`）。状态 `draft / ready / submitted_recorded / abandoned`；`submitted_recorded` 只能由“我已投递”流程（#14）写入。保存规则推荐的简历版本与理由、用户确认的版本与确认时间、仅 HTTPS 的官方申请链接、建议开始准备日期、截止行动引用和 `package_rules_v1`。
- `application_package_items`：材料清单，`source` 为 `default` 或 `jd_rule`；`jd_rule` 条目保存 JD 原文片段作为依据。
- 两表对 authenticated 只读；写入只经 `create_my_application_package`、`confirm_my_application_package_resume`、`set_my_application_package_item`、`set_my_application_package_status` 四个 invoker 包装，背后为 `private` 下的 SECURITY DEFINER 实现，逐项核对 `auth.uid()`、对象所有权与隐私锁，并追加时间线与审计。
- 创建时若岗位有截止日，同时创建一条 `opportunity` 上下文的截止行动（香港时间 18:00），Calendar 是否写入沿用现有同步规则；建议的准备时间只作为行动的 `suggested_start_at`，不自动写入 Calendar。

## “我已投递”与申请快照（2026-11-12，#14）

- `application_snapshots`：用户在官网提交后点击记录时写入。复制保存公司、岗位、JD 原文、来源链接、确认的简历版本 ID 与名称、材料清单完成情况、可选的申请表答案与申请编号、投递时间，以及记录前的岗位/投递包/截止行动状态（用于撤销）。简历版本只存 ID 与名称，不建外键，后续修改或删除简历不会改写快照。
- 快照不可修改：触发器只允许一次 `active → undone`；同一岗位同时只能有一条 `active` 快照。删除只随岗位或用户的永久删除级联发生。
- `record_my_application_submitted`：岗位须处于“新发现 / 评估 / 准备 / 已投递”；把岗位改为 `submitted`、写入 `applied_at` 与等待对方，把投递包置为 `submitted_recorded`，把截止行动标记完成，并写时间线与可撤销审计。
- `undo_my_application_submitted`：仅当记录之后岗位没有其他修改（版本号一致）时恢复上述三处状态，快照标记为 `undone` 保留为历史；否则拒绝并提示手动调整。


## 统一搜索 v1（2026-11-12，#12）

- `search_documents`：可完整重建的搜索投影，每个对象一行（`unique (object_type, object_id)`），覆盖岗位、未处理候选和非无关的 Gmail 邮件摘要。保存标题、正文（≤8000 字，岗位 JD 原文最多截取 6000 字）、公司、地点、阶段、截止、来源链接、来源类型（`user / jd_paste / public_source / gmail`）、来源时间与索引时间；`search_text` 为生成列。
- 由 `opportunities`、`opportunity_candidates`、`gmail_messages` 上的 AFTER 触发器维护；候选被提升或忽略、邮件被判为无关时删除对应文档。Gmail 只索引主题、发件人摘要、摘要和行动标题，不存在完整正文。
- `search_my_workspace(query, types, track, stage, company, location, deadline_from, deadline_to, limit)`：空格分词（最多 8 个），每个词都必须出现（AND，大小写不敏感子串，两字中文可命中）；首词经 `pg_trgm` GIN 索引缩小候选；排序为标题命中 ×3 + 正文命中 + 标题首词加分。返回 160 字摘录与来源信息。
- `rebuild_my_search_documents()` 只重建调用者本人的投影，不改动源表（不会更新 `updated_at`）。不使用向量（D28）。

## 候选池批量处理（2026-11-12，#18）

- `decide_my_candidates(ids, decision, reason)`：一次 1–100 个候选，`decision` 为 `track / apply / later / dismissed`；`dismissed` 必须带原因。每项在独立子事务中执行，返回 `promoted / updated / unchanged / failed` 与错误码，单项失败不回滚其他项。
- 追踪与准备申请复用 `promote_opportunity_candidate`，重复执行不会产生重复岗位；已进入长期表的候选不能再改为稍后或不考虑。
- 每个被修改的候选各写一条时间线（`decision_changed` 或 `promoted`）和一条审计（`candidate.decide` / `candidate.promote`，`externalAction: false`）；隐私锁开启时整批拒绝。
- 界面：候选卡片多选，提交期间所选卡片乐观显示“处理中”；动作结束后以服务器数据为准，失败项恢复原状并逐项列出原因。

## 截止提醒与晨报 rules_v2（2026-11-12，#19）

- 晨报新增 `deadline`（截止提醒）分区：未投递（`new / evaluation / preparation`）的岗位和未处理候选，在截止前 7、3、1 天及当天进入日报；只按日期分级，不额外推送。
- 即时推送只用于 24 小时内截止（宪法 7.2）：截止日按香港时间 18:00 计（与 #13 投递包一致），类型沿用白名单内的 `deadline_24h`，须 `notifications.smart_push` 授权；`dedupe_key = deadline_24h:<类型>:<id>:<截止日>`，重复扫描不重复入队。`private.enqueue_due_deadline_notifications()` 由 pg_cron 每小时第 7 分执行；生成晨报时也会为本人执行一次。
- 前三项（`focus`）升级为 `rules_v2`：开放行动与未完成投递包（`draft / ready`）统一打分排序；投递包会替代它自己的截止行动，同一岗位不会占两个名额。理由文本标注“规则重点（非 AI）”。
- `reports.generation_strategy` 允许 `rules_v2`；新报告摘要写明规则版本与数据截止时间，界面显示“规则排序 v2 · 非 AI”。

## 邮件与岗位关联（2026-11-12，#17）

- `opportunity_communications`：一封 Gmail 邮件与一个长期表岗位的关联，状态 `suggested / linked / rejected / unlinked`，保存匹配规则、证据片段和 `mail_link_rules_v1`。同一封邮件最多一个 `linked`；同一对邮件与岗位只有一行，因此被拒绝或撤销的组合不会被再次建议。
- 建议由 `gmail_messages` 上的触发器生成（`classification = 'job'`，主题、发件人摘要、摘要或行动标题变化时）。按顺序尝试四条规则，**只在恰好命中一个进行中岗位时**生成建议：发件人域名（取自岗位来源链接，招聘平台和公共邮箱域名除外）→ 公司名（去掉括号注记与“有限公司 / Ltd”等后缀）→ 公司名 + 岗位名 → 岗位名（≥6 字符）。唯一性按全部进行中岗位判断；结果若是用户拒绝或撤销过的组合则丢弃，不退而选择下一个岗位。已被 D23 面试自动更新关联的邮件不再建议。
- `decide_my_communication_link(link, confirm | reject | unlink)`：只有用户本人可执行，隐私锁开启时拒绝；确认与撤销写入岗位时间线（`communication_linked / communication_unlinked`），三种操作都写审计（`stageChanged: false`）。任何操作都不修改岗位阶段，D23 的自动闭环条件没有扩大。
- 界面：收件箱新增“邮件与岗位关联建议”，岗位详情新增“相关邮件”，可撤销关联。

## 技能词典、岗位技能与简历差距（2026-11-12，#16）

- `skill_definitions`（`skills_dict_v1`，D34）：44 个技能，含中英文别名与对应的 PostgreSQL 正则。拉丁字母别名带词边界（`r` 不命中 HR / R&D，`java` 不命中 JavaScript，`wind` 不命中 Windows），中文别名按子串匹配。TypeScript 版本 `apps/web/src/lib/skills/dictionary.ts` 是唯一来源，测试保证两者一致。
- `opportunity_skills`：岗位 ↔ 技能，`source` 为 `rule` 或 `user`，带 80 字以内的命中片段。岗位的岗位名、部门、职责、要求或原始 JD 变化时由触发器重新识别：只替换未锁定的规则行。用户手动添加或移除（`set_my_opportunity_skill`）的行一律锁定，写时间线与审计。
- `private.resume_version_texts`（D30）：简历提取文本，仅数据库所有者可读；上传新版本时保存，旧版本可在岗位详情点击“从简历文件提取技能”。`resume_version_skills` 由文本按同一词典生成。
- 对照简历：岗位当前绑定的简历版本 → 投递包确认的版本 → 有效 Master 的最新版本。`get_my_opportunity_skills` 返回每个技能是否被简历覆盖。
- `companies`：按规范化公司名（去括号注记与“有限公司 / Ltd”等后缀）每用户一行；`opportunities.company_id` 由触发器维护。
- `query_my_opportunities(skills, stages, track, location, company, replied, resume_gap, deadline_within_days)`：结构化多跳查询（岗位 → 技能 → 简历差距 → 关联邮件）。“已回复”指投递后有已确认关联的邮件（#17）、已应用的 Gmail 面试更新，或阶段已到测试 / 面试 / offer / 被拒。`/search` 的“按条件提问”用规则解析器把一句话转成这些条件，并显示解析结果。
