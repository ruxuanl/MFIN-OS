import { describe,it,expect } from "vitest";
import { cleanMailInput,effectiveMailPriority,validateMailInsight,inboxHref } from "./insight-model";
const base={ category: "job",priority: "attention",summary: "请确认下周一的研究岗面试安排",reason: "直接发给收件人的面试邀请",deadline: null,optionalOpportunity: false,relevantAction: true };
describe("mail importance and minimal content",()=>{
  const now=Date.parse("2026-11-14T12:00:00Z");
  it("upgrades only relevant optional actions within 72 hours and restores attention at expiry",()=>{
    const r={priority: "attention" as const,optionalOpportunity:true,relevantAction:true,deadline:new Date(now+72*3600_000).toISOString()};
    expect(effectiveMailPriority(r,null,now)).toBe("important");
    expect(effectiveMailPriority({...r,deadline:new Date(now+72*3600_000+1).toISOString()},null,now)).toBe("attention");
    expect(effectiveMailPriority({...r,deadline:new Date(now).toISOString()},null,now)).toBe("attention");
    expect(effectiveMailPriority({...r,relevantAction:false},null,now)).toBe("attention");
    expect(effectiveMailPriority({...r,deadline:null},null,now)).toBe("attention");
  });
  it("keeps critical events important after expiry and preserves manual ratings",()=>{
    const r={priority:"important" as const,optionalOpportunity:false,relevantAction:true,deadline:"2020-01-01T00:00:00Z"};
    expect(effectiveMailPriority(r,null,now)).toBe("important");
    expect(effectiveMailPriority(r,"normal",now)).toBe("normal");
  });
  it("removes secret lines, addresses, URLs and active HTML before sending",()=>{
    const text=cleanMailInput('<script>steal()</script>Hello a@example.invalid\nVerification code: 123456\nAPI key: sk-topsecret\nVisit https://example.invalid?token=secret\n> older message');
    expect(text).not.toMatch(/123456|sk-topsecret|a@example|token=secret|steal|older message/);
    expect(cleanMailInput("文".repeat(9000))).toHaveLength(8000);
    expect(cleanMailInput("Today&#39;s event &amp; schedule")).toBe("Today's event & schedule");
  });
  it("requires three fixed categories/levels and a short Chinese single sentence",()=>{
    expect(validateMailInsight(base).category).toBe("job");
    for(const bad of [{...base,category:"pending"},{...base,priority:"unknown"},{...base,summary:"字".repeat(41)},{...base,summary:"English only"},{...base,summary:"第一行\n第二行"},{...base,deadline:"tomorrow"},{...base,extra:1}]) expect(()=>validateMailInsight(bad)).toThrow();
    expect(validateMailInsight({...base,optionalOpportunity:true,priority:"important"}).priority).toBe("attention");
  });
  it("keeps category, filter, page and detail in the URL",()=>{
    expect(inboxHref("job","important",2,"synthetic")).toBe("/inbox?category=job&priority=important&page=2&message=synthetic");
    expect(inboxHref("bad","bad")).toBe("/inbox");
  });
});
