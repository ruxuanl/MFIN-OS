import { describe, expect, it } from "vitest";
import { candidatePresentation } from "./presentation";

const base = { company: "示例资本", role_title: "示例资本 · 投资实习生", location: "上海", source_summary: null as string | null };
describe("candidate display extraction", () => {
  it("separates imported fields and removes internal markers without changing JD", () => {
    const result = candidatePresentation({ ...base, source_summary: "[LEADERSHIP:synthetic-id] 来源文件：合成表.xlsx 来源发布日期：2026-11-09 公司：示例资本 岗位：投资实习生 地点：上海 招聘详情：整理访谈纪要，搭建财务模型。 投递方式：简历投至 careers@example.invalid" });
    expect(result).toMatchObject({ company: "示例资本", role: "投资实习生", date: "2026-11-09", jd: "整理访谈纪要，搭建财务模型。", emails: ["careers@example.invalid"] });
    expect(JSON.stringify(result)).not.toContain("LEADERSHIP");
    expect(JSON.stringify(result)).not.toContain("合成表.xlsx");
  });
  it("keeps long application URL intact and rejects unsafe stored URLs", () => {
    const url = "https://example.invalid/job/1?tracking=" + "a".repeat(500);
    expect(candidatePresentation({ ...base, source_summary: `招聘详情：研究支持 投递方式：${url}` }).urls).toEqual([url]);
    expect(candidatePresentation({ ...base, source_url: "javascript:alert(1)" }).urls).toEqual([]);
  });
  it("does not invent dates, contact details or JD", () => {
    expect(candidatePresentation(base)).toMatchObject({ date: null, emails: [], urls: [], applicationNote: "投递方式待确认", jd: "暂无 JD，请先核对岗位原文。" });
    expect(candidatePresentation({ ...base, source_summary: "参与行业分析，需每周三天。" }).jd).toBe("参与行业分析，需每周三天。");
  });
  it("preserves nested JD headings and labelled content", () => {
    const result = candidatePresentation({ ...base, source_summary: "公司：示例资本 招聘详情：岗位职责：研究行业。公司：支持尽调。岗位要求：熟悉建模。 投递方式：careers@example.invalid" });
    expect(result.jd).toBe("岗位职责：研究行业。公司：支持尽调。岗位要求：熟悉建模。");
  });
});
