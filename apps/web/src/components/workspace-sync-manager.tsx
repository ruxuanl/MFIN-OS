"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { flushOutbox, listMutations } from "@/lib/workspaces/outbox";

export function WorkspaceSyncManager({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  // Keep the server and first client render identical. The real browser state is
  // applied after hydration so an offline load cannot detach React handlers.
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = useCallback(async () => {
    setPending((await listMutations()).length);
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    const result = await flushOutbox();
    await refreshPending();
    setSyncing(false);
    if (result.processed > 0 || result.conflicts > 0) router.refresh();
  }, [refreshPending, router]);

  useEffect(() => {
    if (!enabled) return;
    const initialSync = window.setTimeout(() => {
      setOnline(navigator.onLine);
      void sync();
    }, 0);

    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    const onChanged = () => void refreshPending();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("mfin:outbox-changed", onChanged);

    const supabase = createClient();
    const channel = supabase.channel("workspace-changes");
    for (const table of ["opportunity_candidates", "opportunities", "courses", "actions", "timeline_entries", "sync_conflicts"] as const) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => router.refresh());
    }
    channel.subscribe();

    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("mfin:outbox-changed", onChanged);
      void supabase.removeChannel(channel);
    };
  }, [enabled, refreshPending, router, sync]);

  if (!enabled) return null;
  if (online && pending === 0 && !syncing) return null;
  return (
    <div className={`sync-banner ${online ? "is-online" : "is-offline"}`} role="status">
      <span />
      {online
        ? syncing
          ? `正在同步 ${pending} 项离线修改…`
          : `${pending} 项修改等待同步`
        : `离线模式 · ${pending} 项修改已安全留在本机`}
    </div>
  );
}
