import {LocalEmbedding} from './embedding.mjs';import{chunkDocument,hybridRetrieve}from'./retrieval.mjs';import{writeFile,mkdir}from'node:fs/promises';import{performance}from'node:perf_hooks';
// Synthetic fixtures and explicit expected source pages. This is engineering regression, not independent quality certification.
const cases=[
 ['现金流折现','现金流折现采用未来自由现金流与折现率计算企业价值。','现金流折现如何计算企业价值？'],
 ['可比公司','可比公司估值选择同行业公司，比较市盈率和市净率。','可比公司估值比较哪些指标？'],
 ['加权资本成本','加权资本成本由股权成本与税后债务成本按资本结构加权。','加权资本成本如何构成？'],
 ['永续增长率','永续增长率假设企业稳定期现金流长期增长速度。','永续增长率代表什么假设？'],
 ['敏感性分析','敏感性分析改变折现率和增长率，观察估值区间变化。','敏感性分析调整哪些参数？'],
 ['信用利差','信用利差反映债券相对基准利率的额外收益补偿。','信用利差反映什么？'],
 ['债券久期','债券久期衡量价格对收益率变动的敏感程度。','债券久期衡量哪种风险？'],
 ['尽职调查','尽职调查核查企业财务、业务、法律及经营风险。','尽职调查核查哪些事项？'],
 ['现金转换周期','现金转换周期等于存货周转天数加应收账款天数减应付账款天数。','现金转换周期怎样计算？'],
 ['资产减值','资产减值测试比较账面价值与可收回金额。','资产减值测试比较哪些金额？'],
 ['产品需求','产品需求通过访谈提炼用户痛点，形成需求优先级。','产品需求如何形成优先级？'],
 ['用户访谈','用户访谈使用开放式问题获取真实场景与使用动机。','用户访谈采用什么提问方式？'],
 ['检索增强生成','检索增强生成先搜索文档证据，再将证据交给语言模型。','检索增强生成怎样使用证据？'],
 ['原型验证','原型验证邀请目标用户完成任务，记录失败路径。','原型验证记录什么行为？'],
 ['数据清洗','数据清洗识别重复值、缺失值和异常观测。','数据清洗处理什么问题？'],
 ['收益归因','收益归因把组合收益拆解为配置与选择贡献。','收益归因怎样拆解贡献？'],
 ['回测偏差','回测偏差包括幸存者偏差和未来信息泄漏。','回测偏差有哪些来源？'],
 ['压力测试','压力测试模拟极端宏观冲击下组合损失。','压力测试模拟什么情况？'],
 ['流动性管理','流动性管理跟踪现金头寸与融资到期安排。','流动性管理关注什么安排？'],
 ['团队分工','团队分工记录每位成员的责任边界与交付物。','团队分工如何记录责任边界？']
];
const missing=['火星探测器的燃料成分','法国葡萄酒产区','北极熊迁徙路线','量子纠缠实验装置','宋代瓷器烧制温度','台风登陆坐标','咖啡豆烘焙曲线','古希腊神话谱系','海豚声呐频率','南极冰芯年代'];
const e=new LocalEmbedding();try{const doc={id:'synthetic',project:'fixture',name:'合成金融与产品材料.txt',hash:'synthetic-v1',ready:true,sections:cases.map((c,i)=>({page:i+1,text:c[1]}))};doc.chunks=chunkDocument(doc);const encoded=await e.embed(doc.chunks.map(c=>c.text));doc.chunks.forEach((c,i)=>Object.assign(c,{vector:encoded.vectors[i],embedding_model:encoded.model}));
 const times=[],results=[];for(let i=0;i<cases.length;i++){const t=performance.now(),r=await hybridRetrieve([doc],cases[i][2],e);times.push(performance.now()-t);results.push({question:cases[i][2],expected_page:i+1,hit:r.hits.some(h=>h.page===i+1),mode:r.mode});}
 const refused=[];for(const q of missing){const r=await hybridRetrieve([doc],q,e);refused.push({question:q,insufficient:r.hits.length===0});}
 times.sort((a,b)=>a-b);const report={scope:'synthetic engineering regression; no real DeepSeek call; not independent semantic grounding certification',model:e.model,answerable:20,missing:10,recall_at_6:results.filter(r=>r.hit).length/20,insufficient_count:refused.filter(r=>r.insufficient).length,p50_ms:Math.round(times[9]),p95_ms:Math.round(times[18]),results,refused};await mkdir(new URL('./artifacts/',import.meta.url),{recursive:true});await writeFile(new URL('./artifacts/retrieval-eval.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({recall_at_6:report.recall_at_6,insufficient_count:report.insufficient_count,p50_ms:report.p50_ms,p95_ms:report.p95_ms}));if(report.recall_at_6<.85||report.insufficient_count<9)process.exitCode=1;
}finally{e.close();}
