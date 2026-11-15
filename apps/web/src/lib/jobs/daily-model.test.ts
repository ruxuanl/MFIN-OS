import { describe,it,expect } from "vitest";
import { candidateMailProgress,selectDailyRecommendations,type DailyRecommendation } from "./daily-model";
const candidate={id:"c1",company:"ABC Capital",role_title:"Equity Research Intern",created_at:"2026-11-10T00:00:00Z"};
const mail={id:"m1",subject:"ABC Capital Equity Research Intern interview invitation",summary:"邀请参加面试",received_at:"2026-11-15T01:00:00Z"};
const item:DailyRecommendation={url:"https://example.com/jobs/1",title:"ABC Capital Equity Research Intern",company:"ABC Capital",location:"Hong Kong",deadline:null,evidence:"Published: 2026-11-14\nCompany: ABC Capital",kind:"job",evidenceKind:"page_text",summary:"ABC Capital股票研究实习",reason:"证据",warning:"资格待核实",isRecruiting:true,assessment:{qualification:"待核实",match:85,quality:80,preference:"买方投研",urgency:"无明确截止",reason:"原文为股票研究",gaps:"资格待核实",nextStep:"核对原文"},sourceTime:{from:"2026-11-14",to:"2026-11-14",basis:"published",approximate:false}};
describe("daily discovery decisions",()=>{
  it("keeps qualifications separate and excludes known, low quality, closed and incompatible jobs",()=>{
    const items=[item,{...item,url:"https://example.com/jobs/2",assessment:{...item.assessment,quality:40}},{...item,url:"https://example.com/jobs/3",kind:"closed" as const},{...item,url:"https://example.com/jobs/4",assessment:{...item.assessment,qualification:"不符" as const}}];
    expect(selectDailyRecommendations(items,new Set(),new Date("2026-11-15"))).toEqual([item]);
    expect(selectDailyRecommendations(items,new Set([item.url]),new Date("2026-11-15"))).toEqual([]);
  });
  it("does not pad to five or recommend undated jobs",()=>{
    expect(selectDailyRecommendations([{...item,evidence:"no date",sourceTime:null}],new Set())).toEqual([]);
    expect(selectDailyRecommendations(Array.from({length:7},(_,i)=>({...item,url:`https://example.com/jobs/${i}`})),new Set())).toHaveLength(5);
  });
  it("links role and company and marks company-only matches tentative",()=>{
    expect(candidateMailProgress([candidate],[mail])[0].confirmed).toBe(true);
    expect(candidateMailProgress([candidate],[{...mail,subject:"ABC Capital interview invitation"}])[0].confirmed).toBe(false);
  });
  it("rejects ambiguous company matches and generic interview content",()=>{
    expect(candidateMailProgress([candidate,{...candidate,id:"c2",role_title:"PE Intern"}],[{...mail,subject:"ABC Capital interview invitation"}])).toEqual([]);
    expect(candidateMailProgress([candidate],[{...mail,subject:"ABC Capital interview tips"}])).toEqual([]);
    expect(candidateMailProgress([candidate],[{...mail,subject:"NotABC Capital interview invitation"}])).toEqual([]);
    expect(candidateMailProgress([candidate],[{...mail,received_at:"2026-11-01T00:00:00Z"}])).toEqual([]);
  });
});
