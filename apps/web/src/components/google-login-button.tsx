"use client";

import { useState } from "react";

import { BusyLabel } from "@/components/operation-feedback";
import { createClient } from "@/lib/supabase/client";

export function GoogleLoginButton({ configured }: { configured: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    if (!configured) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/`
        }
      });
      if (authError) throw authError;
    } catch {
      setError("无法启动 Google 登录，请检查服务配置后重试。");
      setLoading(false);
    }
  }

  return (
    <div className="auth-control">
      <button aria-busy={loading || undefined} className="google-button" type="button" onClick={signIn} disabled={!configured || loading}>
        {loading ? <BusyLabel>正在打开 Google…</BusyLabel> : <><span className="google-g" aria-hidden="true">G</span>使用 Google 登录</>}
      </button>
      {!configured ? <p className="auth-hint">身份服务尚未配置，按钮保持关闭。</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
