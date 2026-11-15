import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createApp} from './server.mjs';
import {hybridRetrieve,keywordRank} from './retrieval.mjs';

test('BM25 rewards specific evidence and unrelated semantic neighbors cannot become citations',async()=>{
 const vector=Array(512).fill(0);vector[0]=1;
 const chunks=[{id:'d:0',text:'现金流折现采用折现率。',vector,embedding_model:'test'},{id:'d:1',text:'咖啡豆烘焙曲线。',vector,embedding_model:'test'}];
 const found=await hybridRetrieve([{ready:true,id:'d',name:'test',chunks}],'现金流折现',{model:'test',status:'ready',embed:async()=>({vectors:[vector]})});
 assert.equal(found.mode,'hybrid');assert.deepEqual(found.hits.map(h=>h.id),['d:0']);
 assert.equal(found.evidence_policy,'per-chunk-anchor-bm25-v2');
 assert.equal(keywordRank([{id:'a',text:'现金流 现金流 现金流'},{id:'b',text:'现金流 '+('其他事项 '.repeat(100))}],'现金流')[0].id,'a');
});

test('host-gated knowledge QA and interview coaching use selected snapshot evidence and cache feedback',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'grounded-test-'));let calls=0,last,fail=false;
 const app=await createApp(pathToFileURL(dir+'/'),{embedding:false,generate:async input=>{
  if(input.purpose==='question_plan'){calls++;last=input;return {questions:Array.from({length:6},(_,i)=>`现金流折现的第${i+1}个关键问题是什么？`),missing_information:['合成缺口'],provider:'deepseek'};}
  calls++;last=input;if(fail)throw Error('合成调用失败');return {answer:'合成建议 [1]',claims:[],missing_information:['个人贡献待补充'],provider:'deepseek',evaluation:{score:75,dimensions:['切题','结构','方法','表达'].map(name=>({name,score:75,reason:'合成理由'})),strengths:['合成优点'],improvements:['合成改法'],expression:'合成表达改写',reference_answer:'合成参考答案'}};
 }});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const op=body=>new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:app.address().port,path:'/api',method:body?'POST':'GET',headers:{Host:'127.0.0.1:3210',Origin:'http://127.0.0.1:3210','X-Local-App':'1'}},res=>{const parts=[];res.on('data',b=>parts.push(b));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(parts))}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
 });
 try{
  const uploaded=(await op({op:'import',project:'citics',name:'synthetic.txt',text:'现金流折现采用折现率与未来现金流。'})).body;
  await op({op:'confirm',project:'citics',id:uploaded.id});
  for(let i=0;i<50;i++){if((await op()).body.docs[0].ready)break;await new Promise(r=>setTimeout(r,10));}
  const qa={op:'qa',project:'citics',question:'现金流折现'};
  assert.equal((await op(qa)).body.provider,'deepseek');assert.equal(calls,1);
  assert.equal((await op({...qa,generate:true})).body.provider,'deepseek');assert.equal(calls,2);
  assert.ok(last.hits.every(h=>!('vector' in h)));assert.equal(last.hits.length,1);
  await op({...qa,question:'zxqv987654',generate:true});assert.equal(calls,2);
  const session=(await op({op:'start',job:'demo-research',resume:'demo-master-v1',projects:['citics'],resume_text:'合成简历：现金流折现。'})).body;
  await op({op:'answer',id:session.id,version:0,answer:'我用现金流折现。'});
  const coaching={op:'coach',id:session.id,turn:0};
  assert.equal((await op(coaching)).status,200);assert.equal(calls,4);
  assert.equal(last.answer,'我用现金流折现。');assert.equal(last.hits[0].id,uploaded.id+':0');
  await op(coaching);assert.equal(calls,4);
  await op({op:'finish',id:session.id,version:1});
  const state=(await op()).body;assert.match(state.sessions[0].archive.content,/合成建议/);
  assert.equal(state.sessions[0].archive.ai_status,'completed');
  const planned=(await op({op:'start',job:'demo-research',resume:'demo-master-v1',projects:['citics'],generate:true,resume_text:'合成简历：现金流折现分析。',jd:'合成岗位：分析现金流。'})).body;
  assert.equal(calls,5);assert.equal(planned.question,'现金流折现的第1个关键问题是什么？');
  assert.match(last.context.resume_excerpts,/现金流折现/);assert.ok(last.context.resume_excerpts.length<=2400);
  await op({op:'answer',id:planned.id,version:0,answer:'简短作答'});
  let active=(await op()).body.sessions.find(s=>s.id===planned.id);
  assert.equal(active.question,'现金流折现的第2个关键问题是什么？');assert.equal(calls,6);
  for(let i=1;i<6;i++)await op({op:'answer',id:planned.id,version:i,answer:'继续作答'});
  active=(await op()).body.sessions.find(s=>s.id===planned.id);
  assert.equal(active.state,'completed');assert.equal(active.turns.length,6);assert.equal(calls,11);assert.equal(active.review.score,75);assert.match(active.archive.content,/合成参考答案/);
  const failing=(await op({op:'start',job:'demo-research',resume:'demo-master-v1',projects:['citics'],resume_text:'合成简历：现金流。'})).body;
  fail=true;const saved=await op({op:'answer',id:failing.id,version:0,answer:'必须保留的作答'});assert.equal(saved.status,200);
  let failed=(await op()).body.sessions.find(s=>s.id===failing.id);assert.equal(failed.turns[0].answer,'必须保留的作答');assert.equal(failed.turns[0].coaching_status,'failed');assert.equal(failed.review.score,null);
  fail=false;await op({op:'coach',id:failing.id,turn:0});failed=(await op()).body.sessions.find(s=>s.id===failing.id);assert.equal(failed.turns[0].coaching.evaluation.score,75);
  await op({op:'purge_resume',id:'demo-master-v1'});assert.equal((await op()).body.sessions.length,0);assert.equal((await op()).body.docs.length,1);assert.deepEqual(await readdir(join(dir,'archives')),[]);
  await op({op:'lock',locked:true});assert.equal((await op(coaching)).status,400);assert.equal(calls,14);
 }finally{await new Promise(r=>app.close(r));await rm(dir,{recursive:true,force:true});}
});
