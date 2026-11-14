import "server-only";

import OpenAI from "openai";

import { applicationPackMaxOutputTokens, applicationPackSchema, packInstructions, type PackPayload } from "@/lib/ai/application-pack";
import { getAiProvider, getOpenAiConfig } from "@/lib/config";
import { parseStructuredResult } from "@/lib/ai/structured-result";

export const resumePromptVersion = "resume_analysis_v1";
export const jdMatchPromptVersion = "jd_match_v1";

export type AiCallResult = {
  result: Record<string, unknown>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  actualHkdCents: number;
};

type ResumePayload = {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  extractedText: string;
};

const stringArray = { type: "array", items: { type: "string" } } as const;
const recommendationArray = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      priority: { type: "string", enum: ["high", "medium", "low"] },
      change: { type: "string" },
      evidence: { type: "string" }
    },
    required: ["priority", "change", "evidence"]
  }
} as const;

const resumeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overallScore: { type: "integer", minimum: 0, maximum: 100 },
    layoutScore: { type: "integer", minimum: 0, maximum: 100 },
    contentScore: { type: "integer", minimum: 0, maximum: 100 },
    clarityScore: { type: "integer", minimum: 0, maximum: 100 },
    atsScore: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    strengths: stringArray,
    risks: stringArray,
    recommendations: recommendationArray,
    layoutScope: { type: "string", enum: ["visual_and_content", "content_only"] }
  },
  required: ["overallScore", "layoutScore", "contentScore", "clarityScore", "atsScore",
    "summary", "strengths", "risks", "recommendations", "layoutScope"]
} as const;

const jdMatchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    qualificationScore: { type: "integer", minimum: 0, maximum: 100 },
    matchScore: { type: "integer", minimum: 0, maximum: 100 },
    recommendationIndex: { type: "integer", minimum: 0, maximum: 100 },
    urgencyScore: { type: "integer", minimum: 0, maximum: 100 },
    recommendation: { type: "string", enum: ["strong_apply", "apply", "conditional", "skip"] },
    summary: { type: "string" },
    keyResponsibilities: stringArray,
    keyRequirements: stringArray,
    matchedEvidence: stringArray,
    gapsAndRisks: stringArray,
    urgencyReason: { type: "string" },
    applicationStrategy: { type: "string" },
    resumeTailoring: recommendationArray,
    emailSubject: { type: "string" },
    emailBody: { type: "string" },
    confidenceNotes: stringArray
  },
  required: ["qualificationScore", "matchScore", "recommendationIndex", "urgencyScore",
    "recommendation", "summary", "keyResponsibilities", "keyRequirements", "matchedEvidence",
    "gapsAndRisks", "urgencyReason", "applicationStrategy", "resumeTailoring", "emailSubject",
    "emailBody", "confidenceNotes"]
} as const;

function resumeContent(resume: ResumePayload) {
  if (getAiProvider() === "deepseek") {
    if (!resume.extractedText.trim()) throw new Error("resume_text_unavailable");
    if (resume.extractedText.length > 60_000) throw new Error("ai_input_too_large");
    return [{
      type: "input_text" as const,
      text: `只分析已提取的简历文字与结构，没有提供视觉排版。layoutScope 必须为 content_only，layoutScore 必须为 0（未评估）。\n\n简历正文：\n${resume.extractedText}`
    }];
  }
  if (resume.mimeType === "application/pdf") {
    return [
      {
        type: "input_file" as const,
        file_data: `data:application/pdf;base64,${resume.bytes.toString("base64")}`,
        filename: resume.filename,
        detail: "low" as const
      },
      { type: "input_text" as const, text: "请结合 PDF 的视觉排版与内容分析这份简历。" }
    ];
  }
  return [{
    type: "input_text" as const,
    text: `DOCX 首版只做内容与结构分析，不假装看到了视觉排版。\n\n简历正文：\n${resume.extractedText}`
  }];
}

function price(inputTokens: number, outputTokens: number) {
  const config = getOpenAiConfig();
  const usd = inputTokens / 1_000_000 * config.inputUsdPerMillion
    + outputTokens / 1_000_000 * config.outputUsdPerMillion;
  return Math.ceil(usd * config.usdHkdRate * 100);
}

async function callStructured(
  safetyIdentifier: string,
  schemaName: string,
  schema: Record<string, unknown>,
  input: OpenAI.Responses.ResponseInput,
  maxOutputTokens?: number
): Promise<AiCallResult> {
  // A caller may raise the output bound (application packs need 4000 tokens); it stays explicit.
  const config = { ...getOpenAiConfig(), ...(maxOutputTokens ? { maxOutputTokens } : {}) };
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, maxRetries: 0, timeout: 60_000 });
  let response: OpenAI.Responses.Response;
  try {
    response = await client.responses.create({
    model: config.model,
    store: false,
    ...(config.provider === "openai" ? { safety_identifier: safetyIdentifier } : { reasoning: { effort: "none" as const }, temperature: 0 }),
    max_output_tokens: config.maxOutputTokens,
    instructions: "只返回符合所给 JSON Schema 的单个 JSON 对象。不要添加 Markdown、代码围栏、前言或结语。JSON 字符串内的换行必须转义。"
      + (config.provider === "deepseek" ? `\n必须返回全部 required 字段，包括常量字段。JSON Schema：${JSON.stringify(schema)}` : ""),
    input,
    text: { format: { type: "json_schema", name: schemaName, strict: true, schema } }
    });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? error.status : null;
    if (typeof status === "number" && [400, 401, 402, 403, 404, 422, 429].includes(status)) throw new Error("ai_provider_rejected");
    throw new Error("ai_usage_unsettled");
  }
  // A generated but unusable response may still be billed. Keep its reservation.
  if (response.status !== "completed" || !response.output_text || !response.usage) throw new Error("ai_usage_unsettled");
  if (![response.usage.input_tokens, response.usage.output_tokens].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("ai_usage_unsettled");
  }
  let parsed: Record<string, unknown>;
  try { parsed = parseStructuredResult(response.output_text, schema); } catch { throw new Error("ai_usage_unsettled"); }
  return {
    result: parsed,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    actualHkdCents: price(response.usage.input_tokens, response.usage.output_tokens)
  };
}

export function analyzeResume(safetyIdentifier: string, resume: ResumePayload) {
  const schema = getAiProvider() === "deepseek" ? {
    ...resumeSchema,
    properties: {
      ...resumeSchema.properties,
      layoutScore: { type: "integer", minimum: 0, maximum: 0 },
      layoutScope: { type: "string", enum: ["content_only"] }
    }
  } : resumeSchema;
  return callStructured(safetyIdentifier, "resume_analysis", schema, [{
    role: "user",
    content: [
      ...resumeContent(resume),
      { type: "input_text", text: "用中文输出可执行、基于证据的简历评分与建议。不得改写或覆盖文件。" }
    ]
  }]);
}

export function analyzeJdMatch(
  safetyIdentifier: string,
  resume: ResumePayload,
  jd: string,
  opportunityContext: string
) {
  return callStructured(safetyIdentifier, "jd_match_analysis", jdMatchSchema, [{
    role: "user",
    content: [
      ...resumeContent(resume),
      {
        type: "input_text",
        text: `请用中文凝练解读 JD，并基于简历证据分别判断资格、匹配、投递推荐与紧急度。提出针对性简历修改，但不要假装已经修改文件。最后生成一封可编辑的英文求职邮件正文；不得发送。\n\n岗位上下文：${opportunityContext}\n\nJD：\n${jd}`
      }
    ]
  }]);
}

// #15: drafts only. The payload is the closed whitelist from buildPackPayload (one JD, one
// confirmed resume version's text, pasted questions); store=false comes from callStructured.
export function generateApplicationPack(safetyIdentifier: string, payload: PackPayload) {
  return callStructured(safetyIdentifier, "application_pack", applicationPackSchema as unknown as Record<string, unknown>, [{
    role: "user",
    content: [{ type: "input_text", text: packInstructions(payload) }]
  }], applicationPackMaxOutputTokens);
}
