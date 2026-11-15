const block = value => String(value ?? '').split(/\r?\n/).map(line => '    ' + line).join('\n');
export function buildArchive(session) {
  const created_at = new Date().toISOString();
  const parts = ['# 面试记录', '', `归档时间：${created_at}`, `记录 ID：${session.id}`, '', '## 面试信息', '', block(`岗位：${session.job?.company || '旧版练习'} / ${session.job?.role_title || '项目面试'}\n简历：${session.resume?.label || '未选择'} / v${session.resume?.version_number ?? '—'}\n开始时间：${session.created_at || '未记录'}\n结束时间：${session.completed_at || '旧记录，未记录'}\n题数：${session.turns.length}`), '', '说明：评分和回答框架来自规则；单独生成的 AI 材料建议列在对应题目下，不能视为已核实的个人贡献。', '', '## 一、逐题问题与我的作答', ''];
  session.turns.forEach((turn, i) => {
    parts.push(`### 第 ${i + 1} 题`, '', '问题：', '', block(turn.question), '', `作答方式：${turn.input_mode === 'voice' ? '语音转文字' : '文字输入'}；实际时长：${turn.duration_seconds == null ? '未记录' : turn.duration_seconds + ' 秒'}；建议时长：${turn.timing?.seconds ?? '未记录'} 秒`, '', '我的作答（确认后）：', '', block(turn.answer || '本题已跳过'), '');
    if(turn.coaching)parts.push('AI 材料建议（非评分）：','',block(turn.coaching.answer),'',block((turn.coaching.missing_information||[]).map(x=>'待补充：'+x).join('\n')),'',block((turn.hits||[]).map((h,j)=>`[${j+1}] ${h.file} · ${h.page?'第 '+h.page+' 页':h.paragraph?'第 '+h.paragraph+' 段':'第 '+h.line_start+' 行'}`).join('\n')),'');
    if (turn.raw_transcript) parts.push('原始转写（校对前）：', '', block(turn.raw_transcript), '');
  });
  parts.push('## 二、面试提升建议', '', '### AI 生成建议', '', '综合练习计划尚未生成；已生成的逐题材料建议见第一节。以下为规则反馈。', '', '### 当前规则反馈（非 AI）', '');
  session.turns.forEach((turn, i) => {
    const suggestions = session.review?.turns[i]?.evaluation?.suggestions || [turn.note || '补充具体行动、方法与证据。'];
    parts.push(`第 ${i + 1} 题：`, '', block(suggestions.join('\n')), '');
  });
  parts.push('## 三、AI 标答 / 参考答案', '', '待生成：当前没有 AI 标答。未来标答仅可重组已确认事实；缺少的贡献、指标或结果必须标记为 [待补充]，不能编造个人经历。', '', '### 回答框架预览（非 AI 生成）', '');
  session.turns.forEach((turn, i) => parts.push(`第 ${i + 1} 题：`, '', block(/自我介绍/.test(turn.question) ? '我目前的背景是 [待补充]。与该岗位最相关的经历是 [待补充]，其中我负责 [待补充]。可以支撑这一匹配点的材料是 [待补充：来源]。' : '结论：[待补充]\n背景与目标：[待补充]\n本人行动与方法：[待补充]\n结果及来源：[待补充：指标及证据]\n局限与改进：[待补充]'), ''));
  return {version:2, format:'pdf', filename:`interview-${session.id}.pdf`, created_at, ai_status:session.turns.some(t=>t.coaching)?'partial_coaching':'not_generated', content:parts.join('\n') + '\n'};
}
