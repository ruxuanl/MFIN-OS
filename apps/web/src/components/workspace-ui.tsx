"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

export function WorkspaceTabs({ tabs, initialTab, parameter = "tab" }: {
  tabs: { id: string; label: string; content: ReactNode }[];
  initialTab?: string;
  parameter?: string;
}) {
  const id = useId();
  const [active, setActive] = useState(initialTab ?? tabs[0].id);
  const selected = tabs.find((tab) => tab.id === active) ?? tabs[0];
  useEffect(() => {
    const sync = () => {
      const value = new URL(window.location.href).searchParams.get(parameter);
      if (value) setActive(value);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [parameter]);
  function select(value: string) {
    setActive(value);
    const url = new URL(window.location.href);
    url.searchParams.set(parameter, value);
    window.history.replaceState(window.history.state, "", url);
  }
  return <div className="workspace-tabs">
    <div className="tab-bar" role="tablist" aria-label="工作区视图">
      {tabs.map((tab, index) => <button key={tab.id} id={`${id}-${tab.id}`} role="tab" type="button"
        aria-selected={selected.id === tab.id} aria-controls={`${id}-${tab.id}-panel`}
        tabIndex={selected.id === tab.id ? 0 : -1} onClick={() => select(tab.id)}
        onKeyDown={(event) => {
          const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (!offset && event.key !== "Home" && event.key !== "End") return;
          event.preventDefault();
          const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + offset + tabs.length) % tabs.length];
          select(next.id);
          document.getElementById(`${id}-${next.id}`)?.focus();
        }}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div key={tab.id} id={`${id}-${tab.id}-panel`} role="tabpanel"
      aria-labelledby={`${id}-${tab.id}`} hidden={selected.id !== tab.id} tabIndex={0}>{tab.content}</div>)}
  </div>;
}

export function hasUnsavedChanges(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLFormElement>('form[data-dirty="true"]'))
    .some((form) => form.closest("dialog")?.open !== false);
}

export function UnsavedChangesGuard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const legacyHistoryGuard = useRef(false);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (root && hasUnsavedChanges(root)) event.preventDefault();
    }
    function click(event: MouseEvent) {
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || event.ctrlKey || event.metaKey || link.href === window.location.href) return;
      if (root && hasUnsavedChanges(root) && !window.confirm("有尚未保存的修改，确定离开吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    let restoringHistory = false;
    const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
    function navigate(event: Event) {
      const transition = event as Event & { navigationType?: string };
      if (transition.navigationType === "traverse" && event.cancelable && root && hasUnsavedChanges(root)
        && !window.confirm("有尚未保存的修改，确定离开吗？")) event.preventDefault();
    }
    function popstate(event: PopStateEvent) {
      if (restoringHistory) {
        restoringHistory = false;
        event.stopImmediatePropagation();
        return;
      }
      if (!legacyHistoryGuard.current) return;
      // On older Safari, the first traversal stays on the same route, so React
      // cannot unmount the form before we have asked whether to discard it.
      event.stopImmediatePropagation();
      if (root && hasUnsavedChanges(root) && !window.confirm("有尚未保存的修改，确定离开吗？")) {
        restoringHistory = true;
        window.history.forward();
        return;
      }
      legacyHistoryGuard.current = false;
      root?.querySelectorAll<HTMLFormElement>("form[data-dirty]").forEach((form) => { form.dataset.dirty = "false"; });
      window.history.back();
    }
    window.addEventListener("beforeunload", beforeUnload);
    if (navigation) navigation.addEventListener("navigate", navigate);
    else window.addEventListener("popstate", popstate, true);
    root.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      if (navigation) navigation.removeEventListener("navigate", navigate);
      else window.removeEventListener("popstate", popstate, true);
      root.removeEventListener("click", click, true);
    };
  }, []);
  return <div ref={ref} onChange={(event) => {
    const input = event.target as HTMLInputElement;
    if (input.form) {
      input.form.dataset.dirty = "true";
      const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
      if (!navigation && !legacyHistoryGuard.current) {
        window.history.pushState(window.history.state, "", window.location.href);
        legacyHistoryGuard.current = true;
      }
    }
  }}>{children}</div>;
}

export function WorkspaceDialog({ children, title, trigger }: { children: ReactNode; title: string; trigger: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  function close() {
    if (ref.current && hasUnsavedChanges(ref.current) && !window.confirm("有尚未保存的内容，确定关闭吗？")) return;
    ref.current?.close();
    triggerRef.current?.focus();
  }
  return <>
    <button ref={triggerRef} type="button" className="primary-button" onClick={() => ref.current?.showModal()}>{trigger}</button>
    <dialog ref={ref} className="workspace-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="dialog-toolbar"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="关闭" onClick={close}>×</button></div>
      <UnsavedChangesGuard>{children}</UnsavedChangesGuard>
    </dialog>
  </>;
}

export function DetailDrawer({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const originalOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = originalOverflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  function close() {
    if (ref.current && hasUnsavedChanges(ref.current) && !window.confirm("有尚未保存的修改，确定关闭吗？")) return;
    ref.current?.querySelectorAll<HTMLFormElement>("form[data-dirty]").forEach((form) => { form.dataset.dirty = "false"; });
    router.back();
  }
  return <dialog ref={ref} className="detail-drawer" aria-label="岗位详情" onCancel={(event) => { event.preventDefault(); close(); }}>
    <div className="drawer-toolbar"><span>岗位详情</span><button className="icon-button" type="button" aria-label="关闭岗位详情" onClick={close}>×</button></div>
    {children}
  </dialog>;
}

export function TableColumns({ children, optionalColumns }: { children: ReactNode; optionalColumns: { id: string; label: string }[] }) {
  const [visible, setVisible] = useState<string[]>([]);
  const classes = optionalColumns.filter((column) => !visible.includes(column.id)).map((column) => `hide-column-${column.id}`).join(" ");
  return <div className={`table-view ${classes}`}>
    <details className="column-picker"><summary>显示列</summary><div>
      {optionalColumns.map((column) => <label key={column.id}><input type="checkbox" checked={visible.includes(column.id)}
        onChange={(event) => setVisible((current) => event.target.checked ? [...current, column.id] : current.filter((id) => id !== column.id))} />{column.label}</label>)}
    </div></details>
    {children}
  </div>;
}
