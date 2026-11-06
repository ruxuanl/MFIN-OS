import Link from "next/link";

export default function AuthCodeErrorPage() {
  return <main className="simple-state"><div className="simple-state-card"><p className="page-eyebrow">Authentication</p><h1>登录没有完成</h1><p>身份服务拒绝了回调，或授权已过期。没有保存任何 Google 数据。</p><Link className="primary-button" href="/login">返回登录</Link></div></main>;
}
