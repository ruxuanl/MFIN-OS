import { afterEach, describe, expect, it, vi } from "vitest";
import { searchInternships } from "./tavily";
import { radarDefaults, parseRadarPreferences, toRadarItems } from "./radar-model";
import { radarSearchDomains, radarSourceLabel } from "./radar-sources";
import { selectRadarEvidence } from "./radar-results";
vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());
describe("public recruitment and article channels", () => {
  it("prefers boards and public articles without excluding other sites in all mode", () => {
    expect(radarSearchDomains()).toMatchObject({include_domains_mode:"prefer"});
    expect(radarSearchDomains().include_domains).toContain("mp.weixin.qq.com");
    expect(radarSearchDomains().include_domains).toContain("liepin.com");
    expect(radarSearchDomains("wechat")).toEqual({include_domains:["mp.weixin.qq.com"],include_domains_mode:"restrict"});
    expect(radarSourceLabel("https://cn.linkedin.com/jobs/view/123").name).toBe("LinkedIn");
    expect(radarSourceLabel("https://mp.weixin.qq.com.evil.example/s/1").type).not.toBe("公众号");
  });
  it("submits a single 20-source request for the selected article channel", async () => {
    vi.stubEnv("TAVILY_API_KEY","synthetic");
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({results:[]})));
    await searchInternships({...radarDefaults,source:"wechat"},fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({max_results:20,include_domains:["mp.weixin.qq.com"],include_domains_mode:"restrict"});
    expect(()=>parseRadarPreferences({...radarDefaults,source:"untrusted"})).toThrow("invalid_conditions");
  });
  it("examines all 20 sources before retaining at most ten and prioritizes a late concrete job", () => {
    const rows=Array.from({length:20},(_,i)=>({title:i===19?"Research Intern at Synthetic Capital":"Internship opportunities",url:`https://example.com/${i===19?"jobs":"pages"}/${i}`,content:"Company: Synthetic Capital"}));
    const parsed=toRadarItems(rows);
    expect(parsed).toHaveLength(20);
    const chosen=selectRadarEvidence(parsed);
    expect(chosen).toHaveLength(10);
    expect(chosen[0].title).toBe("Research Intern at Synthetic Capital");
  });
});
