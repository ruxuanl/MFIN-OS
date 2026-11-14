# 主应用本地面试工作区

## 范围

用户于2026-11-15明确要求将#53独立原型接入主应用并合并。桌面“资料与工具”和手机“更多”增加模拟面试；`/interview` 使用主应用会话，页面和API均位于同一origin，不再要求手动运行3210。

这次仅将知识库、语音练习和PDF复盘接入本地工作台。真实DeepSeek生成、AI出题/评分/标答仍关闭。主产品真相源见[产品规格](../PRODUCT_SPEC.md)、[决策记录](../DECISIONS.md)；原型限制见[说明](../../experiments/interview-copilot/README.md)。

## 配置

主应用 `.env.local` 设置 `INTERVIEW_LOCAL_ENABLED=true`、`APP_ENV=development`。需要Node24、Python和原型requirements中的依赖。默认按登录用户ID在原型的runtime-data/owners中保存；本地模型按原型说明安装。

可用服务器配置 `INTERVIEW_LOCAL_MODEL_ROOT` 指向现有模型缓存。复用本人旧原型材料时，必须同时配置 `INTERVIEW_LOCAL_OWNER_ID` 和 `INTERVIEW_LOCAL_DATA_ROOT`；只有匹配的已登录用户才可使用该目录，其他用户仍使用独立目录。不要同时运行两个引擎写同一SQLite。上述目录不可提交。

APP_ENV=production或VERCEL环境始终拒绝启动本地引擎；未明确启用时展示说明，不假装云端已经可用。云端存储/运行时适配与部署需另行实施。

## 服务与权限

`/api/interview-runtime/[[...path]]` 逐请求验证主应用会话、隐私锁；写请求校验Origin及自定义头，上传还检查既有files.upload权限。候选只读当前用户的实习候选池，简历只读未归档文档对应版本，不使用示例数据填补空列表。

本地Node引擎在同一个进程内按owner惰性启动，只监听随机loopback端口；仅由已鉴权的主应用适配器转发固定本地请求，不接受外部目标URL。内部页面使用同源子工作区，路径、脚本、上传、来源和PDF链接都落在主应用API前缀。只为面试页面及子工作区开放同源麦克风，其他页面保留默认拒绝策略；禁止跨站嵌入。

本地数据仍由原型隐私锁和删除链路保护。主应用隐私锁在每次代理请求前复核；尚未提供云端加密对象存储或多实例共享，因此不能视为生产级云端材料服务。

## 验证

主应用路由测试覆盖未登录、本地功能关闭、主隐私锁、CSRF、无上传权限、IPv4别名及同源资产/owner传递。浏览器使用隔离mock身份，验证桌面/手机入口、子工作区导航、上传/索引/检索/引用和实际麦克风Permissions Policy；请求不依赖3210。

原型继续执行6项领域回归与30个合成检索用例；主仓库完整CI单独执行。真实账号选择只读现有Test数据，不产生AI费用。
