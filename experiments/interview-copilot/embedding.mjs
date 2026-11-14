import {python} from './python.mjs';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
export class LocalEmbedding {
  status='loading';model='BAAI/bge-small-zh-v1.5';dimension=512;counter=0;pending=new Map();
  constructor(cache=new URL('./runtime-data/models/',import.meta.url)){
    this.child=python('./embedding_worker.py',[fileURLToPath(cache)]);this.child.stderr.resume();this.child.stdin.on('error',()=>{});
    createInterface({input:this.child.stdout}).on('line',line=>{try{const value=JSON.parse(line),p=this.pending.get(value.id);if(!p)return;this.pending.delete(value.id);clearTimeout(p.timer);if(value.error){this.status='unavailable';p.reject(Error(value.error));}else{this.status='ready';p.resolve(value);}}catch{this.status='unavailable';}});
    const fail=()=>{this.status='unavailable';for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('LOCAL_EMBEDDING_UNAVAILABLE'));}this.pending.clear();};this.child.on('error',fail);this.child.on('exit',fail);
    this.embed([]).catch(()=>{});
  }
  embed(texts,query=false){return new Promise((resolve,reject)=>{if(this.status==='unavailable')return reject(Error('LOCAL_EMBEDDING_UNAVAILABLE'));const id=++this.counter,timer=setTimeout(()=>{this.pending.delete(id);this.status='unavailable';this.child.kill();reject(Error('LOCAL_EMBEDDING_TIMEOUT'));},60000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,texts,query})+'\n');});}
  close(){this.child.kill();}
}
