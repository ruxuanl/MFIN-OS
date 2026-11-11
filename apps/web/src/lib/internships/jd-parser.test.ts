import { describe, expect, it } from "vitest";

import { parseInternshipJd } from "./jd-parser";

describe("internship JD parser", () => {
  it("extracts a labelled Chinese internship JD", () => {
    const result = parseInternshipJd(`
公司：合成资本有限公司
岗位：买方研究实习生
部门：投资研究部
地点：香港
工作方式：Hybrid
发布日期：2026年8月31日
截止日期：2026年9月18日

岗位职责：
1. 协助行业研究与公司建模
2. 整理投资委员会材料

任职要求：
1. 金融相关专业在读
2. 每周至少到岗四天

投递方式：请通过 https://example.com/jobs/123 提交材料
`);

    expect(result).toMatchObject({
      company: "合成资本有限公司",
      roleTitle: "买方研究实习生",
      department: "投资研究部",
      location: "香港 · 混合办公",
      postedOn: "2026-08-31",
      deadline: "2026-09-18",
      sourceUrl: "https://example.com/jobs/123",
      parserVersion: "jd_rules_v2"
    });
    expect(result.responsibilities).toContain("协助行业研究");
    expect(result.requirements).toContain("每周至少到岗四天");
    expect(result.gaps).toEqual([]);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("extracts common English headings and an English date", () => {
    const result = parseInternshipJd(`
Company: Synthetic Securities Limited
Job Title: Investment Banking Off-cycle Intern
Division: Investment Banking
Location: Hong Kong
Date posted: August 12, 2026
Application deadline: September 30, 2026

Responsibilities
- Support valuation and transaction execution.

Qualifications
- Strong analytical and communication skills.

How to apply
Visit https://careers.example.org/off-cycle.
`);

    expect(result.company).toBe("Synthetic Securities Limited");
    expect(result.roleTitle).toBe("Investment Banking Off-cycle Intern");
    expect(result.department).toBe("Investment Banking");
    expect(result.location).toBe("Hong Kong");
    expect(result.postedOn).toBe("2026-08-12");
    expect(result.deadline).toBe("2026-09-30");
    expect(result.requirements).toContain("Strong analytical");
  });

  it("reports missing fields instead of inventing them", () => {
    const result = parseInternshipJd("欢迎同学关注我们的实习机会，详情稍后公布。");
    expect(result.company).toBeNull();
    expect(result.roleTitle).toBeNull();
    expect(result.deadline).toBeNull();
    expect(result.gaps).toContain("公司");
    expect(result.gaps).toContain("岗位");
    expect(result.confidence).toBeLessThan(0.3);
  });

  it("extracts a SEEK-style whole-page copy without treating page chrome as job data", () => {
    const result = parseInternshipJd(`
China Renaissance Securities (Hong Kong) Limited logo

Equities Research internship

China Renaissance Securities (Hong Kong) Limited&#x20;
View all jobs
West Kowloon Cultural District, Yau Tsim Mong District
Analysis & Reporting (Banking & Financial Services)
Part time
Sign in and add your salary to see matches
Posted 23d ago

Key Responsibilities:
· Fundamental Research: Support research analysts in conducting in-depth fundamental research.
· Financial Modeling: Assist in building and maintaining financial models.

Qualifications Required:
· Education: Bachelor’s degree or above, preferably in Finance.
· Language Skills: Professional fluency in both English and Mandarin.

Unlock job insights
Hirer responsiveness
Company profile
`, "2026-08-31");

    expect(result).toMatchObject({
      company: "China Renaissance Securities (Hong Kong) Limited",
      roleTitle: "Equities Research internship",
      department: "Equities Research",
      location: "West Kowloon Cultural District, Yau Tsim Mong District",
      postedOn: "2026-08-08",
      deadline: null,
      parserVersion: "jd_rules_v2"
    });
    expect(result.responsibilities).toContain("Fundamental Research");
    expect(result.responsibilities).not.toContain("Qualifications Required");
    expect(result.requirements).toContain("Professional fluency");
    expect(result.requirements).not.toContain("Unlock job insights");
    expect(result.gaps).not.toContain("岗位");
    expect(result.gaps).not.toContain("部门");
    expect(result.gaps).not.toContain("发布时间");
  });

  it("moves remote work information into the location field", () => {
    const result = parseInternshipJd(`
Company: Synthetic Capital Limited
Role: Research Internship
Location: Singapore
Work arrangement: Fully remote
Posted: yesterday
Responsibilities: Support research.
Qualifications: Strong analysis skills.
`, "2026-08-31");

    expect(result.location).toBe("Singapore · 远程");
    expect(result.postedOn).toBe("2026-08-30");
  });
});
