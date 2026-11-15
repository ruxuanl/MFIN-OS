import { describe, expect, it } from "vitest";
import { extractPageRadarLocation, extractRadarJobLocation, matchesRadarRegion, radarJobLocation } from "./radar-location";
import { radarDefaults, type RadarItem } from "./radar-model";
import { matchesRadarPreferences } from "./radar-results";
import { extractIguopinMetadata } from "./radar-page-time";
const item=(location:string,extra:Partial<RadarItem>={}):RadarItem=>({url:"https://example.com/jobs/1",title:"Research Intern at Synthetic Capital",company:"Synthetic Capital",location,evidence:"",evidenceKind:"snippet",kind:"job",deadline:null,reason:"",warning:"",...extra});
describe("job location extraction and strict regional filters",()=>{
  it.each(["杭州","杭州市","佛山","佛山市","Hangzhou","Foshan","广东省","待核实","来源未注明"])("does not classify %s as Shenzhen",location=>{
    expect(matchesRadarRegion(item(location),"深圳")).toBe(false);
    expect(matchesRadarPreferences(item(location),{...radarDefaults,direction:"其他",region:"深圳"})).toBe(false);
  });
  it("accepts explicit Shenzhen and real multi-city jobs and assigns other cities to other",()=>{
    for(const location of ["深圳","Shenzhen","广东省深圳市福田区","北京、上海、深圳"])expect(matchesRadarRegion(item(location),"深圳")).toBe(true);
    expect(matchesRadarRegion(item("杭州"),"其他")).toBe(true);
    expect(matchesRadarRegion(item("佛山"),"其他")).toBe(true);
    expect(matchesRadarRegion(item("上海"),"深圳,北京")).toBe(false);
  });
  it("extracts the workplace and does not use the company's headquarters",()=>{
    expect(extractRadarJobLocation("公司地址：深圳市\n工作地点\n杭州市西湖区\n任职要求：本科")).toBe("杭州市西湖区");
    expect(radarJobLocation(item("未知／待核实",{locationZh:"深圳",evidence:"总部位于深圳\n工作地点：佛山"}))).toBe("佛山");
    expect(matchesRadarRegion(item("佛山",{title:"深圳某证券公司研究实习生"}),"深圳")).toBe(false);
  });
  it("reads JobPosting locations rather than Organization addresses",()=>{
    const html='<script type="application/ld+json">{"@graph":[{"@type":"Organization","address":{"addressLocality":"深圳"}},{"@type":"JobPosting","jobLocation":{"address":{"addressLocality":"杭州","streetAddress":"西湖区"}}}]}</script>';
    expect(extractPageRadarLocation(html)).toBe("杭州 · 西湖区");
  });
  it("uses Guopin's actual job districts rather than company districts and preserves the closed status",()=>{
    const metadata=extractIguopinMetadata({data:{district_list:[{area_cn:"深圳",address:"安信金融大厦"}],company_info:{district_list:[{area_cn:"杭州"}]},update_time:"2026-09-15 00:00:00",end_time:"2026-09-14 23:59:59"}},new Date("2026-11-15T00:00:00Z"));
    expect(metadata).toMatchObject({location:"深圳 · 安信金融大厦",deadline:"2026-09-14",closed:true,time:{from:"2026-09-15"}});
    expect(radarJobLocation(item("未知／待核实",{sourceLocation:{value:metadata.location!,reference:"国聘岗位",observedAt:"2026-11-15T00:00:00Z"}}))).toBe("深圳 · 安信金融大厦");
  });
});
