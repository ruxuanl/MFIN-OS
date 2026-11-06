"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BusyLabel } from "@/components/operation-feedback";
import { createClient } from "@/lib/supabase/client";

export function PasskeySignInButton({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPasskey();
      if (authError) throw authError;
      router.push("/");
      router.refresh();
    } catch {
      setError("Passkey 未注册、被取消或当前环境不可用。");
      setLoading(false);
    }
  }

  return (
    <div className="auth-control">
      <button aria-busy={loading || undefined} className="passkey-button" type="button" onClick={signIn} disabled={!configured || loading}>
        {loading ? <BusyLabel>正在验证…</BusyLabel> : "使用 Passkey / Face ID"}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
