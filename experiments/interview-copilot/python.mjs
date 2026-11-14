import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function python(script,args=[]){return spawn(process.env.INTERVIEW_PDF_PYTHON||(process.platform==='win32'?'py':'python3'),[...(!process.env.INTERVIEW_PDF_PYTHON&&process.platform==='win32'?['-3']:[]),fileURLToPath(new URL(script,import.meta.url)),...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});}
export function runPython(script,args,input,timeout=30000){return new Promise((resolve,reject)=>{
  const child=python(script,args),chunks=[];let size=0;const timer=setTimeout(()=>child.kill(),timeout);
  child.stdout.on('data',b=>{size+=b.length;if(size>10000000)child.kill();else chunks.push(b);});child.stderr.resume();child.stdin.on('error',()=>{});
  child.on('error',()=>{clearTimeout(timer);reject(Error('Python 处理工具不可用'));});child.on('close',code=>{clearTimeout(timer);try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(code||value.error)throw Error(value.error||'PARSE_FAILED');resolve(value);}catch(e){reject(Error(e.message.startsWith('Unexpected')?'PARSE_FAILED':e.message));}});child.stdin.end(input);
});}
