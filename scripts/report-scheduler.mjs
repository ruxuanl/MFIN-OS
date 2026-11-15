import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env=await readFile(path.join(root,'apps/web/.env.local'),'utf8');
const secret=env.match(/^REPORT_SCHEDULER_SECRET=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g,'');
let status='failed';
try {if(!secret)throw new Error();const r=await fetch('http://localhost:3000/api/internal/reports',{method:'POST',headers:{authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(170000)});if(r.ok)status='completed';}catch{}
await mkdir(path.join(root,'work/report-archive'),{recursive:true});
await writeFile(path.join(root,'work/report-archive/scheduler-status.json'),JSON.stringify({status,checkedAt:new Date().toISOString()}));
console.log(status);if(status!=='completed')process.exitCode=1;
