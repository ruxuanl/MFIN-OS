import { redirect } from "next/navigation";

import { GoogleLoginButton } from "@/components/google-login-button";
import { PasskeySignInButton } from "@/components/passkey-sign-in-button";
import { getCurrentUser } from "@/lib/auth/session";
import { getAuthMode } from "@/lib/config";

export const metadata = { title: "登录" };

export default async function LoginPage() {
  const mode = getAuthMode();
  const user = await getCurrentUser();
  if (user) redirect("/");
  const configured = mode === "supabase";

  return (
    <main className="login-page">
      <section className="login-editorial">
        <div className="brand light-brand"><span className="brand-mark">M</span><span><strong>MFin OS</strong><small>Personal workspace</small></span></div>
        <div className="editorial-copy"><p>HKU · MFin · 2027</p><h1>让所有重要的事，<br/>回到一个安静的地方。</h1><span>学业 · 实习 · 秋招 · 日程</span></div>
        <p className="privacy-line">Single user · Private by design</p>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <p className="page-eyebrow">Welcome back</p>
          <h2>进入个人工作台</h2>
          <p className="login-description">M1 只请求基础身份。Calendar 与 Gmail 将在各自里程碑单独授权。</p>
          <GoogleLoginButton configured={configured} />
          <div className="auth-divider"><span/>或<span/></div>
          <PasskeySignInButton configured={configured} />
          <p className="login-footnote">没有公开注册入口。仅允许预先配置的单一用户。</p>
        </div>
      </section>
    </main>
  );
}
