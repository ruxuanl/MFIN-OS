# Interview Copilot

独立本地实验，不在 MFIN OS 主应用运行路径中；未部署、未使用主项目密钥。范围与授权见 [实验目录说明](../README.md)。

## 启动

要求 Node 24+、Python 3.13。Windows 默认使用 `py -3`，其他系统默认 `python3`；非 Windows 需安装中文 TrueType 字体并配置 INTERVIEW_PDF_FONT，见下文。

```powershell
npm ci
py -3 -m pip install -r requirements.txt
npm run setup:model
npm start
```

打开 http://127.0.0.1:3210 。setup:model 首次下载 BAAI/bge-small-zh-v1.5；日常向量推理强制使用本地缓存且禁用 Hugging Face 网络。未装模型时自动降级为关键词检索。模型缓存和业务资料都在忽略的 runtime-data 内。

## 页面与操作

- 首页：模拟面试大卡片，知识库、模拟面试记录两个小卡片。
- `/knowledge`：中信建投实习、中车资本实习、智谱黑客松项目。
- `/knowledge/:id`：多文件上传 → 原文预览 → 确认索引 → 知识问答。
- `/interview/setup`：选择岗位、简历版本和知识库。岗位与简历仍为显式示例数据。
- `/interview/sessions/:id`：语音作答、题型计时、转写校对、六题上限、规则反馈。
- `/records`：面试记录搜索、复盘、PDF 下载。

## 材料与版本

支持文本型 PDF、DOCX、UTF-8 TXT/Markdown。单文件10 MB；PDF最多200页；抽取文字最多50万字符；每知识库50份材料版本和5000片段。扫描/加密PDF、类型不符、异常DOCX拒绝，不做OCR。

原件保存在 files，以随机ID命名；PDF保留页码，DOCX保留正文和表格中的段落编号，不承诺版式、图片、批注、页眉页脚完整提取。抽取后待本人确认，再进入 indexing/ready；索引失败可重试。批次内上传逐文件处理。

同项目按原始文件SHA256去重，同名新内容保存为新版本。检索默认选每份材料最新已就绪版本；新版未确认/索引中时，旧版仍可用。面试固定材料版本快照，之后上传不会改变已开始面试的依据。

## 本地RAG链路

SQLite事务存储 document_versions、chunks 及项目/会话/问答状态。原件、SQLite、向量及PDF均不在public目录。

按页/段落切分，单块最多380字符，约60字符重叠（字符估算，不冒充精确token）。记录来源哈希、版本ID、页/段/行、字符偏移。中文模型512维；本地CPU批量16块，可重启恢复索引；隐私锁暂停处理，迟到结果以lock_epoch丢弃。

查询先限定项目和已就绪版本，然后进行中文二元词/英文单词BM25排序（最多40条）与本地余弦向量检索（最多20条），通过RRF融合为最多6块。采用保守 per-chunk-anchor-bm25-v2 策略：每条返回片段都须自身命中查询词，不把无命中的纯语义近邻当事实证据，因此纯同义改写可能被拒答。未使用模型重排，向量相似度不等于事实置信度。

知识问答默认是带引用的原文摘录。主应用注入生成适配器后，可主动选择AI整理回答或生成逐题建议，复用主应用权限和预算；独立运行仍不自动调用模型。可点击页段标签展开文字，并通过“核对来源定位”重新验证来源；问答历史持久化。没有依据明确提示材料不足。

## DeepSeek边界

已按已安装AI SDK 7及DeepSeek provider配好生成适配器和结构校验；**独立应用不实例化、不启用、不读取API密钥**。generation.mjs 提供未来合并接入点，需要主项目提供gate、预算reserve/settle和request_id；引用ID越界或事实无引用会拒绝输出。

实际模型兼容性、计价及真实生成质量待合并Test阶段验证。本次没有调用付费DeepSeek。真实出题、追问、评分、AI标答仍未启用；现有面试使用明确标注的固定题和规则反馈。仅凭有效引用不能保证语义结论正确，真实生成上线前需要人工事实核对。

## 语音与PDF

点击录音起计时，暂停/继续累计；超时提醒不自动提交。自我介绍/追问60秒、项目题120秒、方法题180秒，均为规则时长。浏览器转写需单独确认可能使用厂商在线服务；失败可回听后人工校对。原音频仅本页暂存，提交保存原始转写、确认后文字与时长。

面试完成自动生成A4 PDF，含逐题问题/作答、提升建议、参考答案栏目；AI未接入的部分显示待生成。ReportLab使用嵌入中文字体。Windows默认SimSun；Ubuntu可安装`fonts-wqy-zenhei`，设置`INTERVIEW_PDF_FONT=/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc`。可配置 INTERVIEW_PDF_PYTHON 和 INTERVIEW_PDF_FONT。PDF按正文哈希缓存，旧记录已迁移。

## 删除、隐私与迁移

仅绑定loopback，写入校验Host、Origin和自定义请求头。隐私锁隐藏正文并阻止上传、查询和下载。未提供公网鉴权，不能直接公网部署。

删除材料版本会清理其原件、片段、向量、实际引用它的问答/面试/PDF；无关记录保留。下载到其他位置的副本由用户管理。本地SQLite和磁盘不加密。

首次启动从旧db.json迁移，SQLite成为唯一权威数据，旧JSON和legacy-db.backup.json只作为迁移备份，不会自动回灌。历史迁移备份可能含旧正文，需按备份管理策略单独处置。删除回归验证包含保留未引用该材料的其他会话。

## 验证

```powershell
npm run check
npm test
node eval-retrieval.mjs
node rag-browser-check.mjs
```

6项自动测试覆盖真实PDF/DOCX上传解析、本地向量、引用、跨项目隔离、版本、面试快照、重启、权限、原件下载、删除及无关记录保留；DeepSeek禁用时不触网、引用越界拒绝。浏览器覆盖上传→预览→索引→问答→定位→原件下载和390px无溢出。

30个合成检索用例：20个可答问题Recall@6=100%，10个无依据问题均无命中；本机该合成集查询P50约8ms/P95约14ms（不含模型冷启动/上传解析/生成）。这是工程回归，不是独立标注或私人材料质量验收。报告和截图在忽略的artifacts。

后续：真实材料验收、真实岗位题库、DeepSeek生成/评分与预算、主项目Test集成；不自动操作Production。
