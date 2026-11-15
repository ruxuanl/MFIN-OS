import { afterEach, describe, expect, it, vi } from "vitest";
import { leadershipEnabled, leadershipFileDate, parseLeadershipWorkbook } from "./leadership-local";
import { filteredRadarItems } from "./radar-results";
import { radarDefaults, radarDirections, radarRegions } from "./radar-model";
vi.mock("server-only",()=>({}));
afterEach(()=>vi.unstubAllEnvs());
const strings=["公司及岗位名称","实习地点","招聘详情","投递链接","示例证券&#10;研究所日常实习生","北京","岗位职责：协助行业研究。每周4天。","https://example.com/jobs/123"];
const xml={"xl/workbook.xml":'<workbook><sheets><sheet name="岗位汇总" sheetId="1" r:id="rId1"/></sheets></workbook>',
  "xl/sharedStrings.xml":'<sst>'+strings.map(x=>'<si><t>'+x+'</t></si>').join('')+'</sst>',
  "xl/worksheets/sheet1.xml":'<worksheet><sheetData><row r="3"><c r="A3" t="s"><v>0</v></c><c r="B3" s="2"/><c r="C3" t="s"><v>1</v></c><c r="E3" t="s"><v>2</v></c><c r="G3" t="s"><v>3</v></c></row><row r="5"><c r="A5" t="s"><v>4</v></c><c r="B5"/><c r="C5" t="s"><v>5</v></c><c r="E5" t="s"><v>6</v></c><c r="G5" t="s"><v>7</v></c></row></sheetData></worksheet>'};
describe("LEADERSHIP dated workbook channel",()=>{
  it("takes publication date from the filename, including single-digit months and days",()=>{
    expect(leadershipFileDate("2026.11.13实习汇总表.xlsx")).toBe("2026-11-13");
    expect(leadershipFileDate("2026.10.8实习汇总表.xlsx")).toBe("2026-10-08");
    expect(leadershipFileDate("2026.2.31实习汇总表.xlsx")).toBeNull();
  });
  it("reads merged spreadsheet columns without consuming the next cell after an empty cell",()=>{
    const items=parseLeadershipWorkbook(xml,"2026.11.13实习汇总表.xlsx");expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({company:"示例证券",location:"北京",url:"https://example.com/jobs/123",sourceTime:{from:"2026-11-13",basis:"filename"},localSource:{fileName:"2026.11.13实习汇总表.xlsx",sheet:"岗位汇总",row:5}});
    expect(items[0].title).toContain("示例证券 · 研究所");
    const p={...radarDefaults,direction:radarDirections.join(','),region:radarRegions.join(','),publishedWithin:"7",source:"local" as const};
    expect(filteredRadarItems(items,p,new Date("2026-11-15T01:00:00Z"))).toHaveLength(1);
    expect(filteredRadarItems(items,{...p,publishedWithin:"1"},new Date("2026-11-15T01:00:00Z"))).toHaveLength(0);
    expect(filteredRadarItems(items,{...p,source:"boards"},new Date("2026-11-15T01:00:00Z"))).toHaveLength(0);
  });
  it("disables desktop access for other users and cloud deployments",()=>{
    vi.stubEnv("LEADERSHIP_LOCAL_OWNER_ID","owner");vi.stubEnv("VERCEL","");vi.stubEnv("APP_ENV","development");
    expect(leadershipEnabled("owner")).toBe(true);expect(leadershipEnabled("other")).toBe(false);
    vi.stubEnv("VERCEL","1");expect(leadershipEnabled("owner")).toBe(false);
  });
  it("does not mistake International in the company name for an internship",()=>{
    const other={...xml,"xl/sharedStrings.xml":xml["xl/sharedStrings.xml"].replace("示例证券&#10;研究所日常实习生","HGNH International Financial&#10;初级交易员")};
    expect(parseLeadershipWorkbook(other,"2026.11.13实习汇总表.xlsx")).toHaveLength(0);
  });
});
