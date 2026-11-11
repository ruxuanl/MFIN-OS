"use client";

import { useFormStatus } from "react-dom";

import { SubmitButton } from "@/components/operation-feedback";

export function CalendarSyncSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <>
      <SubmitButton
        aria-describedby={pending ? "calendar-sync-progress" : undefined}
        className="primary-button"
        pendingLabel="正在同步…"
      >
        立即同步
      </SubmitButton>
      {pending ? (
        <span className="calendar-sync-progress" id="calendar-sync-progress" role="status">
          正在核对日历并处理待写入事项，请勿重复点击。游标重建时可能需要几分钟。
        </span>
      ) : null}
    </>
  );
}
