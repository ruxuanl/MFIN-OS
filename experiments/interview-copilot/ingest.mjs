import {createHash,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {runPython} from './python.mjs';
export async function ingestDocument({project,name,bytes,docs,filesDir}){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>10*1024*1024)throw Error('文件不能为空，单文件最多 10 MB');
  name=String(name||'').replaceAll('\\','/').split('/').pop().slice(0,160);
  const kind=name.split('.').pop().toLowerCase();if(!['pdf','docx','txt','md'].includes(kind))throw Error('仅支持 PDF、DOCX、TXT、Markdown');
  const hash=createHash('sha256').update(bytes).digest('hex');if(docs.some(d=>d.project===project&&d.hash===hash))throw Error('该材料已存在，请勿重复上传');
  if(docs.filter(d=>d.project===project).length>=50)throw Error('每个知识库最多 50 份材料版本');
  const prior=docs.filter(d=>d.project===project&&d.name===name).sort((a,b)=>(b.version||1)-(a.version||1))[0];
  const doc={id:randomUUID(),project,name,hash,document_id:prior?.document_id||prior?.id||randomUUID(),version:(prior?.version||0)+1,kind,size:bytes.length,status:'parsing',ready:false,created_at:new Date().toISOString(),chunks:[]};
  doc.original=doc.id+'.'+kind;await writeFile(new URL(doc.original,filesDir),bytes);
  try{
    if(['pdf','docx'].includes(kind)){const parsed=await runPython('./ingest.py',[kind],bytes);doc.sections=parsed.sections;doc.parser=parsed.parser;}
    else{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes('\0')||!text.trim())throw Error('INVALID_TEXT');doc.sections=[{text}];doc.parser='utf8-v1';}
    doc.text=doc.sections.map(p=>p.text).join('\n');if(doc.text.length>500000)throw Error('TEXT_TOO_LARGE');
    doc.status='awaiting_confirmation';doc.error=null;
  }catch(e){doc.status='failed';doc.error=/^[A-Z_]+$/.test(e.message)?e.message:'PARSE_FAILED';doc.text='';doc.sections=[];}
  return doc;
}
