// Invoked by Windows Task Scheduler. Never prints credentials or mail content.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env=await readFile(path.join(root,'apps/web/.env.local'),'utf8');
const value=key=>env.match(new RegExp('^'+key+'=(.*)$','m'))?.[1]?.trim().replace(/^["']|["']$/g,'');
const secret=value('DAILY_DISCOVERY_SECRET');
await mkdir(path.join(root,'work/daily-discovery'),{recursive:true});
let result;
try{
  if(!secret)throw new Error();
  const response=await fetch('http://localhost:3000/api/internal/daily-discovery',{method:'POST',headers:{authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(175000)});
  const body=await response.json();
  result={checkedAt:new Date().toISOString(),ok:response.ok,status:['completed','failed','skipped'].includes(body.status)?body.status:'unavailable'};
}catch{result={checkedAt:new Date().toISOString(),ok:false,status:'local_server_unavailable'};}
await writeFile(path.join(root,'work/daily-discovery/scheduler-status.json'),JSON.stringify(result));
console.log(JSON.stringify(result));
if(!result.ok)process.exitCode=1;
