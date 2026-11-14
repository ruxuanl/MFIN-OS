export function PageHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {/[\u3400-\u9fff]/.test(eyebrow) ? <p className="page-eyebrow page-eyebrow-mobile">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {/[\u3400-\u9fff]/.test(eyebrow) ? <p className="page-context page-context-desktop">{eyebrow}</p> : null}
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {action ? <div className="page-action">{action}</div> : null}
    </header>
  );
}
