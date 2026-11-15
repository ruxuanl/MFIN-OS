// One-off local edition requested on 2026-11-15. Verification date is not publication date.
export const editorialDaily = {
  day: "2026-11-15",
  headline: "先看研究实习，再核对硬门槛。",
  summary: "今天补充核验两条香港实习线索；PE 方向保留一条资格观察。岗位未披露发布日期，不计入近 7 天新增，也不冒充自动评分结果。",
  items: [
    {
      company: "Goldman Sachs", direction: "二级卖方研究", title: "宏观经济研究 · Off-cycle Intern",
      url: "https://higher.gs.com/roles/180086",
      evidenceUrl: "https://cpdc.osa.cuhk.edu.hk/sites/cu_joblink/files/highlight_jobs_postings/files/2027%20GS%20GIR%20HK%20Macro%20Economics%20OC.pdf",
      timing: "香港 · 2027 年 1 月起 · 1 年", status: "先核对到岗时间",
      reason: "官方职位页保留申请入口；大学发布的 JD 列明亚洲经济研究、模型维护及研究出版支持，方向直接对应卖方宏观。",
      requirement: "一年安排可能与学业冲突；需核对全职到岗、工作资格，以及经济学、计量与统计课程背景。未披露截止日期。",
      preparation: "准备一页亚洲宏观观点，附数据来源、图表与可复现的 Excel / Python 分析。",
      evidence: "职位编号 180086；JD 写明 2027 年 1 月开始、为期一年、滚动面试。"
    },
    {
      company: "Point72", direction: "二级买方 · 研究支持", title: "Long/Short Equity Support Research Intern",
      url: "https://job-boards.greenhouse.io/point72/jobs/8899750002",
      evidenceUrl: "https://job-boards.greenhouse.io/point72/jobs/8899750002",
      timing: "香港 · 2027 暑期 · 12 周", status: "资格待核实",
      reason: "基本面股票团队的研究支持岗位，实际职责偏 AI 应用研究、流程自动化与业务策略；并非直接选股的投资分析师实习。",
      requirement: "毕业时间须在 2027 年 6 月至 2028 年 8 月，GPA 至少 3.4；要求普通话与 Python。另需确认香港工作资格和完整实习时间。",
      preparation: "准备一个 Python 数据分析或研究流程自动化案例，说明研究问题、校验方法与产出。",
      evidence: "官方申请页可访问；表单暂定实习期为 2027 年 6 月 7 日至 8 月 27 日，未披露截止日期。"
    }
  ],
  watch: {
    company: "Coller Capital", title: "Private Equity MBA Summer Internship 2027",
    url: "https://collercapital-1660725598.teamtailor.com/jobs/8743765-investment-team-private-equity-mba-summer-internship-2027-hong-kong",
    note: "香港 PE 二级份额投资，10 周；岗位标题明确 MBA。MFin 不等于 MBA，暂不列为匹配推荐。先确认是否接受 MFin，再考虑估值、尽调与 IC memo 案例准备。"
  },
  excluded: {
    company: "Fidelity International", title: "2027 香港股票研究暑期",
    url: "https://fidelityinternational.tal.net/vx/lang-en-GB/mobile-0/brand-5/candidate/so/pm/1/pl/1/opp/1394-Equity-Research-Summer-Internship-Programme-2027-Hong-Kong/en-GB",
    note: "官网明确已关闭申请，且要求 2028 年毕业；搜索摘要仍会出现，今日排除。"
  }
};

export function getEditorialDaily(day: string) {
  return process.env.NODE_ENV === "development" && day === editorialDaily.day ? editorialDaily : null;
}
