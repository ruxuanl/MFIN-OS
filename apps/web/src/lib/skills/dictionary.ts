// skills_dict_v1 (D34): rule dictionary with Chinese and English aliases. Source of truth for the
// question parser; supabase/migrations/20261112170000_skills_dictionary.sql carries the same rows
// (tests/skills-dictionary.test.mjs keeps them identical). Alias-free imports so vitest can load it.
export const skillsDictVersion = "skills_dict_v1";

export type SkillDefinition = { key: string; label: string; category: "tool" | "technical" | "finance" | "credential" | "language"; aliases: string[] };

export const skillsDictionary: SkillDefinition[] = [
  { key: "python", label: "Python", category: "tool", aliases: ["python"] },
  { key: "r", label: "R", category: "tool", aliases: ["r", "r语言", "r 语言"] },
  { key: "sql", label: "SQL", category: "tool", aliases: ["sql", "mysql", "postgresql"] },
  { key: "excel", label: "Excel", category: "tool", aliases: ["excel"] },
  { key: "vba", label: "VBA", category: "tool", aliases: ["vba"] },
  { key: "matlab", label: "MATLAB", category: "tool", aliases: ["matlab"] },
  { key: "stata", label: "Stata", category: "tool", aliases: ["stata"] },
  { key: "cpp", label: "C++", category: "tool", aliases: ["c++"] },
  { key: "java", label: "Java", category: "tool", aliases: ["java"] },
  { key: "tableau", label: "Tableau", category: "tool", aliases: ["tableau"] },
  { key: "power_bi", label: "Power BI", category: "tool", aliases: ["power bi", "powerbi"] },
  { key: "powerpoint", label: "PowerPoint", category: "tool", aliases: ["powerpoint", "ppt"] },
  { key: "bloomberg", label: "Bloomberg", category: "tool", aliases: ["bloomberg", "彭博"] },
  { key: "wind", label: "Wind", category: "tool", aliases: ["wind", "万得"] },
  { key: "capital_iq", label: "Capital IQ", category: "tool", aliases: ["capital iq", "capiq"] },
  { key: "machine_learning", label: "机器学习", category: "technical", aliases: ["machine learning", "机器学习"] },
  { key: "deep_learning", label: "深度学习", category: "technical", aliases: ["deep learning", "深度学习"] },
  { key: "nlp", label: "NLP", category: "technical", aliases: ["nlp", "自然语言处理", "natural language processing"] },
  { key: "data_analysis", label: "数据分析", category: "technical", aliases: ["data analysis", "data analytics", "数据分析"] },
  { key: "data_visualization", label: "数据可视化", category: "technical", aliases: ["data visualization", "数据可视化"] },
  { key: "statistics", label: "统计", category: "technical", aliases: ["statistics", "统计学", "统计分析"] },
  { key: "econometrics", label: "计量经济学", category: "technical", aliases: ["econometrics", "计量经济"] },
  { key: "quant", label: "量化", category: "technical", aliases: ["quantitative", "quant", "量化"] },
  { key: "backtesting", label: "回测", category: "technical", aliases: ["backtest", "backtesting", "回测"] },
  { key: "financial_modeling", label: "财务建模", category: "finance", aliases: ["financial modeling", "financial modelling", "财务建模", "财务模型"] },
  { key: "valuation", label: "估值", category: "finance", aliases: ["valuation", "dcf", "估值"] },
  { key: "lbo", label: "LBO", category: "finance", aliases: ["lbo", "杠杆收购"] },
  { key: "mna", label: "并购", category: "finance", aliases: ["m&a", "mergers and acquisitions", "并购"] },
  { key: "ipo", label: "IPO", category: "finance", aliases: ["ipo", "首次公开发行"] },
  { key: "due_diligence", label: "尽职调查", category: "finance", aliases: ["due diligence", "尽职调查", "尽调"] },
  { key: "equity_research", label: "行业研究", category: "finance", aliases: ["equity research", "行业研究", "行研"] },
  { key: "accounting", label: "会计", category: "finance", aliases: ["accounting", "会计"] },
  { key: "risk_management", label: "风险管理", category: "finance", aliases: ["risk management", "风险管理", "风控"] },
  { key: "credit_analysis", label: "信用分析", category: "finance", aliases: ["credit analysis", "credit risk", "信用风险", "信用分析"] },
  { key: "fixed_income", label: "固定收益", category: "finance", aliases: ["fixed income", "固定收益", "固收", "债券"] },
  { key: "derivatives", label: "衍生品", category: "finance", aliases: ["derivatives", "衍生品"] },
  { key: "esg", label: "ESG", category: "finance", aliases: ["esg"] },
  { key: "cfa", label: "CFA", category: "credential", aliases: ["cfa"] },
  { key: "cpa", label: "CPA", category: "credential", aliases: ["cpa", "注册会计师"] },
  { key: "frm", label: "FRM", category: "credential", aliases: ["frm"] },
  { key: "acca", label: "ACCA", category: "credential", aliases: ["acca"] },
  { key: "english", label: "英语", category: "language", aliases: ["english", "英语", "英文"] },
  { key: "mandarin", label: "普通话", category: "language", aliases: ["mandarin", "普通话"] },
  { key: "cantonese", label: "粤语", category: "language", aliases: ["cantonese", "粤语", "广东话"] }
];

const latin = /[a-z]/;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Latin aliases need token boundaries (so "r" does not match "hr" and "java" does not match
// "javascript"); single-letter aliases also refuse "&" so "R&D" is not the R language. Chinese
// aliases match as plain substrings. The SQL patterns in the migration follow the same shape.
export function aliasPattern(alias: string) {
  const value = alias.toLowerCase();
  if (!latin.test(value)) return escapeRegex(value);
  const guard = value.length === 1 ? "[a-z0-9+#&]" : "[a-z0-9+#]";
  return `(^|${guard.replace("[", "[^")})${escapeRegex(value)}($|${guard.replace("[", "[^")})`;
}

export function findSkills(text: string, dictionary: SkillDefinition[] = skillsDictionary) {
  const haystack = text.toLowerCase();
  const found: { key: string; label: string; alias: string }[] = [];
  for (const skill of dictionary) {
    const alias = skill.aliases.find((candidate) => new RegExp(aliasPattern(candidate)).test(haystack));
    if (alias) found.push({ key: skill.key, label: skill.label, alias });
  }
  return found;
}

export const skillLabelByKey = new Map(skillsDictionary.map((skill) => [skill.key, skill.label]));
