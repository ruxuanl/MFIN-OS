import {describe,it,expect} from "vitest";
import {reportWindow,reportDay,isDue,validateBrief} from "./archive-model";
describe("report dates and provenance",()=>{
 it("uses Shanghai midnight rather than the host timezone",()=>{
  const now=new Date("2026-11-15T16:01:00Z");
  expect(reportDay(now)).toBe("2026-11-16");
  expect(reportWindow("daily",now).start).toBe("2026-11-15T16:00:00.000Z");
  expect(reportWindow("weekly",now).start).toBe("2026-11-09T16:00:00.000Z");
 });
 it("runs only enabled schedules after their time and weekly only Sunday",()=>{
  const s={type:"weekly" as const,time:"20:00",enabled:true};
  expect(isDue(s,new Date("2026-11-15T11:59:00Z"))).toBe(false);
  expect(isDue(s,new Date("2026-11-15T12:00:00Z"))).toBe(true);
  expect(isDue(s,new Date("2026-11-16T12:00:00Z"))).toBe(false);
  expect(isDue({...s,type:"daily",enabled:false},new Date("2026-11-15T14:30:00Z"))).toBe(false);
 });
 it("rejects fabricated or missing source references",()=>{
  const value={summary:"有记录的进展",sections:[{title:"进展",tone:"green",items:[{title:"任务",detail:"已完成",sources:["invented"]}]}]};
  expect(()=>validateBrief(value,[{id:"task-1",label:"任务",path:"/"}])).toThrow("invalid_report_source");
  value.sections[0].items[0].sources=[];expect(()=>validateBrief(value,[])).toThrow();
 });
 it("permits honest empty reports, rejects oversized content",()=>{
  expect(validateBrief({summary:"暂无记录，不代表未发生。",sections:[{title:"记录不足",tone:"neutral",items:[]}]},[]).sections).toHaveLength(1);
  expect(()=>validateBrief({summary:"x".repeat(701),sections:[]},[])).toThrow();
 });
});
