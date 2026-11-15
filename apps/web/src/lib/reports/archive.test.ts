import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {rm,writeFile,mkdir} from "node:fs/promises";
import {join} from "node:path";
const m=vi.hoisted(()=>({rpc:vi.fn(),create:vi.fn(),sourceError:false}));
vi.mock("@/lib/supabase/service",()=>({createServiceClient:()=>({rpc:m.rpc,from:()=>{
 const result={data:[],error:m.sourceError?{code:"READ_FAILED"}:null};
 const builder:Record<string,unknown>={then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};
 for(const name of ["select","eq","lte","gte","or","order","limit"])builder[name]=()=>builder;
 return builder;
}})}));
vi.mock("@/lib/config",()=>({getOpenAiConfig:()=>({provider:"deepseek",apiKey:"synthetic",model:"deepseek-flash",baseURL:"https://api.deepseek.com",reserveHkdCents:50,inputUsdPerMillion:0.3,outputUsdPerMillion:1.2,usdHkdRate:8})}));
vi.mock("openai",()=>({default:class{responses={create:m.create}}}));
import {generateBrief,archiveRoot,runDueBriefs} from "./archive";
const owner="synthetic-report-tests",now=new Date("2026-11-15T14:31:00Z");
beforeEach(async()=>{
 m.rpc.mockReset();m.create.mockReset();m.sourceError=false;
 await rm(archiveRoot(owner),{recursive:true,force:true});
 m.rpc.mockImplementation(async(_name,args)=>({data:{allowed:true,revision:"1",usageId:"test",...args},error:null}));
});
afterEach(async()=>{await rm(archiveRoot(owner),{recursive:true,force:true});});
describe("report permission and accounting boundaries",()=>{
 it("blocks before reading data or calling the model",async()=>{
  m.rpc.mockResolvedValue({data:{allowed:false,revision:"1"},error:null});
  await expect(generateBrief(owner,"daily",now)).rejects.toThrow("permission");expect(m.create).not.toHaveBeenCalled();
 });
 it("fails closed on a missing source, without reserving paid usage",async()=>{
  m.sourceError=true;await expect(generateBrief(owner,"daily",now)).rejects.toThrow("report_source");expect(m.create).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledTimes(1);
 });
 it("cancels its reservation when permission changes before the request",async()=>{
  m.rpc.mockResolvedValueOnce({data:{allowed:true,revision:"1"}}).mockResolvedValueOnce({data:{revision:"1",usageId:"test"}}).mockResolvedValueOnce({data:{allowed:false,revision:"2"}});
  await expect(generateBrief(owner,"daily",now)).rejects.toThrow("permission_changed");expect(m.create).not.toHaveBeenCalled();expect(m.rpc.mock.calls.at(-1)?.[1].target_action).toBe("cancel");
 });
 it("retains unknown usage after a provider timeout",async()=>{
  m.create.mockRejectedValue(new Error("timeout"));await expect(generateBrief(owner,"daily",now)).rejects.toThrow("timeout");expect(m.rpc.mock.calls.at(-1)?.[1].target_action).toBe("uncertain");
 });
 it("settles paid usage but discards the result after revocation",async()=>{
  m.create.mockResolvedValue({usage:{input_tokens:200,output_tokens:100},model:"deepseek-flash",status:"completed",output_text:'{}'});
  m.rpc.mockImplementation(async(_name,args)=>({data:{allowed:args.target_action!=="settle",revision:"1",usageId:"test"}}));
  await expect(generateBrief(owner,"daily",now)).rejects.toThrow("permission_changed");expect(m.rpc.mock.calls.at(-1)?.[1].target_action).toBe("settle");
 });
 it("never repeats a claimed scheduled run after failure",async()=>{
  await mkdir(archiveRoot(owner),{recursive:true});
  await writeFile(join(archiveRoot(owner),"attempt-daily-2026-11-15.json"),'{}');
  await writeFile(join(archiveRoot(owner),"attempt-weekly-2026-11-15.json"),'{}');
  await runDueBriefs(owner,now);expect(m.rpc).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
 });
});
