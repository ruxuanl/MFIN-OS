import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), response: vi.fn(), configured: true }));
vi.mock("@/lib/config", () => ({ getOpenAiConfig: () => ({ provider: "deepseek", apiKey: "synthetic", baseURL: "https://api.deepseek.com", model: "deepseek-flash", inputUsdPerMillion: 1, outputUsdPerMillion: 2, usdHkdRate: 7.8, reserveHkdCents: 50 }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc: mock.rpc }) }));
vi.mock("openai", () => ({ default: class { responses = { create: mock.response }; } }));
import { generateGroundedAnswer, validateGroundedOutput } from "./grounded-ai";
const hits = [{ id: "doc:1", text: "合成：增长率百分之二。", file: "synthetic.txt", page: 1 }];
const raw = JSON.stringify({ claims: [{ text: "增长率百分之二。", kind: "source_fact", citation_ids: ["doc:1"] }], missing_information: [] });
describe("host grounded AI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.rpc.mockImplementation(async () => ({ data: { usageId: "usage", allowed: true, revision: "v1" }, error: null }));
    mock.response.mockResolvedValue({ status: "completed", model: "deepseek-flash", output_text: raw, usage: { input_tokens: 100, output_tokens: 100 } });
  });
  it("refuses unsupported citations and unmarked source claims", () => {
    expect(() => validateGroundedOutput(raw.replace("doc:1", "other:2"), hits)).toThrow("invalid_ai_citation");
    expect(() => validateGroundedOutput(raw.replace('["doc:1"]', "[]"), hits)).toThrow("invalid_ai_citation");
  });
  it("does not spend or invoke the model when evidence is absent or permission is denied", async () => {
    await generateGroundedAnswer("owner", { question: "无依据", hits: [] });
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.rpc.mockResolvedValue({ error: { message: "interview_ai_permission_denied" } });
    await expect(generateGroundedAnswer("owner", { question: "增长率", hits })).rejects.toThrow("开启");
    expect(mock.response).not.toHaveBeenCalled();
  });
  it("sends only bounded evidence, disables storage/retries and settles known usage before returning", async () => {
    const r = await generateGroundedAnswer("owner", { question: "增长率", hits });
    expect(r.answer).toContain("[1]");
    expect(mock.response).toHaveBeenCalledWith(expect.objectContaining({ store: false, max_output_tokens: 1800 }));
    expect(mock.rpc.mock.calls.map(c => c[1].target_action)).toEqual(["reserve", "check", "settle"]);
    expect(mock.rpc.mock.calls[2][1].payload).toEqual(expect.objectContaining({ cost: 1, inputTokens: 100 }));
  });
  it("settles malformed but billed results and discards them", async () => {
    mock.response.mockResolvedValue({ status: "completed", model: "deepseek-flash", output_text: "invalid", usage: { input_tokens: 100, output_tokens: 100 } });
    await expect(generateGroundedAnswer("owner", { question: "增长率", hits })).rejects.toThrow("未完成");
    expect(mock.rpc.mock.calls.map(c => c[1].target_action)).toEqual(["reserve", "check", "settle"]);
  });
  it("retains the reservation when the transport fails and never retries automatically", async () => {
    mock.response.mockRejectedValue(new Error("secret provider body"));
    await expect(generateGroundedAnswer("owner", { question: "增长率", hits })).rejects.toThrow("未完成");
    expect(mock.response).toHaveBeenCalledTimes(1);
    expect(mock.rpc.mock.calls.at(-1)?.[1].target_action).toBe("uncertain");
  });
  it("discards billed output when permission changed during the call", async () => {
    mock.rpc.mockImplementation(async (_: string, args: { target_action: string }) => ({ data: { usageId: "usage", allowed: true, revision: args.target_action === "settle" ? "v2" : "v1" }, error: null }));
    await expect(generateGroundedAnswer("owner", { question: "增长率", hits })).rejects.toThrow("权限已变更");
    expect(mock.rpc.mock.calls.at(-1)?.[1].target_action).toBe("settle");
  });

  it("does not call the provider when the shared budget is exhausted", async () => {
    mock.rpc.mockResolvedValue({ error: { message: "ai_monthly_budget_exceeded" } });
    await expect(generateGroundedAnswer("owner", { question: "增长率", hits })).rejects.toThrow("预算不足");
    expect(mock.response).not.toHaveBeenCalled();
  });

  it("cancels an unused reservation when permission changes before the provider call", async () => {
    mock.rpc.mockImplementation(async (_: string, args: { target_action: string }) => ({ data: { usageId: "usage", allowed: true, revision: args.target_action === "check" ? "v2" : "v1" }, error: null }));
    await expect(generateGroundedAnswer("owner", { question: "增长率", hits })).rejects.toThrow("权限已变更");
    expect(mock.response).not.toHaveBeenCalled();
    expect(mock.rpc.mock.calls.map(c => c[1].target_action)).toEqual(["reserve", "check", "cancel"]);
  });

  it("keeps billed output hidden if accounting cannot be confirmed", async () => {
    mock.rpc.mockImplementation(async (_: string, args: { target_action: string }) => args.target_action === "settle"
      ? { error: { message: "accounting unavailable" } }
      : { data: { usageId: "usage", allowed: true, revision: "v1" }, error: null });
    await expect(generateGroundedAnswer("owner", { question: "增长率", hits })).rejects.toThrow("未完成");
    expect(mock.response).toHaveBeenCalledTimes(1);
    expect(mock.rpc.mock.calls.at(-1)?.[1].target_action).toBe("uncertain");
  });
});
