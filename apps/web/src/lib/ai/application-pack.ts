// Application pack drafts (#15, D29): pure helpers, no server imports (vitest loads this directly).
// The payload is a closed whitelist: one JD, one confirmed resume version's text, and questions the
// user pasted. Nothing else about the user, the opportunity or the inbox is ever sent.
export const applicationPackPromptVersion = "application_pack_v1";
export const applicationPackMaxOutputTokens = 4_000;
export const maxPackQuestions = 5;
export const maxQuestionLength = 500;
export const maxJdLength = 12_000;
export const maxResumeTextLength = 20_000;

export type PackPayload = {
  jd: { company: string; roleTitle: string; text: string };
  resume: { versionId: string; text: string };
  questions: string[];
};

export const packPayloadKeys = ["jd", "resume", "questions"] as const;

export function parseQuestions(raw: string) {
  return raw.split(/\r?\n/u)
    .map((line) => line.replace(/^\s*(\d+[.)、]|[-*•])\s*/u, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, maxPackQuestions)
    .map((line) => line.slice(0, maxQuestionLength));
}

export function buildPackPayload(input: {
  company: string;
  roleTitle: string;
  jdText: string;
  resumeVersionId: string;
  resumeText: string;
  questions: string[];
}): PackPayload {
  const jdText = input.jdText.trim();
  const resumeText = input.resumeText.trim();
  if (!jdText) throw new Error("pack_jd_required");
  if (!resumeText) throw new Error("pack_resume_text_required");
  return {
    jd: { company: input.company.slice(0, 240), roleTitle: input.roleTitle.slice(0, 240), text: jdText.slice(0, maxJdLength) },
    resume: { versionId: input.resumeVersionId, text: resumeText.slice(0, maxResumeTextLength) },
    questions: input.questions.slice(0, maxPackQuestions).map((question) => question.slice(0, maxQuestionLength))
  };
}

// Stable string for the cache fingerprint: identical inputs never bill twice.
export function fingerprintSource(payload: PackPayload) {
  return JSON.stringify([applicationPackPromptVersion, payload.jd.company, payload.jd.roleTitle, payload.jd.text,
    payload.resume.versionId, payload.resume.text, payload.questions]);
}

// Reserve for the worst case: every input character as one token, plus the maximum output.
export function packReserveHkdCents(payload: PackPayload, pricing: {
  inputUsdPerMillion: number; outputUsdPerMillion: number; usdHkdRate: number; reserveHkdCents: number;
}) {
  const inputChars = fingerprintSource(payload).length + 2_000;
  const usd = inputChars / 1_000_000 * pricing.inputUsdPerMillion
    + applicationPackMaxOutputTokens / 1_000_000 * pricing.outputUsdPerMillion;
  const worstCase = Math.ceil(usd * pricing.usdHkdRate * 100);
  return Math.min(10_000, Math.max(pricing.reserveHkdCents, worstCase));
}

const evidence = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      claim: { type: "string" },
      source: { type: "string", enum: ["jd", "resume"] },
      quote: { type: "string" }
    },
    required: ["claim", "source", "quote"]
  }
} as const;

const draftField = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    confidence: { type: "string", enum: ["high", "low"] },
    evidence,
    missingInfo: { type: "array", items: { type: "string" } }
  },
  required: ["text", "confidence", "evidence", "missingInfo"]
} as const;

export const applicationPackSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    gapExplanation: draftField,
    tailoringPoints: draftField,
    coverLetter: draftField,
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { question: { type: "string" }, ...draftField.properties },
        required: ["question", ...draftField.required]
      }
    }
  },
  required: ["gapExplanation", "tailoringPoints", "coverLetter", "answers"]
} as const;

export function packInstructions(payload: PackPayload) {
  return [
    "你在为求职者起草可编辑的申请材料草稿。只能使用下面给出的 JD 与简历内容；不得编造经历、数字、证书或联系方式。",
    "输出：差距解释（简历相对 JD 的不足与可如何坦诚说明）、定制要点（每条要点对应简历证据）、一封英文求职信草稿、以及对每个申请问题的回答草稿。",
    "每条结论都在 evidence 中给出依据：source 为 jd 或 resume，quote 为原文短引用。缺少必要信息时写入 missingInfo，并把 confidence 设为 low。",
    "这些只是草稿：不要声称已经提交、发送或联系任何人。",
    "",
    `岗位：${payload.jd.company} · ${payload.jd.roleTitle}`,
    "JD：",
    payload.jd.text,
    "",
    "简历正文：",
    payload.resume.text,
    "",
    payload.questions.length ? `申请问题（逐条回答，question 字段原样保留问题）：\n${payload.questions.map((question, index) => `${index + 1}. ${question}`).join("\n")}` : "没有申请问题：answers 返回空数组。"
  ].join("\n");
}

export const draftFieldLabels: Record<string, string> = {
  cover_letter: "求职信",
  tailoring_points: "定制要点",
  gap_explanation: "差距解释"
};

export function draftFieldLabel(fieldKey: string, question: string | null) {
  if (fieldKey.startsWith("qa_")) return `申请问题 ${fieldKey.slice(3)}：${question ?? ""}`;
  return draftFieldLabels[fieldKey] ?? fieldKey;
}
