import { beforeEach,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({ rpc:vi.fn(),read:vi.fn(),analyze:vi.fn(),fingerprint:vi.fn() }));
vi.mock("@/lib/supabase/service",()=>({createServiceClient:()=>({rpc:mocks.rpc})}));
vi.mock("@/lib/config",()=>({getOpenAiConfig:()=>({provider:"deepseek",reserveHkdCents:200})}));
vi.mock("./service",()=>({readGmailForAnalysis:mocks.read}));
vi.mock("./insight-ai",()=>({analyzeMailBatch:mocks.analyze,mailFingerprint:mocks.fingerprint}));
import { runMailAnalysisBatch } from "./insight-worker";
const claim={id:"synthetic-mail",providerId:"provider-1",token:"token",fingerprint:null,hasResult:false};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.rpc.mockImplementation(async(_name:string,args:{target_action:string})=>({data:args.target_action==="claim" ? [claim] : args.target_action==="reserve" ? "usage-id" : true,error:null}));
  mocks.read.mockResolvedValue({subject:"Interview",body:"Synthetic interview",senderSummary:"Example",receivedAt:"2026-11-14T00:00:00Z"});
  mocks.fingerprint.mockReturnValue("f".repeat(64));
  mocks.analyze.mockResolvedValue({results:[{id:claim.id,result:{category:"job",priority:"important",summary:"面试通知"}}],usage:{cost:1,model:"deepseek-flash",inputTokens:100,outputTokens:30}});
});
it("does not read Gmail or call AI when permission is off",async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{message:"mail_permission_denied"}});
  expect((await runMailAnalysisBatch("user")).status).toBe("paused"); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.analyze).not.toHaveBeenCalled();
});
it("stops before AI when shared budget is exhausted",async()=>{
  mocks.rpc.mockImplementation(async(_n:string,a:{target_action:string})=>a.target_action==="reserve" ? {data:null,error:{message:"ai_monthly_budget_exceeded"}} : {data:a.target_action==="claim" ? [claim] : true,error:null});
  expect((await runMailAnalysisBatch("user")).status).toBe("failed"); expect(mocks.analyze).not.toHaveBeenCalled();
  expect(mocks.rpc.mock.calls.some(call=>call[1].target_action==="fail" && call[1].payload.code==="budget_exceeded")).toBe(true);
});
it("reuses a matching fingerprint without another reservation or AI call",async()=>{
  mocks.rpc.mockImplementation(async(_n:string,a:{target_action:string})=>({data:a.target_action==="claim" ? [{...claim,fingerprint:"f".repeat(64),hasResult:true}] : true,error:null}));
  expect((await runMailAnalysisBatch("user")).processed).toBe(1);
  expect(mocks.analyze).not.toHaveBeenCalled(); expect(mocks.rpc.mock.calls.some(call=>call[1].target_action==="reserve")).toBe(false);
});
it("commits after billing and permission checks without touching legacy updates",async()=>{
  expect((await runMailAnalysisBatch("user")).status).toBe("completed");
  expect(mocks.rpc.mock.calls.map(call=>call[1].target_action)).toEqual(["claim","reserve","check","finish"]);
});
it("records safe failure after a timeout and does not retry in the batch",async()=>{
  mocks.analyze.mockRejectedValue(new Error("timeout"));
  expect((await runMailAnalysisBatch("user")).status).toBe("failed"); expect(mocks.analyze).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls.at(-1)?.[1].target_action).toBe("fail");
});
it("settles invalid billed output before marking the claim failed",async()=>{
  mocks.analyze.mockResolvedValue({results:null,usage:{cost:1,model:"deepseek-flash",inputTokens:100,outputTokens:30}});
  await runMailAnalysisBatch("user"); expect(mocks.rpc.mock.calls.slice(-2).map(call=>call[1].target_action)).toEqual(["finish","fail"]);
});
it("preserves cancellation if permission is revoked during the provider request",async()=>{
  mocks.rpc.mockImplementation(async(_n:string,a:{target_action:string})=>({data:a.target_action==="claim" ? [claim] : a.target_action==="reserve" ? "usage-id" : a.target_action!=="finish",error:null}));
  expect((await runMailAnalysisBatch("user")).status).toBe("paused");
});
