// Local prototype policy. Replace this adapter with validated DeepSeek output after integration.
export function questionPolicy(text) {
  if (/自我介绍/.test(text)) return {type:'自我介绍',seconds:60,reason:'用一分钟说明背景、相关经历与岗位匹配点。',source:'prototype-rule'};
  if (/哪一步|补充/.test(text)) return {type:'细节追问',seconds:60,reason:'聚焦一个具体动作，补充过程及依据。',source:'prototype-rule'};
  if (/方法|假设|数据来源/.test(text)) return {type:'专业方法',seconds:180,reason:'预留时间解释方法、假设、推导与局限。',source:'prototype-rule'};
  return {type:'项目 / 行为题',seconds:120,reason:'按背景、任务、行动、结果组织一段完整经历。',source:'prototype-rule'};
}
export function evaluateTurn(turn) {
  if (!turn.answer.trim()) return {provider:'demo-rule',score:null,dimensions:[],suggestions:['本题未作答，可在重练时补充。'],uncertainty:'未调用 AI，无语义或事实判断。'};
  turn={...turn,timing:turn.timing||questionPolicy(turn.question),duration_seconds:turn.duration_seconds??null};
  const text=turn.answer;
  const dimensions=[
    {name:'表达结构',weight:40,value:/首先|其次|最后|背景|结果|因此/.test(text)?3:1,reason:'仅按结构词检测，不能判断叙述质量。'},
    {name:'行动描述',weight:40,value:/我|本人/.test(text)&&/分析|整理|设计|负责|完成|验证|计算|开发/.test(text)?3:1,reason:'仅检测个人行动表述，不能验证贡献真实性。'},
    {name:'时间控制',weight:20,value:turn.duration_seconds===null?null:turn.duration_seconds<=turn.timing.seconds?3:1,reason:turn.duration_seconds===null?'未录音计时，本维不计分。':'只比较实际作答时长与建议时长。'}
  ];
  const applicable=dimensions.filter(d=>d.value!==null);
  return {provider:'demo-rule',rubric_version:'demo-2',score:Math.round(applicable.reduce((n,d)=>n+d.value/4*d.weight,0)/applicable.reduce((n,d)=>n+d.weight,0)*100),dimensions,suggestions:[
    dimensions[0].value<3?'先用一句话给结论，再按背景、行动、结果展开。':'保留现有结构，压缩背景，把时间留给关键行动。',
    dimensions[1].value<3?'明确“我亲自做了什么”，补充一个具体步骤。':'给个人行动补充方法、取舍与可核对的证据。',
    turn.hits.length?'逐条核对下方原文，避免把材料未支持的数字写成已确认事实。':'当前未匹配到证据，请补充材料；这不代表回答不真实。',
    ...(turn.duration_seconds>turn.timing.seconds?['回答已超出建议时长，下次先讲结论，再保留一到两个重点。']:[])
  ],uncertainty:'规则演示分，不是 AI 评分；不评判专业正确性、事实真伪、口语流畅度或录用可能。'};
}
export function assessSession(s) {
  const turns=s.turns.map(t=>({...t,evaluation:evaluateTurn(t)}));
  const scored=turns.map(t=>t.evaluation.score).filter(x=>x!==null);
  return {provider:'demo-rule',ai_status:'not_connected',score:scored.length?Math.round(scored.reduce((a,b)=>a+b,0)/scored.length):null,turns};
}
