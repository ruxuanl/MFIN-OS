"use client";
import {useState} from "react";
import {generateCoverLetterAction,saveApplicationDraft,unlockApplicationDraft} from "@/app/(app)/applications/draft-actions";
import {SubmitButton} from "@/components/operation-feedback";
import type {ApplicationDraft,PackageResumeOption} from "@/lib/applications/data";
import "./cover-letters.css";

function CopyLetter({text}:{text:string}){
 const [copied,setCopied]=useState({text:"",status:""});
 return <div className="letter-copy"><button type="button" className="quiet-button" disabled={!text.trim()} onClick={async()=>{
  try{await navigator.clipboard.writeText(text);setCopied({text,status:"已复制全文"});}catch{setCopied({text,status:"复制失败，请选中文字后复制。"});}
 }}>复制全文</button><span role="status">{copied.text===text?copied.status:""}</span></div>;
}
export function CoverLettersPanel({drafts,template,opportunityId,returnTo,resumes,selectedResumeId,aiConfigured}:{
 drafts:ApplicationDraft[];template:string;opportunityId:string;returnTo:string;resumes:PackageResumeOption[];selectedResumeId:string|null;aiConfigured:boolean;
}){
 const baseline=drafts.find(d=>d.field_key==="cover_letter_base"),optimized=drafts.find(d=>d.field_key==="cover_letter");
 const [base,setBase]=useState((baseline?.body??template).replace(/\r\n?/g,"\n")),[ai,setAi]=useState((optimized?.body??"").replace(/\r\n?/g,"\n"));
 const [resumeId,setResumeId]=useState(resumes.some(r=>!r.archived&&r.id===selectedResumeId)?selectedResumeId??"":"");
 const validResume=resumes.some(r=>!r.archived&&r.id===resumeId);
 const hidden=<><input type="hidden" name="opportunityId" value={opportunityId}/><input type="hidden" name="returnTo" value={returnTo}/></>;
 const missing=Array.isArray(optimized?.missing_info)?optimized.missing_info as string[]:[];
 const evidence=Array.isArray(optimized?.evidence)?optimized.evidence as {claim?:string;source?:string;quote?:string}[]:[];
 return <section className="detail-panel cover-letters-panel">
  <div className="letter-section-heading"><div><h3>求职信生成</h3><p>保留自己的表达，再为合适的岗位做针对性调整。</p></div></div>
  <div className="letter-columns">
   <section className="letter-version letter-default" aria-labelledby="default-letter-title"><header><div className="letter-version-title"><h4 id="default-letter-title">默认版本</h4><CopyLetter text={base}/></div><p>从你的原文开始，可直接修改。</p></header>
    <form action={saveApplicationDraft} className="letter-edit-form">{hidden}<input type="hidden" name="fieldKey" value="cover_letter_base"/><input type="hidden" name="baseVersion" value={baseline?.version??""}/>
     <label className="visually-hidden" htmlFor="default-cover-letter">默认求职信全文</label><textarea id="default-cover-letter" name="body" value={base} onChange={e=>setBase(e.target.value)} maxLength={8000} rows={21} placeholder="粘贴你的默认求职信" required/>
     <footer><SubmitButton className="quiet-button" pendingLabel="正在保存…">保存默认版</SubmitButton></footer>
    </form>
   </section>
   <section className="letter-version letter-optimized" aria-labelledby="ai-letter-title"><header><div className="letter-version-title"><h4 id="ai-letter-title">AI 针对性优化</h4><CopyLetter text={ai}/></div><p>DeepSeek 结合本岗位、所选简历与左侧默认版调整。</p></header>
    {optimized?.source==="user" && !optimized.ai_analysis_id?<p className="letter-missing">此前保存的手写草稿已保留；允许更新后可生成针对性优化版。</p>:null}
    <form action={generateCoverLetterAction} className="letter-generate-form">{hidden}<input type="hidden" name="defaultLetter" value={base}/><input type="hidden" name="baseVersion" value={baseline?.version??""}/>
     <label htmlFor="letter-resume">用于本次优化的简历</label><div><select id="letter-resume" name="resumeVersionId" value={resumeId} onChange={e=>setResumeId(e.target.value)} required><option value="">选择简历版本</option>{resumes.filter(r=>!r.archived).map(r=><option key={r.id} value={r.id}>{r.label} · v{r.versionNumber}</option>)}</select><SubmitButton className="primary-button" pendingLabel="正在优化…" disabled={!aiConfigured || !validResume || !base.trim() || optimized?.locked}>{optimized?"重新优化":"生成优化版"}</SubmitButton></div>
     {!aiConfigured?<small>DeepSeek 尚未配置，默认版仍可编辑与复制。</small>:!resumes.length?<small>请先到材料库上传简历。</small>:optimized?.locked?<small>你保存的优化版已锁定，允许更新后才能重新生成。</small>:<small>生成时会同时保存左侧默认版；相同内容复用已有结果。</small>}
    </form>
    <form action={saveApplicationDraft} className="letter-edit-form">{hidden}<input type="hidden" name="fieldKey" value="cover_letter"/><input type="hidden" name="baseVersion" value={optimized?.version??""}/>
     <label className="visually-hidden" htmlFor="optimized-cover-letter">AI 优化求职信全文</label><textarea id="optimized-cover-letter" name="body" value={ai} onChange={e=>setAi(e.target.value)} maxLength={8000} rows={16} placeholder="选择简历并生成后，完整求职信会出现在这里。你也可以继续编辑。"/>
     <footer><SubmitButton className="quiet-button" pendingLabel="正在保存…" disabled={!ai.trim()}>保存优化版</SubmitButton></footer>
    </form>
    {optimized?.locked?<form action={unlockApplicationDraft} className="letter-unlock"><input type="hidden" name="draftId" value={optimized.id}/><input type="hidden" name="returnTo" value={returnTo}/><SubmitButton className="quiet-button" pendingLabel="正在允许更新…">允许更新 AI 版</SubmitButton></form>:null}
    {missing.length?<p className="letter-missing">待核对：{missing.join("；")}</p>:null}
    {evidence.length?<details className="letter-evidence"><summary>优化依据</summary><ul>{evidence.map((e,i)=><li key={i}>{e.claim}<small>{e.source==="jd"?"岗位 JD":e.source==="default"?"默认求职信（本人自述）":"所选简历"}：{e.quote}</small></li>)}</ul></details>:null}
   </section>
  </div><p className="letter-footnote">复制的是完整正文。发送前请核对岗位名称、事实与附件。</p>
 </section>;
}
