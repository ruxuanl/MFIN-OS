import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { normalizeJobUrl, type RadarItem } from "./radar-model";
import { parseRadarSourceTime, radarSourceTime, type RadarSourceTime } from "./radar-source-time";
import { extractPageRadarLocation, radarJobLocation } from "./radar-location";
type Metadata={time:RadarSourceTime|null;location?:string;reference?:string;deadline?:string;closed?:boolean;expires:number};
const state=globalThis as typeof globalThis & {radarSourceMetadataV2?:Map<string,Metadata>};
const cache=state.radarSourceMetadataV2??=new Map();
export function publicPageAddress(ip:string) {
  if(isIP(ip)===6)return /^[23][0-9a-f]{3}:/i.test(ip)&&!/^2002:|^2001:(?:0:|db8:|10:)/i.test(ip);
  if(isIP(ip)!==4)return false;
  const [a,b]=ip.split(".").map(Number);
  return a!==0&&a!==10&&a!==127&&a<224&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0))&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19));
}
const decode=(text:string)=>text.replace(/&quot;/g,'"').replace(/&#(?:34|x22);/gi,'"').replace(/&amp;/g,"&");
export function extractIguopinMetadata(input:unknown,now=new Date()):Omit<Metadata,"expires">{
  const root=input&&typeof input==="object"?input as Record<string,unknown>:{};
  const data=root.data&&typeof root.data==="object"?root.data as Record<string,unknown>:root;
  const districts=Array.isArray(data.district_list)?data.district_list:[];
  const locations=districts.flatMap((row:unknown)=>{if(!row||typeof row!=="object")return [];const d=row as Record<string,unknown>;return typeof d.area_cn==="string"?[d.area_cn+(typeof d.address==="string"&&d.address?" · "+d.address:"")]:[];});
  const time=parseRadarSourceTime(data.update_time,"");
  const deadline=typeof data.end_time==="string"?data.end_time.match(/^\d{4}-\d{2}-\d{2}/)?.[0]:undefined;
  const end=typeof data.end_time==="string"?Date.parse(data.end_time.replace(" ","T")+"+08:00"):NaN;
  return {time:time?{...time,basis:"updated",approximate:false,reference:"国聘职位更新时间"}:null,location:locations.length?[...new Set(locations)].join("、"):undefined,reference:"国聘职位工作地点",deadline,closed:Number.isFinite(end)&&end<now.getTime()};
}
export function extractPageSourceTime(html:string,lastModified:string|null,url:string,now=new Date()):RadarSourceTime|null {
  const text=decode(html);
  const meta=[...text.matchAll(/<meta\b([^>]+)>/gi)];
  for(const pattern of [/article:published_time|datepublished|publish_date|publishdate|pubdate|datecreated/i,/article:modified_time|og:updated_time|datemodified|last-modified|lastmodified|modified_date|updated_time/i]){
    for(const entry of meta){const tag=entry[1];const name=tag.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)/i)?.[1]??"";
      const content=tag.match(/content\s*=\s*["']([^"']+)/i)?.[1];if(!pattern.test(name)||!content)continue;
      const result=parseRadarSourceTime(content,"");if(result)return {...result,basis:/modif|updat/i.test(name)?"updated":"published",approximate:false,reference:`网页 ${name}`};
    }
  }
  const json=text.match(/["']datePublished["']\s*:\s*["']([^"']+)/i)??text.match(/["']dateModified["']\s*:\s*["']([^"']+)/i);
  if(json){const result=parseRadarSourceTime(json[1],"");if(result)return {...result,basis:/dateModified/i.test(json[0])?"updated":"published",approximate:false,reference:"网页结构化日期"};}
  const seconds=text.match(/\b(?:var\s+)?ct\s*=\s*["']?(\d{10})\b/)?.[1];
  if(seconds&&new URL(url).hostname==="mp.weixin.qq.com"){const result=parseRadarSourceTime(new Date(Number(seconds)*1000).toISOString(),"");if(result)return {...result,basis:"published",approximate:false,reference:"公众号文章时间"};}
  const stripped=text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g,"\n").replace(/&nbsp;/g," ");
  const body=parseRadarSourceTime(null,stripped.slice(0,24000),now);if(body)return {...body,reference:"网页日期标注"};
  if(lastModified){const result=parseRadarSourceTime(lastModified,"");if(result)return {...result,basis:"updated",approximate:false,reference:"链接页 Last-Modified"};}
  const datedUrl=decodeURIComponent(new URL(url).pathname).match(/\b(20\d{2})[/.年-](\d{1,2})[/.月-](\d{1,2})(?:\D|$)/);
  if(datedUrl){const result=parseRadarSourceTime(`${datedUrl[1]}-${datedUrl[2]}-${datedUrl[3]}`,"");if(result)return {...result,basis:"published",approximate:true,reference:"来源链接日期"};}
  return null;
}
async function getPage(value:string,redirects=0):Promise<{html:string;modified:string|null;url:string}>{
  const normalized=normalizeJobUrl(value);if(!normalized||new URL(normalized).hostname.endsWith(".invalid"))throw new Error("source_url_unavailable");
  const url=new URL(normalized);const addresses=await lookup(url.hostname,{all:true});
  if(!addresses.length||addresses.some(x=>!publicPageAddress(x.address)))throw new Error("source_address_blocked");
  const address=addresses.find(x=>x.family===4)??addresses[0];
  return new Promise((resolve,reject)=>{
    const req=request({hostname:address.address,servername:url.hostname,port:443,path:url.pathname+url.search,method:"GET",headers:{Host:url.hostname,"User-Agent":"MFIN-OS Source-Date/1.0",Accept:"text/html,application/xhtml+xml,application/json"},timeout:6000},response=>{
      const status=response.statusCode??0;
      if(status>=300&&status<400&&response.headers.location){response.resume();if(redirects>=2)return reject(new Error("source_redirect_limit"));getPage(new URL(response.headers.location,url).toString(),redirects+1).then(resolve,reject);return;}
      if(status<200||status>=300){response.resume();reject(new Error("source_http_unavailable"));return;}
      const chunks:Buffer[]=[];let size=0;
      response.on("data",chunk=>{size+=chunk.length;if(size>768*1024){resolve({html:Buffer.concat(chunks).toString("utf8"),modified:typeof response.headers["last-modified"]==="string"?response.headers["last-modified"]:null,url:url.toString()});response.destroy();}else chunks.push(chunk);});
      response.on("error",reject);response.on("end",()=>resolve({html:Buffer.concat(chunks).toString("utf8"),modified:typeof response.headers["last-modified"]==="string"?response.headers["last-modified"]:null,url:url.toString()}));
    });const deadline=setTimeout(()=>req.destroy(new Error("source_timeout")),7000);req.on("close",()=>clearTimeout(deadline));req.on("timeout",()=>req.destroy(new Error("source_timeout")));req.on("error",reject);req.end();
  });
}
export async function enrichRadarPageTimes<T extends RadarItem>(items:T[]):Promise<T[]>{
  const output=[...items];const missing=items.map((item,index)=>({item,index})).filter(x=>!x.item.localSource&&(!radarSourceTime(x.item)||!radarJobLocation(x.item))).slice(0,10);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(3,missing.length)},async()=>{
    while(cursor<missing.length){const {item,index}=missing[cursor++];let entry=cache.get(item.url);
      if(!entry||entry.expires<Date.now()){
        let metadata:Omit<Metadata,"expires">={time:null};try{
          const url=new URL(item.url);const id=url.searchParams.get("id");
          if(/^(?:www\.)?iguopin\.com$/.test(url.hostname)&&/^\d{6,32}$/.test(id??"")){
            const response=await getPage(`https://gp-api.iguopin.com/api/jobs/v1/info?id=${id}`);metadata=extractIguopinMetadata(JSON.parse(response.html));
          }else{
            const page=await getPage(item.url);metadata={time:extractPageSourceTime(page.html,page.modified,page.url),location:extractPageRadarLocation(page.html)??undefined,reference:"原岗位页面工作地点"};
          }
        }catch{/* A blocked page never becomes a fabricated date or location. */}
        if(cache.size>500)cache.clear();entry={...metadata,expires:Date.now()+(metadata.time&&metadata.location?6*3600000:10*60000)};cache.set(item.url,entry);
      }
      if(entry.time)output[index]={...item,sourceTime:entry.time,sourceObservedAt:new Date().toISOString()};
      if(entry.location)output[index]={...output[index],location:entry.location,locationZh:entry.location,sourceLocation:{value:entry.location,reference:entry.reference??"岗位来源",observedAt:new Date().toISOString()}};
      if(entry.deadline)output[index]={...output[index],deadline:entry.deadline};
      if(entry.closed)output[index]={...output[index],kind:"closed"};
    }
  }));return output;
}
