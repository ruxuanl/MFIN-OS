"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
export function MailDetailDialog({ children,closeHref }: { children: ReactNode; closeHref: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(()=>{
    const element=dialog.current;
    element?.showModal();
    return ()=>element?.close();
  },[]);
  const close=()=>router.replace(closeHref,{ scroll: false });
  return <dialog ref={dialog} className="mail-detail-dialog" aria-label="邮件详情" onCancel={event=>{ event.preventDefault(); close(); }} onClick={event=>{ if(event.target===event.currentTarget) close(); }}>
    <div className="mail-detail-sheet">
      <header className="mail-detail-top"><span>邮件详情</span><button type="button" className="mail-close" aria-label="关闭邮件详情" onClick={close}>×</button></header>
      {children}
    </div>
  </dialog>;
}
