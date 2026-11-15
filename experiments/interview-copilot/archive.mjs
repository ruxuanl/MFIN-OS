import {aiReview} from './ai-review.mjs';
const block=value=>String(value??'').split(/\r?\n/).map(line=>'    '+line).join('\n');
export function buildArchive(session){
  const created_at=new Date().toISOString(),review=aiReview(session);
  const parts=['# 面试记录','',`归档时间：${created_at}`,`记录 ID：${session.id}`,'','## 面试信息','',block(`岗位：${session.job?.company||'旧版练习'} / ${session.job?.role_title||'项目面试'}\n简历：${session.resume?.label||'未选择'} / v${session.resume?.version_number??'—'}\n开始时间：${session.created_at||'未记录'}\n结束时间：${session.completed_at||'未记录'}\n题数：${session.turns.length}`),'',`AI 总分：${review.score??'未完成'} / 100；已评分 ${review.graded}/${review.total} 题。`,'','评分基于作答文字，不评价声音表现；AI建议不证明个人经历或贡献。','','## 一、逐题问题与我的作答',''];
  session.turns.forEach((turn,i)=>{
    const e=turn.coaching?.evaluation;
    parts.push(`### 第 ${i+1} 题`,'','问题：','',block(turn.question),'',`作答方式：${turn.input_mode==='voice'?'语音转文字':'文字输入'}；实际时长：${turn.duration_seconds==null?'未记录':turn.duration_seconds+' 秒'}；建议时长：${turn.timing?.seconds??'未记录'} 秒`,'','我的作答：','',block(turn.answer||'本题已跳过'),'');
    if(turn.raw_transcript)parts.push('原始转写：','',block(turn.raw_transcript),'');
    if(e){
      parts.push(`AI 评分：${e.score}/100`,'',block(e.dimensions.map(d=>`${d.name} ${d.score}/100：${d.reason}`).join('\n')),'','AI 材料建议：','',block(turn.coaching.answer),'','表达改写：','',block(e.expression),'',block((turn.coaching.missing_information||[]).map(x=>'待补充：'+x).join('\n')),'');
    }else parts.push('AI 评分与辅导未完成：'+(turn.coaching_error||'待生成；打开本场复盘后自动补齐。'),'');
    parts.push('材料引用：','',block((turn.hits||[]).map((h,j)=>`[${j+1}] ${h.file} · ${h.page?'第 '+h.page+' 页':h.paragraph?'第 '+h.paragraph+' 段':'第 '+(h.line_start||1)+' 行'}`).join('\n')||'没有匹配材料，不能据此验证个人事实。'),'');
  });
  parts.push('## 二、面试提升建议','','根据已生成的逐题 AI 反馈汇总：','');
  session.turns.forEach((t,i)=>{if(t.coaching?.evaluation)parts.push(`第 ${i+1} 题：`,'',block(t.coaching.evaluation.improvements.join('\n')),'');});
  parts.push('## 三、AI 标答 / 参考答案','','参考示范须结合本人真实经历核对；未知贡献与数字保留 [待补充]。','');
  session.turns.forEach((t,i)=>parts.push(`第 ${i+1} 题：`,'',block(t.coaching?.evaluation?.reference_answer||'待生成：本题 AI 辅导尚未完成。'),''));
  return {version:3,format:'pdf',filename:`interview-${session.id}.pdf`,created_at,ai_status:review.ai_status,content:parts.join('\n')+'\n'};
}
