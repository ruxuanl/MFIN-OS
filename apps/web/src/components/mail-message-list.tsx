"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { categoryLabels, inboxHref, priorityLabels, type MailCategory, type MailPriority } from "@/lib/gmail/insight-model";
import type { MailListRow } from "@/lib/gmail/insight-types";

const receivedTime = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

export function MailMessageList({ initialMessages, total, category, priority, initialPage, refreshedMail }: {
  initialMessages: MailListRow[]; total: number; category?: MailCategory; priority?: MailPriority; initialPage: number; refreshedMail?: MailListRow;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [nextPage, setNextPage] = useState(initialPage + 1);
  const [hasMore, setHasMore] = useState(initialPage * 30 < total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [appliedDetail, setAppliedDetail] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);

  // Detail revalidation can update a row from any loaded batch, without moving
  // the reader when the drawer opens or closes.
  const detailVersion = refreshedMail ? JSON.stringify(refreshedMail) : "";
  if (refreshedMail && detailVersion !== appliedDetail) {
    setAppliedDetail(detailVersion);
    setMessages(current => current.map(mail => mail.id === refreshedMail.id ? refreshedMail : mail));
  }

  useEffect(() => () => request.current?.abort(), []);

  const loadMore = useCallback(async () => {
    if (request.current || !hasMore) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(nextPage) });
    if (category) params.set("category", category);
    if (priority) params.set("priority", priority);
    try {
      const response = await fetch(`/api/inbox/messages?${params}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 401 ? "登录已过期，请刷新页面后重新登录。" : "暂时无法加载邮件，请重试。");
      const result: { messages: MailListRow[]; total: number } = await response.json();
      if (controller.signal.aborted) return;
      setMessages(current => {
        const seen = new Set(current.map(mail => mail.id));
        return [...current, ...result.messages.filter(mail => !seen.has(mail.id))];
      });
      setNextPage(nextPage + 1);
      setHasMore(result.messages.length > 0 && nextPage * 30 < result.total);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "暂时无法加载邮件，请重试。");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [category, priority, nextPage, hasMore]);

  useEffect(() => {
    if (!hasMore || error || !sentinel.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadMore();
    }, { root: viewport.current, rootMargin: "0px 0px 160px 0px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, error, loadMore]);

  return <div className="mail-stream" ref={viewport} role="region" aria-label="邮件滚动列表" tabIndex={0} aria-busy={loading}>
    {initialPage > 1 ? <div className="mail-stream-footer"><Link href={inboxHref(category, priority)}>从最新邮件开始浏览</Link></div> : null}
    <div className="mail-stream-columns" aria-hidden="true"><span>邮件摘要</span><span>发件人</span><span>收到时间</span><span>分类 / 级别</span></div>
    <div className="mail-message-list">
      {messages.map(mail => <Link key={mail.id} href={inboxHref(category, priority, initialPage, mail.id)} scroll={false} prefetch={false} className="mail-message-row">
        <span className="mail-message-summary">{mail.summary || "无主题邮件"}</span>
        <span className="mail-message-sender">{mail.sender_summary || "未知发件人"}</span>
        <time dateTime={mail.received_at}>{receivedTime.format(new Date(mail.received_at))}</time>
        <span className="mail-message-labels"><span className="mail-message-category">{categoryLabels[mail.category]}</span><span className={"mail-priority is-" + mail.priority}>{priorityLabels[mail.priority]}</span></span>
      </Link>)}
      {!messages.length ? <div className="mail-stream-empty"><strong>{priority ? "这个级别暂无邮件" : "暂无邮件"}</strong><p>{priority ? "可以切换到“全部”查看其他邮件。" : "已同步的邮件会显示在这里，可在邮件工具中检查连接。"}</p></div> : null}
    </div>
    <div ref={sentinel} className="mail-stream-footer">
      <span role="status">{error || (loading ? "正在加载更多邮件…" : messages.length ? hasMore ? `已显示 ${messages.length} 封，向下滚动继续浏览` : initialPage > 1 ? `已到邮件末尾，本次显示 ${messages.length} 封` : `已显示全部 ${messages.length} 封邮件` : "")}</span>
      {hasMore ? <button type="button" className="quiet-button" onClick={() => void loadMore()} disabled={loading}>{error ? "重试加载" : loading ? "正在加载…" : "加载更多"}</button> : null}
    </div>
  </div>;
}
