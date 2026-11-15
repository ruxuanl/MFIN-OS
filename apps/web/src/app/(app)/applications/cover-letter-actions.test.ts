import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({rpc:vi.fn(),generate:vi.fn(),load:vi.fn(),permission:true,revokedAfterCall:false,locked:false,owned:true,cached:false,conflict:false}));
const result={coverLetter:{text:"Synthetic optimized full letter",confidence:"high",evidence:[{claim:"Research",source:"jd",quote:"Research duties"}],missingInfo:[]}};
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(url);}}));vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireUser:async()=>({id:"synthetic-owner",isMock:false})}));
vi.mock("@/lib/resumes/text",()=>({loadResumeText:m.load}));
vi.mock("@/lib/config",()=>({getAiCacheScope:()=>"deepseek:synthetic",isOpenAiConfigured:()=>true,getOpenAiConfig:()=>({provider:"deepseek",reserveHkdCents:100,inputUsdPerMillion:0.3,outputUsdPerMillion:1.2,usdHkdRate:8})}));
vi.mock("@/lib/ai/openai-analysis",()=>({generateCoverLetter:m.generate,generateApplicationPack:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:m.rpc,from:(table:string)=>{
 const builder={select:()=>builder,eq:()=>builder,maybeSingle:async()=>({error:null,data:table==="opportunities"?{company:"Synthetic Capital",role_title:"Intern",raw_jd:"Research duties"}:table==="resume_versions"?(m.owned?{id:"version"}:null):table==="application_drafts"?{locked:m.locked}:m.cached?{id:"cached",result}:null})};return builder;
}})}));
import {generateCoverLetterAction} from "./draft-actions";
const job="11111111-1111-4111-8111-111111111111";
function form(){const f=new FormData();Object.entries({opportunityId:job,returnTo:`/internships/${job}`,resumeVersionId:"22222222-2222-4222-8222-222222222222",defaultLetter:"Edited synthetic default",baseVersion:"2"}).forEach(([k,v])=>f.set(k,v));return f;}
beforeEach(()=>{
 vi.clearAllMocks();Object.assign(m,{permission:true,revokedAfterCall:false,locked:false,owned:true,cached:false,conflict:false});m.load.mockResolvedValue("Synthetic resume research");m.generate.mockResolvedValue({result,model:"deepseek-flash",inputTokens:100,outputTokens:80,actualHkdCents:1});
 m.rpc.mockImplementation(async(name:string)=>({error:name==="save_my_application_draft"&&m.conflict?{message:"draft_version_conflict"}:null,data:name==="get_my_permission_decision"?[{allowed:m.permission&&!(m.revokedAfterCall&&m.generate.mock.calls.length)}]:name==="reserve_my_ai_usage_for_provider"?"usage":name==="complete_my_ai_analysis"?"analysis":1}));
});
describe("independent cover letter generation",()=>{
 it("uses the edited baseline and selected owned resume without requiring a package",async()=>{await expect(generateCoverLetterAction(form())).rejects.toThrow("drafts_generated");expect(m.generate.mock.calls[0][1].defaultLetter).toBe("Edited synthetic default");expect(m.load).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");expect(m.rpc).toHaveBeenCalledWith("save_my_application_draft",expect.objectContaining({target_field_key:"cover_letter_base",target_body:"Edited synthetic default",target_base_version:2}));expect(m.rpc).toHaveBeenCalledWith("complete_my_ai_analysis",expect.objectContaining({target_actual_hkd_cents:1}));});
 it("reuses a matching cached result without billing",async()=>{m.cached=true;await expect(generateCoverLetterAction(form())).rejects.toThrow("drafts_cached");expect(m.generate).not.toHaveBeenCalled();expect(m.rpc.mock.calls.some(c=>c[0]==="reserve_my_ai_usage_for_provider")).toBe(false);});
 it("blocks revoked permissions before reading resume",async()=>{m.permission=false;await expect(generateCoverLetterAction(form())).rejects.toThrow("permission_required");expect(m.load).not.toHaveBeenCalled();expect(m.generate).not.toHaveBeenCalled();});
 it("rejects a foreign resume without calling the provider",async()=>{m.owned=false;await expect(generateCoverLetterAction(form())).rejects.toThrow("resume_unavailable");expect(m.load).not.toHaveBeenCalled();expect(m.generate).not.toHaveBeenCalled();});
 it("preserves manually locked AI text and avoids charges",async()=>{m.locked=true;await expect(generateCoverLetterAction(form())).rejects.toThrow("draft_locked");expect(m.generate).not.toHaveBeenCalled();});
 it("detects stale baseline versions before generating",async()=>{m.conflict=true;await expect(generateCoverLetterAction(form())).rejects.toThrow("draft_conflict");expect(m.generate).not.toHaveBeenCalled();});
 it("settles known paid usage but does not apply after revocation",async()=>{m.revokedAfterCall=true;await expect(generateCoverLetterAction(form())).rejects.toThrow("permission_required");expect(m.rpc.mock.calls.some(c=>c[0]==="complete_my_ai_analysis")).toBe(true);expect(m.rpc.mock.calls.some(c=>c[0]==="apply_my_application_pack")).toBe(false);});
 it("keeps uncertain usage reserved after a timeout",async()=>{m.generate.mockRejectedValue(new Error("ai_usage_unsettled"));await expect(generateCoverLetterAction(form())).rejects.toThrow("ai_usage_unsettled");expect(m.rpc.mock.calls.some(c=>c[0]==="fail_my_ai_usage")).toBe(false);});
});
