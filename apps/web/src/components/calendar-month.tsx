"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { PRODUCT_CALENDAR_TIME_ZONE } from "@/lib/calendar/constants";
import { calendarPriority, calendarPriorityLabels, eventsOnDay, monthDays, shiftMonth, type CalendarDisplayEvent } from "@/lib/calendar/view-model";

const time = new Intl.DateTimeFormat("zh-CN", { timeZone: PRODUCT_CALENDAR_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const date = new Intl.DateTimeFormat("zh-CN", { timeZone: PRODUCT_CALENDAR_TIME_ZONE, month: "long", day: "numeric", weekday: "long" });

export function CalendarMonth({ month, today, events, connected }: {
  month: string; today: string; events: CalendarDisplayEvent[]; connected: boolean;
}) {
  const [selected, setSelected] = useState(today.startsWith(month) ? today : `${month}-01`);
  const dialog = useRef<HTMLDialogElement>(null);
  const days = monthDays(month);
  const selectedEvents = eventsOnDay(events, selected);
  return (
    <div className="calendar-view">
      <div className="calendar-month-panel">
        <div className="calendar-month-toolbar">
          <h3>{Number(month.slice(0, 4))} 年 {Number(month.slice(5))} 月</h3>
          <nav aria-label="切换月份">
            <Link className="quiet-button" aria-label="上个月" href={`/calendar?month=${shiftMonth(month, -1)}`} scroll={false}><Chevron previous /></Link>
            <Link className="quiet-button" href="/calendar" onClick={() => setSelected(today)} scroll={false}>今天</Link>
            <Link className="quiet-button" aria-label="下个月" href={`/calendar?month=${shiftMonth(month, 1)}`} scroll={false}><Chevron /></Link>
          </nav>
        </div>
        <div className="calendar-priority-legend" aria-label="日程优先级图例">
          <span>优先级</span>{(["low", "normal", "high", "critical"] as const).map(priority => <span key={priority} className="calendar-priority-key" data-priority={priority}>{calendarPriorityLabels[priority]}</span>)}
          <span>点击日期放大查看</span>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">{["一", "二", "三", "四", "五", "六", "日"].map(day => <span key={day}>{day}</span>)}</div>
        <div className="calendar-month-grid" role="group" aria-label={`${month} 月历`}>
          {days.map(day => {
            const items = eventsOnDay(events, day);
            return (
              <button type="button" key={day} className={`calendar-day${!day.startsWith(month) ? " is-outside" : ""}${day === today ? " is-today" : ""}${day === selected ? " is-selected" : ""}`}
                aria-label={`${day}${day === today ? " 今天" : ""}，${items.length} 项日程`} aria-pressed={selected === day} aria-haspopup="dialog"
                onClick={() => { setSelected(day); dialog.current?.showModal(); }}>
                <span className="calendar-day-number">{Number(day.slice(8))}</span>
                <span className="calendar-day-events">{items.slice(0, 2).map(item => <span key={item.id} className="calendar-event-chip" data-priority={calendarPriority(item.priority)} title={`${item.title} · 优先级：${calendarPriorityLabels[calendarPriority(item.priority)]}`}>{!item.allDay ? `${time.format(new Date(item.start))} ` : "全天 "}{item.title}</span>)}
                  {items.length > 2 ? <small>另 {items.length - 2} 项</small> : null}
                </span>
                {items.length ? <span className="calendar-day-count">{items.length} 项</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <aside className="calendar-agenda" aria-label="当日日程">
        <h3>{date.format(new Date(`${selected}T12:00:00+08:00`))}</h3>
        <p className="calendar-muted">{selected === today ? "今天" : "当日安排"} · {selectedEvents.length} 项日程</p>
        <div aria-live="polite">
          <DayEvents events={selectedEvents} connected={connected} />
        </div>
      </aside>
      <dialog ref={dialog} className="calendar-day-dialog" aria-labelledby="calendar-day-dialog-title" aria-describedby="calendar-day-dialog-description"
        onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close(); } }}>
        <div className="calendar-day-dialog-header"><div><h2 id="calendar-day-dialog-title">{date.format(new Date(`${selected}T12:00:00+08:00`))}</h2><p id="calendar-day-dialog-description">{selectedEvents.length} 项日程 · 香港时间 · 绿色越深，优先级越高</p></div><button type="button" className="quiet-button" onClick={() => dialog.current?.close()}>关闭</button></div>
        <div className="calendar-day-dialog-content"><DayEvents events={selectedEvents} connected={connected} /></div>
      </dialog>
    </div>
  );
}

function DayEvents({ events, connected }: { events: CalendarDisplayEvent[]; connected: boolean }) {
  return events.length ? events.map(event => (
    <article className="calendar-agenda-event" data-priority={calendarPriority(event.priority)} key={event.id}>
      <div className="calendar-event-meta"><time>{event.allDay ? "全天" : `${time.format(new Date(event.start))}${event.end ? ` – ${time.format(new Date(event.end))}` : ""}`}</time><span className="calendar-event-priority">优先级：{calendarPriorityLabels[calendarPriority(event.priority)]}</span></div>
      <strong>{event.title}</strong>
      <span>{event.source}{event.location ? ` · ${event.location}` : ""}</span>
      {event.url && /^https:\/\/[^/]*google\.com\//.test(event.url) ? <a className="quiet-link" href={event.url} target="_blank" rel="noreferrer">在 Google Calendar 查看</a> : null}
    </article>
  )) : <p className="calendar-day-empty">{connected ? "这一天没有日程。选择其他日期查看安排。" : "连接 Google Calendar 后，在这里查看你的安排。"}</p>;
}

function Chevron({ previous = false }: { previous?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={previous ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} /></svg>;
}
