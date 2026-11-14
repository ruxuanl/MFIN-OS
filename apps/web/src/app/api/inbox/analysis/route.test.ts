import { beforeEach,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({user:vi.fn(),batch:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireUser:mocks.user}));
vi.mock("@/lib/gmail/insight-worker",()=>({runMailAnalysisBatch:mocks.batch}));
import { POST } from "./route";
beforeEach(()=>{vi.clearAllMocks();mocks.user.mockResolvedValue({id:"owner",isMock:false});mocks.batch.mockResolvedValue({status:"completed",processed:5});});
it("rejects cross-origin POSTs before authentication or work",async()=>{
  const response=await POST(new Request("http://localhost:3000/api/inbox/analysis",{method:"POST",headers:{origin:"https://other.invalid"}}));
  expect(response.status).toBe(403);expect(mocks.user).not.toHaveBeenCalled();expect(mocks.batch).not.toHaveBeenCalled();
});
it("derives the owner from the session, ignoring caller-supplied IDs",async()=>{
  const response=await POST(new Request("http://localhost:3000/api/inbox/analysis",{method:"POST",headers:{origin:"http://localhost:3000"},body:JSON.stringify({userId:"other-owner"})}));
  expect(mocks.batch).toHaveBeenCalledWith("owner");expect(await response.json()).toEqual({status:"completed",processed:5});
});
it("does not invoke external work in mock mode",async()=>{
  mocks.user.mockResolvedValue({id:"synthetic",isMock:true});
  const response=await POST(new Request("http://localhost:3000/api/inbox/analysis",{method:"POST",headers:{origin:"http://localhost:3000"}}));
  expect((await response.json()).status).toBe("idle");expect(mocks.batch).not.toHaveBeenCalled();
});
