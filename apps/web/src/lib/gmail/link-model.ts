// Labels for e-mail ↔ opportunity link suggestions (#17). Alias-free so vitest can import it.
export const linkRuleLabels: Record<string, string> = {
  sender_domain: "发件人域名唯一匹配",
  company_name: "公司名唯一匹配",
  company_and_role: "公司名 + 岗位名唯一匹配",
  role_title: "岗位名唯一匹配"
};

export const linkDecisions = ["confirm", "reject", "unlink"] as const;
export type LinkDecision = (typeof linkDecisions)[number];

export function isLinkDecision(value: string): value is LinkDecision {
  return (linkDecisions as readonly string[]).includes(value);
}

export function linkRuleLabel(rule: string) {
  return linkRuleLabels[rule] ?? rule;
}

export function opportunityHref(track: string, id: string) {
  return `${track === "graduate" ? "/graduate" : "/internships"}/${id}`;
}
