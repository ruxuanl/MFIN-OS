"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Capability status is surfaced in Settings; no sensitive detail enters logs.
    });
  }, []);

  return null;
}
