import { describe, expect, it } from "vitest";

import { aliasPattern, findSkills, skillsDictionary } from "./dictionary";

const keys = (text: string) => findSkills(text).map((skill) => skill.key);

describe("skills_dict_v1", () => {
  it("matches Chinese and English aliases to the same skill", () => {
    expect(keys("熟悉机器学习与 Python")).toEqual(expect.arrayContaining(["machine_learning", "python"]));
    expect(keys("Machine learning experience")).toContain("machine_learning");
    expect(keys("负责债券研究")).toContain("fixed_income");
    expect(keys("Fixed income desk")).toContain("fixed_income");
  });

  it("avoids classic false positives", () => {
    expect(keys("HR 面试安排")).not.toContain("r");
    expect(keys("R&D department")).not.toContain("r");
    expect(keys("JavaScript frontend")).not.toContain("java");
    expect(keys("Windows 操作系统")).not.toContain("wind");
    expect(keys("pptx template")).not.toContain("powerpoint");
  });

  it("still matches single-letter and symbol aliases in context", () => {
    expect(keys("熟练使用 R 或 Python")).toEqual(expect.arrayContaining(["r", "python"]));
    expect(keys("精通R语言")).toContain("r");
    expect(keys("C++ / Java")).toEqual(expect.arrayContaining(["cpp", "java"]));
    expect(keys("M&A execution")).toContain("mna");
  });

  it("has unique keys and lower-case aliases", () => {
    expect(new Set(skillsDictionary.map((skill) => skill.key)).size).toBe(skillsDictionary.length);
    for (const skill of skillsDictionary) for (const alias of skill.aliases) expect(alias).toBe(alias.toLowerCase());
    expect(aliasPattern("c++")).toContain("c\\+\\+");
  });
});
