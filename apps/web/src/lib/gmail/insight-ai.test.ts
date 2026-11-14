import { beforeEach,afterEach,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({ create:vi.fn(),options:vi.fn() }));
vi.mock("openai",()=>({ default:class { responses={create:mocks.create}; constructor(options:unknown){mocks.options(options);} } }));
import { analyzeMailBatch,mailFingerprint } from "./insight-ai";
const input={id:"synthetic-1",subject:"Interview invitation",sender:"Synthetic Recruiter",body:"Please confirm the interview.\nVerification code: 123456",receivedAt:"2026-11-14T12:00:00Z"};
const result={id:input.id,category:"job",priority:"important",summary:"请确认研究岗面试安排",reason:"明确的个人面试邀请",deadline:null,optionalOpportunity:false,relevantAction:true};
beforeEach(()=>{
  vi.clearAllMocks();
  for(const [k,v] of Object.entries({AI_PROVIDER:"deepseek",DEEPSEEK_API_KEY:"synthetic-key",DEEPSEEK_ANALYSIS_MODEL:"deepseek-flash",DEEPSEEK_INPUT_USD_PER_MILLION:"0.3",DEEPSEEK_OUTPUT_USD_PER_MILLION:"1.2",DEEPSEEK_USD_HKD_RATE:"8",DEEPSEEK_REQUEST_RESERVE_HKD_CENTS:"200"})) vi.stubEnv(k,v);
  mocks.create.mockResolvedValue({status:"completed",output_text:JSON.stringify({messages:[result]}),model:"deepseek-flash",usage:{input_tokens:100,output_tokens:60}});
});
afterEach(()=>vi.unstubAllEnvs());
it("sends bounded sanitized input, fixed standards, no storage and no retries",async()=>{
  const response=await analyzeMailBatch([input]);
  expect(response.results?.[0].result.priority).toBe("important");
  const request=mocks.create.mock.calls[0][0];
  expect(request.input).not.toContain("123456"); expect(request.store).toBe(false);
  expect(request.instructions).toContain("mail_insight_v1");
  expect(mocks.options.mock.calls[0][0]).toMatchObject({maxRetries:0,timeout:35000,baseURL:"https://api.deepseek.com"});
});
it("settles known billed usage even for invalid or mismatched AI output",async()=>{
  mocks.create.mockResolvedValue({status:"completed",output_text:JSON.stringify({messages:[{...result,id:"wrong-id"}]}),model:"deepseek-flash",usage:{input_tokens:100,output_tokens:60}});
  const response=await analyzeMailBatch([input]);
  expect(response.results).toBeNull(); expect(response.usage.cost).toBeGreaterThan(0);
});
it("retains uncertainty on transport/usage failure without retry",async()=>{
  mocks.create.mockRejectedValue(new Error("timeout"));
  await expect(analyzeMailBatch([input])).rejects.toThrow("timeout"); expect(mocks.create).toHaveBeenCalledTimes(1);
});
it("fingerprints include content and model but exclude removed secrets",()=>{
  const fingerprint=mailFingerprint(input);
  expect(mailFingerprint({...input,body:input.body.replace("123456","999999")})).toBe(fingerprint);
  expect(mailFingerprint({...input,subject:"Different subject"})).not.toBe(fingerprint);
  vi.stubEnv("DEEPSEEK_ANALYSIS_MODEL","deepseek-v4-pro"); expect(mailFingerprint(input)).not.toBe(fingerprint);
});
