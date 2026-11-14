import {DatabaseSync} from 'node:sqlite';import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createApp,retrieve} from './server.mjs';
test('retrieval preserves evidence and rejects unmatched query',()=>{const docs=[{id:'a',ready:true,name:'report.md',text:'Revenue increased 12 percent.'}];assert.equal(retrieve(docs,'Revenue')[0].id,'a:0');assert.equal(retrieve(docs,'unknown').length,0);});
test('selection, lock persistence, version conflict, restart, deletion lifecycle',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'copilot-test-'));const url=pathToFileURL(dir+'/');let app=await createApp(url,{embedding:false});await new Promise(r=>app.listen(0,'127.0.0.1',r));let port=app.address().port;
 const call=(body,origin='http://127.0.0.1:3210',path='/api',json=true)=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,method:body?'POST':'GET',headers:{Host:'127.0.0.1:3210',Origin:origin,'X-Local-App':'1','Content-Type':'application/json'}},res=>{let chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:json?JSON.parse(Buffer.concat(chunks).toString('utf8')):Buffer.concat(chunks)}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);}); try {
  assert.equal((await call()).body.projects.length,3);
  assert.equal((await call({op:'start',job:'bad',resume:'bad',projects:['citics']})).status,400);
  assert.equal((await call({op:'import',project:'citics',name:'notes.md',text:'Revenue method source 12 percent.'},'https://evil.test')).status,400);
  await call({op:'import',project:'citics',name:'notes.md',text:'Revenue method source 12 percent.'});const doc=(await call()).body.docs[0];await call({op:'confirm',project:'citics',id:doc.id});for(let i=0;i<50;i++){if((await call()).body.docs[0].ready)break;await new Promise(r=>setTimeout(r,20));}
  assert.equal((await call({op:'qa',project:'crrc',question:'Revenue'})).body.hits.length,0);
  const s=(await call({op:'start',job:'demo-research',resume:'demo-master-v1',projects:['citics']})).body;
  await call({op:'lock',locked:true});assert.equal((await call()).body.docs.length,0);assert.equal((await call({op:'qa',project:'citics',question:'Revenue'})).status,400);
  const sql=new DatabaseSync(fileURLToPath(new URL('knowledge.sqlite',url)));const disk={...JSON.parse(sql.prepare('SELECT payload FROM app_state').get().payload),docs:sql.prepare('SELECT payload FROM document_versions').all()};sql.close();assert.equal(disk.docs.length,1);assert.equal(disk.sessions[0].snapshot.length,1);
  await new Promise(r=>app.close(r));app=await createApp(url,{embedding:false});await new Promise(r=>app.listen(0,'127.0.0.1',r));port=app.address().port;
  await call({op:'lock',locked:false});assert.equal((await call()).body.docs.length,1);
  await call({op:'answer',id:s.id,version:0,answer:'Revenue'});assert.equal((await call({op:'answer',id:s.id,version:0,answer:'duplicate'})).status,400);
  assert.equal((await call()).body.sessions[0].turns.length,1);
  for(let version=1;version<6;version++)await call({op:'answer',id:s.id,version,answer:'Revenue'});
  const completed=(await call()).body.sessions[0];assert.equal(completed.state,'completed');assert.match(completed.archive.content,/Revenue/);assert.match(completed.archive.content,/AI 标答/);assert.match(completed.archive.content,/待生成/);
  const archiveFile=new URL('archives/'+completed.archive.filename,url);const storedPdf=await readFile(archiveFile);assert.equal(storedPdf.subarray(0,5).toString(),'%PDF-');assert.match(completed.archive.filename,/\.pdf$/);
  const downloadPath='/api/records/'+s.id+'/download';const download=await call(null,undefined,downloadPath,false);assert.equal(download.status,200);assert.deepEqual(download.body,storedPdf);
  await call({op:'lock',locked:true});assert.equal((await call(null,undefined,downloadPath)).status,400);await call({op:'lock',locked:false});
  await new Promise(r=>app.close(r));app=await createApp(url,{embedding:false});await new Promise(r=>app.listen(0,'127.0.0.1',r));port=app.address().port;assert.deepEqual((await call(null,undefined,downloadPath,false)).body,storedPdf);
  await call({op:'delete',project:'citics',id:doc.id});assert.equal((await call()).body.sessions.length,0);assert.equal((await call()).body.docs.length,0);await assert.rejects(readFile(archiveFile),{code:'ENOENT'});assert.equal((await call(null,undefined,downloadPath)).status,400);
 }finally{await new Promise(r=>app.close(r));await rm(dir,{recursive:true,force:true});}
});

import {questionPolicy,evaluateTurn} from './assessment.mjs';
test('question timing and demo rubric handle missing timings and skipped turns',()=>{
 assert.equal(questionPolicy('请自我介绍').seconds,60);assert.equal(questionPolicy('请解释方法和假设').seconds,180);assert.equal(questionPolicy('哪一步由你完成').seconds,60);
 assert.equal(evaluateTurn({answer:'',hits:[]}).score,null);
 const ev=evaluateTurn({answer:'首先我整理数据，最后计算结果。',question:'介绍项目',hits:[],duration_seconds:null});assert.equal(ev.provider,'demo-rule');assert.equal(ev.dimensions[2].value,null);assert.equal(ev.score,75);
 const over=evaluateTurn({answer:'我分析数据',question:'自我介绍',hits:[],duration_seconds:100});assert.equal(over.dimensions[2].value,1);assert.match(over.suggestions.join(''),/超出/);
});
