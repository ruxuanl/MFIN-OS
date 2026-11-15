import { requireUser } from "@/lib/auth/session";
import { requireRadarSourceAccess } from "@/lib/jobs/radar-access";
import { leadershipFile } from "@/lib/jobs/leadership-local";
export const runtime="nodejs";
export async function GET(_request:Request,context:{params:Promise<{key:string}>}){
  const user=await requireUser();if(user.isMock)return new Response("Not found",{status:404});
  try{
    await requireRadarSourceAccess(user.id);
    const {key}=await context.params;const file=await leadershipFile(user.id,`leadership:${key}`);
    return new Response(new Uint8Array(file.bytes),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,"Cache-Control":"private, no-store"}});
  }catch{return new Response("本地来源不可用或无权访问。",{status:404});}
}
