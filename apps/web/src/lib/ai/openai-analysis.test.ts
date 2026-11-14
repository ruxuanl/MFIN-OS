import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), options: vi.fn() }));
vi.mock("openai", () => ({ default: class {
  responses = { create: mocks.create };
  constructor(options: unknown) { mocks.options(options); }
} }));

import { analyzeResume, generateApplicationPack } from "./openai-analysis";

beforeEach(() => {
  vi.clearAllMocks();
  for (const [name, value] of Object.entries({
    AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "synthetic-key", DEEPSEEK_ANALYSIS_MODEL: "deepseek-flash",
    DEEPSEEK_INPUT_USD_PER_MILLION: "0.3", DEEPSEEK_OUTPUT_USD_PER_MILLION: "1.2",
    DEEPSEEK_USD_HKD_RATE: "8", DEEPSEEK_REQUEST_RESERVE_HKD_CENTS: "200"
  })) vi.stubEnv(name, value);
  mocks.create.mockResolvedValue({ status: "completed", output_text: JSON.stringify({
    overallScore: 70, layoutScore: 0, contentScore: 70, clarityScore: 70, atsScore: 70,
    summary: "Synthetic assessment.", strengths: [], risks: [], recommendations: [], layoutScope: "content_only"
  }), model: "deepseek-flash", usage: { input_tokens: 100, output_tokens: 50 } });
});
afterEach(() => { vi.unstubAllEnvs(); });

const resume = { filename: "synthetic.pdf", mimeType: "application/pdf", bytes: Buffer.from("FILE_BYTES_NOT_FOR_DEEPSEEK"), extractedText: "Synthetic applicant: Python and Excel." };

describe("DeepSeek adapter contract", () => {
  it("sends extracted PDF text with content-only schema and no file bytes or user identifier", async () => {
    await analyzeResume("private-user-hash", resume);
    const request = mocks.create.mock.calls[0][0];
    expect(JSON.stringify(request.input)).toContain(resume.extractedText);
    expect(JSON.stringify(request)).not.toContain(resume.bytes.toString("base64"));
    expect(request.safety_identifier).toBeUndefined();
    expect(request.store).toBe(false);
    expect(request.reasoning.effort).toBe("none");
    expect(request.text.format.schema.properties.layoutScope.enum).toEqual(["content_only"]);
    expect(request.text.format.schema.properties.layoutScore.maximum).toBe(0);
    expect(mocks.options.mock.calls[0][0]).toMatchObject({ baseURL: "https://api.deepseek.com", apiKey: "synthetic-key", maxRetries: 0 });
  });

  it("stops without any network call when extracted text is missing", async () => {
    expect(() => analyzeResume("synthetic-id", { ...resume, extractedText: " " })).toThrow("resume_text_unavailable");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects incomplete responses and never attempts a fallback provider", async () => {
    mocks.create.mockResolvedValue({ status: "incomplete", output_text: "{}", usage: { input_tokens: 1, output_tokens: 1 } });
    await expect(analyzeResume("synthetic-id", resume)).rejects.toThrow("ai_usage_unsettled");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("keeps application drafts on the same bounded structured request path", async () => {
    const field = { text: "Synthetic draft.", confidence: "low", evidence: [], missingInfo: [] };
    mocks.create.mockResolvedValueOnce({ status: "completed", output_text: JSON.stringify({
      gapExplanation: field, tailoringPoints: field, coverLetter: field, answers: []
    }), model: "deepseek-flash", usage: { input_tokens: 100, output_tokens: 50 } });
    const result = await generateApplicationPack("synthetic-id", { jd: { company: "Example", roleTitle: "Analyst", text: "Research" }, resume: { versionId: "synthetic", text: "Excel" }, questions: [] });
    expect(mocks.create.mock.calls[0][0].max_output_tokens).toBe(4000);
    expect(mocks.create.mock.calls[0][0].text.format.type).toBe("json_schema");
    expect(result.actualHkdCents).toBe(1);
  });

  it("preserves budget when a generated result fails validation", async () => {
    mocks.create.mockResolvedValue({ status: "completed", output_text: "{} trailing", usage: { input_tokens: 100, output_tokens: 50 } });
    await expect(analyzeResume("synthetic-id", resume)).rejects.toThrow("ai_usage_unsettled");
  });

  it("preserves budget on transport failures without automatically retrying", async () => {
    mocks.create.mockRejectedValue(new Error("synthetic timeout"));
    await expect(analyzeResume("synthetic-id", resume)).rejects.toThrow("ai_usage_unsettled");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a provider's explicit pre-generation rejection", async () => {
    mocks.create.mockRejectedValue({ status: 402 });
    await expect(analyzeResume("synthetic-id", resume)).rejects.toThrow("ai_provider_rejected");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
