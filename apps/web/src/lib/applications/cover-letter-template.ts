import "server-only";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {createClient} from "@/lib/supabase/server";

// Personal starter text is runtime data, kept outside committed source and test fixtures.
export async function getCoverLetterTemplate(owner: string) {
  if(!/^[a-zA-Z0-9-]{1,64}$/.test(owner))return "";
  const root=existsSync(resolve(process.cwd(),"scripts"))?process.cwd():resolve(process.cwd(),"../..");
  try {return await readFile(join(root,"work/cover-letters",owner,"default.txt"),"utf8");}
  catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;return "";}
}
export async function getCoverLetterResumeId(analysisId:string|undefined){
 if(!analysisId)return null;
 const r=await (await createClient()).from("ai_analyses").select("resume_version_id").eq("id",analysisId).maybeSingle();
 if(r.error)throw r.error;return r.data?.resume_version_id??null;
}
