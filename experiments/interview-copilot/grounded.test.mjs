import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
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
 const dir=await mkdtemp(join(tmpdir(),'grounded-test-'));let calls=0,last;
 const app=await createApp(pathToFileURL(dir+'/'),{embedding:false,generate:async input=>{
  calls++;last=input;return {answer:'合成建议 [1]',claims:[],missing_information:['个人贡献待补充'],provider:'deepseek'};
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
  assert.equal((await op(qa)).body.provider,'local-extractive');assert.equal(calls,0);
  assert.equal((await op({...qa,generate:true})).body.provider,'deepseek');assert.equal(calls,1);
  assert.ok(last.hits.every(h=>!('vector' in h)));assert.equal(last.hits.length,1);
  await op({...qa,question:'zxqv987654',generate:true});assert.equal(calls,1);
  const session=(await op({op:'start',job:'demo-research',resume:'demo-master-v1',projects:['citics']})).body;
  await op({op:'answer',id:session.id,version:0,answer:'我用现金流折现。'});
  const coaching={op:'coach',id:session.id,turn:0};
  assert.equal((await op(coaching)).status,200);assert.equal(calls,2);
  assert.equal(last.answer,'我用现金流折现。');assert.equal(last.hits[0].id,uploaded.id+':0');
  await op(coaching);assert.equal(calls,2);
  await op({op:'finish',id:session.id,version:1});
  const state=(await op()).body;assert.match(state.sessions[0].archive.content,/合成建议/);
  assert.equal(state.sessions[0].archive.ai_status,'partial_coaching');
  await op({op:'lock',locked:true});assert.equal((await op(coaching)).status,400);assert.equal(calls,2);
 }finally{await new Promise(r=>app.close(r));await rm(dir,{recursive:true,force:true});}
});
