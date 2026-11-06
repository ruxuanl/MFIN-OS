"use client";

import { useEffect, useRef } from "react";

import { analyzeResumeVersion } from "@/app/(app)/materials/actions";
import { BusyLabel, SubmitButton } from "@/components/operation-feedback";

export function AutoAnalyzeResume({ resumeVersionId }: { resumeVersionId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form ref={formRef} action={analyzeResumeVersion} className="auto-analysis-status" aria-live="polite">
      <input type="hidden" name="resumeVersionId" value={resumeVersionId} />
      <SubmitButton type="submit" disabled aria-hidden="true">
        <BusyLabel>简历已保存，正在自动评分与生成建议…</BusyLabel>
      </SubmitButton>
    </form>
  );
}
