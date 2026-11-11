"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listMutations, listWorkspaceSnapshots, type WorkspaceSnapshot } from "@/lib/workspaces/outbox";

export function OfflineWorkspace() {
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>([]);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    Promise.all([listWorkspaceSnapshots(), listMutations()]).then(([cached, mutations]) => {
      setSnapshots(cached);
      setPending(mutations.length);
    });
  }, []);

  return (
    <main className="simple-state offline-workspace">
      <div className="simple-state-card">
        <p className="page-eyebrow">Offline workspace</p>
        <h1>暂时没有网络</h1>
        <p>{pending ? `${pending} 项修改已安全保存在本机 Outbox，恢复联网后按顺序同步。` : "当前没有待同步修改。"}</p>
        {snapshots.length ? <div className="offline-snapshots">{snapshots.map((snapshot) => <section key={snapshot.scope}><strong>{snapshot.scope}</strong><small>{new Date(snapshot.updatedAt).toLocaleString("zh-CN")}</small>{snapshot.records.slice(0, 8).map((record) => <Link key={record.id} href={record.href}><span>{record.title}</span><small>{record.subtitle}</small></Link>)}</section>)}</div> : <p className="section-note">尚无已授权会话中生成的最小工作区摘要缓存。</p>}
        <p className="privacy-footnote">本机缓存只含工作区标题和状态，不含来源证据、JD 正文、凭据或外部账号内容。</p>
      </div>
    </main>
  );
}
