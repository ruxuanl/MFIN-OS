import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, realpath, stat, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import yauzl from "yauzl";
import { normalizeJobUrl, radarCategory, type RadarItem, type RadarPreferences } from "./radar-model";
import { filteredRadarItems } from "./radar-results";

export type LeadershipItem = RadarItem & { id: string; discoveredAt: string; localSource: { fileName: string; sheet: string; row: number; key: string; publicUrl: string | null } };
export type LeadershipResult = { items: LeadershipItem[]; files: number; records: number; available: boolean; message?: string };
const rootDefault = path.join(homedir(),"Desktop","LEADERSHIP实习数据库");
const cache = new Map<string, LeadershipItem[]>();
const queues = new Map<string, Promise<unknown>>();
export function leadershipEnabled(ownerId: string) {
  const owner = process.env.LEADERSHIP_LOCAL_OWNER_ID || process.env.INTERVIEW_LOCAL_OWNER_ID;
  return !process.env.VERCEL && process.env.APP_ENV !== "production" && Boolean(owner && owner === ownerId);
}
export function leadershipFileDate(fileName: string) {
  const match = fileName.match(/^(\d{4})[.年-](\d{1,2})[.月-](\d{1,2})/);
  if (!match) return null;
  const day = `${match[1]}-${match[2].padStart(2,"0")}-${match[3].padStart(2,"0")}`;
  const date = new Date(day);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === day ? day : null;
}
function decode(text: string) {
  return text.replace(/&#(x[\da-f]+|\d+);/gi, (_,n:string) => { const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1),16) : Number(n); return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; })
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
}
const attr = (text:string,name:string) => decode(text.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? "");
const texts = (xml:string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>decode(x[1])).join("");
export async function readLeadershipArchive(filePath: string): Promise<Record<string,string>> {
  const size = (await stat(filePath)).size;
  if (size > 10 * 1024 * 1024) throw new Error("leadership_file_too_large");
  const zip = await new Promise<yauzl.ZipFile>((resolve,reject)=>yauzl.open(filePath,{lazyEntries:true},(error,value)=>error || !value ? reject(error) : resolve(value)));
  return new Promise((resolve,reject)=>{
    const files:Record<string,string>={}; let total=0,entries=0;
    const fail=(error:unknown)=>{zip.close();reject(error);};
    zip.on("error",fail);zip.on("end",()=>resolve(files));
    zip.on("entry",entry=>{
      if (++entries>1500 || total+entry.uncompressedSize>16*1024*1024) return fail(new Error("leadership_archive_too_large"));
      if (!/^xl\/(?:sharedStrings\.xml|workbook\.xml|styles\.xml|_rels\/workbook\.xml.rels|worksheets\/sheet\d+\.xml|worksheets\/_rels\/sheet\d+\.xml.rels)$/.test(entry.fileName)) {zip.readEntry();return;}
      total+=entry.uncompressedSize;
      zip.openReadStream(entry,(error,stream)=>{
        if(error || !stream)return fail(error);
        const chunks:Buffer[]=[];let bytes=0;
        stream.on("data",chunk=>{bytes+=chunk.length;if(bytes>8*1024*1024){stream.destroy();fail(new Error("leadership_xml_too_large"));}else chunks.push(chunk);});
        stream.on("error",fail);stream.on("end",()=>{files[entry.fileName]=Buffer.concat(chunks).toString("utf8");zip.readEntry();});
      });
    });zip.readEntry();
  });
}
export function parseLeadershipWorkbook(files:Record<string,string>,fileName:string):LeadershipItem[] {
  const date=leadershipFileDate(fileName);if(!date)return [];
  const strings=[...(files["xl/sharedStrings.xml"]??"").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(x=>texts(x[1]));
  const names=[...(files["xl/workbook.xml"]??"").matchAll(/<sheet\s+([^>]+)\/?\s*>/g)].map(x=>attr(x[1],"name"));
  const items:LeadershipItem[]=[];
  const sheets=Object.entries(files).filter(([key])=>/^xl\/worksheets\/sheet\d+\.xml$/.test(key)).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
  for (const [index,[sheetPath,xml]] of sheets.entries()) {
    const relationships=new Map([...(files[`xl/worksheets/_rels/${path.posix.basename(sheetPath)}.rels`]??"").matchAll(/<Relationship\s+([^>]+)\/?\s*>/g)].map(x=>[attr(x[1],"Id"),attr(x[1],"Target")]));
    const links=new Map([...xml.matchAll(/<hyperlink\s+([^>]+)\/?\s*>/g)].map(x=>[attr(x[1],"ref"),relationships.get(attr(x[1],"r:id"))??attr(x[1],"display")]));
    let header:Record<string,string>|null=null;
    for(const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const cells:Record<string,string>={};
      for(const c of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        if(!c[2])continue;
        const column=attr(c[1],"r").replace(/\d/g,"");
        const value=c[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1]??"";
        cells[column]=(attr(c[1],"t")==="s"?strings[Number(value)]??"":attr(c[1],"t")==="inlineStr"?texts(c[2]):decode(value)).trim();
      }
      if(Object.values(cells).some(x=>/公司及岗位|公司.*岗位名称/.test(x))){header=cells;continue;}
      if(!header)continue;
      const value=(pattern:RegExp)=>cells[Object.keys(header!).find(k=>pattern.test(header![k]))??""]??"";
      const title=value(/公司.*岗位|岗位名称/),location=value(/实习地点|工作地点/),description=value(/招聘详情|岗位详情|职责/),application=value(/投递链接|申请链接|投递方式/);
      if(!title || !/实习|\bintern(?:ship)?s?\b/i.test(title) || !/投研|行研|投资|研究所|证券|基金|资本|银行|金融|财务|审计|风控|信贷|债券|衍生|量化|资产|交易|会计|咨询|investment|finance|risk|bank|equity|trading/i.test(title))continue;
      const lines=title.split(/\n/).filter(Boolean);const company=lines.length>1?lines[0].slice(0,240):title.match(/^(.{2,40}?(?:公司|证券|基金|资本|银行|投资|集团|事务所|咨询))/)?.[1]??"未知／待核实";
      if(/^(?:某|头部|知名|匿名|XX)/i.test(company.trim()))continue;
      const applyColumn=Object.keys(header).find(k=>/投递链接|申请链接|投递方式/.test(header![k]));
      const linked=links.get(`${applyColumn}${attr(row[1],"r")}`);
      const publicUrl=normalizeJobUrl(application.match(/https:\/\/[^\s<>"'，。]+/)?.[0]??linked??"");
      const key=createHash("sha256").update([publicUrl??"",title,location].join("\n")).digest("hex").slice(0,32);
      const evidence=`来源文件：${fileName}\n来源发布日期：${date}\n公司：${company}\n岗位：${title}\n地点：${location}\n招聘详情：${description}\n投递方式：${application}`.slice(0,6000);
      const item:LeadershipItem={id:`leadership:${key}`,url:publicUrl??`https://leadership.invalid/${key}`,title:title.replace(/\n/g," · "),company,location:location||"来源未注明",locationZh:location||"来源未注明",deadline:null,evidence,evidenceKind:"page_text",kind:"job",isRecruiting:true,
        summary:title.replace(/\n/g," · "),reason:"来自本地LEADERSHIP汇总表。",warning:"汇总表日期作为来源发布日期；招聘是否仍开放请核对投递渠道。",publishedAt:date,sourceTime:{from:date,to:date,basis:"filename",approximate:false},discoveredAt:new Date().toISOString(),
        localSource:{fileName,sheet:names[index]??`Sheet${index+1}`,row:Number(attr(row[1],"r")),key,publicUrl}};
      item.category=/研究所|证券.*研究|卖方/.test(title)?"二级卖方":/投行|投资银行|并购|债券承做/.test(title)?"投行":/私募股权|创投|风险投资|战略投资|投资分析|投资部|投资实习|PEVC|venture capital|private equity/i.test(title)?"PEVC":radarCategory(item);
      items.push(item);
    }
  }
  return items;
}
async function index(root:string) {
  const folder=await realpath(root);
  const names=(await readdir(folder,{withFileTypes:true})).filter(x=>x.isFile()&&!x.isSymbolicLink()&&x.name.endsWith(".xlsx")&&leadershipFileDate(x.name)).map(x=>x.name).sort((a,b)=>leadershipFileDate(b)!.localeCompare(leadershipFileDate(a)!)).slice(0,128);
  const unique=new Map<string,LeadershipItem>();
  for(const fileName of names){
    const file=await realpath(path.join(folder,fileName));if(path.dirname(file)!==folder)continue;
    const info=await stat(file);const key=`${file}:${info.mtimeMs}:${info.size}`;
    let items=cache.get(key);if(!items){items=parseLeadershipWorkbook(await readLeadershipArchive(file),fileName);if(cache.size>150)cache.clear();cache.set(key,items);}
    for(const item of items)if(!unique.has(item.id))unique.set(item.id,item);
  }
  return {items:[...unique.values()],files:names.length};
}
const decisionsPath=(owner:string)=>path.resolve(existsSync(path.join(process.cwd(),"apps/web/package.json"))?process.cwd():path.resolve(process.cwd(),"../.."),"work/leadership",`${owner}.json`);
export async function leadershipDecisions(owner:string):Promise<Record<string,"added"|"ignored">>{try{return JSON.parse(await readFile(decisionsPath(owner),"utf8"));}catch{return {};}}
export async function saveLeadershipDecision(owner:string,id:string,decision:"added"|"ignored") {
  if(!/^[a-zA-Z0-9-]+$/.test(owner))throw new Error("invalid_owner");
  const file=decisionsPath(owner);await mkdir(path.dirname(file),{recursive:true});
  const data=await leadershipDecisions(owner);data[id]=decision;
  const temporary=file+"."+randomUUID()+".tmp";await writeFile(temporary,JSON.stringify(data),{mode:0o600});await rename(temporary,file);
}
export async function leadershipLock<T>(owner:string,work:()=>Promise<T>):Promise<T>{const before=queues.get(owner)??Promise.resolve();const next=before.catch(()=>{}).then(work);queues.set(owner,next);try{return await next;}finally{if(queues.get(owner)===next)queues.delete(owner);}}
export async function searchLeadershipLocal(owner:string,preferences:RadarPreferences):Promise<LeadershipResult>{
  if(!leadershipEnabled(owner))return {items:[],files:0,records:0,available:false};
  try{
    const result=await index(process.env.LEADERSHIP_LOCAL_ROOT||rootDefault);const decisions=await leadershipDecisions(owner);
    const words=preferences.keywords.toLowerCase().split(/[\s,，、]+/).filter(Boolean);
    const matched=filteredRadarItems(result.items,{...preferences,source:"all"}).filter(x=>!words.length||words.some(word=>(x.title+" "+x.evidence).toLowerCase().includes(word))).map(x=>({...x,status:decisions[x.id]??"pending" as const}));
    return {items:matched.filter(x=>x.status!=="ignored").slice(0,150),files:result.files,records:result.items.length,available:true};
  }catch{return {items:[],files:0,records:0,available:false,message:"本地LEADERSHIP目录暂时无法读取。"};}
}
export async function leadershipItem(owner:string,key:string) {
  if(!leadershipEnabled(owner)||!/^leadership:[a-f0-9]{32}$/.test(key))throw new Error("local_source_not_found");
  const result=await index(process.env.LEADERSHIP_LOCAL_ROOT||rootDefault);
  const item=result.items.find(x=>x.id===key);if(!item)throw new Error("local_source_not_found");return item;
}
export async function leadershipFile(owner:string,key:string){const item=await leadershipItem(owner,key);const root=await realpath(process.env.LEADERSHIP_LOCAL_ROOT||rootDefault);const file=await realpath(path.join(root,item.localSource.fileName));if(path.dirname(file)!==root)throw new Error("local_source_not_found");return {fileName:item.localSource.fileName,bytes:await readFile(file)};}
