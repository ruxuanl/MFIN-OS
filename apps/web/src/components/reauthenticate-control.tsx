"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BusyLabel } from "@/components/operation-feedback";
import { createClient } from "@/lib/supabase/client";

export function ReauthenticateControl({ returnTo = "/" }: { returnTo?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "ready" | "error">("idle");
  const [loadingMethod, setLoadingMethod] = useState<"passkey" | "google" | null>(null);

  async function reauthenticate() {
    setLoadingMethod("passkey");
    setState("idle");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      setState("ready");
      setLoadingMethod(null);
      router.refresh();
    } catch {
      setState("error");
      setLoadingMethod(null);
    }
  }

  async function reauthenticateWithGoogle() {
    setLoadingMethod("google");
    setState("idle");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`,
          queryParams: { prompt: "select_account" }
        }
      });
      if (error) throw error;
    } catch {
      setState("error");
      setLoadingMethod(null);
    }
  }

  return (
    <div className="reauth-control">
      <button aria-busy={loadingMethod === "passkey" || undefined} className="quiet-button" type="button" onClick={reauthenticate} disabled={loadingMethod !== null}>
        {loadingMethod === "passkey" ? <BusyLabel>正在验证…</BusyLabel> : "使用 Passkey / Face ID 重新验证"}
      </button>
      <button aria-busy={loadingMethod === "google" || undefined} className="quiet-button" type="button" onClick={reauthenticateWithGoogle} disabled={loadingMethod !== null}>
        {loadingMethod === "google" ? <BusyLabel>正在打开 Google…</BusyLabel> : "使用 Google 重新登录验证"}
      </button>
      {state === "ready" ? <p className="setting-message">验证已刷新，现在可以解除隐私锁。</p> : null}
      {state === "error" ? <p className="form-error">Passkey 不可用或验证未完成；请改用 Google 重新登录验证。</p> : null}
    </div>
  );
}
