import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { isInterviewLocalEnabled } from "@/lib/interview/runtime";

export const metadata = { title: "模拟面试" };
export default function InterviewPage() {
  return <div className="page-shell interview-host-page">
    <PageHeader eyebrow="Interview workspace" title="模拟面试" description="知识库、语音练习和面试记录都在当前工作台中。" />
    {isInterviewLocalEnabled()
      ? <iframe title="面试助手：知识库、模拟面试与记录" src="/api/interview-runtime" allow="microphone 'self'" className="interview-host-frame" />
      : <section className="workspace-section"><h2>本地面试引擎尚未启用</h2><p>此能力需要本地持久磁盘、Python 与中文检索模型。云端存储适配完成前，仅在明确配置的本地环境运行。</p><Link href="/status">查看状态中心 →</Link></section>}
  </div>;
}
