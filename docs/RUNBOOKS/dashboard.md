# Desktop Dashboard MVP

User-authorized scope: 2026-11-16 Dashboard development prompt. Existing product security and the canonical nine opportunity stages remain in effect.

## Pages and data

- `/dashboard`: six KPIs, historical pipeline, mail summary, weekly sector trends, current status donut, recent recruitment timeline and priority actions.
- `/dashboard/internships`: full application analytics and recruitment timeline; charts link to existing `/internships` filters/details.
- `/dashboard/mail`: 24h mail KPIs, 14-day received-mail trends, radial action distribution, four mail categories and persistent action cards.

Desktop viewport >=1440px. Narrower windows get an explicit desktop-workspace notice. Charts are interactive SVG/CSS using existing design tokens, keyboard focus and reduced-motion support; no additional chart runtime. Existing dependencies contain neither Recharts nor shadcn/ui.

Reads use the authenticated user's Supabase client and RLS, minimal column projections and exhaustive 500-row pages (no silent 1000-row truncation). Query failure displays an error instead of false zero KPIs. Mock mode is empty. `seed_v1` opportunities and `seed-*` provider messages are excluded from formal statistics; linked mail actions are scoped through those real messages.

Reporting timezone is Asia/Hong_Kong; weeks start Monday. Application Trends has exactly Buy-side, Sell-side, PE / VC series, based on explicit sector keywords. Ambiguous or non-target roles and missing application dates are disclosed separately rather than assigned arbitrarily. Total Applications requires a recorded applied date, current pipeline stage or historical stage evidence; prospects are excluded. Current status includes terminal applications; Active excludes ended/archived applications. Pipeline counts unique applications known to have entered each stage, without inventing intermediate stages for jumps or missing legacy history. Waiting is not automatically classified as Interview.

Important Emails and Action Required KPIs cover rolling 24h; Pending covers all unfinished mail tasks; deadlines cover the next seven days. Mail trends count messages received that day, not historical task-state snapshots. Importance uses the existing effective mailbox priority and manual overrides. When AI analysis is unavailable, the existing inbox rule-based priority remains effective; no synthetic priority is generated. Four mutually exclusive views use action evidence first, recruitment updates second, existing important/attention priority third, and Low Priority otherwise.

## Action workflow

An existing pending `email_action` card (or recruitment `email_update` with explicit action evidence) offers **确认提取** / **忽略**. Confirm uses `resolve_my_inbox_item` and the existing evidence/action link. A confirmed action can be Pending / In Progress / Completed / Dismissed, mapped to unscheduled / waiting (or existing scheduled) / completed / cancelled. Saves use the existing audited `apply_workspace_mutation` with version and base-value checks. Refresh preserves progress; mail read flags are never changed. Evidence opens the existing inbox detail, and Gmail opens the original message.

The migration fixes the existing undo RPC privilege mismatch: Gmail tables remain SELECT-only to authenticated users; the owner-checking, privacy-checked undo transaction uses SECURITY DEFINER. Confirmation retains its existing invoker wrapper/private definer structure, with support for actionable recruitment invitations. No table write permissions are broadened. A stale card or failed mutation reports failure rather than success.

## Recruitment ingestion

Apply `supabase/migrations/20261116090000_dashboard_recruitment_stages.sql` before running this code's Gmail sync worker. No migration has been applied to a shared Test or Production project as part of this PR.

Newly synced Gmail can recognize explicit read notifications, OA / assessment invitations, interview invitations and employment/internship offers. Read Confirmed is `main_stage=submitted, substage=Read Confirmed`, not a separate signal subsystem. OA maps to test. Existing stages and CRUD remain unchanged.

Automatic matching requires exactly one active, non-ended application with both full company and role in the notification; trusted Gmail `Authentication-Results` with aligned DMARC; and explicit stage wording. Read notifications additionally require an exact provider sender domain (default `mailtrack.io,mailsuite.com`, configurable server-side via `GMAIL_READ_RECEIPT_DOMAINS`). Direct recruitment mail also needs a matching employer domain from the saved opportunity source URL. Shared ATS/job-board/personal-mail domains do not qualify. Missing, ambiguous, unauthenticated or unsupported-provider evidence stays pending for review in the existing inbox; update the application explicitly in its existing detail form when needed.

The transactional service-only RPC checks permission dependencies, connection, privacy lock, owner, evidence, stage locks and idempotence. Repeated same-stage notices do not create duplicate history/actions. Late evidence may add stage history without moving the current application backwards. Terminal applications and manually locked stage fields are not automatically overwritten. Audit, evidence and undo reuse existing Gmail tables; newer changes block stale undo. Offer stage detection never accepts an offer or sends a message.

Tracking receipts describe the tracking service's report, not proof a human HR reader read the message: image prefetch can trigger opens ([provider explanation](https://testing.mailtrack.io/hc/en-us/articles/360005926978-Mailtrack-open-alerts-received-immediately-after-sending-an-email)). No receipt means no new evidence, not "unread". The existing historical backfill restriction remains: no retroactive automatic recruitment updates, calendar writes or newly expanded mailbox scans.

## Verification

Run `node scripts/pnpm.mjs run ci`. Analytics, paging, recognition and action-write tests live alongside the code. `tests/db/dashboard-recruitment.sql` uses only synthetic records in a rollback transaction; run against a disposable database after all migrations. It covers stage dedupe, jumps, owner/role boundaries, manual locks, denied permissions, privacy and undo. It is also wired into the optional `MFIN_TEST_PG=1` database suite.

Production deployment, provider-specific template expansion and retroactive reconstruction of absent stage history are outside this MVP. Real-account OAuth, receipt delivery and end-to-end production saves require a deployment containing the migration and existing account permissions; passing synthetic tests does not imply those external flows were run.
