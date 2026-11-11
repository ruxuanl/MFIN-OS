import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("product boundary keeps the system single-user", async () => {
  const specification = await readFile("docs/PRODUCT_SPEC.md", "utf8");
  assert.match(specification, /产品永久作为个人工具，只服务该用户/);
});

test("retired WeChat functionality cannot be reintroduced", async () => {
  const specification = await readFile("docs/PRODUCT_SPEC.md", "utf8");
  assert.match(specification, /永久移除全部微信功能/);
  assert.match(specification, /历史岗位、来源证据及审计可读保留/);
});

test("permanently forbidden external actions remain documented", async () => {
  const agents = await readFile("AGENTS.md", "utf8");
  assert.match(agents, /邮件发送、微信发送、联系他人、岗位投递、申请提交、Offer 决策等能力永久禁止自动执行/);
});

test("approved M0 foundation decisions are recorded", async () => {
  const decisions = await readFile("docs/DECISIONS.md", "utf8");
  for (const id of ["D02", "D03", "D04", "D17"]) {
    assert.match(decisions, new RegExp(`### ${id}：`));
  }
});
