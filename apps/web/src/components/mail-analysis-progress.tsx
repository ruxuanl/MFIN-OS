"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function MailAnalysisProgress({ queued, unfinished=queued }: { queued: number; unfinished?: number }) {
  const router=useRouter();
  const [state,setState]=useState("");
  useEffect(()=>{
    if(!queued) return;
    const controller=new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const process=async()=>{
      try {
        const response=await fetch("/api/inbox/analysis",{ method: "POST",signal: controller.signal });
        if(!response.ok) { setState("AI 整理暂不可用，可在详情中重试"); return; }
        const result=await response.json();
        if(controller.signal.aborted) return;
        if(result.status==="busy" || result.status==="completed" && result.processed>0) {
          setState("正在整理邮件…"); router.refresh(); timer=setTimeout(process,result.status==="busy" ? 2500 : 1000);
        } else {
          setState(result.status==="paused" ? "AI 整理已暂停，请检查邮件分析权限" : result.status==="failed" ? "部分邮件未完成 AI 整理，可在详情中重试" : "");
          router.refresh();
        }
      } catch { if(!controller.signal.aborted) setState("AI 整理暂不可用，邮件仍可查看"); }
    };
    timer=setTimeout(process,600);
    return ()=>{ controller.abort(); clearTimeout(timer); };
  },[queued,router]);
  if(!unfinished) return null;
  return <span role="status">{state || (queued>0 ? `正在生成中文摘要，剩余 ${unfinished} 封` : `${unfinished} 封尚未生成中文摘要，可在邮件详情中重试`)}</span>;
}
