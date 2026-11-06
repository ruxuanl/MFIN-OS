import { Icon } from "@/components/icon";
import type { IconName } from "@/lib/navigation";

export function EmptyWorkspace({
  icon,
  title,
  description,
  note
}: {
  icon: IconName;
  title: string;
  description: string;
  note: string;
}) {
  return (
    <section className="empty-workspace">
      <div className="empty-icon"><Icon name={icon} size={22} /></div>
      <p className="empty-kicker">M1 · Structure ready</p>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="boundary-note"><span />{note}</div>
    </section>
  );
}
