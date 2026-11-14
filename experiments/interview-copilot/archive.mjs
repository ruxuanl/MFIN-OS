const block = value => String(value ?? '').split(/\r?\n/).map(line => '    ' + line).join('\n');
export function buildArchive(session) {
  const created_at = new Date().toISOString();
  const parts = ['# 面试记录', '', `归档时间：${created_at}`, `记录 ID：${session.id}`, '', '## 面试信息', '', block(`岗位：${session.job?.company || '旧版练习'} / ${session.job?.role_title || '项目面试'}\n简历：${session.resume?.label || '未选择'} / v${session.resume?.version_number ?? '—'}\n开始时间：${session.created_at || '未记录'}\n结束时间：${session.completed_at || '旧记录，未记录'}\n题数：${session.turns.length}`), '', '说明：DeepSeek 尚未接入。以下规则反馈和回答框架均不是 AI 生成的评分或标答。', '', '## 一、逐题问题与我的作答', ''];
  session.turns.forEach((turn, i) => {
    parts.push(`### 第 ${i + 1} 题`, '', '问题：', '', block(turn.question), '', `作答方式：${turn.input_mode === 'voice' ? '语音转文字' : '文字输入'}；实际时长：${turn.duration_seconds == null ? '未记录' : turn.duration_seconds + ' 秒'}；建议时长：${turn.timing?.seconds ?? '未记录'} 秒`, '', '我的作答（确认后）：', '', block(turn.answer || '本题已跳过'), '');
    if (turn.raw_transcript) parts.push('原始转写（校对前）：', '', block(turn.raw_transcript), '');
  });
  parts.push('## 二、面试提升建议', '', '### AI 生成建议', '', '待生成：合并 MFIN OS 并接入 DeepSeek 后，结合岗位、简历、材料与本轮回答生成。当前没有 AI 评估结果。', '', '### 当前规则反馈（非 AI）', '');
  session.turns.forEach((turn, i) => {
    const suggestions = session.review?.turns[i]?.evaluation?.suggestions || [turn.note || '补充具体行动、方法与证据。'];
    parts.push(`第 ${i + 1} 题：`, '', block(suggestions.join('\n')), '');
  });
  parts.push('## 三、AI 标答 / 参考答案', '', '待生成：当前没有 AI 标答。未来标答仅可重组已确认事实；缺少的贡献、指标或结果必须标记为 [待补充]，不能编造个人经历。', '', '### 回答框架预览（非 AI 生成）', '');
  session.turns.forEach((turn, i) => parts.push(`第 ${i + 1} 题：`, '', block(/自我介绍/.test(turn.question) ? '我目前的背景是 [待补充]。与该岗位最相关的经历是 [待补充]，其中我负责 [待补充]。可以支撑这一匹配点的材料是 [待补充：来源]。' : '结论：[待补充]\n背景与目标：[待补充]\n本人行动与方法：[待补充]\n结果及来源：[待补充：指标及证据]\n局限与改进：[待补充]'), ''));
  return {version:2, format:'pdf', filename:`interview-${session.id}.pdf`, created_at, ai_status:'not_connected', content:parts.join('\n') + '\n'};
}
