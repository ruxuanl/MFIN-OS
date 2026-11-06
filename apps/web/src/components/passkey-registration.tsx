"use client";

import { useState } from "react";

import { BusyLabel } from "@/components/operation-feedback";
import { createClient } from "@/lib/supabase/client";

export function PasskeyRegistration({ enabled }: { enabled: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function register() {
    if (!enabled) return;
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      setMessage("Passkey 已注册。后续敏感操作仍会要求新的短期验证。");
    } catch {
      setMessage("注册未完成。可能是用户取消、浏览器不支持或当前环境尚未启用 Passkey。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="setting-action">
      <div>
        <strong>设备验证</strong>
        <p>在 iPhone 上通过 Passkey 调用 Face ID。当前供应商接口仍为实验状态。</p>
      </div>
      <button aria-busy={loading || undefined} className="quiet-button" type="button" disabled={!enabled || loading} onClick={register}>
        {loading ? <BusyLabel>正在注册…</BusyLabel> : "注册 Passkey"}
      </button>
      {message ? <p className="setting-message" role="status">{message}</p> : null}
    </div>
  );
}
