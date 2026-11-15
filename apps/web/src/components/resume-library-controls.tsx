"use client";
import {createClient} from "@/lib/supabase/client";
import {useRef,useState} from "react";
import {uploadResume,deleteResumeVersion} from "@/app/(app)/materials/actions";
import {SubmitButton} from "@/components/operation-feedback";

type Document={id:string;label:string;document_kind:string;versions:{id:string;version_number:number}[]};
export function ResumeUpload({documents}:{documents:Document[]}){
 const input=useRef<HTMLInputElement>(null);const [file,setFile]=useState<File|null>(null);const [name,setName]=useState("");const [documentId,setDocumentId]=useState("");
 const [kind,setKind]=useState(documents.some(d=>d.document_kind==="master")?"tailored":"master");
 function choose(f:File|undefined){if(f){setFile(f);setName(documents.find(d=>d.id===documentId)?.label||f.name.replace(/\.(pdf|docx)$/i,""));}}
 return <form action={uploadResume} className="material-intake">
  <div className="intake-main"><span className="material-kicker">添加材料</span><h2>把下一版简历，放在这里。</h2><p>选择文件，保存为独立版本。上传后自动交给 AI 分析。</p>
   <label className={`resume-dropzone ${file?"has-file":""}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f&&input.current){const dt=new DataTransfer();dt.items.add(f);input.current.files=dt.files;choose(f);}}}>
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5"/></svg>
    <strong>{file?file.name:"拖入文件，或点击选择"}</strong><span>{file?`${(file.size/1024).toFixed(0)} KB · 点击更换文件`:"PDF / DOCX · 最大 10 MB"}</span>
    <input ref={input} className="resume-file-input" type="file" name="resumeFile" accept=".pdf,.docx" aria-label="选择简历文件" required onChange={e=>choose(e.target.files?.[0])}/>
   </label>
  </div>
  <div className="intake-settings"><span className="material-kicker">保存设置</span><h3>{file?"为这个版本起个名字":"选好文件后，即可保存"}</h3>
   <label>材料名称<input name="label" value={name} onChange={e=>setName(e.target.value)} readOnly={!!documentId} maxLength={160} placeholder="例如：行业研究 · 中文简历" required/></label>
   <label>归入材料<select name="documentId" value={documentId} onChange={e=>{setDocumentId(e.target.value);setName(documents.find(d=>d.id===e.target.value)?.label||file?.name.replace(/\.(pdf|docx)$/i,"")||"");}}><option value="">创建新材料</option>{documents.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
   <label>材料类型<select name="documentKind" value={documents.find(d=>d.id===documentId)?.document_kind||kind} onChange={e=>setKind(e.target.value)} disabled={!!documentId}><option value="master">通用 Master</option><option value="tailored">岗位定制版</option></select></label>
   {documentId?<input type="hidden" name="documentKind" value={documents.find(d=>d.id===documentId)?.document_kind||kind}/>:null}
   <details className="intake-advanced"><summary>版本关联（可选）</summary><label>基于哪个版本<select name="sourceVersionId" defaultValue=""><option value="">独立上传</option>{documents.flatMap(d=>d.versions.map(v=><option key={v.id} value={v.id}>{d.label} · v{v.version_number}</option>))}</select></label></details>
   <SubmitButton className="primary-button" disabled={!file} pendingLabel="正在保存…">保存并分析</SubmitButton><small>原件私密保存，每次修改独立留存。</small>
  </div>
 </form>;
}
export function DeleteResumeButton({id,filename}:{id:string;filename:string}){
 const dialog=useRef<HTMLDialogElement>(null);
 return <><button className="resume-delete-button" type="button" onClick={()=>dialog.current?.showModal()} aria-label={`删除 ${filename}`}>删除</button><dialog ref={dialog} className="resume-delete-dialog"><h2>删除这个简历版本？</h2><p>{filename}</p><p>将删除原件、该版本的 AI 分析、岗位引用，以及使用它的面试记录和 PDF。其他简历版本与岗位本身会保留。删除后无法在产品内恢复。</p><form action={deleteResumeVersion}><input name="resumeVersionId" type="hidden" value={id}/><input name="confirmed" type="hidden" value="delete"/><div className="resume-dialog-actions"><button className="quiet-button" type="button" onClick={()=>dialog.current?.close()}>保留简历</button><SubmitButton className="resume-delete-confirm" pendingLabel="正在删除…">确认删除</SubmitButton></div></form></dialog></>;
}

export function ResumeReauthenticate(){
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 return <div><button type="button" className="quiet-button" disabled={busy} onClick={async()=>{setBusy(true);const r=await createClient().auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin+"/auth/callback?next=/materials",queryParams:{prompt:"select_account"}}});if(r.error){setError("身份验证未启动，请重试。");setBusy(false);}}}>{busy?"正在打开身份验证…":"重新登录验证身份"}</button>{error?<p role="alert">{error}</p>:null}</div>;
}
