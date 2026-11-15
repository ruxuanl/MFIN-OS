import {chunkDocument,keywordRank} from './retrieval.mjs';

export function planContext(job,resumeText,jd){
  const description=String(jd||job.source_summary||'').trim().slice(0,6000);
  if(!description)throw Error('请补充岗位描述后再生成定制题目。');
  if(!String(resumeText||'').trim())throw Error('所选简历没有可读取正文，请到材料库检查该版本。');
  const chunks=chunkDocument({id:'resume',text:String(resumeText).slice(0,100000)});
  const ranked=keywordRank(chunks,job.role_title+' '+description);
  // Keep the introduction plus relevant excerpts; the full resume stays local.
  const selected=[...new Map([chunks[0],...ranked,...chunks].filter(Boolean).map(c=>[c.id,c])).values()].slice(0,6);
  return {jd:description,resume_excerpts:selected.map(c=>c.text).join('\n').slice(0,2400)};
}

export function validatePlan(result){
  const q=result?.questions;
  if(!Array.isArray(q)||q.length!==6||q.some(s=>typeof s!=='string'||!s.trim()||s.length>300||!/[？?]$/.test(s.trim()))||new Set(q.map(s=>s.trim())).size!==6)throw Error('定制题目未完整生成，请手动重试；尚未创建练习。');
  return q.map(s=>s.trim());
}
