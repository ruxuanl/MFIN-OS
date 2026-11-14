import type { RadarItem } from "./radar-model";
export const radarAiFields = {
  type: "object", additionalProperties: false,
  required: ["summary", "jdSummary", "category", "locationZh", "warning", "isRecruiting"],
  properties: {
    summary: { type: "string" }, jdSummary: { type: "string" },
    category: { type: "string", enum: ["二级买方", "二级卖方", "PEVC", "投行", "其他"] },
    locationZh: { type: "string" }, warning: { type: "string" }, isRecruiting: { type: "boolean" }
  }
};
export function radarAiSchema(count: number) {
  const keys = Array.from({ length: count }, (_, i) => `job_${i}`);
  return { type: "object", additionalProperties: false, required: keys, properties: Object.fromEntries(keys.map(key => [key, radarAiFields])) };
}
export function applyRadarAiOutput(output: string, items: RadarItem[]) {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(output);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    data = parsed as Record<string, unknown>;
  } catch { return { items, enriched: 0, invalid: items.length }; }
  let enriched = 0;
  const next = items.map((item, index) => {
    const value = data[`job_${index}`];
    if (!value || typeof value !== "object" || Array.isArray(value)) return item;
    const m = value as Record<string, unknown>;
    if (["summary", "jdSummary", "category", "locationZh", "warning"].some(key => typeof m[key] !== "string")
      || typeof m.isRecruiting !== "boolean" || !["二级买方", "二级卖方", "PEVC", "投行", "其他"].includes(String(m.category))
      || !String(m.summary).trim() || !String(m.jdSummary).trim()) return item;
    enriched++;
    return { ...item, summary: String(m.summary).slice(0, 240), jdSummary: String(m.jdSummary).slice(0, 300),
      category: String(m.category), locationZh: String(m.locationZh).slice(0, 120), warning: String(m.warning).slice(0, 600),
      reason: "根据本岗位来源整理；行业与资格仍需核实。", isRecruiting: m.isRecruiting };
  });
  return { items: next, enriched, invalid: items.length - enriched };
}
