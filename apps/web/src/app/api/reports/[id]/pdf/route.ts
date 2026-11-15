import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentUser, hasFreshReauthentication } from "@/lib/auth/session";
import { archiveRoot } from "@/lib/reports/archive";
export const runtime="nodejs";
export async function GET(request: Request,{params}:{params:Promise<{id:string}>}) {
 const user=await getCurrentUser();if(!user || user.isMock)return new Response("请先登录",{status:401});
 const inline=new URL(request.url).searchParams.get("view")==="1";
 if(!inline && !await hasFreshReauthentication())return new Response("下载前请重新登录验证身份，再返回下载。",{status:403});
 const {id}=await params;if(!/^[0-9a-f-]{36}$/.test(id))return new Response(null,{status:404});
 try {const data=await readFile(join(archiveRoot(user.id),`${id}.pdf`));return new Response(data,{headers:{"Content-Type":"application/pdf","Content-Disposition":`${inline?"inline":"attachment"}; filename="mfin-report-${id}.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}
 catch{return new Response(null,{status:404});}
}
