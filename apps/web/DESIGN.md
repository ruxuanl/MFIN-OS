# MFin OS workspace design

## Internship discovery source information

PC result cards lead with a concrete company and role, followed by sector, internship type and source. A shared tinted overview band separates source date, location and application method with subtle dividers; the date uses a cool neutral tint and actions use the existing green. Source publication and update dates retain their basis; relative dates show a bounded estimate. Undated sources live in a separate disclosure, outside the recent-date result count. The source selector uses native radio semantics for all-web, recruitment sites and public articles. Original evidence and editable confirmation fields remain in a disclosure; candidate addition is the primary footer action. Existing light/dark tokens and phone layouts remain authoritative.

Scope: PC only, as directed by the user on 2026-11-15. All new design CSS is enclosed in `min-width: 681px`; phone-specific changes have been removed. The original phone homepage and header are retained. No further phone verification is part of this task.

Mode: Operate. The user opens this workspace between classes, during application preparation and at night; a pale, low-glare daytime surface follows the system into a dark green nighttime surface.

The product's confirmed visual commitments are warm white, dark ink, cool grey and restrained deep green. Use the platform text stack already in the application, with a 38px desktop / 30px mobile page title, 21–23px focus title, 14–16px task text and 12–13px metadata. No additional font download.

## Layout

- Desktop: 224px tinted rail, sticky 72px search/utility bar, flexible content capped at 1480px. Primary domains precede secondary tools. The rail scrolls on short displays.
- Today: a deep green focus surface is the signature element. A quiet adjacent action list links directly to tracked internships, important job mail and review. Report data remains authoritative; empty state never invents counts or tasks.
- At 1100px the desktop focus and shortcuts stack. The existing phone navigation is preserved.
- Tables keep a stable desktop grid and existing mobile record-list treatment. Workspace tabs use a compact segmented surface. Do not use nested cards as the default hierarchy.

## Tokens and interaction

`src/app/workspace-design.css` owns the shared override layer after legacy styles. Spacing follows a 4px base: 8/12px within controls, 16px groups, 24/32px section separation and 40/56px desktop insets. Use 8/9px control corners and 14/16px content corners. Borders separate data; avoid ornamental shadows.

Selection, caret, focus and scrollbars share semantic palette tokens. Body text needs 4.5:1 contrast; touch controls target at least 44px. Keep visible keyboard focus, a skip link and native form submission. Ctrl/Cmd K focuses the existing search field without changing routes. Motion is a single 280ms focus reveal and is omitted with reduced motion.

## Flow contract

Homepage → tracked internships and important job mail each take one activation. Search can submit directly from every protected page. Explicit tracked pagination, saved-view and return URLs retain `tab=tracked`; query-based links select the tracked view. Back/forward to a URL without a tab restores its default.

Permissions and confirmation boundaries are unchanged. Reducing navigation never removes a consequential action's confirmation.

## Interview workspace (PC)

At iframe widths above 700px, the interview entry opens the existing preparation form immediately, removing two intermediary navigation steps. Persistent tabs expose practice, knowledge and records. An active session gets a direct resume link. A sticky summary keeps explicit start confirmation visible, and sticky answer controls keep submission near the working area. The host frame uses available desktop height; the embedded child hides its duplicate brand. DeepSeek remains disabled and rule feedback is labelled. `experiments/interview-copilot/style.css` contains the PC-only rules; its existing phone rules and phone entry flow are retained.
