"use client";

import { useEffect, useRef } from "react";

import { analyzeOpportunityJd } from "@/app/(app)/materials/actions";
import { BusyLabel, SubmitButton } from "@/components/operation-feedback";

export function AutoAnalyzeOpportunity({ opportunityId }: { opportunityId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form ref={formRef} action={analyzeOpportunityJd} className="ai-run-form" aria-live="polite">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <SubmitButton className="primary-button" type="submit" disabled aria-hidden="true">
        <BusyLabel>正在自动凝练 JD 并匹配简历…</BusyLabel>
      </SubmitButton>
      <small>同一 JD＋同一简历版本会复用缓存，不重复计费。</small>
    </form>
  );
}
