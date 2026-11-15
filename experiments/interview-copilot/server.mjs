import {openStorage} from './storage.mjs';
import {ingestDocument} from './ingest.mjs';
import {chunkDocument,currentDocuments,retrieve,hybridRetrieve} from './retrieval.mjs';
import {LocalEmbedding} from './embedding.mjs';
import {extractiveAnswer} from './answers.mjs';
import {renderPdf} from './pdf.mjs';
import {buildArchive} from './archive.mjs';
import {questionPolicy,assessSession} from './assessment.mjs';
import http from 'node:http';
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { createHash, randomUUID as uuid } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export {retrieve} from './retrieval.mjs';
const libraries = [ ['citics','中信建投实习','证券研究 / 实习经历'], ['crrc','中车资本实习','资本运作 / 实习经历'], ['zhipu','智谱黑客松项目','产品实践 / 项目经历'] ];
export const catalog = {
  mode: 'prototype',
  jobs: [
    {id:'demo-research',company:'示例证券公司',role_title:'行业研究实习生',department:'研究部',location:'香港',track:'internship',decision_status:'candidate',source_summary:'演示 JD：行业研究、财务分析、信息整理与研究报告撰写。'},
    {id:'demo-investment',company:'示例投资机构',role_title:'投资分析实习生',department:'投资部',location:'上海',track:'internship',decision_status:'candidate',source_summary:'演示 JD：项目尽调、估值分析、投资逻辑与风险判断。'},
    {id:'demo-product',company:'示例 AI 公司',role_title:'AI 产品实习生',department:'产品部',location:'北京',track:'internship',decision_status:'candidate',source_summary:'演示 JD：需求分析、产品原型、技术协作与效果验证。'}
  ],
  resumes: [
    {id:'demo-master-v1',document_id:'demo-master',label:'通用 Master 简历',document_kind:'master',version_number:1,original_filename:'Master_CV_v1.pdf'},
    {id:'demo-finance-v2',document_id:'demo-finance',label:'金融岗位定制版',document_kind:'tailored',version_number:2,original_filename:'Finance_CV_v2.pdf'},
    {id:'demo-product-v1',document_id:'demo-product',label:'AI 产品岗位定制版',document_kind:'tailored',version_number:1,original_filename:'Product_CV_v1.pdf'}
  ]
};
export async function createApp(dataDir = new URL('./runtime-data/', import.meta.url),options={}) {
  await mkdir(dataDir,{recursive:true});
  const appCatalog=options.catalog||catalog;
  const storage=await openStorage(dataDir);let db=storage.state;db.qa_runs??=[];
  const filesDir=new URL('files/',dataDir);await mkdir(filesDir,{recursive:true});db.cleanup_files??=[];
  const embedding=options.embedding===false?null:new LocalEmbedding(options.modelCache);
  for(const d of db.docs){d.status??=d.ready?'ready':'awaiting_confirmation';d.version??=1;d.document_id??=d.id;d.sections??=[{text:d.text}];d.hash??=createHash('sha256').update(d.text).digest('hex');if(!d.chunks?.length)d.chunks=d.ready?chunkDocument(d):[];}
  for(const [id,name,subtitle] of libraries) if(!db.projects.some(p=>p.id===id)) db.projects.push({id,name,subtitle});
  const archiveDir=new URL('archives/',dataDir);await mkdir(archiveDir,{recursive:true});
  async function syncArchives(){
    const keep=new Set();
    for(const session of db.sessions){
      if(!session.archive)continue;
      const name='interview-'+session.id+'.pdf', hashName='interview-'+session.id+'.sha256';keep.add(name);keep.add(hashName);
      const hash=createHash('sha256').update('pdf-layout-v1:'+session.archive.content).digest('hex');
      let current='';try{current=await readFile(new URL(hashName,archiveDir),'utf8');await readFile(new URL(name,archiveDir));}catch{current='';}
      if(current!==hash){const pdf=await renderPdf(session.archive);await writeFile(new URL(name+'.tmp',archiveDir),pdf);await rename(new URL(name+'.tmp',archiveDir),new URL(name,archiveDir));await writeFile(new URL(hashName,archiveDir),hash,'utf8');}
    }
    for(const name of await readdir(archiveDir))if(/^interview-[a-f0-9-]+\.(?:md|pdf|sha256)(?:\.tmp)?$/.test(name)&&!keep.has(name))await unlink(new URL(name,archiveDir));
  }
  for(const session of db.sessions)if(session.state==='completed'){
    if(!session.archive)session.archive=buildArchive(session);
    session.archive.version=2;session.archive.format='pdf';session.archive.filename='interview-'+session.id+'.pdf';
  }
  let archiveTail=Promise.resolve();
  async function cleanupOriginals(){const done=new Set();for(const name of db.cleanup_files){if(!/^[a-f0-9-]+\.(pdf|docx|txt|md)$/.test(name))continue;try{await unlink(new URL(name,filesDir));done.add(name);}catch(e){if(e.code==='ENOENT')done.add(name);}}if(done.size){db.cleanup_files=db.cleanup_files.filter(name=>!done.has(name));storage.save(db);}}
  async function save(){storage.save(db);await cleanupOriginals();archiveTail=archiveTail.catch(()=>{}).then(syncArchives);await archiveTail;}
  await save();
  let indexRunning=false,closing=false;
  async function processIndexes(){
    if(indexRunning||closing||db.locked)return;indexRunning=true;
    try{for(const d of db.docs.filter(d=>d.status==='indexing')){const epoch=db.lock_epoch||0;
      if(db.locked||closing)break;
      try{for(let i=0;i<d.chunks.length;i+=16){if(db.locked||(db.lock_epoch||0)!==epoch||!db.docs.includes(d)||closing)break;
        const batch=d.chunks.slice(i,i+16).filter(c=>!c.vector);if(!batch.length)continue;
        if(!embedding||embedding.status==='unavailable'){d.embedding_status='unavailable';break;}
        const result=await embedding.embed(batch.map(c=>c.text));if(db.locked||(db.lock_epoch||0)!==epoch||!db.docs.includes(d)||closing)break;
        batch.forEach((c,i)=>{c.vector=result.vectors[i];c.embedding_model=result.model;c.dimension=result.dimension;});d.embedding_status='ready';await save();
      }
      if(!db.locked&&(db.lock_epoch||0)===epoch&&db.docs.includes(d)&&!closing){d.status='ready';d.ready=true;d.error=null;await save();}
      }catch{if(db.docs.includes(d)&&!closing){d.status='failed';d.ready=false;d.error='INDEX_FAILED';await save();}}
    }}finally{indexRunning=false;if(!closing&&!db.locked&&db.docs.some(d=>d.status==='indexing'))scheduleIndex();}
  }
  const scheduleIndex=()=>setTimeout(()=>processIndexes().catch(()=>{}),0);
  scheduleIndex();
  let queue=Promise.resolve();
  const server=http.createServer((req,res)=>{
    queue=queue.then(async()=>{try{
      if(!['127.0.0.1:3210','localhost:3210'].includes(req.headers.host))throw Error('非法 Host');
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'");
      const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const assets={'/voice.js':['voice.js','text/javascript; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
      if(req.method==='GET'&&(path==='/'||path==='/records'||/^\/(knowledge(?:\/[\w-]+)?|interview(?:\/setup|\/sessions\/[\w-]+)?)$/.test(path)||assets[path])){
        const [name,type]=assets[path]||['index.html','text/html; charset=utf-8'];res.setHeader('Content-Type',type);return res.end(await readFile(new URL(name,import.meta.url)));
      }
      res.setHeader('Content-Type','application/json; charset=utf-8');
      const original=path.match(/^\/api\/documents\/([a-f0-9-]+)\/file$/);
      if(req.method==='GET'&&original){if(db.locked)throw Error('隐私锁已开启');const d=db.docs.find(d=>d.id===original[1]);if(!d?.original)throw Error('原件不存在');const bytes=await readFile(new URL(d.original,filesDir));res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(d.name));return res.end(bytes);}
      const source=path.match(/^\/api\/sources\/([a-f0-9-]+:\d+)$/);
      if(req.method==='GET'&&source){if(db.locked)throw Error('隐私锁已开启');const d=db.docs.find(d=>d.ready&&d.chunks.some(c=>c.id===source[1]));if(!d)throw Error('来源已删除或不可用');const {vector,...chunk}=d.chunks.find(c=>c.id===source[1]);return res.end(JSON.stringify({...chunk,version:d.version}));}
      if(path==='/api/upload'){
        if(req.method!=='POST'||!['http://localhost:3210','http://127.0.0.1:3210'].includes(req.headers.origin)||req.headers['x-local-app']!=='1'||db.locked)throw Error('上传被隐私锁或同源规则阻止');
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>11*1024*1024)throw Error('文件过大');chunks.push(chunk);}
        const request=new Request('http://localhost/api/upload',{method:'POST',headers:{'Content-Type':req.headers['content-type']||''},body:Buffer.concat(chunks)});const form=await request.formData();const project=form.get('project'),file=form.get('file');
        if(!db.projects.some(p=>p.id===project)||!file||typeof file.arrayBuffer!=='function')throw Error('上传信息不完整');
        const doc=await ingestDocument({project,name:file.name,bytes:Buffer.from(await file.arrayBuffer()),docs:db.docs,filesDir});db.docs.push(doc);await save();return res.end(JSON.stringify({id:doc.id,status:doc.status,error:doc.error}));
      }
      const download=path.match(/^\/api\/records\/([a-f0-9-]+)\/download$/);
      if(req.method==='GET'&&download){
        if(db.locked)throw Error('隐私锁已开启');
        const session=db.sessions.find(s=>s.id===download[1]&&s.state==='completed'&&s.archive);
        if(!session)throw Error('存档不存在或已删除');
        await syncArchives();const pdf=await readFile(new URL(session.archive.filename,archiveDir));res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="'+session.archive.filename+'"');return res.end(pdf);
      }
      if(path!=='/api')throw Error('接口不存在');
      if(req.method==='GET')return res.end(JSON.stringify(db.locked?{locked:true,projects:[],docs:[],sessions:[],catalog:appCatalog}:{...db,docs:db.docs.map(d=>({...d,chunks:d.chunks.map(({vector,...c})=>c)})),catalog:appCatalog,rag:{mode:embedding?.status==='ready'?'hybrid':'keyword',embedding_status:embedding?.status||'disabled',model:embedding?.model||null,generation:options.generate?'host-gated':'disabled'},sessions:db.sessions.map(({snapshot,...s})=>s)}));
      if(req.method!=='POST'||!['http://localhost:3210','http://127.0.0.1:3210'].includes(req.headers.origin)||req.headers['x-local-app']!=='1')throw Error('同源验证失败');
      let raw='';for await(const b of req){raw+=b;if(Buffer.byteLength(raw)>2100000)throw Error('输入过大');}
      const a=JSON.parse(raw);let out={};
      if(a.op==='lock'){db.locked=!!a.locked;db.lock_epoch=(db.lock_epoch||0)+1;if(!db.locked)scheduleIndex();}
      else {
        if(db.locked)throw Error('隐私锁已开启');
        if(a.op==='start'){
          const job=appCatalog.jobs.find(j=>j.id===a.job);const resume=appCatalog.resumes.find(r=>r.id===a.resume);
          if(!job||!resume)throw Error('请先选择岗位和简历版本');
          const selected=db.projects.filter(p=>Array.isArray(a.projects)&&a.projects.includes(p.id));if(!selected.length)throw Error('请至少选择一个知识库');
          out={id:uuid(),project:selected[0].id,projects:selected.map(p=>p.id),job:structuredClone(job),resume:structuredClone(resume),snapshot:structuredClone(currentDocuments(db.docs.filter(d=>selected.some(p=>p.id===d.project)))),turns:[],question:`针对${job.role_title}，请结合所选经历做一分钟自我介绍，并说明你的匹配点。`,state:'active',version:0,follow:false,created_at:new Date().toISOString()};out.timing=questionPolicy(out.question);out.document_version_ids=out.snapshot.map(d=>d.id);db.sessions.push(out);
        }else if(a.op==='coach'){
          const s=db.sessions.find(s=>s.id===a.id);const index=a.turn;
          if(!s||!Number.isInteger(index)||index<0||index>=s.turns.length)throw Error('题目记录不存在');
          const turn=s.turns[index];
          if(turn.coaching){out=turn.coaching;}
          else{
            if(!options.generate)throw Error('请从主应用打开面试 AI，并在状态中心开启“面试知识库 AI”。');
            if(!turn.hits?.length)throw Error('本题没有可引用材料，请先完善知识库；未调用 AI。');
            turn.coaching=await options.generate({question:turn.question,answer:turn.answer,role:s.job?.role_title||'',hits:turn.hits.map(({id,text,file,page,paragraph})=>({id,text,file,page,paragraph}))});
            out=turn.coaching;
            if(s.archive){s.archive=buildArchive(s);}
          }
        }else if(['answer','finish'].includes(a.op)){
          const s=db.sessions.find(s=>s.id===a.id);if(!s)throw Error('面试不存在');
          if(s.state!=='active'||s.version!==a.version)throw Error('版本冲突，请刷新');
          if(a.op==='finish'){s.state='completed';s.completed_at=new Date().toISOString();s.review=assessSession(s);s.archive=buildArchive(s);delete s.snapshot;s.version++;}
          else {
            const answer=String(a.answer||'').slice(0,10000);
            const duration=a.duration_seconds==null?null:a.duration_seconds;if(duration!==null&&(!Number.isFinite(duration)||duration<0||duration>7200))throw Error('作答时长无效');
            s.turns.push({question:s.question,timing:s.timing||questionPolicy(s.question),answer,raw_transcript:String(a.raw_transcript||'').slice(0,10000),input_mode:a.input_mode==='voice'?'voice':'text',duration_seconds:duration,hits:(await hybridRetrieve(s.snapshot||[],s.question+' '+answer,embedding)).hits,note:!answer?'本题已跳过，建议重练。':answer.length<80?'补充具体步骤、本人贡献及材料证据。':'继续核对数字来源，说明贡献边界和方法局限。'});s.version++;
            if(s.turns.length>=6){s.state='completed';s.completed_at=new Date().toISOString();s.review=assessSession(s);s.archive=buildArchive(s);delete s.snapshot;}
            else {const follow=!!answer&&answer.length<80&&!s.follow;const base=[`请从所选知识库挑选一段经历，说明它与${s.job?.role_title||'目标岗位'}的关系。`,'请详细解释你采用的方法、关键假设和数据来源。','请区分本人贡献与团队成果，并说明可核对的依据。','有哪些结果与局限？请避免使用没有来源的指标。','如果重新做这个项目，你会改进什么？'];s.question=follow?'你提到的工作中，哪一步由你亲自完成？请补充操作过程和证据。':base[Math.min(s.turns.length-1,4)];s.follow=follow;s.timing=questionPolicy(s.question);}
          }out={id:s.id,state:s.state};
        }else {
          const p=db.projects.find(p=>p.id===a.project);if(!p)throw Error('知识库不存在');
          if(a.op==='import'){
            const doc=await ingestDocument({project:p.id,name:a.name,bytes:Buffer.from(String(a.text||''),'utf8'),docs:db.docs,filesDir});db.docs.push(doc);out={id:doc.id,status:doc.status};
          }else if(a.op==='confirm'){
            const d=db.docs.find(d=>d.id===a.id&&d.project===p.id);if(!d||!d.text)throw Error('材料无法索引，请重新上传有效文件');
            if(d.status==='indexing'){out={id:d.id,status:'indexing'};}else {const chunks=chunkDocument(d);if(db.docs.filter(o=>o.project===p.id&&o.id!==d.id).reduce((n,o)=>n+o.chunks.length,0)+chunks.length>5000)throw Error('每个知识库最多 5000 个片段');
            d.chunks=chunks;d.status='indexing';d.ready=false;d.error=null;d.embedding_status='pending';scheduleIndex();}
          }else if(a.op==='delete'){
            const removed=db.docs.find(d=>d.id===a.id&&d.project===p.id);if(!removed)throw Error('材料不存在');db.docs=db.docs.filter(d=>d!==removed);db.sessions=db.sessions.filter(s=>!s.document_version_ids?.includes(removed.id)&&!s.snapshot?.some(d=>d.id===removed.id)&&!s.turns.some(t=>t.hits?.some(c=>c.document_version_id===removed.id||c.id.startsWith(removed.id+':'))));db.qa_runs=db.qa_runs.filter(r=>!r.result.hits.some(c=>c.document_version_id===removed.id||c.id.startsWith(removed.id+':')));
            if(removed.original)db.cleanup_files.push(removed.original);await save();
          }else if(a.op==='qa'){
            const question=String(a.question||'').trim();if(!question||question.length>2000)throw Error('问题须为 1–2000 字');
            const found=await hybridRetrieve(db.docs.filter(d=>d.project===p.id),question,embedding);const structured=extractiveAnswer(found.hits);
            let generated=null;
            if(a.generate===true&&found.hits.length){
              if(!options.generate)throw Error('请从主应用打开知识库 AI，并在状态中心开启“面试知识库 AI”。');
              generated=await options.generate({question,hits:found.hits.map(({id,text,file,page,paragraph})=>({id,text,file,page,paragraph}))});
            }
            out={...(generated||structured),...found,provider:generated?'deepseek':'local-extractive',id:uuid()};db.qa_runs.push({id:out.id,project:p.id,question,result:out,created_at:new Date().toISOString()});db.qa_runs=db.qa_runs.slice(-200);
          }
          else throw Error('未知操作');
        }
      }
      await save();res.end(JSON.stringify(out));
    }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}}).catch(()=>{res.statusCode=500;res.end('{"error":"存储失败"}');});
  });
  server.on('close',()=>{closing=true;embedding?.close();storage.close();});return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const app=await createApp();app.listen(3210,'127.0.0.1',()=>console.log('Interview Copilot: http://127.0.0.1:3210'));}
