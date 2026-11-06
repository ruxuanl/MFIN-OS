"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { markReportNotificationsRead } from "@/app/(app)/reports/actions";

export function NotificationReadReceipt() {
  const router = useRouter();

  useEffect(() => {
    void markReportNotificationsRead().then((result) => {
      if (result.updated > 0) router.refresh();
    });
  }, [router]);

  return null;
}
