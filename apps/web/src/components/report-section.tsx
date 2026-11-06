import Link from "next/link";

import type { ReportItem } from "@/lib/reports/data";
import { sectionLabels } from "@/lib/reports/model";

export function ReportSection({ section, items, compact = false }: { section: string; items: ReportItem[]; compact?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section className={`report-section${compact ? " is-compact" : ""}`}>
      <div className="report-section-heading"><h3>{sectionLabels[section] ?? section}</h3><span>{items.length}</span></div>
      <ol className="report-item-list">
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.position}</span>
            <div><strong>{item.title}</strong>{item.reason ? <p>{item.reason}</p> : null}</div>
            {item.target_path ? <Link href={item.target_path}>查看</Link> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

