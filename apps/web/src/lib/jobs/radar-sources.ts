export const radarSourceOptions = { all: "全部渠道", boards: "招聘网站", wechat: "公众号", local: "LEADERSHIP本地" } as const;
export type RadarSource = keyof typeof radarSourceOptions;
export const recruitmentDomains = ["liepin.com", "zhipin.com", "zhaopin.com", "51job.com", "shixiseng.com", "nowcoder.com", "yingjiesheng.com", "linkedin.com", "jobsdb.com", "efinancialcareers.com", "streetintern.com"];
export function radarSearchDomains(source: RadarSource = "all") {
  return { include_domains: source === "wechat" ? ["mp.weixin.qq.com"] : source === "boards" ? recruitmentDomains : [...recruitmentDomains, "mp.weixin.qq.com"],
    include_domains_mode: source === "all" ? "prefer" : "restrict" };
}
export function radarSourceLabel(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host === "mp.weixin.qq.com") return { name: "微信公众号", type: "公众号", host };
  const names: Record<string, string> = { "liepin.com":"猎聘", "zhipin.com":"BOSS直聘", "zhaopin.com":"智联招聘", "51job.com":"前程无忧", "shixiseng.com":"实习僧", "nowcoder.com":"牛客", "yingjiesheng.com":"应届生求职网", "linkedin.com":"LinkedIn", "jobsdb.com":"JobsDB", "efinancialcareers.com":"eFinancialCareers", "streetintern.com":"Street Intern" };
  const domain = recruitmentDomains.find(x => host === x || host.endsWith("." + x));
  return { name: domain ? names[domain] : host, type: domain ? "招聘网站" : "公开网站", host };
}
