import type { RadarItem } from "./radar-model";
const unknown=/^(?:未知|待核实|待核对|来源未注明|未注明|未披露|暂无|待定|n\/a|null|undefined|[-—\s]+$)/i;
const cities:[string,RegExp][]=[["北京",/Beijing|北京/i],["深圳",/Shenzhen|深圳/i],["上海",/Shanghai|上海/i],["香港",/Hong Kong|香港/i]];
const outside=/Canada|Canadian|Toronto|Montreal|Quebec|加拿大|蒙特利尔|多伦多|United States|\bUSA\b|New York|美国|纽约|United Kingdom|London|英国|伦敦|Australia|Sydney|澳大利亚|悉尼|Germany|France|德国|法国/i;
const translations:Record<string,string>={"Hong Kong":"香港",Beijing:"北京",Shenzhen:"深圳",Shanghai:"上海",Hangzhou:"杭州",Foshan:"佛山",Guangzhou:"广州",Dongguan:"东莞",Nanjing:"南京",Suzhou:"苏州",Wuhan:"武汉",Chengdu:"成都",Tianjin:"天津",Chongqing:"重庆",Singapore:"新加坡",China:"中国",Remote:"远程"};
export function meaningfulRadarLocation(value:unknown):value is string{return typeof value==="string"&&Boolean(value.trim())&&!unknown.test(value.trim());}
export function translateRadarLocation(value:string){let result=value.trim();for(const [english,chinese]of Object.entries(translations))result=result.replace(new RegExp(english,"gi"),chinese);return result;}
export function extractRadarJobLocation(evidence:string):string|null{
  const lines=evidence.replace(/<[^>]*>/g,"\n").replace(/[*#>]/g,"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    if(/^(?:相似岗位|相关推荐|推荐岗位|similar jobs|related jobs)\b/i.test(lines[i]))break;
    const label=lines[i].match(/^(?:工作地点|工作城市|实习地点|办公地点|职位地点|工作地址|地点|job location|location)\s*(?:[:：]\s*(.*)|$)/i);
    if(!label)continue;
    const value=label[1]?.trim()||lines[i+1];
    if(meaningfulRadarLocation(value)&&! /^(?:岗位|职责|任职|学历|薪酬|公司|招聘|投递|职位介绍)/.test(value))return translateRadarLocation(value.slice(0,240));
  }
  return null;
}
export function radarJobLocation(item:RadarItem):string|null{
  if(meaningfulRadarLocation(item.sourceLocation?.value))return translateRadarLocation(item.sourceLocation.value);
  if(item.localSource&&meaningfulRadarLocation(item.location))return translateRadarLocation(item.location);
  const titlePlace=item.title.match(/\s[—–]\s([^|]+)(?:\||$)/)?.[1]?.trim();
  if(titlePlace&&(cities.some(([,pattern])=>pattern.test(titlePlace))||outside.test(titlePlace))&&!/intern|实习/i.test(titlePlace))return translateRadarLocation(titlePlace);
  if(meaningfulRadarLocation(item.location))return translateRadarLocation(item.location);
  const evidence=extractRadarJobLocation(item.evidence);if(evidence)return evidence;
  if(meaningfulRadarLocation(item.locationZh))return translateRadarLocation(item.locationZh);
  return null;
}
export function matchesRadarRegion(item:RadarItem,region:string){
  const selected=region.split(","),place=radarJobLocation(item);
  const all=cities.every(([name])=>selected.includes(name))&&selected.includes("其他");
  if(!place)return all;
  const main=cities.filter(([,pattern])=>pattern.test(place)).map(([name])=>name);
  if(main.some(name=>selected.includes(name)))return true;
  if(outside.test(place))return false;
  if(all)return true;
  if(!selected.includes("其他")||main.length)return false;
  if(/^(?:全国|中国|中国大陆|亚洲|Asia|China|广东省?|远程|线上|多地|不限)$/i.test(place))return false;
  return /[\u3400-\u9fff]|Singapore|Taipei|Tokyo|Seoul|Mumbai|Bangalore|India|Japan|Korea/i.test(place);
}
export function extractPageRadarLocation(html:string):string|null{
  const text=html.replace(/&quot;|&#34;/g,'"').replace(/&nbsp;/g," ");
  // Only a JobPosting's location is relevant; never use an Organization's HQ.
  for(const script of text.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const root:unknown=JSON.parse(script[1]);const entries=Array.isArray(root)?root:[root];
      for(const entry of entries){if(!entry||typeof entry!=="object")continue;const obj=entry as Record<string,unknown>;const nodes=Array.isArray(obj["@graph"])?obj["@graph"]:[obj];
        for(const node of nodes){if(!node||typeof node!=="object"||!String(JSON.stringify((node as Record<string,unknown>)["@type"])??"").includes("JobPosting"))continue;
          const jobs=(node as Record<string,unknown>).jobLocation;const list=Array.isArray(jobs)?jobs:[jobs];const places:string[]=[];
          for(const job of list){if(!job||typeof job!=="object")continue;const address=(job as Record<string,unknown>).address;if(!address||typeof address!=="object")continue;const a=address as Record<string,unknown>;const city=a.addressLocality;const street=a.streetAddress;if(typeof city==="string")places.push([city,typeof street==="string"?street:""].filter(Boolean).join(" · "));}
          if(places.length)return translateRadarLocation(places.join("、"));
        }
      }
    }catch{/* Ignore malformed structured data. */}
  }
  return extractRadarJobLocation(text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,""));
}
