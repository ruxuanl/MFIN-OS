import "server-only";
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {resolve} from "node:path";
export function resumeVisual(bytes:Buffer,mimeType:string):Promise<{images:string[];layoutText:string}>{
 const script=[resolve(process.cwd(),"scripts/resume-visual.py"),resolve(process.cwd(),"../../scripts/resume-visual.py")].find(existsSync);
 if(!script)return Promise.reject(new Error("resume_visual_unavailable"));
 return new Promise((done,reject)=>{
  const child=spawn(process.platform==="win32"?"py":"python3",[...(process.platform==="win32"?["-3"]:[]),script,mimeType==="application/pdf"?"pdf":"docx"],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
  const output:Buffer[]=[];let size=0;const timeout=setTimeout(()=>{child.kill();reject(new Error("resume_visual_timeout"));},20000);
  child.stdout.on("data",(b:Buffer)=>{size+=b.length;if(size>8*1024*1024){child.kill();reject(new Error("resume_visual_too_large"));}else output.push(b);});
  child.stderr.resume();child.on("error",()=>{clearTimeout(timeout);reject(new Error("resume_visual_unavailable"));});
  child.on("close",code=>{clearTimeout(timeout);if(code!==0)return reject(new Error("resume_visual_failed"));try{done(JSON.parse(Buffer.concat(output).toString("utf8")));}catch{reject(new Error("resume_visual_failed"));}});
  child.stdin.on("error",()=>{});child.stdin.end(bytes);
 });
}
