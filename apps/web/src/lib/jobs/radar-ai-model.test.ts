import { describe, expect, it } from "vitest";
import { applyRadarAiOutput, radarAiSchema } from "./radar-ai-model";
import { toRadarItems, visibleRadarItems } from "./radar-model";
const items = toRadarItems([0,1,2].map(i => ({url:`https://synthetic.example.com/jobs/${i}`,title:`Research Intern ${i}`,content:`Evidence ${i}`})));
const summary = {summary:"示例公司的研究实习岗位。",jdSummary:"协助财务分析与行业研究。",category:"二级买方",locationZh:"香港",warning:"资格待核实",isRecruiting:true};
describe("radar keyed AI summaries", () => {
  it("requires exactly the input identities, including non-job pages", () => {
    expect(radarAiSchema(3).required).toEqual(["job_0","job_1","job_2"]);
    expect(radarAiSchema(3).additionalProperties).toBe(false);
  });
  it("does not discard valid summaries when the model omits a listing", () => {
    const result=applyRadarAiOutput(JSON.stringify({job_2:summary,job_0:summary}),items);
    expect(result.enriched).toBe(2); expect(result.invalid).toBe(1);
    expect(result.items[1]).toEqual(items[1]);
    expect(result.items[2]).toMatchObject({url:items[2].url,evidence:items[2].evidence,summary:summary.summary});
  });
  it("never assigns an unknown identity to a real job or copies model source fields", () => {
    const result=applyRadarAiOutput(JSON.stringify({job_8:summary,job_0:{...summary,url:"https://evil.example",evidence:"changed"},job_1:{...summary,category:"invented"}}),items);
    expect(result.enriched).toBe(1);
    expect(result.items[0].url).toBe(items[0].url);expect(result.items[0].evidence).toBe(items[0].evidence);
    expect(result.items[1]).toEqual(items[1]);
  });
  it("keeps source-only and unconfirmed results available instead of silently dropping them", () => {
    expect(applyRadarAiOutput("invalid",items)).toEqual({items,enriched:0,invalid:3});
    const result=applyRadarAiOutput(JSON.stringify({job_0:{...summary,isRecruiting:false}}),items);
    expect(visibleRadarItems(result.items)).toHaveLength(3);
  });
});
